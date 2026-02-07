/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AdapterBridge — wires GeminiAdapter into the existing ContentGenerator
 * pipeline, controlled by the ENABLE_MULTI_PROVIDER feature flag.
 *
 * When the flag is ON, enhances the base generator with provider-independent
 * llm* methods backed by GeminiAdapter. When OFF, returns the base generator
 * unchanged.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.4
 */

import type { GenerateContentResponse } from '@google/genai';

import { isMultiProviderEnabled } from './featureFlag.js';
import { GeminiAdapter, type GeminiModelsApi } from './adapter.js';
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmTokenCount,
  AdapterConfig,
  GenerateOptions,
} from '../types.js';
import type { LlmEventStream } from '../events.js';

/**
 * Interface for generators that can be bridged with the multi-provider adapter.
 * Compatible with both `googleGenAI.models` and `GeminiContentGenerator`.
 */
export interface BridgeableGenerator {
  // Legacy Gemini SDK methods (required)
  generateContent(...args: unknown[]): Promise<unknown>;
  generateContentStream(...args: unknown[]): Promise<unknown>;
  countTokens(...args: unknown[]): Promise<unknown>;
  embedContent?(...args: unknown[]): Promise<unknown>;

  // Metadata (optional, preserved during bridging)
  userTier?: unknown;
  userTierName?: string;

  // Provider-independent methods (added by bridge when flag is ON)
  llmGenerateContent?(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse>;
  llmGenerateContentStream?(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): LlmEventStream;
  llmCountTokens?(request: LlmGenerateRequest): Promise<LlmTokenCount>;
}

/**
 * Enhance a base generator with provider-independent llm* methods
 * when the ENABLE_MULTI_PROVIDER flag is enabled.
 *
 * @param base - The base generator (e.g., `googleGenAI.models`)
 * @param config - Adapter configuration (apiKey, etc.)
 * @returns The original generator (flag OFF) or an enhanced generator (flag ON)
 */
export function createAdapterBridge(
  base: BridgeableGenerator,
  config: AdapterConfig,
): BridgeableGenerator {
  if (!isMultiProviderEnabled()) {
    return base;
  }

  // Create GeminiModelsApi wrapper that delegates to the base generator
  const modelsApi: GeminiModelsApi = {
    generateContent: (params: Record<string, unknown>) =>
      base.generateContent(params) as Promise<GenerateContentResponse>,
    generateContentStream: (params: Record<string, unknown>) =>
      base.generateContentStream(params) as Promise<
        AsyncGenerator<GenerateContentResponse>
      >,
    countTokens: (params: Record<string, unknown>) =>
      base.countTokens(params) as Promise<{ totalTokens?: number }>,
  };

  const adapter = new GeminiAdapter(config, modelsApi);

  // Return enhanced generator preserving legacy methods + adding llm* methods
  return {
    generateContent: (...args: unknown[]) => base.generateContent(...args),
    generateContentStream: (...args: unknown[]) =>
      base.generateContentStream(...args),
    countTokens: (...args: unknown[]) => base.countTokens(...args),
    embedContent: base.embedContent,

    userTier: base.userTier,
    userTierName: base.userTierName,

    llmGenerateContent: (
      request: LlmGenerateRequest,
      userPromptId: string,
      options?: GenerateOptions,
    ) => adapter.generateContent(request, userPromptId, options),
    llmGenerateContentStream: (
      request: LlmGenerateRequest,
      userPromptId: string,
      options?: GenerateOptions,
    ) => adapter.generateContentStream(request, userPromptId, options),
    llmCountTokens: (request: LlmGenerateRequest) =>
      adapter.countTokens(request),
  };
}
