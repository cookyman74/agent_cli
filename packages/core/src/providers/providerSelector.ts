/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ProviderType,
  getProviderForAuthType,
  type AuthType,
} from './providerTypes.js';
import { LlmError, LlmErrorType } from './errors.js';
import {
  PROVIDER_MODEL_REGISTRY,
  getDefaultModelFromRegistry,
  isModelValidForProvider,
} from '../config/providerModels.js';

/**
 * Provider selection result.
 */
export interface ProviderSelection {
  /** Selected provider type */
  type: ProviderType;
  /** Auth type (only for Gemini) */
  authType?: AuthType;
  /** API key if available */
  apiKey?: string;
  /** Base URL (for OpenAI-compatible) */
  baseUrl?: string;
}

/**
 * Options for provider selection.
 */
export interface ProviderSelectionOptions {
  /** Configured auth type (for Gemini) */
  authType?: AuthType;
}

/**
 * Required environment variables per provider.
 */
const PROVIDER_ENV_VARS: Record<ProviderType, string[]> = {
  [ProviderType.Gemini]: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
  [ProviderType.Claude]: ['ANTHROPIC_API_KEY'],
  [ProviderType.OpenAI]: ['OPENAI_API_KEY'],
  [ProviderType.OpenAICompatible]: ['LLM_BASE_URL'],
  [ProviderType.Didim]: ['DIDIM_API_KEY'],
};

/**
 * Parse LLM_PROVIDER environment variable to ProviderType.
 */
function parseProviderEnv(value: string): ProviderType {
  const normalized = value.toLowerCase().trim();

  switch (normalized) {
    case 'gemini':
      return ProviderType.Gemini;
    case 'claude':
    case 'anthropic':
      return ProviderType.Claude;
    case 'openai':
      return ProviderType.OpenAI;
    case 'openai-compatible':
    case 'openai_compatible':
      return ProviderType.OpenAICompatible;
    case 'didim':
      return ProviderType.Didim;
    default:
      throw new LlmError(
        LlmErrorType.INVALID_REQUEST,
        `Unknown provider: ${value}`,
      );
  }
}

/**
 * Select the appropriate provider based on environment and config.
 *
 * Priority order:
 * 1. LLM_PROVIDER environment variable
 * 2. Configured authType (implies Gemini)
 * 3. GEMINI_API_KEY or GOOGLE_API_KEY (fallback to Gemini)
 *
 * @param options - Selection options
 * @returns Provider selection result
 *
 * @example
 * ```ts
 * // Use LLM_PROVIDER=claude
 * const result = selectProvider();
 * // { type: ProviderType.Claude }
 *
 * // Use authType config
 * const result = selectProvider({ authType: AuthType.USE_GEMINI });
 * // { type: ProviderType.Gemini, authType: AuthType.USE_GEMINI }
 * ```
 */
export function selectProvider(
  options: ProviderSelectionOptions = {},
): ProviderSelection {
  const llmProvider = process.env['LLM_PROVIDER'];

  // Priority 1: LLM_PROVIDER env var
  if (llmProvider) {
    const providerType = parseProviderEnv(llmProvider);
    validateProviderEnv(providerType);

    const selection: ProviderSelection = {
      type: providerType,
      apiKey: getApiKeyForProvider(providerType),
    };

    // Add baseUrl for OpenAI-compatible
    if (providerType === ProviderType.OpenAICompatible) {
      selection.baseUrl = process.env['LLM_BASE_URL'];
    }

    return selection;
  }

  // Priority 2: authType config (implies Gemini)
  if (options.authType) {
    return {
      type: getProviderForAuthType(options.authType),
      authType: options.authType,
      apiKey: getApiKeyForProvider(ProviderType.Gemini),
    };
  }

  // Priority 3: Fallback - check for Gemini API key
  const geminiKey =
    process.env['GEMINI_API_KEY'] || process.env['GOOGLE_API_KEY'];

  if (geminiKey) {
    return {
      type: ProviderType.Gemini,
      apiKey: geminiKey,
    };
  }

  // Default to Gemini (will fail later if no auth configured)
  return {
    type: ProviderType.Gemini,
  };
}

/**
 * Get required environment variables for a provider.
 *
 * @param provider - Provider type
 * @returns Array of required environment variable names
 */
export function getRequiredEnvVars(provider: ProviderType): string[] {
  return PROVIDER_ENV_VARS[provider] ?? [];
}

/**
 * Validate that required environment variables are set for a provider.
 *
 * @param provider - Provider type
 * @throws Error if required env vars are missing
 */
export function validateProviderEnv(provider: ProviderType): void {
  const requiredVars = getRequiredEnvVars(provider);

  // For Gemini, either GEMINI_API_KEY or GOOGLE_API_KEY works
  if (provider === ProviderType.Gemini) {
    const hasAnyKey = requiredVars.some((v) => !!process.env[v]);
    if (!hasAnyKey) {
      throw new LlmError(
        LlmErrorType.INVALID_REQUEST,
        `Missing required environment variable: One of ${requiredVars.join(' or ')} must be set`,
      );
    }
    return;
  }

  // For other providers, check all required vars
  const missingVars = requiredVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    throw new LlmError(
      LlmErrorType.INVALID_REQUEST,
      `Missing required environment variable: ${missingVars.join(', ')}`,
    );
  }
}

// ============================================================================
// Provider Model Resolution
// ============================================================================

/**
 * Default model names per provider type.
 *
 * Derived from PROVIDER_MODEL_REGISTRY (SSOT) to prevent dual-maintenance.
 * When the CLI is configured with a Gemini-specific model but a non-Gemini
 * provider is selected, these defaults are used instead.
 */
const DEFAULT_PROVIDER_MODELS: Record<ProviderType, string> = {
  [ProviderType.Gemini]: getDefaultModelFromRegistry('gemini'),
  [ProviderType.Claude]: getDefaultModelFromRegistry('claude'),
  [ProviderType.OpenAI]: getDefaultModelFromRegistry('openai'),
  [ProviderType.OpenAICompatible]:
    getDefaultModelFromRegistry('openai-compatible'),
  [ProviderType.Didim]: getDefaultModelFromRegistry('didim'),
};

/**
 * Gemini model aliases recognized by the CLI.
 * These are short-form names that the model router resolves to concrete Gemini models.
 */
const GEMINI_ALIASES = new Set(['auto', 'pro', 'flash', 'flash-lite']);

/**
 * Get the default model name for a provider.
 *
 * @param provider - Provider type
 * @returns Default model name string
 */
export function getDefaultModelForProvider(provider: ProviderType): string {
  return DEFAULT_PROVIDER_MODELS[provider];
}

/**
 * Check if a model name is Gemini-specific (concrete name, alias, or auto model).
 *
 * @param model - Model name to check
 * @returns True if the model is a Gemini-specific name
 */
export function isGeminiSpecificModel(model: string): boolean {
  return (
    model.startsWith('gemini-') ||
    model.startsWith('auto-gemini') ||
    GEMINI_ALIASES.has(model)
  );
}

/**
 * Resolve the model name for a given provider.
 *
 * 0. modelSelectionDisabled provider (Didim) → always return fixed default
 *
 * Gemini-specific models (gemini-*, auto-gemini*, aliases):
 * 1. Gemini provider → pass through unchanged
 * 2. LLM_MODEL env var → use if valid for target provider (cross-provider validated)
 * 3. Non-Gemini provider → provider's default model from registry
 *
 * Non-Gemini models:
 * 4. Valid for target provider → pass through
 * 5. Cross-provider model (e.g., claude-* on openai) → provider default
 *
 * @param model - Current model name
 * @param provider - Target provider type or provider name string
 * @returns Resolved model name appropriate for the provider
 */
export function resolveProviderModel(
  model: string,
  provider: ProviderType | string,
): string {
  // modelSelectionDisabled providers always use their fixed default
  const group = PROVIDER_MODEL_REGISTRY[provider];
  if (group?.modelSelectionDisabled) {
    return getDefaultModelFromRegistry(provider);
  }

  // Gemini-specific model handling
  if (isGeminiSpecificModel(model)) {
    if (provider === ProviderType.Gemini) return model;

    // LLM_MODEL env var: validate before use to prevent cross-provider leak
    const llmModel = process.env['LLM_MODEL'];
    if (llmModel && isModelValidForProvider(llmModel, provider)) {
      return llmModel;
    }

    // Gemini-specific model + non-Gemini provider → provider default
    return getDefaultModelFromRegistry(provider);
  }

  // Non-Gemini model handling
  // For freeformInput providers (sLM/Ollama): detect stale cross-provider models.
  // freeformInput accepts any model string, so isModelValidForProvider always returns
  // true — a stale model from another provider (e.g., 'claude-sonnet-4-6') passes
  // through undetected. We check if the model is a registered/known model of another
  // provider and, if so, prefer LLM_MODEL. Unknown models (e.g., user-specified via
  // --model) are respected as-is to preserve CLI flag priority (argv.model > LLM_MODEL).
  const llmModelEnv = process.env['LLM_MODEL'];
  if (group?.freeformInput && llmModelEnv && llmModelEnv !== model) {
    if (isRegisteredModelOfOtherProvider(model, provider)) {
      return llmModelEnv;
    }
  }

  if (!isModelValidForProvider(model, provider)) {
    return getDefaultModelFromRegistry(provider);
  }

  return model;
}

/**
 * Check if a model clearly belongs to another provider.
 *
 * Uses two detection methods:
 * 1. Registry match: exact preset value or model ID in another provider's registry
 * 2. Prefix heuristic: known provider prefixes (claude-*, gpt-*, o[0-9]*, gemini-*)
 *
 * This avoids false positives from allowCustomModels/freeformInput, which would
 * incorrectly flag user-specified models (e.g., 'my-custom-llama') as belonging
 * to another provider.
 */
function isRegisteredModelOfOtherProvider(
  model: string,
  currentProvider: ProviderType | string,
): boolean {
  const normalized = model.toLowerCase();

  // Prefix heuristics for well-known provider model naming conventions
  const providerPrefixes: Record<string, Array<(m: string) => boolean>> = {
    claude: [(m) => m.startsWith('claude-')],
    openai: [(m) => m.startsWith('gpt-'), (m) => /^o[0-9]/.test(m)],
    gemini: [
      (m) => m.startsWith('gemini-'),
      (m) => m.startsWith('auto-gemini'),
    ],
  };

  for (const [providerKey, checks] of Object.entries(providerPrefixes)) {
    if (providerKey === currentProvider) continue;
    if (checks.some((check) => check(normalized))) return true;
  }

  // Registry match: exact preset/model ID in another provider
  for (const [key, g] of Object.entries(PROVIDER_MODEL_REGISTRY)) {
    if (
      key === currentProvider ||
      g.freeformInput ||
      g.modelSelectionDisabled
    ) {
      continue;
    }
    const presetValues = g.presets.map((p) => p.value);
    const modelIds = g.models.map((m) => m.id);
    if (presetValues.includes(model) || modelIds.includes(model)) {
      return true;
    }
  }

  return false;
}

/**
 * Get API key for a provider from environment.
 */
function getApiKeyForProvider(provider: ProviderType): string | undefined {
  switch (provider) {
    case ProviderType.Gemini:
      return process.env['GEMINI_API_KEY'] || process.env['GOOGLE_API_KEY'];
    case ProviderType.Claude:
      return process.env['ANTHROPIC_API_KEY'];
    case ProviderType.OpenAI:
      return process.env['OPENAI_API_KEY'];
    case ProviderType.Didim:
      return process.env['DIDIM_API_KEY'];
    case ProviderType.OpenAICompatible:
      return process.env['LLM_API_KEY'];
    default:
      return undefined;
  }
}
