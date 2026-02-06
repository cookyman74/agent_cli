/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  selectProvider,
  getRequiredEnvVars,
  validateProviderEnv,
} from './providerSelector.js';
import { ProviderType, AuthType } from './providerTypes.js';

describe('ProviderSelector', () => {
  beforeEach(() => {
    vi.stubEnv('LLM_PROVIDER', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GOOGLE_API_KEY', '');
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', '');
    vi.stubEnv('DIDIM_API_KEY', '');
    vi.stubEnv('LLM_BASE_URL', '');
    vi.stubEnv('LLM_API_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('selectProvider()', () => {
    it('should prioritize LLM_PROVIDER over authType', () => {
      vi.stubEnv('LLM_PROVIDER', 'claude');
      vi.stubEnv('ANTHROPIC_API_KEY', 'xxx');

      const result = selectProvider();

      expect(result.type).toBe(ProviderType.Claude);
    });

    it('should use authType for Gemini when LLM_PROVIDER not set', () => {
      vi.stubEnv('GEMINI_API_KEY', 'xxx');

      const result = selectProvider({ authType: AuthType.USE_GEMINI });

      expect(result.type).toBe(ProviderType.Gemini);
      expect(result.authType).toBe(AuthType.USE_GEMINI);
    });

    it('should default to Gemini with GEMINI_API_KEY', () => {
      vi.stubEnv('GEMINI_API_KEY', 'xxx');

      const result = selectProvider();

      expect(result.type).toBe(ProviderType.Gemini);
    });

    it('should select Claude when LLM_PROVIDER=claude', () => {
      vi.stubEnv('LLM_PROVIDER', 'claude');
      vi.stubEnv('ANTHROPIC_API_KEY', 'xxx');

      const result = selectProvider();

      expect(result.type).toBe(ProviderType.Claude);
    });

    it('should select OpenAI when LLM_PROVIDER=openai', () => {
      vi.stubEnv('LLM_PROVIDER', 'openai');
      vi.stubEnv('OPENAI_API_KEY', 'xxx');

      const result = selectProvider();

      expect(result.type).toBe(ProviderType.OpenAI);
    });

    it('should include baseUrl for OpenAI-compatible', () => {
      vi.stubEnv('LLM_PROVIDER', 'openai-compatible');
      vi.stubEnv('LLM_BASE_URL', 'https://api.local.com');

      const result = selectProvider();

      expect(result.type).toBe(ProviderType.OpenAICompatible);
      expect(result.baseUrl).toBe('https://api.local.com');
    });

    it('should throw for invalid LLM_PROVIDER', () => {
      vi.stubEnv('LLM_PROVIDER', 'invalid-provider');

      expect(() => selectProvider()).toThrow(/unknown provider/i);
    });
  });

  describe('getRequiredEnvVars()', () => {
    it('should return Gemini required vars', () => {
      const vars = getRequiredEnvVars(ProviderType.Gemini);

      expect(vars).toContain('GEMINI_API_KEY');
    });

    it('should return Claude required vars', () => {
      const vars = getRequiredEnvVars(ProviderType.Claude);

      expect(vars).toContain('ANTHROPIC_API_KEY');
    });

    it('should return OpenAI required vars', () => {
      const vars = getRequiredEnvVars(ProviderType.OpenAI);

      expect(vars).toContain('OPENAI_API_KEY');
    });

    it('should return OpenAI-compatible required vars', () => {
      const vars = getRequiredEnvVars(ProviderType.OpenAICompatible);

      expect(vars).toContain('LLM_BASE_URL');
    });

    it('should return Didim required vars', () => {
      const vars = getRequiredEnvVars(ProviderType.Didim);

      expect(vars).toContain('DIDIM_API_KEY');
    });
  });

  describe('validateProviderEnv()', () => {
    it('should pass when Gemini API key is set', () => {
      vi.stubEnv('GEMINI_API_KEY', 'xxx');

      expect(() => validateProviderEnv(ProviderType.Gemini)).not.toThrow();
    });

    it('should pass when GOOGLE_API_KEY is set for Gemini', () => {
      vi.stubEnv('GOOGLE_API_KEY', 'xxx');

      expect(() => validateProviderEnv(ProviderType.Gemini)).not.toThrow();
    });

    it('should throw when Claude API key is missing', () => {
      expect(() => validateProviderEnv(ProviderType.Claude)).toThrow(
        /ANTHROPIC_API_KEY/,
      );
    });

    it('should throw when OpenAI API key is missing', () => {
      expect(() => validateProviderEnv(ProviderType.OpenAI)).toThrow(
        /OPENAI_API_KEY/,
      );
    });

    it('should throw LlmError for configuration issues', () => {
      vi.stubEnv('LLM_PROVIDER', 'invalid-provider');

      try {
        selectProvider();
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).name).toBe('LlmError');
      }
    });
  });
});
