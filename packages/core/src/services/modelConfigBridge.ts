/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ModelConfigBridge — wraps ModelConfigService to provide provider-independent
 * LlmGenerateConfig resolution for multi-provider support.
 *
 * For Gemini: delegates to ModelConfigService, converts GenerateContentConfig → LlmGenerateConfig
 * For non-Gemini: resolves from registered LlmModelConfig entries
 *
 * @see docs/ai_adapter/03-technical-design.md §3.1.2
 */

import type { GenerateContentConfig } from '@google/genai';
import type { LlmGenerateConfig } from '../providers/types.js';
import type { ModelConfigService } from './modelConfigService.js';
import {
  type ModelConfigKey,
  type ResolvedModelConfig,
} from './modelConfigService.js';
import { fromGenerateContentConfig } from '../providers/gemini/configConverter.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Provider-independent model configuration.
 * Parallels ModelConfig but uses LlmGenerateConfig instead of GenerateContentConfig.
 */
export interface LlmModelConfig {
  model?: string;
  provider?: string;
  llmConfig?: Partial<LlmGenerateConfig>;
}

/**
 * Key for resolving provider-independent model config.
 * Extends ModelConfigKey with an optional provider field.
 */
export interface LlmModelConfigKey {
  model: string;
  provider?: string;
  overrideScope?: string;
  isRetry?: boolean;
}

/**
 * Resolved provider-independent model configuration.
 */
export interface ResolvedLlmModelConfig {
  model: string;
  provider: string;
  llmConfig: LlmGenerateConfig;
  /** Original Gemini config — present only for Gemini provider (backward compat) */
  generateContentConfig?: GenerateContentConfig;
}

// ============================================================================
// Bridge
// ============================================================================

export class ModelConfigBridge {
  private readonly llmConfigs: Map<string, LlmModelConfig> = new Map();

  constructor(private readonly service: ModelConfigService) {}

  /**
   * Register a provider-independent model config for non-Gemini providers.
   */
  registerLlmConfig(name: string, config: LlmModelConfig): void {
    this.llmConfigs.set(name, config);
  }

  /**
   * Resolve model config to provider-independent LlmGenerateConfig.
   *
   * - Gemini (or default): delegates to ModelConfigService, converts result
   * - Non-Gemini: resolves from registered LlmModelConfig
   */
  getResolvedLlmConfig(key: LlmModelConfigKey): ResolvedLlmModelConfig {
    const provider = key.provider ?? 'gemini';

    if (provider === 'gemini') {
      return this.resolveGemini(key);
    }

    return this.resolveNonGemini(key, provider);
  }

  /**
   * Legacy passthrough to ModelConfigService.getResolvedConfig().
   * For code that still needs the original Gemini-typed resolution.
   */
  getResolvedConfig(key: ModelConfigKey): ResolvedModelConfig {
    return this.service.getResolvedConfig(key);
  }

  /**
   * Merge two LlmModelConfig objects. Override takes precedence.
   */
  static mergeLlmModelConfig(
    base: LlmModelConfig,
    override: LlmModelConfig,
  ): LlmModelConfig {
    const result: LlmModelConfig = {
      model: override.model ?? base.model,
      provider: override.provider ?? base.provider,
    };

    if (base.llmConfig || override.llmConfig) {
      result.llmConfig = {
        ...base.llmConfig,
        ...Object.fromEntries(
          Object.entries(override.llmConfig ?? {}).filter(
            ([, v]) => v !== undefined,
          ),
        ),
      };

      // Deep merge providerOptions (Record<string, unknown>)
      if (
        base.llmConfig?.providerOptions ||
        override.llmConfig?.providerOptions
      ) {
        result.llmConfig.providerOptions = {
          ...base.llmConfig?.providerOptions,
          ...Object.fromEntries(
            Object.entries(override.llmConfig?.providerOptions ?? {}).filter(
              ([, v]) => v !== undefined,
            ),
          ),
        };
      }
    }

    return result;
  }

  // ================================================================
  // Private resolution
  // ================================================================

  private resolveGemini(key: LlmModelConfigKey): ResolvedLlmModelConfig {
    const modelConfigKey: ModelConfigKey = {
      model: key.model,
      overrideScope: key.overrideScope,
      isRetry: key.isRetry,
    };

    const resolved = this.service.getResolvedConfig(modelConfigKey);
    const llmConfig = fromGenerateContentConfig(
      resolved.generateContentConfig,
      resolved.model,
    );

    return {
      model: resolved.model,
      provider: 'gemini',
      llmConfig,
      generateContentConfig: resolved.generateContentConfig,
    };
  }

  private resolveNonGemini(
    key: LlmModelConfigKey,
    provider: string,
  ): ResolvedLlmModelConfig {
    const registered = this.llmConfigs.get(key.model);

    if (registered) {
      const model = registered.model ?? key.model;
      const resolvedProvider = registered.provider ?? provider;

      return {
        model,
        provider: resolvedProvider,
        llmConfig: {
          provider: resolvedProvider,
          model,
          ...registered.llmConfig,
        } as LlmGenerateConfig,
      };
    }

    // No registered config — return minimal defaults
    return {
      model: key.model,
      provider,
      llmConfig: {
        provider,
        model: key.model,
      } as LlmGenerateConfig,
    };
  }
}
