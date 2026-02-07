/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Event mapper for converting between Gemini-specific events and
 * provider-independent LLM events.
 *
 * This mapper enables the core CLI logic to work with unified event types
 * while allowing Gemini-specific handling where needed.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.3
 */

import {
  GeminiEventType,
  type ServerGeminiStreamEvent,
  type ServerGeminiContentEvent,
  type ServerGeminiThoughtEvent,
  type ServerGeminiToolCallRequestEvent,
  type ServerGeminiToolCallResponseEvent,
  type ServerGeminiToolCallConfirmationEvent,
  type ServerGeminiErrorEvent,
  type ServerGeminiFinishedEvent,
  type ServerGeminiChatCompressedEvent,
  type ServerGeminiContextWindowWillOverflowEvent,
  type ServerGeminiModelInfoEvent,
  type ServerGeminiAgentExecutionStoppedEvent,
  type ServerGeminiAgentExecutionBlockedEvent,
  type ServerGeminiCitationEvent,
  type ServerGeminiInvalidStreamEvent,
} from './types.js';

import { classifyGeminiError } from './errorClassifier.js';

import {
  LlmEventType,
  type LlmEvent,
  type LlmTextDeltaEvent,
  type LlmThoughtDeltaEvent,
  type LlmToolCallRequestEvent,
  type LlmToolCallResponseEvent,
  type LlmToolCallConfirmationEvent,
  type LlmFinishedEvent,
  type LlmErrorEvent,
  type LlmUserCancelledEvent,
  type LlmRetryEvent,
  type LlmChatCompressedEvent,
  type LlmLoopDetectedEvent,
  type LlmMaxSessionTurnsEvent,
  type LlmContextWindowOverflowEvent,
  type LlmInvalidStreamEvent,
  type LlmModelInfoEvent,
  type LlmAgentStoppedEvent,
  type LlmAgentBlockedEvent,
  type LlmCitationEvent,
  type LlmFinishReason,
} from '../events.js';

import type { FinishReason } from '@google/genai';

/**
 * Maps Gemini-specific events to provider-independent LLM events and vice versa.
 */
export class GeminiEventMapper {
  /**
   * Convert a Gemini stream event to a provider-independent LLM event.
   */
  toLlmEvent(geminiEvent: ServerGeminiStreamEvent): LlmEvent {
    switch (geminiEvent.type) {
      case GeminiEventType.Content:
        return this.mapContentEvent(geminiEvent);

      case GeminiEventType.Thought:
        return this.mapThoughtEvent(geminiEvent);

      case GeminiEventType.ToolCallRequest:
        return this.mapToolCallRequestEvent(geminiEvent);

      case GeminiEventType.ToolCallResponse:
        return this.mapToolCallResponseEvent(geminiEvent);

      case GeminiEventType.ToolCallConfirmation:
        return this.mapToolCallConfirmationEvent(geminiEvent);

      case GeminiEventType.Error:
        return this.mapErrorEvent(geminiEvent);

      case GeminiEventType.Finished:
        return this.mapFinishedEvent(geminiEvent);

      case GeminiEventType.UserCancelled:
        return this.mapUserCancelledEvent();

      case GeminiEventType.Retry:
        return this.mapRetryEvent();

      case GeminiEventType.ChatCompressed:
        return this.mapChatCompressedEvent(geminiEvent);

      case GeminiEventType.LoopDetected:
        return this.mapLoopDetectedEvent();

      case GeminiEventType.MaxSessionTurns:
        return this.mapMaxSessionTurnsEvent();

      case GeminiEventType.ContextWindowWillOverflow:
        return this.mapContextWindowOverflowEvent(geminiEvent);

      case GeminiEventType.InvalidStream:
        return this.mapInvalidStreamEvent(geminiEvent);

      case GeminiEventType.ModelInfo:
        return this.mapModelInfoEvent(geminiEvent);

      case GeminiEventType.AgentExecutionStopped:
        return this.mapAgentStoppedEvent(geminiEvent);

      case GeminiEventType.AgentExecutionBlocked:
        return this.mapAgentBlockedEvent(geminiEvent);

      case GeminiEventType.Citation:
        return this.mapCitationEvent(geminiEvent);

      default:
        // For unknown events, return a generic error event
        return {
          type: LlmEventType.Error,
          error: `Unknown Gemini event type: ${(geminiEvent as ServerGeminiStreamEvent).type}`,
        };
    }
  }

  /**
   * Convert a provider-independent LLM event to a Gemini stream event.
   * Used for backward compatibility with existing Gemini-specific code.
   */
  toGeminiEvent(llmEvent: LlmEvent): ServerGeminiStreamEvent {
    switch (llmEvent.type) {
      case LlmEventType.TextDelta:
        return {
          type: GeminiEventType.Content,
          value: llmEvent.text,
          traceId: llmEvent.traceId,
        };

      case LlmEventType.ThoughtDelta:
        return {
          type: GeminiEventType.Thought,
          value: { subject: 'Thought', description: llmEvent.thought },
          traceId: llmEvent.traceId,
        };

      case LlmEventType.Error:
        return {
          type: GeminiEventType.Error,
          value: {
            error: {
              message:
                typeof llmEvent.error === 'string'
                  ? llmEvent.error
                  : llmEvent.error.message,
              status: llmEvent.code ? parseInt(llmEvent.code, 10) : undefined,
            },
          },
        };

      case LlmEventType.UserCancelled:
        return { type: GeminiEventType.UserCancelled };

      case LlmEventType.Retry:
        return { type: GeminiEventType.Retry };

      case LlmEventType.LoopDetected:
        return { type: GeminiEventType.LoopDetected };

      case LlmEventType.MaxSessionTurns:
        return { type: GeminiEventType.MaxSessionTurns };

      case LlmEventType.InvalidStream:
        return { type: GeminiEventType.InvalidStream };

      case LlmEventType.Finished:
        return {
          type: GeminiEventType.Finished,
          value: {
            reason: this.toGeminiFinishReason(llmEvent.finishReason),
            usageMetadata: llmEvent.usage
              ? {
                  promptTokenCount: llmEvent.usage.promptTokens,
                  candidatesTokenCount: llmEvent.usage.completionTokens,
                  totalTokenCount: llmEvent.usage.totalTokens,
                }
              : undefined,
          },
        };

      case LlmEventType.AgentStopped:
        return {
          type: GeminiEventType.AgentExecutionStopped,
          value: { reason: llmEvent.reason || '' },
        };

      case LlmEventType.AgentBlocked:
        return {
          type: GeminiEventType.AgentExecutionBlocked,
          value: { reason: llmEvent.reason || '' },
        };

      case LlmEventType.ModelInfo:
        return {
          type: GeminiEventType.ModelInfo,
          value: llmEvent.modelName,
        };

      default:
        // Reverse mapping is intentionally limited to essential event types.
        // Supported: TextDelta, ThoughtDelta, Error, UserCancelled, Retry,
        // LoopDetected, MaxSessionTurns, InvalidStream, Finished, AgentStopped,
        // AgentBlocked, ModelInfo
        // Not supported: ToolCallRequest/Response/Confirmation (require context enrichment)
        throw new Error(
          `Cannot convert LlmEvent type '${llmEvent.type}' to Gemini event. ` +
            `This event type is not supported for reverse mapping.`,
        );
    }
  }

  // ============================================================
  // Private mapping methods
  // ============================================================

  private mapContentEvent(event: ServerGeminiContentEvent): LlmTextDeltaEvent {
    return {
      type: LlmEventType.TextDelta,
      text: event.value,
      traceId: event.traceId,
    };
  }

  private mapThoughtEvent(
    event: ServerGeminiThoughtEvent,
  ): LlmThoughtDeltaEvent {
    return {
      type: LlmEventType.ThoughtDelta,
      thought: event.value.description,
      traceId: event.traceId,
      metadata: { subject: event.value.subject },
    };
  }

  private mapToolCallRequestEvent(
    event: ServerGeminiToolCallRequestEvent,
  ): LlmToolCallRequestEvent {
    return {
      type: LlmEventType.ToolCallRequest,
      callId: event.value.callId,
      name: event.value.name,
      args: event.value.args,
      isClientInitiated: event.value.isClientInitiated,
      promptId: event.value.prompt_id,
      traceId: event.value.traceId,
    };
  }

  private mapToolCallResponseEvent(
    event: ServerGeminiToolCallResponseEvent,
  ): LlmToolCallResponseEvent {
    // Extract result from responseParts (preserve original structure for consumers)
    // Note: name is extracted from request context if available, otherwise from parts
    const result = event.value.error
      ? event.value.error.message
      : event.value.responseParts; // Preserve original Part[] structure
    return {
      type: LlmEventType.ToolCallResponse,
      callId: event.value.callId,
      name: '', // Will be enriched by caller with ToolCallRequestInfo.name if needed
      result,
      isError: !!event.value.error,
    };
  }

  private mapToolCallConfirmationEvent(
    event: ServerGeminiToolCallConfirmationEvent,
  ): LlmToolCallConfirmationEvent {
    // Check for confirmation in different detail types
    // Note: ToolExecuteConfirmationDetails doesn't have 'confirmed' field,
    // it uses onConfirm callback. Default to undefined (unknown) to avoid
    // false positives in pending/cancelled flows.
    const details = event.value.details;
    const confirmed =
      'confirmed' in details
        ? (details as { confirmed: boolean }).confirmed
        : undefined;
    return {
      type: LlmEventType.ToolCallConfirmation,
      callId: event.value.request.callId,
      confirmed: confirmed ?? false, // Treat unknown as not-confirmed for safety
    };
  }

  private mapErrorEvent(event: ServerGeminiErrorEvent): LlmErrorEvent {
    const { isRetryable } = classifyGeminiError(event.value.error.status);
    return {
      type: LlmEventType.Error,
      error: event.value.error.message,
      code: event.value.error.status?.toString(),
      isRetryable,
    };
  }

  private mapFinishedEvent(event: ServerGeminiFinishedEvent): LlmFinishedEvent {
    return {
      type: LlmEventType.Finished,
      finishReason: this.mapFinishReason(event.value.reason),
      usage: event.value.usageMetadata
        ? {
            promptTokens: event.value.usageMetadata.promptTokenCount || 0,
            completionTokens:
              event.value.usageMetadata.candidatesTokenCount || 0,
            totalTokens: event.value.usageMetadata.totalTokenCount || 0,
          }
        : undefined,
    };
  }

  private mapUserCancelledEvent(): LlmUserCancelledEvent {
    return { type: LlmEventType.UserCancelled };
  }

  private mapRetryEvent(): LlmRetryEvent {
    return { type: LlmEventType.Retry };
  }

  private mapChatCompressedEvent(
    event: ServerGeminiChatCompressedEvent,
  ): LlmChatCompressedEvent {
    return {
      type: LlmEventType.ChatCompressed,
      originalTokens: event.value?.originalTokenCount,
      compressedTokens: event.value?.newTokenCount,
    };
  }

  private mapLoopDetectedEvent(): LlmLoopDetectedEvent {
    return { type: LlmEventType.LoopDetected };
  }

  private mapMaxSessionTurnsEvent(): LlmMaxSessionTurnsEvent {
    return { type: LlmEventType.MaxSessionTurns };
  }

  private mapContextWindowOverflowEvent(
    event: ServerGeminiContextWindowWillOverflowEvent,
  ): LlmContextWindowOverflowEvent {
    return {
      type: LlmEventType.ContextWindowOverflow,
      currentTokens: event.value.estimatedRequestTokenCount,
      maxTokens:
        event.value.estimatedRequestTokenCount +
        event.value.remainingTokenCount,
    };
  }

  private mapInvalidStreamEvent(
    event: ServerGeminiInvalidStreamEvent,
  ): LlmInvalidStreamEvent {
    // TODO(M2.3): turn.ts에서 InvalidStreamError.type을 reason으로 전달하도록 변경
    return {
      type: LlmEventType.InvalidStream,
      reason: event.reason,
    };
  }

  private mapModelInfoEvent(
    event: ServerGeminiModelInfoEvent,
  ): LlmModelInfoEvent {
    return {
      type: LlmEventType.ModelInfo,
      modelName: event.value,
    };
  }

  private mapAgentStoppedEvent(
    event: ServerGeminiAgentExecutionStoppedEvent,
  ): LlmAgentStoppedEvent {
    return {
      type: LlmEventType.AgentStopped,
      reason: event.value.reason,
      systemMessage: event.value.systemMessage,
      contextCleared: event.value.contextCleared,
    };
  }

  private mapAgentBlockedEvent(
    event: ServerGeminiAgentExecutionBlockedEvent,
  ): LlmAgentBlockedEvent {
    return {
      type: LlmEventType.AgentBlocked,
      reason: event.value.reason,
      systemMessage: event.value.systemMessage,
      contextCleared: event.value.contextCleared,
    };
  }

  private mapCitationEvent(event: ServerGeminiCitationEvent): LlmCitationEvent {
    // Citation value is just a URL string in Gemini, no position info available.
    // Omit startIndex/endIndex to avoid misleading consumers.
    return {
      type: LlmEventType.Citation,
      citations: [{ url: event.value }],
    };
  }

  /**
   * Map Gemini FinishReason to provider-independent LlmFinishReason.
   */
  private mapFinishReason(reason: FinishReason | undefined): LlmFinishReason {
    if (!reason) return 'unknown';

    switch (reason) {
      case 'STOP':
        return 'end_turn';
      case 'MAX_TOKENS':
        return 'max_tokens';
      case 'SAFETY':
        return 'content_filter';
      case 'RECITATION':
        return 'content_filter';
      case 'BLOCKLIST':
        return 'content_filter';
      case 'PROHIBITED_CONTENT':
        return 'content_filter';
      case 'SPII':
        return 'content_filter';
      default:
        return 'unknown';
    }
  }

  /**
   * Reverse map LlmFinishReason to Gemini FinishReason.
   */
  private toGeminiFinishReason(
    reason: LlmFinishReason | undefined,
  ): FinishReason | undefined {
    if (!reason) return undefined;

    switch (reason) {
      case 'end_turn':
        return 'STOP' as FinishReason;
      case 'max_tokens':
        return 'MAX_TOKENS' as FinishReason;
      case 'content_filter':
        return 'SAFETY' as FinishReason;
      default:
        return undefined;
    }
  }
}
