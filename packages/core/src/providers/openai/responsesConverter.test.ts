/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for OpenAiResponsesConverter — converts between Llm* types
 * and OpenAI Responses API format.
 */

import { describe, it, expect } from 'vitest';
import { OpenAiResponsesConverter } from './responsesConverter.js';
import type { LlmGenerateRequest } from '../types.js';
import { LlmEventType } from '../events.js';

describe('OpenAiResponsesConverter', () => {
  const converter = new OpenAiResponsesConverter();

  // ==========================================================================
  // Request Conversion
  // ==========================================================================

  describe('toResponsesRequest', () => {
    it('should convert a basic request with input array', () => {
      const request: LlmGenerateRequest = {
        model: 'gpt-5.3-codex',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      };

      const result = converter.toResponsesRequest(request);
      expect(result['model']).toBe('gpt-5.3-codex');
      expect(result['input']).toEqual([{ role: 'user', content: 'Hello' }]);
    });

    it('should map systemInstruction to developer role', () => {
      const request: LlmGenerateRequest = {
        model: 'gpt-5.3-codex',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        systemInstruction: 'You are helpful.',
      };

      const result = converter.toResponsesRequest(request);
      const input = result['input'] as Array<Record<string, unknown>>;
      expect(input[0]).toEqual({
        role: 'developer',
        content: 'You are helpful.',
      });
      expect(input[1]).toEqual({ role: 'user', content: 'Hi' });
    });

    it('should map system message in messages to developer role', () => {
      const request: LlmGenerateRequest = {
        model: 'gpt-5.3-codex',
        messages: [
          {
            role: 'system',
            content: [{ type: 'text', text: 'System msg' }],
          },
          { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
        ],
      };

      const result = converter.toResponsesRequest(request);
      const input = result['input'] as Array<Record<string, unknown>>;
      expect(input[0]).toEqual({ role: 'developer', content: 'System msg' });
    });

    it('should include max_output_tokens instead of max_completion_tokens', () => {
      const request: LlmGenerateRequest = {
        model: 'gpt-5.3-codex',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        maxTokens: 4096,
      };

      const result = converter.toResponsesRequest(request);
      expect(result['max_output_tokens']).toBe(4096);
      expect(result['max_completion_tokens']).toBeUndefined();
    });

    it('should convert tools to flat Responses API format (not nested Chat Completions format)', () => {
      const request: LlmGenerateRequest = {
        model: 'gpt-5.3-codex',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        tools: [
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
        ],
      };

      const result = converter.toResponsesRequest(request);
      const tools = result['tools'] as Array<Record<string, unknown>>;
      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        type: 'function',
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
      // Verify NOT nested under 'function' key (Chat Completions format)
      expect(tools[0]['function']).toBeUndefined();
    });

    it('should convert tool result message to function_call_output', () => {
      const request: LlmGenerateRequest = {
        model: 'gpt-5.3-codex',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hi' }] },
          {
            role: 'tool',
            content: [
              {
                type: 'tool_result',
                toolCallId: 'call_123',
                content: 'file contents here',
              },
            ],
          },
        ],
      };

      const result = converter.toResponsesRequest(request);
      const input = result['input'] as Array<Record<string, unknown>>;
      const toolMsg = input.find((m) => m['type'] === 'function_call_output');
      expect(toolMsg).toEqual({
        type: 'function_call_output',
        call_id: 'call_123',
        output: 'file contents here',
      });
    });
  });

  // ==========================================================================
  // Response Conversion
  // ==========================================================================

  describe('fromResponsesResponse', () => {
    it('should convert a text response', () => {
      const response = {
        id: 'resp_123',
        model: 'gpt-5.3-codex',
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Hello world!' }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };

      const result = converter.fromResponsesResponse(response, 'gpt-5.3-codex');
      expect(result.id).toBe('resp_123');
      expect(result.content).toEqual([{ type: 'text', text: 'Hello world!' }]);
      expect(result.stopReason).toBe('end_turn');
      expect(result.usage?.promptTokens).toBe(10);
      expect(result.usage?.completionTokens).toBe(5);
      expect(result.usage?.totalTokens).toBe(15);
    });

    it('should convert a function_call response', () => {
      const response = {
        id: 'resp_456',
        model: 'gpt-5.3-codex',
        status: 'completed',
        output: [
          {
            type: 'function_call',
            name: 'read_file',
            arguments: '{"path": "/tmp/test.txt"}',
            call_id: 'call_abc',
          },
        ],
        usage: { input_tokens: 15, output_tokens: 8, total_tokens: 23 },
      };

      const result = converter.fromResponsesResponse(response, 'gpt-5.3-codex');
      expect(result.content).toEqual([
        {
          type: 'tool_call',
          id: 'call_abc',
          name: 'read_file',
          arguments: { path: '/tmp/test.txt' },
        },
      ]);
      expect(result.stopReason).toBe('tool_use');
    });

    it('should map incomplete status to max_tokens', () => {
      const response = {
        id: 'resp_789',
        model: 'gpt-5.3-codex',
        status: 'incomplete',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'partial...' }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 100, total_tokens: 110 },
      };

      const result = converter.fromResponsesResponse(response, 'gpt-5.3-codex');
      expect(result.stopReason).toBe('max_tokens');
    });

    it('should extract cached tokens from input_tokens_details', () => {
      const response = {
        id: 'resp_cached',
        model: 'gpt-5.3-codex',
        status: 'completed',
        output: [
          {
            type: 'message',
            content: [{ type: 'output_text', text: 'Hi' }],
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 10,
          total_tokens: 110,
          input_tokens_details: { cached_tokens: 50 },
        },
      };

      const result = converter.fromResponsesResponse(response, 'gpt-5.3-codex');
      expect(result.usage?.cachedTokens).toBe(50);
    });
  });

  // ==========================================================================
  // Stream Event Conversion
  // ==========================================================================

  describe('convertStreamEvent', () => {
    it('should convert response.output_text.delta to TextDelta', () => {
      const state = converter.createStreamState();
      const events = converter.convertStreamEvent(
        { type: 'response.output_text.delta', delta: 'Hello' },
        state,
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LlmEventType.TextDelta);
      if (events[0].type === LlmEventType.TextDelta) {
        expect(events[0].text).toBe('Hello');
      }
    });

    it('should handle response.function_call_arguments.done', () => {
      const state = converter.createStreamState();

      // First: output_item.added
      converter.convertStreamEvent(
        {
          type: 'response.output_item.added',
          item: {
            type: 'function_call',
            id: 'item_1',
            call_id: 'call_xyz',
            name: 'read_file',
            arguments: '',
          },
        },
        state,
      );

      // Then: function_call_arguments.done
      const events = converter.convertStreamEvent(
        {
          type: 'response.function_call_arguments.done',
          item_id: 'item_1',
          item: {
            name: 'read_file',
            arguments: '{"path": "/tmp/test"}',
            call_id: 'call_xyz',
          },
        },
        state,
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LlmEventType.ToolCallRequest);
      if (events[0].type === LlmEventType.ToolCallRequest) {
        expect(events[0].name).toBe('read_file');
        expect(events[0].callId).toBe('call_xyz');
        expect(events[0].args).toEqual({ path: '/tmp/test' });
      }
    });

    it('should handle response.completed with usage', () => {
      const state = converter.createStreamState();
      const events = converter.convertStreamEvent(
        {
          type: 'response.completed',
          response: {
            output: [],
            usage: {
              input_tokens: 20,
              output_tokens: 10,
              total_tokens: 30,
            },
          },
        },
        state,
      );

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(LlmEventType.Finished);
      expect(events[1].type).toBe(LlmEventType.MessageEnd);

      if (events[1].type === LlmEventType.MessageEnd) {
        expect(events[1].usage?.promptTokens).toBe(20);
        expect(events[1].usage?.completionTokens).toBe(10);
      }
    });

    it('should set tool_use finish reason when output has function_call', () => {
      const state = converter.createStreamState();
      const events = converter.convertStreamEvent(
        {
          type: 'response.completed',
          response: {
            output: [{ type: 'function_call' }],
            usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
          },
        },
        state,
      );

      const finished = events.find((e) => e.type === LlmEventType.Finished);
      expect(finished).toBeDefined();
      if (finished && finished.type === LlmEventType.Finished) {
        expect(finished.finishReason).toBe('tool_use');
      }
    });

    it('should ignore unknown event types', () => {
      const state = converter.createStreamState();
      const events = converter.convertStreamEvent(
        { type: 'response.created' },
        state,
      );
      expect(events).toHaveLength(0);
    });

    it('should accumulate function call arguments across delta events', () => {
      const state = converter.createStreamState();

      // Added
      converter.convertStreamEvent(
        {
          type: 'response.output_item.added',
          item: {
            type: 'function_call',
            id: 'item_2',
            call_id: 'call_def',
            name: 'write_file',
            arguments: '',
          },
        },
        state,
      );

      // Delta 1
      converter.convertStreamEvent(
        {
          type: 'response.function_call_arguments.delta',
          item_id: 'item_2',
          delta: '{"content":',
        },
        state,
      );

      // Delta 2
      converter.convertStreamEvent(
        {
          type: 'response.function_call_arguments.delta',
          item_id: 'item_2',
          delta: ' "hello"}',
        },
        state,
      );

      // Done — should use item from done event
      const events = converter.convertStreamEvent(
        {
          type: 'response.function_call_arguments.done',
          item_id: 'item_2',
          item: {
            name: 'write_file',
            arguments: '{"content": "hello"}',
            call_id: 'call_def',
          },
        },
        state,
      );

      expect(events).toHaveLength(1);
      if (events[0].type === LlmEventType.ToolCallRequest) {
        expect(events[0].args).toEqual({ content: 'hello' });
      }
    });
  });
});
