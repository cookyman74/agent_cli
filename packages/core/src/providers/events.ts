/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider-independent stream event types.
 *
 * This module defines the unified event system that maps to provider-specific
 * events (GeminiEventType, Anthropic events, OpenAI events, etc.)
 *
 * @see docs/ai_adapter/event-mapping-matrix.md
 * @see docs/ai_adapter/03-technical-design.md §3.1
 */

import type { LlmTokenUsage } from './types.js';

// ============================================================================
// Event Type Enum
// ============================================================================

/**
 * Unified stream event types for all LLM providers.
 *
 * Mapping from GeminiEventType (18 events) + MessageEnd = 19 total:
 *
 * | GeminiEventType              | LlmEventType              | Notes           |
 * |------------------------------|---------------------------|-----------------|
 * | Content                      | TextDelta                 | Common          |
 * | ToolCallRequest              | ToolCallRequest           | Common          |
 * | ToolCallResponse             | ToolCallResponse          | Common          |
 * | ToolCallConfirmation         | ToolCallConfirmation      | Common          |
 * | UserCancelled                | UserCancelled             | Common          |
 * | Error                        | Error                     | Common          |
 * | ChatCompressed               | ChatCompressed            | Gemini-specific |
 * | Thought                      | ThoughtDelta              | Common (Claude) |
 * | MaxSessionTurns              | MaxSessionTurns           | Common          |
 * | Finished                     | Finished                  | Common          |
 * | LoopDetected                 | LoopDetected              | Common          |
 * | Citation                     | Citation                  | Gemini-specific |
 * | Retry                        | Retry                     | Common          |
 * | ContextWindowWillOverflow    | ContextWindowOverflow     | Common          |
 * | InvalidStream                | InvalidStream             | Common          |
 * | ModelInfo                    | ModelInfo                 | Common          |
 * | AgentExecutionStopped        | AgentStopped              | Common          |
 * | AgentExecutionBlocked        | AgentBlocked              | Common          |
 */
export enum LlmEventType {
  // === Text/Content Events ===
  /** Text content delta (streaming text chunk) */
  TextDelta = 'text_delta',

  /** Thought/reasoning delta (extended thinking) */
  ThoughtDelta = 'thought_delta',

  // === Tool Events ===
  /** Tool call request from the model */
  ToolCallRequest = 'tool_call_request',

  /** Tool call response (result) */
  ToolCallResponse = 'tool_call_response',

  /** Tool call confirmation (user approval) */
  ToolCallConfirmation = 'tool_call_confirmation',

  // === Completion Events ===
  /** Generation finished normally */
  Finished = 'finished',

  /** Message end with usage info */
  MessageEnd = 'message_end',

  // === Error/Control Events ===
  /** Error occurred */
  Error = 'error',

  /** User cancelled the operation */
  UserCancelled = 'user_cancelled',

  /** Retry signal */
  Retry = 'retry',

  /** Invalid stream detected */
  InvalidStream = 'invalid_stream',

  // === Session/Context Events ===
  /** Context window will overflow */
  ContextWindowOverflow = 'context_window_overflow',

  /** Maximum session turns reached */
  MaxSessionTurns = 'max_session_turns',

  /** Chat history compressed */
  ChatCompressed = 'chat_compressed',

  /** Loop detected in agent execution */
  LoopDetected = 'loop_detected',

  // === Agent Control Events ===
  /** Agent execution stopped */
  AgentStopped = 'agent_stopped',

  /** Agent execution blocked */
  AgentBlocked = 'agent_blocked',

  // === Metadata Events ===
  /** Model information */
  ModelInfo = 'model_info',

  /** Citation/reference information */
  Citation = 'citation',
}

// ============================================================================
// Event Payloads
// ============================================================================

/**
 * Base event interface with common fields.
 */
export interface LlmBaseEvent {
  type: LlmEventType;
  traceId?: string;
}

/**
 * Text content delta event.
 */
export interface LlmTextDeltaEvent extends LlmBaseEvent {
  type: LlmEventType.TextDelta;
  text: string;
}

/**
 * Thought/reasoning delta event.
 */
export interface LlmThoughtDeltaEvent extends LlmBaseEvent {
  type: LlmEventType.ThoughtDelta;
  thought: string;
  metadata?: Record<string, unknown>;
}

/**
 * Tool call request event.
 */
export interface LlmToolCallRequestEvent extends LlmBaseEvent {
  type: LlmEventType.ToolCallRequest;
  callId: string;
  name: string;
  args: Record<string, unknown>;
  isClientInitiated?: boolean;
  promptId?: string;
}

/**
 * Tool call response event.
 */
export interface LlmToolCallResponseEvent extends LlmBaseEvent {
  type: LlmEventType.ToolCallResponse;
  callId: string;
  name: string;
  result: unknown; // Supports string, object, or Part[] from Gemini
  isError?: boolean;
}

/**
 * Tool call confirmation event.
 */
export interface LlmToolCallConfirmationEvent extends LlmBaseEvent {
  type: LlmEventType.ToolCallConfirmation;
  callId: string;
  confirmed: boolean;
}

/**
 * Finished event with stop reason and usage.
 */
export interface LlmFinishedEvent extends LlmBaseEvent {
  type: LlmEventType.Finished;
  finishReason?: LlmFinishReason;
  usage?: LlmTokenUsage;
}

/**
 * Message end event (stream completion).
 */
export interface LlmMessageEndEvent extends LlmBaseEvent {
  type: LlmEventType.MessageEnd;
  usage?: LlmTokenUsage;
}

/**
 * Error event.
 */
export interface LlmErrorEvent extends LlmBaseEvent {
  type: LlmEventType.Error;
  error: Error | string;
  code?: string;
  isRetryable?: boolean;
}

/**
 * User cancelled event.
 */
export interface LlmUserCancelledEvent extends LlmBaseEvent {
  type: LlmEventType.UserCancelled;
}

/**
 * Retry event.
 */
export interface LlmRetryEvent extends LlmBaseEvent {
  type: LlmEventType.Retry;
  attemptNumber?: number;
  reason?: string;
}

/**
 * Invalid stream event.
 */
export interface LlmInvalidStreamEvent extends LlmBaseEvent {
  type: LlmEventType.InvalidStream;
  reason?: string;
}

/**
 * Context window overflow event.
 */
export interface LlmContextWindowOverflowEvent extends LlmBaseEvent {
  type: LlmEventType.ContextWindowOverflow;
  currentTokens?: number;
  maxTokens?: number;
}

/**
 * Max session turns event.
 */
export interface LlmMaxSessionTurnsEvent extends LlmBaseEvent {
  type: LlmEventType.MaxSessionTurns;
  currentTurns?: number;
  maxTurns?: number;
}

/**
 * Chat compressed event (Gemini-specific).
 */
export interface LlmChatCompressedEvent extends LlmBaseEvent {
  type: LlmEventType.ChatCompressed;
  originalTokens?: number;
  compressedTokens?: number;
}

/**
 * Loop detected event.
 */
export interface LlmLoopDetectedEvent extends LlmBaseEvent {
  type: LlmEventType.LoopDetected;
  loopCount?: number;
  pattern?: string;
}

/**
 * Agent stopped event.
 */
export interface LlmAgentStoppedEvent extends LlmBaseEvent {
  type: LlmEventType.AgentStopped;
  reason?: string;
  systemMessage?: string;
  contextCleared?: boolean;
}

/**
 * Agent blocked event.
 */
export interface LlmAgentBlockedEvent extends LlmBaseEvent {
  type: LlmEventType.AgentBlocked;
  reason?: string;
  blockType?: string;
  systemMessage?: string;
  contextCleared?: boolean;
}

/**
 * Model info event.
 */
export interface LlmModelInfoEvent extends LlmBaseEvent {
  type: LlmEventType.ModelInfo;
  modelName: string;
  modelVersion?: string;
  capabilities?: Record<string, boolean>;
}

/**
 * Citation event (Gemini-specific).
 */
export interface LlmCitationEvent extends LlmBaseEvent {
  type: LlmEventType.Citation;
  citations: LlmCitation[];
}

/**
 * Citation reference.
 */
export interface LlmCitation {
  startIndex?: number;
  endIndex?: number;
  url?: string;
  title?: string;
  license?: string;
}

// ============================================================================
// Union Types
// ============================================================================

/**
 * Finish reason types.
 */
export type LlmFinishReason =
  | 'end_turn'
  | 'max_tokens'
  | 'stop_sequence'
  | 'tool_use'
  | 'content_filter'
  | 'error'
  | 'unknown';

/**
 * Union of all LLM stream events.
 */
export type LlmEvent =
  | LlmTextDeltaEvent
  | LlmThoughtDeltaEvent
  | LlmToolCallRequestEvent
  | LlmToolCallResponseEvent
  | LlmToolCallConfirmationEvent
  | LlmFinishedEvent
  | LlmMessageEndEvent
  | LlmErrorEvent
  | LlmUserCancelledEvent
  | LlmRetryEvent
  | LlmInvalidStreamEvent
  | LlmContextWindowOverflowEvent
  | LlmMaxSessionTurnsEvent
  | LlmChatCompressedEvent
  | LlmLoopDetectedEvent
  | LlmAgentStoppedEvent
  | LlmAgentBlockedEvent
  | LlmModelInfoEvent
  | LlmCitationEvent;

/**
 * Stream type for events.
 */
export type LlmEventStream = AsyncGenerator<LlmEvent, void, unknown>;

// ============================================================================
// Event Helpers
// ============================================================================

/**
 * Type guard for text delta events.
 */
export function isTextDeltaEvent(event: LlmEvent): event is LlmTextDeltaEvent {
  return event.type === LlmEventType.TextDelta;
}

/**
 * Type guard for tool call request events.
 */
export function isToolCallRequestEvent(
  event: LlmEvent,
): event is LlmToolCallRequestEvent {
  return event.type === LlmEventType.ToolCallRequest;
}

/**
 * Type guard for finished events.
 */
export function isFinishedEvent(event: LlmEvent): event is LlmFinishedEvent {
  return event.type === LlmEventType.Finished;
}

/**
 * Type guard for error events.
 */
export function isErrorEvent(event: LlmEvent): event is LlmErrorEvent {
  return event.type === LlmEventType.Error;
}

/**
 * Creates a text delta event.
 */
export function createTextDeltaEvent(
  text: string,
  traceId?: string,
): LlmTextDeltaEvent {
  return { type: LlmEventType.TextDelta, text, traceId };
}

/**
 * Creates a finished event.
 */
export function createFinishedEvent(
  finishReason?: LlmFinishReason,
  usage?: LlmTokenUsage,
  traceId?: string,
): LlmFinishedEvent {
  return { type: LlmEventType.Finished, finishReason, usage, traceId };
}

/**
 * Creates an error event.
 */
export function createErrorEvent(
  error: Error | string,
  code?: string,
  isRetryable = false,
  traceId?: string,
): LlmErrorEvent {
  return { type: LlmEventType.Error, error, code, isRetryable, traceId };
}
