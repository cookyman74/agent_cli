/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for GeminiConverter — converts between
 * provider-independent types (Llm*) and Gemini SDK types.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.3
 */

import { describe, it, expect } from 'vitest';
import { GeminiConverter } from './converter.js';
import type {
  LlmGenerateRequest,
  LlmMessage,
  LlmToolDefinition,
  LlmStopReason,
} from '../types.js';
import type { GenerateContentResponse } from '@google/genai';

describe('GeminiConverter', () => {
  const converter = new GeminiConverter();

  // ==============================================================
  // toGeminiContents — LlmMessage[] → { contents: Content[], systemInstruction: string }
  // ==============================================================

  describe('toGeminiContents', () => {
    it('should convert user text message to Gemini Content', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ];

      const result = converter.toGeminiContents(messages);

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].role).toBe('user');
      expect(result.contents[0].parts).toEqual([{ text: 'Hello' }]);
      expect(result.systemInstruction).toBe('');
    });

    it('should convert assistant role to model role', () => {
      const messages: LlmMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there' }],
        },
      ];

      const result = converter.toGeminiContents(messages);

      expect(result.contents[0].role).toBe('model');
    });

    it('should extract system messages as systemInstruction', () => {
      const messages: LlmMessage[] = [
        {
          role: 'system',
          content: [{ type: 'text', text: 'You are a helpful assistant.' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ];

      const result = converter.toGeminiContents(messages);

      expect(result.contents).toHaveLength(1); // system excluded
      expect(result.systemInstruction).toContain(
        'You are a helpful assistant.',
      );
    });

    it('should handle tool_call content as functionCall Part', () => {
      const messages: LlmMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_call',
              id: 'call-1',
              name: 'read_file',
              arguments: { path: '/tmp/test.txt' },
            },
          ],
        },
      ];

      const result = converter.toGeminiContents(messages);

      expect(result.contents[0].parts![0]).toEqual({
        functionCall: {
          name: 'read_file',
          args: { path: '/tmp/test.txt' },
        },
      });
    });

    it('should handle tool_result content as functionResponse Part', () => {
      const messages: LlmMessage[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              name: 'read_file',
              content: 'file content here',
            },
          ],
        },
      ];

      const result = converter.toGeminiContents(messages);

      const part = result.contents[0].parts![0] as Record<string, unknown>;
      expect(part).toHaveProperty('functionResponse');
      const funcResponse = part['functionResponse'] as Record<string, unknown>;
      expect(funcResponse['name']).toBe('read_file');
    });

    it('should handle image content (base64) as inlineData Part', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                mediaType: 'image/png',
                data: 'base64data',
              },
            },
          ],
        },
      ];

      const result = converter.toGeminiContents(messages);

      const part = result.contents[0].parts![0] as Record<string, unknown>;
      expect(part).toHaveProperty('inlineData');
      const inlineData = part['inlineData'] as Record<string, unknown>;
      expect(inlineData['mimeType']).toBe('image/png');
      expect(inlineData['data']).toBe('base64data');
    });

    it('should handle thought content (skip or convert)', () => {
      const messages: LlmMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'thought',
              thought: 'thinking about the problem...',
            },
          ],
        },
      ];

      // Thought content should be skipped (no parts)
      const result = converter.toGeminiContents(messages);
      expect(result.contents).toBeDefined();
    });
  });

  // ==============================================================
  // toGeminiRequest — LlmGenerateRequest → request params
  // ==============================================================

  describe('toGeminiRequest', () => {
    it('should convert basic request with model and messages', () => {
      const request: LlmGenerateRequest = {
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      };

      const result = converter.toGeminiRequest(request);

      // contents is ContentListUnion — check via the config model
      expect(result.model).toBe('gemini-2.0-flash');
      expect(result.contents).toBeDefined();
    });

    it('should include systemInstruction in config', () => {
      const request: LlmGenerateRequest = {
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        systemInstruction: 'Be helpful.',
      };

      const result = converter.toGeminiRequest(request);

      expect(result.config?.['systemInstruction']).toBeDefined();
    });

    it('should merge systemInstruction from messages and request', () => {
      const request: LlmGenerateRequest = {
        model: 'gemini-2.0-flash',
        messages: [
          {
            role: 'system',
            content: [{ type: 'text', text: 'You are a coder.' }],
          },
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        systemInstruction: 'Be helpful.',
      };

      const result = converter.toGeminiRequest(request);

      // Both should be merged in config
      expect(result.config?.['systemInstruction']).toBeDefined();
    });

    it('should convert generation config parameters', () => {
      const request: LlmGenerateRequest = {
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        temperature: 0.7,
        maxTokens: 1024,
        topP: 0.9,
        topK: 40,
        stopSequences: ['END'],
      };

      const result = converter.toGeminiRequest(request);
      const config = result.config!;

      expect(config['temperature']).toBe(0.7);
      expect(config['maxOutputTokens']).toBe(1024);
      expect(config['topP']).toBe(0.9);
      expect(config['topK']).toBe(40);
      expect(config['stopSequences']).toEqual(['END']);
    });

    it('should convert response format to responseMimeType', () => {
      const request: LlmGenerateRequest = {
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        responseFormat: 'json',
      };

      const result = converter.toGeminiRequest(request);
      const config = result.config!;

      expect(config['responseMimeType']).toBe('application/json');
    });

    it('should convert tools to Gemini functionDeclarations in config', () => {
      const tools: LlmToolDefinition[] = [
        {
          name: 'read_file',
          description: 'Read a file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' },
            },
            required: ['path'],
          },
        },
      ];

      const request: LlmGenerateRequest = {
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        tools,
      };

      const result = converter.toGeminiRequest(request);

      expect(result.config?.['tools']).toBeDefined();
    });
  });

  // ==============================================================
  // fromGeminiResponse — GenerateContentResponse → LlmGenerateResponse
  // ==============================================================

  describe('fromGeminiResponse', () => {
    it('should convert text response', () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Hello there!' }],
            },
            finishReason: 'STOP' as const,
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
        modelVersion: 'gemini-2.0-flash',
      } as unknown as GenerateContentResponse;

      const result = converter.fromGeminiResponse(
        geminiResponse,
        'gemini-2.0-flash',
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello there!' });
      expect(result.stopReason).toBe('end_turn');
      expect(result.model).toBe('gemini-2.0-flash');
      expect(result.usage).toBeDefined();
      expect(result.usage!.promptTokens).toBe(10);
      expect(result.usage!.completionTokens).toBe(5);
      expect(result.usage!.totalTokens).toBe(15);
    });

    it('should convert function call response', () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'read_file',
                    args: { path: '/tmp/test.txt' },
                  },
                },
              ],
            },
            finishReason: 'STOP' as const,
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      } as unknown as GenerateContentResponse;

      const result = converter.fromGeminiResponse(
        geminiResponse,
        'gemini-2.0-flash',
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('tool_call');
      const toolCall = result.content[0] as {
        type: 'tool_call';
        id: string;
        name: string;
        arguments: Record<string, unknown>;
      };
      expect(toolCall.name).toBe('read_file');
      expect(toolCall.arguments).toEqual({ path: '/tmp/test.txt' });
      expect(toolCall.id).toBeDefined();
    });

    it('should map STOP finish reason to end_turn', () => {
      const geminiResponse = {
        candidates: [
          {
            content: { role: 'model', parts: [{ text: 'done' }] },
            finishReason: 'STOP' as const,
          },
        ],
      } as unknown as GenerateContentResponse;

      const result = converter.fromGeminiResponse(geminiResponse, 'test');
      expect(result.stopReason).toBe('end_turn');
    });

    it('should map MAX_TOKENS finish reason', () => {
      const geminiResponse = {
        candidates: [
          {
            content: { role: 'model', parts: [{ text: 'partial' }] },
            finishReason: 'MAX_TOKENS' as const,
          },
        ],
      } as unknown as GenerateContentResponse;

      const result = converter.fromGeminiResponse(geminiResponse, 'test');
      expect(result.stopReason).toBe('max_tokens');
    });

    it('should map SAFETY finish reason to content_filter', () => {
      const geminiResponse = {
        candidates: [
          {
            content: { role: 'model', parts: [] },
            finishReason: 'SAFETY' as const,
          },
        ],
      } as unknown as GenerateContentResponse;

      const result = converter.fromGeminiResponse(geminiResponse, 'test');
      expect(result.stopReason).toBe('content_filter');
    });

    it('should handle empty candidates gracefully', () => {
      const geminiResponse = {
        candidates: [],
      } as unknown as GenerateContentResponse;

      const result = converter.fromGeminiResponse(geminiResponse, 'test');

      expect(result.content).toEqual([]);
      expect(result.stopReason).toBe('end_turn');
    });

    it('should handle response without usageMetadata', () => {
      const geminiResponse = {
        candidates: [
          {
            content: { role: 'model', parts: [{ text: 'ok' }] },
            finishReason: 'STOP' as const,
          },
        ],
      } as unknown as GenerateContentResponse;

      const result = converter.fromGeminiResponse(geminiResponse, 'test');
      expect(result.usage).toBeDefined();
      expect(result.usage!.totalTokens).toBe(0);
    });

    it('should preserve rawResponse', () => {
      const geminiResponse = {
        candidates: [
          {
            content: { role: 'model', parts: [{ text: 'ok' }] },
            finishReason: 'STOP' as const,
          },
        ],
      } as unknown as GenerateContentResponse;

      const result = converter.fromGeminiResponse(geminiResponse, 'test');
      expect(result.rawResponse).toBe(geminiResponse);
    });

    it('should convert inline image data in response', () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: 'base64imagedata',
                  },
                },
              ],
            },
            finishReason: 'STOP' as const,
          },
        ],
      } as unknown as GenerateContentResponse;

      const result = converter.fromGeminiResponse(geminiResponse, 'test');
      expect(result.content[0].type).toBe('image');
    });
  });

  // ==============================================================
  // mapStopReason — FinishReason → LlmStopReason
  // ==============================================================

  describe('mapStopReason', () => {
    const cases: Array<[string | undefined, LlmStopReason]> = [
      ['STOP', 'end_turn'],
      ['MAX_TOKENS', 'max_tokens'],
      ['SAFETY', 'content_filter'],
      ['RECITATION', 'content_filter'],
      [undefined, 'end_turn'],
    ];

    it.each(cases)('should map %s to %s', (geminiReason, expectedLlmReason) => {
      const result = converter.mapStopReason(geminiReason);
      expect(result).toBe(expectedLlmReason);
    });
  });

  // ==============================================================
  // toGeminiTools — LlmToolDefinition[] → Tool[]
  // ==============================================================

  describe('toGeminiTools', () => {
    it('should convert tool definitions to Gemini format', () => {
      const tools: LlmToolDefinition[] = [
        {
          name: 'search',
          description: 'Search the web',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' },
            },
            required: ['query'],
          },
        },
        {
          name: 'read_file',
          description: 'Read a file',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' },
            },
            required: ['path'],
          },
        },
      ];

      const result = converter.toGeminiTools(tools);

      expect(result).toHaveLength(1);
      expect(result[0].functionDeclarations).toHaveLength(2);
      expect(result[0].functionDeclarations![0].name).toBe('search');
      expect(result[0].functionDeclarations![1].name).toBe('read_file');
    });

    it('should return empty array for no tools', () => {
      const result = converter.toGeminiTools([]);
      expect(result).toHaveLength(0);
    });
  });

  // ==============================================================
  // toGeminiToolConfig — LlmToolChoice → ToolConfig
  // ==============================================================

  describe('toGeminiToolConfig', () => {
    it('should convert auto tool choice', () => {
      const result = converter.toGeminiToolConfig('auto');
      expect(result).toBeDefined();
    });

    it('should convert none tool choice', () => {
      const result = converter.toGeminiToolConfig('none');
      expect(result).toBeDefined();
    });

    it('should convert required tool choice', () => {
      const result = converter.toGeminiToolConfig('required');
      expect(result).toBeDefined();
    });

    it('should convert specific tool choice', () => {
      const result = converter.toGeminiToolConfig({ name: 'read_file' });
      expect(result).toBeDefined();
    });
  });
});
