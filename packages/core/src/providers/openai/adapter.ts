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
import { OpenAiConverter } from './converter.js';
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
 * OpenAiAdapter wraps the OpenAI SDK behind the BaseAdapter interface.
 */
export class OpenAiAdapter extends BaseAdapter {
  readonly providerName: string = 'openai';
  readonly capabilities = OPENAI_CAPABILITIES;

  private readonly converter: OpenAiConverter;

  constructor(
    config: AdapterConfig,
    protected readonly client: OpenAiClient,
  ) {
    super(config);
    this.converter = new OpenAiConverter();
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
      const params = this.converter.toOpenAiRequest(request);
      const response = await this.client.chat.completions.create(params, {
        signal: options?.signal,
      });
      return this.converter.fromOpenAiResponse(response, request.model);
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
    const params = converter.toOpenAiRequest(request);
    const signal = options?.signal;

    async function* streamGenerator(): AsyncGenerator<LlmEvent, void, unknown> {
      try {
        const stream = (await client.chat.completions.create(
          {
            ...params,
            stream: true,
            stream_options: { include_usage: true },
          },
          { signal },
        )) as AsyncIterable<unknown>;

        const state = converter.createStreamState();
        let chunkIndex = 0;
        for await (const chunk of stream) {
          const events = converter.convertStreamEvent(chunk, state);
          for (const event of events) {
            if (event.type === LlmEventType.TextDelta) {
              debugLogger.log(
                `[OpenAI stream] chunk#${chunkIndex} TextDelta: "${event.text.substring(0, 80)}"`,
              );
            }
            yield event;
          }
          chunkIndex++;
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
   * Classify an OpenAI SDK error into a typed LlmError.
   * Uses HTTP status code when available, falls back to message heuristics.
   */
  private classifyError(error: unknown): LlmError {
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
      max_completion_tokens: config.maxTokens,
      top_p: config.topP,
      stop: config.stopSequences,
    };
  }
}
