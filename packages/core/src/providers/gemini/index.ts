/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Gemini provider module.
 * Re-exports all Gemini-specific types and classes.
 */

export * from './types.js';
export { GeminiEventMapper } from './eventMapper.js';
export {
  convertGeminiStream,
  convertGeminiStreamWithReturn,
} from './streamConverter.js';
export {
  createGeminiStreamPipeline,
  type GeminiStreamPipeline,
} from './geminiStream.js';
export {
  classifyGeminiError,
  type GeminiErrorClassification,
} from './errorClassifier.js';
export { GeminiAdapter, type GeminiModelsApi } from './adapter.js';
export { GeminiConverter } from './converter.js';
export {
  isMultiProviderEnabled,
  setMultiProviderOverride,
  clearMultiProviderOverride,
  withFallback,
} from './featureFlag.js';
