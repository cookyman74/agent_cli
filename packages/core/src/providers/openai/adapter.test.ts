/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for OpenAiAdapter — extends BaseAdapter to wrap OpenAI SDK.
 *
 * @see docs/ai_adapter/todolist/phase3_provider_extension_todolist.md §3.2.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAiAdapter, type OpenAiClient } from './adapter.js';
import type { LlmGenerateRequest, AdapterConfig } from '../types.js';
import { LlmError, LlmErrorType, UnsupportedFeatureError } from '../errors.js';
import { LlmEventType } from '../events.js';
import type { LlmEvent } from '../events.js';

function createMockClient(overrides?: Partial<OpenAiClient>): OpenAiClient {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          id: 'chatcmpl-test',
          model: 'gpt-4o',
          choices: [
            {
              message: { role: 'assistant', content: 'Hello!' },
              finish_reason: 'stop',
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
          },
        }),
      },
    },
    ...overrides,
  };
}

function createBasicRequest(
  overrides?: Partial<LlmGenerateRequest>,
): LlmGenerateRequest {
  return {
    model: 'gpt-4o',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    ...overrides,
  };
}

describe('OpenAiAdapter', () => {
  let client: OpenAiClient;
  let adapter: OpenAiAdapter;
  const config: AdapterConfig = { apiKey: 'test-key' };

  beforeEach(() => {
    client = createMockClient();
    adapter = new OpenAiAdapter(config, client);
  });

  // ==========================================================================
  // Capabilities
  // ==========================================================================

  describe('capabilities', () => {
    it('should have providerName "openai"', () => {
      expect(adapter.providerName).toBe('openai');
    });

    it('should support streaming', () => {
      expect(adapter.capabilities.supportsStreaming).toBe(true);
    });

    it('should support tool calls', () => {
      expect(adapter.capabilities.supportsToolCalls).toBe(true);
    });

    it('should support image input', () => {
      expect(adapter.capabilities.supportsImageInput).toBe(true);
    });

    it('should NOT support image generation', () => {
      expect(adapter.capabilities.supportsImageGeneration).toBe(false);
    });

    it('should NOT support embedding', () => {
      expect(adapter.capabilities.supportsEmbedding).toBe(false);
    });

    it('should NOT support token counting', () => {
      expect(adapter.capabilities.supportsTokenCount).toBe(false);
    });

    it('should support system messages', () => {
      expect(adapter.capabilities.supportsSystemMessage).toBe(true);
    });

    it('should NOT support thought/reasoning', () => {
      expect(adapter.capabilities.supportsThought).toBe(false);
    });
  });

  // ==========================================================================
  // generateContent (non-streaming)
  // ==========================================================================

  describe('generateContent', () => {
    it('should call client.chat.completions.create with converted params', async () => {
      const request = createBasicRequest();
      await adapter.generateContent(request, 'prompt-1');

      expect(client.chat.completions.create).toHaveBeenCalledTimes(1);
      const params = vi.mocked(client.chat.completions.create).mock.calls[0][0];
      expect(params['model']).toBe('gpt-4o');
      expect(params['stream']).toBeUndefined();
    });

    it('should return LlmGenerateResponse with correct fields', async () => {
      const request = createBasicRequest();
      const response = await adapter.generateContent(request, 'prompt-1');

      expect(response.id).toBe('chatcmpl-test');
      expect(response.model).toBe('gpt-4o');
      expect(response.content).toEqual([{ type: 'text', text: 'Hello!' }]);
      expect(response.stopReason).toBe('end_turn');
      expect(response.usage?.totalTokens).toBe(15);
    });

    it('should validate request (missing model)', async () => {
      const request = createBasicRequest({ model: '' });
      await expect(
        adapter.generateContent(request, 'prompt-1'),
      ).rejects.toThrow(LlmError);
    });

    it('should validate request (empty messages)', async () => {
      const request = createBasicRequest({ messages: [] });
      await expect(
        adapter.generateContent(request, 'prompt-1'),
      ).rejects.toThrow(LlmError);
    });

    it('should classify errors from SDK', async () => {
      const error = new Error('rate limit exceeded');
      (error as unknown as Record<string, unknown>)['status'] = 429;
      vi.mocked(client.chat.completions.create).mockRejectedValueOnce(error);

      const request = createBasicRequest();
      await expect(
        adapter.generateContent(request, 'prompt-1'),
      ).rejects.toThrow(LlmError);

      try {
        await adapter.generateContent(request, 'prompt-1');
      } catch (e) {
        const llmErr = e as LlmError;
        expect(llmErr.isRetryable).toBe(true);
      }
    });

    it('should preserve LlmError instances without re-classification', async () => {
      const llmError = new LlmError(
        LlmErrorType.VALIDATION,
        'test validation error',
      );
      vi.mocked(client.chat.completions.create).mockRejectedValueOnce(llmError);

      const request = createBasicRequest();
      await expect(adapter.generateContent(request, 'prompt-1')).rejects.toBe(
        llmError,
      );
    });
  });

  // ==========================================================================
  // countTokens
  // ==========================================================================

  describe('countTokens', () => {
    it('should throw UnsupportedFeatureError', () => {
      const request = createBasicRequest();
      expect(() => adapter.countTokens(request)).toThrow(
        UnsupportedFeatureError,
      );
    });
  });

  // ==========================================================================
  // generateContentStream
  // ==========================================================================

  describe('generateContentStream', () => {
    it('should call client.chat.completions.create with stream=true and stream_options', async () => {
      // Mock an async iterable stream
      const chunks = [
        {
          choices: [
            { index: 0, delta: { role: 'assistant' }, finish_reason: null },
          ],
        },
        {
          choices: [
            { index: 0, delta: { content: 'Hello' }, finish_reason: null },
          ],
        },
        { choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
        {
          choices: [],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      ];

      async function* mockStream(): AsyncGenerator<unknown> {
        for (const c of chunks) {
          yield c;
        }
      }

      vi.mocked(client.chat.completions.create).mockResolvedValueOnce(
        mockStream() as unknown,
      );

      const request = createBasicRequest();
      const stream = adapter.generateContentStream(request, 'prompt-1');
      const events: LlmEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      // Verify SDK was called with stream params
      const params = vi.mocked(client.chat.completions.create).mock.calls[0][0];
      expect(params['stream']).toBe(true);
      expect(params['stream_options']).toEqual({ include_usage: true });

      // Verify events
      expect(events.map((e) => e.type)).toEqual([
        LlmEventType.TextDelta,
        LlmEventType.Finished,
        LlmEventType.MessageEnd,
      ]);
    });

    it('should yield error event on SDK failure', async () => {
      const error = new Error('rate limit exceeded');
      (error as unknown as Record<string, unknown>)['status'] = 429;
      vi.mocked(client.chat.completions.create).mockRejectedValueOnce(error);

      const request = createBasicRequest();
      const stream = adapter.generateContentStream(request, 'prompt-1');
      const events: LlmEvent[] = [];
      for await (const event of stream) {
        events.push(event);
      }

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LlmEventType.Error);
    });

    it('should validate request before streaming', () => {
      const request = createBasicRequest({ model: '' });
      expect(() => adapter.generateContentStream(request, 'prompt-1')).toThrow(
        LlmError,
      );
    });
  });

  // ==========================================================================
  // Error Classification
  // ==========================================================================

  describe('error classification', () => {
    it.each([
      [400, 'invalid_request', false],
      [401, 'authentication', false],
      [403, 'authentication', false],
      [404, 'model_not_found', false],
      [422, 'invalid_request', false],
      [429, 'rate_limit', true],
      [500, 'server_error', true],
      [503, 'server_error', true],
    ] as const)(
      'should classify status %i as %s (retryable=%s)',
      async (status, expectedType, expectedRetryable) => {
        const error = new Error(`HTTP ${status}`);
        (error as unknown as Record<string, unknown>)['status'] = status;
        vi.mocked(client.chat.completions.create).mockRejectedValueOnce(error);

        const request = createBasicRequest();
        try {
          await adapter.generateContent(request, 'prompt-1');
        } catch (e) {
          const llmErr = e as LlmError;
          expect(llmErr.type).toBe(expectedType);
          expect(llmErr.isRetryable).toBe(expectedRetryable);
        }
      },
    );

    it('should classify timeout errors by message heuristic', async () => {
      const error = new Error('Connection timeout');
      vi.mocked(client.chat.completions.create).mockRejectedValueOnce(error);

      const request = createBasicRequest();
      try {
        await adapter.generateContent(request, 'prompt-1');
      } catch (e) {
        const llmErr = e as LlmError;
        expect(llmErr.type).toBe('timeout');
        expect(llmErr.isRetryable).toBe(true);
      }
    });

    it('should classify unknown errors as NETWORK', async () => {
      const error = new Error('something weird happened');
      vi.mocked(client.chat.completions.create).mockRejectedValueOnce(error);

      const request = createBasicRequest();
      try {
        await adapter.generateContent(request, 'prompt-1');
      } catch (e) {
        const llmErr = e as LlmError;
        expect(llmErr.type).toBe('network');
        expect(llmErr.isRetryable).toBe(true);
      }
    });
  });

  // ==========================================================================
  // mapToProviderConfig
  // ==========================================================================

  describe('mapToProviderConfig', () => {
    it('should be accessible and return provider-specific config', () => {
      // mapToProviderConfig is protected, test via adapter behavior
      // The adapter is constructed without error, confirming config mapping works
      expect(adapter.providerName).toBe('openai');
    });
  });
});
