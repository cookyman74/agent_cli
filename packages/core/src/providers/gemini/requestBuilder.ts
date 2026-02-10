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

import type {
  LlmGenerateRequest,
  LlmToolDefinition,
  LlmToolParameters,
  LlmToolProperty,
  LlmToolPropertyType,
} from '../types.js';
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
  // Convert history Content[] → LlmMessage[]
  const historyMessages = convertContentsToLlmMessages(opts.history);

  // Convert current request PartListUnion → LlmContent[]
  const currentContents = convertPartListUnionToLlmContents(
    opts.currentRequest,
  );

  // Append current request as a user message
  const messages = [
    ...historyMessages,
    { role: 'user' as const, content: currentContents },
  ];

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
