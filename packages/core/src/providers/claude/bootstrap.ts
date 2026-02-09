/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Claude provider bootstrap — registers the ClaudeAdapter factory
 * in the ProviderRegistry.
 *
 * Uses a has() guard so repeated calls are idempotent (safe for HMR,
 * test re-initialization, or Agent re-creation).
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.4
 */

import Anthropic from '@anthropic-ai/sdk';
import { ProviderRegistry } from '../registry.js';
import { ClaudeAdapter, type ClaudeClient } from './adapter.js';
import type { AdapterConfig } from '../types.js';

/**
 * Register the Claude adapter factory in the provider registry.
 *
 * The factory creates an Anthropic SDK client from the config and wraps
 * it with ClaudeAdapter for provider-independent access.
 *
 * @param registry - Optional registry instance. Defaults to singleton.
 */
export function bootstrapClaudeProvider(registry?: ProviderRegistry): void {
  const reg = registry ?? ProviderRegistry.getInstance();
  if (reg.has('claude')) return;

  reg.register('claude', (config: AdapterConfig) => {
    const client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });
    return new ClaudeAdapter(config, client as unknown as ClaudeClient);
  });
}
