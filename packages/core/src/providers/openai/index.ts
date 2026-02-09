/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAI provider module — public API exports.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.7
 */

export { OpenAiAdapter, type OpenAiClient } from './adapter.js';
export { OpenAiConverter, type OpenAiStreamState } from './converter.js';
export { bootstrapOpenAiProvider } from './bootstrap.js';
