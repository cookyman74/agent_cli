/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  normalizeProviderKey,
  getDefaultModelFromRegistry,
} from '@didim365/agent-cli-core';
import { SettingScope, type LoadedSettings } from '../../config/settings.js';

// Re-export from core (SSOT) so existing CLI imports continue to work.
export { normalizeProviderKey };

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
 * All provider-specific environment variables that must be cleaned
 * when switching between providers.
 *
 * Call this at the top of every auth completion handler to prevent
 * stale env vars from a previous provider leaking into the next.
 */
const PROVIDER_ENV_VARS_TO_CLEAN = [
  'ENABLE_MULTI_PROVIDER',
  'LLM_PROVIDER',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_ORG_ID',
  'OPENAI_PROJECT_ID',
  'LLM_API_KEY',
  'LLM_MODEL',
  'LLM_BASE_URL',
  'LLM_API_KEY_HEADER',
  'LLM_CUSTOM_HEADERS',
  'DIDIM_API_KEY',
  'DIDIM_SERVER_ADDRESS',
  'DIDIM_STREAM_MODE',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_CLOUD_LOCATION',
] as const;

/**
 * Clean all provider-specific env vars to prevent cross-provider leakage.
 *
 * Should be called at the beginning of every provider switch path
 * (handleApiKeySubmit, handleSlmConfigComplete, handleVertexConfigComplete,
 * AuthDialog.onSelect) before setting the new provider's env vars.
 */
export function cleanProviderEnvVars(): void {
  for (const key of PROVIDER_ENV_VARS_TO_CLEAN) {
    delete process.env[key];
  }
}

/**
 * Resolve the correct model for a provider during auth switch or restart.
 *
 * Returns the user's previously saved model for the target provider (byProvider)
 * if available, otherwise falls back to the provider's default model.
 * This prevents stale models from a previous provider leaking through
 * (e.g., 'claude-opus-4-6' persisting when switching to Gemini).
 *
 * Used by both AppContainer (interactive auth switch) and useAuth (restart auth).
 *
 * @param settings - Loaded settings with user preferences
 * @param provider - Target provider key (e.g., 'gemini', 'claude', 'vertex-ai')
 * @returns Resolved model name appropriate for the provider
 */
export function resolveModelForAuthSwitch(
  settings: LoadedSettings,
  provider: string,
): string {
  const normalizedProvider = normalizeProviderKey(provider);
  // Some test/migration contexts provide a minimal LoadedSettings mock
  // without forScope(). Fall back to merged settings in that case.
  const userSettings = (() => {
    const typedSettings = settings as LoadedSettings & {
      forScope?: (scope: SettingScope) => unknown;
      merged?: unknown;
    };
    if (typeof typedSettings.forScope === 'function') {
      const scoped = typedSettings.forScope(SettingScope.User) as
        | {
            settings?: unknown;
          }
        | undefined;
      if (scoped?.settings && typeof scoped.settings === 'object') {
        return scoped.settings as {
          model?: { byProvider?: Record<string, string> };
        };
      }
    }
    return (typedSettings.merged ?? {}) as {
      model?: { byProvider?: Record<string, string> };
    };
  })();

  const savedModel = userSettings.model?.byProvider?.[normalizedProvider];
  if (savedModel) return savedModel;
  return getDefaultModelFromRegistry(normalizedProvider);
}
