/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @deprecated This module has been moved to providers/gemini/chat.ts.
 * This re-export file is maintained for backward compatibility.
 * Import from '../providers/gemini/chat.js' for new code.
 */
export {
  StreamEventType,
  type StreamEvent,
  SYNTHETIC_THOUGHT_SIGNATURE,
  isValidNonThoughtTextPart,
  InvalidStreamError,
  AgentExecutionStoppedError,
  AgentExecutionBlockedError,
  GeminiChat,
  isSchemaDepthError,
  isInvalidArgumentError,
} from '../providers/gemini/chat.js';
