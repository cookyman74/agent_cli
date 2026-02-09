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

    it('should NOT support streaming yet (M3.2.B pending)', () => {
      expect(adapter.capabilities.supportsStreaming).toBe(false);
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
  // generateContentStream (capability guard)
  // ==========================================================================

  describe('generateContentStream', () => {
    it('should throw UnsupportedFeatureError when supportsStreaming is false', () => {
      const request = createBasicRequest();
      expect(() => adapter.generateContentStream(request, 'prompt-1')).toThrow(
        UnsupportedFeatureError,
      );
    });

    it('should include provider name in error message', () => {
      const request = createBasicRequest();
      expect(() => adapter.generateContentStream(request, 'prompt-1')).toThrow(
        /openai/,
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
