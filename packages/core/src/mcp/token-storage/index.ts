/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export * from './types.js';
export * from './base-token-storage.js';
export * from './file-token-storage.js';
export * from './hybrid-token-storage.js';

export const DEFAULT_SERVICE_NAME = 'gemini-cli-oauth';
/** @deprecated Use resolveEnv('FORCE_ENCRYPTED_FILE_STORAGE') from envResolver instead */
export const FORCE_ENCRYPTED_FILE_ENV_VAR =
  'GEMINI_FORCE_ENCRYPTED_FILE_STORAGE';
