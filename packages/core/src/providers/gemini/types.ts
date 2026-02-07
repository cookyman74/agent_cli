/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Gemini-specific event types and interfaces.
 * These types are used by the GeminiChat and Turn classes for streaming events.
 */

import type {
  FinishReason,
  GenerateContentResponseUsageMetadata,
} from '@google/genai';
import type { ThoughtSummary } from '../../utils/thoughtUtils.js';
import type {
  ToolCallRequestInfo,
  ToolCallResponseInfo,
} from '../../scheduler/types.js';
import type { ToolCallConfirmationDetails } from '../../tools/tools.js';

/**
 * Enum representing all possible event types in a Gemini stream.
 * Maps to LlmStreamEventType for provider-agnostic handling.
 */
export enum GeminiEventType {
  Content = 'content',
  ToolCallRequest = 'tool_call_request',
  ToolCallResponse = 'tool_call_response',
  ToolCallConfirmation = 'tool_call_confirmation',
  UserCancelled = 'user_cancelled',
  Error = 'error',
  ChatCompressed = 'chat_compressed',
  Thought = 'thought',
  MaxSessionTurns = 'max_session_turns',
  Finished = 'finished',
  LoopDetected = 'loop_detected',
  Citation = 'citation',
  Retry = 'retry',
  ContextWindowWillOverflow = 'context_window_will_overflow',
  InvalidStream = 'invalid_stream',
  ModelInfo = 'model_info',
  AgentExecutionStopped = 'agent_execution_stopped',
  AgentExecutionBlocked = 'agent_execution_blocked',
}

// ============================================================
// Event Types
// ============================================================

export type ServerGeminiRetryEvent = {
  type: GeminiEventType.Retry;
};

export type ServerGeminiAgentExecutionStoppedEvent = {
  type: GeminiEventType.AgentExecutionStopped;
  value: {
    reason: string;
    systemMessage?: string;
    contextCleared?: boolean;
  };
};

export type ServerGeminiAgentExecutionBlockedEvent = {
  type: GeminiEventType.AgentExecutionBlocked;
  value: {
    reason: string;
    systemMessage?: string;
    contextCleared?: boolean;
  };
};

export type ServerGeminiContextWindowWillOverflowEvent = {
  type: GeminiEventType.ContextWindowWillOverflow;
  value: {
    estimatedRequestTokenCount: number;
    remainingTokenCount: number;
  };
};

export type ServerGeminiInvalidStreamEvent = {
  type: GeminiEventType.InvalidStream;
};

export type ServerGeminiModelInfoEvent = {
  type: GeminiEventType.ModelInfo;
  value: string;
};

export type ServerGeminiContentEvent = {
  type: GeminiEventType.Content;
  value: string;
  traceId?: string;
};

export type ServerGeminiThoughtEvent = {
  type: GeminiEventType.Thought;
  value: ThoughtSummary;
  traceId?: string;
};

export type ServerGeminiToolCallRequestEvent = {
  type: GeminiEventType.ToolCallRequest;
  value: ToolCallRequestInfo;
};

export type ServerGeminiToolCallResponseEvent = {
  type: GeminiEventType.ToolCallResponse;
  value: ToolCallResponseInfo;
};

export type ServerGeminiToolCallConfirmationEvent = {
  type: GeminiEventType.ToolCallConfirmation;
  value: ServerToolCallConfirmationDetails;
};

export type ServerGeminiUserCancelledEvent = {
  type: GeminiEventType.UserCancelled;
};

export type ServerGeminiErrorEvent = {
  type: GeminiEventType.Error;
  value: GeminiErrorEventValue;
};

export type ServerGeminiChatCompressedEvent = {
  type: GeminiEventType.ChatCompressed;
  value: ChatCompressionInfo | null;
};

export type ServerGeminiMaxSessionTurnsEvent = {
  type: GeminiEventType.MaxSessionTurns;
};

export type ServerGeminiFinishedEvent = {
  type: GeminiEventType.Finished;
  value: GeminiFinishedEventValue;
};

export type ServerGeminiLoopDetectedEvent = {
  type: GeminiEventType.LoopDetected;
};

export type ServerGeminiCitationEvent = {
  type: GeminiEventType.Citation;
  value: string;
};

/**
 * Union type of all possible Gemini stream events.
 */
export type ServerGeminiStreamEvent =
  | ServerGeminiChatCompressedEvent
  | ServerGeminiCitationEvent
  | ServerGeminiContentEvent
  | ServerGeminiErrorEvent
  | ServerGeminiFinishedEvent
  | ServerGeminiLoopDetectedEvent
  | ServerGeminiMaxSessionTurnsEvent
  | ServerGeminiThoughtEvent
  | ServerGeminiToolCallConfirmationEvent
  | ServerGeminiToolCallRequestEvent
  | ServerGeminiToolCallResponseEvent
  | ServerGeminiUserCancelledEvent
  | ServerGeminiRetryEvent
  | ServerGeminiContextWindowWillOverflowEvent
  | ServerGeminiInvalidStreamEvent
  | ServerGeminiModelInfoEvent
  | ServerGeminiAgentExecutionStoppedEvent
  | ServerGeminiAgentExecutionBlockedEvent;

// ============================================================
// Supporting Interfaces
// ============================================================

/**
 * Structure for error event values.
 */
export interface StructuredError {
  message: string;
  status?: number;
}

export interface GeminiErrorEventValue {
  error: StructuredError;
}

export interface GeminiFinishedEventValue {
  reason: FinishReason | undefined;
  usageMetadata: GenerateContentResponseUsageMetadata | undefined;
}

export interface ServerToolCallConfirmationDetails {
  request: ToolCallRequestInfo;
  details: ToolCallConfirmationDetails;
}

// ============================================================
// Compression Types
// ============================================================

export enum CompressionStatus {
  /** The compression was successful */
  COMPRESSED = 1,

  /** The compression failed due to the compression inflating the token count */
  COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,

  /** The compression failed due to an error counting tokens */
  COMPRESSION_FAILED_TOKEN_COUNT_ERROR,

  /** The compression failed because the summary was empty */
  COMPRESSION_FAILED_EMPTY_SUMMARY,

  /** The compression was not necessary and no action was taken */
  NOOP,
}

export interface ChatCompressionInfo {
  originalTokenCount: number;
  newTokenCount: number;
  compressionStatus: CompressionStatus;
}
