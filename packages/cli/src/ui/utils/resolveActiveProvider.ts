/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Resolve the currently active provider from multiple sources.
 *
 * Priority:
 * 1. UI에서 명시 선택된 프로바이더 (selectedProvider)
 * 2. 환경변수 LLM_PROVIDER
 * 3. API 키 기반 자동감지
 * 4. fallback: 'gemini'
 *
 * @param selectedProvider - UIState의 selectedProvider (UI 키)
 * @returns 정규화된 프로바이더 키 (PROVIDER_MODEL_REGISTRY 키와 매칭)
 */
export function resolveActiveProvider(selectedProvider?: string): string {
  // 1. UI 선택값이 있으면 내부 키로 변환
  if (selectedProvider) {
    return normalizeProviderKey(selectedProvider);
  }

  // 2. LLM_PROVIDER 환경변수
  const llmProvider = process.env['LLM_PROVIDER'];
  if (llmProvider) {
    return normalizeProviderKey(llmProvider);
  }

  // 3. API 키 기반 감지 (providerSelector.ts의 PROVIDER_ENV_VARS와 동일 순서)
  if (process.env['ANTHROPIC_API_KEY']) return 'claude';
  if (process.env['OPENAI_API_KEY']) return 'openai';
  if (process.env['DIDIM_API_KEY']) return 'didim';

  // 4. Fallback
  return 'gemini';
}

/**
 * Normalize UI key / env key to registry key.
 *
 * Maps legacy or UI-specific provider names to the canonical
 * PROVIDER_MODEL_REGISTRY keys.
 *
 * @param key - Provider key from UI state or environment
 * @returns Normalized registry key
 */
export function normalizeProviderKey(key: string): string {
  const normalized = key.toLowerCase().trim();

  switch (normalized) {
    case 'slm':
    case 'openai_compatible':
      return 'openai-compatible';
    case 'vertex-ai':
      return 'gemini';
    case 'didim-studio':
      return 'didim';
    case 'anthropic':
      return 'claude';
    default:
      return normalized;
  }
}
