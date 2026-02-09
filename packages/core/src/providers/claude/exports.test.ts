/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the Claude provider public export surface.
 * Ensures that Claude types are properly exposed through the providers module.
 *
 * @see packages/core/src/providers/gemini/exports.test.ts (Gemini counterpart)
 */

import { describe, it, expect } from 'vitest';

// Test that Claude namespace is exported from providers/index.ts
import { Claude } from '../index.js';

// Test that types can be accessed from providers/claude/index.ts directly
import { ClaudeAdapter, bootstrapClaudeProvider } from './index.js';

describe('Claude Provider Export Surface', () => {
  describe('Namespace export from providers/index.ts', () => {
    it('should export Claude namespace', () => {
      expect(Claude).toBeDefined();
    });

    it('should have ClaudeAdapter class in namespace', () => {
      expect(Claude.ClaudeAdapter).toBeDefined();
    });

    it('should have bootstrapClaudeProvider function in namespace', () => {
      expect(Claude.bootstrapClaudeProvider).toBeDefined();
      expect(typeof Claude.bootstrapClaudeProvider).toBe('function');
    });
  });

  describe('Direct export from providers/claude/index.ts', () => {
    it('should export ClaudeAdapter directly', () => {
      expect(ClaudeAdapter).toBeDefined();
    });

    it('should export bootstrapClaudeProvider directly', () => {
      expect(bootstrapClaudeProvider).toBeDefined();
      expect(typeof bootstrapClaudeProvider).toBe('function');
    });
  });
});
