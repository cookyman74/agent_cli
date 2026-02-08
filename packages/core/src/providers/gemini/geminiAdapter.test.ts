/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for GeminiAdapter — extends BaseAdapter to wrap Gemini SDK.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.2
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAdapter } from './adapter.js';
import type { LlmGenerateRequest, AdapterConfig } from '../types.js';
import { LlmEventType } from '../events.js';
import { LlmError } from '../errors.js';

// =================================================================
// Test helpers
// =================================================================

function createBasicRequest(
  overrides?: Partial<LlmGenerateRequest>,
): LlmGenerateRequest {
  return {
    model: 'gemini-2.0-flash',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    ...overrides,
  };
}

function createMockModels() {
  return {
    generateContent: vi.fn(),
    generateContentStream: vi.fn(),
    countTokens: vi.fn(),
    embedContent: vi.fn(),
  };
}

function createAdapterConfig(
  overrides?: Partial<AdapterConfig>,
): AdapterConfig {
  return {
    apiKey: 'test-api-key',
    ...overrides,
  };
}

// =================================================================
// Tests
// =================================================================

describe('GeminiAdapter', () => {
  let mockModels: ReturnType<typeof createMockModels>;
  let adapter: GeminiAdapter;

  beforeEach(() => {
    mockModels = createMockModels();
    adapter = new GeminiAdapter(createAdapterConfig(), mockModels);
  });

  // ==============================================================
  // 2.3.1.1 & 2.3.1.2 — Class creation & BaseAdapter inheritance
  // ==============================================================

  describe('class structure', () => {
    it('should have providerName "gemini"', () => {
      expect(adapter.providerName).toBe('gemini');
    });

    it('should implement capabilities', () => {
      const caps = adapter.capabilities;
      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsToolCalls).toBe(true);
      expect(caps.supportsImageInput).toBe(true);
      expect(caps.supportsSystemMessage).toBe(true);
      expect(caps.supportsTokenCount).toBe(true);
      expect(caps.supportsThought).toBe(true);
    });

    it('should validate config on construction', () => {
      expect(
        () => new GeminiAdapter(null as unknown as AdapterConfig, mockModels),
      ).toThrow();
    });
  });

  // ==============================================================
  // 2.3.1.3 — generateContent
  // ==============================================================

  describe('generateContent', () => {
    it('should call models.generateContent with converted request', async () => {
      mockModels.generateContent.mockResolvedValue({
        candidates: [
          {
            content: { role: 'model', parts: [{ text: 'Hello!' }] },
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 5,
          candidatesTokenCount: 3,
          totalTokenCount: 8,
        },
      });

      const request = createBasicRequest();
      const result = await adapter.generateContent(request, 'prompt-1');

      expect(mockModels.generateContent).toHaveBeenCalledTimes(1);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]).toEqual({ type: 'text', text: 'Hello!' });
      expect(result.stopReason).toBe('end_turn');
      expect(result.usage!.promptTokens).toBe(5);
      expect(result.usage!.completionTokens).toBe(3);
    });

    it('should validate request (missing model)', async () => {
      const request = createBasicRequest({ model: '' });

      await expect(
        adapter.generateContent(request, 'prompt-1'),
      ).rejects.toThrow();
    });

    it('should validate request (empty messages)', async () => {
      const request = createBasicRequest({ messages: [] });

      await expect(
        adapter.generateContent(request, 'prompt-1'),
      ).rejects.toThrow();
    });

    it('should pass system instruction from request', async () => {
      mockModels.generateContent.mockResolvedValue({
        candidates: [
          {
            content: { role: 'model', parts: [{ text: 'ok' }] },
            finishReason: 'STOP',
          },
        ],
      });

      const request = createBasicRequest({
        systemInstruction: 'Be helpful.',
      });

      await adapter.generateContent(request, 'prompt-1');

      const callArgs = mockModels.generateContent.mock.calls[0][0];
      expect(callArgs.config?.systemInstruction).toBeDefined();
    });

    it('should pass tools in request', async () => {
      mockModels.generateContent.mockResolvedValue({
        candidates: [
          {
            content: { role: 'model', parts: [{ text: 'ok' }] },
            finishReason: 'STOP',
          },
        ],
      });

      const request = createBasicRequest({
        tools: [
          {
            name: 'test_tool',
            description: 'A test tool',
            parameters: {
              type: 'object',
              properties: { q: { type: 'string' } },
            },
          },
        ],
      });

      await adapter.generateContent(request, 'prompt-1');

      const callArgs = mockModels.generateContent.mock.calls[0][0];
      expect(callArgs.config?.tools).toBeDefined();
    });

    it('should handle SDK errors gracefully', async () => {
      mockModels.generateContent.mockRejectedValue(
        new Error('API quota exceeded'),
      );

      const request = createBasicRequest();

      await expect(
        adapter.generateContent(request, 'prompt-1'),
      ).rejects.toThrow();
    });
  });

  // ==============================================================
  // 2.3.1.4 — generateContentStream
  // ==============================================================

  describe('generateContentStream', () => {
    it('should return an async generator of LlmEvents', async () => {
      // Mock stream that yields GenerateContentResponse chunks
      const mockChunks = [
        {
          candidates: [
            { content: { role: 'model', parts: [{ text: 'Hello' }] } },
          ],
        },
        {
          candidates: [
            { content: { role: 'model', parts: [{ text: ' world' }] } },
          ],
        },
        {
          candidates: [
            {
              content: { role: 'model', parts: [{ text: '!' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 8,
            totalTokenCount: 13,
          },
        },
      ];

      async function* mockStream() {
        for (const chunk of mockChunks) {
          yield chunk;
        }
      }

      mockModels.generateContentStream.mockResolvedValue(mockStream());

      const request = createBasicRequest();
      const stream = adapter.generateContentStream(request, 'prompt-1');

      const events = [];
      for await (const event of stream) {
        events.push(event);
      }

      // Should have text_delta events and a finished/message_end event
      expect(events.length).toBeGreaterThan(0);
      const textEvents = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textEvents.length).toBeGreaterThan(0);
    });

    it('should normalize stream creation errors to LlmError', async () => {
      mockModels.generateContentStream.mockRejectedValue(
        new Error('Network timeout'),
      );

      const request = createBasicRequest();
      const stream = adapter.generateContentStream(request, 'prompt-1');

      await expect(async () => {
        for await (const _event of stream) {
          // consume
        }
      }).rejects.toThrow(LlmError);
    });

    it('should normalize stream iteration errors to LlmError', async () => {
      async function* failingStream() {
        yield {
          candidates: [
            { content: { role: 'model', parts: [{ text: 'partial' }] } },
          ],
        };
        throw new Error('Stream interrupted');
      }

      mockModels.generateContentStream.mockResolvedValue(failingStream());

      const request = createBasicRequest();
      const stream = adapter.generateContentStream(request, 'prompt-1');

      await expect(async () => {
        for await (const _event of stream) {
          // consume
        }
      }).rejects.toThrow(LlmError);
    });

    it('should validate request before streaming', () => {
      const request = createBasicRequest({ model: '' });

      // Should throw synchronously or on first iteration
      expect(() => {
        adapter.generateContentStream(request, 'prompt-1');
      }).toThrow();
    });
  });

  // ==============================================================
  // 2.3.1.5 — capabilities
  // ==============================================================

  describe('capabilities', () => {
    it('should report all expected capabilities', () => {
      const caps = adapter.capabilities;

      expect(caps.supportsStreaming).toBe(true);
      expect(caps.supportsToolCalls).toBe(true);
      expect(caps.supportsImageInput).toBe(true);
      expect(caps.supportsImageGeneration).toBe(true);
      expect(caps.supportsEmbedding).toBe(true);
      expect(caps.supportsTokenCount).toBe(true);
      expect(caps.supportsSystemMessage).toBe(true);
      expect(caps.supportsThought).toBe(true);
      expect(caps.maxContextLength).toBeGreaterThan(0);
      expect(caps.maxOutputTokens).toBeGreaterThan(0);
    });
  });

  // ==============================================================
  // 2.3.1.6 — config validation
  // ==============================================================

  describe('config validation', () => {
    it('should accept config with apiKey', () => {
      expect(
        () => new GeminiAdapter({ apiKey: 'key' }, mockModels),
      ).not.toThrow();
    });

    it('should accept config without apiKey (ADC fallback)', () => {
      expect(() => new GeminiAdapter({}, mockModels)).not.toThrow();
    });
  });

  // ==============================================================
  // 2.3.1.7 — countTokens
  // ==============================================================

  describe('countTokens', () => {
    it('should delegate to models.countTokens', async () => {
      mockModels.countTokens.mockResolvedValue({
        totalTokens: 42,
      });

      const request = createBasicRequest();
      const result = await adapter.countTokens(request);

      expect(result.totalTokens).toBe(42);
      expect(mockModels.countTokens).toHaveBeenCalledTimes(1);
    });
  });
});
