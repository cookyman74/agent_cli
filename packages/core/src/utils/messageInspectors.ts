/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';

/**
 * @deprecated Use {@link isToolResultMessage} from './llmUtils.js' for provider-independent code.
 * This Content-based helper will be removed after full migration to LlmMessage types.
 */
export function isFunctionResponse(content: Content): boolean {
  return (
    content.role === 'user' &&
    !!content.parts &&
    content.parts.every((part) => !!part.functionResponse)
  );
}

/**
 * @deprecated Use {@link isToolCallMessage} from './llmUtils.js' for provider-independent code.
 * This Content-based helper will be removed after full migration to LlmMessage types.
 */
export function isFunctionCall(content: Content): boolean {
  return (
    content.role === 'model' &&
    !!content.parts &&
    content.parts.every((part) => !!part.functionCall)
  );
}
