/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider-independent error types for multi-LLM support.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.7
 */

// ============================================================================
// Error Types
// ============================================================================

/**
 * Error type categories.
 */
export enum LlmErrorType {
  /** Authentication/authorization error */
  AUTHENTICATION = 'authentication',

  /** Rate limit exceeded */
  RATE_LIMIT = 'rate_limit',

  /** Invalid request parameters */
  INVALID_REQUEST = 'invalid_request',

  /** Content blocked by safety filters */
  CONTENT_FILTER = 'content_filter',

  /** Model not found or not available */
  MODEL_NOT_FOUND = 'model_not_found',

  /** Provider not registered in registry */
  PROVIDER_NOT_FOUND = 'provider_not_found',

  /** Model overloaded (Claude-specific, temporary capacity issue) */
  MODEL_OVERLOADED = 'model_overloaded',

  /** Context length exceeded */
  CONTEXT_LENGTH_EXCEEDED = 'context_length_exceeded',

  /** Network/connection error */
  NETWORK = 'network',

  /** Timeout error */
  TIMEOUT = 'timeout',

  /** Server error (5xx) */
  SERVER_ERROR = 'server_error',

  /** Feature not supported by provider */
  UNSUPPORTED_FEATURE = 'unsupported_feature',

  /** Validation error */
  VALIDATION = 'validation',

  /** Unknown/unclassified error */
  UNKNOWN = 'unknown',
}

/**
 * Provider-independent error class.
 */
export class LlmError extends Error {
  /** Error type for programmatic handling */
  readonly type: LlmErrorType;

  /** Provider name (e.g., 'gemini', 'claude', 'openai') */
  readonly provider?: string;

  /** Original error code from provider */
  readonly code?: string;

  /** HTTP status code if applicable */
  readonly statusCode?: number;

  /** Whether this error is retryable */
  readonly isRetryable: boolean;

  /** Suggested retry delay in milliseconds */
  readonly retryAfterMs?: number;

  /** Original error object */
  override readonly cause?: Error;

  constructor(type: LlmErrorType, message: string, options?: LlmErrorOptions) {
    super(message);
    this.name = 'LlmError';
    this.type = type;
    this.provider = options?.provider;
    this.code = options?.code;
    this.statusCode = options?.statusCode;
    this.isRetryable = options?.isRetryable ?? this.isDefaultRetryable(type);
    this.retryAfterMs = options?.retryAfterMs;
    this.cause = options?.cause;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, LlmError);
    }
  }

  private isDefaultRetryable(type: LlmErrorType): boolean {
    switch (type) {
      case LlmErrorType.RATE_LIMIT:
      case LlmErrorType.NETWORK:
      case LlmErrorType.TIMEOUT:
      case LlmErrorType.SERVER_ERROR:
        return true;
      default:
        return false;
    }
  }

  /**
   * Creates a JSON representation of the error.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      type: this.type,
      message: this.message,
      provider: this.provider,
      code: this.code,
      statusCode: this.statusCode,
      isRetryable: this.isRetryable,
      retryAfterMs: this.retryAfterMs,
      stack: this.stack,
    };
  }
}

/**
 * Options for LlmError constructor.
 */
export interface LlmErrorOptions {
  provider?: string;
  code?: string;
  statusCode?: number;
  isRetryable?: boolean;
  retryAfterMs?: number;
  cause?: Error;
}

// ============================================================================
// Specific Error Classes
// ============================================================================

/**
 * Authentication error.
 */
export class AuthenticationError extends LlmError {
  constructor(message: string, options?: Omit<LlmErrorOptions, 'isRetryable'>) {
    super(LlmErrorType.AUTHENTICATION, message, {
      ...options,
      isRetryable: false,
    });
    this.name = 'AuthenticationError';
  }
}

/**
 * Rate limit error.
 */
export class RateLimitError extends LlmError {
  constructor(message: string, options?: LlmErrorOptions) {
    super(LlmErrorType.RATE_LIMIT, message, {
      ...options,
      isRetryable: true,
    });
    this.name = 'RateLimitError';
  }
}

/**
 * Content filter error.
 */
export class ContentFilterError extends LlmError {
  constructor(message: string, options?: Omit<LlmErrorOptions, 'isRetryable'>) {
    super(LlmErrorType.CONTENT_FILTER, message, {
      ...options,
      isRetryable: false,
    });
    this.name = 'ContentFilterError';
  }
}

/**
 * Context length exceeded error.
 */
export class ContextLengthExceededError extends LlmError {
  constructor(message: string, options?: Omit<LlmErrorOptions, 'isRetryable'>) {
    super(LlmErrorType.CONTEXT_LENGTH_EXCEEDED, message, {
      ...options,
      isRetryable: false,
    });
    this.name = 'ContextLengthExceededError';
  }
}

/**
 * Validation error.
 */
export class ValidationError extends LlmError {
  constructor(message: string, options?: Omit<LlmErrorOptions, 'isRetryable'>) {
    super(LlmErrorType.VALIDATION, message, {
      ...options,
      isRetryable: false,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Unsupported feature error.
 */
export class UnsupportedFeatureError extends LlmError {
  constructor(message: string, options?: LlmErrorOptions) {
    super(LlmErrorType.UNSUPPORTED_FEATURE, message, {
      ...options,
      isRetryable: false,
    });
    this.name = 'UnsupportedFeatureError';
  }
}

/**
 * Model not found error.
 */
export class ModelNotFoundError extends LlmError {
  constructor(message: string, options?: LlmErrorOptions) {
    super(LlmErrorType.MODEL_NOT_FOUND, message, {
      ...options,
      isRetryable: false,
    });
    this.name = 'ModelNotFoundError';
  }
}

/**
 * Network error.
 */
export class NetworkError extends LlmError {
  constructor(message: string, options?: LlmErrorOptions) {
    super(LlmErrorType.NETWORK, message, {
      ...options,
      isRetryable: true,
    });
    this.name = 'NetworkError';
  }
}

/**
 * Timeout error.
 */
export class TimeoutError extends LlmError {
  constructor(message: string, options?: LlmErrorOptions) {
    super(LlmErrorType.TIMEOUT, message, {
      ...options,
      isRetryable: true,
    });
    this.name = 'TimeoutError';
  }
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Checks if an error is an LlmError.
 */
export function isLlmError(error: unknown): error is LlmError {
  return error instanceof LlmError;
}

/**
 * Checks if an error is retryable.
 */
export function isRetryableError(error: unknown): boolean {
  if (isLlmError(error)) {
    return error.isRetryable;
  }
  return false;
}

/**
 * Wraps an unknown error as an LlmError.
 */
export function wrapError(error: unknown, provider?: string): LlmError {
  if (isLlmError(error)) {
    return error;
  }

  if (error instanceof Error) {
    return new LlmError(LlmErrorType.UNKNOWN, error.message, {
      provider,
      cause: error,
    });
  }

  return new LlmError(LlmErrorType.UNKNOWN, String(error), {
    provider,
  });
}
