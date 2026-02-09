/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for bootstrapGeminiProvider — registers the Gemini adapter
 * factory in the ProviderRegistry with has() guard for idempotent calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProviderRegistry } from '../registry.js';
import { bootstrapGeminiProvider } from './bootstrap.js';

// Mock @google/genai to avoid real SDK instantiation
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
    },
  })),
}));

describe('bootstrapGeminiProvider', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.clear();
  });

  afterEach(() => {
    registry.clear();
  });

  it('should register gemini factory in the registry', () => {
    expect(registry.has('gemini')).toBe(false);
    bootstrapGeminiProvider(registry);
    expect(registry.has('gemini')).toBe(true);
  });

  it('should not throw on duplicate bootstrap (has() guard)', () => {
    bootstrapGeminiProvider(registry);
    expect(() => bootstrapGeminiProvider(registry)).not.toThrow();
  });

  it('should create a GeminiAdapter instance from the registered factory', () => {
    bootstrapGeminiProvider(registry);
    const adapter = registry.createAdapter('gemini', { apiKey: 'test-key' });
    expect(adapter.providerName).toBe('gemini');
  });

  it('should use singleton registry when no argument provided', () => {
    bootstrapGeminiProvider();
    expect(ProviderRegistry.getInstance().has('gemini')).toBe(true);
  });

  it('should pass apiKey through to GoogleGenAI', async () => {
    const { GoogleGenAI } = await import('@google/genai');
    bootstrapGeminiProvider(registry);
    registry.createAdapter('gemini', { apiKey: 'my-api-key' });
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'my-api-key' }),
    );
  });

  it('should pass vertexai config through to GoogleGenAI', async () => {
    const { GoogleGenAI } = await import('@google/genai');
    bootstrapGeminiProvider(registry);
    registry.createAdapter('gemini', {
      apiKey: 'key',
      vertexai: true,
    });
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({ vertexai: true }),
    );
  });

  it('should treat empty apiKey as undefined for GoogleGenAI', async () => {
    const { GoogleGenAI } = await import('@google/genai');
    bootstrapGeminiProvider(registry);
    registry.createAdapter('gemini', { apiKey: '' });
    expect(GoogleGenAI).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: undefined }),
    );
  });
});
