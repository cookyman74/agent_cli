/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M3.4.1.4 — Cross-provider error handling integration test
 *
 * Tests error classification, LlmError type propagation, and error
 * handling consistency across all 3 providers.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry } from '../registry.js';
import { ProviderFactory } from '../factory.js';
import { BaseAdapter } from '../baseAdapter.js';
import {
  LlmErrorType,
  AuthenticationError,
  RateLimitError,
  ModelNotFoundError,
  ContentFilterError,
  isLlmError,
  isRetryableError,
  wrapError,
} from '../errors.js';
import type { LlmError } from '../errors.js';
import { LlmEventType } from '../events.js';
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmProviderCapabilities,
  LlmGenerateConfig,
  AdapterConfig,
  GenerateOptions,
} from '../types.js';
import type { LlmEvent, LlmEventStream } from '../events.js';

// ============================================================================
// Error-Producing Mock Adapters
// ============================================================================

function createBasicRequest(model: string): LlmGenerateRequest {
  return {
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  };
}

/**
 * Adapter that throws a configurable error on generateContent/stream.
 */
class ErrorAdapter extends BaseAdapter {
  readonly providerName: string;
  readonly capabilities: LlmProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsImageInput: false,
    supportsImageGeneration: false,
    supportsEmbedding: false,
    supportsTokenCount: false,
    supportsSystemMessage: true,
    supportsThought: false,
    maxContextLength: 128_000,
    maxOutputTokens: 4096,
  };

  private readonly errorToThrow: Error;

  constructor(provider: string, config: AdapterConfig, error: Error) {
    super(config);
    this.providerName = provider;
    this.errorToThrow = error;
  }

  protected mapToProviderConfig(
    _config: LlmGenerateConfig,
  ): Record<string, unknown> {
    return {};
  }

  async generateContent(
    _request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    throw this.errorToThrow;
  }

  async *generateContentStream(
    _request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): LlmEventStream {
    yield {
      type: LlmEventType.Error,
      error: this.errorToThrow,
    };
  }
}

/**
 * Adapter that yields error event mid-stream after some content.
 */
class MidStreamErrorAdapter extends BaseAdapter {
  readonly providerName: string;
  readonly capabilities: LlmProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsImageInput: false,
    supportsImageGeneration: false,
    supportsEmbedding: false,
    supportsTokenCount: false,
    supportsSystemMessage: true,
    supportsThought: false,
    maxContextLength: 128_000,
    maxOutputTokens: 4096,
  };

  constructor(provider: string, config: AdapterConfig) {
    super(config);
    this.providerName = provider;
  }

  protected mapToProviderConfig(
    _config: LlmGenerateConfig,
  ): Record<string, unknown> {
    return {};
  }

  async generateContent(
    request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    return {
      id: 'resp-1',
      content: [{ type: 'text', text: 'ok' }],
      model: request.model,
      stopReason: 'end_turn',
    };
  }

  async *generateContentStream(
    _request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): LlmEventStream {
    // Yield some content first, then error
    yield { type: LlmEventType.TextDelta, text: 'partial ' };
    yield { type: LlmEventType.TextDelta, text: 'response' };
    yield {
      type: LlmEventType.Error,
      error: new RateLimitError('Rate limit hit mid-stream', {
        provider: this.providerName,
      }),
    };
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('M3.4.1.4 — Cross-provider error handling integration', () => {
  let registry: ProviderRegistry;
  let factory: ProviderFactory;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.clear();
    factory = new ProviderFactory(registry);
  });

  // ==========================================================================
  // LlmError Classification Consistency
  // ==========================================================================

  describe('error classification consistency', () => {
    const errorTypes = [
      {
        type: LlmErrorType.AUTHENTICATION,
        factory: (provider: string) =>
          new AuthenticationError('Invalid API key', { provider }),
        isRetryable: false,
      },
      {
        type: LlmErrorType.RATE_LIMIT,
        factory: (provider: string) =>
          new RateLimitError('Rate limit exceeded', {
            provider,
            retryAfterMs: 5000,
          }),
        isRetryable: true,
      },
      {
        type: LlmErrorType.MODEL_NOT_FOUND,
        factory: (provider: string) =>
          new ModelNotFoundError('Model not available', { provider }),
        isRetryable: false,
      },
      {
        type: LlmErrorType.CONTENT_FILTER,
        factory: (provider: string) =>
          new ContentFilterError('Content blocked', { provider }),
        isRetryable: false,
      },
    ] as const;

    for (const errorDef of errorTypes) {
      it(`should propagate ${errorDef.type} error consistently across providers`, async () => {
        const providers = ['gemini', 'claude', 'openai'] as const;

        for (const provider of providers) {
          const error = errorDef.factory(provider);
          registry.register(
            provider,
            (config) => new ErrorAdapter(provider, config, error),
            { force: true },
          );

          const adapter = factory.create(provider, { apiKey: 'key' });

          try {
            await adapter.generateContent(
              createBasicRequest(`${provider}-model`),
              'prompt-1',
            );
            expect.fail(`${provider} should have thrown`);
          } catch (e: unknown) {
            expect(isLlmError(e)).toBe(true);
            const llmErr = e as LlmError;
            expect(llmErr.type).toBe(errorDef.type);
            expect(llmErr.provider).toBe(provider);
            expect(llmErr.isRetryable).toBe(errorDef.isRetryable);
          }
        }
      });
    }
  });

  // ==========================================================================
  // Retryable vs Non-Retryable
  // ==========================================================================

  describe('retryable error classification', () => {
    it('should mark rate limit errors as retryable', () => {
      const error = new RateLimitError('Too many requests', {
        provider: 'claude',
      });
      expect(isRetryableError(error)).toBe(true);
    });

    it('should mark authentication errors as non-retryable', () => {
      const error = new AuthenticationError('Bad key', {
        provider: 'openai',
      });
      expect(isRetryableError(error)).toBe(false);
    });

    it('should mark content filter errors as non-retryable', () => {
      const error = new ContentFilterError('Blocked', {
        provider: 'gemini',
      });
      expect(isRetryableError(error)).toBe(false);
    });

    it('should mark model not found errors as non-retryable', () => {
      const error = new ModelNotFoundError('Unknown model', {
        provider: 'openai',
      });
      expect(isRetryableError(error)).toBe(false);
    });

    it('should preserve retryAfterMs for rate limit errors', () => {
      const error = new RateLimitError('Rate limited', {
        provider: 'claude',
        retryAfterMs: 3000,
      });
      expect(error.retryAfterMs).toBe(3000);
    });
  });

  // ==========================================================================
  // Stream Error Events
  // ==========================================================================

  describe('stream error events', () => {
    it('should yield error event in stream for each provider', async () => {
      const providers = ['gemini', 'claude', 'openai'] as const;

      for (const provider of providers) {
        const error = new AuthenticationError('Invalid key', { provider });
        registry.register(
          provider,
          (config) => new ErrorAdapter(provider, config, error),
          { force: true },
        );

        const adapter = factory.create(provider, { apiKey: 'key' });
        const events: LlmEvent[] = [];

        for await (const event of adapter.generateContentStream(
          createBasicRequest(`${provider}-model`),
          'prompt-1',
        )) {
          events.push(event);
        }

        expect(events).toHaveLength(1);
        expect(events[0].type).toBe(LlmEventType.Error);
        if (events[0].type === LlmEventType.Error) {
          expect(events[0].error).toBeInstanceOf(AuthenticationError);
        }
      }
    });

    it('should handle mid-stream errors with partial content', async () => {
      registry.register(
        'claude',
        (config) => new MidStreamErrorAdapter('claude', config),
      );

      const adapter = factory.create('claude', { apiKey: 'key' });
      const events: LlmEvent[] = [];

      for await (const event of adapter.generateContentStream(
        createBasicRequest('claude-3-sonnet'),
        'prompt-1',
      )) {
        events.push(event);
      }

      // Expect: TextDelta + TextDelta + Error
      expect(events).toHaveLength(3);
      expect(events[0].type).toBe(LlmEventType.TextDelta);
      expect(events[1].type).toBe(LlmEventType.TextDelta);
      expect(events[2].type).toBe(LlmEventType.Error);

      if (events[2].type === LlmEventType.Error) {
        const error = events[2].error;
        expect(error).toBeInstanceOf(RateLimitError);
        expect(isRetryableError(error)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // Error Wrapping (wrapError utility)
  // ==========================================================================

  describe('error wrapping', () => {
    it('should pass through LlmError without re-wrapping', () => {
      const original = new AuthenticationError('bad key', {
        provider: 'claude',
      });
      const wrapped = wrapError(original, 'claude');
      expect(wrapped).toBe(original);
    });

    it('should wrap generic Error as UNKNOWN', () => {
      const original = new Error('Something failed');
      const wrapped = wrapError(original, 'openai');

      expect(wrapped.type).toBe(LlmErrorType.UNKNOWN);
      expect(wrapped.provider).toBe('openai');
      expect(wrapped.message).toBe('Something failed');
      expect(wrapped.cause).toBe(original);
    });

    it('should wrap non-Error values as UNKNOWN', () => {
      const wrapped = wrapError('string error', 'gemini');

      expect(wrapped.type).toBe(LlmErrorType.UNKNOWN);
      expect(wrapped.provider).toBe('gemini');
      expect(wrapped.message).toBe('string error');
    });
  });

  // ==========================================================================
  // Registry Error Handling
  // ==========================================================================

  describe('registry and factory errors', () => {
    it('should throw PROVIDER_NOT_FOUND for unregistered provider', () => {
      try {
        factory.create('vllm', { apiKey: 'key' });
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect(isLlmError(error)).toBe(true);
        expect((error as LlmError).type).toBe(LlmErrorType.PROVIDER_NOT_FOUND);
      }
    });

    it('should throw VALIDATION on duplicate registration without force', () => {
      registry.register(
        'gemini',
        (config) => new ErrorAdapter('gemini', config, new Error('test')),
      );

      try {
        registry.register(
          'gemini',
          (config) => new ErrorAdapter('gemini', config, new Error('test2')),
        );
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect(isLlmError(error)).toBe(true);
        expect((error as LlmError).type).toBe(LlmErrorType.VALIDATION);
      }
    });

    it('should allow overwrite with force option', () => {
      registry.register(
        'gemini',
        (config) => new ErrorAdapter('gemini', config, new Error('v1')),
      );
      registry.register(
        'gemini',
        (config) => new ErrorAdapter('gemini', config, new Error('v2')),
        { force: true },
      );

      expect(registry.has('gemini')).toBe(true);
    });
  });

  // ==========================================================================
  // LlmError Serialization
  // ==========================================================================

  describe('error serialization', () => {
    it('should serialize LlmError to JSON with all fields', () => {
      const error = new RateLimitError('Rate limited', {
        provider: 'claude',
        code: '429',
        statusCode: 429,
        retryAfterMs: 5000,
      });

      const json = error.toJSON();
      expect(json['name']).toBe('RateLimitError');
      expect(json['type']).toBe(LlmErrorType.RATE_LIMIT);
      expect(json['provider']).toBe('claude');
      expect(json['code']).toBe('429');
      expect(json['statusCode']).toBe(429);
      expect(json['isRetryable']).toBe(true);
      expect(json['retryAfterMs']).toBe(5000);
    });

    it('should include statusCode from provider-specific errors', () => {
      const providers = [
        { name: 'gemini', status: 401 },
        { name: 'claude', status: 401 },
        { name: 'openai', status: 401 },
      ];

      for (const p of providers) {
        const error = new AuthenticationError('Unauthorized', {
          provider: p.name,
          statusCode: p.status,
        });
        expect(error.statusCode).toBe(401);
        expect(error.provider).toBe(p.name);
      }
    });
  });
});
