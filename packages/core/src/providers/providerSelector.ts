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
  isRegisteredModelForProvider,
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
  /** Didim server address (from DIDIM_SERVER_ADDRESS) */
  serverAddress?: string;
  /** Didim stream mode (from DIDIM_STREAM_MODE) */
  streamMode?: string;
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
  [ProviderType.Didim]: ['DIDIM_API_KEY', 'DIDIM_SERVER_ADDRESS'],
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

    // Add Didim-specific fields
    if (providerType === ProviderType.Didim) {
      selection.serverAddress = process.env['DIDIM_SERVER_ADDRESS'];
      selection.streamMode = process.env['DIDIM_STREAM_MODE'] ?? 'sse';
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
  // Normalize provider alias to canonical registry key (e.g., 'openai_compatible' → 'openai-compatible')
  const normalizedProvider = normalizeProviderKey(provider);

  // modelSelectionDisabled providers always use their fixed default
  const group = PROVIDER_MODEL_REGISTRY[normalizedProvider];
  if (group?.modelSelectionDisabled) {
    return getDefaultModelFromRegistry(normalizedProvider);
  }

  // Gemini-specific model handling
  if (isGeminiSpecificModel(model)) {
    if (normalizedProvider === ProviderType.Gemini) return model;

    // LLM_MODEL env var: validate before use to prevent cross-provider leak
    const llmModel = process.env['LLM_MODEL'];
    if (llmModel && isModelValidForProvider(llmModel, normalizedProvider)) {
      return llmModel;
    }

    // Gemini-specific model + non-Gemini provider → provider default
    return getDefaultModelFromRegistry(normalizedProvider);
  }

  // Non-Gemini model handling
  const llmModelEnv = process.env['LLM_MODEL'];

  // Cross-provider stale model detection.
  // Two detection strategies work in tandem:
  //
  // 1. Prefix/registry heuristic (isRegisteredModelOfOtherProvider):
  //    Catches well-known models like 'claude-sonnet-4-6' or 'gpt-4o'.
  //
  // 2. Non-registered model check (isRegisteredModelForProvider):
  //    For freeformInput providers, any model is "valid", so (1) is the only guard.
  //    For non-freeformInput providers (Claude/OpenAI), models unknown to ALL providers
  //    (e.g., 'gpt-oss-20b' from sLM) pass allowCustomModels validation.
  //    If LLM_MODEL differs from model AND model is not in target's registry,
  //    this is a provider-switch scenario → prefer LLM_MODEL or default.
  if (llmModelEnv && llmModelEnv !== model) {
    // Strategy 1: model is a known model of another provider (prefix or registry)
    if (isRegisteredModelOfOtherProvider(model, normalizedProvider)) {
      if (isModelValidForProvider(llmModelEnv, normalizedProvider)) {
        return llmModelEnv;
      }
      return getDefaultModelFromRegistry(normalizedProvider);
    }

    // Strategy 2: model is not registered for target provider (non-freeformInput only)
    // On freeformInput, unknown models may be user-specified (--model) → respect them.
    // Exclude models with target provider's own prefix (e.g., 'claude-sonnet-4-20250514'
    // on Claude) — these are legitimate custom versions of the provider's own models
    // accepted via allowCustomModels, not cross-provider leaks.
    //
    // If the user explicitly supplied `--model <value>` (or `-m <value>`) for
    // this exact model, keep that explicit intent instead of overriding it.
    if (
      group &&
      !group.freeformInput &&
      !isRegisteredModelForProvider(model, normalizedProvider) &&
      !isOwnProviderPrefix(model, normalizedProvider) &&
      !wasModelExplicitlySpecified(model)
    ) {
      if (isModelValidForProvider(llmModelEnv, normalizedProvider)) {
        return llmModelEnv;
      }
      return getDefaultModelFromRegistry(normalizedProvider);
    }
    // Neither strategy identified the model as stale → fall through to
    // normal validation below (respects allowCustomModels / freeformInput).
  }

  // No LLM_MODEL: detect stale models using prefix/registry heuristic only.
  // Without LLM_MODEL signal, we cannot distinguish user-specified custom models
  // (e.g., --model my-custom-model) from stale cross-provider models. Delegate
  // to isModelValidForProvider which respects allowCustomModels.
  if (
    !llmModelEnv &&
    isRegisteredModelOfOtherProvider(model, normalizedProvider)
  ) {
    return getDefaultModelFromRegistry(normalizedProvider);
  }

  if (!isModelValidForProvider(model, normalizedProvider)) {
    return getDefaultModelFromRegistry(normalizedProvider);
  }

  return model;
}

/**
 * Normalize provider alias to canonical registry key.
 *
 * Maps common aliases (e.g., 'openai_compatible', 'anthropic') to registry keys
 * used in PROVIDER_MODEL_REGISTRY. This prevents registry lookup misses when
 * alias strings are passed from env vars or settings.
 *
 * Exported as SSOT so that CLI (resolveActiveProvider.ts) can reuse the same
 * normalization logic without maintaining a duplicate switch/case.
 */
export function normalizeProviderKey(provider: ProviderType | string): string {
  const normalized = String(provider).toLowerCase().trim();
  switch (normalized) {
    case 'openai_compatible':
    case 'slm':
      return 'openai-compatible';
    case 'anthropic':
      return 'claude';
    case 'vertex-ai':
    case 'vertex_ai':
      return 'gemini';
    case 'didim-studio':
    case 'didim_studio':
      return 'didim';
    default:
      return normalized;
  }
}

/**
 * Check if a model has the target provider's own naming prefix.
 *
 * E.g., 'claude-sonnet-4-20250514' has Claude's own prefix on Claude provider.
 * These models are legitimate custom/unreleased versions, not cross-provider leaks.
 */
function isOwnProviderPrefix(model: string, provider: string): boolean {
  const normalized = model.toLowerCase();
  const prefixMap: Record<string, Array<(m: string) => boolean>> = {
    claude: [(m) => m.startsWith('claude-')],
    openai: [(m) => /^gpt-[0-9]/.test(m), (m) => /^o[0-9]/.test(m)],
    gemini: [
      (m) => m.startsWith('gemini-'),
      (m) => m.startsWith('auto-gemini'),
    ],
  };
  const checks = prefixMap[provider];
  if (!checks) return false;
  return checks.some((check) => check(normalized));
}

/**
 * Returns true when the current process argv explicitly specifies this model.
 *
 * Supported flags:
 * - `--model value`
 * - `--model=value`
 * - `-m value`
 * - `-m=value`
 */
function wasModelExplicitlySpecified(model: string): boolean {
  const argv = process.argv ?? [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--model' || arg === '-m') {
      if (argv[i + 1] === model) {
        return true;
      }
      continue;
    }
    if (arg.startsWith('--model=')) {
      if (arg.slice('--model='.length) === model) {
        return true;
      }
      continue;
    }
    if (arg.startsWith('-m=')) {
      if (arg.slice('-m='.length) === model) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if a model clearly belongs to another provider.
 *
 * Uses two detection methods:
 * 1. Registry match: exact preset value or model ID in another provider's registry
 * 2. Prefix heuristic: known provider prefixes (claude-*, gpt-[0-9]*, o[0-9]*, gemini-*)
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
    openai: [(m) => /^gpt-[0-9]/.test(m), (m) => /^o[0-9]/.test(m)],
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
