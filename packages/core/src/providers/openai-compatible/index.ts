/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAI-compatible provider module — public API exports.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.4
 */

export { OpenAiCompatibleAdapter } from './adapter.js';
export { bootstrapOpenAiCompatibleProvider } from './bootstrap.js';
export {
  ChatMLPromptBuilder,
  Llama3PromptBuilder,
  MistralPromptBuilder,
  createPromptBuilderForModel,
} from './promptBuilder.js';
export type { PromptBuilder } from './promptBuilder.js';
