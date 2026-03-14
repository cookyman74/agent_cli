/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Didim provider bootstrap — registers the DidimAdapter factory
 * in the ProviderRegistry.
 *
 * Uses a has() guard so repeated calls are idempotent (safe for HMR,
 * test re-initialization, or Agent re-creation).
 *
 * Config resolution priority:
 * 1. AdapterConfig fields (passed from contentGenerator.ts)
 * 2. Environment variables (DIDIM_API_KEY, DIDIM_SERVER_ADDRESS, DIDIM_STREAM_MODE)
 *
 * @see docs/00_project/Integration_DidimAIStudio/00_master_plan.md
 */

import { ProviderRegistry } from '../registry.js';
import { DidimAdapter } from './adapter.js';
import type { AdapterConfig } from '../types.js';
import type { DidimStreamMode } from './converter.js';
import { ValidationError } from '../errors.js';

/** Valid stream mode values. */
const VALID_STREAM_MODES: ReadonlySet<string> = new Set(['sse', 'improved']);

/**
 * Register the Didim adapter factory in the provider registry.
 *
 * @param registry - Optional registry instance. Defaults to singleton.
 */
export function bootstrapDidimProvider(registry?: ProviderRegistry): void {
  const reg = registry ?? ProviderRegistry.getInstance();
  if (reg.has('didim')) return;

  reg.register('didim', (config: AdapterConfig) => {
    const apiKey =
      (config.apiKey as string) || process.env['DIDIM_API_KEY'] || '';
    const serverAddress =
      (config['serverAddress'] as string) ||
      process.env['DIDIM_SERVER_ADDRESS'] ||
      '';
    const streamModeRaw =
      (config['streamMode'] as string) ||
      process.env['DIDIM_STREAM_MODE'] ||
      'sse';

    if (!VALID_STREAM_MODES.has(streamModeRaw)) {
      throw new ValidationError(
        `Invalid DIDIM_STREAM_MODE: "${streamModeRaw}". Must be "sse" or "improved".`,
        { provider: 'didim' },
      );
    }

    return new DidimAdapter(
      config,
      globalThis.fetch.bind(globalThis),
      apiKey,
      serverAddress,
      streamModeRaw as DidimStreamMode,
    );
  });
}
