/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { restoreNonGeminiEnvVars } from './gemini.js';
import { type LoadedSettings } from './config/settings.js';

const mockLoadProviderApiKey = vi.fn();

vi.mock('@didim365/agent-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@didim365/agent-cli-core')>();
  return {
    ...actual,
    loadProviderApiKey: (...args: unknown[]) => mockLoadProviderApiKey(...args),
  };
});

function createSettings(
  authOverrides: Record<string, unknown> = {},
): LoadedSettings {
  return {
    merged: {
      security: {
        auth: authOverrides,
      },
    },
  } as unknown as LoadedSettings;
}

describe('restoreNonGeminiEnvVars', () => {
  const envKeysToClean = [
    'ENABLE_MULTI_PROVIDER',
    'LLM_PROVIDER',
    'ANTHROPIC_API_KEY',
    'OPENAI_API_KEY',
    'LLM_API_KEY',
    'DIDIM_API_KEY',
    'LLM_BASE_URL',
    'LLM_MODEL',
    'LLM_API_KEY_HEADER',
    'LLM_CUSTOM_HEADERS',
    'GOOGLE_CLOUD_PROJECT',
    'GOOGLE_CLOUD_LOCATION',
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadProviderApiKey.mockResolvedValue(null);
    // Clean env vars
    for (const key of envKeysToClean) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of envKeysToClean) {
      delete process.env[key];
    }
  });

  // --- Claude ---

  it('should set LLM_PROVIDER and load ANTHROPIC_API_KEY for Claude', async () => {
    mockLoadProviderApiKey.mockResolvedValue('sk-ant-xxx');
    const settings = createSettings();

    await restoreNonGeminiEnvVars('claude', settings);

    expect(process.env['ENABLE_MULTI_PROVIDER']).toBe('true');
    expect(process.env['LLM_PROVIDER']).toBe('claude');
    expect(process.env['ANTHROPIC_API_KEY']).toBe('sk-ant-xxx');
    expect(mockLoadProviderApiKey).toHaveBeenCalledWith('claude');
  });

  it('should not overwrite existing ANTHROPIC_API_KEY from env', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'user-set-key';
    mockLoadProviderApiKey.mockResolvedValue('keychain-key');
    const settings = createSettings();

    await restoreNonGeminiEnvVars('claude', settings);

    // User-set env var preserved
    expect(process.env['ANTHROPIC_API_KEY']).toBe('user-set-key');
    expect(mockLoadProviderApiKey).not.toHaveBeenCalled();
  });

  it('should not overwrite existing LLM_PROVIDER from env', async () => {
    process.env['LLM_PROVIDER'] = 'custom-provider';
    const settings = createSettings();

    await restoreNonGeminiEnvVars('claude', settings);

    expect(process.env['LLM_PROVIDER']).toBe('custom-provider');
  });

  // --- OpenAI ---

  it('should set OPENAI_API_KEY for OpenAI provider', async () => {
    mockLoadProviderApiKey.mockResolvedValue('sk-openai-xxx');
    const settings = createSettings();

    await restoreNonGeminiEnvVars('openai', settings);

    expect(process.env['ENABLE_MULTI_PROVIDER']).toBe('true');
    expect(process.env['LLM_PROVIDER']).toBe('openai');
    expect(process.env['OPENAI_API_KEY']).toBe('sk-openai-xxx');
  });

  it('should not overwrite existing OPENAI_API_KEY from env', async () => {
    process.env['OPENAI_API_KEY'] = 'user-openai-key';
    const settings = createSettings();

    await restoreNonGeminiEnvVars('openai', settings);

    expect(process.env['OPENAI_API_KEY']).toBe('user-openai-key');
    expect(mockLoadProviderApiKey).not.toHaveBeenCalled();
  });

  // --- Vertex AI ---

  it('should restore GOOGLE_CLOUD_PROJECT and LOCATION from vertexConfig', async () => {
    const settings = createSettings({
      vertexConfig: {
        project: 'my-project',
        location: 'us-central1',
      },
    });

    await restoreNonGeminiEnvVars('vertex-ai', settings);

    expect(process.env['GOOGLE_CLOUD_PROJECT']).toBe('my-project');
    expect(process.env['GOOGLE_CLOUD_LOCATION']).toBe('us-central1');
    // Vertex AI should NOT set multi-provider env vars
    expect(process.env['ENABLE_MULTI_PROVIDER']).toBeUndefined();
    expect(process.env['LLM_PROVIDER']).toBeUndefined();
  });

  it('should not overwrite existing GOOGLE_CLOUD_PROJECT from env', async () => {
    process.env['GOOGLE_CLOUD_PROJECT'] = 'env-project';
    process.env['GOOGLE_CLOUD_LOCATION'] = 'env-location';
    const settings = createSettings({
      vertexConfig: {
        project: 'settings-project',
        location: 'settings-location',
      },
    });

    await restoreNonGeminiEnvVars('vertex-ai', settings);

    expect(process.env['GOOGLE_CLOUD_PROJECT']).toBe('env-project');
    expect(process.env['GOOGLE_CLOUD_LOCATION']).toBe('env-location');
  });

  it('should handle missing vertexConfig gracefully', async () => {
    const settings = createSettings();

    await restoreNonGeminiEnvVars('vertex-ai', settings);

    expect(process.env['GOOGLE_CLOUD_PROJECT']).toBeUndefined();
    expect(process.env['GOOGLE_CLOUD_LOCATION']).toBeUndefined();
  });

  // --- sLM (openai-compatible) ---

  it('should restore sLM-specific env vars from slmConfig', async () => {
    mockLoadProviderApiKey.mockResolvedValue('slm-key');
    const settings = createSettings({
      slmConfig: {
        baseUrl: 'http://localhost:8080',
        model: 'local-llama',
        apiKeyHeaderName: 'X-Api-Key',
        customHeaders: 'X-Custom: value',
      },
    });

    await restoreNonGeminiEnvVars('openai-compatible', settings);

    expect(process.env['LLM_PROVIDER']).toBe('openai-compatible');
    expect(process.env['LLM_BASE_URL']).toBe('http://localhost:8080');
    expect(process.env['LLM_MODEL']).toBe('local-llama');
    expect(process.env['LLM_API_KEY_HEADER']).toBe('X-Api-Key');
    expect(process.env['LLM_CUSTOM_HEADERS']).toBe('X-Custom: value');
    expect(process.env['LLM_API_KEY']).toBe('slm-key');
  });

  it('should not overwrite existing sLM env vars', async () => {
    process.env['LLM_BASE_URL'] = 'http://user-set:9090';
    process.env['LLM_API_KEY'] = 'user-slm-key';
    const settings = createSettings({
      slmConfig: {
        baseUrl: 'http://settings:8080',
      },
    });

    await restoreNonGeminiEnvVars('openai-compatible', settings);

    expect(process.env['LLM_BASE_URL']).toBe('http://user-set:9090');
    expect(process.env['LLM_API_KEY']).toBe('user-slm-key');
  });

  // --- No key in keychain ---

  it('should handle missing keychain key gracefully', async () => {
    mockLoadProviderApiKey.mockResolvedValue(null);
    const settings = createSettings();

    await restoreNonGeminiEnvVars('claude', settings);

    expect(process.env['ANTHROPIC_API_KEY']).toBeUndefined();
    expect(process.env['LLM_PROVIDER']).toBe('claude');
  });
});
