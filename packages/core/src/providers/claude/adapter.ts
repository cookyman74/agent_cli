/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ClaudeAdapter — extends BaseAdapter to wrap Anthropic SDK (@anthropic-ai/sdk).
 *
 * Accepts provider-independent LlmGenerateRequest, converts to Anthropic SDK
 * format, and converts responses back to LlmGenerateResponse / LlmEventStream.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.4
 * @see packages/core/src/providers/gemini/adapter.ts (Gemini counterpart)
 */

import { BaseAdapter } from '../baseAdapter.js';
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmGenerateConfig,
  LlmProviderCapabilities,
  LlmTokenCount,
  AdapterConfig,
  GenerateOptions,
} from '../types.js';
import type { LlmEvent, LlmEventStream } from '../events.js';
import {
  LlmError,
  LlmErrorType,
  AuthenticationError,
  RateLimitError,
  ModelNotFoundError,
  NetworkError,
  TimeoutError,
  UnsupportedFeatureError,
} from '../errors.js';
import { createErrorEvent } from '../events.js';
import { ClaudeConverter } from './converter.js';

/**
 * Interface for the Anthropic SDK client.
 * This allows dependency injection for testing.
 */
export interface ClaudeClient {
  messages: {
    create(params: Record<string, unknown>): Promise<unknown>;
    countTokens?(params: Record<string, unknown>): Promise<unknown>;
  };
}

/**
 * Claude adapter capabilities (M3.1.1).
 *
 * Enabled capabilities:
 *   supportsStreaming: true     — generateContentStream implemented
 *   supportsToolCalls: true     — tool_call/tool_result conversion
 *   supportsImageInput: true    — base64 image conversion
 *   supportsTokenCount: true    — countTokens via SDK
 *   supportsSystemMessage: true — system message extraction
 *   supportsThought: true       — thinking block conversion
 *
 * Not supported:
 *   supportsImageGeneration: false — Claude does not generate images
 *   supportsEmbedding: false       — Claude Messages API has no embedding
 */
const CLAUDE_CAPABILITIES: LlmProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsImageInput: true,
  supportsImageGeneration: false,
  supportsEmbedding: false,
  supportsTokenCount: true,
  supportsSystemMessage: true,
  supportsThought: true,
  maxContextLength: 200_000,
  maxOutputTokens: 8_192,
};

/**
 * ClaudeAdapter wraps the Anthropic SDK behind the BaseAdapter interface.
 */
export class ClaudeAdapter extends BaseAdapter {
  readonly providerName = 'claude';
  readonly capabilities = CLAUDE_CAPABILITIES;

  private readonly converter: ClaudeConverter;

  constructor(
    config: AdapterConfig,
    protected readonly client: ClaudeClient,
  ) {
    super(config);
    this.converter = new ClaudeConverter();
  }

  /**
   * Generate content (non-streaming).
   */
  async generateContent(
    request: LlmGenerateRequest,
    _userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    this.validateRequest(request);

    try {
      const params = this.converter.toClaudeRequest(request);
      const response = await this.client.messages.create(params, {
        signal: options?.signal,
      });
      return this.converter.fromClaudeResponse(response, request.model);
    } catch (error) {
      throw this.classifyError(error);
    }
  }

  /**
   * Generate content as a stream of LlmEvents.
   */
  generateContentStream(
    request: LlmGenerateRequest,
    _userPromptId: string,
    options?: GenerateOptions,
  ): LlmEventStream {
    this.validateRequest(request);

    const client = this.client;
    const converter = this.converter;
    const classify = this.classifyError.bind(this);
    const params = converter.toClaudeRequest(request);
    const signal = options?.signal;

    async function* streamGenerator(): AsyncGenerator<LlmEvent, void, unknown> {
      try {
        const stream = (await client.messages.create(
          {
            ...params,
            stream: true,
          },
          { signal },
        )) as AsyncIterable<unknown>;

        const state = converter.createStreamState();
        for await (const chunk of stream) {
          const events = converter.convertStreamEvent(chunk, state);
          for (const event of events) {
            yield event;
          }
        }
      } catch (error) {
        const classified = classify(error);
        yield createErrorEvent(
          classified,
          classified.code,
          classified.isRetryable,
        );
      }
    }

    return streamGenerator();
  }

  /**
   * Count tokens in a request.
   */
  override async countTokens(
    request: LlmGenerateRequest,
  ): Promise<LlmTokenCount> {
    if (!this.client.messages.countTokens) {
      throw new UnsupportedFeatureError(
        'Token counting is not available for this Claude client',
      );
    }

    const params = this.converter.toCountTokensRequest(request);
    const result = (await this.client.messages.countTokens(params)) as {
      input_tokens?: number;
    };

    return {
      totalTokens: result.input_tokens ?? 0,
    };
  }

  /**
   * Classify an Anthropic SDK error into a typed LlmError.
   * Uses HTTP status code when available, falls back to message heuristics.
   */
  private classifyError(error: unknown): LlmError {
    // Preserve already-classified LlmError instances (e.g. from nested calls)
    if (error instanceof LlmError) {
      return error;
    }

    const err = error instanceof Error ? error : new Error(String(error));
    const status = (error as Record<string, unknown>)?.['status'] as
      | number
      | undefined;
    const message = err.message;
    const opts = {
      provider: this.providerName,
      statusCode: status,
      cause: err,
    };

    if (status !== undefined) {
      if (status === 400 || status === 422) {
        return new LlmError(LlmErrorType.INVALID_REQUEST, message, {
          ...opts,
          isRetryable: false,
        });
      }
      if (status === 401 || status === 403) {
        return new AuthenticationError(message, opts);
      }
      if (status === 404) {
        return new ModelNotFoundError(message, opts);
      }
      if (status === 429) {
        return new RateLimitError(message, opts);
      }
      if (status === 529) {
        return new LlmError(LlmErrorType.MODEL_OVERLOADED, message, {
          ...opts,
          isRetryable: true,
        });
      }
      if (status >= 500) {
        return new LlmError(LlmErrorType.SERVER_ERROR, message, {
          ...opts,
          isRetryable: true,
        });
      }
    }

    // No status code — heuristic based on message
    if (/timeout/i.test(message)) {
      return new TimeoutError(message, opts);
    }

    return new NetworkError(message, opts);
  }

  /**
   * Map common config to provider-specific config.
   */
  protected mapToProviderConfig(
    config: LlmGenerateConfig,
  ): Record<string, unknown> {
    return {
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      top_p: config.topP,
      top_k: config.topK,
      stop_sequences: config.stopSequences,
    };
  }
}
