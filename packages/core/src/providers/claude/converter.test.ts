/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for ClaudeConverter — converts between
 * provider-independent types (Llm*) and Anthropic SDK types.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.4
 * @see packages/core/src/providers/gemini/geminiConverter.test.ts (Gemini counterpart)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ClaudeConverter } from './converter.js';
import type { ClaudeStreamState } from './converter.js';
import type {
  LlmGenerateRequest,
  LlmMessage,
  LlmToolDefinition,
  LlmStopReason,
} from '../types.js';
import { LlmEventType } from '../events.js';

describe('ClaudeConverter', () => {
  const converter = new ClaudeConverter();

  // ==============================================================
  // toClaudeRequest — LlmGenerateRequest → Anthropic MessageCreateParams
  // ==============================================================

  describe('toClaudeRequest', () => {
    it('should convert basic request with model and messages', () => {
      const request: LlmGenerateRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      };

      const result = converter.toClaudeRequest(request);

      expect(result['model']).toBe('claude-3-5-sonnet-20241022');
      expect(result['messages']).toBeDefined();
      expect(result['max_tokens']).toBeDefined();
    });

    it('should extract system message to system parameter', () => {
      const request: LlmGenerateRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'system',
            content: [{ type: 'text', text: 'You are a helpful assistant.' }],
          },
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        systemInstruction: 'Be concise.',
      };

      const result = converter.toClaudeRequest(request);

      expect(result['system']).toBeDefined();
      const system = result['system'] as string;
      expect(system).toContain('Be concise.');
      expect(system).toContain('You are a helpful assistant.');
    });

    it('should convert generation parameters (temperature takes precedence over topP)', () => {
      const request: LlmGenerateRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        temperature: 0.7,
        maxTokens: 2048,
        topP: 0.9,
        topK: 40,
        stopSequences: ['END'],
      };

      const result = converter.toClaudeRequest(request);

      expect(result['temperature']).toBe(0.7);
      expect(result['max_tokens']).toBe(2048);
      // Anthropic API: temperature and top_p cannot both be specified
      expect(result['top_p']).toBeUndefined();
      expect(result['top_k']).toBe(40);
      expect(result['stop_sequences']).toEqual(['END']);
    });

    it('should use top_p when temperature is not specified', () => {
      const request: LlmGenerateRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        topP: 0.9,
      };

      const result = converter.toClaudeRequest(request);

      expect(result['temperature']).toBeUndefined();
      expect(result['top_p']).toBe(0.9);
    });

    it('should include tools when present', () => {
      const request: LlmGenerateRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        tools: [
          {
            name: 'read_file',
            description: 'Read a file',
            parameters: {
              type: 'object',
              properties: { path: { type: 'string' } },
              required: ['path'],
            },
          },
        ],
      };

      const result = converter.toClaudeRequest(request);

      expect(result['tools']).toBeDefined();
      const tools = result['tools'] as Array<Record<string, unknown>>;
      expect(tools).toHaveLength(1);
    });

    it('should include tool_choice when present', () => {
      const request: LlmGenerateRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        toolChoice: 'auto',
      };

      const result = converter.toClaudeRequest(request);

      expect(result['tool_choice']).toBeDefined();
    });

    it('should use default max_tokens when not specified', () => {
      const request: LlmGenerateRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      };

      const result = converter.toClaudeRequest(request);

      expect(result['max_tokens']).toBe(8192);
    });
  });

  // ==============================================================
  // toClaudeMessages — LlmMessage[] → { messages, system }
  // ==============================================================

  describe('toClaudeMessages', () => {
    it('should convert user text message', () => {
      const messages: LlmMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ];

      const result = converter.toClaudeMessages(messages);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]['role']).toBe('user');
    });

    it('should convert assistant message', () => {
      const messages: LlmMessage[] = [
        { role: 'assistant', content: [{ type: 'text', text: 'Hi there' }] },
      ];

      const result = converter.toClaudeMessages(messages);

      expect(result.messages[0]['role']).toBe('assistant');
    });

    it('should extract system messages', () => {
      const messages: LlmMessage[] = [
        {
          role: 'system',
          content: [{ type: 'text', text: 'You are helpful.' }],
        },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ];

      const result = converter.toClaudeMessages(messages);

      expect(result.messages).toHaveLength(1); // system excluded
      expect(result.system).toContain('You are helpful.');
    });

    it('should join multiple system messages with newline separator', () => {
      const messages: LlmMessage[] = [
        {
          role: 'system',
          content: [{ type: 'text', text: 'You are helpful.' }],
        },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        {
          role: 'system',
          content: [{ type: 'text', text: 'Be concise.' }],
        },
      ];

      const result = converter.toClaudeMessages(messages);

      expect(result.system).toBe('You are helpful.\nBe concise.');
    });

    it('should handle tool role as user role', () => {
      const messages: LlmMessage[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              content: 'result data',
            },
          ],
        },
      ];

      const result = converter.toClaudeMessages(messages);

      expect(result.messages[0]['role']).toBe('user');
    });
  });

  // ==============================================================
  // toClaudeContent — LlmContent[] → Anthropic ContentBlockParam[]
  // ==============================================================

  describe('toClaudeContent', () => {
    it('should convert text content', () => {
      const result = converter.toClaudeContent([
        { type: 'text', text: 'Hello' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ type: 'text', text: 'Hello' });
    });

    it('should convert tool_call content to tool_use block', () => {
      const result = converter.toClaudeContent([
        {
          type: 'tool_call',
          id: 'call-1',
          name: 'read_file',
          arguments: { path: '/tmp/test.txt' },
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]['type']).toBe('tool_use');
      expect(result[0]['id']).toBe('call-1');
      expect(result[0]['name']).toBe('read_file');
      expect(result[0]['input']).toEqual({ path: '/tmp/test.txt' });
    });

    it('should convert tool_result content to tool_result block', () => {
      const result = converter.toClaudeContent([
        {
          type: 'tool_result',
          toolCallId: 'call-1',
          content: 'file content here',
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]['type']).toBe('tool_result');
      expect(result[0]['tool_use_id']).toBe('call-1');
      expect(result[0]['content']).toBe('file content here');
    });

    it('should convert image content (base64)', () => {
      const result = converter.toClaudeContent([
        {
          type: 'image',
          source: {
            type: 'base64',
            mediaType: 'image/png',
            data: 'base64data',
          },
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]['type']).toBe('image');
      const source = result[0]['source'] as Record<string, unknown>;
      expect(source['type']).toBe('base64');
      expect(source['media_type']).toBe('image/png');
      expect(source['data']).toBe('base64data');
    });

    it('should skip thought content', () => {
      const result = converter.toClaudeContent([
        { type: 'thought', thought: 'thinking...' },
      ]);

      expect(result).toHaveLength(0);
    });
  });

  // ==============================================================
  // toClaudeTools — LlmToolDefinition[] → Anthropic Tool[]
  // ==============================================================

  describe('toClaudeTools', () => {
    it('should convert tool definitions', () => {
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

      const result = converter.toClaudeTools(tools);

      expect(result).toHaveLength(1);
      expect(result[0]['name']).toBe('read_file');
      expect(result[0]['description']).toBe('Read a file');
      expect(result[0]['input_schema']).toEqual({
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path' },
        },
        required: ['path'],
      });
    });

    it('should return empty array for no tools', () => {
      const result = converter.toClaudeTools([]);
      expect(result).toHaveLength(0);
    });
  });

  // ==============================================================
  // toClaudeToolChoice — LlmToolChoice → Anthropic ToolChoice
  // ==============================================================

  describe('toClaudeToolChoice', () => {
    it('should convert auto choice', () => {
      const result = converter.toClaudeToolChoice('auto');
      expect(result).toEqual({ type: 'auto' });
    });

    it('should convert none choice', () => {
      const result = converter.toClaudeToolChoice('none');
      expect(result).toEqual({ type: 'none' });
    });

    it('should convert required choice to any', () => {
      const result = converter.toClaudeToolChoice('required');
      expect(result).toEqual({ type: 'any' });
    });

    it('should convert specific tool choice', () => {
      const result = converter.toClaudeToolChoice({ name: 'read_file' });
      expect(result).toEqual({ type: 'tool', name: 'read_file' });
    });
  });

  // ==============================================================
  // fromClaudeResponse — Anthropic Message → LlmGenerateResponse
  // ==============================================================

  describe('fromClaudeResponse', () => {
    it('should convert text response', () => {
      const response = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello!' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      const result = converter.fromClaudeResponse(
        response,
        'claude-3-5-sonnet-20241022',
      );

      expect(result.id).toBe('msg_123');
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello!' });
      expect(result.stopReason).toBe('end_turn');
      expect(result.model).toBe('claude-3-5-sonnet-20241022');
      expect(result.usage).toBeDefined();
      expect(result.usage!.promptTokens).toBe(10);
      expect(result.usage!.completionTokens).toBe(5);
      expect(result.usage!.totalTokens).toBe(15);
    });

    it('should convert tool_use response', () => {
      const response = {
        id: 'msg_456',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'read_file',
            input: { path: '/tmp/test.txt' },
          },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'tool_use',
        usage: { input_tokens: 10, output_tokens: 15 },
      };

      const result = converter.fromClaudeResponse(
        response,
        'claude-3-5-sonnet-20241022',
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('tool_call');
      const toolCall = result.content[0] as {
        type: 'tool_call';
        id: string;
        name: string;
        arguments: Record<string, unknown>;
      };
      expect(toolCall.id).toBe('toolu_1');
      expect(toolCall.name).toBe('read_file');
      expect(toolCall.arguments).toEqual({ path: '/tmp/test.txt' });
      expect(result.stopReason).toBe('tool_use');
    });

    it('should convert thinking block', () => {
      const response = {
        id: 'msg_789',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Let me think about this...' },
          { type: 'text', text: 'The answer is 42.' },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 },
      };

      const result = converter.fromClaudeResponse(
        response,
        'claude-3-5-sonnet-20241022',
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe('thought');
      expect((result.content[0] as { thought: string }).thought).toBe(
        'Let me think about this...',
      );
      expect(result.content[1].type).toBe('text');
    });

    it('should preserve rawResponse', () => {
      const response = {
        id: 'msg_abc',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 2 },
      };

      const result = converter.fromClaudeResponse(
        response,
        'claude-3-5-sonnet-20241022',
      );
      expect(result.rawResponse).toBe(response);
    });

    it('should handle empty content array', () => {
      const response = {
        id: 'msg_empty',
        type: 'message',
        role: 'assistant',
        content: [],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 5, output_tokens: 0 },
      };

      const result = converter.fromClaudeResponse(
        response,
        'claude-3-5-sonnet-20241022',
      );
      expect(result.content).toEqual([]);
    });
  });

  // ==============================================================
  // mapStopReason — Anthropic stop_reason → LlmStopReason
  // ==============================================================

  describe('mapStopReason', () => {
    const cases: Array<[string | null | undefined, LlmStopReason]> = [
      ['end_turn', 'end_turn'],
      ['max_tokens', 'max_tokens'],
      ['stop_sequence', 'stop_sequence'],
      ['tool_use', 'tool_use'],
      ['pause_turn', 'end_turn'],
      ['refusal', 'content_filter'],
      [null, 'end_turn'],
      [undefined, 'end_turn'],
    ];

    it.each(cases)('should map %s to %s', (claudeReason, expectedReason) => {
      const result = converter.mapStopReason(claudeReason);
      expect(result).toBe(expectedReason);
    });
  });

  // ==============================================================
  // Stream event conversion
  // ==============================================================

  describe('convertStreamEvent', () => {
    let state: ClaudeStreamState;

    beforeEach(() => {
      state = converter.createStreamState();
    });

    it('should convert text_delta to TextDelta event', () => {
      const event = {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: 'Hello' },
      };

      const events = converter.convertStreamEvent(event, state);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LlmEventType.TextDelta);
      expect((events[0] as { text: string }).text).toBe('Hello');
    });

    it('should convert thinking_delta to ThoughtDelta event', () => {
      const event = {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'thinking_delta', thinking: 'Thinking...' },
      };

      const events = converter.convertStreamEvent(event, state);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LlmEventType.ThoughtDelta);
      expect((events[0] as { thought: string }).thought).toBe('Thinking...');
    });

    it('should accumulate tool_use and emit ToolCallRequest on stop', () => {
      // Start tool call
      const startEvent = {
        type: 'content_block_start',
        index: 0,
        content_block: {
          type: 'tool_use',
          id: 'toolu_1',
          name: 'read_file',
          input: {},
        },
      };

      // Delta with partial JSON
      const deltaEvent = {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'input_json_delta',
          partial_json: '{"path": "/tmp/test.txt"}',
        },
      };

      // Stop event
      const stopEvent = {
        type: 'content_block_stop',
        index: 0,
      };

      // Process events sequentially
      const events1 = converter.convertStreamEvent(startEvent, state);
      expect(events1).toHaveLength(0);

      const events2 = converter.convertStreamEvent(deltaEvent, state);
      expect(events2).toHaveLength(0);

      const events3 = converter.convertStreamEvent(stopEvent, state);
      expect(events3).toHaveLength(1);
      expect(events3[0].type).toBe(LlmEventType.ToolCallRequest);
      const toolEvent = events3[0] as {
        callId: string;
        name: string;
        args: Record<string, unknown>;
      };
      expect(toolEvent.callId).toBe('toolu_1');
      expect(toolEvent.name).toBe('read_file');
      expect(toolEvent.args).toEqual({ path: '/tmp/test.txt' });
    });

    it('should emit Finished on message_delta with stop_reason', () => {
      const event = {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 42 },
      };

      const events = converter.convertStreamEvent(event, state);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LlmEventType.Finished);
      const finished = events[0] as { finishReason: string };
      expect(finished.finishReason).toBe('end_turn');
    });

    it('should emit MessageEnd on message_stop', () => {
      const event = { type: 'message_stop' };

      const events = converter.convertStreamEvent(event, state);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LlmEventType.MessageEnd);
    });

    it('should not emit events for message_start', () => {
      const event = {
        type: 'message_start',
        message: {
          id: 'msg_123',
          type: 'message',
          role: 'assistant',
          content: [],
          model: 'claude-3-5-sonnet-20241022',
          usage: { input_tokens: 100, output_tokens: 0 },
        },
      };

      const events = converter.convertStreamEvent(event, state);
      expect(events).toHaveLength(0);
    });

    it('should include usage in Finished event using captured input_tokens', () => {
      // Capture input_tokens from message_start
      converter.convertStreamEvent(
        {
          type: 'message_start',
          message: {
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-3-5-sonnet-20241022',
            usage: { input_tokens: 100, output_tokens: 0 },
          },
        },
        state,
      );

      const event = {
        type: 'message_delta',
        delta: { stop_reason: 'end_turn', stop_sequence: null },
        usage: { output_tokens: 50 },
      };

      const events = converter.convertStreamEvent(event, state);

      expect(events).toHaveLength(1);
      const finished = events[0] as {
        usage?: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
      };
      expect(finished.usage).toBeDefined();
      expect(finished.usage!.promptTokens).toBe(100);
      expect(finished.usage!.completionTokens).toBe(50);
      expect(finished.usage!.totalTokens).toBe(150);
    });

    it('should not emit events for content_block_start with text type', () => {
      const event = {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'text', text: '' },
      };

      const events = converter.convertStreamEvent(event, state);
      expect(events).toHaveLength(0);
    });

    // ---- Review Issue #2: parallel tool calls ----

    it('should handle parallel tool calls using index-based tracking', () => {
      // Start two tool calls at different indices
      converter.convertStreamEvent(
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'toolu_A',
            name: 'read_file',
            input: {},
          },
        },
        state,
      );

      converter.convertStreamEvent(
        {
          type: 'content_block_start',
          index: 1,
          content_block: {
            type: 'tool_use',
            id: 'toolu_B',
            name: 'write_file',
            input: {},
          },
        },
        state,
      );

      // Send deltas to both indices
      converter.convertStreamEvent(
        {
          type: 'content_block_delta',
          index: 0,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"path": "/tmp/a.txt"}',
          },
        },
        state,
      );

      converter.convertStreamEvent(
        {
          type: 'content_block_delta',
          index: 1,
          delta: {
            type: 'input_json_delta',
            partial_json: '{"path": "/tmp/b.txt",',
          },
        },
        state,
      );

      converter.convertStreamEvent(
        {
          type: 'content_block_delta',
          index: 1,
          delta: {
            type: 'input_json_delta',
            partial_json: ' "content": "hello"}',
          },
        },
        state,
      );

      // Stop index 0 first
      const eventsA = converter.convertStreamEvent(
        { type: 'content_block_stop', index: 0 },
        state,
      );
      expect(eventsA).toHaveLength(1);
      expect(eventsA[0].type).toBe(LlmEventType.ToolCallRequest);
      const toolA = eventsA[0] as {
        callId: string;
        name: string;
        args: Record<string, unknown>;
      };
      expect(toolA.callId).toBe('toolu_A');
      expect(toolA.name).toBe('read_file');
      expect(toolA.args).toEqual({ path: '/tmp/a.txt' });

      // Stop index 1
      const eventsB = converter.convertStreamEvent(
        { type: 'content_block_stop', index: 1 },
        state,
      );
      expect(eventsB).toHaveLength(1);
      expect(eventsB[0].type).toBe(LlmEventType.ToolCallRequest);
      const toolB = eventsB[0] as {
        callId: string;
        name: string;
        args: Record<string, unknown>;
      };
      expect(toolB.callId).toBe('toolu_B');
      expect(toolB.name).toBe('write_file');
      expect(toolB.args).toEqual({ path: '/tmp/b.txt', content: 'hello' });
    });
  });

  // ==============================================================
  // Review Issue #1: toCountTokensRequest
  // ==============================================================

  describe('toCountTokensRequest', () => {
    it('should only include MessageCountTokensParams fields', () => {
      const request: LlmGenerateRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        temperature: 0.7,
        maxTokens: 4096,
        topP: 0.9,
        topK: 40,
        stopSequences: ['END'],
      };

      const result = converter.toCountTokensRequest(request);

      // Should include these fields
      expect(result['model']).toBe('claude-3-5-sonnet-20241022');
      expect(result['messages']).toBeDefined();

      // Should NOT include generation parameters
      expect(result['max_tokens']).toBeUndefined();
      expect(result['temperature']).toBeUndefined();
      expect(result['top_p']).toBeUndefined();
      expect(result['top_k']).toBeUndefined();
      expect(result['stop_sequences']).toBeUndefined();
    });

    it('should include system when present', () => {
      const request: LlmGenerateRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        systemInstruction: 'Be helpful.',
      };

      const result = converter.toCountTokensRequest(request);

      expect(result['system']).toBe('Be helpful.');
    });

    it('should include tools when present', () => {
      const request: LlmGenerateRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        tools: [
          {
            name: 'test_tool',
            description: 'Test',
            parameters: { type: 'object', properties: {} },
          },
        ],
        toolChoice: 'auto',
      };

      const result = converter.toCountTokensRequest(request);

      expect(result['tools']).toBeDefined();
      expect(result['tool_choice']).toBeDefined();
    });
  });

  // ==============================================================
  // Review Issue #3: tool_result isError + object content
  // ==============================================================

  describe('toClaudeContent — tool_result edge cases', () => {
    it('should include is_error when isError is true', () => {
      const result = converter.toClaudeContent([
        {
          type: 'tool_result',
          toolCallId: 'call-1',
          content: 'Error: file not found',
          isError: true,
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]['is_error']).toBe(true);
    });

    it('should not include is_error when isError is false or undefined', () => {
      const result = converter.toClaudeContent([
        {
          type: 'tool_result',
          toolCallId: 'call-1',
          content: 'success',
        },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]['is_error']).toBeUndefined();
    });

    it('should safely handle non-serializable object content for tool_result', () => {
      // Circular reference — JSON.stringify would throw without try/catch
      const circular: Record<string, unknown> = { key: 'value' };
      circular['self'] = circular;

      const result = converter.toClaudeContent([
        {
          type: 'tool_result',
          toolCallId: 'call-1',
          content: circular,
        },
      ]);

      expect(result).toHaveLength(1);
      expect(typeof result[0]['content']).toBe('string');
      // Should produce a fallback string, not throw
      expect(result[0]['content']).toBeTruthy();
    });

    it('should stringify object content for tool_result', () => {
      const result = converter.toClaudeContent([
        {
          type: 'tool_result',
          toolCallId: 'call-1',
          content: { key: 'value', nested: { a: 1 } },
        },
      ]);

      expect(result).toHaveLength(1);
      // Object content should be stringified for Anthropic API
      expect(typeof result[0]['content']).toBe('string');
      const parsed = JSON.parse(result[0]['content'] as string);
      expect(parsed).toEqual({ key: 'value', nested: { a: 1 } });
    });
  });

  // ==============================================================
  // Review Issue #4: URL image handling
  // ==============================================================

  describe('toClaudeContent — URL image handling', () => {
    it('should emit warning text block for URL images', () => {
      const result = converter.toClaudeContent([
        {
          type: 'image',
          source: {
            type: 'url',
            mediaType: 'image/png',
            url: 'https://example.com/image.png',
          },
        },
      ]);

      // URL images should produce a text block with warning rather than being silently dropped
      expect(result).toHaveLength(1);
      expect(result[0]['type']).toBe('text');
      expect((result[0]['text'] as string).toLowerCase()).toContain('url');
    });

    it('should strip query parameters from URL in warning text', () => {
      const result = converter.toClaudeContent([
        {
          type: 'image',
          source: {
            type: 'url',
            mediaType: 'image/jpeg',
            url: 'https://storage.example.com/img.jpg?token=secret123&expires=9999',
          },
        },
      ]);

      expect(result).toHaveLength(1);
      const text = result[0]['text'] as string;
      // Should NOT contain query parameters (potential signed tokens)
      expect(text).not.toContain('token=secret123');
      expect(text).not.toContain('expires=9999');
      // Should still contain the origin+path for debugging
      expect(text).toContain('storage.example.com');
    });
  });

  // ==============================================================
  // M3.1.2 — 메시지 변환 고도화
  // ==============================================================

  describe('M3.1.2: consecutive same-role message merging', () => {
    it('should merge consecutive user messages into one', () => {
      const messages: LlmMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        { role: 'user', content: [{ type: 'text', text: 'How are you?' }] },
      ];

      const result = converter.toClaudeMessages(messages);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]['role']).toBe('user');
      const content = result.messages[0]['content'] as Array<
        Record<string, unknown>
      >;
      expect(content).toHaveLength(2);
      expect(content[0]['text']).toBe('Hello');
      expect(content[1]['text']).toBe('How are you?');
    });

    it('should merge consecutive tool messages (mapped to user) into one', () => {
      const messages: LlmMessage[] = [
        {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              content: 'result-1',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-2',
              content: 'result-2',
            },
          ],
        },
      ];

      const result = converter.toClaudeMessages(messages);

      // Both tool messages map to 'user' — should be merged
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]['role']).toBe('user');
      const content = result.messages[0]['content'] as Array<
        Record<string, unknown>
      >;
      expect(content).toHaveLength(2);
    });

    it('should merge user followed by tool (both user role) into one', () => {
      const messages: LlmMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        {
          role: 'tool',
          content: [
            {
              type: 'tool_result',
              toolCallId: 'call-1',
              content: 'result',
            },
          ],
        },
      ];

      const result = converter.toClaudeMessages(messages);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]['role']).toBe('user');
    });

    it('should not merge messages with different roles', () => {
      const messages: LlmMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hi there' }],
        },
        { role: 'user', content: [{ type: 'text', text: 'Thanks' }] },
      ];

      const result = converter.toClaudeMessages(messages);

      expect(result.messages).toHaveLength(3);
    });

    it('should merge consecutive assistant messages into one', () => {
      const messages: LlmMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Let me think.' }],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_call',
              id: 'call-1',
              name: 'read_file',
              arguments: { path: '/tmp/a.txt' },
            },
          ],
        },
      ];

      const result = converter.toClaudeMessages(messages);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]['role']).toBe('assistant');
      const content = result.messages[0]['content'] as Array<
        Record<string, unknown>
      >;
      expect(content).toHaveLength(2);
    });
  });

  describe('M3.1.2: empty text content filtering', () => {
    it('should filter out empty text content blocks', () => {
      const result = converter.toClaudeContent([
        { type: 'text', text: '' },
        { type: 'text', text: 'Hello' },
      ]);

      expect(result).toHaveLength(1);
      expect(result[0]['text']).toBe('Hello');
    });

    it('should return empty array when all text blocks are empty', () => {
      const result = converter.toClaudeContent([{ type: 'text', text: '' }]);

      expect(result).toHaveLength(0);
    });
  });

  describe('M3.1.2: RedactedThinkingBlock handling', () => {
    it('should convert redacted_thinking block to thought with redacted marker', () => {
      const response = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'redacted_thinking', data: 'abc123encoded' },
          { type: 'text', text: 'The answer is 42.' },
        ],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 20 },
      };

      const result = converter.fromClaudeResponse(
        response,
        'claude-3-5-sonnet-20241022',
      );

      expect(result.content).toHaveLength(2);
      expect(result.content[0].type).toBe('thought');
      const thought = result.content[0] as {
        thought: string;
        metadata?: Record<string, unknown>;
      };
      expect(thought.metadata?.['redacted']).toBe(true);
      expect(result.content[1].type).toBe('text');
    });
  });

  describe('M3.1.2: extractUsage cache_creation_input_tokens', () => {
    it('should include cache_creation_input_tokens in usage', () => {
      const response = {
        id: 'msg_cache',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'ok' }],
        model: 'claude-3-5-sonnet-20241022',
        stop_reason: 'end_turn',
        usage: {
          input_tokens: 100,
          output_tokens: 10,
          cache_read_input_tokens: 50,
          cache_creation_input_tokens: 80,
        },
      };

      const result = converter.fromClaudeResponse(
        response,
        'claude-3-5-sonnet-20241022',
      );

      expect(result.usage!.cachedTokens).toBe(50);
      // Review #1: cacheCreationTokens should be a typed field on LlmTokenUsage
      expect(result.usage!.cacheCreationTokens).toBe(80);
    });
  });

  describe('M3.1.3: stream Finished event cache tokens', () => {
    it('should include cache tokens in Finished event usage', () => {
      const state = converter.createStreamState();

      // Capture input_tokens from message_start
      converter.convertStreamEvent(
        {
          type: 'message_start',
          message: {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-3-5-sonnet-20241022',
            usage: { input_tokens: 100, output_tokens: 0 },
          },
        },
        state,
      );

      // message_delta with cache usage
      const events = converter.convertStreamEvent(
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: {
            output_tokens: 50,
            cache_read_input_tokens: 30,
            cache_creation_input_tokens: 20,
          },
        },
        state,
      );

      expect(events).toHaveLength(1);
      const finished = events[0] as {
        usage: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
          cachedTokens: number;
          cacheCreationTokens: number;
        };
      };
      expect(finished.usage.cachedTokens).toBe(30);
      expect(finished.usage.cacheCreationTokens).toBe(20);
    });
  });

  describe('M3.1.2 review: empty text + consecutive role merge interaction', () => {
    it('should merge around skipped empty-text messages', () => {
      const messages: LlmMessage[] = [
        { role: 'user', content: [{ type: 'text', text: 'A' }] },
        { role: 'user', content: [{ type: 'text', text: '' }] },
        { role: 'user', content: [{ type: 'text', text: 'B' }] },
      ];

      const result = converter.toClaudeMessages(messages);

      // Empty-text user message is skipped, A and B should merge into one user message
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]['role']).toBe('user');
      const content = result.messages[0]['content'] as Array<
        Record<string, unknown>
      >;
      expect(content).toHaveLength(2);
      expect(content[0]['text']).toBe('A');
      expect(content[1]['text']).toBe('B');
    });
  });

  describe('M3.1.2: toClaudeRequest/toCountTokensRequest DRY', () => {
    it('should produce consistent system handling between both methods', () => {
      const request: LlmGenerateRequest = {
        model: 'claude-3-5-sonnet-20241022',
        messages: [
          {
            role: 'system',
            content: [{ type: 'text', text: 'System from messages' }],
          },
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        systemInstruction: 'Top-level instruction',
      };

      const createParams = converter.toClaudeRequest(request);
      const countParams = converter.toCountTokensRequest(request);

      // Both should produce the same system value
      expect(createParams['system']).toBe(countParams['system']);
    });
  });
});
