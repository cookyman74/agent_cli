/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M3.4.1.3 — Provider config validation integration test
 *
 * Tests configuration handling across all 3 providers:
 * - Config passthrough to adapters
 * - Required config validation
 * - Provider-specific config interpretation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry } from '../registry.js';
import { ProviderFactory } from '../factory.js';
import { BaseAdapter } from '../baseAdapter.js';
import { LlmError, LlmErrorType } from '../errors.js';
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmProviderCapabilities,
  LlmGenerateConfig,
  AdapterConfig,
  GenerateOptions,
} from '../types.js';
import type { LlmEventStream } from '../events.js';
import { LlmEventType } from '../events.js';

// ============================================================================
// Config-Aware Mock Adapter
// ============================================================================

class ConfigCapturingAdapter extends BaseAdapter {
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

  /** Expose config for assertions */
  readonly capturedConfig: AdapterConfig;

  constructor(provider: string, config: AdapterConfig) {
    super(config);
    this.providerName = provider;
    this.capturedConfig = config;
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
    this.validateRequest(request);
    return {
      id: `${this.providerName}-resp`,
      content: [{ type: 'text', text: 'ok' }],
      model: request.model,
      stopReason: 'end_turn',
    };
  }

  async *generateContentStream(
    request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): LlmEventStream {
    this.validateRequest(request);
    yield { type: LlmEventType.Finished, finishReason: 'end_turn' };
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('M3.4.1.3 — Provider config validation integration', () => {
  let registry: ProviderRegistry;
  let factory: ProviderFactory;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.clear();
    factory = new ProviderFactory(registry);

    // Register config-capturing adapters for each provider
    registry.register(
      'gemini',
      (config) => new ConfigCapturingAdapter('gemini', config),
    );
    registry.register(
      'claude',
      (config) => new ConfigCapturingAdapter('claude', config),
    );
    registry.register(
      'openai',
      (config) => new ConfigCapturingAdapter('openai', config),
    );
  });

  // ==========================================================================
  // Config Passthrough
  // ==========================================================================

  describe('config passthrough', () => {
    it('should pass apiKey to adapter config', () => {
      const adapter = factory.create('claude', {
        apiKey: 'sk-test-123',
      }) as ConfigCapturingAdapter;

      expect(adapter.capturedConfig.apiKey).toBe('sk-test-123');
    });

    it('should pass baseUrl to adapter config', () => {
      const adapter = factory.create('openai', {
        apiKey: 'key',
        baseUrl: 'https://custom.openai.api/v1',
      }) as ConfigCapturingAdapter;

      expect(adapter.capturedConfig.baseUrl).toBe(
        'https://custom.openai.api/v1',
      );
    });

    it('should pass timeout and maxRetries to adapter config', () => {
      const adapter = factory.create('gemini', {
        apiKey: 'key',
        timeout: 30_000,
        maxRetries: 3,
      }) as ConfigCapturingAdapter;

      expect(adapter.capturedConfig.timeout).toBe(30_000);
      expect(adapter.capturedConfig.maxRetries).toBe(3);
    });

    it('should pass provider-specific config via index signature', () => {
      const adapter = factory.create('claude', {
        apiKey: 'key',
        maxTokens: 4096,
        customOption: 'value',
      }) as ConfigCapturingAdapter;

      expect(adapter.capturedConfig['maxTokens']).toBe(4096);
      expect(adapter.capturedConfig['customOption']).toBe('value');
    });
  });

  // ==========================================================================
  // Factory Validation (createWithValidation)
  // ==========================================================================

  describe('createWithValidation', () => {
    it('should create adapter without requireApiKey by default', () => {
      const adapter = factory.createWithValidation('gemini', {});
      expect(adapter.providerName).toBe('gemini');
    });

    it('should throw VALIDATION when requireApiKey is true and apiKey is missing', () => {
      try {
        factory.createWithValidation('claude', {}, { requireApiKey: true });
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(LlmError);
        expect((error as LlmError).type).toBe(LlmErrorType.VALIDATION);
        expect((error as LlmError).message).toContain('apiKey');
      }
    });

    it('should succeed with requireApiKey when apiKey is provided', () => {
      const adapter = factory.createWithValidation(
        'openai',
        { apiKey: 'sk-test' },
        { requireApiKey: true },
      );
      expect(adapter.providerName).toBe('openai');
    });

    it('should throw PROVIDER_NOT_FOUND for unregistered provider before config validation', () => {
      try {
        factory.createWithValidation(
          'anthropic-vertex',
          {},
          { requireApiKey: true },
        );
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(LlmError);
        // PROVIDER_NOT_FOUND takes precedence over VALIDATION
        expect((error as LlmError).type).toBe(LlmErrorType.PROVIDER_NOT_FOUND);
      }
    });
  });

  // ==========================================================================
  // Request Config Interpretation
  // ==========================================================================

  describe('request config interpretation', () => {
    it('should accept temperature/topP/maxTokens in request for all providers', async () => {
      const providers = ['gemini', 'claude', 'openai'] as const;

      for (const provider of providers) {
        const adapter = factory.create(provider, { apiKey: 'key' });
        const request: LlmGenerateRequest = {
          model: `${provider}-model`,
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'test' }] },
          ],
          temperature: 0.7,
          topP: 0.9,
          maxTokens: 1024,
        };

        // Should not throw — request passes validateRequest
        const response = await adapter.generateContent(request, 'prompt-1');
        expect(response.stopReason).toBe('end_turn');
      }
    });

    it('should accept systemInstruction in request for all providers', async () => {
      const providers = ['gemini', 'claude', 'openai'] as const;

      for (const provider of providers) {
        const adapter = factory.create(provider, { apiKey: 'key' });
        const request: LlmGenerateRequest = {
          model: `${provider}-model`,
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'test' }] },
          ],
          systemInstruction: 'You are a helpful assistant.',
        };

        const response = await adapter.generateContent(request, 'prompt-1');
        expect(response.stopReason).toBe('end_turn');
      }
    });

    it('should accept tools in request for all providers', async () => {
      const providers = ['gemini', 'claude', 'openai'] as const;

      for (const provider of providers) {
        const adapter = factory.create(provider, { apiKey: 'key' });
        const request: LlmGenerateRequest = {
          model: `${provider}-model`,
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'test' }] },
          ],
          tools: [
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
          ],
        };

        const response = await adapter.generateContent(request, 'prompt-1');
        expect(response.stopReason).toBe('end_turn');
      }
    });
  });

  // ==========================================================================
  // BaseAdapter Validation (common across all providers)
  // ==========================================================================

  describe('base adapter validation', () => {
    it('should reject request with empty model', async () => {
      const adapter = factory.create('claude', { apiKey: 'key' });
      const request: LlmGenerateRequest = {
        model: '',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'test' }] }],
      };

      await expect(
        adapter.generateContent(request, 'prompt-1'),
      ).rejects.toThrow(LlmError);
    });

    it('should reject request with empty messages', async () => {
      const adapter = factory.create('openai', { apiKey: 'key' });
      const request: LlmGenerateRequest = {
        model: 'gpt-4o',
        messages: [],
      };

      await expect(
        adapter.generateContent(request, 'prompt-1'),
      ).rejects.toThrow(LlmError);
    });

    it('should apply validation consistently across all providers', async () => {
      const providers = ['gemini', 'claude', 'openai'] as const;
      const badRequest: LlmGenerateRequest = {
        model: '',
        messages: [],
      };

      for (const provider of providers) {
        const adapter = factory.create(provider, { apiKey: 'key' });
        await expect(
          adapter.generateContent(badRequest, 'prompt-1'),
        ).rejects.toThrow(LlmError);
      }
    });
  });
});
