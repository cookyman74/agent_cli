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

// Core types
export * from './types.js';

// Event types
export * from './events.js';

// Error types
export * from './errors.js';

// Legacy aliases (for backward compatibility during migration)
// Note: These are deprecated and will be removed after full migration
export * from './legacyAliases.js';
