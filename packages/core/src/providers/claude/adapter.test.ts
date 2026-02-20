/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for ClaudeAdapter — extends BaseAdapter to wrap Anthropic SDK.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.4
 * @see packages/core/src/providers/gemini/geminiAdapter.test.ts (Gemini counterpart)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClaudeAdapter } from './adapter.js';
import type { ClaudeClient } from './adapter.js';
import type { LlmGenerateRequest, AdapterConfig } from '../types.js';
import { LlmEventType } from '../events.js';
import {
  LlmError,
  LlmErrorType,
  AuthenticationError,
  RateLimitError,
  NetworkError,
  TimeoutError,
  ModelNotFoundError,
  ValidationError,
} from '../errors.js';

// =================================================================
// Test helpers
// =================================================================

function createBasicRequest(
  overrides?: Partial<LlmGenerateRequest>,
): LlmGenerateRequest {
  return {
    model: 'claude-3-5-sonnet-20241022',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    ...overrides,
  };
}

function createMockClient(): ClaudeClient & {
  messages: {
    create: ReturnType<typeof vi.fn>;
    countTokens: ReturnType<typeof vi.fn>;
  };
} {
  return {
    messages: {
      create: vi.fn(),
      countTokens: vi.fn(),
    },
  };
}

function createAdapterConfig(
  overrides?: Partial<AdapterConfig>,
): AdapterConfig {
  return {
    apiKey: 'test-api-key',
    ...overrides,
  };
}

/** Create a mock Anthropic Message response. */
function createMockResponse(overrides?: Record<string, unknown>) {
  return {
    id: 'msg_test123',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: 'Hello!' }],
    model: 'claude-3-5-sonnet-20241022',
    stop_reason: 'end_turn',
    usage: { input_tokens: 10, output_tokens: 5 },
    ...overrides,
  };
}

// =================================================================
// Tests
// =================================================================

describe('ClaudeAdapter', () => {
  let mockClient: ReturnType<typeof createMockClient>;
  let adapter: ClaudeAdapter;

  beforeEach(() => {
    mockClient = createMockClient();
    adapter = new ClaudeAdapter(createAdapterConfig(), mockClient);
  });

  // ==============================================================
  // 3.1.1.1 & 3.1.1.2 — Class structure & BaseAdapter inheritance
  // ==============================================================

  describe('class structure', () => {
    it('should have providerName "claude"', () => {
      expect(adapter.providerName).toBe('claude');
    });

    it('should implement capabilities', () => {
      const caps = adapter.capabilities;
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsToolCalls).toBe(true);
      expect(caps.supportsImageInput).toBe(true);
      expect(caps.supportsSystemMessage).toBe(true);
      expect(caps.supportsTokenCount).toBe(true);
      expect(caps.supportsThought).toBe(true);
    });

    it('should validate config on construction', () => {
      expect(
        () => new ClaudeAdapter(null as unknown as AdapterConfig, mockClient),
      ).toThrow();
    });
  });

  // ==============================================================
  // 3.1.1.3 & 3.1.1.4 — generateContent
  // ==============================================================

  describe('generateContent', () => {
    it('should call client.messages.create with converted request', async () => {
      mockClient.messages.create.mockResolvedValue(createMockResponse());

      const request = createBasicRequest();
      const result = await adapter.generateContent(request, 'prompt-1');

      expect(mockClient.messages.create).toHaveBeenCalledTimes(1);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello!' });
      expect(result.stopReason).toBe('end_turn');
      expect(result.usage!.promptTokens).toBe(10);
      expect(result.usage!.completionTokens).toBe(5);
    });

    it('should validate request (missing model)', async () => {
      const request = createBasicRequest({ model: '' });

      await expect(
        adapter.generateContent(request, 'prompt-1'),
      ).rejects.toThrow();
    });

    it('should validate request (empty messages)', async () => {
      const request = createBasicRequest({ messages: [] });

      await expect(
        adapter.generateContent(request, 'prompt-1'),
      ).rejects.toThrow();
    });

    it('should pass system instruction in request', async () => {
      mockClient.messages.create.mockResolvedValue(createMockResponse());

      const request = createBasicRequest({
        systemInstruction: 'Be helpful.',
      });

      await adapter.generateContent(request, 'prompt-1');

      const callArgs = mockClient.messages.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(callArgs['system']).toBeDefined();
    });

    it('should pass tools in request', async () => {
      mockClient.messages.create.mockResolvedValue(createMockResponse());

      const request = createBasicRequest({
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            parameters: {
              type: 'object',
              properties: { q: { type: 'string' } },
            },
          },
        ],
      });

      await adapter.generateContent(request, 'prompt-1');

      const callArgs = mockClient.messages.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(callArgs['tools']).toBeDefined();
    });

    it('should convert tool_use response correctly', async () => {
      mockClient.messages.create.mockResolvedValue(
        createMockResponse({
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'read_file',
              input: { path: '/tmp/test.txt' },
            },
          ],
          stop_reason: 'tool_use',
        }),
      );

      const request = createBasicRequest();
      const result = await adapter.generateContent(request, 'prompt-1');

      expect(result.content[0].type).toBe('tool_call');
      expect(result.stopReason).toBe('tool_use');
    });

    it('should handle SDK errors gracefully', async () => {
      mockClient.messages.create.mockRejectedValue(
        new Error('API quota exceeded'),
      );

      const request = createBasicRequest();

      await expect(
        adapter.generateContent(request, 'prompt-1'),
      ).rejects.toThrow();
    });

    it('should throw classified error from generateContent (not UNKNOWN)', async () => {
      const sdkError = Object.assign(new Error('Rate limited'), {
        status: 429,
      });
      mockClient.messages.create.mockRejectedValue(sdkError);

      const request = createBasicRequest();

      try {
        await adapter.generateContent(request, 'prompt-1');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const llmError = error as LlmError;
        expect(llmError.type).toBe(LlmErrorType.RATE_LIMIT);
        expect(llmError.isRetryable).toBe(true);
      }
    });
  });

  // ==============================================================
  // 3.1.1.5 — generateContentStream
  // ==============================================================

  describe('generateContentStream', () => {
    it('should return an async generator of LlmEvents', async () => {
      // Mock stream that yields Anthropic stream events
      const mockStreamEvents = [
        {
          type: 'message_start',
          message: {
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-3-5-sonnet-20241022',
            usage: { input_tokens: 10, output_tokens: 0 },
          },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hello' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: ' world' },
        },
        {
          type: 'content_block_stop',
          index: 0,
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 5 },
        },
        { type: 'message_stop' },
      ];

      async function* mockStream() {
        for (const event of mockStreamEvents) {
          yield event;
        }
      }

      mockClient.messages.create.mockResolvedValue(mockStream());

      const request = createBasicRequest();
      const stream = adapter.generateContentStream(request, 'prompt-1');

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      // Should have TextDelta, Finished, and MessageEnd events
      expect(events.length).toBeGreaterThan(0);
      const textEvents = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textEvents).toHaveLength(2);
      expect((textEvents[0] as { text: string }).text).toBe('Hello');
      expect((textEvents[1] as { text: string }).text).toBe(' world');

      const finishedEvents = events.filter(
        (e) => e.type === LlmEventType.Finished,
      );
      expect(finishedEvents).toHaveLength(1);
    });

    it('should handle tool call streaming', async () => {
      const mockStreamEvents = [
        {
          type: 'message_start',
          message: {
            id: 'msg_456',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-3-5-sonnet-20241022',
            usage: { input_tokens: 20, output_tokens: 0 },
          },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'read_file',
            input: {},
          },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '{"path":' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'input_json_delta', partial_json: '"/tmp/test.txt"}' },
        },
        {
          type: 'content_block_stop',
          index: 0,
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'tool_use', stop_sequence: null },
          usage: { output_tokens: 30 },
        },
        { type: 'message_stop' },
      ];

      async function* mockStream() {
        for (const event of mockStreamEvents) {
          yield event;
        }
      }

      mockClient.messages.create.mockResolvedValue(mockStream());

      const request = createBasicRequest();
      const stream = adapter.generateContentStream(request, 'prompt-1');

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      const toolCallEvents = events.filter(
        (e) => e.type === LlmEventType.ToolCallRequest,
      );
      expect(toolCallEvents).toHaveLength(1);
      const toolCall = toolCallEvents[0] as {
        callId: string;
        name: string;
        args: Record<string, unknown>;
      };
      expect(toolCall.callId).toBe('toolu_1');
      expect(toolCall.name).toBe('read_file');
      expect(toolCall.args).toEqual({ path: '/tmp/test.txt' });
    });

    it('should include stream: true in SDK call', async () => {
      async function* emptyStream() {
        yield { type: 'message_stop' };
      }

      mockClient.messages.create.mockResolvedValue(emptyStream());

      const request = createBasicRequest();
      const stream = adapter.generateContentStream(request, 'prompt-1');

      // Consume stream to trigger the SDK call
      for await (const _event of stream) {
        // consume
      }

      const callArgs = mockClient.messages.create.mock.calls[0][0] as Record<
        string,
        unknown
      >;
      expect(callArgs['stream']).toBe(true);
    });

    it('should yield LlmErrorEvent on stream creation errors', async () => {
      mockClient.messages.create.mockRejectedValue(
        new Error('Network timeout'),
      );

      const request = createBasicRequest();
      const stream = adapter.generateContentStream(request, 'prompt-1');

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LlmEventType.Error);
      const errorEvent = events[0] as unknown as {
        error: LlmError;
        isRetryable: boolean;
      };
      expect(errorEvent.error).toBeInstanceOf(LlmError);
      expect(errorEvent.error.type).toBe(LlmErrorType.TIMEOUT);
    });

    it('should yield LlmErrorEvent on stream iteration errors', async () => {
      async function* failingStream() {
        yield {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'partial' },
        };
        throw new Error('Stream interrupted');
      }

      mockClient.messages.create.mockResolvedValue(failingStream());

      const request = createBasicRequest();
      const stream = adapter.generateContentStream(request, 'prompt-1');

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      // Should have TextDelta + Error events (not thrown)
      const errorEvents = events.filter((e) => e.type === LlmEventType.Error);
      expect(errorEvents).toHaveLength(1);
      const textEvents = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textEvents).toHaveLength(1);
    });

    it('should validate request before streaming', () => {
      const request = createBasicRequest({ model: '' });

      expect(() => {
        adapter.generateContentStream(request, 'prompt-1');
      }).toThrow();
    });
  });

  // ==============================================================
  // 3.1.1.6 — capabilities
  // ==============================================================

  describe('capabilities', () => {
    it('should report all expected capabilities', () => {
      const caps = adapter.capabilities;

      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsToolCalls).toBe(true);
      expect(caps.supportsImageInput).toBe(true);
      expect(caps.supportsImageGeneration).toBe(false);
      expect(caps.supportsEmbedding).toBe(false);
      expect(caps.supportsTokenCount).toBe(true);
      expect(caps.supportsSystemMessage).toBe(true);
      expect(caps.supportsThought).toBe(true);
      expect(caps.maxContextLength).toBeGreaterThan(0);
      expect(caps.maxOutputTokens).toBeGreaterThan(0);
    });
  });

  // ==============================================================
  // 3.1.1.7 — config validation
  // ==============================================================

  describe('config validation', () => {
    it('should accept config with apiKey', () => {
      expect(
        () => new ClaudeAdapter({ apiKey: 'key' }, mockClient),
      ).not.toThrow();
    });

    it('should accept config without apiKey', () => {
      expect(() => new ClaudeAdapter({}, mockClient)).not.toThrow();
    });
  });

  // ==============================================================
  // countTokens
  // ==============================================================

  describe('countTokens', () => {
    it('should delegate to client.messages.countTokens', async () => {
      mockClient.messages.countTokens.mockResolvedValue({
        input_tokens: 42,
      });

      const request = createBasicRequest();
      const result = await adapter.countTokens(request);

      expect(result.totalTokens).toBe(42);
      expect(mockClient.messages.countTokens).toHaveBeenCalledTimes(1);
    });

    it('should not pass generation parameters to countTokens', async () => {
      mockClient.messages.countTokens.mockResolvedValue({
        input_tokens: 42,
      });

      const request = createBasicRequest({
        temperature: 0.7,
        maxTokens: 4096,
        topP: 0.9,
        topK: 40,
        stopSequences: ['END'],
      });

      await adapter.countTokens(request);

      const callArgs = mockClient.messages.countTokens.mock
        .calls[0][0] as Record<string, unknown>;
      // MessageCountTokensParams does NOT include these
      expect(callArgs['max_tokens']).toBeUndefined();
      expect(callArgs['temperature']).toBeUndefined();
      expect(callArgs['top_p']).toBeUndefined();
      expect(callArgs['top_k']).toBeUndefined();
      expect(callArgs['stop_sequences']).toBeUndefined();
    });
  });

  // ==============================================================
  // M3.1.3 — classifyError: Anthropic SDK error → LlmError
  // ==============================================================

  describe('classifyError (via stream error events)', () => {
    it('should classify 401 as AuthenticationError', async () => {
      const sdkError = Object.assign(new Error('Invalid API key'), {
        status: 401,
      });
      mockClient.messages.create.mockRejectedValue(sdkError);

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError };
      expect(errorEvent).toBeDefined();
      expect(errorEvent.error.type).toBe(LlmErrorType.AUTHENTICATION);
      expect(errorEvent.error.isRetryable).toBe(false);
    });

    it('should classify 429 as RateLimitError (retryable)', async () => {
      const sdkError = Object.assign(new Error('Rate limited'), {
        status: 429,
      });
      mockClient.messages.create.mockRejectedValue(sdkError);

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError; isRetryable: boolean };
      expect(errorEvent.error.type).toBe(LlmErrorType.RATE_LIMIT);
      expect(errorEvent.isRetryable).toBe(true);
    });

    it('should classify 500+ as ServerError (retryable)', async () => {
      const sdkError = Object.assign(new Error('Internal server error'), {
        status: 500,
      });
      mockClient.messages.create.mockRejectedValue(sdkError);

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError; isRetryable: boolean };
      expect(errorEvent.error.type).toBe(LlmErrorType.SERVER_ERROR);
      expect(errorEvent.isRetryable).toBe(true);
    });

    it('should classify 529 as ModelOverloaded (retryable)', async () => {
      const sdkError = Object.assign(new Error('Overloaded'), {
        status: 529,
      });
      mockClient.messages.create.mockRejectedValue(sdkError);

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError; isRetryable: boolean };
      expect(errorEvent.error.type).toBe(LlmErrorType.MODEL_OVERLOADED);
      expect(errorEvent.isRetryable).toBe(true);
    });

    it('should classify no-status error with timeout keyword as TimeoutError', async () => {
      mockClient.messages.create.mockRejectedValue(
        new Error('Connection timeout'),
      );

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError };
      expect(errorEvent.error.type).toBe(LlmErrorType.TIMEOUT);
    });

    it('should classify no-status error as NetworkError', async () => {
      mockClient.messages.create.mockRejectedValue(new Error('ECONNREFUSED'));

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError };
      expect(errorEvent.error.type).toBe(LlmErrorType.NETWORK);
    });

    // Review #1: 400/404 status code coverage
    it('should classify 400 as INVALID_REQUEST (non-retryable)', async () => {
      const sdkError = Object.assign(new Error('Invalid request body'), {
        status: 400,
      });
      mockClient.messages.create.mockRejectedValue(sdkError);

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError; isRetryable: boolean };
      expect(errorEvent.error.type).toBe(LlmErrorType.INVALID_REQUEST);
      expect(errorEvent.isRetryable).toBe(false);
    });

    it('should classify 404 as MODEL_NOT_FOUND (non-retryable)', async () => {
      const sdkError = Object.assign(new Error('Model not found'), {
        status: 404,
      });
      mockClient.messages.create.mockRejectedValue(sdkError);

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError; isRetryable: boolean };
      expect(errorEvent.error.type).toBe(LlmErrorType.MODEL_NOT_FOUND);
      expect(errorEvent.isRetryable).toBe(false);
    });

    // Review #3: subclass instanceof verification
    it('should return proper error subclass instances', async () => {
      const sdkError = Object.assign(new Error('Auth failed'), {
        status: 401,
      });
      mockClient.messages.create.mockRejectedValue(sdkError);

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError };
      expect(errorEvent.error).toBeInstanceOf(AuthenticationError);
      expect(errorEvent.error.name).toBe('AuthenticationError');
    });

    it('should return NetworkError subclass for no-status errors', async () => {
      mockClient.messages.create.mockRejectedValue(new Error('ECONNREFUSED'));

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError };
      expect(errorEvent.error).toBeInstanceOf(NetworkError);
    });

    it('should return TimeoutError subclass for timeout keyword', async () => {
      mockClient.messages.create.mockRejectedValue(
        new Error('Connection timeout'),
      );

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError };
      expect(errorEvent.error).toBeInstanceOf(TimeoutError);
    });

    it('should return RateLimitError subclass for 429', async () => {
      const sdkError = Object.assign(new Error('Rate limited'), {
        status: 429,
      });
      mockClient.messages.create.mockRejectedValue(sdkError);

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError };
      expect(errorEvent.error).toBeInstanceOf(RateLimitError);
    });

    it('should return ModelNotFoundError subclass for 404', async () => {
      const sdkError = Object.assign(new Error('Not found'), {
        status: 404,
      });
      mockClient.messages.create.mockRejectedValue(sdkError);

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError };
      expect(errorEvent.error).toBeInstanceOf(ModelNotFoundError);
    });

    // Review: LlmError passthrough — should not re-classify
    it('should preserve existing LlmError without re-classification (stream)', async () => {
      const original = new ValidationError('Missing required field', {
        provider: 'claude',
      });
      mockClient.messages.create.mockRejectedValue(original);

      const request = createBasicRequest();
      const events = [];
      for await (const event of adapter.generateContentStream(
        request,
        'prompt-1',
      )) {
        events.push(event);
      }

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as unknown as { error: LlmError };
      // Should be the original ValidationError, not re-classified as NetworkError
      expect(errorEvent.error).toBeInstanceOf(ValidationError);
      expect(errorEvent.error.type).toBe(LlmErrorType.VALIDATION);
      expect(errorEvent.error.isRetryable).toBe(false);
    });

    it('should preserve existing LlmError without re-classification (non-stream)', async () => {
      const original = new RateLimitError('Too many requests', {
        provider: 'claude',
        retryAfterMs: 5000,
      });
      mockClient.messages.create.mockRejectedValue(original);

      const request = createBasicRequest();

      try {
        await adapter.generateContent(request, 'prompt-1');
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBe(original); // exact same instance
        expect(error).toBeInstanceOf(RateLimitError);
      }
    });
  });

  // ==============================================================
  // Phase 3 RED-1: rate-limit header extraction
  // ==============================================================

  describe('rate-limit header extraction', () => {
    it('should include rateLimits in MessageEnd event from response headers (stream)', async () => {
      // Arrange: mock SDK stream response with .withResponse()
      const mockStreamEvents = [
        {
          type: 'message_start',
          message: {
            id: 'msg_rl_1',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-3-5-sonnet-20241022',
            usage: { input_tokens: 10, output_tokens: 0 },
          },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hello' },
        },
        {
          type: 'content_block_stop',
          index: 0,
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 5 },
        },
        { type: 'message_stop' },
      ];

      async function* mockStream() {
        for (const event of mockStreamEvents) {
          yield event;
        }
      }

      // SDK's .withResponse() pattern: returns { data, response }
      const streamInstance = mockStream();
      const mockResponse = {
        headers: new Map([
          ['anthropic-ratelimit-requests-limit', '100'],
          ['anthropic-ratelimit-requests-remaining', '50'],
          ['anthropic-ratelimit-tokens-limit', '100000'],
          ['anthropic-ratelimit-tokens-remaining', '80000'],
          ['anthropic-ratelimit-requests-reset', '2026-02-21T12:00:00Z'],
        ]),
      };
      // Mock: create returns a promise that resolves to the stream
      // but the stream object also has .withResponse() which returns { data, response }
      const streamWithResponse = Object.assign(
        Promise.resolve(streamInstance),
        {
          withResponse: () =>
            Promise.resolve({
              data: streamInstance,
              response: mockResponse,
            }),
        },
      );
      mockClient.messages.create.mockReturnValue(streamWithResponse);

      const request = createBasicRequest();
      const stream = adapter.generateContentStream(request, 'prompt-1');

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      // Find MessageEnd event
      const messageEnd = events.find((e) => e.type === LlmEventType.MessageEnd);
      expect(messageEnd).toBeDefined();

      // RED: adapter does not extract headers yet → rateLimits will be undefined
      const rateLimits = (messageEnd as unknown as Record<string, unknown>)?.[
        'rateLimits'
      ] as
        | {
            requestsLimit?: number;
            requestsRemaining?: number;
            tokensLimit?: number;
            tokensRemaining?: number;
          }
        | undefined;

      expect(rateLimits).toBeDefined();
      expect(rateLimits?.requestsLimit).toBe(100);
      expect(rateLimits?.requestsRemaining).toBe(50);
      expect(rateLimits?.tokensLimit).toBe(100000);
      expect(rateLimits?.tokensRemaining).toBe(80000);
    });

    it('should yield MessageEnd without rateLimits when headers absent (stream)', async () => {
      const mockStreamEvents = [
        {
          type: 'message_start',
          message: {
            id: 'msg_rl_2',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-3-5-sonnet-20241022',
            usage: { input_tokens: 10, output_tokens: 0 },
          },
        },
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Hi' },
        },
        {
          type: 'content_block_stop',
          index: 0,
        },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn', stop_sequence: null },
          usage: { output_tokens: 3 },
        },
        { type: 'message_stop' },
      ];

      async function* mockStream() {
        for (const event of mockStreamEvents) {
          yield event;
        }
      }

      mockClient.messages.create.mockResolvedValue(mockStream());

      const request = createBasicRequest();
      const stream = adapter.generateContentStream(request, 'prompt-1');

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      const messageEnd = events.find((e) => e.type === LlmEventType.MessageEnd);
      expect(messageEnd).toBeDefined();

      // Without .withResponse(), rateLimits should be undefined
      const rateLimits = (messageEnd as unknown as Record<string, unknown>)?.[
        'rateLimits'
      ];
      expect(rateLimits).toBeUndefined();
    });

    it('should include rateLimits in generateContent response (non-stream)', async () => {
      // Arrange: mock non-streaming response with .withResponse()
      const mockMsg = createMockResponse();
      const mockResponse = {
        headers: new Map([
          ['anthropic-ratelimit-requests-limit', '100'],
          ['anthropic-ratelimit-requests-remaining', '45'],
          ['anthropic-ratelimit-tokens-limit', '50000'],
          ['anthropic-ratelimit-tokens-remaining', '40000'],
        ]),
      };
      const promiseWithResponse = Object.assign(Promise.resolve(mockMsg), {
        withResponse: () =>
          Promise.resolve({
            data: mockMsg,
            response: mockResponse,
          }),
      });
      mockClient.messages.create.mockReturnValue(promiseWithResponse);

      const request = createBasicRequest();
      const result = await adapter.generateContent(request, 'prompt-1');

      // RED: adapter does not extract headers yet → rateLimits will be undefined
      const rateLimits = (result as unknown as Record<string, unknown>)?.[
        'rateLimits'
      ] as
        | {
            requestsLimit?: number;
            requestsRemaining?: number;
          }
        | undefined;

      expect(rateLimits).toBeDefined();
      expect(rateLimits?.requestsLimit).toBe(100);
      expect(rateLimits?.requestsRemaining).toBe(45);
    });
  });
});
