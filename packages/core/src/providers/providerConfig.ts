/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderType, type AuthType } from './providerTypes.js';

/**
 * Base provider configuration.
 *
 * All provider-specific configs extend this interface.
 */
export interface ProviderConfig {
  /** Provider type identifier */
  provider: ProviderType;
  /** API key (optional for some auth types) */
  apiKey?: string;
  /** Custom base URL */
  baseUrl?: string;
  /** Request timeout in ms */
  timeout?: number;
  /** Proxy URL */
  proxy?: string;
}

/**
 * Gemini provider configuration.
 *
 * Supports multiple authentication types (OAuth, API key, Vertex AI, etc.)
 */
export interface GeminiProviderConfig extends ProviderConfig {
  provider: ProviderType.Gemini;
  /** Authentication type */
  authType?: AuthType;
  /** Google Cloud project (for Vertex AI) */
  project?: string;
  /** Google Cloud location (for Vertex AI) */
  location?: string;
}

/**
 * Claude (Anthropic) provider configuration.
 */
export interface ClaudeProviderConfig extends ProviderConfig {
  provider: ProviderType.Claude;
  /** Anthropic API key (required) */
  apiKey: string;
  /** Anthropic API version */
  anthropicVersion?: string;
}

/**
 * OpenAI provider configuration.
 */
export interface OpenAIProviderConfig extends ProviderConfig {
  provider: ProviderType.OpenAI;
  /** OpenAI API key (required) */
  apiKey: string;
  /** OpenAI organization ID */
  organization?: string;
}

/**
 * OpenAI-compatible provider configuration.
 *
 * Used for local servers or third-party APIs that follow OpenAI's API format.
 */
export interface OpenAICompatibleConfig extends ProviderConfig {
  provider: ProviderType.OpenAICompatible;
  /** Base URL (required) */
  baseUrl: string;
  /** API key (may be optional for local servers) */
  apiKey?: string;
}

/**
 * Didim AI Studio provider configuration.
 */
export interface DidimProviderConfig extends ProviderConfig {
  provider: ProviderType.Didim;
  /** Didim API key */
  apiKey: string;
  /** Didim endpoint */
  endpoint?: string;
}

/**
 * Union type of all provider-specific configs.
 */
export type AnyProviderConfig =
  | GeminiProviderConfig
  | ClaudeProviderConfig
  | OpenAIProviderConfig
  | OpenAICompatibleConfig
  | DidimProviderConfig;

/**
 * Create a provider configuration with default values.
 *
 * @param provider - Provider type
 * @param options - Provider-specific options
 * @returns Provider configuration
 *
 * @example
 * ```ts
 * const config = createProviderConfig(ProviderType.Gemini, {
 *   apiKey: 'xxx',
 *   authType: AuthType.USE_GEMINI
 * });
 * ```
 */
export function createProviderConfig<T extends ProviderConfig>(
  provider: ProviderType,
  options: Omit<T, 'provider'>,
): T {
  return {
    provider,
    ...options,
  } as T;
}

/**
 * Create Gemini provider config with proper typing.
 */
export function createGeminiConfig(
  options: Omit<GeminiProviderConfig, 'provider'>,
): GeminiProviderConfig {
  return { provider: ProviderType.Gemini, ...options };
}

/**
 * Create Claude provider config with proper typing.
 * @throws Compile error if apiKey is missing
 */
export function createClaudeConfig(
  options: Omit<ClaudeProviderConfig, 'provider'>,
): ClaudeProviderConfig {
  return { provider: ProviderType.Claude, ...options };
}

/**
 * Create OpenAI provider config with proper typing.
 * @throws Compile error if apiKey is missing
 */
export function createOpenAIConfig(
  options: Omit<OpenAIProviderConfig, 'provider'>,
): OpenAIProviderConfig {
  return { provider: ProviderType.OpenAI, ...options };
}

/**
 * Create OpenAI-compatible provider config with proper typing.
 * @throws Compile error if baseUrl is missing
 */
export function createOpenAICompatibleConfig(
  options: Omit<OpenAICompatibleConfig, 'provider'>,
): OpenAICompatibleConfig {
  return { provider: ProviderType.OpenAICompatible, ...options };
}

/**
 * Create Didim provider config with proper typing.
 * @throws Compile error if apiKey is missing
 */
export function createDidimConfig(
  options: Omit<DidimProviderConfig, 'provider'>,
): DidimProviderConfig {
  return { provider: ProviderType.Didim, ...options };
}

/**
 * Type guard for Gemini config.
 */
export function isGeminiConfig(
  config: ProviderConfig,
): config is GeminiProviderConfig {
  return config.provider === ProviderType.Gemini;
}

/**
 * Type guard for Claude config.
 */
export function isClaudeConfig(
  config: ProviderConfig,
): config is ClaudeProviderConfig {
  return config.provider === ProviderType.Claude;
}

/**
 * Type guard for OpenAI config.
 */
export function isOpenAIConfig(
  config: ProviderConfig,
): config is OpenAIProviderConfig {
  return config.provider === ProviderType.OpenAI;
}

/**
 * Type guard for OpenAI-compatible config.
 */
export function isOpenAICompatibleConfig(
  config: ProviderConfig,
): config is OpenAICompatibleConfig {
  return config.provider === ProviderType.OpenAICompatible;
}

/**
 * Type guard for Didim config.
 */
export function isDidimConfig(
  config: ProviderConfig,
): config is DidimProviderConfig {
  return config.provider === ProviderType.Didim;
}
