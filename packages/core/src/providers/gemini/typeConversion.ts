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
import type { LlmContent, LlmMessage, LlmRole } from '../types.js';
import {
  isToolCallContent,
  isToolResultContent,
} from '../../utils/llmUtils.js';

/**
 * Convert a single Gemini Part to LlmContent.
 * Handles text, functionCall, functionResponse, inlineData, fileData, and thought.
 */
function convertPartToLlmContent(part: Part): LlmContent | null {
  // Handle thought parts (must check before text since thought parts may also have text)
  // thought field is boolean in Gemini SDK — only treat as thought when truthy (true),
  // not when explicitly set to false.
  const thoughtPart = part as Part & { thought?: boolean };
  if ('thought' in part && thoughtPart.thought) {
    return { type: 'thought', thought: part.text ?? '' };
  }

  if ('text' in part && part.text !== undefined) {
    return { type: 'text', text: part.text };
  }

  if ('functionCall' in part && part.functionCall) {
    return {
      type: 'tool_call',
      id: part.functionCall.id ?? crypto.randomUUID(),
      name: part.functionCall.name!,
      arguments: part.functionCall.args ?? {},
    };
  }

  if ('functionResponse' in part && part.functionResponse) {
    return {
      type: 'tool_result',
      toolCallId: part.functionResponse.id ?? '',
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

  if ('fileData' in part && part.fileData) {
    return {
      type: 'image',
      source: {
        type: 'url',
        mediaType: part.fileData.mimeType!,
        url: part.fileData.fileUri!,
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

// ============================================================================
// Content-safe message inspectors (replacing messageInspectors.ts)
// ============================================================================

/**
 * Check if a Gemini Content represents a tool-call (function call) message.
 *
 * Semantically equivalent to the deprecated `isFunctionCall(content)` from
 * messageInspectors.ts, but routes through provider-independent LlmContent
 * type guards.
 *
 * Safety guarantees vs raw `isToolCallMessage(convertContentToLlmMessage(…))`:
 * - Direct role check — avoids mapRole default-to-user fallback for
 *   undefined roles.
 * - Parts-count guard — detects parts dropped during conversion
 *   (e.g. executableCode) so mixed-part messages return false, matching
 *   original Content.parts.every() semantics.
 */
export function isContentToolCallMessage(content: Content): boolean {
  if (content.role !== 'model') return false;
  const parts = content.parts;
  if (!parts || parts.length === 0) return false;
  const llmMessage = convertContentToLlmMessage(content);
  if (llmMessage.content.length !== parts.length) return false;
  return llmMessage.content.every((c) => isToolCallContent(c));
}

/**
 * Check if a Gemini Content represents a tool-result (function response) message.
 *
 * Semantically equivalent to the deprecated `isFunctionResponse(content)` from
 * messageInspectors.ts. See {@link isContentToolCallMessage} for safety details.
 */
export function isContentToolResultMessage(content: Content): boolean {
  if (content.role !== 'user') return false;
  const parts = content.parts;
  if (!parts || parts.length === 0) return false;
  const llmMessage = convertContentToLlmMessage(content);
  if (llmMessage.content.length !== parts.length) return false;
  return llmMessage.content.every((c) => isToolResultContent(c));
}
