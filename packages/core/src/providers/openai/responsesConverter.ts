/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAiResponsesConverter — converts between provider-independent Llm* types
 * and OpenAI Responses API format (`/v1/responses`).
 *
 * Used by OpenAiAdapter to translate requests/responses for models that
 * require the Responses API (e.g., gpt-5.3-codex, gpt-5.4-pro).
 *
 * Key differences from Chat Completions:
 *   - Request uses `input` (not `messages`), `developer` role (not `system`)
 *   - Response uses `output` items (not `choices`), `output_text`
 *   - Usage fields: `input_tokens`/`output_tokens` (not `prompt_tokens`/`completion_tokens`)
 *   - Streaming uses typed events (not chunks with choices[].delta)
 */

import crypto from 'node:crypto';
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmMessage,
  LlmContent,
  LlmToolDefinition,
  LlmToolChoice,
  LlmStopReason,
  LlmTokenUsage,
} from '../types.js';
import type { LlmEvent, LlmFinishReason } from '../events.js';
import { LlmEventType } from '../events.js';

/**
 * Stream processing state for Responses API streaming.
 */
export interface ResponsesStreamState {
  /** Accumulated function call arguments by item_id. */
  functionCalls: Record<
    string,
    {
      callId: string;
      name: string;
      argumentsJson: string;
    }
  >;
  /** Whether a Finished event has been emitted. */
  finishedEmitted: boolean;
}

/**
 * Converts between provider-independent types and OpenAI Responses API types.
 */
export class OpenAiResponsesConverter {
  // ============================================================================
  // Request Conversion: Llm → Responses API
  // ============================================================================

  /**
   * Convert LlmGenerateRequest to Responses API params.
   */
  toResponsesRequest(request: LlmGenerateRequest): Record<string, unknown> {
    const input = this.toResponsesInput(
      request.messages,
      request.systemInstruction,
    );

    const params: Record<string, unknown> = {
      model: request.model,
      input,
    };

    // Generation parameters
    if (request.maxTokens !== undefined && request.maxTokens > 0) {
      params['max_output_tokens'] = request.maxTokens;
    }
    if (request.temperature !== undefined) {
      params['temperature'] = request.temperature;
    }
    if (request.topP !== undefined) {
      params['top_p'] = request.topP;
    }

    // Tools
    if (request.tools && request.tools.length > 0) {
      params['tools'] = this.toResponsesTools(request.tools);
    }

    if (request.toolChoice) {
      params['tool_choice'] = this.toResponsesToolChoice(request.toolChoice);
    }

    // Response format
    if (request.responseFormat === 'json') {
      params['text'] = { format: { type: 'json_object' } };
    }

    return params;
  }

  /**
   * Convert LlmMessage[] + systemInstruction to Responses API input array.
   *
   * Key difference: `system` role → `developer` role in Responses API.
   */
  toResponsesInput(
    messages: LlmMessage[],
    systemInstruction?: string,
  ): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];

    // System instruction → developer role
    if (systemInstruction) {
      result.push({ role: 'developer', content: systemInstruction });
    }

    for (const msg of messages) {
      const converted = this.convertSingleMessage(msg);
      if (converted) {
        result.push(converted);
      }
    }

    return result;
  }

  /**
   * Convert LlmToolDefinition[] to Responses API tools format.
   * Responses API uses flat format: { type, name, description, parameters }
   * (NOT the nested { type, function: { name, ... } } format of Chat Completions).
   */
  toResponsesTools(tools: LlmToolDefinition[]): Array<Record<string, unknown>> {
    return tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: {
        type: tool.parameters.type,
        properties: tool.parameters.properties,
        ...(tool.parameters.required
          ? { required: tool.parameters.required }
          : {}),
      },
    }));
  }

  /**
   * Convert LlmToolChoice to Responses API tool_choice.
   */
  toResponsesToolChoice(
    choice: LlmToolChoice,
  ): string | Record<string, unknown> {
    if (typeof choice === 'string') {
      return choice;
    }
    return { type: 'function', name: choice.name };
  }

  // ============================================================================
  // Response Conversion: Responses API → Llm
  // ============================================================================

  /**
   * Convert Responses API response to LlmGenerateResponse.
   */
  fromResponsesResponse(response: unknown, model: string): LlmGenerateResponse {
    const resp = response as Record<string, unknown>;
    const output = (resp['output'] as Array<Record<string, unknown>>) ?? [];

    return {
      id: (resp['id'] as string) ?? crypto.randomUUID(),
      content: this.fromResponsesOutput(output),
      model: (resp['model'] as string) ?? model,
      stopReason: this.mapResponsesStatus(resp['status'] as string, output),
      usage: this.extractResponsesUsage(resp),
      rawResponse: response,
    };
  }

  /**
   * Convert Responses API output items to LlmContent[].
   */
  fromResponsesOutput(output: Array<Record<string, unknown>>): LlmContent[] {
    const contents: LlmContent[] = [];

    for (const item of output) {
      const type = item['type'] as string;

      if (type === 'message') {
        const contentParts =
          (item['content'] as Array<Record<string, unknown>>) ?? [];
        for (const part of contentParts) {
          if (part['type'] === 'output_text') {
            const text = part['text'] as string;
            if (text) {
              contents.push({ type: 'text', text });
            }
          }
        }
      } else if (type === 'function_call') {
        const argsStr = (item['arguments'] as string) ?? '{}';
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(argsStr);
        } catch {
          args = {};
        }
        contents.push({
          type: 'tool_call',
          id: (item['call_id'] as string) ?? '',
          name: (item['name'] as string) ?? '',
          arguments: args,
        });
      }
    }

    return contents;
  }

  /**
   * Map Responses API status + output to LlmStopReason.
   */
  mapResponsesStatus(
    status: string | undefined,
    output: Array<Record<string, unknown>>,
  ): LlmStopReason {
    // Check if any output item is a function_call → tool_use
    const hasToolCall = output.some((item) => item['type'] === 'function_call');
    if (hasToolCall) {
      return 'tool_use';
    }

    switch (status) {
      case 'completed':
        return 'end_turn';
      case 'incomplete':
        return 'max_tokens';
      case 'failed':
      case 'cancelled':
        return 'end_turn';
      default:
        return 'end_turn';
    }
  }

  /**
   * Extract token usage from Responses API response.
   */
  private extractResponsesUsage(
    response: Record<string, unknown>,
  ): LlmTokenUsage {
    const usage = response['usage'] as Record<string, unknown> | undefined;
    const inputTokens = (usage?.['input_tokens'] as number) ?? 0;
    const outputTokens = (usage?.['output_tokens'] as number) ?? 0;

    const inputDetails = usage?.['input_tokens_details'] as
      | Record<string, unknown>
      | undefined;
    const cachedTokens = (inputDetails?.['cached_tokens'] as number) ?? 0;

    return {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      cachedTokens,
    };
  }

  // ============================================================================
  // Stream Event Conversion
  // ============================================================================

  /**
   * Create a new stream state for Responses API streaming.
   */
  createStreamState(): ResponsesStreamState {
    return { functionCalls: {}, finishedEmitted: false };
  }

  /**
   * Convert a single Responses API stream event to LlmEvent[].
   *
   * Responses API stream event types:
   * - response.output_text.delta → TextDelta
   * - response.output_item.added (function_call) → track in state
   * - response.function_call_arguments.delta → accumulate in state
   * - response.function_call_arguments.done → ToolCallRequest
   * - response.completed → Finished + MessageEnd with usage
   */
  convertStreamEvent(event: unknown, state: ResponsesStreamState): LlmEvent[] {
    const evt = event as Record<string, unknown>;
    const type = evt['type'] as string;

    switch (type) {
      case 'response.output_text.delta':
        return this.handleTextDelta(evt);

      case 'response.output_item.added':
        return this.handleOutputItemAdded(evt, state);

      case 'response.function_call_arguments.delta':
        return this.handleFunctionCallDelta(evt, state);

      case 'response.function_call_arguments.done':
        return this.handleFunctionCallDone(evt, state);

      case 'response.completed':
        return this.handleResponseCompleted(evt, state);

      default:
        return [];
    }
  }

  // ============================================================================
  // Stream Private Helpers
  // ============================================================================

  private handleTextDelta(evt: Record<string, unknown>): LlmEvent[] {
    const delta = evt['delta'] as string | undefined;
    if (!delta) return [];
    return [{ type: LlmEventType.TextDelta, text: delta }];
  }

  private handleOutputItemAdded(
    evt: Record<string, unknown>,
    state: ResponsesStreamState,
  ): LlmEvent[] {
    const item = evt['item'] as Record<string, unknown> | undefined;
    if (!item || item['type'] !== 'function_call') return [];

    const callId = (item['call_id'] as string) ?? '';
    const itemId = (item['id'] as string) ?? callId;
    state.functionCalls[itemId] = {
      callId,
      name: (item['name'] as string) ?? '',
      argumentsJson: (item['arguments'] as string) ?? '',
    };

    return [];
  }

  private handleFunctionCallDelta(
    evt: Record<string, unknown>,
    state: ResponsesStreamState,
  ): LlmEvent[] {
    const itemId = evt['item_id'] as string;
    const delta = evt['delta'] as string;
    const existing = state.functionCalls[itemId];
    if (existing && delta) {
      existing.argumentsJson += delta;
    }
    return [];
  }

  private handleFunctionCallDone(
    evt: Record<string, unknown>,
    state: ResponsesStreamState,
  ): LlmEvent[] {
    // Use the complete item from the done event
    const item = evt['item'] as Record<string, unknown> | undefined;
    const itemId = (evt['item_id'] as string) ?? '';

    let callId: string;
    let name: string;
    let argsStr: string;

    if (item) {
      callId = (item['call_id'] as string) ?? '';
      name = (item['name'] as string) ?? '';
      argsStr = (item['arguments'] as string) ?? '{}';
    } else {
      // Fallback to accumulated state
      const fc = state.functionCalls[itemId];
      if (!fc) return [];
      callId = fc.callId;
      name = fc.name;
      argsStr = fc.argumentsJson || '{}';
    }

    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsStr);
    } catch {
      args = {};
    }

    // Clean up state
    delete state.functionCalls[itemId];

    return [
      {
        type: LlmEventType.ToolCallRequest,
        callId,
        name,
        args,
      },
    ];
  }

  private handleResponseCompleted(
    evt: Record<string, unknown>,
    state: ResponsesStreamState,
  ): LlmEvent[] {
    const events: LlmEvent[] = [];
    const response = evt['response'] as Record<string, unknown> | undefined;

    // Determine finish reason from response
    const output =
      (response?.['output'] as Array<Record<string, unknown>>) ?? [];
    const hasToolCall = output.some((o) => o['type'] === 'function_call');
    const finishReason: LlmFinishReason = hasToolCall ? 'tool_use' : 'end_turn';

    if (!state.finishedEmitted) {
      events.push({
        type: LlmEventType.Finished,
        finishReason,
      });
      state.finishedEmitted = true;
    }

    // Extract usage
    const usage = response?.['usage'] as Record<string, unknown> | undefined;
    const inputTokens = (usage?.['input_tokens'] as number) ?? 0;
    const outputTokens = (usage?.['output_tokens'] as number) ?? 0;
    const inputDetails = usage?.['input_tokens_details'] as
      | Record<string, unknown>
      | undefined;
    const cachedTokens = (inputDetails?.['cached_tokens'] as number) ?? 0;

    events.push({
      type: LlmEventType.MessageEnd,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: inputTokens + outputTokens,
        cachedTokens,
      },
    });

    return events;
  }

  // ============================================================================
  // Private Message Helpers
  // ============================================================================

  /**
   * Convert a single LlmMessage to a Responses API input message.
   *
   * Note: `system` role → `developer` role in Responses API.
   */
  private convertSingleMessage(
    msg: LlmMessage,
  ): Record<string, unknown> | null {
    switch (msg.role) {
      case 'system':
        return this.convertSystemMessage(msg);
      case 'user':
        return this.convertUserMessage(msg);
      case 'assistant':
        return this.convertAssistantMessage(msg);
      case 'tool':
        return this.convertToolMessage(msg);
      default:
        return null;
    }
  }

  private convertSystemMessage(
    msg: LlmMessage,
  ): Record<string, unknown> | null {
    const text = this.extractTextContent(msg.content);
    if (!text) return null;
    // Responses API uses "developer" role instead of "system"
    return { role: 'developer', content: text };
  }

  private convertUserMessage(msg: LlmMessage): Record<string, unknown> | null {
    const text = this.extractTextContent(msg.content);
    if (!text) return null;
    return { role: 'user', content: text };
  }

  private convertAssistantMessage(
    msg: LlmMessage,
  ): Record<string, unknown> | null {
    const text = this.extractTextContent(msg.content);
    if (!text) return null;
    return { role: 'assistant', content: text };
  }

  private convertToolMessage(msg: LlmMessage): Record<string, unknown> | null {
    const toolResult = msg.content.find((c) => c.type === 'tool_result');
    if (!toolResult || toolResult.type !== 'tool_result') return null;

    let output: string;
    if (typeof toolResult.content === 'string') {
      output = toolResult.content;
    } else {
      try {
        output = JSON.stringify(toolResult.content);
      } catch {
        output = String(toolResult.content);
      }
    }

    return {
      type: 'function_call_output',
      call_id: toolResult.toolCallId,
      output,
    };
  }

  private extractTextContent(contents: LlmContent[]): string | null {
    const texts = contents
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .filter(Boolean);
    return texts.length > 0 ? texts.join('') : null;
  }
}
