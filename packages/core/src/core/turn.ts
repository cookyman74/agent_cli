/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @deprecated This module has been moved to providers/gemini/turn.ts.
 * This re-export file is maintained for backward compatibility.
 * Import from '../providers/gemini/turn.js' for new code.
 */
export {
  // Re-exports from providers/gemini/types.ts (via turn.ts)
  GeminiEventType,
  CompressionStatus,
  type ServerGeminiRetryEvent,
  type ServerGeminiAgentExecutionStoppedEvent,
  type ServerGeminiAgentExecutionBlockedEvent,
  type ServerGeminiContextWindowWillOverflowEvent,
  type ServerGeminiInvalidStreamEvent,
  type ServerGeminiModelInfoEvent,
  type ServerGeminiContentEvent,
  type ServerGeminiThoughtEvent,
  type ServerGeminiToolCallRequestEvent,
  type ServerGeminiToolCallResponseEvent,
  type ServerGeminiToolCallConfirmationEvent,
  type ServerGeminiUserCancelledEvent,
  type ServerGeminiErrorEvent,
  type ServerGeminiChatCompressedEvent,
  type ServerGeminiMaxSessionTurnsEvent,
  type ServerGeminiFinishedEvent,
  type ServerGeminiLoopDetectedEvent,
  type ServerGeminiCitationEvent,
  type ServerGeminiStreamEvent,
  type StructuredError,
  type GeminiErrorEventValue,
  type GeminiFinishedEventValue,
  type ServerToolCallConfirmationDetails,
  type ChatCompressionInfo,
  // Re-exports from providers/events.ts (via turn.ts)
  LlmEventType,
  type LlmEvent,
  type LlmFinishReason,
  // Turn class
  Turn,
} from '../providers/gemini/turn.js';
