/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for Gemini error classifier.
 *
 * M2.2.4: HTTP status code → LlmErrorType classification
 */

import { describe, it, expect } from 'vitest';
import { LlmErrorType } from '../errors.js';
import {
  classifyGeminiError,
  type GeminiErrorClassification,
} from './errorClassifier.js';

describe('GeminiErrorClassifier', () => {
  describe('classifyGeminiError()', () => {
    // =======================================================================
    // Client errors (4xx)
    // =======================================================================
    describe('Client errors (4xx)', () => {
      it('should classify 400 as INVALID_REQUEST (not retryable)', () => {
        const result: GeminiErrorClassification = classifyGeminiError(400);

        expect(result.errorType).toBe(LlmErrorType.INVALID_REQUEST);
        expect(result.isRetryable).toBe(false);
      });

      it('should classify 401 as AUTHENTICATION (not retryable)', () => {
        const result = classifyGeminiError(401);

        expect(result.errorType).toBe(LlmErrorType.AUTHENTICATION);
        expect(result.isRetryable).toBe(false);
      });

      it('should classify 403 as AUTHENTICATION (not retryable)', () => {
        const result = classifyGeminiError(403);

        expect(result.errorType).toBe(LlmErrorType.AUTHENTICATION);
        expect(result.isRetryable).toBe(false);
      });

      it('should classify 404 as MODEL_NOT_FOUND (not retryable)', () => {
        const result = classifyGeminiError(404);

        expect(result.errorType).toBe(LlmErrorType.MODEL_NOT_FOUND);
        expect(result.isRetryable).toBe(false);
      });

      it('should classify 429 as RATE_LIMIT (retryable)', () => {
        const result = classifyGeminiError(429);

        expect(result.errorType).toBe(LlmErrorType.RATE_LIMIT);
        expect(result.isRetryable).toBe(true);
      });
    });

    // =======================================================================
    // Server errors (5xx)
    // =======================================================================
    describe('Server errors (5xx)', () => {
      it('should classify 500 as SERVER_ERROR (retryable)', () => {
        const result = classifyGeminiError(500);

        expect(result.errorType).toBe(LlmErrorType.SERVER_ERROR);
        expect(result.isRetryable).toBe(true);
      });

      it('should classify 502 as SERVER_ERROR (retryable)', () => {
        const result = classifyGeminiError(502);

        expect(result.errorType).toBe(LlmErrorType.SERVER_ERROR);
        expect(result.isRetryable).toBe(true);
      });

      it('should classify 503 as SERVER_ERROR (retryable)', () => {
        const result = classifyGeminiError(503);

        expect(result.errorType).toBe(LlmErrorType.SERVER_ERROR);
        expect(result.isRetryable).toBe(true);
      });
    });

    // =======================================================================
    // Edge cases
    // =======================================================================
    describe('Edge cases', () => {
      it('should classify undefined status as UNKNOWN (not retryable)', () => {
        const result = classifyGeminiError(undefined);

        expect(result.errorType).toBe(LlmErrorType.UNKNOWN);
        expect(result.isRetryable).toBe(false);
      });

      it('should classify unknown status (418) as UNKNOWN (not retryable)', () => {
        const result = classifyGeminiError(418);

        expect(result.errorType).toBe(LlmErrorType.UNKNOWN);
        expect(result.isRetryable).toBe(false);
      });
    });
  });
});
