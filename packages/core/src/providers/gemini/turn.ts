/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  PartListUnion,
  GenerateContentResponse,
  FunctionCall,
  FinishReason,
} from '@google/genai';

import { getResponseText } from '../../utils/partUtils.js';
import { reportError } from '../../utils/errorReporting.js';
import {
  getErrorMessage,
  UnauthorizedError,
  toFriendlyError,
} from '../../utils/errors.js';
import type { GeminiChat } from './chat.js';
import { InvalidStreamError } from './chat.js';
import { parseThought } from '../../utils/thoughtUtils.js';
import { createUserContent } from '@google/genai';
import type { ModelConfigKey } from '../../services/modelConfigService.js';
import { getCitations } from '../../utils/generateContentResponseUtilities.js';
import { type ToolCallRequestInfo } from '../../scheduler/types.js';
import {
  LlmEventType,
  type LlmEvent,
  type LlmFinishReason,
} from '../events.js';
import type { LlmTokenUsage } from '../types.js';

// =============================================================================
// Re-exports for backward compatibility
// These types have been moved to providers/gemini/types.ts
// @deprecated — Use LlmEventType and LlmEvent from providers/events.ts instead
// =============================================================================
export {
  GeminiEventType,
  CompressionStatus,
  type ServerGeminiRetryEvent,
  type ServerGeminiAgentExecutionStoppedEvent,
  type ServerGeminiAgentExecutionBlockedEvent,
  type ServerGeminiContextWindowWillOverflowEvent,
  type ServerGeminiInvalidStreamEvent,
  type ServerGeminiModelInfoEvent,
  type ServerGeminiContentEvent,
  type ServerGeminiThoughtEvent,
  type ServerGeminiToolCallRequestEvent,
  type ServerGeminiToolCallResponseEvent,
  type ServerGeminiToolCallConfirmationEvent,
  type ServerGeminiUserCancelledEvent,
  type ServerGeminiErrorEvent,
  type ServerGeminiChatCompressedEvent,
  type ServerGeminiMaxSessionTurnsEvent,
  type ServerGeminiFinishedEvent,
  type ServerGeminiLoopDetectedEvent,
  type ServerGeminiCitationEvent,
  type ServerGeminiStreamEvent,
  type StructuredError,
  type GeminiErrorEventValue,
  type GeminiFinishedEventValue,
  type ServerToolCallConfirmationDetails,
  type ChatCompressionInfo,
} from './types.js';

// Re-export LlmEventType and LlmEvent for consumers migrating to new types
export {
  LlmEventType,
  type LlmEvent,
  type LlmFinishReason,
} from '../events.js';
// =============================================================================

/**
 * Maps Gemini FinishReason to provider-independent LlmFinishReason.
 */
function mapFinishReason(reason: FinishReason | undefined): LlmFinishReason {
  if (!reason) return 'unknown';
  switch (reason) {
    case 'STOP':
      return 'end_turn';
    case 'MAX_TOKENS':
      return 'max_tokens';
    case 'SAFETY':
    case 'RECITATION':
    case 'BLOCKLIST':
    case 'PROHIBITED_CONTENT':
    case 'SPII':
      return 'content_filter';
    default:
      return 'unknown';
  }
}

/**
 * Maps Gemini UsageMetadata to provider-independent LlmTokenUsage.
 */
function mapUsageMetadata(
  usageMetadata: GenerateContentResponse['usageMetadata'] | undefined,
): LlmTokenUsage | undefined {
  if (!usageMetadata) return undefined;
  return {
    promptTokens: usageMetadata.promptTokenCount || 0,
    completionTokens: usageMetadata.candidatesTokenCount || 0,
    totalTokens: usageMetadata.totalTokenCount || 0,
  };
}

// A turn manages the agentic loop turn within the server context.
export class Turn {
  readonly pendingToolCalls: ToolCallRequestInfo[] = [];
  private debugResponses: GenerateContentResponse[] = [];
  private pendingCitations = new Set<string>();
  finishReason: FinishReason | undefined = undefined;

  constructor(
    private readonly chat: GeminiChat,
    private readonly prompt_id: string,
  ) {}

  // The run method yields provider-independent LlmEvent events
  async *run(
    modelConfigKey: ModelConfigKey,
    req: PartListUnion,
    signal: AbortSignal,
  ): AsyncGenerator<LlmEvent> {
    try {
      // Note: This assumes `sendMessageStream` yields events like
      // { type: StreamEventType.RETRY } or { type: StreamEventType.CHUNK, value: GenerateContentResponse }
      const responseStream = await this.chat.sendMessageStream(
        modelConfigKey,
        req,
        this.prompt_id,
        signal,
      );

      for await (const streamEvent of responseStream) {
        if (signal?.aborted) {
          yield { type: LlmEventType.UserCancelled };
          return;
        }

        // Handle the new RETRY event
        if (streamEvent.type === 'retry') {
          yield { type: LlmEventType.Retry };
          continue; // Skip to the next event in the stream
        }

        if (streamEvent.type === 'agent_execution_stopped') {
          yield {
            type: LlmEventType.AgentStopped,
            reason: streamEvent.reason,
          };
          return;
        }

        if (streamEvent.type === 'agent_execution_blocked') {
          yield {
            type: LlmEventType.AgentBlocked,
            reason: streamEvent.reason,
          };
          continue;
        }

        // Assuming other events are chunks with a `value` property
        const resp = streamEvent.value;
        if (!resp) continue; // Skip if there's no response body

        this.debugResponses.push(resp);

        const traceId = resp.responseId;

        const parts = resp.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.thought) {
            const thought = parseThought(part.text ?? '');
            yield {
              type: LlmEventType.ThoughtDelta,
              thought: thought.description,
              traceId,
              metadata: { subject: thought.subject },
            };
          }
        }

        const text = getResponseText(resp);
        if (text) {
          yield { type: LlmEventType.TextDelta, text, traceId };
        }

        // Handle function calls (requesting tool execution)
        const functionCalls = resp.functionCalls ?? [];
        for (const fnCall of functionCalls) {
          const event = this.handlePendingFunctionCall(fnCall, traceId);
          if (event) {
            yield event;
          }
        }

        for (const citation of getCitations(resp)) {
          this.pendingCitations.add(citation);
        }

        // Check if response was truncated or stopped for various reasons
        const finishReason = resp.candidates?.[0]?.finishReason;

        // This is the key change: Only yield 'Finished' if there is a finishReason.
        if (finishReason) {
          if (this.pendingCitations.size > 0) {
            const citationText = `Citations:\n${[...this.pendingCitations].sort().join('\n')}`;
            yield {
              type: LlmEventType.Citation,
              citations: [{ url: citationText }],
            };
            this.pendingCitations.clear();
          }

          this.finishReason = finishReason;
          yield {
            type: LlmEventType.Finished,
            finishReason: mapFinishReason(finishReason),
            usage: mapUsageMetadata(resp.usageMetadata),
          };
        }
      }
    } catch (e) {
      if (signal.aborted) {
        yield { type: LlmEventType.UserCancelled };
        // Regular cancellation error, fail gracefully.
        return;
      }

      if (e instanceof InvalidStreamError) {
        yield { type: LlmEventType.InvalidStream };
        return;
      }

      const error = toFriendlyError(e);
      if (error instanceof UnauthorizedError) {
        throw error;
      }

      const contextForReport = [
        ...this.chat.getHistory(/*curated*/ true),
        createUserContent(req),
      ];
      await reportError(
        error,
        'Error when talking to Gemini API',
        contextForReport,
        'Turn.run-sendMessageStream',
      );
      const status =
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof (error as { status: unknown }).status === 'number'
          ? (error as { status: number }).status
          : undefined;
      const structuredError = {
        message: getErrorMessage(error),
        status,
      };
      await this.chat.maybeIncludeSchemaDepthContext(structuredError);
      yield {
        type: LlmEventType.Error,
        error: structuredError.message,
        code: status?.toString(),
      };
      return;
    }
  }

  private handlePendingFunctionCall(
    fnCall: FunctionCall,
    traceId?: string,
  ): LlmEvent | null {
    const callId = fnCall.id ?? crypto.randomUUID();
    const name = fnCall.name || 'undefined_tool_name';
    const args = fnCall.args || {};

    const toolCallRequest: ToolCallRequestInfo = {
      callId,
      name,
      args,
      isClientInitiated: false,
      prompt_id: this.prompt_id,
      traceId,
    };

    this.pendingToolCalls.push(toolCallRequest);

    // Yield a request for the tool call
    return {
      type: LlmEventType.ToolCallRequest,
      callId,
      name,
      args,
      isClientInitiated: false,
      promptId: this.prompt_id,
      traceId,
    };
  }

  getDebugResponses(): GenerateContentResponse[] {
    return this.debugResponses;
  }

  /**
   * Get the concatenated response text from all responses in this turn.
   * This extracts and joins all text content from the model's responses.
   */
  getResponseText(): string {
    return this.debugResponses
      .map((response) => getResponseText(response))
      .filter((text): text is string => text !== null)
      .join(' ');
  }
}
