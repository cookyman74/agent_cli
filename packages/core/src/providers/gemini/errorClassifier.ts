/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Gemini error classifier — maps HTTP status codes to provider-independent
 * LlmErrorType with retry decision.
 *
 * Classification aligns with retry.ts: 429 and 500-599 are retryable.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.7
 */

import { LlmErrorType } from '../errors.js';

/**
 * Result of classifying a Gemini error by HTTP status code.
 */
export interface GeminiErrorClassification {
  /** Provider-independent error type */
  errorType: LlmErrorType;
  /** Whether the error should be retried */
  isRetryable: boolean;
}

/**
 * Classifies a Gemini HTTP status code to provider-independent error type.
 *
 * Classification rules:
 * - 400: INVALID_REQUEST (not retryable)
 * - 401/403: AUTHENTICATION (not retryable)
 * - 404: MODEL_NOT_FOUND (not retryable)
 * - 429: RATE_LIMIT (retryable)
 * - 500-599: SERVER_ERROR (retryable)
 * - undefined/other: UNKNOWN (not retryable)
 *
 * @param status HTTP status code from Gemini API error
 * @returns Classification with error type and retry decision
 */
export function classifyGeminiError(
  status?: number,
): GeminiErrorClassification {
  if (status === undefined) {
    return { errorType: LlmErrorType.UNKNOWN, isRetryable: false };
  }

  switch (status) {
    case 400:
      return { errorType: LlmErrorType.INVALID_REQUEST, isRetryable: false };
    case 401:
      return { errorType: LlmErrorType.AUTHENTICATION, isRetryable: false };
    case 403:
      return { errorType: LlmErrorType.AUTHENTICATION, isRetryable: false };
    case 404:
      return { errorType: LlmErrorType.MODEL_NOT_FOUND, isRetryable: false };
    case 429:
      return { errorType: LlmErrorType.RATE_LIMIT, isRetryable: true };
    default:
      if (status >= 500 && status < 600) {
        return { errorType: LlmErrorType.SERVER_ERROR, isRetryable: true };
      }
      return { errorType: LlmErrorType.UNKNOWN, isRetryable: false };
  }
}
