/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type {
  LlmGenerateConfig,
  LlmProviderCapabilities,
  LlmGenerateRequest,
  LlmGenerateResponse,
  AdapterConfig,
  ContentGenerator,
  GenerateOptions,
  LlmTokenCount,
} from './types.js';
import type { LlmEventStream } from './events.js';
import { LlmError, LlmErrorType, UnsupportedFeatureError } from './errors.js';

/**
 * Abstract base class for LLM adapters.
 * Implements the ContentGenerator interface to enforce consistency.
 *
 * @see docs/ai_adapter/03-technical-design.md
 */
export abstract class BaseAdapter implements ContentGenerator {
  abstract readonly providerName: string;
  abstract readonly capabilities: LlmProviderCapabilities;

  constructor(protected config: AdapterConfig) {
    this.validateConfig();
  }

  /**
   * Validate the configuration.
   * Throws LlmError if configuration is invalid.
   */
  protected validateConfig(): void {
    if (!this.config) {
      throw new LlmError(LlmErrorType.VALIDATION, 'Configuration is required');
    }
  }

  /**
   * Validate the request before processing.
   * Subclasses SHOULD call this method at the start of `generateContent`
   * and `generateContentStream` implementations.
   *
   * @example
   * ```ts
   * async generateContent(request: LlmGenerateRequest, ...): Promise<...> {
   *   this.validateRequest(request); // Call validation first
   *   // ... implementation
   * }
   * ```
   */
  protected validateRequest(request: LlmGenerateRequest): void {
    if (!request.model) {
      throw new LlmError(LlmErrorType.VALIDATION, 'Model is required');
    }
    if (!request.messages || request.messages.length === 0) {
      throw new LlmError(
        LlmErrorType.VALIDATION,
        'At least one message is required',
      );
    }
  }

  /**
   * Handle errors uniformly.
   */
  protected handleError(error: unknown): never {
    if (error instanceof LlmError) {
      throw error;
    }
    throw new LlmError(
      LlmErrorType.UNKNOWN,
      `${this.providerName} error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  /**
   * Convert common config to provider-specific config.
   * Note: This helper might be moved to specific adapters or kept here if useful.
   */
  protected abstract mapToProviderConfig(
    config: LlmGenerateConfig,
  ): Record<string, unknown>;

  abstract generateContent(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse>;

  abstract generateContentStream(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): LlmEventStream;

  /**
   * Count tokens in a request.
   * Default implementation throws UnsupportedFeatureError if capabilities.supportsTokenCount is false.
   * Subclasses SHOULD override this method if token counting is supported.
   */
  countTokens(_request: LlmGenerateRequest): Promise<LlmTokenCount> {
    if (!this.capabilities.supportsTokenCount) {
      throw new UnsupportedFeatureError(
        `Token counting is not supported by ${this.providerName}`,
      );
    }
    // Subclasses should override this method
    throw new UnsupportedFeatureError(
      `countTokens must be implemented by ${this.providerName}`,
    );
  }

  /**
   * Embed content (optional).
   * Default implementation throws UnsupportedFeatureError.
   * @see TODO: M1.3 will define proper LlmEmbedRequest/LlmEmbedResponse types
   */
  embedContent(_request: unknown): Promise<unknown> {
    throw new UnsupportedFeatureError(
      `Embedding is not supported by ${this.providerName}`,
    );
  }
}

// The original LlmAdapter methods that are now properties or handled differently
// getCapabilities is replaced by the 'capabilities' property.
// validateConfig is now a protected method called in the constructor.
