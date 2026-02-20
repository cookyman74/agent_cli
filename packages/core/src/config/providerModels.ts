/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Individual model metadata within a provider group.
 */
export interface ProviderModelInfo {
  /** API에 전달하는 모델 ID */
  id: string;
  /** UI에 표시할 이름 (생략 시 id 사용) */
  displayName?: string;
  /** 설명 텍스트 */
  description?: string;
  /** 이 모델이 프로바이더의 기본 권장 모델인지 */
  isDefault?: boolean;
  /** 모델 카테고리 */
  category?: 'auto' | 'recommended' | 'reasoning' | 'general' | 'lite';
}

/**
 * Provider-level model group containing presets and model list.
 */
export interface ProviderModelGroup {
  /** 프로바이더 키 (ProviderType 값과 매칭) */
  providerKey: string;
  /** 첫번째 화면에서 보여줄 프리셋 옵션 */
  presets: Array<{
    value: string;
    title: string;
    description: string;
  }>;
  /** 두번째 화면(Manual)에서 보여줄 개별 모델 목록 */
  models: ProviderModelInfo[];
  /** 텍스트 입력 모드 여부 (sLM용) */
  freeformInput?: boolean;
  /** 모델 선택 비활성 (DidimAIStudio 등) */
  modelSelectionDisabled?: boolean;
  /** 비활성 시 안내 메시지 */
  disabledMessage?: string;
  /** 레지스트리 외 커스텀 모델 허용 여부 (기본 true) */
  allowCustomModels?: boolean;
}

/**
 * Single Source of Truth for provider model metadata.
 *
 * Each key corresponds to a ProviderType enum value.
 * `DEFAULT_PROVIDER_MODELS` in providerSelector.ts is derived from this registry.
 */
export const PROVIDER_MODEL_REGISTRY: Record<string, ProviderModelGroup> = {
  gemini: {
    providerKey: 'gemini',
    presets: [
      {
        value: 'auto-gemini-3',
        title: 'Auto (Gemini 3)',
        description:
          'Let Didim CLI decide the best model: gemini-3-pro, gemini-3-flash',
      },
      {
        value: 'auto-gemini-2.5',
        title: 'Auto (Gemini 2.5)',
        description:
          'Let Didim CLI decide the best model: gemini-2.5-pro, gemini-2.5-flash',
      },
    ],
    models: [
      {
        id: 'gemini-3.1-pro-preview',
        description: 'Most capable, complex problem-solving (1M context)',
        category: 'general',
      },
      { id: 'gemini-3-pro-preview', category: 'general' },
      { id: 'gemini-3-flash-preview', category: 'lite' },
      { id: 'gemini-2.5-pro', category: 'general', isDefault: true },
      { id: 'gemini-2.5-flash', category: 'lite' },
      { id: 'gemini-2.5-flash-lite', category: 'lite' },
    ],
    allowCustomModels: true,
  },

  claude: {
    providerKey: 'claude',
    presets: [
      {
        value: 'claude-opus-4-6',
        title: 'Recommended (claude-opus-4-6)',
        description: 'Most intelligent model for building agents and coding',
      },
    ],
    models: [
      {
        id: 'claude-opus-4-6',
        description: 'Most intelligent, agents & coding',
        isDefault: true,
      },
      {
        id: 'claude-sonnet-4-5-20250929',
        description: 'Best speed & intelligence balance',
      },
      {
        id: 'claude-haiku-4-5-20251001',
        description: 'Fastest, near-frontier intelligence',
      },
    ],
    allowCustomModels: true,
  },

  openai: {
    providerKey: 'openai',
    presets: [
      {
        value: 'gpt-5.2',
        title: 'Recommended (gpt-5.2)',
        description: 'Flagship reasoning model with 400K context',
      },
    ],
    models: [
      {
        id: 'gpt-5.2',
        description: 'Flagship reasoning model, 400K context',
        isDefault: true,
      },
      {
        id: 'gpt-5-mini',
        description: 'Compact GPT-5, fast and efficient',
      },
      {
        id: 'gpt-4.1',
        description: 'Best 1M context non-reasoning model',
        category: 'general',
      },
      { id: 'gpt-4.1-mini', description: 'Fast, balanced performance' },
      {
        id: 'o3',
        description: 'Most powerful reasoning model',
        category: 'reasoning',
      },
      {
        id: 'o4-mini',
        description: 'Fast, cost-efficient reasoning',
        category: 'reasoning',
      },
    ],
    allowCustomModels: true,
  },

  'openai-compatible': {
    providerKey: 'openai-compatible',
    presets: [],
    models: [],
    freeformInput: true,
  },

  didim: {
    providerKey: 'didim',
    presets: [],
    models: [],
    modelSelectionDisabled: true,
    disabledMessage:
      'DidimAIStudio는 시나리오 기반으로 동작하므로 개별 모델 선택을 지원하지 않습니다.',
  },
};

/**
 * Get the default model for a provider from the registry.
 *
 * Returns the model marked with `isDefault: true`, or falls back to
 * `presets[0].value` → `models[0].id` → `'default'`.
 *
 * @param providerKey - Registry key (matches ProviderType enum value)
 * @returns Default model ID string
 */
export function getDefaultModelFromRegistry(providerKey: string): string {
  const group = PROVIDER_MODEL_REGISTRY[providerKey];
  if (!group) return 'default';

  if (group.freeformInput) return 'default';
  if (group.modelSelectionDisabled) return `${providerKey}-default`;

  const defaultModel = group.models.find((m) => m.isDefault);
  if (defaultModel) return defaultModel.id;

  if (group.presets.length > 0) return group.presets[0].value;
  return group.models[0]?.id ?? 'default';
}

/**
 * Validate whether a model is appropriate for a given provider.
 *
 * Validation strategy:
 * - `freeformInput` providers accept any model
 * - `modelSelectionDisabled` providers skip validation
 * - Registry models (presets + models) are always valid
 * - `allowCustomModels` (default true): reject only models owned by other providers
 *
 * @param model - Model ID to validate
 * @param providerKey - Target provider key
 * @returns true if the model is valid for the provider
 */
export function isModelValidForProvider(
  model: string,
  providerKey: string,
): boolean {
  const group = PROVIDER_MODEL_REGISTRY[providerKey];
  if (!group) return true;

  if (group.freeformInput) return true;
  if (group.modelSelectionDisabled) return true;

  // Check registry (presets + models)
  const presetValues = group.presets.map((p) => p.value);
  const modelIds = group.models.map((m) => m.id);
  if (presetValues.includes(model) || modelIds.includes(model)) return true;

  // allowCustomModels (default true): reject only other-provider models
  const allowCustom = group.allowCustomModels !== false;
  if (allowCustom) {
    return !isModelOwnedByOtherProvider(model, providerKey);
  }

  return false;
}

/**
 * Determine if a model clearly belongs to another provider based on prefix heuristics.
 *
 * Prefix rules:
 * - `claude-*` → claude
 * - `gpt-*`, `o[0-9]*` → openai
 * - `gemini-*`, `auto-gemini*` → gemini
 */
function isModelOwnedByOtherProvider(
  model: string,
  currentProvider: string,
): boolean {
  // Normalize to lowercase for case-insensitive prefix matching
  const normalized = model.toLowerCase();

  const providerPrefixes: Record<string, Array<(m: string) => boolean>> = {
    claude: [(m) => m.startsWith('claude-')],
    openai: [(m) => m.startsWith('gpt-'), (m) => /^o[0-9]/.test(m)],
    gemini: [
      (m) => m.startsWith('gemini-'),
      (m) => m.startsWith('auto-gemini'),
    ],
  };

  for (const [provider, checks] of Object.entries(providerPrefixes)) {
    if (provider === currentProvider) continue;
    if (checks.some((check) => check(normalized))) return true;
  }
  return false;
}
