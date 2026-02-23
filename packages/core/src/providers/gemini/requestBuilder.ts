/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Request builder for non-Gemini providers.
 *
 * Converts Gemini runtime state (Content[] history, GenerateContentConfig,
 * Tool[]) into a provider-independent LlmGenerateRequest.
 *
 * Used by client.ts processLlmTurn() to bridge the Gemini chat infrastructure
 * with non-Gemini adapter llm* methods.
 *
 * @see packages/core/src/core/client.ts — processLlmTurn()
 */

import type {
  Content,
  GenerateContentConfig,
  PartListUnion,
  Tool,
} from '@google/genai';
import { randomUUID } from 'node:crypto';

import type {
  LlmGenerateRequest,
  LlmToolDefinition,
  LlmToolParameters,
  LlmToolProperty,
  LlmToolPropertyType,
} from '../types.js';
import { fixToolResultRoles } from '../../core/llmMessageUtils.js';
import {
  convertContentsToLlmMessages,
  convertPartListUnionToLlmContents,
} from './typeConversion.js';

// ============================================================================
// Tool conversion: Gemini Tool[] → LlmToolDefinition[]
// ============================================================================

/** Map of Gemini Schema type strings to LlmToolPropertyType. */
const GEMINI_TYPE_MAP: Record<string, LlmToolPropertyType> = {
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'number',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
  OBJECT: 'object',
};

/**
 * Convert a Gemini schema property to an LlmToolProperty.
 * Recursively handles nested objects and array items.
 */
function convertSchemaProperty(
  schema: Record<string, unknown>,
): LlmToolProperty {
  const typeStr = (schema['type'] as string | undefined) ?? 'STRING';
  const prop: LlmToolProperty = {
    type: GEMINI_TYPE_MAP[typeStr] ?? 'string',
  };

  if (schema['description']) {
    prop.description = schema['description'] as string;
  }

  if (schema['enum']) {
    prop.enum = schema['enum'] as string[];
  }

  // Nested object properties
  if (schema['properties']) {
    const nestedProps = schema['properties'] as Record<
      string,
      Record<string, unknown>
    >;
    prop.properties = {};
    for (const [key, val] of Object.entries(nestedProps)) {
      prop.properties[key] = convertSchemaProperty(val);
    }
  }

  // Array items
  if (schema['items']) {
    prop.items = convertSchemaProperty(
      schema['items'] as Record<string, unknown>,
    );
  }

  return prop;
}

/**
 * Convert Gemini Tool[] to LlmToolDefinition[].
 *
 * Gemini tools wrap function declarations inside Tool.functionDeclarations[].
 * This function flattens them into individual LlmToolDefinition entries.
 *
 * This is the reverse of GeminiConverter.toGeminiTools().
 */
export function convertGeminiToolsToLlm(tools: Tool[]): LlmToolDefinition[] {
  const result: LlmToolDefinition[] = [];

  for (const tool of tools) {
    const declarations = tool.functionDeclarations;
    if (!declarations) continue;

    for (const decl of declarations) {
      const params = decl.parameters as Record<string, unknown> | undefined;
      const properties: Record<string, LlmToolProperty> = {};

      if (params?.['properties']) {
        const rawProps = params['properties'] as Record<
          string,
          Record<string, unknown>
        >;
        for (const [key, val] of Object.entries(rawProps)) {
          properties[key] = convertSchemaProperty(val);
        }
      }

      const parameters: LlmToolParameters = {
        type: 'object',
        properties,
      };

      if (params?.['required']) {
        parameters.required = params['required'] as string[];
      }

      result.push({
        name: decl.name!,
        description: decl.description ?? '',
        parameters,
      });
    }
  }

  return result;
}

// ============================================================================
// History ID reconciliation for provider switching
// ============================================================================

/**
 * Reconcile functionCall/functionResponse IDs in Gemini history.
 *
 * When the Gemini native path handles tool calls, Turn.handlePendingFunctionCall
 * generates a callId via crypto.randomUUID() and stores it in the
 * functionResponse.id. However, the Gemini SDK does NOT write this back to
 * the functionCall.id in history (it remains undefined).
 *
 * On provider switch (Gemini → OpenAI), convertPartToLlmContent generates a
 * NEW random UUID for the undefined functionCall.id, causing a mismatch with
 * the functionResponse.id. OpenAI API then rejects the request with:
 *   "tool_call_id not found in tool_calls of previous message"
 *
 * This function pre-processes the history by matching functionCall/functionResponse
 * pairs. Matching strategy:
 *   1. Positional match (call[n] ↔ response[n]) with name validation
 *   2. Name-based fallback when positional names don't match
 *
 * @returns A new Content[] with reconciled IDs (does NOT mutate the original).
 *          Returns the same reference if no reconciliation is needed.
 */
export function reconcileFunctionCallIds(history: Content[]): Content[] {
  // Quick check: skip clone if no reconciliation needed
  let needsReconciliation = false;
  for (const content of history) {
    if (content.role !== 'model' || !content.parts) continue;
    if (content.parts.some((p) => p.functionCall && !p.functionCall.id)) {
      needsReconciliation = true;
      break;
    }
  }
  if (!needsReconciliation) return history;

  const cloned: Content[] = structuredClone(history);

  for (let i = 0; i < cloned.length; i++) {
    const content = cloned[i];
    if (content.role !== 'model' || !content.parts) continue;

    // Get ALL functionCall parts (preserving original position indices)
    const allCalls = content.parts.filter((p) => p.functionCall);
    if (allCalls.length === 0) continue;
    if (allCalls.every((p) => p.functionCall!.id)) continue;

    // Scan forward for the nearest user Content with functionResponse parts.
    // Stops at the next model Content to avoid crossing turn boundaries.
    let responseContent: Content | undefined;
    for (let k = i + 1; k < cloned.length; k++) {
      if (cloned[k].role === 'model') break;
      if (
        cloned[k].role === 'user' &&
        cloned[k].parts?.some((p) => p.functionResponse)
      ) {
        responseContent = cloned[k];
        break;
      }
    }
    if (!responseContent?.parts) continue;

    const allResponses = responseContent.parts.filter(
      (p) => p.functionResponse,
    );

    // 2-pass matching with "used" tracking to prevent duplicate ID assignment.
    //
    // Pass 1: Mark responses already claimed by calls that have IDs.
    //   This prevents a subsequent ID-less call from stealing an already-
    //   matched response (the root cause of the same-name mixed-ID bug).
    //
    // Pass 2: For each ID-less call, find the best unused response
    //   (positional match → name-based fallback).
    const usedResponseIndices = new Set<number>();

    // Pass 1: claim responses for calls that already have IDs
    for (let j = 0; j < allCalls.length; j++) {
      const fc = allCalls[j].functionCall!;
      if (!fc.id) continue;
      const idx = allResponses.findIndex(
        (p) => p.functionResponse?.id === fc.id,
      );
      if (idx >= 0) {
        usedResponseIndices.add(idx);
      }
    }

    // Pass 2: reconcile calls without IDs
    for (let j = 0; j < allCalls.length; j++) {
      const fc = allCalls[j].functionCall!;
      if (fc.id) continue;

      let fr = undefined as
        | { id?: string; name?: string; response?: object }
        | undefined;
      let frIdx = -1;

      // 1. Try positional match (if not already used)
      if (!usedResponseIndices.has(j) && allResponses[j]?.functionResponse) {
        const candidate = allResponses[j].functionResponse!;
        if (!fc.name || !candidate.name || fc.name === candidate.name) {
          fr = candidate;
          frIdx = j;
        }
      }

      // 2. Name-based fallback: find first UNUSED response with matching name
      if (!fr && fc.name) {
        for (let r = 0; r < allResponses.length; r++) {
          if (usedResponseIndices.has(r)) continue;
          const candidate = allResponses[r].functionResponse;
          if (candidate?.name === fc.name) {
            fr = candidate;
            frIdx = r;
            break;
          }
        }
      }

      if (!fr || frIdx < 0) continue;

      usedResponseIndices.add(frIdx);

      if (fr.id) {
        fc.id = fr.id;
      } else {
        const newId = randomUUID();
        fc.id = newId;
        fr.id = newId;
      }
    }
  }

  return cloned;
}

// ============================================================================
// Request assembly
// ============================================================================

/**
 * Options for building an LlmGenerateRequest from Gemini runtime state.
 */
export interface BuildLlmRequestOptions {
  /** Model identifier */
  model: string;
  /** Chat history (Gemini Content[]) */
  history: Content[];
  /** Current user request (Gemini PartListUnion) */
  currentRequest: PartListUnion;
  /** System instruction */
  systemInstruction?: string;
  /** Generation config (temperature, maxOutputTokens, etc.) */
  config?: GenerateContentConfig;
  /** Available tools (Gemini Tool[]) */
  tools?: Tool[];
}

/**
 * Build an LlmGenerateRequest from Gemini runtime state.
 *
 * Converts Gemini Content[] history and PartListUnion current request
 * into provider-independent LlmMessage[] format, and maps GenerateContentConfig
 * fields to LlmGenerateRequest parameters.
 *
 * Used by client.ts to build requests for non-Gemini providers
 * that are accessed through llm* methods on the content generator.
 */
export function buildLlmRequestFromGeminiState(
  opts: BuildLlmRequestOptions,
): LlmGenerateRequest {
  // Reconcile functionCall/functionResponse IDs before conversion.
  // Required for provider switching: Gemini history may have undefined
  // functionCall.id while functionResponse.id is set.
  const reconciledHistory = reconcileFunctionCallIds(opts.history);

  // Convert history Content[] → LlmMessage[]
  const historyMessages = convertContentsToLlmMessages(reconciledHistory);

  // Convert current request PartListUnion → LlmContent[]
  const currentContents = convertPartListUnionToLlmContents(
    opts.currentRequest,
  );

  // Append current request as a user message
  const rawMessages = [
    ...historyMessages,
    { role: 'user' as const, content: currentContents },
  ];

  // Fix tool_result roles: Gemini stores functionResponse as role:'user',
  // but OpenAI requires role:'tool' with tool_call_id.
  // fixToolResultRoles() converts { role:'user', content:[tool_result] }
  // → { role:'tool', content:[tool_result] } for provider compatibility.
  const messages = fixToolResultRoles(rawMessages);

  // Build the request with required fields
  const request: LlmGenerateRequest = {
    model: opts.model,
    messages,
  };

  // Map optional fields
  if (opts.systemInstruction !== undefined) {
    request.systemInstruction = opts.systemInstruction;
  }

  // Map config fields
  const config = opts.config;
  if (config) {
    if (config.temperature !== undefined) {
      request.temperature = config.temperature;
    }
    if (config.maxOutputTokens !== undefined) {
      request.maxTokens = config.maxOutputTokens;
    }
    if (config.topP !== undefined) {
      request.topP = config.topP;
    }
    if (config.topK !== undefined) {
      request.topK = config.topK;
    }
    if (config.stopSequences !== undefined) {
      request.stopSequences = config.stopSequences;
    }
  }

  // Convert tools
  if (opts.tools && opts.tools.length > 0) {
    request.tools = convertGeminiToolsToLlm(opts.tools);
  }

  return request;
}
