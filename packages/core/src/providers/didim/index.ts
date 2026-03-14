/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Didim provider module — DidimAIStudio adapter, bootstrap, and converter.
 *
 * @see docs/00_project/Integration_DidimAIStudio/00_master_plan.md
 */

export { DidimAdapter } from './adapter.js';
export { bootstrapDidimProvider } from './bootstrap.js';
export {
  // Types
  type DidimStreamMode,
  type DidimResponse,
  type DidimParsedResponse,
  type DidimSseEvent,
  type DidimEndpointOptions,
  // Functions
  normalizeDidimDomain,
  detectScheme,
  getDidimEndpoint,
  buildDidimHeaders,
  buildDidimRequestBody,
  parseDidimResponse,
  parseDidimSseEvent,
  generateDidimResponseId,
  convertDidimResponseToLlm,
  convertDidimSseToLlmEvents,
} from './converter.js';
