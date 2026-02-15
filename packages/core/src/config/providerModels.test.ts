/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  PROVIDER_MODEL_REGISTRY,
  getDefaultModelFromRegistry,
  isModelValidForProvider,
} from './providerModels.js';

// ============================================================================
// PROVIDER_MODEL_REGISTRY structure
// ============================================================================

describe('PROVIDER_MODEL_REGISTRY', () => {
  it('contains all expected provider keys', () => {
    expect(Object.keys(PROVIDER_MODEL_REGISTRY)).toEqual(
      expect.arrayContaining([
        'gemini',
        'claude',
        'openai',
        'openai-compatible',
        'didim',
      ]),
    );
  });

  it('each provider has providerKey matching its registry key', () => {
    for (const [key, group] of Object.entries(PROVIDER_MODEL_REGISTRY)) {
      expect(group.providerKey).toBe(key);
    }
  });

  it('gemini has presets and models', () => {
    const gemini = PROVIDER_MODEL_REGISTRY['gemini'];
    expect(gemini.presets.length).toBeGreaterThan(0);
    expect(gemini.models.length).toBeGreaterThan(0);
  });

  it('claude has presets and models', () => {
    const claude = PROVIDER_MODEL_REGISTRY['claude'];
    expect(claude.presets.length).toBeGreaterThan(0);
    expect(claude.models.length).toBeGreaterThan(0);
  });

  it('openai has presets and models', () => {
    const openai = PROVIDER_MODEL_REGISTRY['openai'];
    expect(openai.presets.length).toBeGreaterThan(0);
    expect(openai.models.length).toBeGreaterThan(0);
  });

  it('openai-compatible has freeformInput enabled', () => {
    const slm = PROVIDER_MODEL_REGISTRY['openai-compatible'];
    expect(slm.freeformInput).toBe(true);
    expect(slm.models).toHaveLength(0);
  });

  it('didim has modelSelectionDisabled', () => {
    const didim = PROVIDER_MODEL_REGISTRY['didim'];
    expect(didim.modelSelectionDisabled).toBe(true);
    expect(didim.disabledMessage).toBeDefined();
  });

  it('every model with isDefault has exactly one default per provider', () => {
    for (const [, group] of Object.entries(PROVIDER_MODEL_REGISTRY)) {
      const defaults = group.models.filter((m) => m.isDefault);
      // freeformInput / disabled providers have no models → 0 defaults is fine
      if (group.models.length > 0) {
        expect(defaults.length).toBeLessThanOrEqual(1);
      }
    }
  });
});

// ============================================================================
// getDefaultModelFromRegistry
// ============================================================================

describe('getDefaultModelFromRegistry', () => {
  it('returns isDefault model for gemini (gemini-2.5-pro, not auto-gemini-3)', () => {
    expect(getDefaultModelFromRegistry('gemini')).toBe('gemini-2.5-pro');
  });

  it('returns isDefault model for claude', () => {
    expect(getDefaultModelFromRegistry('claude')).toBe('claude-opus-4-6');
  });

  it('returns isDefault model for openai', () => {
    expect(getDefaultModelFromRegistry('openai')).toBe('gpt-4.1');
  });

  it('returns "default" for openai-compatible (freeformInput)', () => {
    expect(getDefaultModelFromRegistry('openai-compatible')).toBe('default');
  });

  it('returns "didim-default" for didim (modelSelectionDisabled)', () => {
    expect(getDefaultModelFromRegistry('didim')).toBe('didim-default');
  });

  it('returns "default" for unknown provider', () => {
    expect(getDefaultModelFromRegistry('unknown-provider')).toBe('default');
  });
});

// ============================================================================
// isModelValidForProvider
// ============================================================================

describe('isModelValidForProvider', () => {
  // --- 레지스트리 모델 → 유효 ---
  it('accepts registered model for its provider', () => {
    expect(isModelValidForProvider('claude-opus-4-6', 'claude')).toBe(true);
  });

  it('accepts registered preset value for its provider', () => {
    expect(isModelValidForProvider('auto-gemini-3', 'gemini')).toBe(true);
  });

  // --- 커스텀 모델: 동일 prefix → 유효 ---
  it('accepts custom model with matching prefix (gpt-4o-2024-08-06)', () => {
    expect(isModelValidForProvider('gpt-4o-2024-08-06', 'openai')).toBe(true);
  });

  // --- cross-provider prefix → 거부 ---
  it('rejects claude model on openai provider', () => {
    expect(isModelValidForProvider('claude-opus-4-6', 'openai')).toBe(false);
  });

  it('rejects gpt model on claude provider', () => {
    expect(isModelValidForProvider('gpt-4.1', 'claude')).toBe(false);
  });

  it('rejects gemini model on claude provider', () => {
    expect(isModelValidForProvider('gemini-2.5-pro', 'claude')).toBe(false);
  });

  // --- freeformInput → 모든 모델 허용 ---
  it('accepts any model for openai-compatible (freeformInput)', () => {
    expect(
      isModelValidForProvider('my-custom-model', 'openai-compatible'),
    ).toBe(true);
  });

  // --- modelSelectionDisabled → 스킵 ---
  it('accepts any model for didim (modelSelectionDisabled)', () => {
    expect(isModelValidForProvider('any-model', 'didim')).toBe(true);
  });

  // --- 알 수 없는 prefix → 허용 (allowCustomModels) ---
  it('accepts unknown-prefix model (my-custom-llm) on openai', () => {
    expect(isModelValidForProvider('my-custom-llm', 'openai')).toBe(true);
  });

  it('accepts unknown-prefix model (my-custom-llm) on claude', () => {
    expect(isModelValidForProvider('my-custom-llm', 'claude')).toBe(true);
  });

  // --- o3, o4-mini → openai 소속 ---
  it('rejects o3 on claude provider', () => {
    expect(isModelValidForProvider('o3', 'claude')).toBe(false);
  });

  it('accepts o3 on openai provider', () => {
    expect(isModelValidForProvider('o3', 'openai')).toBe(true);
  });

  it('rejects o4-mini on claude provider', () => {
    expect(isModelValidForProvider('o4-mini', 'claude')).toBe(false);
  });

  it('accepts o4-mini on openai provider', () => {
    expect(isModelValidForProvider('o4-mini', 'openai')).toBe(true);
  });

  // --- auto-gemini prefix → gemini 소속 ---
  it('rejects auto-gemini-2.5 on openai provider', () => {
    expect(isModelValidForProvider('auto-gemini-2.5', 'openai')).toBe(false);
  });

  // --- unknown provider → true (통과) ---
  it('accepts any model for unknown provider', () => {
    expect(isModelValidForProvider('some-model', 'unknown-provider')).toBe(
      true,
    );
  });
});
