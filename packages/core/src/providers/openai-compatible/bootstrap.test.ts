/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for bootstrapOpenAiCompatibleProvider — registers the
 * OpenAI-compatible adapter factory in the ProviderRegistry.
 *
 * @see docs/ai_adapter/todolist/phase3_provider_extension_todolist.md §3.3.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from '../registry.js';
import { bootstrapOpenAiCompatibleProvider } from './bootstrap.js';

// Mock openai SDK to avoid real SDK instantiation
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
    responses: {
      create: vi.fn(),
    },
  })),
}));

describe('bootstrapOpenAiCompatibleProvider', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.clear();
  });

  afterEach(() => {
    registry.clear();
    vi.unstubAllEnvs();
  });

  it('should register openai-compatible factory in the registry', () => {
    expect(registry.has('openai-compatible')).toBe(false);
    bootstrapOpenAiCompatibleProvider(registry);
    expect(registry.has('openai-compatible')).toBe(true);
  });

  it('should not throw on duplicate bootstrap (has() guard)', () => {
    bootstrapOpenAiCompatibleProvider(registry);
    expect(() => bootstrapOpenAiCompatibleProvider(registry)).not.toThrow();
  });

  it('should create an adapter with providerName "openai-compatible"', () => {
    bootstrapOpenAiCompatibleProvider(registry);
    const adapter = registry.createAdapter('openai-compatible', {
      baseUrl: 'http://localhost:8000/v1',
    });
    expect(adapter.providerName).toBe('openai-compatible');
  });

  it('should use singleton registry when no argument provided', () => {
    bootstrapOpenAiCompatibleProvider();
    expect(ProviderRegistry.getInstance().has('openai-compatible')).toBe(true);
  });

  it('should pass baseURL through to OpenAI SDK', async () => {
    const OpenAI = (await import('openai')).default;
    bootstrapOpenAiCompatibleProvider(registry);
    registry.createAdapter('openai-compatible', {
      baseUrl: 'http://localhost:8000/v1',
    });
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://localhost:8000/v1',
      }),
    );
  });

  it('should pass apiKey through to OpenAI SDK', async () => {
    const OpenAI = (await import('openai')).default;
    bootstrapOpenAiCompatibleProvider(registry);
    registry.createAdapter('openai-compatible', {
      apiKey: 'my-api-key',
      baseUrl: 'http://localhost:8000/v1',
    });
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'my-api-key' }),
    );
  });

  it('should work without apiKey (local server)', async () => {
    const OpenAI = (await import('openai')).default;
    bootstrapOpenAiCompatibleProvider(registry);
    const adapter = registry.createAdapter('openai-compatible', {
      baseUrl: 'http://localhost:11434/v1',
    });
    expect(adapter).toBeDefined();
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'http://localhost:11434/v1',
      }),
    );
  });

  it('should pass LLM_CUSTOM_HEADERS as defaultHeaders', async () => {
    vi.stubEnv(
      'LLM_CUSTOM_HEADERS',
      JSON.stringify({ 'X-Custom': 'value', 'X-Another': 'test' }),
    );

    const OpenAI = (await import('openai')).default;
    bootstrapOpenAiCompatibleProvider(registry);
    registry.createAdapter('openai-compatible', {
      baseUrl: 'http://localhost:8000/v1',
    });
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultHeaders: expect.objectContaining({
          'X-Custom': 'value',
          'X-Another': 'test',
        }),
      }),
    );
  });

  it('should support LLM_API_KEY_HEADER for custom auth header', async () => {
    vi.stubEnv('LLM_API_KEY_HEADER', 'X-Custom-Auth');

    const OpenAI = (await import('openai')).default;
    bootstrapOpenAiCompatibleProvider(registry);
    registry.createAdapter('openai-compatible', {
      apiKey: 'my-key',
      baseUrl: 'http://localhost:8000/v1',
    });
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        defaultHeaders: expect.objectContaining({
          'X-Custom-Auth': 'my-key',
        }),
      }),
    );
  });

  it('should suppress default apiKey when LLM_API_KEY_HEADER is set', async () => {
    vi.stubEnv('LLM_API_KEY_HEADER', 'X-Custom-Auth');

    const OpenAI = (await import('openai')).default;
    bootstrapOpenAiCompatibleProvider(registry);
    registry.createAdapter('openai-compatible', {
      apiKey: 'real-key',
      baseUrl: 'http://localhost:8000/v1',
    });
    // When custom auth header is used:
    // 1. SDK apiKey = 'not-needed' (prevents SDK from using the real key)
    // 2. Authorization = null (SDK treats null as "delete this header",
    //    stripping the auto-generated Authorization: Bearer header)
    // 3. Custom header carries the real key
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'not-needed',
        defaultHeaders: expect.objectContaining({
          'X-Custom-Auth': 'real-key',
          Authorization: null,
        }),
      }),
    );
  });

  it('should ignore malformed LLM_CUSTOM_HEADERS', async () => {
    vi.stubEnv('LLM_CUSTOM_HEADERS', 'not-valid-json');

    const OpenAI = (await import('openai')).default;
    bootstrapOpenAiCompatibleProvider(registry);
    registry.createAdapter('openai-compatible', {
      baseUrl: 'http://localhost:8000/v1',
    });
    // Should not throw, just ignore bad JSON
    expect(OpenAI).toHaveBeenCalled();
  });
});
