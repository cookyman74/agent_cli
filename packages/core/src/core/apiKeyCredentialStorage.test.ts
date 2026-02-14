/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  loadApiKey,
  saveApiKey,
  clearApiKey,
  loadProviderApiKey,
  saveProviderApiKey,
  clearProviderApiKey,
  PROVIDER_KEYCHAIN_ENTRIES,
} from './apiKeyCredentialStorage.js';

const getCredentialsMock = vi.hoisted(() => vi.fn());
const setCredentialsMock = vi.hoisted(() => vi.fn());
const deleteCredentialsMock = vi.hoisted(() => vi.fn());

vi.mock('../mcp/token-storage/hybrid-token-storage.js', () => ({
  HybridTokenStorage: vi.fn().mockImplementation(() => ({
    getCredentials: getCredentialsMock,
    setCredentials: setCredentialsMock,
    deleteCredentials: deleteCredentialsMock,
  })),
}));

describe('ApiKeyCredentialStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Backward-compatible alias tests (existing behavior) ---

  it('should load an API key', async () => {
    getCredentialsMock.mockResolvedValue({
      serverName: 'default-api-key',
      token: {
        accessToken: 'test-key',
        tokenType: 'ApiKey',
      },
      updatedAt: Date.now(),
    });

    const apiKey = await loadApiKey();
    expect(apiKey).toBe('test-key');
    expect(getCredentialsMock).toHaveBeenCalledWith('default-api-key');
  });

  it('should return null if no API key is stored', async () => {
    getCredentialsMock.mockResolvedValue(null);
    const apiKey = await loadApiKey();
    expect(apiKey).toBeNull();
    expect(getCredentialsMock).toHaveBeenCalledWith('default-api-key');
  });

  it('should save an API key', async () => {
    await saveApiKey('new-key');
    expect(setCredentialsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: 'default-api-key',
        token: expect.objectContaining({
          accessToken: 'new-key',
          tokenType: 'ApiKey',
        }),
      }),
    );
  });

  it('should clear an API key when saving empty key', async () => {
    await saveApiKey('');
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
    expect(setCredentialsMock).not.toHaveBeenCalled();
  });

  it('should clear an API key when saving null key', async () => {
    await saveApiKey(null);
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
    expect(setCredentialsMock).not.toHaveBeenCalled();
  });

  it('should clear an API key', async () => {
    await clearApiKey();
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
  });

  it('should not throw when clearing an API key fails', async () => {
    deleteCredentialsMock.mockRejectedValueOnce(new Error('Failed to delete'));
    await expect(saveApiKey('')).resolves.not.toThrow();
    expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
  });

  // --- Per-provider API key tests ---

  describe('PROVIDER_KEYCHAIN_ENTRIES', () => {
    it('should map gemini to default-api-key for backward compatibility', () => {
      expect(PROVIDER_KEYCHAIN_ENTRIES['gemini']).toBe('default-api-key');
    });

    it('should have entries for all known providers', () => {
      expect(PROVIDER_KEYCHAIN_ENTRIES['claude']).toBe('claude-api-key');
      expect(PROVIDER_KEYCHAIN_ENTRIES['openai']).toBe('openai-api-key');
      expect(PROVIDER_KEYCHAIN_ENTRIES['openai-compatible']).toBe(
        'slm-api-key',
      );
      expect(PROVIDER_KEYCHAIN_ENTRIES['didim']).toBe('didim-api-key');
    });
  });

  describe('loadProviderApiKey', () => {
    it('should load Claude API key with correct entry name', async () => {
      getCredentialsMock.mockResolvedValue({
        serverName: 'claude-api-key',
        token: { accessToken: 'sk-ant-test', tokenType: 'ApiKey' },
        updatedAt: Date.now(),
      });

      const key = await loadProviderApiKey('claude');
      expect(key).toBe('sk-ant-test');
      expect(getCredentialsMock).toHaveBeenCalledWith('claude-api-key');
    });

    it('should load OpenAI API key with correct entry name', async () => {
      getCredentialsMock.mockResolvedValue({
        serverName: 'openai-api-key',
        token: { accessToken: 'sk-openai-test', tokenType: 'ApiKey' },
        updatedAt: Date.now(),
      });

      const key = await loadProviderApiKey('openai');
      expect(key).toBe('sk-openai-test');
      expect(getCredentialsMock).toHaveBeenCalledWith('openai-api-key');
    });

    it('should load Gemini API key using default entry name', async () => {
      getCredentialsMock.mockResolvedValue({
        serverName: 'default-api-key',
        token: { accessToken: 'gemini-key', tokenType: 'ApiKey' },
        updatedAt: Date.now(),
      });

      const key = await loadProviderApiKey('gemini');
      expect(key).toBe('gemini-key');
      expect(getCredentialsMock).toHaveBeenCalledWith('default-api-key');
    });

    it('should return null for unknown provider with no stored key', async () => {
      getCredentialsMock.mockResolvedValue(null);
      const key = await loadProviderApiKey('unknown-provider');
      expect(key).toBeNull();
      // Falls back to provider name as entry name
      expect(getCredentialsMock).toHaveBeenCalledWith('unknown-provider');
    });

    it('should return null on storage error', async () => {
      getCredentialsMock.mockRejectedValue(new Error('Storage error'));
      const key = await loadProviderApiKey('claude');
      expect(key).toBeNull();
    });
  });

  describe('saveProviderApiKey', () => {
    it('should save Claude API key with correct entry name', async () => {
      await saveProviderApiKey('claude', 'sk-ant-xxx');
      expect(setCredentialsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName: 'claude-api-key',
          token: expect.objectContaining({
            accessToken: 'sk-ant-xxx',
            tokenType: 'ApiKey',
          }),
        }),
      );
    });

    it('should save sLM API key with correct entry name', async () => {
      await saveProviderApiKey('openai-compatible', 'slm-key');
      expect(setCredentialsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName: 'slm-api-key',
          token: expect.objectContaining({
            accessToken: 'slm-key',
          }),
        }),
      );
    });

    it('should delete when saving empty key for a provider', async () => {
      await saveProviderApiKey('openai', '');
      expect(deleteCredentialsMock).toHaveBeenCalledWith('openai-api-key');
      expect(setCredentialsMock).not.toHaveBeenCalled();
    });

    it('should delete when saving null key for a provider', async () => {
      await saveProviderApiKey('claude', null);
      expect(deleteCredentialsMock).toHaveBeenCalledWith('claude-api-key');
      expect(setCredentialsMock).not.toHaveBeenCalled();
    });
  });

  describe('clearProviderApiKey', () => {
    it('should clear Claude API key', async () => {
      await clearProviderApiKey('claude');
      expect(deleteCredentialsMock).toHaveBeenCalledWith('claude-api-key');
    });

    it('should clear OpenAI API key', async () => {
      await clearProviderApiKey('openai');
      expect(deleteCredentialsMock).toHaveBeenCalledWith('openai-api-key');
    });

    it('should not throw when clearing fails', async () => {
      deleteCredentialsMock.mockRejectedValueOnce(new Error('Failed'));
      await expect(clearProviderApiKey('claude')).resolves.not.toThrow();
    });
  });

  describe('backward compatibility: aliases delegate to gemini', () => {
    it('loadApiKey delegates to loadProviderApiKey(gemini)', async () => {
      getCredentialsMock.mockResolvedValue({
        serverName: 'default-api-key',
        token: { accessToken: 'gem-key', tokenType: 'ApiKey' },
        updatedAt: Date.now(),
      });

      const key = await loadApiKey();
      expect(key).toBe('gem-key');
      expect(getCredentialsMock).toHaveBeenCalledWith('default-api-key');
    });

    it('saveApiKey delegates to saveProviderApiKey(gemini, key)', async () => {
      await saveApiKey('gem-key');
      expect(setCredentialsMock).toHaveBeenCalledWith(
        expect.objectContaining({
          serverName: 'default-api-key',
        }),
      );
    });

    it('clearApiKey delegates to clearProviderApiKey(gemini)', async () => {
      await clearApiKey();
      expect(deleteCredentialsMock).toHaveBeenCalledWith('default-api-key');
    });
  });
});
