/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * History builder for non-Gemini provider responses.
 *
 * Accumulates LlmEvent stream events into a Gemini Content object
 * suitable for storing in GeminiChat's Content[] history.
 *
 * Also collects pending tool calls and response text for Turn-compatible
 * return values.
 *
 * @see packages/core/src/core/client.ts — processLlmTurn()
 */

import type { Content, Part } from '@google/genai';
import { LlmEventType } from '../events.js';
import type {
  LlmEvent,
  LlmTextDeltaEvent,
  LlmToolCallRequestEvent,
  LlmFinishedEvent,
  LlmFinishReason,
} from '../events.js';
import type { ToolCallRequestInfo } from '../../scheduler/types.js';

/**
 * Accumulates LlmEvent events into a Gemini Content for history storage.
 *
 * Collects text deltas, tool call requests, and finish information
 * from the LlmEvent stream produced by non-Gemini adapters.
 */
export class LlmResponseAccumulator {
  private readonly textChunks: string[] = [];
  private readonly toolCalls: ToolCallRequestInfo[] = [];
  private readonly functionCallParts: Part[] = [];
  private finishReason: LlmFinishReason | undefined;
  private errorOccurred = false;

  constructor(private readonly promptId: string) {}

  /**
   * Add an LlmEvent to the accumulator.
   * Only content-producing events (TextDelta, ToolCallRequest, Finished, Error)
   * are processed; other events are silently ignored.
   */
  addEvent(event: LlmEvent): void {
    switch (event.type) {
      case LlmEventType.TextDelta:
        this.handleTextDelta(event);
        break;
      case LlmEventType.ToolCallRequest:
        this.handleToolCallRequest(event);
        break;
      case LlmEventType.Finished:
        this.handleFinished(event);
        break;
      case LlmEventType.Error:
        this.errorOccurred = true;
        break;
      default:
        // Silently ignore non-content events (Retry, ModelInfo, etc.)
        break;
    }
  }

  /**
   * Build a Gemini Content object from accumulated events.
   * Suitable for storing in GeminiChat's Content[] history.
   */
  toContent(): Content {
    const parts: Part[] = [];

    // Add accumulated text as a single text part
    const text = this.textChunks.join('');
    if (text) {
      parts.push({ text });
    }

    // Add function call parts
    parts.push(...this.functionCallParts);

    return { role: 'model', parts };
  }

  /**
   * Get the concatenated response text from all TextDelta events.
   */
  getResponseText(): string {
    return this.textChunks.join('');
  }

  /**
   * Get the collected pending tool calls for the agentic loop.
   */
  getPendingToolCalls(): ToolCallRequestInfo[] {
    return [...this.toolCalls];
  }

  /**
   * Get the finish reason from the Finished event.
   */
  getFinishReason(): LlmFinishReason | undefined {
    return this.finishReason;
  }

  /**
   * Check if an error occurred during streaming.
   */
  hasError(): boolean {
    return this.errorOccurred;
  }

  // ============================================================================
  // Private handlers
  // ============================================================================

  private handleTextDelta(event: LlmTextDeltaEvent): void {
    this.textChunks.push(event.text);
  }

  private handleToolCallRequest(event: LlmToolCallRequestEvent): void {
    // Collect tool call info for the agentic loop (Turn-compatible)
    this.toolCalls.push({
      callId: event.callId,
      name: event.name,
      args: event.args,
      isClientInitiated: event.isClientInitiated ?? false,
      prompt_id: this.promptId,
      traceId: event.traceId,
    });

    // Collect as Gemini Part for history Content.
    // Include id for callId round-trip (non-Gemini tool response matching).
    this.functionCallParts.push({
      functionCall: {
        id: event.callId,
        name: event.name,
        args: event.args,
      },
    });
  }

  private handleFinished(event: LlmFinishedEvent): void {
    this.finishReason = event.finishReason;
  }
}
