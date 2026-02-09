/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Gemini provider bootstrap — registers the GeminiAdapter factory
 * in the ProviderRegistry.
 *
 * Uses a has() guard so repeated calls are idempotent (safe for HMR,
 * test re-initialization, or Agent re-creation).
 *
 * @see docs/ai_adapter/03-technical-design.md §3.6
 */

import { GoogleGenAI } from '@google/genai';
import { ProviderRegistry } from '../registry.js';
import { GeminiAdapter, type GeminiModelsApi } from './adapter.js';
import type { AdapterConfig } from '../types.js';

/**
 * Register the Gemini adapter factory in the provider registry.
 *
 * The factory creates a GoogleGenAI instance from the config and wraps
 * it with GeminiAdapter for provider-independent access.
 *
 * @param registry - Optional registry instance. Defaults to singleton.
 */
export function bootstrapGeminiProvider(registry?: ProviderRegistry): void {
  const reg = registry ?? ProviderRegistry.getInstance();
  if (reg.has('gemini')) return;

  reg.register('gemini', (config: AdapterConfig) => {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config['vertexai'] as boolean | undefined,
      httpOptions: config['httpOptions'] as Record<string, unknown> | undefined,
    });
    return new GeminiAdapter(
      config,
      googleGenAI.models as unknown as GeminiModelsApi,
    );
  });
}
