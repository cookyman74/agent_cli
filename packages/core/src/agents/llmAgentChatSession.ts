/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview LlmAgentChatSession — AgentChatSession implementation for non-Gemini providers.
 *
 * Bridges the provider-independent `llmGenerateContentStream()` API with the
 * legacy `StreamEvent` protocol consumed by `local-executor.ts`.
 *
 * Key design decisions:
 * - Dependency Injection: all external functions injected via constructor for testability
 * - StreamEvent compatibility: constructs partial `GenerateContentResponse` objects
 *   with the exact fields accessed by `callModel()` in local-executor.ts:
 *   `chunk.candidates?.[0]?.content?.parts`, `chunk.functionCalls`,
 *   `parts?.find(p => p.thought)?.text`
 * - Error → throw: LlmEventType.Error throws immediately (not yielded as StreamEvent)
 * - History management: Gemini Content[] format for compatibility with local-executor
 */
import type {
  Content,
  GenerateContentResponse,
  Part,
  PartListUnion,
  Tool,
} from '@google/genai';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';

import { LlmEventType } from '../providers/events.js';
import type { LlmEvent } from '../providers/events.js';
import { StreamEventType } from '../providers/gemini/chat.js';
import type { StreamEvent } from '../providers/gemini/chat.js';
import type {
  LlmGenerateRequest,
  LlmMessage,
  LlmTokenUsage,
} from '../providers/types.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';

import type { AgentChatSession } from './types.js';

// ─── convertLlmEventToStreamEvent ────────────────────────────────

/**
 * Converts a provider-independent LlmEvent into a legacy StreamEvent
 * compatible with local-executor's `callModel()`.
 *
 * Returns null for events that don't map to StreamEvent
 * (Finished, MessageEnd, Error — handled separately by the session).
 */
export function convertLlmEventToStreamEvent(
  event: LlmEvent,
): StreamEvent | null {
  switch (event.type) {
    case LlmEventType.TextDelta:
      return {
        type: StreamEventType.CHUNK,
        value: {
          candidates: [
            {
              content: {
                parts: [{ text: event.text }],
              },
            },
          ],
        } as GenerateContentResponse,
      };

    case LlmEventType.ThoughtDelta:
      return {
        type: StreamEventType.CHUNK,
        value: {
          candidates: [
            {
              content: {
                parts: [{ text: event.thought, thought: true }],
              },
            },
          ],
        } as GenerateContentResponse,
      };

    case LlmEventType.ToolCallRequest:
      return {
        type: StreamEventType.CHUNK,
        value: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      id: event.callId,
                      name: event.name,
                      args: event.args,
                    },
                  },
                ],
              },
            },
          ],
          functionCalls: [
            {
              id: event.callId,
              name: event.name,
              args: event.args,
            },
          ],
        } as GenerateContentResponse,
      };

    case LlmEventType.Retry:
      return { type: StreamEventType.RETRY };

    case LlmEventType.AgentStopped:
      return {
        type: StreamEventType.AGENT_EXECUTION_STOPPED,
        reason: event.reason ?? 'stopped',
      };

    case LlmEventType.AgentBlocked:
      return {
        type: StreamEventType.AGENT_EXECUTION_BLOCKED,
        reason: event.reason ?? 'blocked',
      };

    default:
      // Finished, MessageEnd, Error, and all other events → null
      return null;
  }
}

// ─── LlmAgentChatSession ─────────────────────────────────────────

/**
 * Constructor options for LlmAgentChatSession.
 * All external dependencies are injected for testability.
 */
/**
 * Generation parameters resolved from model config aliases/overrides.
 * Maps to GenerateContentConfig fields from @google/genai SDK.
 */
export interface ResolvedGenerateConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
}

export interface LlmAgentChatSessionOptions {
  /** Content generator with llm* methods */
  generator: {
    llmGenerateContentStream: (
      request: LlmGenerateRequest,
      promptId: string,
      options?: { signal?: AbortSignal },
    ) => AsyncGenerator<LlmEvent>;
  };
  /** Provider name (e.g., 'claude', 'openai') */
  providerName: string;
  /** System instruction for the model */
  systemInstruction: string | undefined;
  /** Available tools */
  tools: Tool[];
  /** Initial conversation history in Gemini Content[] format */
  initialHistory: Content[];

  // Injectable dependencies for testing
  resolveProviderModelFn: (model: string, providerName: string) => string;
  buildLlmRequestFn: (options: {
    history: LlmMessage[];
    systemInstruction: string | undefined;
    tools: Tool[];
  }) => LlmGenerateRequest;
  fixToolResultRolesFn: (messages: LlmMessage[]) => LlmMessage[];
  convertContentsToLlmMessagesFn: (contents: Content[]) => LlmMessage[];

  /**
   * Resolves generation parameters (temperature, topP, maxOutputTokens, etc.)
   * from a ModelConfigKey. Used to propagate agent alias/override config
   * to non-Gemini provider requests. [리뷰 #1]
   */
  resolveGenerateConfigFn?: (
    key: ModelConfigKey,
  ) => ResolvedGenerateConfig | undefined;
}

/**
 * AgentChatSession implementation that uses provider-independent
 * `llmGenerateContentStream()` and converts events to legacy StreamEvent.
 *
 * Used when a non-Gemini provider is selected (Claude, OpenAI, etc.)
 * and injected into `LocalAgentExecutor.create()` via `ChatSessionFactory`.
 */
export class LlmAgentChatSession implements AgentChatSession {
  private readonly generator: LlmAgentChatSessionOptions['generator'];
  private readonly providerName: string;
  private readonly systemInstruction: string | undefined;
  private readonly tools: Tool[];
  private history: Content[];
  private lastPromptTokenCount = 0;

  // Injected dependencies
  private readonly resolveProviderModelFn: LlmAgentChatSessionOptions['resolveProviderModelFn'];
  private readonly buildLlmRequestFn: LlmAgentChatSessionOptions['buildLlmRequestFn'];
  private readonly fixToolResultRolesFn: LlmAgentChatSessionOptions['fixToolResultRolesFn'];
  private readonly convertContentsToLlmMessagesFn: LlmAgentChatSessionOptions['convertContentsToLlmMessagesFn'];
  private readonly resolveGenerateConfigFn: LlmAgentChatSessionOptions['resolveGenerateConfigFn'];

  constructor(options: LlmAgentChatSessionOptions) {
    this.generator = options.generator;
    this.providerName = options.providerName;
    this.systemInstruction = options.systemInstruction;
    this.tools = options.tools;
    this.history = [...options.initialHistory];
    this.resolveProviderModelFn = options.resolveProviderModelFn;
    this.buildLlmRequestFn = options.buildLlmRequestFn;
    this.fixToolResultRolesFn = options.fixToolResultRolesFn;
    this.convertContentsToLlmMessagesFn =
      options.convertContentsToLlmMessagesFn;
    this.resolveGenerateConfigFn = options.resolveGenerateConfigFn;
  }

  // ─── AgentChatSession interface ──────────────────────────────────

  async sendMessageStream(
    modelConfigKey: ModelConfigKey,
    message: PartListUnion,
    promptId: string,
    signal: AbortSignal,
  ): Promise<AsyncGenerator<StreamEvent>> {
    // 1. Resolve provider model from config alias
    const resolvedModel = this.resolveProviderModelFn(
      modelConfigKey.model,
      this.providerName,
    );

    // 2. Add user content to history BEFORE streaming (Gemini convention)
    // PartListUnion = (Part | string)[] | Part | string → convert to Part[]
    const rawParts = Array.isArray(message) ? message : [message];
    const parts: Part[] = rawParts.map((p) =>
      typeof p === 'string' ? { text: p } : p,
    );
    const userContent: Content = { role: 'user', parts };
    this.history.push(userContent);

    // 3. Build LLM request from current state
    const llmMessages = this.convertContentsToLlmMessagesFn(this.history);
    const request = this.buildLlmRequestFn({
      history: llmMessages,
      systemInstruction: this.systemInstruction,
      tools: this.tools,
    });

    // 4. Apply fixToolResultRoles and override model
    request.messages = this.fixToolResultRolesFn(request.messages);
    request.model = resolvedModel;

    // 4b. Apply generation config from model config aliases/overrides [리뷰 #1]
    if (this.resolveGenerateConfigFn) {
      const genConfig = this.resolveGenerateConfigFn(modelConfigKey);
      if (genConfig) {
        if (genConfig.temperature != null)
          request.temperature = genConfig.temperature;
        if (genConfig.topP != null) request.topP = genConfig.topP;
        if (genConfig.topK != null) request.topK = genConfig.topK;
        if (genConfig.maxOutputTokens != null)
          request.maxTokens = genConfig.maxOutputTokens;
        if (genConfig.stopSequences != null)
          request.stopSequences = genConfig.stopSequences;
      }
    }

    // 5. Call provider stream (returns AsyncGenerator directly, not Promise)
    const eventStream = this.generator.llmGenerateContentStream(
      request,
      promptId,
      { signal },
    );

    // 6. Return async generator that converts LlmEvent → StreamEvent
    return this.processEventStream(eventStream);
  }

  setHistory(history: Content[]): void {
    this.history = history;
    // Recalculate token count to keep compression threshold accurate [리뷰 #5]
    this.lastPromptTokenCount = estimateTokenCountSync(
      this.history.flatMap((c) => c.parts || []),
    );
  }

  getHistory(_curated?: boolean): Content[] {
    // Return a deep copy to prevent external mutation of internal state [리뷰 #2]
    return structuredClone(this.history);
  }

  getLastPromptTokenCount(): number {
    return this.lastPromptTokenCount;
  }

  // ─── Internal ────────────────────────────────────────────────────

  /**
   * Processes the LlmEvent stream: yields StreamEvents, tracks usage,
   * and adds model response to history after successful completion.
   */
  private async *processEventStream(
    eventStream: AsyncGenerator<LlmEvent>,
  ): AsyncGenerator<StreamEvent> {
    let responseText = '';
    const functionCalls: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
    }> = [];
    let hasError = false;

    for await (const event of eventStream) {
      // Track usage from Finished and MessageEnd events
      if (event.type === LlmEventType.Finished) {
        this.updateUsage(event.usage);
        continue;
      }
      if (event.type === LlmEventType.MessageEnd) {
        this.updateUsage(event.usage);
        continue;
      }

      // Error → throw (not yielded as StreamEvent)
      if (event.type === LlmEventType.Error) {
        hasError = true;
        const err = event.error;
        throw err instanceof Error ? err : new Error(String(err));
      }

      // Accumulate text and tool calls for history
      if (event.type === LlmEventType.TextDelta) {
        responseText += event.text;
      }
      if (event.type === LlmEventType.ToolCallRequest) {
        functionCalls.push({
          id: event.callId,
          name: event.name,
          args: event.args,
        });
      }

      // Convert to StreamEvent and yield if mappable
      const streamEvent = convertLlmEventToStreamEvent(event);
      if (streamEvent) {
        yield streamEvent;
      }
    }

    // Add model response to history after successful stream completion
    if (!hasError) {
      this.addModelResponseToHistory(responseText, functionCalls);
    }
  }

  /**
   * Updates last prompt token count from usage data.
   */
  private updateUsage(usage?: LlmTokenUsage): void {
    if (usage?.promptTokens != null) {
      this.lastPromptTokenCount = usage.promptTokens;
    }
  }

  /**
   * Adds the accumulated model response to history in Gemini Content format.
   */
  private addModelResponseToHistory(
    text: string,
    functionCalls: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
    }>,
  ): void {
    const parts: Array<Record<string, unknown>> = [];

    if (text) {
      parts.push({ text });
    }

    for (const fc of functionCalls) {
      parts.push({
        functionCall: { id: fc.id, name: fc.name, args: fc.args },
      });
    }

    if (parts.length > 0) {
      this.history.push({
        role: 'model',
        parts,
      } as Content);
    }
  }
}
