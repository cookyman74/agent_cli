/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAiAdapter — extends BaseAdapter to wrap OpenAI SDK (openai).
 *
 * Accepts provider-independent LlmGenerateRequest, converts to OpenAI SDK
 * format, and converts responses back to LlmGenerateResponse / LlmEventStream.
 *
 * Supports two API paths:
 *   - Chat Completions API (`/v1/chat/completions`) — default for most models
 *   - Responses API (`/v1/responses`) — for codex models (gpt-5.3-codex, etc.)
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.7
 * @see packages/core/src/providers/claude/adapter.ts (Claude counterpart)
 */

import { BaseAdapter } from '../baseAdapter.js';
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmGenerateConfig,
  LlmProviderCapabilities,
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
} from '../errors.js';
import { createErrorEvent, LlmEventType } from '../events.js';
import {
  extractWithRateLimits,
  OPENAI_RATE_LIMIT_HEADERS,
} from '../rateLimitUtils.js';
import { OpenAiConverter } from './converter.js';
import { OpenAiResponsesConverter } from './responsesConverter.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Interface for the OpenAI SDK client.
 * This allows dependency injection for testing.
 */
export interface OpenAiClient {
  chat: {
    completions: {
      create(
        params: Record<string, unknown>,
        options?: Record<string, unknown>,
      ): Promise<unknown>;
    };
  };
  responses: {
    create(
      params: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): Promise<unknown>;
  };
}

/**
 * OpenAI adapter capabilities.
 *
 * Enabled capabilities:
 *   supportsStreaming: true     — full stream conversion (M3.2.B)
 *   supportsToolCalls: true     — tool_call/tool_result conversion
 *   supportsImageInput: true    — image_url content part
 *   supportsSystemMessage: true — system role messages
 *
 * Not supported:
 *   supportsImageGeneration: false — Not in Chat Completions API
 *   supportsEmbedding: false       — Separate Embeddings API, not wrapped
 *   supportsTokenCount: false      — No built-in countTokens in SDK
 *   supportsThought: false         — No extended thinking in standard API
 */
const OPENAI_CAPABILITIES: LlmProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsImageInput: true,
  supportsImageGeneration: false,
  supportsEmbedding: false,
  supportsTokenCount: false,
  supportsSystemMessage: true,
  supportsThought: false,
  maxContextLength: 400_000,
  maxOutputTokens: 128_000,
};

/**
 * Models that require the Responses API (`/v1/responses`).
 * These models do NOT support Chat Completions (`/v1/chat/completions`).
 */
const RESPONSES_API_MODELS = new Set(['gpt-5.3-codex', 'gpt-5.4-pro']);

/**
 * OpenAiAdapter wraps the OpenAI SDK behind the BaseAdapter interface.
 *
 * Routes requests to either Chat Completions or Responses API based on model.
 */
export class OpenAiAdapter extends BaseAdapter {
  readonly providerName: string = 'openai';
  readonly capabilities = OPENAI_CAPABILITIES;

  protected readonly converter: OpenAiConverter;
  protected readonly responsesConverter: OpenAiResponsesConverter;

  constructor(
    config: AdapterConfig,
    protected readonly client: OpenAiClient,
  ) {
    super(config);
    this.converter = new OpenAiConverter();
    this.responsesConverter = new OpenAiResponsesConverter();
  }

  /**
   * Generate content (non-streaming).
   *
   * Routes to Responses API for codex/pro models, Chat Completions otherwise.
   */
  async generateContent(
    request: LlmGenerateRequest,
    _userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    this.validateRequest(request);

    if (this.isResponsesApiModel(request.model)) {
      return this.generateContentViaResponses(request, options);
    }

    try {
      const params = this.converter.toOpenAiRequest(request);
      const createResult = this.client.chat.completions.create(params, {
        signal: options?.signal,
      });
      const { data, rateLimits } = await extractWithRateLimits(
        createResult,
        OPENAI_RATE_LIMIT_HEADERS,
      );
      const result = this.converter.fromOpenAiResponse(data, request.model);
      if (rateLimits) {
        result.rateLimits = rateLimits;
      }
      return result;
    } catch (error) {
      throw this.classifyError(error);
    }
  }

  /**
   * Generate content as a stream of LlmEvents.
   *
   * Routes to Responses API streaming for codex/pro models.
   */
  generateContentStream(
    request: LlmGenerateRequest,
    _userPromptId: string,
    options?: GenerateOptions,
  ): LlmEventStream {
    this.validateRequest(request);

    if (this.isResponsesApiModel(request.model)) {
      return this.generateContentStreamViaResponses(request, options);
    }

    const client = this.client;
    const converter = this.converter;
    const classify = this.classifyError.bind(this);
    const params = converter.toOpenAiRequest(request);
    const signal = options?.signal;

    async function* streamGenerator(): AsyncGenerator<LlmEvent, void, unknown> {
      try {
        const createResult = client.chat.completions.create(
          {
            ...params,
            stream: true,
            stream_options: { include_usage: true },
          },
          { signal },
        );
        const { data, rateLimits } = await extractWithRateLimits(
          createResult,
          OPENAI_RATE_LIMIT_HEADERS,
        );
        const stream = data as AsyncIterable<unknown>;

        const state = converter.createStreamState();
        let chunkIndex = 0;
        let messageEndEmitted = false;
        for await (const chunk of stream) {
          const events = converter.convertStreamEvent(chunk, state);
          for (const event of events) {
            if (event.type === LlmEventType.TextDelta) {
              debugLogger.log(
                `[OpenAI stream] chunk#${chunkIndex} TextDelta: "${event.text.substring(0, 80)}"`,
              );
            }
            if (event.type === LlmEventType.MessageEnd) {
              messageEndEmitted = true;
              yield rateLimits ? { ...event, rateLimits } : event;
            } else {
              yield event;
            }
          }
          chunkIndex++;
        }

        // Fallback: openai-compatible servers may not send usage-only final chunk.
        // Emit a synthetic MessageEnd so downstream consumers always get it.
        if (!messageEndEmitted) {
          yield {
            type: LlmEventType.MessageEnd as const,
            ...(rateLimits && { rateLimits }),
          };
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

  // ============================================================================
  // Responses API methods
  // ============================================================================

  /**
   * Non-streaming via Responses API.
   */
  private async generateContentViaResponses(
    request: LlmGenerateRequest,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    try {
      const params = this.responsesConverter.toResponsesRequest(request);
      const createResult = this.client.responses.create(params, {
        signal: options?.signal,
      });
      const { data, rateLimits } = await extractWithRateLimits(
        createResult,
        OPENAI_RATE_LIMIT_HEADERS,
      );
      const result = this.responsesConverter.fromResponsesResponse(
        data,
        request.model,
      );
      if (rateLimits) {
        result.rateLimits = rateLimits;
      }
      return result;
    } catch (error) {
      throw this.classifyError(error);
    }
  }

  /**
   * Streaming via Responses API.
   */
  private generateContentStreamViaResponses(
    request: LlmGenerateRequest,
    options?: GenerateOptions,
  ): LlmEventStream {
    const client = this.client;
    const responsesConverter = this.responsesConverter;
    const classify = this.classifyError.bind(this);
    const params = responsesConverter.toResponsesRequest(request);
    const signal = options?.signal;

    async function* streamGenerator(): AsyncGenerator<LlmEvent, void, unknown> {
      try {
        const createResult = client.responses.create(
          {
            ...params,
            stream: true,
          },
          { signal },
        );
        const { data, rateLimits } = await extractWithRateLimits(
          createResult,
          OPENAI_RATE_LIMIT_HEADERS,
        );
        const stream = data as AsyncIterable<unknown>;

        const state = responsesConverter.createStreamState();
        let chunkIndex = 0;
        let messageEndEmitted = false;
        for await (const event of stream) {
          const events = responsesConverter.convertStreamEvent(event, state);
          for (const llmEvent of events) {
            if (llmEvent.type === LlmEventType.TextDelta) {
              debugLogger.log(
                `[OpenAI Responses stream] chunk#${chunkIndex} TextDelta: "${llmEvent.text.substring(0, 80)}"`,
              );
            }
            if (llmEvent.type === LlmEventType.MessageEnd) {
              messageEndEmitted = true;
              yield rateLimits ? { ...llmEvent, rateLimits } : llmEvent;
            } else {
              yield llmEvent;
            }
          }
          chunkIndex++;
        }

        if (!messageEndEmitted) {
          yield {
            type: LlmEventType.MessageEnd as const,
            ...(rateLimits && { rateLimits }),
          };
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

  // ============================================================================
  // Helpers
  // ============================================================================

  /**
   * Check if a model requires the Responses API.
   */
  private isResponsesApiModel(model: string): boolean {
    return RESPONSES_API_MODELS.has(model);
  }

  /**
   * Classify an OpenAI SDK error into a typed LlmError.
   * Uses HTTP status code when available, falls back to message heuristics.
   */
  protected classifyError(error: unknown): LlmError {
    // Preserve already-classified LlmError instances
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

    // Enrich connection errors with provider info so the user knows which
    // service failed (prevents confusion during multi-provider switching).
    const cause = (err as { cause?: Error }).cause;
    const detail = cause ? ` (${cause.message})` : '';
    return new NetworkError(
      `${message} [provider: ${this.providerName}]${detail}`,
      opts,
    );
  }

  /**
   * Map common config to provider-specific config.
   */
  protected mapToProviderConfig(
    config: LlmGenerateConfig,
  ): Record<string, unknown> {
    return {
      temperature: config.temperature,
      // Guard: skip invalid (negative or zero) maxTokens to prevent API errors
      max_completion_tokens:
        config.maxTokens !== undefined && config.maxTokens > 0
          ? config.maxTokens
          : undefined,
      top_p: config.topP,
      stop: config.stopSequences,
    };
  }
}
