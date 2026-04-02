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
 * 2. JWT api_key_metadata claims (auto-extracted from apiKey)
 * 3. Environment variables
 * 4. Defaults
 *
 * JWT api_key_metadata 구조 (Auth 서비스 발급):
 * {
 *   "user_id": "1",
 *   "api_key_metadata": {
 *     "my_scenario_id": 483,        → scenarioMyPageId
 *     "scenario_data_id": 393,      → (참고용)
 *     "scenario_creator_user_id": 1, → (참고용)
 *     "group_ids": []
 *   }
 * }
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

/** JWT payload에서 추출한 Didim 메타데이터. */
interface JwtDidimClaims {
  userId: string | null;
  scenarioMyPageId: number | null;
}

/**
 * JWT payload를 디코드하여 Didim 필수 claim을 추출한다.
 *
 * 추출 대상:
 * - payload.user_id → userId
 * - payload.api_key_metadata.my_scenario_id → scenarioMyPageId
 *
 * @returns 추출된 claim (실패 시 null 필드)
 */
function extractDidimClaimsFromJwt(jwt: string): JwtDidimClaims {
  const empty: JwtDidimClaims = { userId: null, scenarioMyPageId: null };
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return empty;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));

    const userId = typeof payload.user_id === 'string' ? payload.user_id : null;

    // api_key_metadata.my_scenario_id → scenarioMyPageId
    let scenarioMyPageId: number | null = null;
    const metadata = payload.api_key_metadata;
    if (metadata && typeof metadata === 'object') {
      const rawId = metadata.my_scenario_id;
      if (typeof rawId === 'number' && rawId > 0) {
        scenarioMyPageId = rawId;
      }
    }

    return { userId, scenarioMyPageId };
  } catch {
    return empty;
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

    // JWT에서 Didim 필수 claim 자동 추출
    const jwtClaims = extractDidimClaimsFromJwt(apiKey);

    // scenarioMyPageId: config > JWT > env > 0
    const scenarioRaw =
      (config['scenarioMyPageId'] as string | number) ||
      jwtClaims.scenarioMyPageId ||
      process.env['DIDIM_SCENARIO_ID'] ||
      '0';
    const scenarioMyPageId =
      typeof scenarioRaw === 'number'
        ? scenarioRaw
        : parseInt(scenarioRaw, 10) || 0;

    if (!scenarioMyPageId) {
      // eslint-disable-next-line no-console
      console.warn(
        '[didim] scenarioMyPageId is 0 — JWT has no api_key_metadata.my_scenario_id, ' +
          'set DIDIM_SCENARIO_ID env or config.scenarioMyPageId',
      );
    }

    // userId: JWT > env > empty
    const userId = jwtClaims.userId || process.env['DIDIM_USER_ID'] || '';

    if (!userId) {
      // eslint-disable-next-line no-console
      console.warn(
        '[didim] userId is empty — JWT has no user_id claim and DIDIM_USER_ID env is not set',
      );
    }

    // threadId: config override > undefined (adapter auto-generates)
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
