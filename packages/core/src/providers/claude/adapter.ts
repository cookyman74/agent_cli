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
import { UnsupportedFeatureError } from '../errors.js';
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
    _options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    this.validateRequest(request);

    try {
      const params = this.converter.toClaudeRequest(request);
      const response = await this.client.messages.create(params);
      return this.converter.fromClaudeResponse(response, request.model);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Generate content as a stream of LlmEvents.
   */
  generateContentStream(
    request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): LlmEventStream {
    this.validateRequest(request);

    const client = this.client;
    const converter = this.converter;
    const handleErr = this.handleError.bind(this);
    const params = converter.toClaudeRequest(request);

    async function* streamGenerator(): AsyncGenerator<LlmEvent, void, unknown> {
      try {
        const stream = (await client.messages.create({
          ...params,
          stream: true,
        })) as AsyncIterable<unknown>;

        const state = converter.createStreamState();
        for await (const chunk of stream) {
          const events = converter.convertStreamEvent(chunk, state);
          for (const event of events) {
            yield event;
          }
        }
      } catch (error) {
        handleErr(error);
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
