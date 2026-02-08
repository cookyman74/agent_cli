/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * GeminiAdapter — extends BaseAdapter to wrap Gemini SDK (@google/genai).
 *
 * Accepts provider-independent LlmGenerateRequest, converts to Gemini SDK
 * format, and converts responses back to LlmGenerateResponse / LlmEventStream.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.2
 */

import type { GenerateContentResponse } from '@google/genai';

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
import {
  LlmEventType,
  type LlmEvent,
  type LlmEventStream,
  type LlmFinishedEvent,
} from '../events.js';
import type { LlmTextDeltaEvent } from '../events.js';
import { GeminiConverter } from './converter.js';

/**
 * Interface for the Gemini SDK models object.
 * This allows dependency injection for testing.
 */
export interface GeminiModelsApi {
  generateContent(
    params: Record<string, unknown>,
  ): Promise<GenerateContentResponse>;
  generateContentStream(
    params: Record<string, unknown>,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;
  countTokens(
    params: Record<string, unknown>,
  ): Promise<{ totalTokens?: number }>;
  embedContent?(params: Record<string, unknown>): Promise<unknown>;
}

/**
 * GeminiAdapter wraps the Gemini SDK behind the BaseAdapter interface.
 */
export class GeminiAdapter extends BaseAdapter {
  readonly providerName = 'gemini';
  readonly capabilities: LlmProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsImageInput: true,
    supportsImageGeneration: true,
    supportsEmbedding: true,
    supportsTokenCount: true,
    supportsSystemMessage: true,
    supportsThought: true,
    maxContextLength: 1_000_000,
    maxOutputTokens: 8_192,
  };

  private readonly models: GeminiModelsApi;
  private readonly converter: GeminiConverter;

  constructor(config: AdapterConfig, models: GeminiModelsApi) {
    super(config);
    this.models = models;
    this.converter = new GeminiConverter();
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
      const geminiParams = this.converter.toGeminiRequest(request);
      const response = await this.models.generateContent(
        geminiParams as unknown as Record<string, unknown>,
      );
      return this.converter.fromGeminiResponse(response, request.model);
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

    const models = this.models;
    const converter = this.converter;
    const convertChunk = this.convertChunkToEvents.bind(this);
    const handleErr = this.handleError.bind(this);
    const geminiParams = converter.toGeminiRequest(request);

    async function* streamGenerator(): AsyncGenerator<LlmEvent, void, unknown> {
      try {
        const stream = await models.generateContentStream(
          geminiParams as unknown as Record<string, unknown>,
        );

        for await (const chunk of stream) {
          const events = convertChunk(chunk);
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
    const geminiParams = this.converter.toGeminiRequest(request);
    const result = await this.models.countTokens(
      geminiParams as unknown as Record<string, unknown>,
    );
    return {
      totalTokens: result.totalTokens ?? 0,
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
      maxOutputTokens: config.maxTokens,
      topP: config.topP,
      topK: config.topK,
      stopSequences: config.stopSequences,
    };
  }

  /**
   * Convert a GenerateContentResponse chunk to LlmEvent[].
   */
  private convertChunkToEvents(chunk: GenerateContentResponse): LlmEvent[] {
    const events: LlmEvent[] = [];
    const candidate = chunk.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    for (const part of parts) {
      if ('text' in part && part.text !== undefined) {
        events.push({
          type: LlmEventType.TextDelta,
          text: part.text,
        } as LlmTextDeltaEvent);
      } else if ('functionCall' in part && part.functionCall) {
        events.push({
          type: LlmEventType.ToolCallRequest,
          callId: crypto.randomUUID(),
          name: part.functionCall.name!,
          args: part.functionCall.args ?? {},
        });
      }
    }

    // Check for finish reason
    if (candidate?.finishReason) {
      events.push({
        type: LlmEventType.Finished,
        finishReason: this.converter.mapStopReason(
          candidate.finishReason as string,
        ) as LlmFinishedEvent['finishReason'],
        usage: chunk.usageMetadata
          ? {
              promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
              completionTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
              totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
            }
          : undefined,
      } as LlmFinishedEvent);
    }

    return events;
  }
}
