/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Environment variable resolver for DIDIM_/GEMINI_ dual-prefix support.
 *
 * Resolves environment variables with DIDIM_ prefix first,
 * falling back to GEMINI_ prefix for backward compatibility.
 */

/**
 * Resolves an environment variable with DIDIM_ prefix priority, GEMINI_ fallback.
 *
 * @param suffix - The environment variable suffix (e.g., 'CLI_HOME', 'MODEL')
 * @returns The resolved value, or undefined if neither prefix is set
 *
 * @example
 * ```typescript
 * // DIDIM_MODEL=gpt-4 → 'gpt-4'
 * // GEMINI_MODEL=gemini-pro (fallback) → 'gemini-pro'
 * const model = resolveEnv('MODEL');
 * ```
 */
export function resolveEnv(suffix: string): string | undefined {
  return process.env[`DIDIM_${suffix}`] ?? process.env[`GEMINI_${suffix}`];
}

/**
 * Resolves a dynamic prompt environment variable.
 * DIDIM_PROMPT_<NAME> ?? GEMINI_PROMPT_<NAME>
 *
 * @param promptName - The prompt name (e.g., 'SAFETY', 'CUSTOM')
 * @returns The resolved prompt value, or undefined
 */
export function resolvePromptEnv(promptName: string): string | undefined {
  return (
    process.env[`DIDIM_PROMPT_${promptName}`] ??
    process.env[`GEMINI_PROMPT_${promptName}`]
  );
}

/**
 * Checks if an environment variable key has the DIDIM_CLI_ or GEMINI_CLI_ prefix.
 * Used for environment sanitization allowlists.
 *
 * @param key - The full environment variable name
 * @returns true if the key starts with DIDIM_CLI_ or GEMINI_CLI_
 */
export function isCliEnvVar(key: string): boolean {
  return key.startsWith('DIDIM_CLI_') || key.startsWith('GEMINI_CLI_');
}
