/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  convertContentToLlmMessage,
  convertContentsToLlmMessages,
  convertPartListUnionToLlmContents,
  isContentToolCallMessage,
  isContentToolResultMessage,
} from '../providers/gemini/typeConversion.js';
import type { Content } from '@google/genai';

describe('geminiTypeConversion', () => {
  describe('convertContentToLlmMessage', () => {
    it('should convert user text content', () => {
      const content: Content = {
        role: 'user',
        parts: [{ text: 'Hello' }],
      };
      const result = convertContentToLlmMessage(content);
      expect(result.role).toBe('user');
      expect(result.content).toEqual([{ type: 'text', text: 'Hello' }]);
    });

    it('should convert model text content to assistant role', () => {
      const content: Content = {
        role: 'model',
        parts: [{ text: 'Hi there' }],
      };
      const result = convertContentToLlmMessage(content);
      expect(result.role).toBe('assistant');
      expect(result.content).toEqual([{ type: 'text', text: 'Hi there' }]);
    });

    it('should convert functionCall parts to tool_call content', () => {
      const content: Content = {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: 'read_file',
              args: { path: '/test.txt' },
            },
          },
        ],
      };
      const result = convertContentToLlmMessage(content);
      expect(result.role).toBe('assistant');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'tool_call',
        name: 'read_file',
        arguments: { path: '/test.txt' },
      });
    });

    it('should convert functionResponse parts to tool_result content', () => {
      const content: Content = {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'read_file',
              response: { content: 'file contents' },
            },
          },
        ],
      };
      const result = convertContentToLlmMessage(content);
      expect(result.role).toBe('user');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toMatchObject({
        type: 'tool_result',
        name: 'read_file',
      });
    });

    it('should convert inlineData parts to image content', () => {
      const content: Content = {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: 'base64data',
            },
          },
        ],
      };
      const result = convertContentToLlmMessage(content);
      expect(result.content).toEqual([
        {
          type: 'image',
          source: {
            type: 'base64',
            mediaType: 'image/png',
            data: 'base64data',
          },
        },
      ]);
    });

    it('should convert multiple parts in a single content', () => {
      const content: Content = {
        role: 'user',
        parts: [{ text: 'Hello' }, { text: 'World' }],
      };
      const result = convertContentToLlmMessage(content);
      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello' });
      expect(result.content[1]).toEqual({ type: 'text', text: 'World' });
    });

    it('should handle empty parts array', () => {
      const content: Content = {
        role: 'user',
        parts: [],
      };
      const result = convertContentToLlmMessage(content);
      expect(result.content).toEqual([]);
    });

    it('should handle undefined parts', () => {
      const content: Content = {
        role: 'user',
      };
      const result = convertContentToLlmMessage(content);
      expect(result.content).toEqual([]);
    });

    it('should convert fileData parts to image content with url source', () => {
      const content: Content = {
        role: 'user',
        parts: [
          {
            fileData: {
              fileUri: 'gs://bucket/image.png',
              mimeType: 'image/png',
            },
          },
        ],
      };
      const result = convertContentToLlmMessage(content);
      expect(result.content).toEqual([
        {
          type: 'image',
          source: {
            type: 'url',
            mediaType: 'image/png',
            url: 'gs://bucket/image.png',
          },
        },
      ]);
    });

    it('should treat thought:false text as regular text, not thought', () => {
      const content: Content = {
        role: 'model',
        parts: [{ text: 'regular text', thought: false }],
      };
      const result = convertContentToLlmMessage(content);
      expect(result.content).toEqual([{ type: 'text', text: 'regular text' }]);
    });

    it('should treat thought:true as thought content', () => {
      const content: Content = {
        role: 'model',
        parts: [{ text: 'thinking...', thought: true }],
      };
      const result = convertContentToLlmMessage(content);
      expect(result.content).toEqual([
        { type: 'thought', thought: 'thinking...' },
      ]);
    });
  });

  describe('convertContentsToLlmMessages', () => {
    it('should convert an array of Content to LlmMessage[]', () => {
      const contents: Content[] = [
        { role: 'user', parts: [{ text: 'Hi' }] },
        { role: 'model', parts: [{ text: 'Hello' }] },
      ];
      const result = convertContentsToLlmMessages(contents);
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      expect(result[1].role).toBe('assistant');
    });

    it('should handle empty array', () => {
      const result = convertContentsToLlmMessages([]);
      expect(result).toEqual([]);
    });
  });

  describe('convertPartListUnionToLlmContents', () => {
    it('should convert a string to text content', () => {
      const result = convertPartListUnionToLlmContents('hello');
      expect(result).toEqual([{ type: 'text', text: 'hello' }]);
    });

    it('should convert a single Part object', () => {
      const result = convertPartListUnionToLlmContents({ text: 'hello' });
      expect(result).toEqual([{ type: 'text', text: 'hello' }]);
    });

    it('should convert a Part array', () => {
      const result = convertPartListUnionToLlmContents([
        { text: 'hello' },
        { text: 'world' },
      ]);
      expect(result).toEqual([
        { type: 'text', text: 'hello' },
        { type: 'text', text: 'world' },
      ]);
    });

    it('should handle mixed Part array', () => {
      const result = convertPartListUnionToLlmContents([
        { text: 'hello' },
        { inlineData: { mimeType: 'image/png', data: 'base64' } },
      ]);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ type: 'text', text: 'hello' });
      expect(result[1]).toEqual({
        type: 'image',
        source: { type: 'base64', mediaType: 'image/png', data: 'base64' },
      });
    });

    it('should handle empty Part array', () => {
      const result = convertPartListUnionToLlmContents([]);
      expect(result).toEqual([]);
    });
  });

  describe('isContentToolCallMessage', () => {
    it('should return true for pure functionCall content', () => {
      const content: Content = {
        role: 'model',
        parts: [{ functionCall: { name: 'read_file', args: { path: '/a' } } }],
      };
      expect(isContentToolCallMessage(content)).toBe(true);
    });

    it('should return false for user role', () => {
      const content: Content = {
        role: 'user',
        parts: [{ functionCall: { name: 'read_file', args: {} } }],
      };
      expect(isContentToolCallMessage(content)).toBe(false);
    });

    it('should return false for undefined role', () => {
      const content: Content = {
        parts: [{ functionCall: { name: 'read_file', args: {} } }],
      };
      expect(isContentToolCallMessage(content)).toBe(false);
    });

    it('should return false for empty parts', () => {
      const content: Content = { role: 'model', parts: [] };
      expect(isContentToolCallMessage(content)).toBe(false);
    });

    it('should return false for mixed functionCall + unconvertible parts', () => {
      const content: Content = {
        role: 'model',
        parts: [
          { functionCall: { name: 'read_file', args: {} } },
          { executableCode: { code: 'print(1)' } } as never,
        ],
      };
      expect(isContentToolCallMessage(content)).toBe(false);
    });

    it('should return false for mixed functionCall + text parts', () => {
      const content: Content = {
        role: 'model',
        parts: [
          { functionCall: { name: 'read_file', args: {} } },
          { text: 'some text' },
        ],
      };
      expect(isContentToolCallMessage(content)).toBe(false);
    });
  });

  describe('isContentToolResultMessage', () => {
    it('should return true for pure functionResponse content', () => {
      const content: Content = {
        role: 'user',
        parts: [
          {
            functionResponse: { name: 'read_file', response: { output: 'ok' } },
          },
        ],
      };
      expect(isContentToolResultMessage(content)).toBe(true);
    });

    it('should return false for model role', () => {
      const content: Content = {
        role: 'model',
        parts: [
          {
            functionResponse: { name: 'read_file', response: { output: 'ok' } },
          },
        ],
      };
      expect(isContentToolResultMessage(content)).toBe(false);
    });

    it('should return false for undefined role (mapRole default-to-user guard)', () => {
      const content: Content = {
        parts: [
          {
            functionResponse: { name: 'read_file', response: { output: 'ok' } },
          },
        ],
      };
      expect(isContentToolResultMessage(content)).toBe(false);
    });

    it('should return false for empty parts', () => {
      const content: Content = { role: 'user', parts: [] };
      expect(isContentToolResultMessage(content)).toBe(false);
    });

    it('should return false for mixed functionResponse + unconvertible parts', () => {
      const content: Content = {
        role: 'user',
        parts: [
          {
            functionResponse: { name: 'read_file', response: { output: 'ok' } },
          },
          { executableCode: { code: 'print(1)' } } as never,
        ],
      };
      expect(isContentToolResultMessage(content)).toBe(false);
    });
  });
});
