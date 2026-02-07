/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Feature flag for multi-provider migration.
 *
 * Controls the transition from the legacy Gemini-only content generation path
 * to the new BaseAdapter-based multi-provider path.
 *
 * When `ENABLE_MULTI_PROVIDER` is:
 * - false (default): Legacy path (contentGenerator → Gemini SDK directly)
 * - true: New path (GeminiAdapter → GeminiConverter → Gemini SDK)
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.2
 */

const ENV_VAR_NAME = 'ENABLE_MULTI_PROVIDER';

/** Programmatic override — takes precedence over env var when set. */
let override: boolean | undefined;

/**
 * Check if the multi-provider adapter path is enabled.
 *
 * Priority: programmatic override > environment variable > default (false)
 */
export function isMultiProviderEnabled(): boolean {
  if (override !== undefined) {
    return override;
  }

  const envValue = process.env[ENV_VAR_NAME];
  if (!envValue) {
    return false;
  }

  const normalized = envValue.toLowerCase().trim();
  return normalized === 'true' || normalized === '1';
}

/**
 * Set a programmatic override for the feature flag.
 * Useful for testing and runtime switching.
 */
export function setMultiProviderOverride(value: boolean): void {
  override = value;
}

/**
 * Clear the programmatic override, restoring env-var-based behavior.
 */
export function clearMultiProviderOverride(): void {
  override = undefined;
}

/**
 * Execute a primary function with a fallback.
 *
 * If the primary function throws, the fallback is called with the error.
 * If the fallback also throws, the fallback's error propagates.
 *
 * @param primary - Primary function (new adapter path)
 * @param fallback - Fallback function (legacy path), receives primary's error
 * @returns Result from primary or fallback
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: (error: Error) => Promise<T>,
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    return fallback(error instanceof Error ? error : new Error(String(error)));
  }
}
