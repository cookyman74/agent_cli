/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  buildLlmRequestFromGeminiState,
  convertGeminiToolsToLlm,
} from './requestBuilder.js';
import { Type } from '@google/genai';
import type { Content, GenerateContentConfig, Tool } from '@google/genai';

describe('requestBuilder', () => {
  // ============================================================================
  // convertGeminiToolsToLlm — Gemini Tool[] → LlmToolDefinition[]
  // ============================================================================

  describe('convertGeminiToolsToLlm', () => {
    it('should return empty array for empty tools', () => {
      expect(convertGeminiToolsToLlm([])).toEqual([]);
    });

    it('should return empty array for tools without functionDeclarations', () => {
      const tools: Tool[] = [{}];
      expect(convertGeminiToolsToLlm(tools)).toEqual([]);
    });

    it('should convert a single tool with function declaration', () => {
      const tools: Tool[] = [
        {
          functionDeclarations: [
            {
              name: 'read_file',
              description: 'Read a file',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  path: { type: Type.STRING, description: 'File path' },
                },
                required: ['path'],
              },
            },
          ],
        },
      ];

      const result = convertGeminiToolsToLlm(tools);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'read_file',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
          },
          required: ['path'],
        },
      });
    });

    it('should convert multiple function declarations across Tool entries', () => {
      const tools: Tool[] = [
        {
          functionDeclarations: [
            {
              name: 'tool_a',
              description: 'Tool A',
              parameters: {
                type: Type.OBJECT,
                properties: {},
              },
            },
            {
              name: 'tool_b',
              description: 'Tool B',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  count: { type: Type.NUMBER },
                },
                required: ['count'],
              },
            },
          ],
        },
      ];

      const result = convertGeminiToolsToLlm(tools);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('tool_a');
      expect(result[1].name).toBe('tool_b');
    });

    it('should handle nested object properties', () => {
      const tools: Tool[] = [
        {
          functionDeclarations: [
            {
              name: 'complex_tool',
              description: 'Complex',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  config: {
                    type: Type.OBJECT,
                    properties: {
                      enabled: { type: Type.BOOLEAN },
                    },
                  },
                  tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
              },
            },
          ],
        },
      ];

      const result = convertGeminiToolsToLlm(tools);
      expect(result[0].parameters.properties['config']).toEqual({
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
        },
      });
      expect(result[0].parameters.properties['tags']).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
    });

    it('should default missing description to empty string', () => {
      const tools: Tool[] = [
        {
          functionDeclarations: [
            {
              name: 'no_desc',
              parameters: {
                type: Type.OBJECT,
                properties: {},
              },
            },
          ],
        },
      ];

      const result = convertGeminiToolsToLlm(tools);
      expect(result[0].description).toBe('');
    });
  });

  // ============================================================================
  // buildLlmRequestFromGeminiState — full request assembly
  // ============================================================================

  describe('buildLlmRequestFromGeminiState', () => {
    it('should build minimal request with model and empty history', () => {
      const result = buildLlmRequestFromGeminiState({
        model: 'claude-3-sonnet',
        history: [],
        currentRequest: [{ text: 'Hello' }],
      });

      expect(result.model).toBe('claude-3-sonnet');
      expect(result.messages).toHaveLength(1); // current request only
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toEqual([
        { type: 'text', text: 'Hello' },
      ]);
    });

    it('should include history messages before current request', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hi' }] },
        { role: 'model', parts: [{ text: 'Hello!' }] },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [{ text: 'How are you?' }],
      });

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[2].role).toBe('user');
    });

    it('should set systemInstruction', () => {
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
        systemInstruction: 'You are a helpful assistant.',
      });

      expect(result.systemInstruction).toBe('You are a helpful assistant.');
    });

    it('should map config temperature', () => {
      const config: GenerateContentConfig = { temperature: 0.7 };
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
        config,
      });

      expect(result.temperature).toBe(0.7);
    });

    it('should map config maxOutputTokens to maxTokens', () => {
      const config: GenerateContentConfig = { maxOutputTokens: 1024 };
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
        config,
      });

      expect(result.maxTokens).toBe(1024);
    });

    it('should map config topP and stopSequences', () => {
      const config: GenerateContentConfig = {
        topP: 0.9,
        stopSequences: ['END', 'STOP'],
      };
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
        config,
      });

      expect(result.topP).toBe(0.9);
      expect(result.stopSequences).toEqual(['END', 'STOP']);
    });

    it('should map config topK', () => {
      const config: GenerateContentConfig = { topK: 40 };
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
        config,
      });

      expect(result.topK).toBe(40);
    });

    it('should convert tools when provided', () => {
      const tools: Tool[] = [
        {
          functionDeclarations: [
            {
              name: 'search',
              description: 'Search the web',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  query: { type: Type.STRING, description: 'Search query' },
                },
                required: ['query'],
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
        tools,
      });

      expect(result.tools).toHaveLength(1);
      expect(result.tools![0].name).toBe('search');
    });

    it('should not include undefined optional fields', () => {
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
      });

      expect(result.systemInstruction).toBeUndefined();
      expect(result.tools).toBeUndefined();
      expect(result.temperature).toBeUndefined();
      expect(result.maxTokens).toBeUndefined();
      expect(result.topP).toBeUndefined();
      expect(result.topK).toBeUndefined();
      expect(result.stopSequences).toBeUndefined();
    });

    it('should handle string currentRequest', () => {
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: 'Hello world',
      });

      const lastMsg = result.messages[result.messages.length - 1];
      expect(lastMsg.content).toEqual([{ type: 'text', text: 'Hello world' }]);
    });

    it('should handle history with tool calls and tool results', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Search for cats' }] },
        {
          role: 'model',
          parts: [{ functionCall: { name: 'search', args: { q: 'cats' } } }],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'search',
                response: { result: 'Found cats' },
              },
            },
          ],
        },
        { role: 'model', parts: [{ text: 'I found cats!' }] },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history,
        currentRequest: [{ text: 'More details' }],
      });

      expect(result.messages).toHaveLength(5);
      // tool call message
      const toolCallMsg = result.messages[1];
      expect(toolCallMsg.role).toBe('assistant');
      expect(toolCallMsg.content[0].type).toBe('tool_call');
      // tool result message
      const toolResultMsg = result.messages[2];
      expect(toolResultMsg.role).toBe('user');
      expect(toolResultMsg.content[0].type).toBe('tool_result');
    });

    it('should preserve callId through functionCall.id and functionResponse.id', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Do something' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-abc-123',
                name: 'my_tool',
                args: { x: 1 },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call-abc-123',
                name: 'my_tool',
                response: { output: 'done' },
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history,
        currentRequest: [{ text: 'Next' }],
      });

      // tool_call should have id preserved
      const toolCallContent = result.messages[1].content[0];
      expect(toolCallContent.type).toBe('tool_call');
      if (toolCallContent.type === 'tool_call') {
        expect(toolCallContent.id).toBe('call-abc-123');
      }

      // tool_result should have toolCallId preserved
      const toolResultContent = result.messages[2].content[0];
      expect(toolResultContent.type).toBe('tool_result');
      if (toolResultContent.type === 'tool_result') {
        expect(toolResultContent.toolCallId).toBe('call-abc-123');
      }
    });
  });
});
