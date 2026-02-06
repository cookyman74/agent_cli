/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ProviderFactory } from './factory.js';
import { ProviderRegistry } from './registry.js';
import { BaseAdapter } from './baseAdapter.js';
import type {
  LlmProviderCapabilities,
  AdapterConfig,
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmGenerateConfig,
  GenerateOptions,
  LlmTokenCount,
} from './types.js';
import { LlmEventType } from './events.js';
import type { LlmEventStream } from './events.js';
import { LlmErrorType } from './errors.js';

// Mock adapter for testing
class MockGeminiAdapter extends BaseAdapter {
  readonly providerName = 'gemini';
  readonly capabilities: LlmProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    supportsEmbedding: true,
    supportsTokenCount: true,
    supportsSystemMessage: true,
    supportsThought: true,
    maxContextLength: 128000,
    maxOutputTokens: 8192,
  };

  constructor(config: AdapterConfig) {
    super(config);
  }

  async generateContent(
    _request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    return {} as LlmGenerateResponse;
  }

  async *generateContentStream(
    _request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): LlmEventStream {
    yield { type: LlmEventType.TextDelta, text: 'test' };
  }

  override async countTokens(
    _request: LlmGenerateRequest,
  ): Promise<LlmTokenCount> {
    return { totalTokens: 100 };
  }

  protected mapToProviderConfig(
    _config: LlmGenerateConfig,
  ): Record<string, unknown> {
    return {};
  }
}

describe('ProviderFactory', () => {
  let factory: ProviderFactory;
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.clear();
    factory = new ProviderFactory(registry);
  });

  describe('constructor', () => {
    it('should create factory with registry', () => {
      expect(factory).toBeDefined();
    });

    it('should use singleton registry if not provided', () => {
      const defaultFactory = new ProviderFactory();
      expect(defaultFactory).toBeDefined();
    });
  });

  describe('create()', () => {
    it('should create adapter from registered factory', () => {
      registry.register('gemini', (config) => new MockGeminiAdapter(config));

      const adapter = factory.create('gemini', { apiKey: 'test-key' });

      expect(adapter).toBeInstanceOf(MockGeminiAdapter);
      expect(adapter.providerName).toBe('gemini');
    });

    it('should throw error for unregistered provider', () => {
      expect(() =>
        factory.create('nonexistent', { apiKey: 'test-key' }),
      ).toThrow('Provider "nonexistent" is not registered');
    });

    it('should normalize provider name case', () => {
      registry.register('gemini', (config) => new MockGeminiAdapter(config));

      const adapter = factory.create('GEMINI', { apiKey: 'test-key' });

      expect(adapter).toBeInstanceOf(MockGeminiAdapter);
    });

    it('should pass config to adapter factory', () => {
      const mockFactory = vi.fn(
        (config: AdapterConfig) => new MockGeminiAdapter(config),
      );
      registry.register('gemini', mockFactory);

      const config = { apiKey: 'my-api-key', baseUrl: 'https://custom.api' };
      factory.create('gemini', config);

      expect(mockFactory).toHaveBeenCalledWith(config);
    });
  });

  describe('createWithValidation()', () => {
    it('should create adapter without apiKey validation by default', () => {
      registry.register('gemini', (config) => new MockGeminiAdapter(config));

      // No apiKey required by default (supports OAuth/ADC)
      const adapter = factory.createWithValidation('gemini', {});

      expect(adapter).toBeInstanceOf(MockGeminiAdapter);
    });

    it('should create adapter with apiKey when provided', () => {
      registry.register('gemini', (config) => new MockGeminiAdapter(config));

      const adapter = factory.createWithValidation('gemini', {
        apiKey: 'test-key',
      });

      expect(adapter).toBeInstanceOf(MockGeminiAdapter);
    });

    it('should throw error for missing apiKey when requireApiKey is true', () => {
      registry.register('gemini', (config) => new MockGeminiAdapter(config));

      expect(() =>
        factory.createWithValidation('gemini', {}, { requireApiKey: true }),
      ).toThrow('apiKey is required in adapter configuration');
    });

    it('should throw PROVIDER_NOT_FOUND before checking apiKey (priority order)', () => {
      // Unregistered provider with missing apiKey should throw PROVIDER_NOT_FOUND
      try {
        factory.createWithValidation(
          'nonexistent',
          {},
          { requireApiKey: true },
        );
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect((error as { type: string }).type).toBe(
          LlmErrorType.PROVIDER_NOT_FOUND,
        );
      }
    });
  });

  describe('canCreate()', () => {
    it('should return true for registered provider', () => {
      registry.register('gemini', (config) => new MockGeminiAdapter(config));

      expect(factory.canCreate('gemini')).toBe(true);
    });

    it('should return false for unregistered provider', () => {
      expect(factory.canCreate('nonexistent')).toBe(false);
    });

    it('should normalize provider name case', () => {
      registry.register('gemini', (config) => new MockGeminiAdapter(config));

      expect(factory.canCreate('GEMINI')).toBe(true);
      expect(factory.canCreate('Gemini')).toBe(true);
    });
  });

  describe('getAvailableProviders()', () => {
    it('should return empty array when no providers registered', () => {
      expect(factory.getAvailableProviders()).toEqual([]);
    });

    it('should return list of registered providers', () => {
      registry.register('gemini', (config) => new MockGeminiAdapter(config));
      registry.register('claude', (config) => new MockGeminiAdapter(config));

      const providers = factory.getAvailableProviders();
      expect(providers).toContain('gemini');
      expect(providers).toContain('claude');
      expect(providers).toHaveLength(2);
    });
  });

  describe('error handling', () => {
    it('should throw PROVIDER_NOT_FOUND for unregistered provider', () => {
      try {
        factory.create('unknown', { apiKey: 'test' });
        expect.fail('Should have thrown');
      } catch (error: unknown) {
        expect((error as { type: string }).type).toBe(
          LlmErrorType.PROVIDER_NOT_FOUND,
        );
      }
    });
  });
});
