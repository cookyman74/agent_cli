/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for LlmError-based retry logic in retryWithBackoff.
 *
 * M2.1.4: Provider-independent retry conditions using LlmError types.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithBackoff, isRetryableError } from './retry.js';
import {
  LlmError,
  LlmErrorType,
  RateLimitError,
  NetworkError,
  AuthenticationError,
} from '../providers/errors.js';
import { ModelNotFoundError } from './httpErrors.js';
import { debugLogger } from './debugLogger.js';

describe('retryWithBackoff - LlmError Support', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    debugLogger.warn = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('LlmError retry conditions (2.1.4.2)', () => {
    it('should retry on LlmError with isRetryable=true', async () => {
      let attempt = 0;
      const mockFn = vi.fn(async () => {
        attempt++;
        if (attempt <= 2) {
          throw new LlmError(LlmErrorType.SERVER_ERROR, 'Server error', {
            isRetryable: true,
            provider: 'test',
          });
        }
        return 'success';
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 10,
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should NOT retry on LlmError with isRetryable=false', async () => {
      const mockFn = vi.fn(async () => {
        throw new AuthenticationError('Invalid API key', {
          provider: 'claude',
        });
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 10,
      });

      await expect(promise).rejects.toThrow('Invalid API key');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('RateLimitError retry strategy (2.1.4.3)', () => {
    it('should wait retryAfterMs when RateLimitError has it', async () => {
      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const mockFn = vi.fn(async () => {
        throw new RateLimitError('Rate limit exceeded', {
          provider: 'claude',
          retryAfterMs: 15000,
        });
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 2,
        initialDelayMs: 100,
      });

      await Promise.all([
        expect(promise).rejects.toThrow(),
        vi.runAllTimersAsync(),
      ]);

      // Should use retryAfterMs (15000) instead of initialDelayMs (100)
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 15000);
    });

    it('should trigger onTerminalError when max attempts exhausted with RateLimitError', async () => {
      const terminalCallback = vi.fn().mockResolvedValue('fallback-model');

      let fallbackOccurred = false;
      const mockFn = vi.fn(async () => {
        if (!fallbackOccurred) {
          throw new RateLimitError('Rate limit', {
            provider: 'gemini',
            retryAfterMs: 1,
          });
        }
        return 'success';
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 2,
        initialDelayMs: 1,
        onTerminalError: async (authType?: string, error?: unknown) => {
          fallbackOccurred = true;
          return await terminalCallback(authType, error);
        },
        authType: 'oauth',
      });

      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe('success');

      expect(terminalCallback).toHaveBeenCalledWith(
        'oauth',
        expect.any(RateLimitError),
      );
    });

    it('should retry NetworkError with exponential backoff', async () => {
      let attempt = 0;
      const mockFn = vi.fn(async () => {
        attempt++;
        if (attempt <= 1) {
          throw new NetworkError('Connection failed', {
            provider: 'openai',
          });
        }
        return 'success';
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 10,
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('Provider error classification (2.1.4.4)', () => {
    it('should use classifyError callback when provided', async () => {
      const classifyError = vi.fn((error: unknown) => {
        if (error instanceof Error && error.message.includes('custom')) {
          return new RateLimitError('Classified rate limit', {
            provider: 'custom-provider',
            retryAfterMs: 5000,
          });
        }
        return error;
      });

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
      const mockFn = vi.fn(async () => {
        throw new Error('custom error from provider');
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 2,
        initialDelayMs: 100,
        classifyError,
      });

      await Promise.all([
        expect(promise).rejects.toThrow(),
        vi.runAllTimersAsync(),
      ]);

      expect(classifyError).toHaveBeenCalled();
      // Should use the classified error's retryAfterMs
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
    });

    it('should fall back to classifyGoogleError when classifyError is not provided', async () => {
      // This test verifies backward compatibility - existing Gemini errors
      // should still be classified and retried without classifyError callback
      const mockFn = vi.fn(async () => {
        const error = new Error('Too Many Requests');
        (error as unknown as { status: number }).status = 429;
        throw error;
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 2,
        initialDelayMs: 10,
      });

      await Promise.all([
        expect(promise).rejects.toThrow(),
        vi.runAllTimersAsync(),
      ]);

      // Should have retried (429 is retryable in both old and new path)
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('classifyGoogleError isolation when classifyErrorFn provided (2.1.4.4)', () => {
    it('should skip classifyGoogleError when classifyErrorFn returns non-LlmError', async () => {
      // classifyErrorFn that passes through original error (non-LlmError)
      const classifyError = vi.fn((error: unknown) => error);

      // 404 error - without the guard, classifyGoogleError would convert to ModelNotFoundError
      const originalError = new Error('Not Found');
      (originalError as unknown as { status: number }).status = 404;

      const mockFn = vi.fn(async () => {
        throw originalError;
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        classifyError,
      });

      // Should throw original Error, NOT ModelNotFoundError
      // If classifyGoogleError were called, it would convert 404 → ModelNotFoundError
      await expect(promise).rejects.toBe(originalError);

      // 404 is not retryable in generic path (not 429, not 5xx), so only 1 call
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(classifyError).toHaveBeenCalledTimes(1);
    });

    it('should call classifyGoogleError when classifyErrorFn is NOT provided (backward compat)', async () => {
      // 404 error without classifyErrorFn - classifyGoogleError converts to ModelNotFoundError
      const mockFn = vi.fn(async () => {
        const error = new Error('Not Found');
        (error as unknown as { status: number }).status = 404;
        throw error;
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 10,
      });

      // Should throw ModelNotFoundError (from classifyGoogleError)
      await expect(promise).rejects.toBeInstanceOf(ModelNotFoundError);
      // ModelNotFoundError is terminal, so no retry
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('isRetryableError with LlmError (2.1.4.2)', () => {
    it('should return true for LlmError with isRetryable=true', () => {
      const error = new RateLimitError('rate limit', { provider: 'claude' });
      expect(isRetryableError(error)).toBe(true);
    });

    it('should return false for LlmError with isRetryable=false', () => {
      const error = new AuthenticationError('invalid key', {
        provider: 'openai',
      });
      expect(isRetryableError(error)).toBe(false);
    });

    it('should still handle non-LlmError errors (backward compat)', () => {
      const error = new Error('Server Error');
      (error as unknown as { status: number }).status = 500;
      expect(isRetryableError(error)).toBe(true);
    });
  });

  describe('Generic shouldRetryOnContent (2.1.4.2)', () => {
    it('should work with generic type instead of GenerateContentResponse', async () => {
      interface CustomResponse {
        text: string;
        valid: boolean;
      }

      let attempt = 0;
      const mockFn = vi.fn(async (): Promise<CustomResponse> => {
        attempt++;
        if (attempt <= 1) {
          return { text: '', valid: false }; // Invalid content
        }
        return { text: 'Hello', valid: true };
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        shouldRetryOnContent: (content: CustomResponse) => !content.valid,
      });

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result).toEqual({ text: 'Hello', valid: true });
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('onTerminalError callback (2.1.4.5)', () => {
    it('should call onTerminalError for non-retryable LlmError', async () => {
      const terminalCallback = vi.fn().mockResolvedValue('fallback-model');

      let fallbackOccurred = false;
      const mockFn = vi.fn(async () => {
        if (!fallbackOccurred) {
          throw new LlmError(LlmErrorType.MODEL_NOT_FOUND, 'Model not found', {
            provider: 'gemini',
            isRetryable: false,
          });
        }
        return 'success';
      });

      const promise = retryWithBackoff(mockFn, {
        maxAttempts: 3,
        initialDelayMs: 10,
        onTerminalError: async (authType?: string, error?: unknown) => {
          fallbackOccurred = true;
          return await terminalCallback(authType, error);
        },
        authType: 'oauth',
      });

      await vi.runAllTimersAsync();
      await expect(promise).resolves.toBe('success');

      expect(terminalCallback).toHaveBeenCalledWith(
        'oauth',
        expect.any(LlmError),
      );
    });
  });
});
