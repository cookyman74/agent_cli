/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DidimAdapter — extends BaseAdapter for DidimAIStudio REST/SSE API.
 *
 * v1: POST /scenario-gateway/v1/invoke (non-streaming, SSE)
 * v2: POST /api/v2/agent/chat (tool-calling SSE)
 *     POST /api/v2/agent/tool-results (tool result reinjection)
 *
 * @see docs/00_project/Integration_DidimAIStudio/00_master_plan.md §1.2
 * @see packages/core/src/providers/didim/converter.ts
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
  normalizeDidimDomain,
  detectScheme,
} from './converter.js';

// ============================================================================
// Types
// ============================================================================

/** Tool result submitted by the client for /tool-results reinjection. */
export interface DidimToolResult {
  callId: string;
  name: string;
  result: unknown;
  isError?: boolean;
}

// ============================================================================
// Capabilities
// ============================================================================

const DIDIM_CAPABILITIES: LlmProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsImageInput: false,
  supportsImageGeneration: false,
  supportsEmbedding: false,
  supportsTokenCount: false,
  supportsSystemMessage: false,
  supportsThought: false,
  maxContextLength: 0,
  maxOutputTokens: 0,
};

/** Client info sent in v2 requests. version은 빌드 시 생성된 CLI_VERSION 사용. */
let _clientVersion: string | null = null;
async function loadClientVersion(): Promise<string> {
  if (_clientVersion) return _clientVersion;
  try {
    const mod = await import('../../generated/git-commit.js');
    _clientVersion =
      typeof mod.CLI_VERSION === 'string' ? mod.CLI_VERSION : '0.0.0';
  } catch {
    _clientVersion = '0.0.0';
  }
  return _clientVersion;
}
function getClientVersion(): string {
  // Kick off async load but return cached or fallback synchronously.
  // The dynamic import will populate _clientVersion for subsequent calls.
  if (_clientVersion) return _clientVersion;
  void loadClientVersion();
  return '0.0.0';
}

function getClientInfo(): { name: string; version: string } {
  return { name: 'agent-cli', version: getClientVersion() };
}

// ============================================================================
// Adapter
// ============================================================================

export class DidimAdapter extends BaseAdapter {
  readonly providerName = 'didim';
  readonly capabilities = DIDIM_CAPABILITIES;

  /** Stored thread_id for conversation continuity. */
  private threadId: string | null = null;

  /** Last checkpoint_id from tool_call SSE events. */
  private lastCheckpointId: string | null = null;

  constructor(
    config: AdapterConfig,
    private fetchFn: typeof globalThis.fetch,
    private readonly apiKey: string,
    private readonly serverAddress: string,
    private readonly streamMode: DidimStreamMode,
    // v2 확장 파라미터
    readonly scenarioMyPageId: number = 0,
    readonly userId: string = '',
    initialThreadId?: string,
  ) {
    super(config);
    if (initialThreadId) {
      this.threadId = initialThreadId;
    }
  }

  // ==========================================================================
  // v1: Non-streaming
  // ==========================================================================

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

      if (parsed.threadId) {
        this.threadId = parsed.threadId;
      }

      return convertDidimResponseToLlm(parsed, request.model);
    } catch (error) {
      this.handleError(error);
    }
  }

  // ==========================================================================
  // v2: Streaming (tool-calling enabled)
  // ==========================================================================

  generateContentStream(
    request: LlmGenerateRequest,
    _userPromptId: string,
    options?: GenerateOptions,
  ): LlmEventStream {
    this.validateRequest(request);

    const chatText = this.extractChatText(request);
    const signal = options?.signal;

    // Ensure thread_id exists (auto-generate if not set)
    if (!this.threadId) {
      this.threadId = crypto.randomUUID();
    }

    // URL 구성을 lazy하게 처리하여 에러가 generator를 통해 yield되도록 함
    let url: string;
    try {
      url = this.buildV2Url('/api/v2/agent/chat');
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const providerName = this.providerName;
      async function* errorGenerator(): AsyncGenerator<
        LlmEvent,
        void,
        unknown
      > {
        yield createErrorEvent(
          new ValidationError(`Didim configuration error: ${message}`, {
            provider: providerName,
          }),
          undefined,
          false,
        );
      }
      return errorGenerator();
    }

    const v2Body = this.buildV2ChatBody(chatText);
    const headers = this.buildV2Headers();

    return this.createSseStream(url, headers, v2Body, signal);
  }

  /**
   * Submit tool execution results and resume the stream.
   * POST /api/v2/agent/tool-results
   *
   * @param results - Array of tool results
   * @param _userPromptId - User prompt ID for tracing
   * @param options - Optional signal for cancellation
   * @returns LlmEventStream of resume events
   */
  submitToolResults(
    results: DidimToolResult[],
    _userPromptId: string,
    options?: GenerateOptions,
  ): LlmEventStream {
    // 전제 상태 방어: thread_id 또는 checkpoint_id 없이 호출 시 에러
    if (!this.threadId || !this.lastCheckpointId) {
      const threadId = this.threadId;
      const checkpointId = this.lastCheckpointId;
      const providerName = this.providerName;
      async function* errorGenerator(): AsyncGenerator<
        LlmEvent,
        void,
        unknown
      > {
        yield createErrorEvent(
          new ValidationError(
            `submitToolResults requires prior tool_call event. ` +
              `thread_id=${threadId}, checkpoint_id=${checkpointId}`,
            { provider: providerName },
          ),
          undefined,
          false,
        );
      }
      return errorGenerator();
    }

    const url = this.buildV2Url('/api/v2/agent/tool-results');
    const headers = this.buildV2Headers();
    const body = {
      thread_id: this.threadId,
      checkpoint_id: this.lastCheckpointId,
      tool_results: results.map((r) => ({
        call_id: r.callId,
        name: r.name,
        result: r.result,
        is_error: r.isError ?? false,
      })),
    };

    return this.createSseStream(url, headers, body, options?.signal);
  }

  // ==========================================================================
  // v2 Request Builders
  // ==========================================================================

  private buildV2ChatBody(chatText: string): Record<string, unknown> {
    return {
      scenario_my_page_id: this.scenarioMyPageId,
      user_id: this.userId,
      thread_id: this.threadId,
      qa_id: crypto.randomUUID(),
      messages: [{ role: 'user', content: chatText }],
      execution_mode: 'external_tool_execution',
      channel_type: 'cli',
      client: getClientInfo(),
    };
  }

  private buildV2Url(path: string): string {
    const scheme = detectScheme(this.serverAddress);
    const domain = normalizeDidimDomain(this.serverAddress);
    if (!domain) {
      throw new ValidationError('Invalid domain provided', {
        provider: this.providerName,
      });
    }
    return `${scheme}://${domain}${path}`;
  }

  private buildV2Headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  // ==========================================================================
  // SSE Stream (shared by chat + tool-results)
  // ==========================================================================

  private createSseStream(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): LlmEventStream {
    const fetchFn = this.fetchFn;
    const streamMode = this.streamMode;
    const classify = this.classifyHttpError.bind(this);
    const storeThreadId = (id: string | null) => {
      if (id) this.threadId = id;
    };
    const storeCheckpointId = (id: string) => {
      this.lastCheckpointId = id;
    };

    async function* streamGenerator(): AsyncGenerator<LlmEvent, void, unknown> {
      try {
        const response = await fetchFn(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal,
        });

        // 202 partial → yield nothing (빈 스트림 반환).
        // CLI는 반드시 모든 tool 실행 결과를 배열로 모아서 한 번에 제출해야 합니다.
        // 결과를 1개씩 쪼개서 제출하면 202 → 빈 스트림이 반복되어
        // CLI가 대화 종료로 오인할 수 있습니다.
        if (response.status === 202) {
          return;
        }

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
        let hasDelta = false;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const rawLine of lines) {
              const line = rawLine.endsWith('\r')
                ? rawLine.slice(0, -1)
                : rawLine;

              if (line.startsWith('event:')) {
                currentEvent = line.substring(6).replace(/^ /, '').trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.substring(5).replace(/^ /, ''));
              } else if (line === '' && currentEvent) {
                const currentData = dataLines.join('\n');
                const sseEvent = parseDidimSseEvent(
                  currentEvent,
                  currentData,
                  streamMode,
                );

                if (sseEvent) {
                  // Store thread_id from done/finished events
                  if (sseEvent.type === 'done' && sseEvent.threadId) {
                    storeThreadId(sseEvent.threadId);
                  }

                  // Store checkpoint_id from tool_call events
                  if (sseEvent.type === 'tool_call' && sseEvent.checkpointId) {
                    storeCheckpointId(sseEvent.checkpointId);
                    if (sseEvent.threadId) {
                      storeThreadId(sseEvent.threadId);
                    }
                  }

                  if (sseEvent.type === 'delta') {
                    hasDelta = true;
                  }
                  if (sseEvent.type === 'final_message' && hasDelta) {
                    // Skip — content already streamed via deltas
                  } else {
                    const llmEvents = convertDidimSseToLlmEvents(sseEvent);
                    for (const llmEvent of llmEvents) {
                      yield llmEvent;
                    }
                  }
                }

                currentEvent = '';
                dataLines.length = 0;
              }
            }
          }

          // Flush remaining
          const trailing = decoder.decode();
          if (trailing) {
            buffer += trailing;
          }

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

  // ==========================================================================
  // Utilities
  // ==========================================================================

  private extractChatText(request: LlmGenerateRequest): string {
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

  private buildEndpointUrl(streaming?: boolean): string {
    try {
      return getDidimEndpoint(
        this.serverAddress,
        streaming
          ? { streaming: true, streamMode: this.streamMode }
          : undefined,
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new ValidationError(`Didim configuration error: ${message}`, {
        provider: this.providerName,
      });
    }
  }

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

  protected mapToProviderConfig(
    _config: LlmGenerateConfig,
  ): Record<string, unknown> {
    return {};
  }
}
