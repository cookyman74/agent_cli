/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Bidirectional conversion between GenerateContentConfig (@google/genai)
 * and LlmGenerateConfig (provider-independent).
 *
 * Enables ModelConfigBridge to translate Gemini-specific settings into
 * the unified config format used across all providers.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.1.2
 */

import type { GenerateContentConfig } from '@google/genai';
import type { LlmGenerateConfig, LlmResponseFormat } from '../types.js';

/**
 * Fields in GenerateContentConfig that map directly to LlmGenerateConfig.
 * All other fields are stored in providerOptions for round-trip fidelity.
 */
const COMMON_FIELDS = new Set([
  'temperature',
  'topP',
  'topK',
  'maxOutputTokens',
  'stopSequences',
  'responseMimeType',
  'systemInstruction',
]);

/**
 * Fields that are infrastructure-only (not part of generation semantics).
 * These are excluded from providerOptions.
 */
const EXCLUDED_FIELDS = new Set(['httpOptions', 'abortSignal']);

/**
 * Convert GenerateContentConfig to LlmGenerateConfig.
 *
 * Maps common fields (temperature, topP, etc.) to their LlmGenerateConfig
 * equivalents. Gemini-specific fields (presencePenalty, thinkingConfig, etc.)
 * are stored in providerOptions for round-trip fidelity.
 *
 * @param gc - Gemini SDK GenerateContentConfig
 * @param model - Target model name
 * @returns Provider-independent LlmGenerateConfig
 */
export function fromGenerateContentConfig(
  gc: GenerateContentConfig,
  model: string,
): LlmGenerateConfig {
  const result: LlmGenerateConfig = {
    provider: 'gemini',
    model,
  };

  // Common fields: direct mapping
  if (gc.temperature !== undefined) {
    result.temperature = gc.temperature;
  }
  if (gc.topP !== undefined) {
    result.topP = gc.topP;
  }
  if (gc.topK !== undefined) {
    result.topK = gc.topK;
  }
  if (gc.maxOutputTokens !== undefined) {
    result.maxTokens = gc.maxOutputTokens;
  }
  if (gc.stopSequences !== undefined) {
    result.stopSequences = gc.stopSequences;
  }

  // responseMimeType → responseFormat
  if (gc.responseMimeType !== undefined) {
    result.responseFormat = mimeToResponseFormat(gc.responseMimeType);
  }

  // systemInstruction: ContentUnion → string
  if (gc.systemInstruction !== undefined) {
    result.systemInstruction = extractSystemInstructionText(
      gc.systemInstruction,
    );
  }

  // Gemini-specific fields → providerOptions
  const providerOptions: Record<string, unknown> = {};
  const gcRecord = gc as Record<string, unknown>;

  for (const key of Object.keys(gcRecord)) {
    if (
      !COMMON_FIELDS.has(key) &&
      !EXCLUDED_FIELDS.has(key) &&
      gcRecord[key] !== undefined
    ) {
      providerOptions[key] = gcRecord[key];
    }
  }

  if (Object.keys(providerOptions).length > 0) {
    result.providerOptions = providerOptions;
  }

  return result;
}

/**
 * Convert LlmGenerateConfig to GenerateContentConfig.
 *
 * Reverses the mapping from fromGenerateContentConfig.
 * providerOptions fields are restored to their native positions.
 *
 * @param lc - Provider-independent LlmGenerateConfig
 * @returns Gemini SDK GenerateContentConfig
 */
export function toGenerateContentConfig(
  lc: Partial<LlmGenerateConfig>,
): GenerateContentConfig {
  const result: Record<string, unknown> = {};

  // Common fields: reverse mapping
  if (lc.temperature !== undefined) {
    result['temperature'] = lc.temperature;
  }
  if (lc.topP !== undefined) {
    result['topP'] = lc.topP;
  }
  if (lc.topK !== undefined) {
    result['topK'] = lc.topK;
  }
  if (lc.maxTokens !== undefined) {
    result['maxOutputTokens'] = lc.maxTokens;
  }
  if (lc.stopSequences !== undefined) {
    result['stopSequences'] = lc.stopSequences;
  }

  // responseFormat → responseMimeType
  if (lc.responseFormat !== undefined) {
    result['responseMimeType'] = responseFormatToMime(lc.responseFormat);
  }

  // systemInstruction: string → string (Gemini SDK accepts string directly)
  if (lc.systemInstruction !== undefined) {
    result['systemInstruction'] = lc.systemInstruction;
  }

  // Restore providerOptions to native fields
  if (lc.providerOptions) {
    for (const [key, value] of Object.entries(lc.providerOptions)) {
      if (value !== undefined) {
        result[key] = value;
      }
    }
  }

  return result as GenerateContentConfig;
}

// =================================================================
// Internal helpers
// =================================================================

function mimeToResponseFormat(mime: string): LlmResponseFormat {
  if (mime === 'application/json') return 'json';
  return 'text';
}

function responseFormatToMime(format: LlmResponseFormat): string {
  if (format === 'json') return 'application/json';
  return 'text/plain';
}

/**
 * Extract plain text from Gemini SDK's ContentUnion type.
 * systemInstruction can be a string, Content, or Part[].
 */
function extractSystemInstructionText(instruction: unknown): string {
  if (typeof instruction === 'string') {
    return instruction;
  }
  // Content object: { role, parts: [{ text }] }
  if (
    instruction &&
    typeof instruction === 'object' &&
    'parts' in instruction
  ) {
    const parts = (instruction as { parts?: Array<{ text?: string }> }).parts;
    if (parts) {
      return parts
        .map((p) => p.text || '')
        .filter(Boolean)
        .join('');
    }
  }
  return String(instruction);
}
