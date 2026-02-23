/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_31_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
} from '../config/models.js';

type Model = string;
type TokenCount = number;

export const DEFAULT_TOKEN_LIMIT = 1_048_576;

/**
 * Conservative token limit for OpenAI-compatible providers (sLM).
 * Many local/self-hosted models have limited context (4K-32K).
 * Using 32K as default allows for reasonable detection while not being overly restrictive.
 * Users with larger context servers should increase this via --max-model-len on their server.
 */
export const OPENAI_COMPATIBLE_TOKEN_LIMIT = 32_768;

export function tokenLimit(model: Model): TokenCount {
  // Check for openai-compatible provider first — use conservative limit
  const llmProvider = process.env['LLM_PROVIDER'];
  if (
    llmProvider === 'openai-compatible' ||
    llmProvider === 'openai_compatible'
  ) {
    return OPENAI_COMPATIBLE_TOKEN_LIMIT;
  }

  // Add other models as they become relevant or if specified by config
  // Pulled from https://ai.google.dev/gemini-api/docs/models
  switch (model) {
    case PREVIEW_GEMINI_31_MODEL:
    case PREVIEW_GEMINI_MODEL:
    case PREVIEW_GEMINI_FLASH_MODEL:
    case DEFAULT_GEMINI_MODEL:
    case DEFAULT_GEMINI_FLASH_MODEL:
    case DEFAULT_GEMINI_FLASH_LITE_MODEL:
      return 1_048_576;
    default:
      return DEFAULT_TOKEN_LIMIT;
  }
}
