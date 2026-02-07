/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider-independent types and utilities for multi-LLM support.
 *
 * This module exports the unified type system that abstracts away
 * provider-specific details (Gemini, Claude, OpenAI, vLLM).
 *
 * @see docs/ai_adapter/03-technical-design.md
 */

// Adapter base classes
export * from './baseAdapter.js';

// Provider registry
export * from './registry.js';

// Provider factory
export * from './factory.js';

// Stream assembler
export * from './streamAssembler.js';

// Config adapter
export * from './configAdapter.js';

// Model specifications
export * from './modelSpec.js';

// Content resolver
export * from './contentResolver.js';

// Provider types
export * from './providerTypes.js';

// Provider config
export * from './providerConfig.js';

// Provider selector
export * from './providerSelector.js';

// Provider config integration
export * from './providerConfigIntegration.js';

// Core types
export * from './types.js';

// Event types
export * from './events.js';

// Error types
export * from './errors.js';

// Legacy aliases (for backward compatibility during migration)
// Note: These are deprecated and will be removed after full migration
export * from './legacyAliases.js';

// Gemini provider types (Phase 2 - M2.0)
// Exported as namespace to avoid conflict with legacyAliases
// Use: import { Gemini } from '@google/gemini-cli-core/providers'
// Then: Gemini.GeminiEventType, Gemini.ServerGeminiStreamEvent, etc.
import * as Gemini from './gemini/index.js';
export { Gemini };
