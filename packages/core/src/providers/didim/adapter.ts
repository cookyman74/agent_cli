/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DidimAdapter — extends BaseAdapter for DidimAIStudio REST/SSE API.
 *
 * Unlike Claude/OpenAI adapters that wrap SDK clients, this adapter uses
 * raw fetch for HTTP + ReadableStream-based SSE parsing, because
 * DidimAIStudio has no official SDK.
 *
 * Features:
 * - Non-streaming: POST /scenario-gateway/v1/invoke
 * - SSE streaming: POST /scenario-gateway/v1/invoke/sse (or /sse/improved)
 * - Automatic thread_id management across calls
 * - Error classification (401 → AuthenticationError, etc.)
 *
 * @see docs/00_project/Integration_DidimAIStudio/00_master_plan.md §1.2
 * @see packages/core/src/providers/didim/converter.ts (pure conversion functions)
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
  TimeoutError,
  ValidationError,
} from '../errors.js';
import { createErrorEvent } from '../events.js';
import {
  type DidimStreamMode,
  getDidimEndpoint,
  buildDidimHeaders,
  buildDidimRequestBody,
  parseDidimResponse,
  convertDidimResponseToLlm,
  parseDidimSseEvent,
  convertDidimSseToLlmEvents,
} from './converter.js';

// ============================================================================
// Capabilities
// ============================================================================

/**
 * Didim capabilities — scenario-based gateway with limited LLM features.
 *
 * Enabled:
 *   supportsStreaming: true — SSE streaming (sse + improved modes)
 *
 * Not supported:
 *   Everything else — DidimAIStudio is a scenario gateway, not a raw LLM API.
 *   Token counting, tool calls, image I/O, system messages, and thinking
 *   are all managed server-side within the scenario.
 */
const DIDIM_CAPABILITIES: LlmProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: false,
  supportsImageInput: false,
  supportsImageGeneration: false,
  supportsEmbedding: false,
  supportsTokenCount: false,
  supportsSystemMessage: false,
  supportsThought: false,
  maxContextLength: 0,
  maxOutputTokens: 0,
};

// ============================================================================
// Adapter
// ============================================================================

/**
 * DidimAdapter wraps the DidimAIStudio API behind the BaseAdapter interface.
 */
export class DidimAdapter extends BaseAdapter {
  readonly providerName = 'didim';
  readonly capabilities = DIDIM_CAPABILITIES;

  /** Stored thread_id for conversation continuity. */
  private threadId: string | null = null;

  constructor(
    config: AdapterConfig,
    private fetchFn: typeof globalThis.fetch,
    private readonly apiKey: string,
    private readonly serverAddress: string,
    private readonly streamMode: DidimStreamMode,
  ) {
    super(config);
  }

  /**
   * Generate content (non-streaming).
   * POST /scenario-gateway/v1/invoke
   */
  async generateContent(
    request: LlmGenerateRequest,
    _userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    this.validateRequest(request);

    try {
      const url = this.buildEndpointUrl();
      const headers = buildDidimHeaders(this.apiKey, this.threadId);
      const chatText = this.extractChatText(request);
      const body = buildDidimRequestBody(chatText, this.threadId);

      const response = await this.fetchFn(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: options?.signal,
      });

      if (!response.ok) {
        throw this.classifyHttpError(response.status, response.statusText);
      }

      const rawJson = (await response.json()) as Record<string, unknown>;
      const parsed = parseDidimResponse(rawJson);

      // Store thread_id for subsequent calls
      if (parsed.threadId) {
        this.threadId = parsed.threadId;
      }

      return convertDidimResponseToLlm(parsed, request.model);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Generate content as a stream of LlmEvents.
   * POST /scenario-gateway/v1/invoke/sse (or /sse/improved)
   */
  generateContentStream(
    request: LlmGenerateRequest,
    _userPromptId: string,
    options?: GenerateOptions,
  ): LlmEventStream {
    this.validateRequest(request);

    const fetchFn = this.fetchFn;
    const streamMode = this.streamMode;
    const classify = this.classifyHttpError.bind(this);
    const storeThreadId = (id: string | null) => {
      if (id) this.threadId = id;
    };

    // Build request params inside closure to capture current state,
    // but keep inside generator try block for error classification.
    const serverAddress = this.serverAddress;
    const apiKey = this.apiKey;
    // Read threadId lazily at fetch time to avoid stale capture
    // when generator is consumed after subsequent calls update threadId.
    const getThreadId = () => this.threadId;
    const chatText = this.extractChatText(request);
    const signal = options?.signal;
    const buildEndpoint = () =>
      getDidimEndpoint(serverAddress, {
        streaming: true,
        streamMode,
      });

    async function* streamGenerator(): AsyncGenerator<LlmEvent, void, unknown> {
      try {
        // Build URL inside try so config errors become classified Error events
        let url: string;
        try {
          url = buildEndpoint();
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          yield createErrorEvent(
            new ValidationError(`Didim configuration error: ${message}`, {
              provider: 'didim',
            }),
            undefined,
            false,
          );
          return;
        }

        const currentThreadId = getThreadId();
        const headers = buildDidimHeaders(apiKey, currentThreadId);
        const body = buildDidimRequestBody(chatText, currentThreadId);

        const response = await fetchFn(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal,
        });

        if (!response.ok) {
          const error = classify(response.status, response.statusText);
          yield createErrorEvent(error, error.code, error.isRetryable);
          return;
        }

        if (!response.body) {
          yield createErrorEvent(
            'No response body for SSE stream',
            undefined,
            false,
          );
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let currentEvent = '';
        const dataLines: string[] = [];

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            // Keep incomplete last line in buffer
            buffer = lines.pop() ?? '';

            for (const rawLine of lines) {
              // Strip trailing \r for CRLF compatibility (SSE spec §9.2.4)
              const line = rawLine.endsWith('\r')
                ? rawLine.slice(0, -1)
                : rawLine;

              // SSE spec §9.2.4: field name is everything before first colon.
              // A single space after the colon, if present, is stripped.
              if (line.startsWith('event:')) {
                currentEvent = line.substring(6).replace(/^ /, '').trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.substring(5).replace(/^ /, ''));
              } else if (line === '' && currentEvent) {
                // Empty line = event boundary
                // SSE spec: multiple data: lines joined with newline
                const currentData = dataLines.join('\n');
                const sseEvent = parseDidimSseEvent(
                  currentEvent,
                  currentData,
                  streamMode,
                );

                if (sseEvent) {
                  // Store thread_id from done events
                  if (sseEvent.type === 'done' && sseEvent.threadId) {
                    storeThreadId(sseEvent.threadId);
                  }

                  const llmEvents = convertDidimSseToLlmEvents(sseEvent);
                  for (const llmEvent of llmEvents) {
                    yield llmEvent;
                  }
                }

                currentEvent = '';
                dataLines.length = 0;
              }
            }
          }

          // Flush remaining TextDecoder bytes (trailing multi-byte sequence)
          const trailing = decoder.decode();
          if (trailing) {
            buffer += trailing;
          }

          // Parse any remaining lines in buffer (stream ended without final \n)
          if (buffer) {
            const remainingLines = buffer.split('\n');
            for (const rawLine of remainingLines) {
              const line = rawLine.endsWith('\r')
                ? rawLine.slice(0, -1)
                : rawLine;
              if (line.startsWith('event:')) {
                currentEvent = line.substring(6).replace(/^ /, '').trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.substring(5).replace(/^ /, ''));
              }
            }
          }

          // Flush remaining event if stream ended without trailing blank line
          if (currentEvent && dataLines.length > 0) {
            const currentData = dataLines.join('\n');
            const sseEvent = parseDidimSseEvent(
              currentEvent,
              currentData,
              streamMode,
            );
            if (sseEvent) {
              if (sseEvent.type === 'done' && sseEvent.threadId) {
                storeThreadId(sseEvent.threadId);
              }
              const llmEvents = convertDidimSseToLlmEvents(sseEvent);
              for (const llmEvent of llmEvents) {
                yield llmEvent;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        yield createErrorEvent(err, undefined, false);
      }
    }

    return streamGenerator();
  }

  /**
   * Extract all text parts from the last user message, concatenated.
   * DidimAIStudio accepts a single `chat` string, not a message array.
   */
  private extractChatText(request: LlmGenerateRequest): string {
    // Find the last user message
    for (let i = request.messages.length - 1; i >= 0; i--) {
      const msg = request.messages[i];
      if (msg.role === 'user') {
        const texts: string[] = [];
        for (const content of msg.content) {
          if (content.type === 'text') {
            texts.push(content.text);
          }
        }
        return texts.join('\n');
      }
    }
    return '';
  }

  /**
   * Build endpoint URL with error classification.
   * Wraps getDidimEndpoint to convert raw Error to ValidationError.
   */
  private buildEndpointUrl(streaming?: boolean): string {
    try {
      return getDidimEndpoint(
        this.serverAddress,
        streaming
          ? {
              streaming: true,
              streamMode: this.streamMode,
            }
          : undefined,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new ValidationError(`Didim configuration error: ${message}`, {
        provider: this.providerName,
      });
    }
  }

  /**
   * Classify an HTTP status code into a typed LlmError.
   */
  private classifyHttpError(status: number, statusText?: string): LlmError {
    const message =
      `DidimAIStudio API error: ${status} ${statusText ?? ''}`.trim();
    const opts = {
      provider: this.providerName,
      statusCode: status,
    };

    if (status === 401 || status === 403) {
      return new AuthenticationError(message, opts);
    }
    if (status === 429) {
      return new RateLimitError(message, opts);
    }
    if (status === 408) {
      return new TimeoutError(message, opts);
    }
    if (status >= 500) {
      return new LlmError(LlmErrorType.SERVER_ERROR, message, {
        ...opts,
        isRetryable: true,
      });
    }
    return new LlmError(LlmErrorType.UNKNOWN, message, opts);
  }

  /**
   * Map common config to provider-specific config.
   * DidimAIStudio doesn't use standard LLM config params.
   */
  protected mapToProviderConfig(
    _config: LlmGenerateConfig,
  ): Record<string, unknown> {
    return {};
  }
}
