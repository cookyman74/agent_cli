/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAiCompatibleAdapter — extends OpenAiAdapter for vLLM, TGI,
 * LM Studio, Ollama, and other OpenAI-compatible API servers.
 *
 * Inherits generateContent, generateContentStream, and classifyError
 * from OpenAiAdapter. Overrides providerName and capabilities, and
 * adds a testConnection() method for server reachability checks.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.4
 * @see packages/core/src/providers/openai/adapter.ts (parent class)
 */

import { OpenAiAdapter, type OpenAiClient } from '../openai/adapter.js';
import type {
  LlmProviderCapabilities,
  AdapterConfig,
  LlmGenerateRequest,
  LlmGenerateResponse,
  GenerateOptions,
} from '../types.js';
import {
  LlmEventType,
  type LlmEventStream,
  type LlmEvent,
  createErrorEvent,
} from '../events.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * Default capabilities for OpenAI-compatible servers.
 *
 * Conservative defaults — many local/self-hosted models lack vision
 * and tool-calling support. Users can override via config.
 */
const OPENAI_COMPATIBLE_DEFAULT_CAPABILITIES: LlmProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsImageInput: false,
  supportsImageGeneration: false,
  supportsEmbedding: false,
  supportsTokenCount: false,
  supportsSystemMessage: true,
  supportsThought: false,
  maxContextLength: 32_768,
  maxOutputTokens: 4_096,
};

/**
 * Adapter for OpenAI-compatible API servers (vLLM, TGI, LM Studio, Ollama).
 *
 * Extends OpenAiAdapter, reusing its converter and error classification.
 * The bootstrap factory injects an OpenAI SDK client configured with a
 * custom `baseURL` and optional `defaultHeaders`.
 */
export class OpenAiCompatibleAdapter extends OpenAiAdapter {
  override readonly providerName = 'openai-compatible';
  override readonly capabilities: LlmProviderCapabilities;

  constructor(config: AdapterConfig, client: OpenAiClient) {
    super(config, client);

    // Guard: baseUrl is required for OpenAI-compatible servers.
    // Without it, requests would silently go to the default OpenAI endpoint.
    if (!config.baseUrl) {
      throw new Error(
        'OpenAI-compatible adapter requires baseUrl (LLM_BASE_URL). ' +
          'Without it, requests would go to the default OpenAI endpoint.',
      );
    }

    // Merge user-provided capability overrides with conservative defaults.
    const overrides = config['capabilities'] as
      | Partial<LlmProviderCapabilities>
      | undefined;
    this.capabilities = overrides
      ? { ...OPENAI_COMPATIBLE_DEFAULT_CAPABILITIES, ...overrides }
      : { ...OPENAI_COMPATIBLE_DEFAULT_CAPABILITIES };
  }

  /**
   * Generate content (non-streaming) with max_tokens for compatibility.
   */
  override async generateContent(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    this.validateRequest(request);

    try {
      const params = this.buildCompatibleParams(request);
      const response = await this.client.chat.completions.create(params, {
        signal: options?.signal,
      });
      return this.converter.fromOpenAiResponse(response, request.model);
    } catch (error) {
      throw this.classifyError(error);
    }
  }

  /**
   * Generate content stream with max_tokens for compatibility.
   */
  override generateContentStream(
    request: LlmGenerateRequest,
    _userPromptId: string,
    options?: GenerateOptions,
  ): LlmEventStream {
    this.validateRequest(request);

    const client = this.client;
    const converter = this.converter;
    const classify = this.classifyError.bind(this);
    const params = this.buildCompatibleParams(request);
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
                `[OpenAI-compat stream] chunk#${chunkIndex} TextDelta: "${event.text.substring(0, 80)}"`,
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
   * Build OpenAI-compatible request params with max_tokens (not max_completion_tokens).
   * Many OpenAI-compatible servers (vLLM, Ollama, GPUStack) use max_tokens.
   */
  private buildCompatibleParams(
    request: LlmGenerateRequest,
  ): Record<string, unknown> {
    const baseParams = this.converter.toOpenAiRequest(request);

    // Remove max_completion_tokens and use max_tokens instead
    const { max_completion_tokens: _max_completion_tokens, ...rest } =
      baseParams;

    // Only set max_tokens if explicitly requested; otherwise let server use its default
    // This avoids forcing a 4096 limit that may not match the server/model configuration
    if (request.maxTokens && request.maxTokens > 0) {
      return {
        ...rest,
        max_tokens: request.maxTokens,
      };
    }

    // No explicit maxTokens — omit max_tokens to use server defaults
    return rest;
  }

  /**
   * Test connectivity to the OpenAI-compatible server.
   *
   * Sends a minimal chat completion request. Any HTTP response (even an
   * error like 401 or 404) confirms the server is reachable. Only network
   * errors (timeout, connection refused) return false.
   *
   * Not part of the ContentGenerator interface — extension-specific.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: 'test',
        messages: [{ role: 'user', content: 'ping' }],
        max_completion_tokens: 1,
      });
      return true;
    } catch (error: unknown) {
      // Got an HTTP response → server is reachable
      const status = (error as Record<string, unknown>)?.['status'] as
        | number
        | undefined;
      return status !== undefined;
    }
  }
}
