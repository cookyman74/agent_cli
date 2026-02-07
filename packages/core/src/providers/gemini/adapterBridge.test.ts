/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for AdapterBridge — wires GeminiAdapter into the existing
 * ContentGenerator pipeline, controlled by the ENABLE_MULTI_PROVIDER flag.
 *
 * Verifies that:
 * - When flag is ON, generator gets llm* methods backed by GeminiAdapter
 * - When flag is OFF, generator is returned unchanged
 * - Legacy methods continue to work regardless of flag state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAdapterBridge,
  type BridgeableGenerator,
} from './adapterBridge.js';
import {
  setMultiProviderOverride,
  clearMultiProviderOverride,
} from './featureFlag.js';

// =================================================================
// Mock generator (simulates googleGenAI.models or CodeAssistServer)
// =================================================================

function createMockBaseGenerator(): BridgeableGenerator {
  return {
    generateContent: vi.fn().mockResolvedValue({
      candidates: [
        {
          content: { role: 'model', parts: [{ text: 'legacy response' }] },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: {
        promptTokenCount: 5,
        candidatesTokenCount: 3,
        totalTokenCount: 8,
      },
    }),
    generateContentStream: vi.fn().mockResolvedValue(
      (async function* () {
        yield {
          candidates: [
            {
              content: { role: 'model', parts: [{ text: 'chunk' }] },
              finishReason: 'STOP',
            },
          ],
        };
      })(),
    ),
    countTokens: vi.fn().mockResolvedValue({ totalTokens: 42 }),
    embedContent: vi.fn().mockResolvedValue({}),
  };
}

// =================================================================
// Tests
// =================================================================

describe('AdapterBridge', () => {
  beforeEach(() => {
    clearMultiProviderOverride();
  });

  afterEach(() => {
    clearMultiProviderOverride();
  });

  describe('when flag is OFF (default)', () => {
    it('should return the original generator unchanged', () => {
      setMultiProviderOverride(false);
      const base = createMockBaseGenerator();

      const result = createAdapterBridge(base, { apiKey: 'test' });

      // Same reference — no wrapping
      expect(result).toBe(base);
    });

    it('should not have llmGenerateContent method', () => {
      setMultiProviderOverride(false);
      const base = createMockBaseGenerator();

      const result = createAdapterBridge(base, { apiKey: 'test' });

      expect(result.llmGenerateContent).toBeUndefined();
    });
  });

  describe('when flag is ON', () => {
    it('should return an enhanced generator with llm* methods', () => {
      setMultiProviderOverride(true);
      const base = createMockBaseGenerator();

      const result = createAdapterBridge(base, { apiKey: 'test' });

      expect(result.llmGenerateContent).toBeDefined();
      expect(result.llmGenerateContentStream).toBeDefined();
      expect(result.llmCountTokens).toBeDefined();
    });

    it('should preserve legacy generateContent method', async () => {
      setMultiProviderOverride(true);
      const base = createMockBaseGenerator();

      const result = createAdapterBridge(base, { apiKey: 'test' });

      // Legacy method still delegates to base
      await result.generateContent(
        { model: 'gemini-2.0-flash', contents: 'test' } as never,
        'prompt-1',
      );
      expect(base.generateContent).toHaveBeenCalledTimes(1);
    });

    it('llmGenerateContent should return LlmGenerateResponse', async () => {
      setMultiProviderOverride(true);
      const base = createMockBaseGenerator();

      const result = createAdapterBridge(base, { apiKey: 'test' });

      const response = await result.llmGenerateContent!(
        {
          model: 'gemini-2.0-flash',
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
        },
        'prompt-1',
      );

      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');
      expect(response.stopReason).toBe('end_turn');
    });

    it('llmGenerateContentStream should yield LlmEvents', async () => {
      setMultiProviderOverride(true);
      const base = createMockBaseGenerator();

      const result = createAdapterBridge(base, { apiKey: 'test' });

      const stream = result.llmGenerateContentStream!(
        {
          model: 'gemini-2.0-flash',
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
        },
        'prompt-1',
      );

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }
      expect(events.length).toBeGreaterThan(0);
    });

    it('llmCountTokens should return LlmTokenCount', async () => {
      setMultiProviderOverride(true);
      const base = createMockBaseGenerator();

      const result = createAdapterBridge(base, { apiKey: 'test' });

      const tokenCount = await result.llmCountTokens!({
        model: 'gemini-2.0-flash',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      });

      expect(tokenCount.totalTokens).toBe(42);
    });

    it('should preserve embedContent method', () => {
      setMultiProviderOverride(true);
      const base = createMockBaseGenerator();

      const result = createAdapterBridge(base, { apiKey: 'test' });

      expect(result.embedContent).toBe(base.embedContent);
    });

    it('should preserve userTier from base', () => {
      setMultiProviderOverride(true);
      const base = createMockBaseGenerator();
      (base as unknown as Record<string, unknown>)['userTier'] = 'free';

      const result = createAdapterBridge(base, { apiKey: 'test' });

      expect(result.userTier).toBe('free');
    });
  });

  describe('integration with fallback', () => {
    it('llm* methods should use GeminiAdapter internally', async () => {
      setMultiProviderOverride(true);
      const base = createMockBaseGenerator();

      const result = createAdapterBridge(base, { apiKey: 'test' });

      // Call llmGenerateContent — it should internally call base.generateContent
      // through GeminiAdapter → modelsApi → base.generateContent
      await result.llmGenerateContent!(
        {
          model: 'gemini-2.0-flash',
          messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        },
        'prompt-1',
      );

      // The adapter internally calls the base's generateContent
      expect(base.generateContent).toHaveBeenCalled();
    });
  });
});
