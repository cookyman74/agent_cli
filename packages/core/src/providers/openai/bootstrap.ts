/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAI provider bootstrap — registers the OpenAiAdapter factory
 * in the ProviderRegistry.
 *
 * Uses a has() guard so repeated calls are idempotent (safe for HMR,
 * test re-initialization, or Agent re-creation).
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.7
 */

import OpenAI from 'openai';
import { ProviderRegistry } from '../registry.js';
import { OpenAiAdapter, type OpenAiClient } from './adapter.js';
import type { AdapterConfig } from '../types.js';

/**
 * Register the OpenAI adapter factory in the provider registry.
 *
 * The factory creates an OpenAI SDK client from the config and wraps
 * it with OpenAiAdapter for provider-independent access.
 *
 * @param registry - Optional registry instance. Defaults to singleton.
 */
export function bootstrapOpenAiProvider(registry?: ProviderRegistry): void {
  const reg = registry ?? ProviderRegistry.getInstance();
  if (reg.has('openai')) return;

  reg.register('openai', (config: AdapterConfig) => {
    const client = new OpenAI({
      apiKey: config.apiKey,
      // Pin the official API unless the caller explicitly overrides it.
      // Otherwise the SDK inherits OPENAI_BASE_URL from the shell, which can
      // silently route OpenAI requests to a stale gateway or local server.
      baseURL: config.baseUrl ?? 'https://api.openai.com/v1',
    });
    return new OpenAiAdapter(config, client as unknown as OpenAiClient);
  });
}
