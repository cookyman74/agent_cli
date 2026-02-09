/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';

/**
 * Root barrel export regression tests.
 *
 * These verify that symbols consumed by CLI and other packages
 * remain accessible after file moves (M3.0.1).
 *
 * If any of these imports fail, it means a file move broke the
 * public API surface of @google/gemini-cli-core.
 */
describe('root index.ts re-export regression', () => {
  it('should export GeminiChat from moved providers/gemini/chat.ts', async () => {
    const mod = await import('./index.js');
    expect(mod.GeminiChat).toBeDefined();
    expect(typeof mod.GeminiChat).toBe('function');
  });

  it('should export StreamEventType from moved providers/gemini/chat.ts', async () => {
    const mod = await import('./index.js');
    expect(mod.StreamEventType).toBeDefined();
    expect(mod.StreamEventType.CHUNK).toBe('chunk');
    expect(mod.StreamEventType.RETRY).toBe('retry');
  });

  it('should export InvalidStreamError from moved providers/gemini/chat.ts', async () => {
    const mod = await import('./index.js');
    expect(mod.InvalidStreamError).toBeDefined();
    expect(typeof mod.InvalidStreamError).toBe('function');
  });

  it('should export Turn from moved providers/gemini/turn.ts', async () => {
    const mod = await import('./index.js');
    expect(mod.Turn).toBeDefined();
    expect(typeof mod.Turn).toBe('function');
  });

  it('should export CompressionStatus from moved providers/gemini/turn.ts', async () => {
    const mod = await import('./index.js');
    expect(mod.CompressionStatus).toBeDefined();
  });

  it('should export LlmEventType from providers/events.ts via turn.ts', async () => {
    const mod = await import('./index.js');
    expect(mod.LlmEventType).toBeDefined();
    expect(mod.LlmEventType.TextDelta).toBeDefined();
    expect(mod.LlmEventType.Finished).toBeDefined();
  });

  it('should export GeminiEventType from providers/gemini/types.ts via turn.ts', async () => {
    const mod = await import('./index.js');
    expect(mod.GeminiEventType).toBeDefined();
  });
});
