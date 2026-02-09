/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ClaudeConverter — converts between provider-independent Llm* types
 * and Anthropic SDK types (@anthropic-ai/sdk).
 *
 * Used by ClaudeAdapter to translate requests/responses.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.4
 * @see packages/core/src/providers/gemini/converter.ts (Gemini counterpart)
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
import { LlmEventType } from '../events.js';

/** Default max_tokens for Claude API calls. */
const DEFAULT_MAX_TOKENS = 8192;

/**
 * Stream processing state — maintained externally by the caller
 * to allow concurrent stream handling without shared mutable state.
 */
export interface ClaudeStreamState {
  inputTokens: number;
  /** Index-based tool call tracking for parallel tool calls. */
  currentToolCalls: Record<
    number,
    {
      id: string;
      name: string;
      inputJson: string;
    }
  >;
}

/**
 * Converts between provider-independent types and Anthropic SDK types.
 */
export class ClaudeConverter {
  // ============================================================================
  // Request Conversion: Llm → Anthropic
  // ============================================================================

  /**
   * Convert LlmGenerateRequest to Anthropic MessageCreateParams.
   */
  toClaudeRequest(request: LlmGenerateRequest): Record<string, unknown> {
    const { messages, system: msgSystem } = this.toClaudeMessages(
      request.messages,
    );

    // Merge systemInstruction from request and messages
    let finalSystem: string | undefined;
    if (request.systemInstruction && msgSystem) {
      finalSystem = `${request.systemInstruction}\n${msgSystem}`;
    } else {
      finalSystem = request.systemInstruction || msgSystem || undefined;
    }

    const params: Record<string, unknown> = {
      model: request.model,
      messages,
      max_tokens: request.maxTokens ?? DEFAULT_MAX_TOKENS,
    };

    if (finalSystem) {
      params['system'] = finalSystem;
    }

    // Generation parameters
    if (request.temperature !== undefined) {
      params['temperature'] = request.temperature;
    }
    if (request.topP !== undefined) {
      params['top_p'] = request.topP;
    }
    if (request.topK !== undefined) {
      params['top_k'] = request.topK;
    }
    if (request.stopSequences !== undefined) {
      params['stop_sequences'] = request.stopSequences;
    }

    // Tools
    if (request.tools && request.tools.length > 0) {
      params['tools'] = this.toClaudeTools(request.tools);
    }

    // Tool choice
    if (request.toolChoice) {
      params['tool_choice'] = this.toClaudeToolChoice(request.toolChoice);
    }

    return params;
  }

  /**
   * Convert LlmMessage[] to Anthropic MessageParam[] and extract system text.
   */
  toClaudeMessages(messages: LlmMessage[]): {
    messages: Array<Record<string, unknown>>;
    system?: string;
  } {
    const claudeMessages: Array<Record<string, unknown>> = [];
    let system = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        const textParts = msg.content.filter(
          (c): c is { type: 'text'; text: string } => c.type === 'text',
        );
        system += textParts.map((c) => c.text).join('\n');
        continue;
      }

      // Anthropic supports 'user' and 'assistant' roles.
      // 'tool' role messages are sent as 'user' with tool_result blocks.
      const role = msg.role === 'assistant' ? 'assistant' : 'user';

      const content = this.toClaudeContent(msg.content);
      if (content.length > 0) {
        claudeMessages.push({ role, content });
      }
    }

    return {
      messages: claudeMessages,
      system: system || undefined,
    };
  }

  /**
   * Convert LlmContent[] to Anthropic ContentBlockParam[].
   */
  toClaudeContent(contents: LlmContent[]): Array<Record<string, unknown>> {
    const blocks: Array<Record<string, unknown>> = [];

    for (const content of contents) {
      switch (content.type) {
        case 'text':
          blocks.push({ type: 'text', text: content.text });
          break;

        case 'tool_call':
          blocks.push({
            type: 'tool_use',
            id: content.id,
            name: content.name,
            input: content.arguments,
          });
          break;

        case 'tool_result': {
          const block: Record<string, unknown> = {
            type: 'tool_result',
            tool_use_id: content.toolCallId,
            content:
              typeof content.content === 'string'
                ? content.content
                : JSON.stringify(content.content),
          };
          if (content.isError) {
            block['is_error'] = true;
          }
          blocks.push(block);
          break;
        }

        case 'image':
          if (content.source.type === 'base64') {
            blocks.push({
              type: 'image',
              source: {
                type: 'base64',
                media_type: content.source.mediaType,
                data: content.source.data,
              },
            });
          } else {
            // URL images: Anthropic API does not support URL images directly.
            // Emit a text block with warning instead of silently dropping.
            blocks.push({
              type: 'text',
              text: `[Unsupported: URL image cannot be sent to Claude API: ${content.source.url}]`,
            });
          }
          break;

        case 'thought':
          // Thought content is not sent back to Anthropic — skip
          break;

        default:
          break;
      }
    }

    return blocks;
  }

  /**
   * Convert LlmToolDefinition[] to Anthropic Tool[].
   */
  toClaudeTools(tools: LlmToolDefinition[]): Array<Record<string, unknown>> {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: tool.parameters.type,
        properties: tool.parameters.properties,
        ...(tool.parameters.required
          ? { required: tool.parameters.required }
          : {}),
      },
    }));
  }

  /**
   * Convert LlmToolChoice to Anthropic ToolChoice.
   */
  toClaudeToolChoice(choice: LlmToolChoice): Record<string, unknown> {
    if (typeof choice === 'string') {
      const choiceMap: Record<string, Record<string, unknown>> = {
        auto: { type: 'auto' },
        none: { type: 'none' },
        required: { type: 'any' },
      };
      return choiceMap[choice] ?? { type: 'auto' };
    }

    // Specific tool name
    return { type: 'tool', name: choice.name };
  }

  /**
   * Convert LlmGenerateRequest to Anthropic MessageCountTokensParams.
   * Only includes fields valid for countTokens (no generation parameters).
   */
  toCountTokensRequest(request: LlmGenerateRequest): Record<string, unknown> {
    const { messages, system: msgSystem } = this.toClaudeMessages(
      request.messages,
    );

    let finalSystem: string | undefined;
    if (request.systemInstruction && msgSystem) {
      finalSystem = `${request.systemInstruction}\n${msgSystem}`;
    } else {
      finalSystem = request.systemInstruction || msgSystem || undefined;
    }

    const params: Record<string, unknown> = {
      model: request.model,
      messages,
    };

    if (finalSystem) {
      params['system'] = finalSystem;
    }

    if (request.tools && request.tools.length > 0) {
      params['tools'] = this.toClaudeTools(request.tools);
    }

    if (request.toolChoice) {
      params['tool_choice'] = this.toClaudeToolChoice(request.toolChoice);
    }

    return params;
  }

  // ============================================================================
  // Response Conversion: Anthropic → Llm
  // ============================================================================

  /**
   * Convert Anthropic Message to LlmGenerateResponse.
   */
  fromClaudeResponse(response: unknown, model: string): LlmGenerateResponse {
    const resp = response as Record<string, unknown>;
    const contentBlocks = (resp['content'] as unknown[]) ?? [];

    return {
      id: (resp['id'] as string) ?? crypto.randomUUID(),
      content: this.fromClaudeContentBlocks(contentBlocks),
      model: (resp['model'] as string) ?? model,
      stopReason: this.mapStopReason(
        resp['stop_reason'] as string | null | undefined,
      ),
      usage: this.extractUsage(resp),
      rawResponse: response,
    };
  }

  /**
   * Convert Anthropic ContentBlock[] to LlmContent[].
   */
  fromClaudeContentBlocks(blocks: unknown[]): LlmContent[] {
    const contents: LlmContent[] = [];

    for (const block of blocks) {
      const b = block as Record<string, unknown>;
      const blockType = b['type'] as string;

      switch (blockType) {
        case 'text':
          contents.push({
            type: 'text',
            text: b['text'] as string,
          });
          break;

        case 'tool_use':
          contents.push({
            type: 'tool_call',
            id: b['id'] as string,
            name: b['name'] as string,
            arguments: (b['input'] as Record<string, unknown>) ?? {},
          });
          break;

        case 'thinking':
          contents.push({
            type: 'thought',
            thought: b['thinking'] as string,
            metadata: { provider: 'claude' },
          });
          break;

        default:
          break;
      }
    }

    return contents;
  }

  /**
   * Map Anthropic stop_reason to LlmStopReason.
   */
  mapStopReason(reason: string | null | undefined): LlmStopReason {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      case 'tool_use':
        return 'tool_use';
      default:
        return 'end_turn';
    }
  }

  /**
   * Extract token usage from Anthropic Message.
   */
  private extractUsage(response: Record<string, unknown>): LlmTokenUsage {
    const usage = response['usage'] as Record<string, number> | undefined;
    const inputTokens = usage?.['input_tokens'] ?? 0;
    const outputTokens = usage?.['output_tokens'] ?? 0;
    return {
      promptTokens: inputTokens,
      completionTokens: outputTokens,
      totalTokens: inputTokens + outputTokens,
      cachedTokens: usage?.['cache_read_input_tokens'] ?? 0,
    };
  }

  // ============================================================================
  // Stream Event Conversion
  // ============================================================================

  /**
   * Create a new stream state for processing stream events.
   */
  createStreamState(): ClaudeStreamState {
    return { inputTokens: 0, currentToolCalls: {} };
  }

  /**
   * Convert a single Anthropic RawMessageStreamEvent to LlmEvent[].
   * Uses external state for tool call accumulation and token tracking.
   */
  convertStreamEvent(event: unknown, state: ClaudeStreamState): LlmEvent[] {
    const e = event as Record<string, unknown>;
    const eventType = e['type'] as string;

    switch (eventType) {
      case 'message_start': {
        // Capture input_tokens for usage in Finished event
        const message = e['message'] as Record<string, unknown>;
        const usage = message?.['usage'] as Record<string, number> | undefined;
        state.inputTokens = usage?.['input_tokens'] ?? 0;
        return [];
      }

      case 'content_block_start': {
        const index = e['index'] as number;
        const block = e['content_block'] as Record<string, unknown>;
        if (block?.['type'] === 'tool_use') {
          // Start accumulating tool call at this index
          state.currentToolCalls[index] = {
            id: block['id'] as string,
            name: block['name'] as string,
            inputJson: '',
          };
        }
        return [];
      }

      case 'content_block_delta': {
        const index = e['index'] as number;
        const delta = e['delta'] as Record<string, unknown>;
        const deltaType = delta?.['type'] as string;

        if (deltaType === 'text_delta') {
          return [
            {
              type: LlmEventType.TextDelta,
              text: delta['text'] as string,
            },
          ];
        }

        if (deltaType === 'thinking_delta') {
          return [
            {
              type: LlmEventType.ThoughtDelta,
              thought: delta['thinking'] as string,
            },
          ];
        }

        if (deltaType === 'input_json_delta' && state.currentToolCalls[index]) {
          state.currentToolCalls[index].inputJson += delta[
            'partial_json'
          ] as string;
        }

        return [];
      }

      case 'content_block_stop': {
        const index = e['index'] as number;
        const toolCall = state.currentToolCalls[index];
        if (toolCall) {
          delete state.currentToolCalls[index];

          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(toolCall.inputJson || '{}');
          } catch {
            args = {};
          }

          return [
            {
              type: LlmEventType.ToolCallRequest,
              callId: toolCall.id,
              name: toolCall.name,
              args,
            },
          ];
        }
        return [];
      }

      case 'message_delta': {
        const delta = e['delta'] as Record<string, unknown>;
        const usage = e['usage'] as Record<string, number> | undefined;
        const outputTokens = usage?.['output_tokens'] ?? 0;

        return [
          {
            type: LlmEventType.Finished,
            finishReason: this.mapStopReason(
              delta?.['stop_reason'] as string | null,
            ),
            usage: {
              promptTokens: state.inputTokens,
              completionTokens: outputTokens,
              totalTokens: state.inputTokens + outputTokens,
            },
          },
        ];
      }

      case 'message_stop':
        return [{ type: LlmEventType.MessageEnd }];

      default:
        return [];
    }
  }
}
