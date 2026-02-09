/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAiConverter — converts between provider-independent Llm* types
 * and OpenAI SDK types (openai).
 *
 * Used by OpenAiAdapter to translate requests/responses.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.7
 * @see packages/core/src/providers/claude/converter.ts (Claude counterpart)
 */

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
import type { LlmEvent } from '../events.js';

/**
 * Stream processing state — maintained externally by the caller
 * to allow concurrent stream handling without shared mutable state.
 */
export interface OpenAiStreamState {
  /** Index-based tool call tracking for parallel tool calls. */
  currentToolCalls: Record<
    number,
    {
      id: string;
      name: string;
      argumentsJson: string;
    }
  >;
  /** Prevents duplicate Finished event emission on usage-only final chunk. */
  finishedEmitted: boolean;
}

/**
 * Converts between provider-independent types and OpenAI SDK types.
 */
export class OpenAiConverter {
  // ============================================================================
  // Request Conversion: Llm → OpenAI
  // ============================================================================

  /**
   * Convert LlmGenerateRequest to OpenAI ChatCompletionCreateParams.
   */
  toOpenAiRequest(request: LlmGenerateRequest): Record<string, unknown> {
    const messages = this.toOpenAiMessages(request.messages);

    // Prepend system instruction as a system message
    if (request.systemInstruction) {
      messages.unshift({
        role: 'system',
        content: request.systemInstruction,
      });
    }

    const params: Record<string, unknown> = {
      model: request.model,
      messages,
    };

    // Generation parameters
    if (request.maxTokens !== undefined) {
      params['max_completion_tokens'] = request.maxTokens;
    }
    if (request.temperature !== undefined) {
      params['temperature'] = request.temperature;
    }
    if (request.topP !== undefined) {
      params['top_p'] = request.topP;
    }
    if (request.stopSequences !== undefined) {
      params['stop'] = request.stopSequences;
    }

    // Tools
    if (request.tools && request.tools.length > 0) {
      params['tools'] = this.toOpenAiTools(request.tools);
    }

    if (request.toolChoice) {
      params['tool_choice'] = this.toOpenAiToolChoice(request.toolChoice);
    }

    // Response format
    if (request.responseFormat === 'json') {
      params['response_format'] = { type: 'json_object' };
    }

    return params;
  }

  /**
   * Convert LlmMessage[] to OpenAI ChatCompletionMessageParam[].
   *
   * Unlike Claude, OpenAI supports system/user/assistant/tool roles natively.
   * No consecutive-role merging is needed.
   */
  toOpenAiMessages(messages: LlmMessage[]): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];

    for (const msg of messages) {
      const converted = this.convertSingleMessage(msg);
      if (converted) {
        result.push(converted);
      }
    }

    return result;
  }

  /**
   * Convert LlmToolDefinition[] to OpenAI ChatCompletionTool[].
   */
  toOpenAiTools(tools: LlmToolDefinition[]): Array<Record<string, unknown>> {
    return tools.map((tool) => {
      const fn: Record<string, unknown> = {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: tool.parameters.type,
          properties: tool.parameters.properties,
          ...(tool.parameters.required
            ? { required: tool.parameters.required }
            : {}),
        },
      };
      return { type: 'function', function: fn };
    });
  }

  /**
   * Convert LlmToolChoice to OpenAI ChatCompletionToolChoiceOption.
   *
   * OpenAI supports string values directly: 'none', 'auto', 'required'.
   */
  toOpenAiToolChoice(choice: LlmToolChoice): string | Record<string, unknown> {
    if (typeof choice === 'string') {
      return choice; // 'auto' | 'none' | 'required' map 1:1
    }
    return { type: 'function', function: { name: choice.name } };
  }

  // ============================================================================
  // Response Conversion: OpenAI → Llm
  // ============================================================================

  /**
   * Convert OpenAI ChatCompletion to LlmGenerateResponse.
   */
  fromOpenAiResponse(response: unknown, model: string): LlmGenerateResponse {
    const resp = response as Record<string, unknown>;
    const choices = (resp['choices'] as Array<Record<string, unknown>>) ?? [];
    const firstChoice = choices[0] ?? {};
    const message = (firstChoice['message'] as Record<string, unknown>) ?? {};

    return {
      id: (resp['id'] as string) ?? crypto.randomUUID(),
      content: this.fromOpenAiMessage(message),
      model: (resp['model'] as string) ?? model,
      stopReason: this.mapFinishReason(
        firstChoice['finish_reason'] as string | null | undefined,
      ),
      usage: this.extractUsage(resp),
      rawResponse: response,
    };
  }

  /**
   * Convert OpenAI ChatCompletionMessage to LlmContent[].
   */
  fromOpenAiMessage(message: Record<string, unknown>): LlmContent[] {
    const contents: LlmContent[] = [];
    const text = message['content'] as string | null;

    if (text) {
      contents.push({ type: 'text', text });
    }

    const toolCalls = message['tool_calls'] as
      | Array<Record<string, unknown>>
      | undefined;
    if (toolCalls) {
      for (const tc of toolCalls) {
        const fn = tc['function'] as Record<string, unknown>;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(fn['arguments'] as string);
        } catch {
          args = {};
        }
        contents.push({
          type: 'tool_call',
          id: tc['id'] as string,
          name: fn['name'] as string,
          arguments: args,
        });
      }
    }

    return contents;
  }

  /**
   * Map OpenAI finish_reason to LlmStopReason.
   */
  mapFinishReason(reason: string | null | undefined): LlmStopReason {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'length':
        return 'max_tokens';
      case 'tool_calls':
      case 'function_call':
        return 'tool_use';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'end_turn';
    }
  }

  /**
   * Extract token usage from OpenAI ChatCompletion.
   */
  private extractUsage(response: Record<string, unknown>): LlmTokenUsage {
    const usage = response['usage'] as Record<string, unknown> | undefined;
    const promptTokens = (usage?.['prompt_tokens'] as number) ?? 0;
    const completionTokens = (usage?.['completion_tokens'] as number) ?? 0;

    const promptDetails = usage?.['prompt_tokens_details'] as
      | Record<string, unknown>
      | undefined;
    const cachedTokens = (promptDetails?.['cached_tokens'] as number) ?? 0;

    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cachedTokens,
    };
  }

  // ============================================================================
  // Stream Event Conversion (M3.2.B — stub for state creation)
  // ============================================================================

  /**
   * Create a new stream state for processing stream events.
   */
  createStreamState(): OpenAiStreamState {
    return { currentToolCalls: {}, finishedEmitted: false };
  }

  /**
   * Convert a single OpenAI ChatCompletionChunk to LlmEvent[].
   * Full implementation in M3.2.B.
   */
  convertStreamEvent(_event: unknown, _state: OpenAiStreamState): LlmEvent[] {
    return [];
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Convert a single LlmMessage to an OpenAI message param.
   * Returns null for messages that should be skipped.
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
    return { role: 'system', content: text };
  }

  private convertUserMessage(msg: LlmMessage): Record<string, unknown> | null {
    const parts = this.toOpenAiContentParts(msg.content);
    if (parts.length === 0) return null;

    // If only text parts, simplify to string content
    if (parts.length === 1 && parts[0]['type'] === 'text') {
      return { role: 'user', content: parts[0]['text'] as string };
    }

    return { role: 'user', content: parts };
  }

  private convertAssistantMessage(
    msg: LlmMessage,
  ): Record<string, unknown> | null {
    const text = this.extractTextContent(msg.content);
    const toolCalls = this.extractToolCalls(msg.content);

    if (!text && toolCalls.length === 0) return null;

    const result: Record<string, unknown> = { role: 'assistant' };
    if (text) {
      result['content'] = text;
    } else {
      result['content'] = null;
    }
    if (toolCalls.length > 0) {
      result['tool_calls'] = toolCalls;
    }

    return result;
  }

  private convertToolMessage(msg: LlmMessage): Record<string, unknown> | null {
    const toolResult = msg.content.find((c) => c.type === 'tool_result');
    if (!toolResult || toolResult.type !== 'tool_result') return null;

    let content: string;
    if (typeof toolResult.content === 'string') {
      content = toolResult.content;
    } else {
      try {
        content = JSON.stringify(toolResult.content);
      } catch {
        content = String(toolResult.content);
      }
    }

    return {
      role: 'tool',
      tool_call_id: toolResult.toolCallId,
      content,
    };
  }

  /**
   * Convert LlmContent[] to OpenAI content parts (for user messages).
   * Supports text and image_url parts.
   */
  private toOpenAiContentParts(
    contents: LlmContent[],
  ): Array<Record<string, unknown>> {
    const parts: Array<Record<string, unknown>> = [];

    for (const content of contents) {
      switch (content.type) {
        case 'text':
          if (content.text) {
            parts.push({ type: 'text', text: content.text });
          }
          break;

        case 'image':
          if (content.source.type === 'base64') {
            parts.push({
              type: 'image_url',
              image_url: {
                url: `data:${content.source.mediaType};base64,${content.source.data}`,
              },
            });
          } else {
            parts.push({
              type: 'image_url',
              image_url: { url: content.source.url },
            });
          }
          break;

        case 'thought':
          // Thought content is not sent back to OpenAI — skip
          break;

        default:
          break;
      }
    }

    return parts;
  }

  /**
   * Extract concatenated text from content blocks.
   */
  private extractTextContent(contents: LlmContent[]): string | null {
    const texts = contents
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map((c) => c.text)
      .filter(Boolean);

    return texts.length > 0 ? texts.join('') : null;
  }

  /**
   * Extract tool calls from content blocks and format for OpenAI.
   */
  private extractToolCalls(
    contents: LlmContent[],
  ): Array<Record<string, unknown>> {
    return contents
      .filter((c) => c.type === 'tool_call')
      .map((c) => {
        if (c.type !== 'tool_call') return {};
        return {
          id: c.id,
          type: 'function',
          function: {
            name: c.name,
            arguments: JSON.stringify(c.arguments),
          },
        };
      });
  }
}
