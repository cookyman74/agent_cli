/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Claude provider module — public API exports.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.4
 */

export { ClaudeAdapter, type ClaudeClient } from './adapter.js';
export { bootstrapClaudeProvider } from './bootstrap.js';
