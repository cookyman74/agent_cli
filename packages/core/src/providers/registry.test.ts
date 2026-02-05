/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach } from 'vitest';
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

class MockClaudeAdapter extends BaseAdapter {
  readonly providerName = 'claude';
  readonly capabilities: LlmProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    supportsEmbedding: false,
    supportsTokenCount: true,
    supportsSystemMessage: true,
    supportsThought: true,
    maxContextLength: 200000,
    maxOutputTokens: 4096,
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
    return { totalTokens: 50 };
  }

  protected mapToProviderConfig(
    _config: LlmGenerateConfig,
  ): Record<string, unknown> {
    return {};
  }
}

// Adapter factory type for registration
type AdapterFactory = (config: AdapterConfig) => BaseAdapter;

describe('ProviderRegistry', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    // Reset singleton for each test
    registry = ProviderRegistry.getInstance();
    registry.clear();
  });

  describe('Singleton pattern', () => {
    it('should return the same instance', () => {
      const instance1 = ProviderRegistry.getInstance();
      const instance2 = ProviderRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('register()', () => {
    it('should register a provider factory', () => {
      const geminiFactory: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);

      registry.register('gemini', geminiFactory);

      expect(registry.has('gemini')).toBe(true);
    });

    it('should allow registering multiple providers', () => {
      const geminiFactory: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);
      const claudeFactory: AdapterFactory = (config) =>
        new MockClaudeAdapter(config);

      registry.register('gemini', geminiFactory);
      registry.register('claude', claudeFactory);

      expect(registry.has('gemini')).toBe(true);
      expect(registry.has('claude')).toBe(true);
    });

    it('should throw error when registering duplicate provider', () => {
      const geminiFactory: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);

      registry.register('gemini', geminiFactory);

      expect(() => registry.register('gemini', geminiFactory)).toThrow(
        'Provider "gemini" is already registered',
      );
    });

    it('should allow overriding with force option', () => {
      const factory1: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);
      const factory2: AdapterFactory = (config) =>
        new MockClaudeAdapter(config);

      registry.register('gemini', factory1);
      registry.register('gemini', factory2, { force: true });

      expect(registry.has('gemini')).toBe(true);
    });

    it('should normalize provider names to lowercase', () => {
      const geminiFactory: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);

      registry.register('Gemini', geminiFactory);

      expect(registry.has('gemini')).toBe(true);
      expect(registry.has('GEMINI')).toBe(true);
      expect(registry.has('GeMiNi')).toBe(true);
    });
  });

  describe('get()', () => {
    it('should return factory for registered provider', () => {
      const geminiFactory: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);

      registry.register('gemini', geminiFactory);

      const factory = registry.get('gemini');
      expect(factory).toBe(geminiFactory);
    });

    it('should return undefined for unregistered provider', () => {
      const factory = registry.get('nonexistent');
      expect(factory).toBeUndefined();
    });
  });

  describe('getOrThrow()', () => {
    it('should return factory for registered provider', () => {
      const geminiFactory: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);

      registry.register('gemini', geminiFactory);

      const factory = registry.getOrThrow('gemini');
      expect(factory).toBe(geminiFactory);
    });

    it('should throw error for unregistered provider', () => {
      expect(() => registry.getOrThrow('nonexistent')).toThrow(
        'Provider "nonexistent" is not registered',
      );
    });
  });

  describe('has()', () => {
    it('should return true for registered provider', () => {
      const geminiFactory: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);

      registry.register('gemini', geminiFactory);

      expect(registry.has('gemini')).toBe(true);
    });

    it('should return false for unregistered provider', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('list()', () => {
    it('should return empty array when no providers registered', () => {
      expect(registry.list()).toEqual([]);
    });

    it('should return list of registered provider names', () => {
      const geminiFactory: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);
      const claudeFactory: AdapterFactory = (config) =>
        new MockClaudeAdapter(config);

      registry.register('gemini', geminiFactory);
      registry.register('claude', claudeFactory);

      const list = registry.list();
      expect(list).toContain('gemini');
      expect(list).toContain('claude');
      expect(list).toHaveLength(2);
    });
  });

  describe('unregister()', () => {
    it('should remove a registered provider', () => {
      const geminiFactory: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);

      registry.register('gemini', geminiFactory);
      expect(registry.has('gemini')).toBe(true);

      registry.unregister('gemini');
      expect(registry.has('gemini')).toBe(false);
    });

    it('should return true when provider was removed', () => {
      const geminiFactory: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);

      registry.register('gemini', geminiFactory);

      expect(registry.unregister('gemini')).toBe(true);
    });

    it('should return false when provider was not found', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });
  });

  describe('clear()', () => {
    it('should remove all registered providers', () => {
      const geminiFactory: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);
      const claudeFactory: AdapterFactory = (config) =>
        new MockClaudeAdapter(config);

      registry.register('gemini', geminiFactory);
      registry.register('claude', claudeFactory);

      registry.clear();

      expect(registry.list()).toEqual([]);
    });
  });

  describe('createAdapter()', () => {
    it('should create adapter instance using registered factory', () => {
      const geminiFactory: AdapterFactory = (config) =>
        new MockGeminiAdapter(config);

      registry.register('gemini', geminiFactory);

      const adapter = registry.createAdapter('gemini', { apiKey: 'test-key' });

      expect(adapter).toBeInstanceOf(MockGeminiAdapter);
      expect(adapter.providerName).toBe('gemini');
    });

    it('should throw error for unregistered provider', () => {
      expect(() =>
        registry.createAdapter('nonexistent', { apiKey: 'test-key' }),
      ).toThrow('Provider "nonexistent" is not registered');
    });
  });
});
