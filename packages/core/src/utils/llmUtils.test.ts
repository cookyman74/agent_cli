/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for llmUtils — provider-independent content utilities.
 *
 * Covers todolist item 2.5.3 (llmUtils.ts 생성).
 */

import { describe, it, expect } from 'vitest';
import type {
  LlmContent,
  LlmTextContent,
  LlmImageContent,
  LlmToolCallContent,
  LlmToolResultContent,
  LlmThoughtContent,
} from '../providers/types.js';
import type { LlmMessage } from '../providers/types.js';
import {
  isTextContent,
  isImageContent,
  isToolCallContent,
  isToolResultContent,
  isThoughtContent,
  extractText,
  createTextContent,
  isToolCallMessage,
  isToolResultMessage,
} from './llmUtils.js';

// =================================================================
// 2.5.3.3 Type Guards
// =================================================================

describe('llmUtils', () => {
  describe('type guards', () => {
    const textContent: LlmTextContent = { type: 'text', text: 'hello' };
    const imageContent: LlmImageContent = {
      type: 'image',
      source: { type: 'base64', mediaType: 'image/png', data: 'abc123' },
    };
    const toolCallContent: LlmToolCallContent = {
      type: 'tool_call',
      id: 'call-1',
      name: 'read_file',
      arguments: { path: '/tmp/test.txt' },
    };
    const toolResultContent: LlmToolResultContent = {
      type: 'tool_result',
      toolCallId: 'call-1',
      content: 'file contents',
    };
    const thoughtContent: LlmThoughtContent = {
      type: 'thought',
      thought: 'I should read the file first',
    };

    it('isTextContent should identify text content', () => {
      expect(isTextContent(textContent)).toBe(true);
      expect(isTextContent(imageContent)).toBe(false);
      expect(isTextContent(toolCallContent)).toBe(false);
    });

    it('isImageContent should identify image content', () => {
      expect(isImageContent(imageContent)).toBe(true);
      expect(isImageContent(textContent)).toBe(false);
    });

    it('isToolCallContent should identify tool call content', () => {
      expect(isToolCallContent(toolCallContent)).toBe(true);
      expect(isToolCallContent(textContent)).toBe(false);
    });

    it('isToolResultContent should identify tool result content', () => {
      expect(isToolResultContent(toolResultContent)).toBe(true);
      expect(isToolResultContent(toolCallContent)).toBe(false);
    });

    it('isThoughtContent should identify thought content', () => {
      expect(isThoughtContent(thoughtContent)).toBe(true);
      expect(isThoughtContent(textContent)).toBe(false);
    });
  });

  // =================================================================
  // 2.5.3.2 Message Helpers
  // =================================================================

  describe('extractText', () => {
    it('should extract text from text contents', () => {
      const contents: LlmContent[] = [
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world' },
      ];

      expect(extractText(contents)).toBe('Hello world');
    });

    it('should skip non-text contents', () => {
      const contents: LlmContent[] = [
        { type: 'text', text: 'Hello' },
        {
          type: 'image',
          source: { type: 'base64', mediaType: 'image/png', data: 'abc' },
        },
        { type: 'text', text: ' world' },
      ];

      expect(extractText(contents)).toBe('Hello world');
    });

    it('should skip thought contents', () => {
      const contents: LlmContent[] = [
        { type: 'thought', thought: 'thinking...' },
        { type: 'text', text: 'Answer' },
      ];

      expect(extractText(contents)).toBe('Answer');
    });

    it('should return empty string for empty array', () => {
      expect(extractText([])).toBe('');
    });

    it('should return empty string for no text contents', () => {
      const contents: LlmContent[] = [
        {
          type: 'tool_call',
          id: 'c1',
          name: 'read',
          arguments: {},
        },
      ];

      expect(extractText(contents)).toBe('');
    });
  });

  // =================================================================
  // 2.5.3.1 Factory Helpers
  // =================================================================

  describe('createTextContent', () => {
    it('should create LlmTextContent', () => {
      const content = createTextContent('hello');

      expect(content.type).toBe('text');
      expect(content.text).toBe('hello');
    });

    it('should create LlmTextContent with empty string', () => {
      const content = createTextContent('');

      expect(content.type).toBe('text');
      expect(content.text).toBe('');
    });
  });

  // =================================================================
  // 2.6.2 LlmMessage-level Inspectors
  // =================================================================

  describe('isToolCallMessage', () => {
    it('should return true for assistant message with tool_call content', () => {
      const message: LlmMessage = {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            id: 'call-1',
            name: 'read_file',
            arguments: { path: '/test.txt' },
          },
        ],
      };
      expect(isToolCallMessage(message)).toBe(true);
    });

    it('should return false for user message', () => {
      const message: LlmMessage = {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      };
      expect(isToolCallMessage(message)).toBe(false);
    });

    it('should return false for assistant message with only text', () => {
      const message: LlmMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: 'response' }],
      };
      expect(isToolCallMessage(message)).toBe(false);
    });
  });

  describe('isToolResultMessage', () => {
    it('should return true for message with tool_result content', () => {
      const message: LlmMessage = {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            toolCallId: 'call-1',
            content: 'result data',
          },
        ],
      };
      expect(isToolResultMessage(message)).toBe(true);
    });

    it('should return false for user message with text', () => {
      const message: LlmMessage = {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      };
      expect(isToolResultMessage(message)).toBe(false);
    });

    it('should return false for assistant message', () => {
      const message: LlmMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: 'response' }],
      };
      expect(isToolResultMessage(message)).toBe(false);
    });
  });
});
