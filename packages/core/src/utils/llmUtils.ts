/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider-independent LLM content utilities.
 *
 * Type guards, factories, and helpers for working with LlmContent
 * without depending on any specific provider SDK.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.1.1
 */

import type {
  LlmContent,
  LlmMessage,
  LlmTextContent,
  LlmImageContent,
  LlmToolCallContent,
  LlmToolResultContent,
  LlmThoughtContent,
} from '../providers/types.js';

// ============================================================================
// Type Guards
// ============================================================================

export function isTextContent(c: LlmContent): c is LlmTextContent {
  return c.type === 'text';
}

export function isImageContent(c: LlmContent): c is LlmImageContent {
  return c.type === 'image';
}

export function isToolCallContent(c: LlmContent): c is LlmToolCallContent {
  return c.type === 'tool_call';
}

export function isToolResultContent(c: LlmContent): c is LlmToolResultContent {
  return c.type === 'tool_result';
}

export function isThoughtContent(c: LlmContent): c is LlmThoughtContent {
  return c.type === 'thought';
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract concatenated text from an array of LlmContent blocks.
 * Skips non-text content (images, tool calls, thoughts, etc.).
 */
export function extractText(contents: LlmContent[]): string {
  return contents
    .filter(isTextContent)
    .map((c) => c.text)
    .join('');
}

/**
 * Create an LlmTextContent block.
 */
export function createTextContent(text: string): LlmTextContent {
  return { type: 'text', text };
}

// ============================================================================
// LlmMessage-level Inspectors
// ============================================================================

/**
 * Check if an LlmMessage represents a tool call (function call).
 * Equivalent of Content-based isFunctionCall for provider-independent types.
 */
export function isToolCallMessage(message: LlmMessage): boolean {
  return (
    message.role === 'assistant' &&
    message.content.every((c) => isToolCallContent(c))
  );
}

/**
 * Check if an LlmMessage represents a tool result (function response).
 * Equivalent of Content-based isFunctionResponse for provider-independent types.
 */
export function isToolResultMessage(message: LlmMessage): boolean {
  return (
    message.role === 'user' &&
    message.content.every((c) => isToolResultContent(c))
  );
}
