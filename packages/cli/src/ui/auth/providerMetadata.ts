/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Display information for a LLM provider in the auth UI.
 */
export interface ProviderDisplayInfo {
  /** Internal provider type key */
  providerType: string;
  /** Display label shown in UI */
  label: string;
  /** Short description shown next to label */
  description: string;
  /** Environment variable name for the API key */
  envVarName: string;
  /** URL where users can obtain an API key */
  apiKeyUrl: string;
  /** Keychain entry name for storing the API key */
  keychainEntry: string;
}

/**
 * Mapping from UI-facing provider key to display metadata.
 * 'vertex-ai' is presented as a separate choice even though it internally maps to ProviderType.Gemini.
 * 'slm' maps to ProviderType.OpenAICompatible.
 */
export const PROVIDER_DISPLAY_MAP: Record<string, ProviderDisplayInfo> = {
  gemini: {
    providerType: 'gemini',
    label: 'Gemini',
    description: 'Google AI',
    envVarName: 'GEMINI_API_KEY',
    apiKeyUrl: 'https://aistudio.google.com/app/apikey',
    keychainEntry: 'default-api-key',
  },
  claude: {
    providerType: 'claude',
    label: 'Claude',
    description: 'Anthropic',
    envVarName: 'ANTHROPIC_API_KEY',
    apiKeyUrl: 'https://console.anthropic.com/settings/keys',
    keychainEntry: 'claude-api-key',
  },
  openai: {
    providerType: 'openai',
    label: 'OpenAI',
    description: 'OpenAI',
    envVarName: 'OPENAI_API_KEY',
    apiKeyUrl: 'https://platform.openai.com/api-keys',
    keychainEntry: 'openai-api-key',
  },
  'vertex-ai': {
    providerType: 'gemini',
    label: 'Vertex AI',
    description: 'Google Cloud',
    envVarName: 'GOOGLE_API_KEY',
    apiKeyUrl: 'https://console.cloud.google.com/apis/credentials',
    keychainEntry: 'default-api-key',
  },
  slm: {
    providerType: 'openai-compatible',
    label: 'sLM',
    description: 'Self-hosted / Local LLM',
    envVarName: 'LLM_API_KEY',
    apiKeyUrl: '',
    keychainEntry: 'slm-api-key',
  },
};

/**
 * Ordered list of provider keys shown in Step 1 provider selection.
 * Didim provider is hidden from user selection (activated via DIDIM_API_KEY env var only).
 */
export const PROVIDER_SELECT_ITEMS = [
  'gemini',
  'claude',
  'openai',
  'vertex-ai',
  'slm',
] as const;

/**
 * Get provider display info, falling back to Gemini defaults.
 */
export function getProviderDisplayInfo(
  provider: string | undefined,
): ProviderDisplayInfo {
  return (
    PROVIDER_DISPLAY_MAP[provider ?? 'gemini'] ?? PROVIDER_DISPLAY_MAP['gemini']
  );
}
