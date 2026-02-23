/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for OpenAiCompatibleAdapter — extends OpenAiAdapter for
 * vLLM, TGI, LM Studio, Ollama, and other OpenAI-compatible servers.
 *
 * @see docs/ai_adapter/todolist/phase3_provider_extension_todolist.md §3.3.1
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenAiCompatibleAdapter } from './adapter.js';
import { OpenAiAdapter, type OpenAiClient } from '../openai/adapter.js';
import { BaseAdapter } from '../baseAdapter.js';
import { UnsupportedFeatureError } from '../errors.js';
import { LlmEventType } from '../events.js';
import type { LlmGenerateRequest, AdapterConfig } from '../types.js';
import type { LlmEvent } from '../events.js';

function createMockClient(overrides?: Partial<OpenAiClient>): OpenAiClient {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          id: 'chatcmpl-test',
          model: 'meta-llama/Llama-3.1-8B-Instruct',
          choices: [
            {
              message: { role: 'assistant', content: 'Hello from vLLM!' },
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
    model: 'meta-llama/Llama-3.1-8B-Instruct',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    ...overrides,
  };
}

describe('OpenAiCompatibleAdapter', () => {
  let client: OpenAiClient;
  let adapter: OpenAiCompatibleAdapter;
  const config: AdapterConfig = {
    apiKey: 'test-key',
    baseUrl: 'http://localhost:8000/v1',
  };

  beforeEach(() => {
    client = createMockClient();
    adapter = new OpenAiCompatibleAdapter(config, client);
  });

  // ==========================================================================
  // 3.3.1.1 Class Structure
  // ==========================================================================

  describe('class structure', () => {
    it('should be an instance of BaseAdapter', () => {
      expect(adapter).toBeInstanceOf(BaseAdapter);
    });

    // 3.3.1.2 Inheritance
    it('should extend OpenAiAdapter', () => {
      expect(adapter).toBeInstanceOf(OpenAiAdapter);
    });

    it('should have providerName "openai-compatible"', () => {
      expect(adapter.providerName).toBe('openai-compatible');
    });

    it('should throw when baseUrl is missing', () => {
      const client = createMockClient();
      expect(() => new OpenAiCompatibleAdapter({}, client)).toThrow(
        'requires baseUrl',
      );
    });
  });

  // ==========================================================================
  // Capabilities
  // ==========================================================================

  describe('capabilities', () => {
    it('should have conservative default capabilities', () => {
      expect(adapter.capabilities.supportsStreaming).toBe(true);
      expect(adapter.capabilities.supportsToolCalls).toBe(true);
      expect(adapter.capabilities.supportsImageInput).toBe(false);
      expect(adapter.capabilities.supportsImageGeneration).toBe(false);
      expect(adapter.capabilities.supportsEmbedding).toBe(false);
      expect(adapter.capabilities.supportsTokenCount).toBe(false);
      expect(adapter.capabilities.supportsSystemMessage).toBe(true);
      expect(adapter.capabilities.supportsThought).toBe(false);
    });

    it('should have conservative context/output limits', () => {
      expect(adapter.capabilities.maxContextLength).toBe(32_768);
      expect(adapter.capabilities.maxOutputTokens).toBe(4_096);
    });

    it('should override capabilities when provided in config', () => {
      const customAdapter = new OpenAiCompatibleAdapter(
        {
          ...config,
          capabilities: {
            supportsToolCalls: false,
            supportsImageInput: true,
            maxContextLength: 128_000,
          },
        },
        client,
      );
      expect(customAdapter.capabilities.supportsToolCalls).toBe(false);
      expect(customAdapter.capabilities.supportsImageInput).toBe(true);
      expect(customAdapter.capabilities.maxContextLength).toBe(128_000);
      // Non-overridden fields remain default
      expect(customAdapter.capabilities.supportsStreaming).toBe(true);
      expect(customAdapter.capabilities.maxOutputTokens).toBe(4_096);
    });
  });

  // ==========================================================================
  // generateContent (inherited from OpenAiAdapter)
  // ==========================================================================

  describe('generateContent', () => {
    it('should call client.chat.completions.create and return response', async () => {
      const request = createBasicRequest();
      const result = await adapter.generateContent(request, 'test-prompt');

      expect(client.chat.completions.create).toHaveBeenCalled();
      expect(result.content).toEqual([
        { type: 'text', text: 'Hello from vLLM!' },
      ]);
      expect(result.model).toBe('meta-llama/Llama-3.1-8B-Instruct');
      expect(result.stopReason).toBe('end_turn');
    });

    it('should pass through model from request', async () => {
      const request = createBasicRequest({ model: 'custom-model' });
      await adapter.generateContent(request, 'test-prompt');

      expect(client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'custom-model' }),
        expect.anything(),
      );
    });

    it('should classify errors via inherited classifyError', async () => {
      const errorClient = createMockClient();
      const err = new Error('Connection refused');
      (
        errorClient.chat.completions.create as ReturnType<typeof vi.fn>
      ).mockRejectedValue(err);

      const errorAdapter = new OpenAiCompatibleAdapter(config, errorClient);
      const request = createBasicRequest();

      await expect(
        errorAdapter.generateContent(request, 'test-prompt'),
      ).rejects.toThrow();
    });

    it('should include max_tokens only when explicitly specified', async () => {
      // Case 1: maxTokens specified — should include max_tokens
      const requestWithTokens = createBasicRequest({ maxTokens: 2048 });
      await adapter.generateContent(requestWithTokens, 'test-prompt');

      expect(client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({ max_tokens: 2048 }),
        expect.anything(),
      );

      // Reset mock
      vi.clearAllMocks();

      // Case 2: maxTokens not specified — should NOT include max_tokens
      const requestWithoutTokens = createBasicRequest();
      delete (requestWithoutTokens as unknown as Record<string, unknown>)[
        'maxTokens'
      ];
      await adapter.generateContent(requestWithoutTokens, 'test-prompt');

      const callArgs = (
        client.chat.completions.create as ReturnType<typeof vi.fn>
      ).mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('max_tokens');
    });
  });

  // ==========================================================================
  // generateContentStream (inherited from OpenAiAdapter)
  // ==========================================================================

  describe('generateContentStream', () => {
    it('should stream events correctly', async () => {
      const streamChunks = [
        {
          id: 'chatcmpl-1',
          choices: [
            {
              index: 0,
              delta: { role: 'assistant', content: 'Hello' },
              finish_reason: null,
            },
          ],
        },
        {
          id: 'chatcmpl-1',
          choices: [
            { index: 0, delta: { content: ' world' }, finish_reason: null },
          ],
        },
        {
          id: 'chatcmpl-1',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
        },
      ];

      const mockCreate = vi.fn().mockResolvedValue({
        async *[Symbol.asyncIterator]() {
          for (const chunk of streamChunks) {
            yield chunk;
          }
        },
      });
      const streamClient = createMockClient();
      streamClient.chat.completions.create = mockCreate;

      const streamAdapter = new OpenAiCompatibleAdapter(config, streamClient);
      const request = createBasicRequest();
      const events: LlmEvent[] = [];

      for await (const event of streamAdapter.generateContentStream(
        request,
        'test-prompt',
      )) {
        events.push(event);
      }

      // Should have TextDelta events and a Finished event
      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      const finished = events.filter((e) => e.type === LlmEventType.Finished);
      expect(textDeltas.length).toBeGreaterThanOrEqual(1);
      expect(finished.length).toBe(1);
    });

    it('should yield error event on failure', async () => {
      const mockCreate = vi.fn().mockRejectedValue(new Error('Stream error'));
      const errorClient = createMockClient();
      errorClient.chat.completions.create = mockCreate;

      const errorAdapter = new OpenAiCompatibleAdapter(config, errorClient);
      const request = createBasicRequest();
      const events: LlmEvent[] = [];

      for await (const event of errorAdapter.generateContentStream(
        request,
        'test-prompt',
      )) {
        events.push(event);
      }

      const errorEvents = events.filter((e) => e.type === LlmEventType.Error);
      expect(errorEvents.length).toBe(1);
    });
  });

  // ==========================================================================
  // 3.3.1.6 Connection Test
  // ==========================================================================

  describe('testConnection', () => {
    it('should return true when server responds successfully', async () => {
      const result = await adapter.testConnection();
      expect(result).toBe(true);
    });

    it('should return true when server responds with HTTP error (reachable)', async () => {
      const err = new Error('Unauthorized');
      (err as unknown as Record<string, unknown>)['status'] = 401;
      const errorClient = createMockClient();
      (
        errorClient.chat.completions.create as ReturnType<typeof vi.fn>
      ).mockRejectedValue(err);

      const errorAdapter = new OpenAiCompatibleAdapter(config, errorClient);
      const result = await errorAdapter.testConnection();
      expect(result).toBe(true);
    });

    it('should return false when server is unreachable', async () => {
      const err = new Error('Connection refused');
      const errorClient = createMockClient();
      (
        errorClient.chat.completions.create as ReturnType<typeof vi.fn>
      ).mockRejectedValue(err);

      const errorAdapter = new OpenAiCompatibleAdapter(config, errorClient);
      const result = await errorAdapter.testConnection();
      expect(result).toBe(false);
    });
  });

  // ==========================================================================
  // countTokens (inherited — should throw)
  // ==========================================================================

  describe('countTokens', () => {
    it('should throw UnsupportedFeatureError', () => {
      const request = createBasicRequest();
      expect(() => adapter.countTokens(request)).toThrow(
        UnsupportedFeatureError,
      );
    });
  });
});
