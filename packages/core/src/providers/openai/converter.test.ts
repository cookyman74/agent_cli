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

import { describe, it, expect, beforeEach } from 'vitest';
import { OpenAiConverter, type OpenAiStreamState } from './converter.js';
import type {
  LlmGenerateRequest,
  LlmMessage,
  LlmToolDefinition,
} from '../types.js';
import { LlmEventType } from '../events.js';
import type {
  LlmTextDeltaEvent,
  LlmToolCallRequestEvent,
  LlmFinishedEvent,
  LlmMessageEndEvent,
} from '../events.js';

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
  // Stream Event Conversion
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

  // ==========================================================================
  // Stream Event Conversion: OpenAI ChatCompletionChunk → LlmEvent[]
  // ==========================================================================

  describe('convertStreamEvent', () => {
    let state: OpenAiStreamState;

    function freshState(): OpenAiStreamState {
      return converter.createStreamState();
    }

    beforeEach(() => {
      state = freshState();
    });

    // --- Text Delta ---

    describe('text delta', () => {
      it('T1: should emit TextDelta when delta.content is non-null', () => {
        const chunk = {
          choices: [
            { index: 0, delta: { content: 'Hello' }, finish_reason: null },
          ],
        };
        const events = converter.convertStreamEvent(chunk, state);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(LlmEventType.TextDelta);
        expect((events[0] as LlmTextDeltaEvent).text).toBe('Hello');
      });

      it('T2: should return empty when delta.content is null', () => {
        const chunk = {
          choices: [
            { index: 0, delta: { content: null }, finish_reason: null },
          ],
        };
        const events = converter.convertStreamEvent(chunk, state);
        expect(events).toHaveLength(0);
      });

      it('T3: should return empty when delta.content is empty string', () => {
        const chunk = {
          choices: [{ index: 0, delta: { content: '' }, finish_reason: null }],
        };
        const events = converter.convertStreamEvent(chunk, state);
        expect(events).toHaveLength(0);
      });

      it('T4: should return empty for role-only delta (first chunk)', () => {
        const chunk = {
          choices: [
            { index: 0, delta: { role: 'assistant' }, finish_reason: null },
          ],
        };
        const events = converter.convertStreamEvent(chunk, state);
        expect(events).toHaveLength(0);
      });

      it('T5: should emit TextDelta when content + role are both present', () => {
        const chunk = {
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Hi' },
              finish_reason: null,
            },
          ],
        };
        const events = converter.convertStreamEvent(chunk, state);
        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(LlmEventType.TextDelta);
        expect((events[0] as LlmTextDeltaEvent).text).toBe('Hi');
      });
    });

    // --- Tool Call Accumulation ---

    describe('tool call accumulation', () => {
      it('T6: should initialize state for tool_call delta with id+name', () => {
        const chunk = {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: { name: 'get_weather', arguments: '' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        };
        const events = converter.convertStreamEvent(chunk, state);
        expect(events).toHaveLength(0);
        expect(state.currentToolCalls[0]).toEqual({
          id: 'call_1',
          name: 'get_weather',
          argumentsJson: '',
        });
      });

      it('T7: should accumulate arguments delta in state', () => {
        // First chunk: init
        state.currentToolCalls[0] = {
          id: 'call_1',
          name: 'fn',
          argumentsJson: '',
        };

        const chunk = {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: 0, function: { arguments: '{"ci' } }],
              },
              finish_reason: null,
            },
          ],
        };
        const events = converter.convertStreamEvent(chunk, state);
        expect(events).toHaveLength(0);
        expect(state.currentToolCalls[0].argumentsJson).toBe('{"ci');
      });

      it('T8: should concatenate multiple argument deltas', () => {
        state.currentToolCalls[0] = {
          id: 'call_1',
          name: 'fn',
          argumentsJson: '{"ci',
        };

        const chunk = {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  { index: 0, function: { arguments: 'ty":"Seoul"}' } },
                ],
              },
              finish_reason: null,
            },
          ],
        };
        converter.convertStreamEvent(chunk, state);
        expect(state.currentToolCalls[0].argumentsJson).toBe(
          '{"city":"Seoul"}',
        );
      });

      it('T9: should track parallel tool calls by index', () => {
        const chunk = {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: 'call_1',
                    function: { name: 'fn_a', arguments: '{}' },
                  },
                  {
                    index: 1,
                    id: 'call_2',
                    function: { name: 'fn_b', arguments: '{}' },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        };
        converter.convertStreamEvent(chunk, state);
        expect(state.currentToolCalls[0].name).toBe('fn_a');
        expect(state.currentToolCalls[1].name).toBe('fn_b');
      });
    });

    // --- Tool Call Emission ---

    describe('tool call emission', () => {
      it('T10: should emit ToolCallRequest + Finished on finish_reason=tool_calls', () => {
        state.currentToolCalls[0] = {
          id: 'call_1',
          name: 'get_weather',
          argumentsJson: '{"city":"Seoul"}',
        };

        const chunk = {
          choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
        };
        const events = converter.convertStreamEvent(chunk, state);

        // ToolCallRequest + Finished
        expect(events).toHaveLength(2);
        const tcEvent = events[0] as LlmToolCallRequestEvent;
        expect(tcEvent.type).toBe(LlmEventType.ToolCallRequest);
        expect(tcEvent.callId).toBe('call_1');
        expect(tcEvent.name).toBe('get_weather');
        expect(tcEvent.args).toEqual({ city: 'Seoul' });

        const finEvent = events[1] as LlmFinishedEvent;
        expect(finEvent.type).toBe(LlmEventType.Finished);
        expect(finEvent.finishReason).toBe('tool_use');
      });

      it('T11: should emit multiple ToolCallRequests for parallel tool calls', () => {
        state.currentToolCalls[0] = {
          id: 'call_1',
          name: 'fn_a',
          argumentsJson: '{"a":1}',
        };
        state.currentToolCalls[1] = {
          id: 'call_2',
          name: 'fn_b',
          argumentsJson: '{"b":2}',
        };

        const chunk = {
          choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
        };
        const events = converter.convertStreamEvent(chunk, state);

        // 2 ToolCallRequests + 1 Finished
        expect(events).toHaveLength(3);
        expect(events[0].type).toBe(LlmEventType.ToolCallRequest);
        expect(events[1].type).toBe(LlmEventType.ToolCallRequest);
        expect(events[2].type).toBe(LlmEventType.Finished);
      });

      it('T12: should fallback to empty args for invalid JSON', () => {
        state.currentToolCalls[0] = {
          id: 'call_1',
          name: 'fn',
          argumentsJson: '{invalid',
        };

        const chunk = {
          choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
        };
        const events = converter.convertStreamEvent(chunk, state);
        const tcEvent = events[0] as LlmToolCallRequestEvent;
        expect(tcEvent.args).toEqual({});
      });

      it('T13: should fallback to empty args for empty arguments', () => {
        state.currentToolCalls[0] = {
          id: 'call_1',
          name: 'fn',
          argumentsJson: '',
        };

        const chunk = {
          choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
        };
        const events = converter.convertStreamEvent(chunk, state);
        const tcEvent = events[0] as LlmToolCallRequestEvent;
        expect(tcEvent.args).toEqual({});
      });
    });

    // --- Finish Reason Mapping ---

    describe('finish reason mapping', () => {
      it('T14: should emit Finished(end_turn) for stop', () => {
        const chunk = {
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        };
        const events = converter.convertStreamEvent(chunk, state);
        expect(events).toHaveLength(1);
        const finEvent = events[0] as LlmFinishedEvent;
        expect(finEvent.type).toBe(LlmEventType.Finished);
        expect(finEvent.finishReason).toBe('end_turn');
      });

      it('T15: should emit Finished(max_tokens) for length', () => {
        const chunk = {
          choices: [{ index: 0, delta: {}, finish_reason: 'length' }],
        };
        const events = converter.convertStreamEvent(chunk, state);
        const finEvent = events[0] as LlmFinishedEvent;
        expect(finEvent.finishReason).toBe('max_tokens');
      });

      it('T16: should emit Finished(content_filter) for content_filter', () => {
        const chunk = {
          choices: [{ index: 0, delta: {}, finish_reason: 'content_filter' }],
        };
        const events = converter.convertStreamEvent(chunk, state);
        const finEvent = events[0] as LlmFinishedEvent;
        expect(finEvent.finishReason).toBe('content_filter');
      });

      it('T17: should set finishedEmitted flag to true', () => {
        const chunk = {
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        };
        converter.convertStreamEvent(chunk, state);
        expect(state.finishedEmitted).toBe(true);
      });
    });

    // --- Usage-only Final Chunk ---

    describe('usage-only final chunk', () => {
      it('T18: should emit MessageEnd with usage for empty choices + usage', () => {
        state.finishedEmitted = true;

        const chunk = {
          choices: [],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        };
        const events = converter.convertStreamEvent(chunk, state);
        expect(events).toHaveLength(1);
        const msgEnd = events[0] as LlmMessageEndEvent;
        expect(msgEnd.type).toBe(LlmEventType.MessageEnd);
        expect(msgEnd.usage).toEqual({
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
          cachedTokens: 0,
        });
      });

      it('T19: should emit Finished + MessageEnd if Finished was not yet emitted', () => {
        state.finishedEmitted = false;

        const chunk = {
          choices: [],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 50,
            total_tokens: 150,
          },
        };
        const events = converter.convertStreamEvent(chunk, state);
        expect(events).toHaveLength(2);
        expect(events[0].type).toBe(LlmEventType.Finished);
        expect(events[1].type).toBe(LlmEventType.MessageEnd);
      });

      it('T20: should extract cached_tokens from prompt_tokens_details', () => {
        state.finishedEmitted = true;

        const chunk = {
          choices: [],
          usage: {
            prompt_tokens: 200,
            completion_tokens: 30,
            total_tokens: 230,
            prompt_tokens_details: {
              cached_tokens: 80,
            },
          },
        };
        const events = converter.convertStreamEvent(chunk, state);
        const msgEnd = events[0] as LlmMessageEndEvent;
        expect(msgEnd.usage?.cachedTokens).toBe(80);
      });

      it('T21: should return empty for empty choices without usage', () => {
        const chunk = { choices: [] };
        const events = converter.convertStreamEvent(chunk, state);
        expect(events).toHaveLength(0);
      });
    });

    // --- Integration Sequences ---

    describe('integration sequences', () => {
      it('T22: should handle full text stream sequence', () => {
        const allEvents: Array<{ type: string }> = [];

        // Chunk 1: role-only
        allEvents.push(
          ...converter.convertStreamEvent(
            {
              choices: [
                { index: 0, delta: { role: 'assistant' }, finish_reason: null },
              ],
            },
            state,
          ),
        );

        // Chunk 2-3: text deltas
        allEvents.push(
          ...converter.convertStreamEvent(
            {
              choices: [
                { index: 0, delta: { content: 'Hello' }, finish_reason: null },
              ],
            },
            state,
          ),
        );
        allEvents.push(
          ...converter.convertStreamEvent(
            {
              choices: [
                { index: 0, delta: { content: ' world' }, finish_reason: null },
              ],
            },
            state,
          ),
        );

        // Chunk 4: finish
        allEvents.push(
          ...converter.convertStreamEvent(
            { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
            state,
          ),
        );

        // Chunk 5: usage
        allEvents.push(
          ...converter.convertStreamEvent(
            {
              choices: [],
              usage: {
                prompt_tokens: 10,
                completion_tokens: 5,
                total_tokens: 15,
              },
            },
            state,
          ),
        );

        expect(allEvents.map((e) => e.type)).toEqual([
          LlmEventType.TextDelta,
          LlmEventType.TextDelta,
          LlmEventType.Finished,
          LlmEventType.MessageEnd,
        ]);
      });

      it('T23: should handle full tool call stream sequence', () => {
        const allEvents: Array<{ type: string }> = [];

        // Chunk 1: init tool call
        allEvents.push(
          ...converter.convertStreamEvent(
            {
              choices: [
                {
                  index: 0,
                  delta: {
                    role: 'assistant',
                    tool_calls: [
                      {
                        index: 0,
                        id: 'call_1',
                        function: { name: 'get_weather', arguments: '' },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            },
            state,
          ),
        );

        // Chunk 2-3: arguments deltas
        allEvents.push(
          ...converter.convertStreamEvent(
            {
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      { index: 0, function: { arguments: '{"city"' } },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            },
            state,
          ),
        );
        allEvents.push(
          ...converter.convertStreamEvent(
            {
              choices: [
                {
                  index: 0,
                  delta: {
                    tool_calls: [
                      { index: 0, function: { arguments: ':"Seoul"}' } },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            },
            state,
          ),
        );

        // Chunk 4: finish_reason=tool_calls
        allEvents.push(
          ...converter.convertStreamEvent(
            { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] },
            state,
          ),
        );

        // Chunk 5: usage
        allEvents.push(
          ...converter.convertStreamEvent(
            {
              choices: [],
              usage: {
                prompt_tokens: 20,
                completion_tokens: 15,
                total_tokens: 35,
              },
            },
            state,
          ),
        );

        expect(allEvents.map((e) => e.type)).toEqual([
          LlmEventType.ToolCallRequest,
          LlmEventType.Finished,
          LlmEventType.MessageEnd,
        ]);

        const tcEvent = allEvents[0] as LlmToolCallRequestEvent;
        expect(tcEvent.args).toEqual({ city: 'Seoul' });
      });
    });

    // --- Edge Cases ---

    describe('edge cases', () => {
      it('T24: should return empty for completely empty/malformed object', () => {
        const events = converter.convertStreamEvent({}, state);
        expect(events).toHaveLength(0);
      });

      it('T25: should return empty when choices is undefined', () => {
        const events = converter.convertStreamEvent({ id: 'chunk-1' }, state);
        expect(events).toHaveLength(0);
      });
    });

    // --- Review Issue Fixes ---

    describe('review issue fixes', () => {
      it('R1: duplicate id in tool_call delta should NOT overwrite accumulated args', () => {
        // Init tool call with id
        converter.convertStreamEvent(
          {
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      function: { name: 'fn', arguments: '{"a"' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          state,
        );

        // Duplicate id chunk (should NOT reinitialize)
        converter.convertStreamEvent(
          {
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      function: { arguments: ':1}' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          state,
        );

        expect(state.currentToolCalls[0].argumentsJson).toBe('{"a":1}');
      });

      it('R2: late name in continuation chunk should be reflected', () => {
        // Init with id only (no name yet)
        converter.convertStreamEvent(
          {
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      function: { name: '', arguments: '{}' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          state,
        );
        expect(state.currentToolCalls[0].name).toBe('');

        // Continuation with late name
        converter.convertStreamEvent(
          {
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: { name: 'late_fn', arguments: '' },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          state,
        );

        expect(state.currentToolCalls[0].name).toBe('late_fn');
      });

      it('R3: non-array choices should return empty array without throwing', () => {
        expect(() => {
          const events = converter.convertStreamEvent(
            { choices: { index: 0 } },
            state,
          );
          expect(events).toHaveLength(0);
        }).not.toThrow();
      });

      it('R4: choices containing undefined element should return empty without throwing', () => {
        expect(() => {
          const events = converter.convertStreamEvent(
            { choices: [undefined] },
            state,
          );
          expect(events).toHaveLength(0);
        }).not.toThrow();
      });
    });
  });
});
