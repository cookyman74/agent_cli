/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview LLM message utilities for multi-provider compatibility.
 *
 * Provides `fixToolResultRoles()` — a shared utility used by Category A, B, C
 * to convert Gemini-style tool result messages (role: 'user' with functionResponse parts)
 * into provider-standard format (role: 'tool' with individual tool_result content).
 *
 * Key behaviors:
 * - Converts role 'user' → 'tool' when content is ALL tool_result with valid toolCallIds
 * - Splits multi-tool_result messages into individual messages (OpenAI compatibility) [3차 #1]
 * - Guards against empty toolCallId (keeps 'user' role unchanged) [2차 #4]
 */
import type { LlmContent, LlmMessage } from '../providers/types.js';

/**
 * Checks if a content item is a tool_result with a non-empty toolCallId.
 */
function isValidToolResult(
  content: LlmContent,
): content is LlmContent & { type: 'tool_result'; toolCallId: string } {
  return (
    content.type === 'tool_result' &&
    'toolCallId' in content &&
    typeof content.toolCallId === 'string' &&
    content.toolCallId.length > 0
  );
}

/**
 * Fixes tool result message roles for multi-provider compatibility.
 *
 * Gemini uses `{ role: 'user', parts: [functionResponse, ...] }` for tool results.
 * After conversion to LlmMessage, these become `{ role: 'user', content: [tool_result, ...] }`.
 * Non-Gemini providers expect `{ role: 'tool', content: [tool_result] }`.
 *
 * This function:
 * 1. Identifies user messages where ALL content is tool_result with valid toolCallIds
 * 2. Splits multi-tool_result messages into individual messages [3차 #1]
 *    (OpenAI `convertToolMessage()` uses `find()` — only processes first tool_result)
 * 3. Changes role from 'user' to 'tool' for each resulting message
 * 4. Leaves all other messages unchanged
 *
 * @param messages - Input LlmMessage array (may contain unconverted tool results)
 * @returns New array with corrected roles and split tool_result messages
 */
export function fixToolResultRoles(messages: LlmMessage[]): LlmMessage[] {
  const result: LlmMessage[] = [];

  for (const msg of messages) {
    // Only process 'user' role messages
    if (msg.role !== 'user') {
      result.push(msg);
      continue;
    }

    // Guard: empty content → keep as-is
    if (msg.content.length === 0) {
      result.push(msg);
      continue;
    }

    // Check if ALL content items are valid tool_results (non-empty toolCallId)
    const allValidToolResults = msg.content.every(isValidToolResult);

    if (!allValidToolResults) {
      // Mixed content or invalid toolCallIds → keep as 'user'
      result.push(msg);
      continue;
    }

    // All valid tool_results → split into individual messages with role 'tool'
    if (msg.content.length === 1) {
      // Single tool_result → just change role, no split needed
      result.push({ role: 'tool', content: msg.content });
    } else {
      // Multi-tool_result → split into individual messages [3차 #1]
      for (const content of msg.content) {
        result.push({ role: 'tool', content: [content] });
      }
    }
  }

  return result;
}
