/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getProviderFromConfig,
  validateProviderConfig,
  validateResolvedConfig,
  resolveProviderEnvVars,
} from './providerConfigIntegration.js';
import { ProviderType, AuthType } from './providerTypes.js';
import { LlmError } from './errors.js';

describe('providerConfigIntegration', () => {
  beforeEach(() => {
    vi.stubEnv('LLM_PROVIDER', '');
    vi.stubEnv('LLM_API_KEY', '');
    vi.stubEnv('LLM_BASE_URL', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('DIDIM_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('getProviderFromConfig', () => {
    it('should return Gemini by default when no config provided', () => {
      const result = getProviderFromConfig({});

      expect(result.type).toBe(ProviderType.Gemini);
    });

    it('should prioritize explicit provider option over env var', () => {
      vi.stubEnv('LLM_PROVIDER', 'openai');
      vi.stubEnv('OPENAI_API_KEY', 'xxx');

      const result = getProviderFromConfig({
        provider: ProviderType.Claude,
        apiKey: 'sk-ant-xxx',
      });

      expect(result.type).toBe(ProviderType.Claude);
      expect(result.apiKey).toBe('sk-ant-xxx');
    });

    it('should use authType when provider not specified', () => {
      vi.stubEnv('GEMINI_API_KEY', 'xxx');

      const result = getProviderFromConfig({
        authType: AuthType.USE_GEMINI,
      });

      expect(result.type).toBe(ProviderType.Gemini);
      expect(result.authType).toBe(AuthType.USE_GEMINI);
    });

    it('should return baseUrl for OpenAI-compatible', () => {
      const result = getProviderFromConfig({
        provider: ProviderType.OpenAICompatible,
        baseUrl: 'https://api.local.com',
      });

      expect(result.type).toBe(ProviderType.OpenAICompatible);
      expect(result.baseUrl).toBe('https://api.local.com');
    });

    it('should resolve baseUrl from env for OpenAI-compatible', () => {
      vi.stubEnv('LLM_PROVIDER', 'openai-compatible');
      vi.stubEnv('LLM_BASE_URL', 'https://env.api.com');

      const result = getProviderFromConfig({});

      expect(result.type).toBe(ProviderType.OpenAICompatible);
      expect(result.baseUrl).toBe('https://env.api.com');
    });

    it('should fallback to env var when no explicit options', () => {
      vi.stubEnv('LLM_PROVIDER', 'didim');
      vi.stubEnv('DIDIM_API_KEY', 'xxx');
      vi.stubEnv('DIDIM_SERVER_ADDRESS', 'aistudio.didim365.com');

      const result = getProviderFromConfig({});

      expect(result.type).toBe(ProviderType.Didim);
    });

    it('should preserve timeout in resolved config', () => {
      const result = getProviderFromConfig({
        provider: ProviderType.Gemini,
        timeout: 30000,
      });

      expect(result.timeout).toBe(30000);
    });
  });

  describe('validateProviderConfig', () => {
    it('should pass for valid Gemini config with API key', () => {
      expect(() =>
        validateProviderConfig({
          provider: ProviderType.Gemini,
          apiKey: 'xxx',
        }),
      ).not.toThrow();
    });

    it('should pass for valid Gemini config with authType', () => {
      expect(() =>
        validateProviderConfig({
          provider: ProviderType.Gemini,
          authType: AuthType.USE_VERTEX_AI,
        }),
      ).not.toThrow();
    });

    it('should throw for Claude without API key', () => {
      expect(() =>
        validateProviderConfig({
          provider: ProviderType.Claude,
        }),
      ).toThrow(LlmError);
    });

    it('should throw for OpenAI without API key', () => {
      expect(() =>
        validateProviderConfig({
          provider: ProviderType.OpenAI,
        }),
      ).toThrow(LlmError);
    });

    it('should throw for OpenAICompatible without baseUrl', () => {
      expect(() =>
        validateProviderConfig({
          provider: ProviderType.OpenAICompatible,
        }),
      ).toThrow(LlmError);
    });

    it('should pass for OpenAICompatible with baseUrl only', () => {
      expect(() =>
        validateProviderConfig({
          provider: ProviderType.OpenAICompatible,
          baseUrl: 'https://api.local.com',
        }),
      ).not.toThrow();
    });

    it('should throw for Didim without API key', () => {
      expect(() =>
        validateProviderConfig({
          provider: ProviderType.Didim,
        }),
      ).toThrow(LlmError);
    });
  });

  describe('validateResolvedConfig', () => {
    it('should pass for Gemini without explicit credentials', () => {
      expect(() =>
        validateResolvedConfig({
          type: ProviderType.Gemini,
        }),
      ).not.toThrow();
    });

    it('should throw for Claude without API key', () => {
      expect(() =>
        validateResolvedConfig({
          type: ProviderType.Claude,
        }),
      ).toThrow(LlmError);
    });

    it('should pass for Claude with API key', () => {
      expect(() =>
        validateResolvedConfig({
          type: ProviderType.Claude,
          apiKey: 'sk-ant-xxx',
        }),
      ).not.toThrow();
    });

    it('should throw for OpenAICompatible without baseUrl', () => {
      expect(() =>
        validateResolvedConfig({
          type: ProviderType.OpenAICompatible,
        }),
      ).toThrow(LlmError);
    });

    it('should pass for OpenAICompatible with env-resolved baseUrl', () => {
      vi.stubEnv('LLM_BASE_URL', 'https://env.api.com');
      const resolved = getProviderFromConfig({
        provider: ProviderType.OpenAICompatible,
      });

      expect(() => validateResolvedConfig(resolved)).not.toThrow();
    });

    it('should throw for Didim without API key', () => {
      expect(() =>
        validateResolvedConfig({
          type: ProviderType.Didim,
        }),
      ).toThrow(LlmError);
    });
  });

  describe('resolveProviderEnvVars', () => {
    it('should resolve Gemini env vars', () => {
      vi.stubEnv('GEMINI_API_KEY', 'gemini-key');

      const result = resolveProviderEnvVars(ProviderType.Gemini);

      expect(result.apiKey).toBe('gemini-key');
    });

    it('should prefer GEMINI_API_KEY over GOOGLE_API_KEY', () => {
      vi.stubEnv('GEMINI_API_KEY', 'gemini-key');
      vi.stubEnv('GOOGLE_API_KEY', 'google-key');

      const result = resolveProviderEnvVars(ProviderType.Gemini);

      expect(result.apiKey).toBe('gemini-key');
    });

    it('should resolve Claude env vars', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'claude-key');

      const result = resolveProviderEnvVars(ProviderType.Claude);

      expect(result.apiKey).toBe('claude-key');
    });

    it('should resolve OpenAI env vars', () => {
      vi.stubEnv('OPENAI_API_KEY', 'openai-key');

      const result = resolveProviderEnvVars(ProviderType.OpenAI);

      expect(result.apiKey).toBe('openai-key');
    });

    it('should resolve OpenAI-compatible env vars', () => {
      vi.stubEnv('LLM_BASE_URL', 'https://api.local.com');
      vi.stubEnv('LLM_API_KEY', 'local-key');

      const result = resolveProviderEnvVars(ProviderType.OpenAICompatible);

      expect(result.baseUrl).toBe('https://api.local.com');
      expect(result.apiKey).toBe('local-key');
    });

    it('should resolve Didim env vars', () => {
      vi.stubEnv('DIDIM_API_KEY', 'didim-key');

      const result = resolveProviderEnvVars(ProviderType.Didim);

      expect(result.apiKey).toBe('didim-key');
    });
  });
});
