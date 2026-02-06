/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LlmGenerateConfig } from './types.js';

/**
 * Provider-specific generation configuration format.
 *
 * This interface represents the generation parameters used by
 * provider SDKs (Gemini, OpenAI, Claude, etc.)
 */
export interface GenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  [key: string]: unknown;
}

/**
 * Convert LlmGenerateConfig to provider-specific config format.
 *
 * Maps field names from the unified format to provider SDK format:
 * - maxTokens → maxOutputTokens
 *
 * @param config - Unified LLM config
 * @returns Provider-specific config
 *
 * @example
 * ```ts
 * const llmConfig = { temperature: 0.7, maxTokens: 1000 };
 * const providerConfig = toProviderConfig(llmConfig);
 * // { temperature: 0.7, maxOutputTokens: 1000 }
 * ```
 */
export function toProviderConfig(
  config: Partial<LlmGenerateConfig>,
): GenerationConfig {
  const result: GenerationConfig = {};

  if (config.temperature !== undefined) {
    result.temperature = config.temperature;
  }

  if (config.maxTokens !== undefined) {
    result.maxOutputTokens = config.maxTokens;
  }

  if (config.topP !== undefined) {
    result.topP = config.topP;
  }

  if (config.topK !== undefined) {
    result.topK = config.topK;
  }

  if (config.stopSequences !== undefined) {
    result.stopSequences = config.stopSequences;
  }

  return result;
}

/**
 * Convert provider-specific config to LlmGenerateConfig format.
 *
 * Maps field names from provider SDK format to unified format:
 * - maxOutputTokens → maxTokens
 *
 * @param config - Provider-specific config
 * @returns Unified LLM config
 *
 * @example
 * ```ts
 * const providerConfig = { temperature: 0.7, maxOutputTokens: 1000 };
 * const llmConfig = fromProviderConfig(providerConfig);
 * // { temperature: 0.7, maxTokens: 1000 }
 * ```
 */
export function fromProviderConfig(
  config: GenerationConfig,
): Partial<LlmGenerateConfig> {
  const result: Partial<LlmGenerateConfig> = {};

  if (config.temperature !== undefined) {
    result.temperature = config.temperature;
  }

  if (config.maxOutputTokens !== undefined) {
    result.maxTokens = config.maxOutputTokens;
  }

  if (config.topP !== undefined) {
    result.topP = config.topP;
  }

  if (config.topK !== undefined) {
    result.topK = config.topK;
  }

  if (config.stopSequences !== undefined) {
    result.stopSequences = config.stopSequences;
  }

  return result;
}

/**
 * Merge two configs with override taking precedence.
 *
 * Only defined values from override replace base values.
 * Undefined values in override do not affect base values.
 *
 * @param base - Base configuration
 * @param override - Override configuration (takes precedence)
 * @returns Merged configuration
 *
 * @example
 * ```ts
 * const base = { temperature: 0.7, maxTokens: 1000 };
 * const override = { temperature: 0.9 };
 * const merged = mergeConfigs(base, override);
 * // { temperature: 0.9, maxTokens: 1000 }
 * ```
 */
export function mergeConfigs(
  base: Partial<LlmGenerateConfig>,
  override: Partial<LlmGenerateConfig>,
): Partial<LlmGenerateConfig> {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(override).filter(([, v]) => v !== undefined),
    ),
  };
}

/**
 * Configuration adapter for converting between unified and provider formats.
 *
 * Provides both static utility functions and instance methods for
 * configuration conversion and merging.
 *
 * @example
 * ```ts
 * const adapter = new ConfigAdapter();
 *
 * // Convert to provider format
 * const providerConfig = adapter.toProvider({ temperature: 0.7 });
 *
 * // Merge configs
 * const merged = adapter.merge(defaultConfig, userConfig);
 * ```
 *
 * @see docs/ai_adapter/03-technical-design.md §3.7
 */
export class ConfigAdapter {
  /**
   * Convert LlmGenerateConfig to provider-specific format.
   */
  toProvider(config: Partial<LlmGenerateConfig>): GenerationConfig {
    return toProviderConfig(config);
  }

  /**
   * Convert provider-specific config to LlmGenerateConfig.
   */
  fromProvider(config: GenerationConfig): Partial<LlmGenerateConfig> {
    return fromProviderConfig(config);
  }

  /**
   * Merge two configs with override taking precedence.
   */
  merge(
    base: Partial<LlmGenerateConfig>,
    override: Partial<LlmGenerateConfig>,
  ): Partial<LlmGenerateConfig> {
    return mergeConfigs(base, override);
  }
}
