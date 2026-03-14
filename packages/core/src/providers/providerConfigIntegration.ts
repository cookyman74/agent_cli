/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ProviderType,
  type AuthType,
  getProviderForAuthType,
} from './providerTypes.js';
import { selectProvider } from './providerSelector.js';
import { LlmError, LlmErrorType } from './errors.js';

/**
 * Options for configuring provider selection.
 *
 * These options can be provided explicitly or resolved from environment
 * variables.
 */
export interface ProviderConfigOptions {
  /** Explicit provider type selection */
  provider?: ProviderType;
  /** API key (for providers that require it) */
  apiKey?: string;
  /** Base URL (for OpenAI-compatible providers) */
  baseUrl?: string;
  /** Auth type (for Gemini provider) */
  authType?: AuthType;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Resolved provider configuration.
 */
export interface ResolvedProviderConfig {
  /** Selected provider type */
  type: ProviderType;
  /** API key if available */
  apiKey?: string;
  /** Base URL (for OpenAI-compatible) */
  baseUrl?: string;
  /** Auth type (for Gemini) */
  authType?: AuthType;
  /** Request timeout in ms */
  timeout?: number;
}

/**
 * Get provider configuration from explicit options or environment.
 *
 * Priority order:
 * 1. Explicit provider option
 * 2. Explicit authType option (implies Gemini)
 * 3. LLM_PROVIDER env var
 * 4. Fallback to Gemini
 *
 * @param options - Configuration options
 * @returns Resolved provider configuration
 *
 * @example
 * ```ts
 * // Explicit provider
 * const config = getProviderFromConfig({
 *   provider: ProviderType.Claude,
 *   apiKey: 'sk-ant-xxx'
 * });
 *
 * // Environment-based
 * // LLM_PROVIDER=openai, OPENAI_API_KEY=xxx
 * const config = getProviderFromConfig({});
 * ```
 */
export function getProviderFromConfig(
  options: ProviderConfigOptions,
): ResolvedProviderConfig {
  // Priority 1: Explicit provider option
  if (options.provider) {
    const envVars = resolveProviderEnvVars(options.provider);

    return {
      type: options.provider,
      apiKey: options.apiKey ?? envVars.apiKey,
      baseUrl: options.baseUrl ?? envVars.baseUrl,
      authType: options.authType,
      timeout: options.timeout,
    };
  }

  // Priority 2: Explicit authType (implies Gemini)
  if (options.authType) {
    const provider = getProviderForAuthType(options.authType);
    const envVars = resolveProviderEnvVars(provider);

    return {
      type: provider,
      apiKey: options.apiKey ?? envVars.apiKey,
      authType: options.authType,
      timeout: options.timeout,
    };
  }

  // Priority 3: Use selectProvider for env-based resolution
  const selection = selectProvider({ authType: options.authType });

  return {
    type: selection.type,
    apiKey: options.apiKey ?? selection.apiKey,
    baseUrl: options.baseUrl ?? selection.baseUrl,
    authType: selection.authType,
    timeout: options.timeout,
  };
}

/**
 * Validate that provider configuration has required fields.
 *
 * @deprecated Use validateResolvedConfig() for resolved configurations.
 * This function only validates explicit options and may miss env-resolved values.
 *
 * @param config - Provider configuration to validate
 * @throws LlmError if validation fails
 */
export function validateProviderConfig(config: ProviderConfigOptions): void {
  const provider = config.provider ?? ProviderType.Gemini;

  switch (provider) {
    case ProviderType.Gemini:
      // Gemini can work with apiKey OR authType
      // No strict validation here - will fail at runtime if neither works
      break;

    case ProviderType.Claude:
      if (!config.apiKey) {
        throw new LlmError(
          LlmErrorType.INVALID_REQUEST,
          'Claude provider requires apiKey',
        );
      }
      break;

    case ProviderType.OpenAI:
      if (!config.apiKey) {
        throw new LlmError(
          LlmErrorType.INVALID_REQUEST,
          'OpenAI provider requires apiKey',
        );
      }
      break;

    case ProviderType.OpenAICompatible:
      if (!config.baseUrl) {
        throw new LlmError(
          LlmErrorType.INVALID_REQUEST,
          'OpenAI-compatible provider requires baseUrl',
        );
      }
      break;

    case ProviderType.Didim:
      if (!config.apiKey) {
        throw new LlmError(
          LlmErrorType.INVALID_REQUEST,
          'Didim provider requires apiKey',
        );
      }
      break;
    default:
      // No-op for unknown providers
      break;
  }
}

/**
 * Validate resolved provider configuration.
 *
 * Note: For Didim provider, serverAddress is validated at bootstrap time
 * (bootstrap.ts) rather than here, because ResolvedProviderConfig does not
 * include provider-specific fields like serverAddress.
 *
 * Use this function after getProviderFromConfig() to validate that
 * the resolved configuration has all required fields.
 *
 * @param config - Resolved provider configuration to validate
 * @throws LlmError if validation fails
 */
export function validateResolvedConfig(config: ResolvedProviderConfig): void {
  switch (config.type) {
    case ProviderType.Gemini:
      // Gemini can work with apiKey OR authType
      break;

    case ProviderType.Claude:
      if (!config.apiKey) {
        throw new LlmError(
          LlmErrorType.INVALID_REQUEST,
          'Claude provider requires apiKey',
        );
      }
      break;

    case ProviderType.OpenAI:
      if (!config.apiKey) {
        throw new LlmError(
          LlmErrorType.INVALID_REQUEST,
          'OpenAI provider requires apiKey',
        );
      }
      break;

    case ProviderType.OpenAICompatible:
      if (!config.baseUrl) {
        throw new LlmError(
          LlmErrorType.INVALID_REQUEST,
          'OpenAI-compatible provider requires baseUrl',
        );
      }
      break;

    case ProviderType.Didim:
      if (!config.apiKey) {
        throw new LlmError(
          LlmErrorType.INVALID_REQUEST,
          'Didim provider requires apiKey',
        );
      }
      break;
    default:
      // No-op for unknown providers
      break;
  }
}

/**
 * Resolve provider-specific environment variables.
 *
 * @param provider - Provider type
 * @returns Object containing resolved apiKey, baseUrl, and provider-specific fields
 */
export function resolveProviderEnvVars(provider: ProviderType): {
  apiKey?: string;
  baseUrl?: string;
  /** Didim server address (from DIDIM_SERVER_ADDRESS) */
  serverAddress?: string;
  /** Didim stream mode (from DIDIM_STREAM_MODE) */
  streamMode?: string;
} {
  switch (provider) {
    case ProviderType.Gemini:
      return {
        apiKey: process.env['GEMINI_API_KEY'] || process.env['GOOGLE_API_KEY'],
      };

    case ProviderType.Claude:
      return {
        apiKey: process.env['ANTHROPIC_API_KEY'],
      };

    case ProviderType.OpenAI:
      return {
        apiKey: process.env['OPENAI_API_KEY'],
      };

    case ProviderType.OpenAICompatible:
      return {
        apiKey: process.env['LLM_API_KEY'],
        baseUrl: process.env['LLM_BASE_URL'],
      };

    case ProviderType.Didim:
      return {
        apiKey: process.env['DIDIM_API_KEY'],
        serverAddress: process.env['DIDIM_SERVER_ADDRESS'],
        streamMode: process.env['DIDIM_STREAM_MODE'],
      };

    default:
      return {};
  }
}
