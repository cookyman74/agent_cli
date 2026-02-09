/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @deprecated Import from '../providers/gemini/typeConversion.js' instead.
 * This re-export shim exists for backward compatibility and will be removed
 * after all internal consumers migrate to the canonical path.
 */
export {
  convertContentToLlmMessage,
  convertContentsToLlmMessages,
  convertPartListUnionToLlmContents,
  isContentToolCallMessage,
  isContentToolResultMessage,
} from '../providers/gemini/typeConversion.js';
