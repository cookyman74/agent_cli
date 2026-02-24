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
import { getDefaultModelFromRegistry } from '../config/providerModels.js';

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
      // OpenAI-compatible uses 'default' as a generic placeholder
      // since local servers (vLLM/Ollama) don't use OpenAI model names.
      expect(model).toBe('default');
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

  // ==========================================================================
  // Phase 1 - Registry-derived DEFAULT_PROVIDER_MODELS
  // ==========================================================================

  describe('DEFAULT_PROVIDER_MODELS from registry', () => {
    it('claude default matches registry (claude-opus-4-6)', () => {
      expect(getDefaultModelForProvider(ProviderType.Claude)).toBe(
        'claude-opus-4-6',
      );
    });

    it('openai default matches registry (gpt-5.2)', () => {
      expect(getDefaultModelForProvider(ProviderType.OpenAI)).toBe('gpt-5.2');
    });

    it('gemini default matches registry (gemini-2.5-pro)', () => {
      expect(getDefaultModelForProvider(ProviderType.Gemini)).toBe(
        'gemini-2.5-pro',
      );
    });

    it('didim default matches registry (didim-default)', () => {
      expect(getDefaultModelForProvider(ProviderType.Didim)).toBe(
        'didim-default',
      );
    });
  });

  // ==========================================================================
  // Phase 1 - resolveProviderModel cross-provider validation
  // ==========================================================================

  describe('resolveProviderModel - cross-provider validation', () => {
    it('rejects claude model on openai and returns openai default', () => {
      const result = resolveProviderModel(
        'claude-opus-4-6',
        ProviderType.OpenAI,
      );
      expect(result).toBe('gpt-5.2');
    });

    it('rejects gpt model on claude and returns claude default', () => {
      const result = resolveProviderModel('gpt-5.2', ProviderType.Claude);
      expect(result).toBe('claude-opus-4-6');
    });

    it('rejects o3 on claude and returns claude default', () => {
      const result = resolveProviderModel('o3', ProviderType.Claude);
      expect(result).toBe('claude-opus-4-6');
    });

    it('accepts custom model gpt-4o-2024-08-06 on openai', () => {
      const result = resolveProviderModel(
        'gpt-4o-2024-08-06',
        ProviderType.OpenAI,
      );
      expect(result).toBe('gpt-4o-2024-08-06');
    });

    it('accepts unknown-prefix model on openai (allowCustomModels)', () => {
      const result = resolveProviderModel(
        'my-custom-model',
        ProviderType.OpenAI,
      );
      expect(result).toBe('my-custom-model');
    });

    it('passes through valid registered model on its own provider', () => {
      const result = resolveProviderModel(
        'claude-opus-4-6',
        ProviderType.Claude,
      );
      expect(result).toBe('claude-opus-4-6');
    });

    // --- Review issue 1: LLM_MODEL cross-provider validation ---

    it('rejects cross-provider LLM_MODEL (claude model on openai via env)', () => {
      vi.stubEnv('LLM_MODEL', 'claude-opus-4-6');
      const result = resolveProviderModel(
        'gemini-2.5-pro',
        ProviderType.OpenAI,
      );
      expect(result).toBe('gpt-5.2'); // should NOT return claude-opus-4-6
    });

    it('accepts valid LLM_MODEL for target provider', () => {
      vi.stubEnv('LLM_MODEL', 'gpt-4o-2024-08-06');
      const result = resolveProviderModel(
        'gemini-2.5-pro',
        ProviderType.OpenAI,
      );
      expect(result).toBe('gpt-4o-2024-08-06');
    });

    it('accepts unknown-prefix LLM_MODEL on openai (allowCustomModels)', () => {
      vi.stubEnv('LLM_MODEL', 'my-local-llama');
      const result = resolveProviderModel(
        'gemini-2.5-pro',
        ProviderType.OpenAI,
      );
      expect(result).toBe('my-local-llama');
    });

    // --- Review issue 2: Didim modelSelectionDisabled ---

    it('forces didim-default regardless of current non-Gemini model', () => {
      const result = resolveProviderModel('gpt-4.1', ProviderType.Didim);
      expect(result).toBe('didim-default');
    });

    it('forces didim-default regardless of current Gemini model', () => {
      const result = resolveProviderModel('gemini-2.5-pro', ProviderType.Didim);
      expect(result).toBe('didim-default');
    });

    it('forces didim-default even when LLM_MODEL is set', () => {
      vi.stubEnv('LLM_MODEL', 'claude-opus-4-6');
      const result = resolveProviderModel('gemini-2.5-pro', ProviderType.Didim);
      expect(result).toBe('didim-default');
    });

    // --- Hotfix: freeformInput provider cross-provider stale model detection ---
    // /auth login 후 cross-provider 전환 시 이전 프로바이더의 known 모델이
    // freeformInput 프로바이더에 누수되는 문제 방지.
    // 단, --model CLI 플래그로 명시 지정한 모델은 LLM_MODEL보다 우선.

    it('should prefer LLM_MODEL over stale Claude model on freeformInput provider', () => {
      vi.stubEnv('LLM_MODEL', 'qwen3:8b');
      const result = resolveProviderModel(
        'claude-sonnet-4-6',
        ProviderType.OpenAICompatible,
      );
      expect(result).toBe('qwen3:8b');
    });

    it('should prefer LLM_MODEL over stale OpenAI model on freeformInput provider', () => {
      vi.stubEnv('LLM_MODEL', 'qwen3:8b');
      const result = resolveProviderModel(
        'gpt-4o',
        ProviderType.OpenAICompatible,
      );
      expect(result).toBe('qwen3:8b');
    });

    it('should use current model on freeformInput when LLM_MODEL is not set', () => {
      const result = resolveProviderModel(
        'qwen3:8b',
        ProviderType.OpenAICompatible,
      );
      expect(result).toBe('qwen3:8b');
    });

    it('should not affect non-freeformInput providers with LLM_MODEL in non-Gemini branch', () => {
      vi.stubEnv('LLM_MODEL', 'claude-3-opus-20240229');
      const result = resolveProviderModel(
        'claude-sonnet-4-20250514',
        ProviderType.Claude,
      );
      expect(result).toBe('claude-sonnet-4-20250514');
    });

    // --- Issue 1 fix: --model CLI flag should take priority over LLM_MODEL ---

    it('should respect user-specified custom model over LLM_MODEL on freeformInput provider', () => {
      // 시나리오: --model=my-custom-llama + LLM_MODEL=qwen3:8b
      // 'my-custom-llama'는 어떤 프로바이더의 known 모델도 아님 → user-specified
      vi.stubEnv('LLM_MODEL', 'qwen3:8b');
      const result = resolveProviderModel(
        'my-custom-llama',
        ProviderType.OpenAICompatible,
      );
      expect(result).toBe('my-custom-llama');
    });

    it('should return LLM_MODEL when model matches it on freeformInput (no conflict)', () => {
      // 시나리오: model === LLM_MODEL → 동일 모델, 충돌 없음
      vi.stubEnv('LLM_MODEL', 'qwen3:8b');
      const result = resolveProviderModel(
        'qwen3:8b',
        ProviderType.OpenAICompatible,
      );
      expect(result).toBe('qwen3:8b');
    });

    it('should prefer LLM_MODEL over stale Gemini model on freeformInput provider', () => {
      // Gemini 분기에서 이미 처리되지만, 레지스트리에 없는 gemini 모델 가드
      vi.stubEnv('LLM_MODEL', 'qwen3:8b');
      const result = resolveProviderModel(
        'gemini-2.5-pro',
        ProviderType.OpenAICompatible,
      );
      // gemini-2.5-pro는 isGeminiSpecificModel → Gemini 분기에서 처리
      expect(result).toBe('qwen3:8b');
    });

    // --- Issue 4 fix: prefix heuristic false positive ---

    it('should NOT treat gpt-oss-20b as OpenAI model on freeformInput provider', () => {
      // gpt-oss-20b는 GPUStack sLM 모델 (SlmConfigDialog.tsx:50 참조)
      // gpt-* prefix가 너무 넓어 OpenAI 모델로 오인 → gpt-[0-9] 패턴으로 제한
      vi.stubEnv('LLM_MODEL', 'qwen3:8b');
      const result = resolveProviderModel(
        'gpt-oss-20b',
        ProviderType.OpenAICompatible,
      );
      // gpt-oss-20b는 사용자가 --model로 지정한 커스텀 sLM 모델 → 그대로 유지
      expect(result).toBe('gpt-oss-20b');
    });

    it('should still detect real OpenAI gpt-4o as stale on freeformInput provider', () => {
      // gpt-4o는 실제 OpenAI 모델 → gpt-[0-9] 패턴에 매칭되어야 함
      vi.stubEnv('LLM_MODEL', 'qwen3:8b');
      const result = resolveProviderModel(
        'gpt-4o',
        ProviderType.OpenAICompatible,
      );
      expect(result).toBe('qwen3:8b');
    });

    it('should still detect real OpenAI gpt-5.2 as stale on freeformInput provider', () => {
      vi.stubEnv('LLM_MODEL', 'qwen3:8b');
      const result = resolveProviderModel(
        'gpt-5.2',
        ProviderType.OpenAICompatible,
      );
      expect(result).toBe('qwen3:8b');
    });

    // --- Issue 6 fix: gpt-oss-* 모델이 non-freeformInput provider에서 fallback 안 되는 회귀 ---

    it('should fallback gpt-oss-20b to Claude default when LLM_MODEL differs', () => {
      // gpt-oss-20b는 sLM(GPUStack) 모델 — Claude provider에 미등록 + own-prefix 아님
      // LLM_MODEL이 설정되어 있고 model과 다르면 → Strategy 2 발동 → Claude 기본 모델
      // (LLM_MODEL 없으면 allowCustomModels 존중 — --model 직접 지정 시나리오 보호)
      vi.stubEnv('LLM_MODEL', 'claude-opus-4-6');
      const result = resolveProviderModel('gpt-oss-20b', ProviderType.Claude);
      expect(result).toBe('claude-opus-4-6');
    });

    it('should fallback gpt-oss-20b to Claude default when LLM_MODEL is invalid', () => {
      // LLM_MODEL이 target에 유효하지 않으면 provider default
      vi.stubEnv('LLM_MODEL', 'gemini-2.5-flash');
      const result = resolveProviderModel('gpt-oss-20b', ProviderType.Claude);
      // gemini-2.5-flash는 isGeminiSpecificModel이므로 Gemini 분기로 먼저 처리됨
      // gpt-oss-20b는 Gemini이 아니므로 non-Gemini 분기. LLM_MODEL은 별도 경로.
      // → 실제로는 LLM_MODEL='gemini-2.5-flash'와 model='gpt-oss-20b'가 다르고,
      //   gpt-oss-20b가 Claude 미등록+non-own-prefix → Strategy 2 발동
      //   → isModelValidForProvider('gemini-2.5-flash', 'claude') → false
      //   → Claude default
      expect(result).toBe(getDefaultModelFromRegistry('claude'));
    });

    it('should fallback gpt-oss-20b to OpenAI default when LLM_MODEL is set', () => {
      vi.stubEnv('LLM_MODEL', 'gpt-5.2');
      const result = resolveProviderModel('gpt-oss-20b', ProviderType.OpenAI);
      expect(result).toBe('gpt-5.2');
    });

    // --- Issue 7 fix: alias provider string 정규화 ---

    it('should normalize alias provider key "openai_compatible" in resolveProviderModel', () => {
      // contentGenerator.ts에서 LLM_PROVIDER='openai_compatible'이 그대로 전달되는 경우
      // registry key 미스매치 방지
      vi.stubEnv('LLM_MODEL', 'qwen3:8b');
      const result = resolveProviderModel(
        'claude-opus-4-6',
        'openai_compatible',
      );
      // 정규화 후 openai-compatible로 처리 → freeformInput → LLM_MODEL 반환
      expect(result).toBe('qwen3:8b');
    });

    it('should normalize alias provider key "anthropic" in resolveProviderModel', () => {
      const result = resolveProviderModel('gpt-4o', 'anthropic');
      // 정규화 후 claude로 처리 → gpt-4o는 Claude에 유효하지 않음 → Claude 기본 모델
      expect(result).toBe(getDefaultModelFromRegistry('claude'));
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
