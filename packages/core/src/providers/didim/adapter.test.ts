/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import type { LlmGenerateRequest, AdapterConfig } from '../types.js';
import type { LlmEvent, LlmFinishedEvent, LlmErrorEvent } from '../events.js';
import { LlmEventType } from '../events.js';
import {
  AuthenticationError,
  RateLimitError,
  TimeoutError,
  LlmError,
  LlmErrorType,
  ValidationError,
} from '../errors.js';
import type { DidimStreamMode } from './converter.js';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_PROMPT_ID = 'test-prompt-001';

interface CreateAdapterOptions {
  fetch?: typeof globalThis.fetch;
  apiKey?: string;
  serverAddress?: string;
  streamMode?: DidimStreamMode;
}

/**
 * Lazily import DidimAdapter to allow RED phase to fail with module error.
 */
async function createAdapter(
  options: CreateAdapterOptions = {},
): Promise<InstanceType<typeof import('./adapter.js').DidimAdapter>> {
  const { DidimAdapter } = await import('./adapter.js');
  const config: AdapterConfig = {
    apiKey: options.apiKey ?? 'test-jwt-token',
    baseUrl: '',
  };
  return new DidimAdapter(
    config,
    options.fetch ?? vi.fn(),
    options.apiKey ?? 'test-jwt-token',
    options.serverAddress ?? 'aistudio.didim365.com',
    options.streamMode ?? 'sse',
  );
}

function createBasicRequest(): LlmGenerateRequest {
  return {
    model: 'didim-default',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  };
}

function createMockResponse(body: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as unknown as Response;
}

function mockFetchWith(body: Record<string, unknown>): typeof globalThis.fetch {
  return vi.fn().mockResolvedValue(createMockResponse(body));
}

/**
 * Create a mock fetch that returns SSE stream data.
 * Each string in `lines` represents a complete SSE frame (event + data + blank line).
 */
function mockSseFetch(lines: string[]): typeof globalThis.fetch {
  const encoder = new TextEncoder();
  const combined = lines.join('');
  const bytes = encoder.encode(combined);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: stream,
    headers: new Headers(),
  });
}

/**
 * Collect all events from an async generator.
 */
async function collectEvents(
  stream: AsyncGenerator<LlmEvent, void, unknown>,
): Promise<LlmEvent[]> {
  const events: LlmEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

// ============================================================================
// Tests — Part A: Non-Streaming
// ============================================================================

describe('DidimAdapter', () => {
  describe('construction and capabilities', () => {
    it('should have providerName "didim"', async () => {
      const adapter = await createAdapter();
      expect(adapter.providerName).toBe('didim');
    });

    it('should have correct capabilities (all unsupported features disabled)', async () => {
      const adapter = await createAdapter();
      const caps = adapter.capabilities;

      // Didim 지원 기능
      expect(caps.supportsStreaming).toBe(true);

      // Didim 미지원 기능 — 전수 검증
      expect(caps.supportsToolCalls).toBe(false);
      expect(caps.supportsImageInput).toBe(false);
      expect(caps.supportsImageGeneration).toBe(false);
      expect(caps.supportsEmbedding).toBe(false);
      expect(caps.supportsTokenCount).toBe(false);
      expect(caps.supportsSystemMessage).toBe(false);
      expect(caps.supportsThought).toBe(false);

      // 수치 필드 (알 수 없음 → 0)
      expect(caps.maxContextLength).toBe(0);
      expect(caps.maxOutputTokens).toBe(0);
    });
  });

  describe('generateContent', () => {
    it('should send POST request to invoke endpoint', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(
          createMockResponse({ response: 'Hello!', thread_id: 'th_1' }),
        );
      const adapter = await createAdapter({ fetch: mockFetch });

      await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/scenario-gateway/v1/invoke'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should return LlmGenerateResponse with text content', async () => {
      const adapter = await createAdapter({
        fetch: mockFetchWith({ response: 'Hello!', thread_id: 'th_1' }),
      });

      const result = await adapter.generateContent(
        createBasicRequest(),
        TEST_PROMPT_ID,
      );

      expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
      expect(result.stopReason).toBe('end_turn');
    });

    it('should include Authorization Bearer header', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ response: 'Hi' }));
      const adapter = await createAdapter({
        fetch: mockFetch,
        apiKey: 'jwt_123',
      });

      await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer jwt_123');
    });

    it('should store and reuse thread_id across calls', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          createMockResponse({ response: 'R1', thread_id: 'th_1' }),
        )
        .mockResolvedValueOnce(
          createMockResponse({ response: 'R2', thread_id: 'th_1' }),
        );
      const adapter = await createAdapter({ fetch: mockFetch });

      await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);
      await adapter.generateContent(createBasicRequest(), 'prompt-002');

      const [, secondOptions] = mockFetch.mock.calls[1] as [
        string,
        RequestInit,
      ];
      const headers = secondOptions.headers as Record<string, string>;
      expect(headers['x-thread-id']).toBe('th_1');
    });

    it('should extract user message text for chat body', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ response: 'OK' }));
      const adapter = await createAdapter({ fetch: mockFetch });

      await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      expect(body['chat']).toBe('Hello');
    });
  });

  describe('generateContent error handling', () => {
    it('should throw on 401 with authentication error', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          json: () => Promise.resolve({}),
          headers: new Headers(),
        }),
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow();
    });

    it('should throw on non-ok response', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({}),
          headers: new Headers(),
        }),
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow();
    });

    it('should throw on network error', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockRejectedValue(new Error('Network failure')),
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow('Network failure');
    });
  });

  describe('generateContent I/O failure paths', () => {
    it('should handle response with null body', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: null,
          json: vi.fn().mockRejectedValue(new Error('No body')),
          headers: new Headers(),
        }),
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow();
    });

    it('should handle JSON parse failure in response', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
          headers: new Headers(),
        }),
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow();
    });

    it('should handle fetch timeout/abort', async () => {
      const adapter = await createAdapter({
        fetch: vi
          .fn()
          .mockRejectedValue(new DOMException('Aborted', 'AbortError')),
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow(/abort/i);
    });
  });

  // ============================================================================
  // Tests — Part B: SSE Streaming
  // ============================================================================

  describe('generateContentStream (sse mode)', () => {
    it('should yield TextDelta events with correct text from SSE stream', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event: message\ndata: {"chunk": "Hello"}\n\n',
          'event: message\ndata: {"chunk": " world"}\n\n',
          'event: done\ndata: {"thread_id": "th_1"}\n\n',
        ]),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas).toHaveLength(2);
      expect((textDeltas[0] as { text: string }).text).toBe('Hello');
      expect((textDeltas[1] as { text: string }).text).toBe(' world');
    });

    it('should yield Finished then MessageEnd in correct order on done event', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event: message\ndata: {"chunk": "Hi"}\n\n',
          'event: done\ndata: {"thread_id": "th_1"}\n\n',
        ]),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const finishedIdx = events.findIndex(
        (e) => e.type === LlmEventType.Finished,
      );
      const messageEndIdx = events.findIndex(
        (e) => e.type === LlmEventType.MessageEnd,
      );
      expect(finishedIdx).toBeGreaterThan(-1);
      expect(messageEndIdx).toBeGreaterThan(-1);
      expect(finishedIdx).toBeLessThan(messageEndIdx);

      const finished = events[finishedIdx] as LlmFinishedEvent;
      expect(finished.finishReason).toBe('end_turn');
    });

    it('should store thread_id from done event', async () => {
      // Use a shared mock that returns different streams per call
      const calls: Array<[string, RequestInit]> = [];
      const mockFetchFn = vi
        .fn()
        .mockImplementation((url: string, init: RequestInit) => {
          calls.push([url, init]);
          const encoder = new TextEncoder();
          const lines =
            calls.length === 1
              ? 'event: message\ndata: {"chunk": "Hi"}\n\nevent: done\ndata: {"thread_id": "th_stream_1"}\n\n'
              : 'event: message\ndata: {"chunk": "Hello again"}\n\nevent: done\ndata: {"thread_id": "th_stream_1"}\n\n';
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode(lines));
              controller.close();
            },
          });
          return Promise.resolve({
            ok: true,
            status: 200,
            body: stream,
            headers: new Headers(),
          });
        });

      const adapter = await createAdapter({
        fetch: mockFetchFn,
        streamMode: 'sse',
      });

      // First call: stream with thread_id
      await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      // Second call: should include stored thread_id in headers
      await collectEvents(
        adapter.generateContentStream(createBasicRequest(), 'prompt-002'),
      );

      const [, secondOptions] = calls[1];
      const headers = secondOptions.headers as Record<string, string>;
      expect(headers['x-thread-id']).toBe('th_stream_1');
    });
  });

  describe('generateContentStream (improved mode)', () => {
    it('should handle message_partial events', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event: message_partial\ndata: {"content": "Hel"}\n\n',
          'event: message_partial\ndata: {"content": "lo"}\n\n',
          'event: complete\ndata: {"thread_id": "th_2"}\n\n',
        ]),
        streamMode: 'improved',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas).toHaveLength(2);
      expect((textDeltas[0] as { text: string }).text).toBe('Hel');
      expect((textDeltas[1] as { text: string }).text).toBe('lo');
    });

    it('should skip metadata events (message_metadata, process)', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event: message_metadata\ndata: {"langgraph_node": "agent"}\n\n',
          'event: process\ndata: {"status": "running"}\n\n',
          'event: message_partial\ndata: {"content": "Hi"}\n\n',
          'event: complete\ndata: {"thread_id": "th_3"}\n\n',
        ]),
        streamMode: 'improved',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      // Only TextDelta + Finished + MessageEnd expected (metadata skipped)
      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas).toHaveLength(1);
      expect(events.some((e) => e.type === LlmEventType.Finished)).toBe(true);
    });
  });

  describe('generateContentStream error handling', () => {
    it('should yield Error event with correct message on SSE error', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event: error\ndata: {"message": "Server error"}\n\n',
        ]),
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as LlmErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(String(errorEvent.error)).toContain('Server error');
    });

    it('should yield Error event on fetch failure', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockRejectedValue(new Error('Connection lost')),
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as LlmErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(String(errorEvent.error)).toContain('Connection lost');
    });

    it('should yield Error event on non-OK streaming response', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          body: null,
          statusText: 'Service Unavailable',
          headers: new Headers(),
        }),
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as LlmErrorEvent;
      expect(errorEvent).toBeDefined();
    });

    it('should yield Error event when response.body is null', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: null,
          headers: new Headers(),
        }),
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as LlmErrorEvent;
      expect(errorEvent).toBeDefined();
    });
  });

  // ============================================================================
  // Tests — R1 Review: Typed error classification (1팀 #3)
  // ============================================================================

  describe('classifyHttpError typed errors', () => {
    it('should throw AuthenticationError on 401', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
          statusText: 'Unauthorized',
          headers: new Headers(),
        }),
      });

      try {
        await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        const err = error as AuthenticationError;
        expect(err.type).toBe(LlmErrorType.AUTHENTICATION);
        expect(err.statusCode).toBe(401);
        expect(err.isRetryable).toBe(false);
      }
    });

    it('should throw AuthenticationError on 403', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          headers: new Headers(),
        }),
      });

      try {
        await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        const err = error as AuthenticationError;
        expect(err.statusCode).toBe(403);
        expect(err.isRetryable).toBe(false);
      }
    });

    it('should throw RateLimitError on 429', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: new Headers(),
        }),
      });

      try {
        await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RateLimitError);
        const err = error as RateLimitError;
        expect(err.type).toBe(LlmErrorType.RATE_LIMIT);
        expect(err.statusCode).toBe(429);
        expect(err.isRetryable).toBe(true);
      }
    });

    it('should throw TimeoutError on 408', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 408,
          statusText: 'Request Timeout',
          headers: new Headers(),
        }),
      });

      try {
        await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TimeoutError);
        const err = error as TimeoutError;
        expect(err.type).toBe(LlmErrorType.TIMEOUT);
        expect(err.statusCode).toBe(408);
        expect(err.isRetryable).toBe(true);
      }
    });

    it('should throw SERVER_ERROR with isRetryable on 500', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          headers: new Headers(),
        }),
      });

      try {
        await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LlmError);
        const err = error as LlmError;
        expect(err.type).toBe(LlmErrorType.SERVER_ERROR);
        expect(err.statusCode).toBe(500);
        expect(err.isRetryable).toBe(true);
      }
    });

    it('should throw UNKNOWN for unrecognized status codes', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 418,
          statusText: "I'm a teapot",
          headers: new Headers(),
        }),
      });

      try {
        await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(LlmError);
        const err = error as LlmError;
        expect(err.type).toBe(LlmErrorType.UNKNOWN);
        expect(err.statusCode).toBe(418);
      }
    });
  });

  // ============================================================================
  // Tests — R1 Review: Improved mode completion (1팀 #4)
  // ============================================================================

  describe('generateContentStream improved mode completion', () => {
    it('should emit TextDelta from message event (final_message type)', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event: message\ndata: {"message": "Final answer"}\n\n',
          'event: complete\ndata: {"thread_id": "th_imp"}\n\n',
        ]),
        streamMode: 'improved',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas.length).toBeGreaterThanOrEqual(1);
    });

    it('should yield Finished then MessageEnd on complete event', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event: message_partial\ndata: {"content": "Hi"}\n\n',
          'event: complete\ndata: {"thread_id": "th_imp2"}\n\n',
        ]),
        streamMode: 'improved',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const finishedIdx = events.findIndex(
        (e) => e.type === LlmEventType.Finished,
      );
      const messageEndIdx = events.findIndex(
        (e) => e.type === LlmEventType.MessageEnd,
      );
      expect(finishedIdx).toBeGreaterThan(-1);
      expect(messageEndIdx).toBeGreaterThan(-1);
      expect(finishedIdx).toBeLessThan(messageEndIdx);
    });

    it('should store thread_id from complete event for subsequent calls', async () => {
      const calls: Array<[string, RequestInit]> = [];
      const mockFetchFn = vi
        .fn()
        .mockImplementation((url: string, init: RequestInit) => {
          calls.push([url, init]);
          const encoder = new TextEncoder();
          const sseData =
            'event: message_partial\ndata: {"content": "resp"}\n\nevent: complete\ndata: {"thread_id": "th_imp_reuse"}\n\n';
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode(sseData));
              controller.close();
            },
          });
          return Promise.resolve({
            ok: true,
            status: 200,
            body: stream,
            headers: new Headers(),
          });
        });

      const adapter = await createAdapter({
        fetch: mockFetchFn,
        streamMode: 'improved',
      });

      await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );
      await collectEvents(
        adapter.generateContentStream(createBasicRequest(), 'prompt-002'),
      );

      const [, secondOptions] = calls[1];
      const headers = secondOptions.headers as Record<string, string>;
      expect(headers['x-thread-id']).toBe('th_imp_reuse');
    });
  });

  // ============================================================================
  // Tests — R1 Review: Multi-line SSE data (1팀 #5)
  // ============================================================================

  describe('SSE multi-line data parsing', () => {
    it('should join multiple data: lines with newline', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event: message\ndata: {"chunk": "line1\\n"\n\n',
          'event: done\ndata: {"thread_id":\ndata:  "th_ml"}\n\n',
        ]),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      // done event should have parsed thread_id from joined data lines
      const finishedEvents = events.filter(
        (e) => e.type === LlmEventType.Finished,
      );
      expect(finishedEvents).toHaveLength(1);
    });

    it('should handle three consecutive data: lines', async () => {
      // Three data: lines should be joined with newlines
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event: message\ndata: {"chunk":\ndata: "multi"\ndata: }\n\n',
          'event: done\ndata: {"thread_id": "th_3line"}\n\n',
        ]),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      // Should complete without crashing (even if JSON is malformed, error event is yielded)
      expect(events.length).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // Tests — R1 Review: extractChatText edge cases (1팀 #6)
  // ============================================================================

  describe('extractChatText edge cases', () => {
    it('should extract text from the LAST user message when multiple exist', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ response: 'OK' }));
      const adapter = await createAdapter({ fetch: mockFetch });

      const request: LlmGenerateRequest = {
        model: 'didim-default',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'First' }] },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Response' }],
          },
          { role: 'user', content: [{ type: 'text', text: 'Last' }] },
        ],
      };
      await adapter.generateContent(request, TEST_PROMPT_ID);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      expect(body['chat']).toBe('Last');
    });

    it('should return empty string when no user messages exist', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ response: 'OK' }));
      const adapter = await createAdapter({ fetch: mockFetch });

      const request: LlmGenerateRequest = {
        model: 'didim-default',
        messages: [
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Only assistant' }],
          },
        ],
      };
      await adapter.generateContent(request, TEST_PROMPT_ID);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      expect(body['chat']).toBe('');
    });

    it('should return empty string when user message has no text content', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ response: 'OK' }));
      const adapter = await createAdapter({ fetch: mockFetch });

      const request: LlmGenerateRequest = {
        model: 'didim-default',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  data: 'base64data',
                  mediaType: 'image/png',
                },
              },
            ],
          },
        ],
      };
      await adapter.generateContent(request, TEST_PROMPT_ID);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      expect(body['chat']).toBe('');
    });

    it('should concatenate all text parts from user message', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ response: 'OK' }));
      const adapter = await createAdapter({ fetch: mockFetch });

      const request: LlmGenerateRequest = {
        model: 'didim-default',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  data: 'base64data',
                  mediaType: 'image/png',
                },
              },
              { type: 'text', text: 'Describe this image' },
              { type: 'text', text: 'in detail' },
            ],
          },
        ],
      };
      await adapter.generateContent(request, TEST_PROMPT_ID);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(options.body as string) as Record<
        string,
        unknown
      >;
      // All text parts should be concatenated with newline
      expect(body['chat']).toBe('Describe this image\nin detail');
    });
  });

  // ============================================================================
  // Tests — R2 Review: serverAddress missing → classified error (#1)
  // ============================================================================

  describe('serverAddress validation', () => {
    it('should throw ValidationError when serverAddress is empty (non-streaming)', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn(),
        serverAddress: '',
      });

      try {
        await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        const err = error as ValidationError;
        expect(err.type).toBe(LlmErrorType.VALIDATION);
        expect(err.message).toContain('configuration error');
      }
    });

    it('should yield Error event when serverAddress is empty (streaming)', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn(),
        serverAddress: '',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as LlmErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(String(errorEvent.error)).toContain('configuration error');
    });

    it('should throw ValidationError when serverAddress is whitespace-only', async () => {
      const adapter = await createAdapter({
        fetch: vi.fn(),
        serverAddress: '   ',
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow(ValidationError);
    });
  });

  // ============================================================================
  // Tests — R2 Review: improved mode dedup final_message (#2)
  // ============================================================================

  describe('improved mode final_message pass-through (R3: no aggressive dedup)', () => {
    it('should emit all events including final_message even after delta tokens', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event: message_partial\ndata: {"content": "Hello"}\n\n',
          'event: message_partial\ndata: {"content": " world"}\n\n',
          // Server sends full/refined response as message event
          'event: message\ndata: {"message": "Hello world (refined)"}\n\n',
          'event: complete\ndata: {"thread_id": "th_dedup"}\n\n',
        ]),
        streamMode: 'improved',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      // All 3 should be emitted: 2 partials + 1 final_message (server may refine)
      expect(textDeltas).toHaveLength(3);
      expect((textDeltas[0] as { text: string }).text).toBe('Hello');
      expect((textDeltas[1] as { text: string }).text).toBe(' world');
      expect((textDeltas[2] as { text: string }).text).toBe(
        'Hello world (refined)',
      );
    });

    it('should emit final_message when no delta tokens were streamed', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          // No message_partial, only final message
          'event: message\ndata: {"message": "Direct response"}\n\n',
          'event: complete\ndata: {"thread_id": "th_nodelta"}\n\n',
        ]),
        streamMode: 'improved',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas).toHaveLength(1);
      expect((textDeltas[0] as { text: string }).text).toBe('Direct response');
    });
  });

  // ============================================================================
  // Tests — R2 Review: CRLF handling (#3)
  // ============================================================================

  describe('SSE CRLF handling', () => {
    it('should handle CRLF line endings correctly', async () => {
      // Simulate CRLF-terminated SSE frames
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event: message\r\ndata: {"chunk": "CRLF"}\r\n\r\n',
          'event: done\r\ndata: {"thread_id": "th_crlf"}\r\n\r\n',
        ]),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas).toHaveLength(1);
      expect((textDeltas[0] as { text: string }).text).toBe('CRLF');

      const finished = events.filter((e) => e.type === LlmEventType.Finished);
      expect(finished).toHaveLength(1);
    });

    it('should flush remaining buffer when stream ends without trailing blank line', async () => {
      // Stream ends after data: line without the final blank line
      const encoder = new TextEncoder();
      const sseData = 'event: done\ndata: {"thread_id": "th_notrail"}';
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(sseData));
          controller.close();
        },
      });

      const adapter = await createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: stream,
          headers: new Headers(),
        }),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      // Should still produce Finished + MessageEnd from the flushed buffer
      const finished = events.filter((e) => e.type === LlmEventType.Finished);
      expect(finished).toHaveLength(1);
    });
  });

  // ============================================================================
  // Tests — R3 Review: SSE field parsing without space after colon (#4)
  // ============================================================================

  describe('SSE field parsing without space after colon (R3)', () => {
    it('should parse "data:" without trailing space (SSE spec)', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event: message\ndata:{"chunk": "no-space"}\n\n',
          'event: done\ndata:{"thread_id": "th_nospace"}\n\n',
        ]),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas).toHaveLength(1);
      expect((textDeltas[0] as { text: string }).text).toBe('no-space');
    });

    it('should parse "event:" without trailing space (SSE spec)', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event:message\ndata: {"chunk": "event-nospace"}\n\n',
          'event:done\ndata: {"thread_id": "th_evns"}\n\n',
        ]),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas).toHaveLength(1);
      expect((textDeltas[0] as { text: string }).text).toBe('event-nospace');
    });

    it('should handle mixed space/no-space fields in same stream', async () => {
      const adapter = await createAdapter({
        fetch: mockSseFetch([
          'event:message\ndata:{"chunk": "mixed"}\n\n',
          'event: done\ndata: {"thread_id": "th_mix"}\n\n',
        ]),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas).toHaveLength(1);
      const finished = events.filter((e) => e.type === LlmEventType.Finished);
      expect(finished).toHaveLength(1);
    });
  });

  // ============================================================================
  // Tests — R3 Review: threadId lazy read (#5)
  // ============================================================================

  describe('threadId lazy read at fetch time (R3)', () => {
    it('should read threadId at generator consumption time, not creation time', async () => {
      const { DidimAdapter } = await import('./adapter.js');
      const fetchCalls: Array<[string, RequestInit]> = [];

      // A single adapter with a mock fetch that:
      // - First call: non-streaming, returns thread_id = 'th_from_invoke'
      // - Second call: streaming, tracks the request headers
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          createMockResponse({ response: 'R1', thread_id: 'th_from_invoke' }),
        )
        .mockImplementation((url: string, init: RequestInit) => {
          fetchCalls.push([url, init]);
          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'event: done\ndata: {"thread_id": "th_stream"}\n\n',
                ),
              );
              controller.close();
            },
          });
          return Promise.resolve({
            ok: true,
            status: 200,
            body: stream,
            headers: new Headers(),
          });
        });

      const adapter = new DidimAdapter(
        { apiKey: 'test-jwt-token', baseUrl: '' },
        mockFetch,
        'test-jwt-token',
        'aistudio.didim365.com',
        'sse',
      );

      // Step 1: generateContent stores threadId = 'th_from_invoke'
      await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);

      // Step 2: create + consume stream — threadId should be 'th_from_invoke'
      await collectEvents(
        adapter.generateContentStream(createBasicRequest(), 'prompt-002'),
      );

      // Verify the stream fetch used the threadId from step 1
      expect(fetchCalls).toHaveLength(1);
      const streamHeaders = fetchCalls[0][1].headers as Record<string, string>;
      expect(streamHeaders['x-thread-id']).toBe('th_from_invoke');
    });
  });

  // ============================================================================
  // Tests — R2 Review: AbortSignal support (#4)
  // ============================================================================

  describe('GenerateOptions signal support', () => {
    it('should pass AbortSignal to fetch in generateContent', async () => {
      const controller = new AbortController();
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ response: 'OK' }));
      const adapter = await createAdapter({ fetch: mockFetch });

      await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID, {
        signal: controller.signal,
      });

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.signal).toBe(controller.signal);
    });

    it('should pass AbortSignal to fetch in generateContentStream', async () => {
      const controller = new AbortController();
      const calls: Array<[string, RequestInit]> = [];
      const mockFetch = vi
        .fn()
        .mockImplementation((url: string, init: RequestInit) => {
          calls.push([url, init]);
          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            start(ctrl) {
              ctrl.enqueue(
                encoder.encode('event: done\ndata: {"thread_id": "t1"}\n\n'),
              );
              ctrl.close();
            },
          });
          return Promise.resolve({
            ok: true,
            status: 200,
            body: stream,
            headers: new Headers(),
          });
        });
      const adapter = await createAdapter({ fetch: mockFetch });

      await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID, {
          signal: controller.signal,
        }),
      );

      expect(calls).toHaveLength(1);
      expect(calls[0][1].signal).toBe(controller.signal);
    });
  });

  // ============================================================================
  // Tests — Part C: countTokens
  // ============================================================================

  describe('countTokens', () => {
    it('should throw UnsupportedFeatureError', async () => {
      const adapter = await createAdapter();
      expect(() => adapter.countTokens(createBasicRequest())).toThrow(
        /not supported/i,
      );
    });
  });
});
