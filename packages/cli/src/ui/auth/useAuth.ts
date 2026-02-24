/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LoadedSettings } from '../../config/settings.js';
import {
  AuthType,
  type Config,
  loadApiKey,
  loadProviderApiKey,
  debugLogger,
  getErrorMessage,
  resolveEnv,
} from '@didim365/agent-cli-core';
import { AuthState } from '../types.js';
import { validateAuthMethod } from '../../config/auth.js';
import { normalizeProviderKey } from '../utils/resolveActiveProvider.js';

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

    // Existing user with selectedType but no selectedProvider → show provider selection
    // so they can explicitly choose their provider in the multi-provider model.
    if (selectedType && !selectedProvider) {
      return AuthState.SelectingProvider;
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
    settings.merged.security.auth.selectedProvider
      ? normalizeProviderKey(settings.merged.security.auth.selectedProvider)
      : undefined,
  );

  // Guard against concurrent async execution of the main auth useEffect
  const isAuthenticatingRef = useRef(false);

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
      // Load the correct provider's API key as default value
      if (selectedProvider && selectedProvider !== 'gemini') {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        reloadProviderApiKey(selectedProvider);
      } else {
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        reloadApiKey();
      }
    }
  }, [authState, reloadApiKey, reloadProviderApiKey, selectedProvider]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    (async () => {
      if (authState !== AuthState.Unauthenticated) {
        return;
      }
      if (isAuthenticatingRef.current) {
        return;
      }
      isAuthenticatingRef.current = true;
      try {
        const authType = settings.merged.security.auth.selectedType;
        if (!authType) {
          // Check for env-based non-Gemini providers before showing error
          const llmProvider = process.env['LLM_PROVIDER'];
          if (llmProvider) {
            // Validate that the corresponding API key env var is set
            // Note: openai-compatible (sLM) does NOT require API key — many local servers are unauthenticated
            const requiredKeyMap: Record<string, string> = {
              claude: 'ANTHROPIC_API_KEY',
              openai: 'OPENAI_API_KEY',
              // 'openai-compatible' intentionally omitted — API key is optional for sLM
            };
            const requiredEnvVar = requiredKeyMap[llmProvider];
            if (requiredEnvVar && !process.env[requiredEnvVar]) {
              onAuthError(
                `LLM_PROVIDER="${llmProvider}" is set but ${requiredEnvVar} is missing. ` +
                  `Set the ${requiredEnvVar} environment variable or remove LLM_PROVIDER.`,
              );
              return;
            }

            // For openai-compatible, validate LLM_BASE_URL and LLM_MODEL are set
            if (
              llmProvider === 'openai-compatible' ||
              llmProvider === 'openai_compatible'
            ) {
              if (!process.env['LLM_BASE_URL']) {
                onAuthError(
                  `LLM_PROVIDER="${llmProvider}" requires LLM_BASE_URL. ` +
                    `Set the LLM_BASE_URL environment variable (e.g., http://localhost:8000/v1).`,
                );
                return;
              }
              if (!process.env['LLM_MODEL']) {
                onAuthError(
                  `LLM_PROVIDER="${llmProvider}" requires LLM_MODEL. ` +
                    `Set the LLM_MODEL environment variable to your model name ` +
                    `(e.g., llama3, gpt-oss-20b, Qwen/Qwen2.5-7B-Instruct).`,
                );
                return;
              }
            }

            // LLM_PROVIDER is set — route directly to that provider
            process.env['ENABLE_MULTI_PROVIDER'] = 'true';
            try {
              await config.refreshAuth(AuthType.USE_GEMINI);
              debugLogger.log(
                `Authenticated via env LLM_PROVIDER="${llmProvider}".`,
              );
              setAuthError(null);
              setAuthState(AuthState.Authenticated);
            } catch (e) {
              onAuthError(`Failed to login. Message: ${getErrorMessage(e)}`);
            }
            return;
          }
          if (process.env['ANTHROPIC_API_KEY']) {
            // Auto-detect Claude provider from env var
            process.env['ENABLE_MULTI_PROVIDER'] = 'true';
            process.env['LLM_PROVIDER'] = 'claude';
            try {
              await config.refreshAuth(AuthType.USE_GEMINI);
              debugLogger.log('Authenticated via env ANTHROPIC_API_KEY.');
              setAuthError(null);
              setAuthState(AuthState.Authenticated);
            } catch (e) {
              onAuthError(`Failed to login. Message: ${getErrorMessage(e)}`);
            }
            return;
          }
          if (process.env['OPENAI_API_KEY']) {
            // Auto-detect OpenAI provider from env var
            process.env['ENABLE_MULTI_PROVIDER'] = 'true';
            process.env['LLM_PROVIDER'] = 'openai';
            try {
              await config.refreshAuth(AuthType.USE_GEMINI);
              debugLogger.log('Authenticated via env OPENAI_API_KEY.');
              setAuthError(null);
              setAuthState(AuthState.Authenticated);
            } catch (e) {
              onAuthError(`Failed to login. Message: ${getErrorMessage(e)}`);
            }
            return;
          }
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
          const rawProvider = settings.merged.security.auth.selectedProvider;
          const provider = rawProvider
            ? normalizeProviderKey(rawProvider)
            : undefined;
          if (provider === 'openai-compatible') {
            // sLM (OpenAI-compatible) — load config from settings
            process.env['ENABLE_MULTI_PROVIDER'] = 'true';
            const slmConfig = settings.merged.security.auth.slmConfig as
              | {
                  baseUrl?: string;
                  model?: string;
                  apiKeyHeaderName?: string;
                  customHeaders?: string;
                }
              | undefined;
            if (!slmConfig?.baseUrl || !slmConfig?.model) {
              // No baseUrl or model configured — need sLM configuration dialog
              // Model is required for OpenAI-compatible servers (403 Model Not Found otherwise)
              setAuthState(AuthState.ConfiguringSlm);
              return;
            }
            process.env['LLM_PROVIDER'] = 'openai-compatible';
            process.env['LLM_BASE_URL'] = slmConfig.baseUrl;

            // Clear optional env vars first to prevent stale values
            delete process.env['LLM_MODEL'];
            delete process.env['LLM_API_KEY'];
            delete process.env['LLM_API_KEY_HEADER'];
            delete process.env['LLM_CUSTOM_HEADERS'];

            if (slmConfig.model) {
              process.env['LLM_MODEL'] = slmConfig.model;
            }
            if (slmConfig.apiKeyHeaderName) {
              process.env['LLM_API_KEY_HEADER'] = slmConfig.apiKeyHeaderName;
            }
            if (slmConfig.customHeaders) {
              process.env['LLM_CUSTOM_HEADERS'] = slmConfig.customHeaders;
            }
            // API key is optional for sLM
            const key = await reloadProviderApiKey(provider);
            if (key) {
              process.env['LLM_API_KEY'] = key;
            }
          } else if (provider && provider !== 'gemini') {
            // Non-Gemini provider (Claude/OpenAI) saved with selectedType=USE_GEMINI
            // Clean up sLM-specific env vars to prevent cross-provider leakage
            delete process.env['LLM_MODEL'];
            delete process.env['LLM_BASE_URL'];
            delete process.env['LLM_API_KEY'];
            delete process.env['LLM_API_KEY_HEADER'];
            delete process.env['LLM_CUSTOM_HEADERS'];
            process.env['ENABLE_MULTI_PROVIDER'] = 'true';
            // Load the provider-specific key and set env vars for providerSelector
            const key = await reloadProviderApiKey(provider);
            if (!key) {
              setAuthState(AuthState.AwaitingApiKeyInput);
              return;
            }
            // Set env vars so providerSelector routes to the correct adapter
            const envVarMap: Record<string, string> = {
              claude: 'ANTHROPIC_API_KEY',
              openai: 'OPENAI_API_KEY',
            };
            const envVarName = envVarMap[provider];
            if (envVarName) {
              process.env[envVarName] = key;
            }
            process.env['LLM_PROVIDER'] = provider;
          } else {
            // Gemini path (legacy)
            const key = await reloadApiKey();
            if (!key) {
              setAuthState(AuthState.AwaitingApiKeyInput);
              return;
            }
          }
        }

        if (authType === AuthType.USE_VERTEX_AI) {
          // Vertex AI — restore project/location from saved settings
          const vertexConfig = settings.merged.security.auth.vertexConfig as
            | { project?: string; location?: string }
            | undefined;
          if (!vertexConfig?.project || !vertexConfig?.location) {
            // Missing project or location — need Vertex AI configuration dialog
            setAuthState(AuthState.ConfiguringVertex);
            return;
          }
          process.env['GOOGLE_CLOUD_PROJECT'] = vertexConfig.project;
          process.env['GOOGLE_CLOUD_LOCATION'] = vertexConfig.location;
        }

        const error = validateAuthMethodWithSettings(authType, settings);
        if (error) {
          onAuthError(error);
          return;
        }

        const defaultAuthType = resolveEnv('DEFAULT_AUTH_TYPE');
        if (
          defaultAuthType &&
          !Object.values(AuthType).includes(defaultAuthType as AuthType)
        ) {
          onAuthError(
            `Invalid value for DIDIM_DEFAULT_AUTH_TYPE (or GEMINI_DEFAULT_AUTH_TYPE): "${defaultAuthType}". ` +
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
      } finally {
        isAuthenticatingRef.current = false;
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
    reloadProviderApiKey,
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
