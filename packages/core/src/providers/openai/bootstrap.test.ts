/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for bootstrapOpenAiProvider — registers the OpenAI adapter
 * factory in the ProviderRegistry with has() guard for idempotent calls.
 *
 * @see docs/ai_adapter/todolist/phase3_provider_extension_todolist.md §3.2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from '../registry.js';
import { bootstrapOpenAiProvider } from './bootstrap.js';

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

describe('bootstrapOpenAiProvider', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.clear();
  });

  afterEach(() => {
    registry.clear();
  });

  it('should register openai factory in the registry', () => {
    expect(registry.has('openai')).toBe(false);
    bootstrapOpenAiProvider(registry);
    expect(registry.has('openai')).toBe(true);
  });

  it('should not throw on duplicate bootstrap (has() guard)', () => {
    bootstrapOpenAiProvider(registry);
    expect(() => bootstrapOpenAiProvider(registry)).not.toThrow();
  });

  it('should create an OpenAiAdapter instance from the registered factory', () => {
    bootstrapOpenAiProvider(registry);
    const adapter = registry.createAdapter('openai', { apiKey: 'test-key' });
    expect(adapter.providerName).toBe('openai');
  });

  it('should use singleton registry when no argument provided', () => {
    bootstrapOpenAiProvider();
    expect(ProviderRegistry.getInstance().has('openai')).toBe(true);
  });

  it('should pass apiKey through to OpenAI SDK', async () => {
    const OpenAI = (await import('openai')).default;
    bootstrapOpenAiProvider(registry);
    registry.createAdapter('openai', { apiKey: 'my-api-key' });
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'my-api-key' }),
    );
  });

  it('should pass baseURL config through to OpenAI SDK', async () => {
    const OpenAI = (await import('openai')).default;
    bootstrapOpenAiProvider(registry);
    registry.createAdapter('openai', {
      apiKey: 'key',
      baseUrl: 'https://custom.openai.com/v1',
    });
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://custom.openai.com/v1',
      }),
    );
  });

  it('should default baseURL to the official OpenAI API', async () => {
    const OpenAI = (await import('openai')).default;
    bootstrapOpenAiProvider(registry);
    registry.createAdapter('openai', { apiKey: 'key' });
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.openai.com/v1',
      }),
    );
  });

  it('should handle undefined apiKey gracefully', async () => {
    const OpenAI = (await import('openai')).default;
    bootstrapOpenAiProvider(registry);
    registry.createAdapter('openai', {});
    expect(OpenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: undefined }),
    );
  });
});
