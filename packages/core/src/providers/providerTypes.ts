/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Supported LLM provider types.
 *
 * This enum defines all supported provider backends. Each provider
 * has its own authentication and configuration requirements.
 */
export enum ProviderType {
  /** Google Gemini (supports multiple auth types) */
  Gemini = 'gemini',
  /** Anthropic Claude (API key only) */
  Claude = 'claude',
  /** OpenAI (API key only) */
  OpenAI = 'openai',
  /** OpenAI-compatible API (custom endpoint) */
  OpenAICompatible = 'openai-compatible',
  /** Didim AI Studio (internal) */
  Didim = 'didim',
}

/**
 * Authentication types for Gemini provider.
 *
 * AuthType is specific to the Gemini provider, which supports
 * multiple authentication methods. Other providers use API keys only.
 *
 * @remarks
 * This enum mirrors the AuthType in `core/contentGenerator.ts` for
 * compatibility with existing auth flows. Both enums have identical
 * values. The providers module uses this local copy to avoid circular
 * dependencies with the core module.
 *
 * @see core/contentGenerator.ts AuthType for the original definition
 */
export enum AuthType {
  /** OAuth2 personal login via Google */
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  /** Direct Gemini API key */
  USE_GEMINI = 'gemini-api-key',
  /** Vertex AI with Google Cloud */
  USE_VERTEX_AI = 'vertex-ai',
  /** Legacy Cloud Shell authentication */
  LEGACY_CLOUD_SHELL = 'cloud-shell',
  /** Compute Engine default credentials */
  COMPUTE_ADC = 'compute-default-credentials',
}

/**
 * Mapping of provider types to supported auth types.
 *
 * Only Gemini supports AuthType; other providers use API keys directly.
 */
export const PROVIDER_AUTH_MAPPING: Record<ProviderType, AuthType[]> = {
  [ProviderType.Gemini]: [
    AuthType.LOGIN_WITH_GOOGLE,
    AuthType.USE_GEMINI,
    AuthType.USE_VERTEX_AI,
    AuthType.LEGACY_CLOUD_SHELL,
    AuthType.COMPUTE_ADC,
  ],
  [ProviderType.Claude]: [],
  [ProviderType.OpenAI]: [],
  [ProviderType.OpenAICompatible]: [],
  [ProviderType.Didim]: [],
};

/**
 * Get supported auth types for a provider.
 *
 * @param provider - Provider type
 * @returns Array of supported auth types (empty for non-Gemini providers)
 *
 * @example
 * ```ts
 * getAuthTypesForProvider(ProviderType.Gemini)
 * // [AuthType.LOGIN_WITH_GOOGLE, AuthType.USE_GEMINI, ...]
 *
 * getAuthTypesForProvider(ProviderType.Claude)
 * // []
 * ```
 */
export function getAuthTypesForProvider(provider: ProviderType): AuthType[] {
  return PROVIDER_AUTH_MAPPING[provider] ?? [];
}

/**
 * Get the provider type for an auth type.
 *
 * Since all AuthTypes are Gemini-specific, this always returns Gemini.
 *
 * @param authType - Authentication type
 * @returns ProviderType.Gemini
 */
export function getProviderForAuthType(_authType: AuthType): ProviderType {
  // All AuthType values are Gemini-specific
  return ProviderType.Gemini;
}

/**
 * Check if an auth type is for Gemini provider.
 *
 * @param authType - Authentication type to check
 * @returns True (all AuthTypes are Gemini-specific)
 */
export function isGeminiAuthType(_authType: AuthType): boolean {
  // All defined AuthType values are for Gemini
  return true;
}

/**
 * Check if a provider supports AuthType-based authentication.
 *
 * @param provider - Provider type
 * @returns True if provider supports AuthType (only Gemini)
 */
export function supportsAuthType(provider: ProviderType): boolean {
  return PROVIDER_AUTH_MAPPING[provider].length > 0;
}
