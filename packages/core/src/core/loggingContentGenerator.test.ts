/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const logApiRequest = vi.hoisted(() => vi.fn());
const logApiResponse = vi.hoisted(() => vi.fn());
const logApiError = vi.hoisted(() => vi.fn());
const logProviderApiResponse = vi.hoisted(() => vi.fn());
const logProviderApiError = vi.hoisted(() => vi.fn());

vi.mock('../telemetry/loggers.js', () => ({
  logApiRequest,
  logApiResponse,
  logApiError,
  logProviderApiResponse,
  logProviderApiError,
}));

const runInDevTraceSpan = vi.hoisted(() =>
  vi.fn(async (meta, fn) => fn({ metadata: {}, endSpan: vi.fn() })),
);

vi.mock('../telemetry/trace.js', () => ({
  runInDevTraceSpan,
}));

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  GenerateContentResponse,
  EmbedContentResponse,
} from '@google/genai';
import type { ContentGenerator } from './contentGenerator.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import type { Config } from '../config/config.js';
import { ApiRequestEvent } from '../telemetry/types.js';
import { UserTierId } from '../code_assist/types.js';
import { LlmEventType } from '../providers/events.js';
import type { LlmEvent, LlmEventStream } from '../providers/events.js';
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmTokenUsage,
} from '../providers/types.js';
import { ProviderApiResponseEvent } from '../providers/telemetryBridge.js';

describe('LoggingContentGenerator', () => {
  let wrapped: ContentGenerator;
  let config: Config;
  let loggingContentGenerator: LoggingContentGenerator;

  beforeEach(() => {
    wrapped = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    };
    config = {
      getGoogleAIConfig: vi.fn(),
      getVertexAIConfig: vi.fn(),
      getContentGeneratorConfig: vi.fn().mockReturnValue({
        authType: 'API_KEY',
      }),
    } as unknown as Config;
    loggingContentGenerator = new LoggingContentGenerator(wrapped, config);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('generateContent', () => {
    it('should log request and response on success', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      const userPromptId = 'prompt-123';
      const response: GenerateContentResponse = {
        candidates: [],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 2,
          totalTokenCount: 3,
        },
        text: undefined,
        functionCalls: undefined,
        executableCode: undefined,
        codeExecutionResult: undefined,
        data: undefined,
      };
      vi.mocked(wrapped.generateContent).mockResolvedValue(response);
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const promise = loggingContentGenerator.generateContent(
        req,
        userPromptId,
      );

      vi.advanceTimersByTime(1000);

      await promise;

      expect(wrapped.generateContent).toHaveBeenCalledWith(req, userPromptId);
      expect(logApiRequest).toHaveBeenCalledWith(
        config,
        expect.any(ApiRequestEvent),
      );
      const responseEvent = vi.mocked(logApiResponse).mock.calls[0][1];
      expect(responseEvent.duration_ms).toBe(1000);
    });

    it('should log error on failure', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      const userPromptId = 'prompt-123';
      const error = new Error('test error');
      vi.mocked(wrapped.generateContent).mockRejectedValue(error);
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const promise = loggingContentGenerator.generateContent(
        req,
        userPromptId,
      );

      vi.advanceTimersByTime(1000);

      await expect(promise).rejects.toThrow(error);

      expect(logApiRequest).toHaveBeenCalledWith(
        config,
        expect.any(ApiRequestEvent),
      );
      const errorEvent = vi.mocked(logApiError).mock.calls[0][1];
      expect(errorEvent.duration_ms).toBe(1000);
    });
  });

  describe('generateContentStream', () => {
    it('should log request and response on success', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      const userPromptId = 'prompt-123';
      const response = {
        candidates: [],
        usageMetadata: {
          promptTokenCount: 1,
          candidatesTokenCount: 2,
          totalTokenCount: 3,
        },
      } as unknown as GenerateContentResponse;

      async function* createAsyncGenerator() {
        yield response;
      }

      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const stream = await loggingContentGenerator.generateContentStream(
        req,
        userPromptId,
      );

      vi.advanceTimersByTime(1000);

      for await (const _ of stream) {
        // consume stream
      }

      expect(wrapped.generateContentStream).toHaveBeenCalledWith(
        req,
        userPromptId,
      );
      expect(logApiRequest).toHaveBeenCalledWith(
        config,
        expect.any(ApiRequestEvent),
      );
      const responseEvent = vi.mocked(logApiResponse).mock.calls[0][1];
      expect(responseEvent.duration_ms).toBe(1000);
    });

    it('should log error on failure', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      const userPromptId = 'prompt-123';
      const error = new Error('test error');

      async function* createAsyncGenerator() {
        yield Promise.reject(error);
      }

      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const stream = await loggingContentGenerator.generateContentStream(
        req,
        userPromptId,
      );

      vi.advanceTimersByTime(1000);

      await expect(async () => {
        for await (const _ of stream) {
          // do nothing
        }
      }).rejects.toThrow(error);

      expect(logApiRequest).toHaveBeenCalledWith(
        config,
        expect.any(ApiRequestEvent),
      );
      const errorEvent = vi.mocked(logApiError).mock.calls[0][1];
      expect(errorEvent.duration_ms).toBe(1000);
    });

    it('should set latest API request in config for main agent requests', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      // Main agent prompt IDs end with exactly 8 hashes and a turn counter
      const mainAgentPromptId = 'session-uuid########1';
      config.setLatestApiRequest = vi.fn();

      async function* createAsyncGenerator() {
        yield { candidates: [] } as unknown as GenerateContentResponse;
      }
      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );

      await loggingContentGenerator.generateContentStream(
        req,
        mainAgentPromptId,
      );

      expect(config.setLatestApiRequest).toHaveBeenCalledWith(req);
    });

    it('should NOT set latest API request in config for sub-agent requests', async () => {
      const req = {
        contents: [{ role: 'user', parts: [{ text: 'hello' }] }],
        model: 'gemini-pro',
      };
      // Sub-agent prompt IDs contain fewer hashes, typically separating the agent name and ID
      const subAgentPromptId = 'codebase_investigator#12345';
      config.setLatestApiRequest = vi.fn();

      async function* createAsyncGenerator() {
        yield { candidates: [] } as unknown as GenerateContentResponse;
      }
      vi.mocked(wrapped.generateContentStream).mockResolvedValue(
        createAsyncGenerator(),
      );

      await loggingContentGenerator.generateContentStream(
        req,
        subAgentPromptId,
      );

      expect(config.setLatestApiRequest).not.toHaveBeenCalled();
    });
  });

  describe('getWrapped', () => {
    it('should return the wrapped content generator', () => {
      expect(loggingContentGenerator.getWrapped()).toBe(wrapped);
    });
  });

  describe('countTokens', () => {
    it('should call the wrapped countTokens method', async () => {
      const req = { contents: [], model: 'gemini-pro' };
      const response = { totalTokens: 10 };
      vi.mocked(wrapped.countTokens).mockResolvedValue(response);

      const result = await loggingContentGenerator.countTokens(req);

      expect(wrapped.countTokens).toHaveBeenCalledWith(req);
      expect(result).toBe(response);
    });
  });

  describe('embedContent', () => {
    it('should call the wrapped embedContent method', async () => {
      const req = {
        contents: [{ role: 'user', parts: [] }],
        model: 'gemini-pro',
      };
      const response: EmbedContentResponse = { embeddings: [{ values: [] }] };
      vi.mocked(wrapped.embedContent).mockResolvedValue(response);

      const result = await loggingContentGenerator.embedContent(req);

      expect(wrapped.embedContent).toHaveBeenCalledWith(req);
      expect(result).toBe(response);
    });
  });

  describe('delegation', () => {
    it('should delegate userTier to wrapped', () => {
      wrapped.userTier = UserTierId.STANDARD;
      expect(loggingContentGenerator.userTier).toBe(UserTierId.STANDARD);
    });

    it('should delegate userTierName to wrapped', () => {
      wrapped.userTierName = 'Standard Tier';
      expect(loggingContentGenerator.userTierName).toBe('Standard Tier');
    });
  });

  // =========================================================================
  // RED-1~RED-5: Non-Gemini (LLM) telemetry tests
  // =========================================================================

  describe('llmLoggingStreamWrapper telemetry', () => {
    const mockLlmRequest: LlmGenerateRequest = {
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    };
    const userPromptId = 'prompt-llm-123';
    const mockUsage: LlmTokenUsage = {
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    };

    beforeEach(() => {
      (wrapped as unknown as Record<string, unknown>)['providerName'] =
        'claude';
    });

    // RED-1: 정상 응답 시 logProviderApiResponse 호출
    it('should call logProviderApiResponse on successful stream completion', async () => {
      async function* createLlmStream(): LlmEventStream {
        yield { type: LlmEventType.TextDelta, text: 'Hello' } as LlmEvent;
        yield {
          type: LlmEventType.MessageEnd,
          usage: mockUsage,
        } as LlmEvent;
        yield {
          type: LlmEventType.Finished,
          finishReason: 'end_turn',
        } as LlmEvent;
      }

      wrapped.llmGenerateContentStream = vi
        .fn()
        .mockReturnValue(createLlmStream());
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const stream = loggingContentGenerator.llmGenerateContentStream(
        mockLlmRequest,
        userPromptId,
      );

      vi.advanceTimersByTime(1000);

      for await (const _ of stream) {
        // consume stream
      }

      expect(logProviderApiResponse).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          provider: 'claude',
          duration_ms: expect.any(Number),
        }),
      );
      const responseEvent = vi.mocked(logProviderApiResponse).mock.calls[0][1];
      expect(responseEvent).toBeInstanceOf(ProviderApiResponseEvent);
      expect(responseEvent.duration_ms).toBe(1000);
    });

    // REVIEW-1: Claude 패턴 — usage가 Finished 이벤트에 포함된 경우
    it('should collect usage from Finished event (Claude pattern)', async () => {
      const finishedUsage: LlmTokenUsage = {
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
        cachedTokens: 50,
      };

      async function* createClaudeStream(): LlmEventStream {
        yield { type: LlmEventType.TextDelta, text: 'Hello' } as LlmEvent;
        yield {
          type: LlmEventType.Finished,
          finishReason: 'end_turn',
          usage: finishedUsage,
        } as LlmEvent;
        yield { type: LlmEventType.MessageEnd } as LlmEvent;
      }

      wrapped.llmGenerateContentStream = vi
        .fn()
        .mockReturnValue(createClaudeStream());

      const stream = loggingContentGenerator.llmGenerateContentStream(
        mockLlmRequest,
        userPromptId,
      );

      for await (const _ of stream) {
        // consume stream
      }

      expect(logProviderApiResponse).toHaveBeenCalledOnce();
      const responseEvent = vi.mocked(logProviderApiResponse).mock.calls[0][1];
      expect(responseEvent).toBeInstanceOf(ProviderApiResponseEvent);
      // Usage should come from Finished event, not MessageEnd
      expect(responseEvent.usage.input_token_count).toBe(200);
      expect(responseEvent.usage.output_token_count).toBe(100);
      expect(responseEvent.usage.total_token_count).toBe(300);
    });

    // RED-2: Error 이벤트 yield 시 logProviderApiError 호출
    it('should call logProviderApiError when stream contains Error event', async () => {
      async function* createLlmStream(): LlmEventStream {
        yield { type: LlmEventType.TextDelta, text: 'partial' } as LlmEvent;
        yield {
          type: LlmEventType.Error,
          error: new Error('rate limit exceeded'),
        } as LlmEvent;
      }

      wrapped.llmGenerateContentStream = vi
        .fn()
        .mockReturnValue(createLlmStream());
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const stream = loggingContentGenerator.llmGenerateContentStream(
        mockLlmRequest,
        userPromptId,
      );

      vi.advanceTimersByTime(500);

      for await (const _ of stream) {
        // consume stream — Error events are yielded, not thrown
      }

      expect(logProviderApiError).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          provider: 'claude',
          duration_ms: expect.any(Number),
        }),
      );
      expect(logProviderApiResponse).not.toHaveBeenCalled();
    });

    // RED-3: usage 없는 정상 스트림 → 빈 usage로 logProviderApiResponse 호출
    it('should call logProviderApiResponse with empty usage when stream has no MessageEnd usage', async () => {
      async function* createLlmStream(): LlmEventStream {
        yield { type: LlmEventType.TextDelta, text: 'Hello' } as LlmEvent;
        yield {
          type: LlmEventType.Finished,
          finishReason: 'end_turn',
        } as LlmEvent;
      }

      wrapped.llmGenerateContentStream = vi
        .fn()
        .mockReturnValue(createLlmStream());

      const stream = loggingContentGenerator.llmGenerateContentStream(
        mockLlmRequest,
        userPromptId,
      );

      for await (const _ of stream) {
        // consume stream
      }

      expect(logProviderApiResponse).toHaveBeenCalledOnce();
      const responseEvent = vi.mocked(logProviderApiResponse).mock.calls[0][1];
      expect(responseEvent).toBeInstanceOf(ProviderApiResponseEvent);
      // Usage should default to zeros
      expect(responseEvent.usage.input_token_count).toBe(0);
      expect(responseEvent.usage.output_token_count).toBe(0);
      expect(responseEvent.usage.total_token_count).toBe(0);
    });

    // RED-4: 네트워크 예외 throw 시 logProviderApiError 호출 + rethrow
    it('should call logProviderApiError and rethrow on network-level exception', async () => {
      const networkError = new Error('ECONNREFUSED');

      async function* createLlmStream(): LlmEventStream {
        yield { type: LlmEventType.TextDelta, text: 'partial' } as LlmEvent;
        throw networkError;
      }

      wrapped.llmGenerateContentStream = vi
        .fn()
        .mockReturnValue(createLlmStream());
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const stream = loggingContentGenerator.llmGenerateContentStream(
        mockLlmRequest,
        userPromptId,
      );

      vi.advanceTimersByTime(2000);

      await expect(async () => {
        for await (const _ of stream) {
          // consume — will throw on network error
        }
      }).rejects.toThrow('ECONNREFUSED');

      expect(logProviderApiError).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          provider: 'claude',
          error: expect.stringContaining('ECONNREFUSED'),
          duration_ms: expect.any(Number),
        }),
      );
    });

    // REVIEW-2: AbortError는 API 에러가 아닌 사용자 취소로 처리
    it('should NOT call logProviderApiError when stream throws AbortError', async () => {
      const abortError = new DOMException(
        'The operation was aborted',
        'AbortError',
      );

      async function* createLlmStream(): LlmEventStream {
        yield { type: LlmEventType.TextDelta, text: 'partial' } as LlmEvent;
        throw abortError;
      }

      wrapped.llmGenerateContentStream = vi
        .fn()
        .mockReturnValue(createLlmStream());

      const stream = loggingContentGenerator.llmGenerateContentStream(
        mockLlmRequest,
        userPromptId,
      );

      await expect(async () => {
        for await (const _ of stream) {
          // consume — will throw AbortError
        }
      }).rejects.toThrow();

      // AbortError should NOT be logged as API error
      expect(logProviderApiError).not.toHaveBeenCalled();
      expect(logProviderApiResponse).not.toHaveBeenCalled();
    });

    // REVIEW-4: Error yield 후 throw 시 이중 기록 방지
    it('should NOT double-log error when Error event is yielded AND stream throws', async () => {
      const apiError = new Error('rate limit');

      async function* createLlmStream(): LlmEventStream {
        yield { type: LlmEventType.TextDelta, text: 'partial' } as LlmEvent;
        yield {
          type: LlmEventType.Error,
          error: apiError,
        } as LlmEvent;
        throw apiError; // also throws after yielding Error event
      }

      wrapped.llmGenerateContentStream = vi
        .fn()
        .mockReturnValue(createLlmStream());

      const stream = loggingContentGenerator.llmGenerateContentStream(
        mockLlmRequest,
        userPromptId,
      );

      await expect(async () => {
        for await (const _ of stream) {
          // consume
        }
      }).rejects.toThrow('rate limit');

      // Error should be logged exactly once (from yielded Error event)
      expect(logProviderApiError).toHaveBeenCalledTimes(1);
    });
  });

  // RED-5: llmGenerateContent (비스트림) 텔레메트리
  describe('llmGenerateContent telemetry', () => {
    const mockLlmRequest: LlmGenerateRequest = {
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    };
    const userPromptId = 'prompt-llm-456';

    beforeEach(() => {
      (wrapped as unknown as Record<string, unknown>)['providerName'] =
        'claude';
    });

    it('should call logProviderApiResponse on successful non-stream response', async () => {
      const mockResponse: LlmGenerateResponse = {
        id: 'resp-123',
        content: [{ type: 'text', text: 'Hi there!' }],
        model: 'claude-sonnet-4-20250514',
        stopReason: 'end_turn',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      };

      wrapped.llmGenerateContent = vi.fn().mockResolvedValue(mockResponse);
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const promise = loggingContentGenerator.llmGenerateContent(
        mockLlmRequest,
        userPromptId,
      );

      vi.advanceTimersByTime(500);

      await promise;

      expect(logProviderApiResponse).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          provider: 'claude',
          duration_ms: expect.any(Number),
        }),
      );
      const responseEvent = vi.mocked(logProviderApiResponse).mock.calls[0][1];
      expect(responseEvent).toBeInstanceOf(ProviderApiResponseEvent);
      expect(responseEvent.duration_ms).toBe(500);
    });

    it('should call logProviderApiError on non-stream error', async () => {
      const apiError = new Error('authentication failed');

      wrapped.llmGenerateContent = vi.fn().mockRejectedValue(apiError);
      const startTime = new Date('2025-01-01T00:00:00.000Z');
      vi.setSystemTime(startTime);

      const promise = loggingContentGenerator.llmGenerateContent(
        mockLlmRequest,
        userPromptId,
      );

      vi.advanceTimersByTime(300);

      await expect(promise).rejects.toThrow('authentication failed');

      expect(logProviderApiError).toHaveBeenCalledWith(
        config,
        expect.objectContaining({
          model: 'claude-sonnet-4-20250514',
          provider: 'claude',
          error: expect.stringContaining('authentication failed'),
          duration_ms: expect.any(Number),
        }),
      );
    });
  });
});
