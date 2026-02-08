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
