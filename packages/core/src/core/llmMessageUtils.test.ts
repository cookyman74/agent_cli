/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Tests for fixToolResultRoles utility.
 *
 * Validates:
 * - tool_result-only user messages → role: 'tool' conversion
 * - Empty toolCallId guard (keeps 'user' role)
 * - Multi-tool_result splitting for OpenAI converter compatibility [3차 #1]
 * - Non-tool_result messages preserved unchanged
 */
import { describe, it, expect } from 'vitest';

import type { LlmMessage } from '../providers/types.js';

import { fixToolResultRoles } from './llmMessageUtils.js';

describe('fixToolResultRoles', () => {
  // ─── Role Conversion ─────────────────────────────────────────────

  describe('role conversion', () => {
    it('changes role to tool for user message with only valid tool_result content', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              name: 'fn',
              content: 'result',
            },
          ],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('tool');
    });

    it('keeps user role for text-only messages', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });

    it('keeps user role for mixed content (text + tool_result)', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hello' },
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              name: 'fn',
              content: 'r',
            },
          ],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });

    it('keeps user role for empty content', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });

    it('does not change assistant role', () => {
      const messages: LlmMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'ok' }],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('assistant');
    });

    it('does not change system role', () => {
      const messages: LlmMessage[] = [
        {
          role: 'system',
          content: [{ type: 'text', text: 'system prompt' }],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('system');
    });
  });

  // ─── Empty toolCallId Guard [2차 #4] ─────────────────────────────

  describe('empty toolCallId guard', () => {
    it('keeps user role when tool_result has empty toolCallId', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: '',
              name: 'fn',
              content: 'result',
            },
          ],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });

    it('keeps user role when some tool_results have empty toolCallId', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              name: 'fn1',
              content: 'r1',
            },
            {
              type: 'tool_result',
              toolCallId: '',
              name: 'fn2',
              content: 'r2',
            },
          ],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });
  });

  // ─── Multi-tool_result Splitting [3차 #1] ─────────────────────────

  describe('multi-tool_result splitting', () => {
    it('splits multi-tool_result message into individual tool messages', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              name: 'fn1',
              content: 'r1',
            },
            {
              type: 'tool_result',
              toolCallId: 'call-2',
              name: 'fn2',
              content: 'r2',
            },
            {
              type: 'tool_result',
              toolCallId: 'call-3',
              name: 'fn3',
              content: 'r3',
            },
          ],
        },
      ];
      const result = fixToolResultRoles(messages);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        role: 'tool',
        content: [messages[0].content[0]],
      });
      expect(result[1]).toEqual({
        role: 'tool',
        content: [messages[0].content[1]],
      });
      expect(result[2]).toEqual({
        role: 'tool',
        content: [messages[0].content[2]],
      });
    });

    it('does not split single tool_result message', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              name: 'fn',
              content: 'r',
            },
          ],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('tool');
    });

    it('does not split when any toolCallId is empty (keeps as user)', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              name: 'fn1',
              content: 'r1',
            },
            {
              type: 'tool_result',
              toolCallId: '',
              name: 'fn2',
              content: 'r2',
            },
          ],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('user');
    });

    it('preserves non-tool_result messages unchanged in sequence', () => {
      const messages: LlmMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'c1',
              name: 'fn1',
              content: 'r1',
            },
            {
              type: 'tool_result',
              toolCallId: 'c2',
              name: 'fn2',
              content: 'r2',
            },
          ],
        },
        { role: 'assistant', content: [{ type: 'text', text: 'ok' }] },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(4); // 1 (text) + 2 (split) + 1 (assistant)
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('tool');
      expect(result[2].role).toBe('tool');
      expect(result[3].role).toBe('assistant');
    });
  });

  // ─── Edge Cases ──────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns empty array for empty input', () => {
      const result = fixToolResultRoles([]);
      expect(result).toHaveLength(0);
    });

    it('handles multiple messages with various roles', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'question' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_call',
              id: 'call-1',
              name: 'fn',
              arguments: {},
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              name: 'fn',
              content: 'result',
            },
          ],
        },
      ];
      const result = fixToolResultRoles(messages);
      expect(result).toHaveLength(3);
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('assistant');
      expect(result[2].role).toBe('tool');
    });
  });
});
