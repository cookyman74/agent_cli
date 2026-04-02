/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Didim provider bootstrap — registers the DidimAdapter factory
 * in the ProviderRegistry.
 *
 * Config resolution priority:
 * 1. AdapterConfig fields (passed from contentGenerator.ts)
 * 2. Environment variables
 *
 * v2 확장:
 * - DIDIM_SCENARIO_ID → scenarioMyPageId
 * - JWT user_id claim 추출 (실패 시 DIDIM_USER_ID env fallback)
 * - config.threadId → adapter threadId override
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
 * Decode JWT payload to extract user_id claim.
 * Returns null if JWT is invalid or claim is missing.
 */
function extractUserIdFromJwt(jwt: string): string | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64 → JSON
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
    return typeof payload.user_id === 'string' ? payload.user_id : null;
  } catch {
    return null;
  }
}

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

    // v2: scenarioMyPageId — config > env (필수: 0이면 경고)
    const scenarioRaw =
      (config['scenarioMyPageId'] as string | number) ||
      process.env['DIDIM_SCENARIO_ID'] ||
      '0';
    const scenarioMyPageId =
      typeof scenarioRaw === 'number'
        ? scenarioRaw
        : parseInt(scenarioRaw, 10) || 0;

    if (!scenarioMyPageId) {
      // eslint-disable-next-line no-console
      console.warn(
        '[didim] scenarioMyPageId is 0 — set DIDIM_SCENARIO_ID env or config.scenarioMyPageId',
      );
    }

    // v2: userId — JWT decode > env > empty (필수: 빈 문자열이면 경고)
    const userId =
      extractUserIdFromJwt(apiKey) || process.env['DIDIM_USER_ID'] || '';

    if (!userId) {
      // eslint-disable-next-line no-console
      console.warn(
        '[didim] userId is empty — JWT has no user_id claim and DIDIM_USER_ID env is not set',
      );
    }

    // v2: threadId — config override > undefined (adapter auto-generates)
    const threadId = (config['threadId'] as string) || undefined;

    return new DidimAdapter(
      config,
      globalThis.fetch.bind(globalThis),
      apiKey,
      serverAddress,
      streamModeRaw as DidimStreamMode,
      scenarioMyPageId,
      userId,
      threadId,
    );
  });
}
