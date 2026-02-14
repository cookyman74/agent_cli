/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import {
  AuthType,
  type Config,
  loadApiKey,
  loadProviderApiKey,
  debugLogger,
  getErrorMessage,
} from '@didim365/agent-cli-core';
import { AuthState } from '../types.js';
import { validateAuthMethod } from '../../config/auth.js';

export function validateAuthMethodWithSettings(
  authType: AuthType,
  settings: LoadedSettings,
): string | null {
  const enforcedType = settings.merged.security.auth.enforcedType;
  if (enforcedType && enforcedType !== authType) {
    return `Authentication is enforced to be ${enforcedType}, but you are currently using ${authType}.`;
  }
  if (settings.merged.security.auth.useExternal) {
    return null;
  }
  // If using Gemini API key, we don't validate it here as we might need to prompt for it.
  if (authType === AuthType.USE_GEMINI) {
    return null;
  }
  return validateAuthMethod(authType);
}

export const useAuthCommand = (
  settings: LoadedSettings,
  config: Config,
  initialAuthError: string | null = null,
) => {
  // Determine initial auth state considering multi-provider settings
  const determineInitialState = (): AuthState => {
    if (initialAuthError) {
      return AuthState.Updating;
    }
    const selectedProvider = settings.merged.security.auth.selectedProvider;
    const selectedType = settings.merged.security.auth.selectedType;

    // Auto-migration: existing Gemini user with selectedType but no selectedProvider
    if (selectedType && !selectedProvider) {
      return AuthState.Unauthenticated;
    }
    // No provider and no type → need provider selection
    if (!selectedProvider && !selectedType) {
      // Check for env var auto-detection
      if (process.env['LLM_PROVIDER']) {
        return AuthState.Unauthenticated;
      }
      if (process.env['ANTHROPIC_API_KEY']) {
        return AuthState.Unauthenticated;
      }
      if (process.env['OPENAI_API_KEY']) {
        return AuthState.Unauthenticated;
      }
      // Fall through to original behavior if GEMINI_API_KEY is set
      if (process.env['GEMINI_API_KEY']) {
        return AuthState.Unauthenticated;
      }
      return AuthState.SelectingProvider;
    }
    return AuthState.Unauthenticated;
  };

  const [authState, setAuthState] = useState<AuthState>(
    determineInitialState(),
  );

  const [authError, setAuthError] = useState<string | null>(initialAuthError);
  const [apiKeyDefaultValue, setApiKeyDefaultValue] = useState<
    string | undefined
  >(undefined);
  const [selectedProvider, setSelectedProvider] = useState<string | undefined>(
    settings.merged.security.auth.selectedProvider,
  );

  const onAuthError = useCallback(
    (error: string | null) => {
      setAuthError(error);
      if (error) {
        setAuthState(AuthState.Updating);
      }
    },
    [setAuthError, setAuthState],
  );

  const reloadApiKey = useCallback(async () => {
    const envKey = process.env['GEMINI_API_KEY'];
    if (envKey !== undefined) {
      setApiKeyDefaultValue(envKey);
      return envKey;
    }

    const storedKey = (await loadApiKey()) ?? '';
    setApiKeyDefaultValue(storedKey);
    return storedKey;
  }, []);

  const reloadProviderApiKey = useCallback(async (provider: string) => {
    // Map provider to env var name
    const envVarMap: Record<string, string> = {
      gemini: 'GEMINI_API_KEY',
      claude: 'ANTHROPIC_API_KEY',
      openai: 'OPENAI_API_KEY',
      'openai-compatible': 'LLM_API_KEY',
      didim: 'DIDIM_API_KEY',
    };
    const envVarName = envVarMap[provider];
    if (envVarName) {
      const envKey = process.env[envVarName];
      if (envKey !== undefined) {
        setApiKeyDefaultValue(envKey);
        return envKey;
      }
    }

    const storedKey = (await loadProviderApiKey(provider)) ?? '';
    setApiKeyDefaultValue(storedKey);
    return storedKey;
  }, []);

  useEffect(() => {
    if (authState === AuthState.AwaitingApiKeyInput) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      reloadApiKey();
    }
  }, [authState, reloadApiKey]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      if (authState !== AuthState.Unauthenticated) {
        return;
      }

      const authType = settings.merged.security.auth.selectedType;
      if (!authType) {
        if (process.env['GEMINI_API_KEY']) {
          onAuthError(
            'Existing API key detected (GEMINI_API_KEY). Select "Gemini API Key" option to use it.',
          );
        } else {
          onAuthError('No authentication method selected.');
        }
        return;
      }

      if (authType === AuthType.USE_GEMINI) {
        const key = await reloadApiKey(); // Use the unified function
        if (!key) {
          setAuthState(AuthState.AwaitingApiKeyInput);
          return;
        }
      }

      const error = validateAuthMethodWithSettings(authType, settings);
      if (error) {
        onAuthError(error);
        return;
      }

      const defaultAuthType = process.env['GEMINI_DEFAULT_AUTH_TYPE'];
      if (
        defaultAuthType &&
        !Object.values(AuthType).includes(defaultAuthType as AuthType)
      ) {
        onAuthError(
          `Invalid value for GEMINI_DEFAULT_AUTH_TYPE: "${defaultAuthType}". ` +
            `Valid values are: ${Object.values(AuthType).join(', ')}.`,
        );
        return;
      }

      try {
        await config.refreshAuth(authType);

        debugLogger.log(`Authenticated via "${authType}".`);
        setAuthError(null);
        setAuthState(AuthState.Authenticated);
      } catch (e) {
        onAuthError(`Failed to login. Message: ${getErrorMessage(e)}`);
      }
    })();
  }, [
    settings,
    config,
    authState,
    setAuthState,
    setAuthError,
    onAuthError,
    reloadApiKey,
  ]);

  return {
    authState,
    setAuthState,
    authError,
    onAuthError,
    apiKeyDefaultValue,
    reloadApiKey,
    reloadProviderApiKey,
    selectedProvider,
    setSelectedProvider,
  };
};
