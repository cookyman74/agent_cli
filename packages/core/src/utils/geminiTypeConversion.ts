/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Gemini SDK type conversion utilities.
 *
 * Converts between Gemini SDK types (Content, Part, PartListUnion)
 * and provider-independent types (LlmMessage, LlmContent).
 *
 * Used by routing call sites (client.ts, local-executor.ts) to bridge
 * Gemini-specific chat history to provider-independent RoutingContext.
 */

import type { Content, Part, PartListUnion } from '@google/genai';
import type { LlmContent, LlmMessage, LlmRole } from '../providers/types.js';

/**
 * Convert a single Gemini Part to LlmContent.
 * Handles text, functionCall, functionResponse, inlineData, and thought.
 */
function convertPartToLlmContent(part: Part): LlmContent | null {
  // Handle thought parts (must check before text since thought parts may also have text)
  const thoughtPart = part as Part & { thought?: string | boolean };
  if ('thought' in part && thoughtPart.thought !== undefined) {
    const thoughtText =
      typeof thoughtPart.thought === 'string'
        ? thoughtPart.thought
        : (part.text ?? '');
    return { type: 'thought', thought: thoughtText };
  }

  if ('text' in part && part.text !== undefined) {
    return { type: 'text', text: part.text };
  }

  if ('functionCall' in part && part.functionCall) {
    return {
      type: 'tool_call',
      id: crypto.randomUUID(),
      name: part.functionCall.name!,
      arguments: part.functionCall.args ?? {},
    };
  }

  if ('functionResponse' in part && part.functionResponse) {
    return {
      type: 'tool_result',
      toolCallId: '',
      name: part.functionResponse.name,
      content:
        (part.functionResponse.response as string | Record<string, unknown>) ??
        '',
    };
  }

  if ('inlineData' in part && part.inlineData) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        mediaType: part.inlineData.mimeType!,
        data: part.inlineData.data!,
      },
    };
  }

  return null;
}

/**
 * Map Gemini Content role to LlmRole.
 */
function mapRole(geminiRole: string | undefined): LlmRole {
  switch (geminiRole) {
    case 'model':
      return 'assistant';
    case 'user':
      return 'user';
    default:
      return 'user';
  }
}

/**
 * Convert a single Gemini Content to an LlmMessage.
 */
export function convertContentToLlmMessage(content: Content): LlmMessage {
  const parts = content.parts ?? [];
  const llmContents: LlmContent[] = [];

  for (const part of parts) {
    const converted = convertPartToLlmContent(part);
    if (converted) {
      llmContents.push(converted);
    }
  }

  return {
    role: mapRole(content.role),
    content: llmContents,
  };
}

/**
 * Convert an array of Gemini Content[] to LlmMessage[].
 */
export function convertContentsToLlmMessages(
  contents: Content[],
): LlmMessage[] {
  return contents.map(convertContentToLlmMessage);
}

/**
 * Convert Gemini PartListUnion to LlmContent[].
 * PartListUnion can be a string, a single Part, or a Part[].
 */
export function convertPartListUnionToLlmContents(
  parts: PartListUnion,
): LlmContent[] {
  if (typeof parts === 'string') {
    return [{ type: 'text', text: parts }];
  }

  const partArray = Array.isArray(parts) ? parts : [parts];
  const result: LlmContent[] = [];

  for (const part of partArray) {
    if (typeof part === 'string') {
      result.push({ type: 'text', text: part });
    } else {
      const converted = convertPartToLlmContent(part);
      if (converted) {
        result.push(converted);
      }
    }
  }

  return result;
}
