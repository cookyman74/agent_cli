/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for OpenAiConverter — converts between provider-independent
 * Llm* types and OpenAI SDK types.
 *
 * @see docs/ai_adapter/todolist/phase3_provider_extension_todolist.md §3.2.2
 */

import { describe, it, expect } from 'vitest';
import { OpenAiConverter } from './converter.js';
import type {
  LlmGenerateRequest,
  LlmMessage,
  LlmToolDefinition,
} from '../types.js';

describe('OpenAiConverter', () => {
  const converter = new OpenAiConverter();

  // ==========================================================================
  // Request Conversion: Llm → OpenAI
  // ==========================================================================

  describe('toOpenAiRequest', () => {
    it('should convert a basic request with model and messages', () => {
      const request: LlmGenerateRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      };
      const result = converter.toOpenAiRequest(request);
      expect(result['model']).toBe('gpt-4o');
      expect(result['messages']).toBeDefined();
      expect(result['max_completion_tokens']).toBeUndefined();
    });

    it('should map maxTokens to max_completion_tokens', () => {
      const request: LlmGenerateRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        maxTokens: 4096,
      };
      const result = converter.toOpenAiRequest(request);
      expect(result['max_completion_tokens']).toBe(4096);
    });

    it('should map temperature, topP, and stopSequences', () => {
      const request: LlmGenerateRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        temperature: 0.7,
        topP: 0.9,
        stopSequences: ['STOP', 'END'],
      };
      const result = converter.toOpenAiRequest(request);
      expect(result['temperature']).toBe(0.7);
      expect(result['top_p']).toBe(0.9);
      expect(result['stop']).toEqual(['STOP', 'END']);
    });

    it('should include tools when provided', () => {
      const tools: LlmToolDefinition[] = [
        {
          name: 'get_weather',
          description: 'Get weather info',
          parameters: {
            type: 'object',
            properties: {
              city: { type: 'string', description: 'City name' },
            },
            required: ['city'],
          },
        },
      ];
      const request: LlmGenerateRequest = {
        model: 'gpt-4o',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Weather?' }] },
        ],
        tools,
      };
      const result = converter.toOpenAiRequest(request);
      expect(result['tools']).toBeDefined();
      const resultTools = result['tools'] as Array<Record<string, unknown>>;
      expect(resultTools).toHaveLength(1);
    });

    it('should include tool_choice when provided', () => {
      const request: LlmGenerateRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        tools: [
          {
            name: 'fn',
            description: 'd',
            parameters: { type: 'object', properties: {} },
          },
        ],
        toolChoice: 'required',
      };
      const result = converter.toOpenAiRequest(request);
      expect(result['tool_choice']).toBeDefined();
    });

    it('should map responseFormat to response_format', () => {
      const request: LlmGenerateRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        responseFormat: 'json',
      };
      const result = converter.toOpenAiRequest(request);
      expect(result['response_format']).toEqual({ type: 'json_object' });
    });

    it('should include systemInstruction as system message', () => {
      const request: LlmGenerateRequest = {
        model: 'gpt-4o',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        systemInstruction: 'You are a helpful assistant.',
      };
      const result = converter.toOpenAiRequest(request);
      const messages = result['messages'] as Array<Record<string, unknown>>;
      expect(messages[0]).toEqual({
        role: 'system',
        content: 'You are a helpful assistant.',
      });
    });
  });

  describe('toOpenAiMessages', () => {
    it('should convert user text message', () => {
      const messages: LlmMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ];
      const result = converter.toOpenAiMessages(messages);
      expect(result).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should convert assistant text message', () => {
      const messages: LlmMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there' }],
        },
      ];
      const result = converter.toOpenAiMessages(messages);
      expect(result).toEqual([{ role: 'assistant', content: 'Hi there' }]);
    });

    it('should extract system messages separately', () => {
      const messages: LlmMessage[] = [
        {
          role: 'system',
          content: [{ type: 'text', text: 'Be concise' }],
        },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ];
      const result = converter.toOpenAiMessages(messages);
      expect(result).toEqual([
        { role: 'system', content: 'Be concise' },
        { role: 'user', content: 'Hello' },
      ]);
    });

    it('should convert tool_call content in assistant message', () => {
      const messages: LlmMessage[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_call',
              id: 'call_1',
              name: 'get_weather',
              arguments: { city: 'Seoul' },
            },
          ],
        },
      ];
      const result = converter.toOpenAiMessages(messages);
      expect(result[0]['role']).toBe('assistant');
      expect(result[0]['tool_calls']).toEqual([
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"city":"Seoul"}',
          },
        },
      ]);
    });

    it('should convert tool_result as tool role message', () => {
      const messages: LlmMessage[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call_1',
              content: 'Sunny, 25°C',
            },
          ],
        },
      ];
      const result = converter.toOpenAiMessages(messages);
      expect(result[0]).toEqual({
        role: 'tool',
        tool_call_id: 'call_1',
        content: 'Sunny, 25°C',
      });
    });

    it('should serialize non-string tool_result content to JSON', () => {
      const messages: LlmMessage[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call_1',
              content: { temp: 25, unit: 'C' },
            },
          ],
        },
      ];
      const result = converter.toOpenAiMessages(messages);
      expect(result[0]['content']).toBe('{"temp":25,"unit":"C"}');
    });

    it('should convert image content with base64 to data URI', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                mediaType: 'image/png',
                data: 'iVBORw0KGgo=',
              },
            },
          ],
        },
      ];
      const result = converter.toOpenAiMessages(messages);
      const msg = result[0];
      const content = msg['content'] as Array<Record<string, unknown>>;
      expect(content[0]['type']).toBe('image_url');
      const imageUrl = content[0]['image_url'] as Record<string, unknown>;
      expect(imageUrl['url']).toBe('data:image/png;base64,iVBORw0KGgo=');
    });

    it('should convert image content with URL directly', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'url',
                mediaType: 'image/jpeg',
                url: 'https://example.com/image.jpg',
              },
            },
          ],
        },
      ];
      const result = converter.toOpenAiMessages(messages);
      const msg = result[0];
      const content = msg['content'] as Array<Record<string, unknown>>;
      expect(content[0]['type']).toBe('image_url');
      const imageUrl = content[0]['image_url'] as Record<string, unknown>;
      expect(imageUrl['url']).toBe('https://example.com/image.jpg');
    });

    it('should handle mixed text and image content as array', () => {
      const messages: LlmMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            {
              type: 'image',
              source: {
                type: 'url',
                mediaType: 'image/png',
                url: 'https://example.com/img.png',
              },
            },
          ],
        },
      ];
      const result = converter.toOpenAiMessages(messages);
      const content = result[0]['content'] as Array<Record<string, unknown>>;
      expect(content).toHaveLength(2);
      expect(content[0]['type']).toBe('text');
      expect(content[1]['type']).toBe('image_url');
    });

    it('should skip thought content blocks', () => {
      const messages: LlmMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'thought', thought: 'thinking...' },
            { type: 'text', text: 'Result' },
          ],
        },
      ];
      const result = converter.toOpenAiMessages(messages);
      expect(result[0]['content']).toBe('Result');
    });

    it('should skip empty messages', () => {
      const messages: LlmMessage[] = [
        { role: 'user', content: [] },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ];
      const result = converter.toOpenAiMessages(messages);
      expect(result).toHaveLength(1);
      expect(result[0]['content']).toBe('Hello');
    });

    it('should handle assistant message with both text and tool_calls', () => {
      const messages: LlmMessage[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me check the weather.' },
            {
              type: 'tool_call',
              id: 'call_1',
              name: 'get_weather',
              arguments: { city: 'Tokyo' },
            },
          ],
        },
      ];
      const result = converter.toOpenAiMessages(messages);
      expect(result[0]['content']).toBe('Let me check the weather.');
      expect(result[0]['tool_calls']).toHaveLength(1);
    });
  });

  describe('toOpenAiTools', () => {
    it('should convert tool definitions to OpenAI function format', () => {
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
      ];
      const result = converter.toOpenAiTools(tools);
      expect(result).toEqual([
        {
          type: 'function',
          function: {
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
        },
      ]);
    });

    it('should omit required when not provided', () => {
      const tools: LlmToolDefinition[] = [
        {
          name: 'noop',
          description: 'No-op tool',
          parameters: { type: 'object', properties: {} },
        },
      ];
      const result = converter.toOpenAiTools(tools);
      const fn = result[0]['function'] as Record<string, unknown>;
      const params = fn['parameters'] as Record<string, unknown>;
      expect(params['required']).toBeUndefined();
    });
  });

  describe('toOpenAiToolChoice', () => {
    it('should map "auto" to "auto"', () => {
      expect(converter.toOpenAiToolChoice('auto')).toBe('auto');
    });

    it('should map "none" to "none"', () => {
      expect(converter.toOpenAiToolChoice('none')).toBe('none');
    });

    it('should map "required" to "required"', () => {
      expect(converter.toOpenAiToolChoice('required')).toBe('required');
    });

    it('should map specific tool name to function object', () => {
      expect(converter.toOpenAiToolChoice({ name: 'get_weather' })).toEqual({
        type: 'function',
        function: { name: 'get_weather' },
      });
    });
  });

  // ==========================================================================
  // Response Conversion: OpenAI → Llm
  // ==========================================================================

  describe('fromOpenAiResponse', () => {
    it('should convert a basic text response', () => {
      const response = {
        id: 'chatcmpl-123',
        model: 'gpt-4o-2024-08-06',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello there!',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
        },
      };

      const result = converter.fromOpenAiResponse(response, 'gpt-4o');
      expect(result.id).toBe('chatcmpl-123');
      expect(result.model).toBe('gpt-4o-2024-08-06');
      expect(result.content).toEqual([{ type: 'text', text: 'Hello there!' }]);
      expect(result.stopReason).toBe('end_turn');
      expect(result.usage).toEqual({
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        cachedTokens: 0,
      });
    });

    it('should convert a response with tool calls', () => {
      const response = {
        id: 'chatcmpl-456',
        model: 'gpt-4o',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_abc',
                  type: 'function',
                  function: {
                    name: 'get_weather',
                    arguments: '{"city":"Seoul"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 10,
          total_tokens: 30,
        },
      };

      const result = converter.fromOpenAiResponse(response, 'gpt-4o');
      expect(result.content).toEqual([
        {
          type: 'tool_call',
          id: 'call_abc',
          name: 'get_weather',
          arguments: { city: 'Seoul' },
        },
      ]);
      expect(result.stopReason).toBe('tool_use');
    });

    it('should handle response with both text and tool calls', () => {
      const response = {
        id: 'chatcmpl-789',
        model: 'gpt-4o',
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Let me check.',
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'search',
                    arguments: '{"q":"test"}',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      };

      const result = converter.fromOpenAiResponse(response, 'gpt-4o');
      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Let me check.',
      });
      expect(result.content[1].type).toBe('tool_call');
    });

    it('should handle invalid tool call arguments gracefully', () => {
      const response = {
        id: 'chatcmpl-err',
        model: 'gpt-4o',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_bad',
                  type: 'function',
                  function: {
                    name: 'fn',
                    arguments: '{invalid json',
                  },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
      };

      const result = converter.fromOpenAiResponse(response, 'gpt-4o');
      const toolCall = result.content[0] as {
        type: string;
        arguments: Record<string, unknown>;
      };
      expect(toolCall.arguments).toEqual({});
    });

    it('should use fallback model when response has none', () => {
      const response = {
        id: 'chatcmpl-x',
        choices: [
          {
            message: { role: 'assistant', content: 'Hi' },
            finish_reason: 'stop',
          },
        ],
      };

      const result = converter.fromOpenAiResponse(response, 'gpt-4o-mini');
      expect(result.model).toBe('gpt-4o-mini');
    });

    it('should extract cached_tokens from usage', () => {
      const response = {
        id: 'chatcmpl-cache',
        model: 'gpt-4o',
        choices: [
          {
            message: { role: 'assistant', content: 'Hi' },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 10,
          total_tokens: 110,
          prompt_tokens_details: {
            cached_tokens: 50,
          },
        },
      };

      const result = converter.fromOpenAiResponse(response, 'gpt-4o');
      expect(result.usage?.cachedTokens).toBe(50);
    });
  });

  describe('mapFinishReason', () => {
    it.each([
      ['stop', 'end_turn'],
      ['length', 'max_tokens'],
      ['tool_calls', 'tool_use'],
      ['content_filter', 'content_filter'],
      ['function_call', 'tool_use'],
      [null, 'end_turn'],
      [undefined, 'end_turn'],
      ['unknown_reason', 'end_turn'],
    ] as const)('should map "%s" to "%s"', (input, expected) => {
      expect(
        converter.mapFinishReason(input as string | null | undefined),
      ).toBe(expected);
    });
  });

  // ==========================================================================
  // Stream Event Conversion (for M3.2.B, but basic state creation here)
  // ==========================================================================

  describe('createStreamState', () => {
    it('should create a fresh stream state', () => {
      const state = converter.createStreamState();
      expect(state).toEqual({
        currentToolCalls: {},
        finishedEmitted: false,
      });
    });
  });
});
