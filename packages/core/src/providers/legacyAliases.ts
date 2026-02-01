/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Legacy type aliases for backward compatibility during migration.
 *
 * This module provides aliases from @google/genai types to the new
 * provider-independent types. These aliases will be deprecated after
 * the migration is complete.
 *
 * @deprecated Use types from './types.js' directly instead.
 * @see docs/ai_adapter/migration-plan.md
 */

// Import new types
import type {
  LlmMessage,
  LlmContent,
  LlmTextContent,
  LlmImageContent,
  LlmToolCallContent,
  LlmToolResultContent,
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmTokenUsage,
  LlmToolDefinition,
  LlmToolParameters,
  LlmToolProperty,
  LlmStopReason,
} from './types.js';

import type { LlmEventType, LlmEvent } from './events.js';
import type { LlmError, LlmErrorType } from './errors.js';

// ============================================================================
// Message Type Aliases (from @google/genai Content/Part)
// ============================================================================

/**
 * @deprecated Use LlmMessage instead.
 * Alias for backward compatibility with @google/genai Content type.
 */
export type Content = LlmMessage;

/**
 * @deprecated Use LlmContent instead.
 * Alias for backward compatibility with @google/genai Part type.
 */
export type Part = LlmContent;

/**
 * @deprecated Use LlmContent[] instead.
 * Alias for backward compatibility with @google/genai PartListUnion type.
 */
export type PartListUnion = LlmContent | LlmContent[];

// ============================================================================
// Request/Response Type Aliases
// ============================================================================

/**
 * @deprecated Use LlmGenerateRequest instead.
 * Alias for backward compatibility with @google/genai GenerateContentParameters.
 */
export type GenerateContentParameters = LlmGenerateRequest;

/**
 * @deprecated Use LlmGenerateResponse instead.
 * Alias for backward compatibility with @google/genai GenerateContentResponse.
 */
export type GenerateContentResponse = LlmGenerateResponse;

/**
 * @deprecated Use LlmTokenUsage instead.
 * Alias for backward compatibility with @google/genai UsageMetadata.
 */
export type UsageMetadata = LlmTokenUsage;

// ============================================================================
// Tool Type Aliases
// ============================================================================

/**
 * @deprecated Use LlmToolDefinition instead.
 * Alias for backward compatibility with @google/genai FunctionDeclaration.
 */
export type FunctionDeclaration = LlmToolDefinition;

/**
 * @deprecated Use LlmToolCallContent instead.
 * Alias for backward compatibility with @google/genai FunctionCall.
 */
export type FunctionCall = LlmToolCallContent;

/**
 * @deprecated Use LlmToolResultContent instead.
 * Alias for backward compatibility with @google/genai FunctionResponse.
 */
export type FunctionResponse = LlmToolResultContent;

// ============================================================================
// Stop Reason Aliases
// ============================================================================

/**
 * @deprecated Use LlmStopReason instead.
 * Alias for backward compatibility with @google/genai FinishReason.
 */
export type FinishReason = LlmStopReason;

// ============================================================================
// Event Type Aliases
// ============================================================================

/**
 * @deprecated Use LlmEventType instead.
 * Alias for backward compatibility with GeminiEventType.
 */
export type GeminiEventType = LlmEventType;

/**
 * @deprecated Use LlmEvent instead.
 * Alias for backward compatibility with ServerGeminiStreamEvent.
 */
export type ServerGeminiStreamEvent = LlmEvent;

// ============================================================================
// Re-exports for convenience
// ============================================================================

// Re-export new types for migration convenience
export type {
  LlmMessage,
  LlmContent,
  LlmTextContent,
  LlmImageContent,
  LlmToolCallContent,
  LlmToolResultContent,
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmTokenUsage,
  LlmToolDefinition,
  LlmToolParameters,
  LlmToolProperty,
  LlmStopReason,
};

export type { LlmEventType, LlmEvent };
export type { LlmError, LlmErrorType };

// ============================================================================
// Migration Helpers
// ============================================================================

/**
 * Converts a legacy Content array to LlmMessage array.
 * @deprecated This is a transitional helper.
 */
export function contentToLlmMessage(
  content: Content[],
  role: LlmMessage['role'] = 'user',
): LlmMessage[] {
  return content.map((c) => ({
    role,
    content: Array.isArray(c.content) ? c.content : [c.content as LlmContent],
  }));
}

/**
 * Converts LlmMessage to legacy Content format.
 * @deprecated This is a transitional helper.
 */
export function llmMessageToContent(messages: LlmMessage[]): Content[] {
  return messages;
}
