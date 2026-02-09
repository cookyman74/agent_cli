/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for bootstrapClaudeProvider — registers the Claude adapter
 * factory in the ProviderRegistry with has() guard for idempotent calls.
 *
 * @see docs/ai_adapter/todolist/phase3_provider_extension_todolist.md §3.1.0.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from '../registry.js';
import { bootstrapClaudeProvider } from './bootstrap.js';

// Mock @anthropic-ai/sdk to avoid real SDK instantiation
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}));

describe('bootstrapClaudeProvider', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.clear();
  });

  afterEach(() => {
    registry.clear();
  });

  it('should register claude factory in the registry', () => {
    expect(registry.has('claude')).toBe(false);
    bootstrapClaudeProvider(registry);
    expect(registry.has('claude')).toBe(true);
  });

  it('should not throw on duplicate bootstrap (has() guard)', () => {
    bootstrapClaudeProvider(registry);
    expect(() => bootstrapClaudeProvider(registry)).not.toThrow();
  });

  it('should create a ClaudeAdapter instance from the registered factory', () => {
    bootstrapClaudeProvider(registry);
    const adapter = registry.createAdapter('claude', { apiKey: 'test-key' });
    expect(adapter.providerName).toBe('claude');
  });

  it('should use singleton registry when no argument provided', () => {
    bootstrapClaudeProvider();
    expect(ProviderRegistry.getInstance().has('claude')).toBe(true);
  });

  it('should pass apiKey through to Anthropic SDK', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    bootstrapClaudeProvider(registry);
    registry.createAdapter('claude', { apiKey: 'my-api-key' });
    expect(Anthropic).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'my-api-key' }),
    );
  });

  it('should pass baseURL config through to Anthropic SDK', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    bootstrapClaudeProvider(registry);
    registry.createAdapter('claude', {
      apiKey: 'key',
      baseUrl: 'https://custom.api.anthropic.com',
    });
    expect(Anthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://custom.api.anthropic.com',
      }),
    );
  });

  it('should handle undefined apiKey gracefully', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default;
    bootstrapClaudeProvider(registry);
    registry.createAdapter('claude', {});
    expect(Anthropic).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: undefined }),
    );
  });
});
