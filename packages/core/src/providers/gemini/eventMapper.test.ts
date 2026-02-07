/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { GeminiEventMapper } from './eventMapper.js';
import {
  GeminiEventType,
  type ServerGeminiContentEvent,
  type ServerGeminiThoughtEvent,
  type ServerGeminiToolCallRequestEvent,
  type ServerGeminiToolCallResponseEvent,
  type ServerGeminiToolCallConfirmationEvent,
  type ServerGeminiErrorEvent,
  type ServerGeminiFinishedEvent,
  type ServerGeminiUserCancelledEvent,
  type ServerGeminiRetryEvent,
  type ServerGeminiCitationEvent,
  type ServerGeminiChatCompressedEvent,
  type ServerGeminiLoopDetectedEvent,
  type ServerGeminiMaxSessionTurnsEvent,
  type ServerGeminiContextWindowWillOverflowEvent,
  type ServerGeminiInvalidStreamEvent,
  type ServerGeminiModelInfoEvent,
  type ServerGeminiAgentExecutionStoppedEvent,
  type ServerGeminiAgentExecutionBlockedEvent,
  CompressionStatus,
} from './types.js';
import { LlmEventType, type LlmEvent } from '../events.js';
import type { ToolCallResponseInfo } from '../../scheduler/types.js';
import type { ToolCallConfirmationDetails } from '../../tools/tools.js';
import type { FinishReason } from '@google/genai';

describe('GeminiEventMapper', () => {
  const mapper = new GeminiEventMapper();

  describe('toLlmEvent - Content Events', () => {
    it('should map Content -> TextDelta', () => {
      const geminiEvent: ServerGeminiContentEvent = {
        type: GeminiEventType.Content,
        value: 'Hello, World!',
        traceId: 'trace-123',
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.TextDelta);
      expect(llmEvent).toMatchObject({
        type: LlmEventType.TextDelta,
        text: 'Hello, World!',
        traceId: 'trace-123',
      });
    });

    it('should map Thought -> ThoughtDelta', () => {
      const geminiEvent: ServerGeminiThoughtEvent = {
        type: GeminiEventType.Thought,
        value: {
          subject: 'Analysis',
          description: 'Thinking about the problem...',
        },
        traceId: 'trace-456',
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.ThoughtDelta);
      expect(llmEvent).toMatchObject({
        type: LlmEventType.ThoughtDelta,
        thought: 'Thinking about the problem...',
        traceId: 'trace-456',
      });
    });
  });

  describe('toLlmEvent - Tool Events', () => {
    it('should map ToolCallRequest', () => {
      const geminiEvent: ServerGeminiToolCallRequestEvent = {
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'call-1',
          name: 'read_file',
          args: { path: '/tmp/test.txt' },
          isClientInitiated: false,
          prompt_id: 'prompt-1',
          traceId: 'trace-789',
        },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.ToolCallRequest);
      expect(llmEvent).toMatchObject({
        type: LlmEventType.ToolCallRequest,
        callId: 'call-1',
        name: 'read_file',
        args: { path: '/tmp/test.txt' },
        isClientInitiated: false,
        promptId: 'prompt-1',
      });
    });

    it('should map ToolCallResponse', () => {
      const geminiEvent: ServerGeminiToolCallResponseEvent = {
        type: GeminiEventType.ToolCallResponse,
        value: {
          callId: 'call-1',
          responseParts: [{ text: 'file contents here' }],
          resultDisplay: undefined,
          error: undefined,
          errorType: undefined,
        } as unknown as ToolCallResponseInfo,
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.ToolCallResponse);
      expect(llmEvent).toMatchObject({
        type: LlmEventType.ToolCallResponse,
        callId: 'call-1',
      });
    });

    it('should map ToolCallConfirmation', () => {
      const geminiEvent: ServerGeminiToolCallConfirmationEvent = {
        type: GeminiEventType.ToolCallConfirmation,
        value: {
          request: {
            callId: 'call-1',
            name: 'write_file',
            args: {},
            isClientInitiated: false,
            prompt_id: 'p1',
            traceId: 't1',
          },
          details: {
            type: 'execute',
            confirmed: true,
          } as unknown as ToolCallConfirmationDetails,
        },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.ToolCallConfirmation);
      expect(llmEvent).toMatchObject({
        type: LlmEventType.ToolCallConfirmation,
        callId: 'call-1',
        confirmed: true,
      });
    });
  });

  describe('toLlmEvent - Control Events', () => {
    it('should map Error', () => {
      const geminiEvent: ServerGeminiErrorEvent = {
        type: GeminiEventType.Error,
        value: {
          error: { message: 'Something went wrong', status: 500 },
        },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.Error);
      expect(llmEvent).toMatchObject({
        type: LlmEventType.Error,
        error: 'Something went wrong',
        code: '500',
      });
    });

    it('should map Finished', () => {
      const geminiEvent: ServerGeminiFinishedEvent = {
        type: GeminiEventType.Finished,
        value: {
          reason: 'STOP' as unknown as FinishReason,
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 50,
            totalTokenCount: 150,
          },
        },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.Finished);
      expect(llmEvent).toMatchObject({
        type: LlmEventType.Finished,
        finishReason: 'end_turn',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });
    });

    it('should map UserCancelled', () => {
      const geminiEvent: ServerGeminiUserCancelledEvent = {
        type: GeminiEventType.UserCancelled,
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.UserCancelled);
    });

    it('should map Retry', () => {
      const geminiEvent: ServerGeminiRetryEvent = {
        type: GeminiEventType.Retry,
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.Retry);
    });
  });

  describe('toLlmEvent - Session Events', () => {
    it('should map ChatCompressed', () => {
      const geminiEvent: ServerGeminiChatCompressedEvent = {
        type: GeminiEventType.ChatCompressed,
        value: {
          originalTokenCount: 10000,
          newTokenCount: 2000,
          compressionStatus: CompressionStatus.COMPRESSED,
        },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.ChatCompressed);
      expect(llmEvent).toMatchObject({
        type: LlmEventType.ChatCompressed,
        originalTokens: 10000,
        compressedTokens: 2000,
      });
    });

    it('should map LoopDetected', () => {
      const geminiEvent: ServerGeminiLoopDetectedEvent = {
        type: GeminiEventType.LoopDetected,
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.LoopDetected);
    });

    it('should map MaxSessionTurns', () => {
      const geminiEvent: ServerGeminiMaxSessionTurnsEvent = {
        type: GeminiEventType.MaxSessionTurns,
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.MaxSessionTurns);
    });

    it('should map ContextWindowWillOverflow', () => {
      const geminiEvent: ServerGeminiContextWindowWillOverflowEvent = {
        type: GeminiEventType.ContextWindowWillOverflow,
        value: {
          estimatedRequestTokenCount: 95000,
          remainingTokenCount: 5000,
        },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.ContextWindowOverflow);
      expect(llmEvent).toMatchObject({
        type: LlmEventType.ContextWindowOverflow,
        currentTokens: 95000,
        maxTokens: 100000, // estimated + remaining
      });
    });
  });

  describe('toLlmEvent - Metadata Events', () => {
    it('should map InvalidStream', () => {
      const geminiEvent: ServerGeminiInvalidStreamEvent = {
        type: GeminiEventType.InvalidStream,
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.InvalidStream);
    });

    it('should map ModelInfo', () => {
      const geminiEvent: ServerGeminiModelInfoEvent = {
        type: GeminiEventType.ModelInfo,
        value: 'gemini-2.0-flash',
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.ModelInfo);
      expect(llmEvent).toMatchObject({
        type: LlmEventType.ModelInfo,
        modelName: 'gemini-2.0-flash',
      });
    });

    it('should map Citation', () => {
      const geminiEvent: ServerGeminiCitationEvent = {
        type: GeminiEventType.Citation,
        value: 'https://example.com',
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.Citation);
    });
  });

  describe('toLlmEvent - Agent Events', () => {
    it('should map AgentExecutionStopped', () => {
      const geminiEvent: ServerGeminiAgentExecutionStoppedEvent = {
        type: GeminiEventType.AgentExecutionStopped,
        value: { reason: 'User requested stop' },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.AgentStopped);
      expect(llmEvent).toMatchObject({
        type: LlmEventType.AgentStopped,
        reason: 'User requested stop',
      });
    });

    it('should map AgentExecutionBlocked', () => {
      const geminiEvent: ServerGeminiAgentExecutionBlockedEvent = {
        type: GeminiEventType.AgentExecutionBlocked,
        value: { reason: 'Safety filter triggered' },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent.type).toBe(LlmEventType.AgentBlocked);
      expect(llmEvent).toMatchObject({
        type: LlmEventType.AgentBlocked,
        reason: 'Safety filter triggered',
      });
    });
  });

  describe('toGeminiEvent - reverse mapping', () => {
    it('should reverse map TextDelta -> Content', () => {
      const llmEvent: LlmEvent = {
        type: LlmEventType.TextDelta,
        text: 'Hello',
        traceId: 'trace-1',
      };

      const geminiEvent = mapper.toGeminiEvent(llmEvent);

      expect(geminiEvent.type).toBe(GeminiEventType.Content);
      expect(geminiEvent).toMatchObject({
        type: GeminiEventType.Content,
        value: 'Hello',
        traceId: 'trace-1',
      });
    });

    it('should reverse map Error -> Error', () => {
      const llmEvent: LlmEvent = {
        type: LlmEventType.Error,
        error: 'Test error',
        code: '400',
      };

      const geminiEvent = mapper.toGeminiEvent(llmEvent);

      expect(geminiEvent.type).toBe(GeminiEventType.Error);
    });

    it('should reverse map Finished -> Finished with usage', () => {
      const llmEvent: LlmEvent = {
        type: LlmEventType.Finished,
        finishReason: 'end_turn',
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      };

      const geminiEvent = mapper.toGeminiEvent(llmEvent);

      expect(geminiEvent.type).toBe(GeminiEventType.Finished);
      expect(geminiEvent).toMatchObject({
        type: GeminiEventType.Finished,
        value: {
          reason: 'STOP',
          usageMetadata: {
            promptTokenCount: 100,
            candidatesTokenCount: 50,
            totalTokenCount: 150,
          },
        },
      });
    });

    it('should reverse map ThoughtDelta -> Thought', () => {
      const llmEvent: LlmEvent = {
        type: LlmEventType.ThoughtDelta,
        thought: 'Thinking...',
        traceId: 'trace-t',
      };

      const geminiEvent = mapper.toGeminiEvent(llmEvent);

      expect(geminiEvent.type).toBe(GeminiEventType.Thought);
      expect(geminiEvent).toMatchObject({
        type: GeminiEventType.Thought,
        value: { subject: 'Thought', description: 'Thinking...' },
        traceId: 'trace-t',
      });
    });

    it('should throw for unsupported LlmEvent types in reverse mapping', () => {
      const llmEvent: LlmEvent = {
        type: LlmEventType.ChatCompressed,
        originalTokens: 10000,
        compressedTokens: 2000,
      };

      expect(() => mapper.toGeminiEvent(llmEvent)).toThrow(
        "Cannot convert LlmEvent type 'chat_compressed' to Gemini event",
      );
    });
  });

  describe('toLlmEvent - Edge Cases', () => {
    it('should map Finished without usageMetadata', () => {
      const geminiEvent: ServerGeminiFinishedEvent = {
        type: GeminiEventType.Finished,
        value: {
          reason: 'MAX_TOKENS' as unknown as FinishReason,
          usageMetadata: undefined,
        },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent).toMatchObject({
        type: LlmEventType.Finished,
        finishReason: 'max_tokens',
        usage: undefined,
      });
    });

    it('should map SAFETY FinishReason to content_filter', () => {
      const geminiEvent: ServerGeminiFinishedEvent = {
        type: GeminiEventType.Finished,
        value: {
          reason: 'SAFETY' as unknown as FinishReason,
          usageMetadata: undefined,
        },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent).toMatchObject({
        type: LlmEventType.Finished,
        finishReason: 'content_filter',
      });
    });

    it('should map Error without status code', () => {
      const geminiEvent: ServerGeminiErrorEvent = {
        type: GeminiEventType.Error,
        value: {
          error: { message: 'Network error' },
        },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent).toMatchObject({
        type: LlmEventType.Error,
        error: 'Network error',
        code: undefined,
      });
    });

    it('should map ChatCompressed with null value', () => {
      const geminiEvent: ServerGeminiChatCompressedEvent = {
        type: GeminiEventType.ChatCompressed,
        value: null,
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent).toMatchObject({
        type: LlmEventType.ChatCompressed,
        originalTokens: undefined,
        compressedTokens: undefined,
      });
    });

    it('should map ToolCallResponse with error', () => {
      const geminiEvent: ServerGeminiToolCallResponseEvent = {
        type: GeminiEventType.ToolCallResponse,
        value: {
          callId: 'call-err',
          responseParts: [],
          resultDisplay: undefined,
          error: new Error('Tool execution failed'),
          errorType: undefined,
        } as unknown as ToolCallResponseInfo,
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent).toMatchObject({
        type: LlmEventType.ToolCallResponse,
        callId: 'call-err',
        isError: true,
        result: 'Tool execution failed',
      });
    });

    it('should map unknown GeminiEventType to Error', () => {
      const unknownEvent = {
        type: 'unknown_event_type',
      } as unknown as import('./types.js').ServerGeminiStreamEvent;

      const llmEvent = mapper.toLlmEvent(unknownEvent);

      expect(llmEvent.type).toBe(LlmEventType.Error);
    });
  });

  // =========================================================================
  // M2.2.4: Error classification — isRetryable
  // =========================================================================
  describe('M2.2.4 - Error isRetryable classification', () => {
    it('should set isRetryable to true for 429 (rate limit)', () => {
      const geminiEvent: ServerGeminiErrorEvent = {
        type: GeminiEventType.Error,
        value: { error: { message: 'Rate limit exceeded', status: 429 } },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent).toMatchObject({
        type: LlmEventType.Error,
        error: 'Rate limit exceeded',
        code: '429',
        isRetryable: true,
      });
    });

    it('should set isRetryable to true for 500 (server error)', () => {
      const geminiEvent: ServerGeminiErrorEvent = {
        type: GeminiEventType.Error,
        value: { error: { message: 'Internal server error', status: 500 } },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent).toMatchObject({
        type: LlmEventType.Error,
        isRetryable: true,
      });
    });

    it('should set isRetryable to false for 401 (auth error)', () => {
      const geminiEvent: ServerGeminiErrorEvent = {
        type: GeminiEventType.Error,
        value: { error: { message: 'Unauthorized', status: 401 } },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent).toMatchObject({
        type: LlmEventType.Error,
        isRetryable: false,
      });
    });

    it('should set isRetryable to false when status is undefined', () => {
      const geminiEvent: ServerGeminiErrorEvent = {
        type: GeminiEventType.Error,
        value: { error: { message: 'Unknown error' } },
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent).toMatchObject({
        type: LlmEventType.Error,
        isRetryable: false,
      });
    });
  });

  // =========================================================================
  // M2.2.4: InvalidStream reason propagation
  // =========================================================================
  describe('M2.2.4 - InvalidStream reason', () => {
    it('should propagate reason when provided', () => {
      const geminiEvent: ServerGeminiInvalidStreamEvent = {
        type: GeminiEventType.InvalidStream,
        reason: 'NO_FINISH_REASON',
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent).toMatchObject({
        type: LlmEventType.InvalidStream,
        reason: 'NO_FINISH_REASON',
      });
    });

    it('should return undefined reason when not provided', () => {
      const geminiEvent: ServerGeminiInvalidStreamEvent = {
        type: GeminiEventType.InvalidStream,
      };

      const llmEvent = mapper.toLlmEvent(geminiEvent);

      expect(llmEvent).toMatchObject({
        type: LlmEventType.InvalidStream,
      });
      expect(
        (llmEvent as { type: LlmEventType.InvalidStream; reason?: string })
          .reason,
      ).toBeUndefined();
    });
  });
});
