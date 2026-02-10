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
  getDefaultModelForProvider,
  isGeminiSpecificModel,
  resolveProviderModel,
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

  // ==========================================================================
  // Provider Model Resolution
  // ==========================================================================

  describe('getDefaultModelForProvider()', () => {
    it('should return default model for Claude', () => {
      const model = getDefaultModelForProvider(ProviderType.Claude);
      expect(model).toMatch(/^claude-/);
    });

    it('should return default model for OpenAI', () => {
      const model = getDefaultModelForProvider(ProviderType.OpenAI);
      expect(model).toMatch(/^gpt-/);
    });

    it('should return default model for Gemini', () => {
      const model = getDefaultModelForProvider(ProviderType.Gemini);
      expect(model).toMatch(/^gemini-/);
    });

    it('should return default model for OpenAI-compatible', () => {
      const model = getDefaultModelForProvider(ProviderType.OpenAICompatible);
      expect(model).toMatch(/^gpt-/);
    });
  });

  describe('isGeminiSpecificModel()', () => {
    it('should detect Gemini concrete model names', () => {
      expect(isGeminiSpecificModel('gemini-2.5-pro')).toBe(true);
      expect(isGeminiSpecificModel('gemini-2.5-flash')).toBe(true);
      expect(isGeminiSpecificModel('gemini-3-pro-preview')).toBe(true);
    });

    it('should detect Gemini auto models', () => {
      expect(isGeminiSpecificModel('auto-gemini-2.5')).toBe(true);
      expect(isGeminiSpecificModel('auto-gemini-3')).toBe(true);
    });

    it('should detect Gemini aliases', () => {
      expect(isGeminiSpecificModel('auto')).toBe(true);
      expect(isGeminiSpecificModel('pro')).toBe(true);
      expect(isGeminiSpecificModel('flash')).toBe(true);
      expect(isGeminiSpecificModel('flash-lite')).toBe(true);
    });

    it('should NOT detect non-Gemini model names', () => {
      expect(isGeminiSpecificModel('claude-sonnet-4-20250514')).toBe(false);
      expect(isGeminiSpecificModel('gpt-4o')).toBe(false);
      expect(isGeminiSpecificModel('my-custom-model')).toBe(false);
    });
  });

  describe('resolveProviderModel()', () => {
    it('should pass through Gemini model for Gemini provider', () => {
      const result = resolveProviderModel(
        'gemini-2.5-pro',
        ProviderType.Gemini,
      );
      expect(result).toBe('gemini-2.5-pro');
    });

    it('should resolve Gemini default to Claude model for Claude provider', () => {
      const result = resolveProviderModel(
        'gemini-2.5-pro',
        ProviderType.Claude,
      );
      expect(result).toMatch(/^claude-/);
    });

    it('should resolve Gemini default to OpenAI model for OpenAI provider', () => {
      const result = resolveProviderModel(
        'gemini-2.5-pro',
        ProviderType.OpenAI,
      );
      expect(result).toMatch(/^gpt-/);
    });

    it('should resolve Gemini alias to provider default', () => {
      const result = resolveProviderModel('auto', ProviderType.Claude);
      expect(result).toMatch(/^claude-/);
    });

    it('should resolve auto-gemini-2.5 to provider default', () => {
      const result = resolveProviderModel(
        'auto-gemini-2.5',
        ProviderType.OpenAI,
      );
      expect(result).toMatch(/^gpt-/);
    });

    it('should pass through explicit non-Gemini model name', () => {
      const result = resolveProviderModel(
        'claude-3-opus-20240229',
        ProviderType.Claude,
      );
      expect(result).toBe('claude-3-opus-20240229');
    });

    it('should pass through custom model name for OpenAI-compatible', () => {
      const result = resolveProviderModel(
        'my-local-llama',
        ProviderType.OpenAICompatible,
      );
      expect(result).toBe('my-local-llama');
    });

    it('should prioritize LLM_MODEL env var over default resolution', () => {
      vi.stubEnv('LLM_MODEL', 'claude-3-opus-20240229');
      const result = resolveProviderModel(
        'gemini-2.5-pro',
        ProviderType.Claude,
      );
      expect(result).toBe('claude-3-opus-20240229');
    });

    it('should not use LLM_MODEL if model is already non-Gemini', () => {
      vi.stubEnv('LLM_MODEL', 'claude-3-opus-20240229');
      const result = resolveProviderModel(
        'claude-sonnet-4-20250514',
        ProviderType.Claude,
      );
      expect(result).toBe('claude-sonnet-4-20250514');
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
