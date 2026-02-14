/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { HybridTokenStorage } from '../mcp/token-storage/hybrid-token-storage.js';
import type { OAuthCredentials } from '../mcp/token-storage/types.js';
import { debugLogger } from '../utils/debugLogger.js';

const KEYCHAIN_SERVICE_NAME = 'gemini-cli-api-key';
const DEFAULT_API_KEY_ENTRY = 'default-api-key';

/**
 * Mapping from provider name to keychain entry name.
 * 'gemini' maps to 'default-api-key' for backward compatibility.
 */
export const PROVIDER_KEYCHAIN_ENTRIES: Record<string, string> = {
  gemini: DEFAULT_API_KEY_ENTRY,
  claude: 'claude-api-key',
  openai: 'openai-api-key',
  'openai-compatible': 'slm-api-key',
  didim: 'didim-api-key',
};

const storage = new HybridTokenStorage(KEYCHAIN_SERVICE_NAME);

/**
 * Get the keychain entry name for a provider.
 * Falls back to the provider string itself if not found in the mapping.
 */
function getEntryName(provider: string): string {
  return PROVIDER_KEYCHAIN_ENTRIES[provider] ?? provider;
}

/**
 * Load API key for a specific provider from the keychain.
 */
export async function loadProviderApiKey(
  provider: string,
): Promise<string | null> {
  try {
    const entryName = getEntryName(provider);
    const credentials = await storage.getCredentials(entryName);

    if (credentials?.token?.accessToken) {
      return credentials.token.accessToken;
    }

    return null;
  } catch (error: unknown) {
    debugLogger.error(
      `Failed to load API key for provider '${provider}' from storage:`,
      error,
    );
    return null;
  }
}

/**
 * Save API key for a specific provider to the keychain.
 */
export async function saveProviderApiKey(
  provider: string,
  apiKey: string | null | undefined,
): Promise<void> {
  const entryName = getEntryName(provider);

  if (!apiKey || apiKey.trim() === '') {
    try {
      await storage.deleteCredentials(entryName);
    } catch (error: unknown) {
      debugLogger.warn(
        `Failed to delete API key for provider '${provider}' from storage:`,
        error,
      );
    }
    return;
  }

  const credentials: OAuthCredentials = {
    serverName: entryName,
    token: {
      accessToken: apiKey,
      tokenType: 'ApiKey',
    },
    updatedAt: Date.now(),
  };

  await storage.setCredentials(credentials);
}

/**
 * Clear API key for a specific provider from the keychain.
 */
export async function clearProviderApiKey(provider: string): Promise<void> {
  try {
    const entryName = getEntryName(provider);
    await storage.deleteCredentials(entryName);
  } catch (error: unknown) {
    debugLogger.error(
      `Failed to clear API key for provider '${provider}' from storage:`,
      error,
    );
  }
}

// --- Backward-compatible aliases (delegate to gemini provider) ---

/**
 * Load cached API key (Gemini)
 * @deprecated Use loadProviderApiKey('gemini') instead
 */
export async function loadApiKey(): Promise<string | null> {
  return loadProviderApiKey('gemini');
}

/**
 * Save API key (Gemini)
 * @deprecated Use saveProviderApiKey('gemini', apiKey) instead
 */
export async function saveApiKey(
  apiKey: string | null | undefined,
): Promise<void> {
  return saveProviderApiKey('gemini', apiKey);
}

/**
 * Clear cached API key (Gemini)
 * @deprecated Use clearProviderApiKey('gemini') instead
 */
export async function clearApiKey(): Promise<void> {
  return clearProviderApiKey('gemini');
}
