/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for provider-independent ContentGenerator wrapper class migration.
 *
 * M2.1.6: ContentGenerator 래퍼/파생 클래스 마이그레이션
 */

vi.mock('../telemetry/loggers.js', () => ({
  logApiRequest: vi.fn(),
  logApiResponse: vi.fn(),
  logApiError: vi.fn(),
}));

vi.mock('../telemetry/trace.js', () => ({
  runInDevTraceSpan: vi.fn(
    async (
      _meta: unknown,
      fn: (ctx: {
        metadata: Record<string, unknown>;
        endSpan: () => void;
      }) => unknown,
    ) => fn({ metadata: {}, endSpan: vi.fn() }),
  ),
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmTokenCount,
} from '../providers/types.js';
import type { LlmEvent, LlmEventStream } from '../providers/events.js';
import { LlmEventType } from '../providers/events.js';
import type { GeminiContentGenerator } from './contentGenerator.js';
import { isProviderIndependentGenerator } from './contentGenerator.js';
import {
  FakeContentGenerator,
  type FakeResponse,
} from './fakeContentGenerator.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { RecordingContentGenerator } from './recordingContentGenerator.js';
import type { Config } from '../config/config.js';
import { appendFileSync } from 'node:fs';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    appendFileSync: vi.fn(),
    promises: {
      ...actual.promises,
      readFile: vi.fn(),
    },
  };
});

const mockAppendFileSync = vi.mocked(appendFileSync);

// Helper: create a mock LlmGenerateRequest
function createMockLlmRequest(): LlmGenerateRequest {
  return {
    model: 'test-model',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    temperature: 0.7,
  };
}

// Helper: create a mock LlmGenerateResponse
function createMockLlmResponse(): LlmGenerateResponse {
  return {
    id: 'resp-123',
    content: [{ type: 'text', text: 'response text' }],
    model: 'test-model',
    stopReason: 'end_turn',
    usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
  };
}

// Helper: create mock LlmEvents for stream
function createMockLlmEvents(): LlmEvent[] {
  return [
    { type: LlmEventType.TextDelta, text: 'chunk1' },
    { type: LlmEventType.TextDelta, text: 'chunk2' },
    { type: LlmEventType.Finished, finishReason: 'end_turn' },
  ];
}

// Helper: create a mock LlmTokenCount
function createMockLlmTokenCount(): LlmTokenCount {
  return {
    totalTokens: 42,
    breakdown: { messages: 30, tools: 10, system: 2 },
  };
}

describe('M2.1.6 ContentGenerator Wrapper Migration - Provider-Independent Types', () => {
  describe('2.1.6.0 - GeminiContentGenerator interface extension', () => {
    it('should accept optional llm* methods on GeminiContentGenerator', () => {
      // A generator without llm* methods should still satisfy the interface
      const legacyGen: GeminiContentGenerator = {
        generateContent: vi.fn(),
        generateContentStream: vi.fn(),
        countTokens: vi.fn(),
        embedContent: vi.fn(),
      };
      expect(legacyGen.llmGenerateContent).toBeUndefined();
      expect(legacyGen.llmGenerateContentStream).toBeUndefined();
      expect(legacyGen.llmCountTokens).toBeUndefined();
    });

    it('should identify provider-independent generator with isProviderIndependentGenerator', () => {
      const legacyGen: GeminiContentGenerator = {
        generateContent: vi.fn(),
        generateContentStream: vi.fn(),
        countTokens: vi.fn(),
        embedContent: vi.fn(),
      };
      expect(isProviderIndependentGenerator(legacyGen)).toBe(false);

      const providerIndependentGen: GeminiContentGenerator = {
        generateContent: vi.fn(),
        generateContentStream: vi.fn(),
        countTokens: vi.fn(),
        embedContent: vi.fn(),
        llmGenerateContent: vi.fn(),
        llmGenerateContentStream: vi.fn(),
        llmCountTokens: vi.fn(),
      };
      expect(isProviderIndependentGenerator(providerIndependentGen)).toBe(true);
    });
  });

  describe('2.1.6.3 - FakeContentGenerator llm* methods', () => {
    it('should return LlmGenerateResponse for llmGenerateContent', async () => {
      const mockResponse = createMockLlmResponse();
      const fakeResponses: FakeResponse[] = [
        { method: 'llmGenerateContent', response: mockResponse },
      ];
      const generator = new FakeContentGenerator(fakeResponses);

      const result = await generator.llmGenerateContent(
        createMockLlmRequest(),
        'prompt-1',
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('resp-123');
      expect(result.content).toEqual([{ type: 'text', text: 'response text' }]);
      expect(result.stopReason).toBe('end_turn');
    });

    it('should yield LlmEvents for llmGenerateContentStream', async () => {
      const mockEvents = createMockLlmEvents();
      const fakeResponses: FakeResponse[] = [
        { method: 'llmGenerateContentStream', response: mockEvents },
      ];
      const generator = new FakeContentGenerator(fakeResponses);

      const stream = generator.llmGenerateContentStream(
        createMockLlmRequest(),
        'prompt-1',
      );

      const collected: LlmEvent[] = [];
      for await (const event of stream) {
        collected.push(event);
      }

      expect(collected).toHaveLength(3);
      expect(collected[0].type).toBe(LlmEventType.TextDelta);
      expect(collected[2].type).toBe(LlmEventType.Finished);
    });

    it('should return LlmTokenCount for llmCountTokens', async () => {
      const mockTokenCount = createMockLlmTokenCount();
      const fakeResponses: FakeResponse[] = [
        { method: 'llmCountTokens', response: mockTokenCount },
      ];
      const generator = new FakeContentGenerator(fakeResponses);

      const result = await generator.llmCountTokens(createMockLlmRequest());

      expect(result.totalTokens).toBe(42);
      expect(result.breakdown).toEqual({ messages: 30, tools: 10, system: 2 });
    });

    it('should handle FakeResponse llm variants in JSON roundtrip', () => {
      const fakeResponse: FakeResponse = {
        method: 'llmGenerateContent',
        response: createMockLlmResponse(),
      };

      const serialized = JSON.stringify(fakeResponse);
      const deserialized = JSON.parse(serialized) as FakeResponse;

      expect(deserialized.method).toBe('llmGenerateContent');
      expect(
        (
          deserialized as {
            method: 'llmGenerateContent';
            response: LlmGenerateResponse;
          }
        ).response.id,
      ).toBe('resp-123');
    });
  });

  describe('2.1.6.1 - LoggingContentGenerator llm* methods', () => {
    let wrapped: GeminiContentGenerator;
    let config: Config;
    let loggingGen: LoggingContentGenerator;

    beforeEach(() => {
      wrapped = {
        generateContent: vi.fn(),
        generateContentStream: vi.fn(),
        countTokens: vi.fn(),
        embedContent: vi.fn(),
        llmGenerateContent: vi.fn(),
        llmGenerateContentStream: vi.fn(),
        llmCountTokens: vi.fn(),
      };
      config = {
        getGoogleAIConfig: vi.fn(),
        getVertexAIConfig: vi.fn(),
        getContentGeneratorConfig: vi
          .fn()
          .mockReturnValue({ authType: 'API_KEY' }),
      } as unknown as Config;
      loggingGen = new LoggingContentGenerator(wrapped, config);
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should delegate llmGenerateContent to wrapped generator', async () => {
      const mockResponse = createMockLlmResponse();
      vi.mocked(wrapped.llmGenerateContent!).mockResolvedValue(mockResponse);

      const result = await loggingGen.llmGenerateContent(
        createMockLlmRequest(),
        'prompt-1',
      );

      expect(wrapped.llmGenerateContent).toHaveBeenCalledWith(
        createMockLlmRequest(),
        'prompt-1',
        undefined,
      );
      expect(result.id).toBe('resp-123');
    });

    it('should delegate llmGenerateContentStream to wrapped generator', async () => {
      const mockEvents = createMockLlmEvents();
      async function* mockStream(): LlmEventStream {
        for (const event of mockEvents) {
          yield event;
        }
      }
      vi.mocked(wrapped.llmGenerateContentStream!).mockReturnValue(
        mockStream(),
      );

      const stream = loggingGen.llmGenerateContentStream(
        createMockLlmRequest(),
        'prompt-1',
      );

      const collected: LlmEvent[] = [];
      for await (const event of stream) {
        collected.push(event);
      }

      expect(collected).toHaveLength(3);
      expect(wrapped.llmGenerateContentStream).toHaveBeenCalled();
    });

    it('should delegate llmCountTokens to wrapped generator', async () => {
      const mockTokenCount = createMockLlmTokenCount();
      vi.mocked(wrapped.llmCountTokens!).mockResolvedValue(mockTokenCount);

      const result = await loggingGen.llmCountTokens(createMockLlmRequest());

      expect(result.totalTokens).toBe(42);
      expect(wrapped.llmCountTokens).toHaveBeenCalled();
    });

    it('should throw error when wrapped generator does not support llm* methods', async () => {
      const legacyWrapped: GeminiContentGenerator = {
        generateContent: vi.fn(),
        generateContentStream: vi.fn(),
        countTokens: vi.fn(),
        embedContent: vi.fn(),
        // no llm* methods
      };
      const legacyLogging = new LoggingContentGenerator(legacyWrapped, config);

      await expect(
        legacyLogging.llmGenerateContent(createMockLlmRequest(), 'prompt-1'),
      ).rejects.toThrow('does not support provider-independent API');

      expect(() =>
        legacyLogging.llmGenerateContentStream(
          createMockLlmRequest(),
          'prompt-1',
        ),
      ).toThrow('does not support provider-independent API');

      await expect(
        legacyLogging.llmCountTokens(createMockLlmRequest()),
      ).rejects.toThrow('does not support provider-independent API');
    });
  });

  describe('2.1.6.2 - RecordingContentGenerator llm* methods', () => {
    let wrapped: GeminiContentGenerator;
    let recordingGen: RecordingContentGenerator;
    const filePath = '/tmp/test-recording.jsonl';

    beforeEach(() => {
      wrapped = {
        generateContent: vi.fn(),
        generateContentStream: vi.fn(),
        countTokens: vi.fn(),
        embedContent: vi.fn(),
        llmGenerateContent: vi.fn(),
        llmGenerateContentStream: vi.fn(),
        llmCountTokens: vi.fn(),
      };
      recordingGen = new RecordingContentGenerator(wrapped, filePath);
      mockAppendFileSync.mockClear();
    });

    it('should record llmGenerateContent response to JSONL', async () => {
      const mockResponse = createMockLlmResponse();
      vi.mocked(wrapped.llmGenerateContent!).mockResolvedValue(mockResponse);

      const result = await recordingGen.llmGenerateContent(
        createMockLlmRequest(),
        'prompt-1',
      );

      expect(result.id).toBe('resp-123');
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        filePath,
        expect.stringContaining('"method":"llmGenerateContent"'),
      );
    });

    it('should record llmGenerateContentStream events to JSONL', async () => {
      const mockEvents = createMockLlmEvents();
      async function* mockStream(): LlmEventStream {
        for (const event of mockEvents) {
          yield event;
        }
      }
      vi.mocked(wrapped.llmGenerateContentStream!).mockReturnValue(
        mockStream(),
      );

      const stream = recordingGen.llmGenerateContentStream(
        createMockLlmRequest(),
        'prompt-1',
      );

      const collected: LlmEvent[] = [];
      for await (const event of stream) {
        collected.push(event);
      }

      expect(collected).toHaveLength(3);
      // Recording happens after stream is consumed
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        filePath,
        expect.stringContaining('"method":"llmGenerateContentStream"'),
      );
    });

    it('should record llmCountTokens response to JSONL', async () => {
      const mockTokenCount = createMockLlmTokenCount();
      vi.mocked(wrapped.llmCountTokens!).mockResolvedValue(mockTokenCount);

      const result = await recordingGen.llmCountTokens(createMockLlmRequest());

      expect(result.totalTokens).toBe(42);
      expect(mockAppendFileSync).toHaveBeenCalledWith(
        filePath,
        expect.stringContaining('"method":"llmCountTokens"'),
      );
    });
  });

  describe('2.1.6 - Legacy Gemini method compatibility', () => {
    it('FakeContentGenerator should still work with Gemini-specific methods', async () => {
      const { GenerateContentResponse } = await import('@google/genai');
      const fakeResponses: FakeResponse[] = [
        {
          method: 'generateContent',
          response: {
            candidates: [
              { content: { parts: [{ text: 'hello' }], role: 'model' } },
            ],
          } as import('@google/genai').GenerateContentResponse,
        },
      ];
      const generator = new FakeContentGenerator(fakeResponses);
      const response = await generator.generateContent(
        {} as import('@google/genai').GenerateContentParameters,
        'id',
      );
      expect(response).toBeInstanceOf(GenerateContentResponse);
    });
  });
});
