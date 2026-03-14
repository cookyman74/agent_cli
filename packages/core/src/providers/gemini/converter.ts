/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * GeminiConverter — converts between provider-independent Llm* types
 * and Gemini SDK types (@google/genai).
 *
 * Used by GeminiAdapter to translate requests/responses.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.3
 */

import type {
  Content,
  GenerateContentResponse,
  Part,
  Tool,
  ToolConfig,
  FunctionCallingConfigMode,
  GenerateContentParameters,
  GenerateContentConfig,
} from '@google/genai';

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

/**
 * Converts between provider-independent types and Gemini SDK types.
 */
export class GeminiConverter {
  // ============================================================================
  // Request Conversion: Llm → Gemini
  // ============================================================================

  /**
   * Convert LlmGenerateRequest to Gemini GenerateContentParameters.
   *
   * GenerateContentParameters structure:
   *   { model, contents, config?: GenerateContentConfig }
   * where GenerateContentConfig contains systemInstruction, tools, toolConfig,
   * temperature, maxOutputTokens, etc.
   */
  toGeminiRequest(request: LlmGenerateRequest): GenerateContentParameters {
    const { contents, systemInstruction: msgSystemInstruction } =
      this.toGeminiContents(request.messages);

    // Merge systemInstruction from request and messages
    let finalSystemInstruction: string | undefined;
    if (request.systemInstruction && msgSystemInstruction) {
      finalSystemInstruction = `${request.systemInstruction}\n${msgSystemInstruction}`;
    } else {
      finalSystemInstruction =
        request.systemInstruction || msgSystemInstruction || undefined;
    }

    // Build GenerateContentConfig
    const config: GenerateContentConfig = {};

    if (finalSystemInstruction) {
      config.systemInstruction = finalSystemInstruction;
    }

    // Generation parameters
    if (request.temperature !== undefined) {
      config.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      config.maxOutputTokens = request.maxTokens;
    }
    if (request.topP !== undefined) {
      config.topP = request.topP;
    }
    if (request.topK !== undefined) {
      config.topK = request.topK;
    }
    if (request.stopSequences !== undefined) {
      config.stopSequences = request.stopSequences;
    }
    if (request.responseFormat === 'json') {
      config.responseMimeType = 'application/json';
    }

    // Tools
    if (request.tools && request.tools.length > 0) {
      config.tools = this.toGeminiTools(request.tools);
    }

    // Tool choice
    if (request.toolChoice) {
      config.toolConfig = this.toGeminiToolConfig(request.toolChoice);
    }

    return {
      model: request.model,
      contents,
      config,
    };
  }

  /**
   * Convert LlmMessage[] to Gemini Content[] and extract system instruction.
   */
  toGeminiContents(messages: LlmMessage[]): {
    contents: Content[];
    systemInstruction: string;
  } {
    const contents: Content[] = [];
    let systemInstruction = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        const textParts = msg.content.filter(
          (c): c is { type: 'text'; text: string } => c.type === 'text',
        );
        systemInstruction += textParts.map((c) => c.text).join('\n');
        continue;
      }

      // Gemini only supports 'user' and 'model' roles
      const role = msg.role === 'assistant' ? 'model' : 'user';

      const parts = this.toGeminiParts(msg.content);
      if (parts.length > 0) {
        contents.push({ role, parts });
      }
    }

    return { contents, systemInstruction };
  }

  /**
   * Convert LlmContent[] to Gemini Part[].
   */
  toGeminiParts(contents: LlmContent[]): Part[] {
    const parts: Part[] = [];

    for (const content of contents) {
      switch (content.type) {
        case 'text':
          parts.push({ text: content.text });
          break;

        case 'image':
          if (content.source.type === 'base64') {
            parts.push({
              inlineData: {
                mimeType: content.source.mediaType,
                data: content.source.data,
              },
            });
          } else if (content.source.type === 'url') {
            parts.push({
              fileData: {
                mimeType: content.source.mediaType,
                fileUri: content.source.url,
              },
            });
          }
          break;

        case 'tool_call':
          parts.push({
            functionCall: {
              name: content.name,
              args: content.arguments,
            },
          });
          break;

        case 'tool_result':
          parts.push({
            functionResponse: {
              name: content.name || content.toolCallId,
              response: {
                result:
                  typeof content.content === 'string'
                    ? content.content
                    : content.content,
              },
            },
          });
          break;

        case 'thought':
          // Thought content is not sent back to Gemini — skip
          break;

        default:
          // Unknown content type — skip silently
          break;
      }
    }

    return parts;
  }

  /**
   * Convert LlmToolDefinition[] to Gemini Tool[].
   * Uses type assertion for parameters since LlmToolParameters
   * is structurally compatible with Schema at runtime.
   */
  toGeminiTools(tools: LlmToolDefinition[]): Tool[] {
    if (tools.length === 0) {
      return [];
    }

    return [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          // LlmToolParameters is structurally compatible with Schema at runtime
          parameters: tool.parameters as unknown as Record<string, unknown>,
        })),
      },
    ];
  }

  /**
   * Convert LlmToolChoice to Gemini ToolConfig.
   */
  toGeminiToolConfig(choice: LlmToolChoice): ToolConfig {
    if (typeof choice === 'string') {
      const modeMap: Record<string, FunctionCallingConfigMode> = {
        auto: 'AUTO' as FunctionCallingConfigMode,
        none: 'NONE' as FunctionCallingConfigMode,
        required: 'ANY' as FunctionCallingConfigMode,
      };

      return {
        functionCallingConfig: {
          mode: modeMap[choice] ?? ('AUTO' as FunctionCallingConfigMode),
        },
      };
    }

    // Specific function name
    return {
      functionCallingConfig: {
        mode: 'ANY' as FunctionCallingConfigMode,
        allowedFunctionNames: [choice.name],
      },
    };
  }

  // ============================================================================
  // Response Conversion: Gemini → Llm
  // ============================================================================

  /**
   * Convert GenerateContentResponse to LlmGenerateResponse.
   */
  fromGeminiResponse(
    response: GenerateContentResponse,
    model: string,
  ): LlmGenerateResponse {
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts ?? [];

    return {
      id: response.responseId ?? crypto.randomUUID(),
      content: this.fromGeminiParts(parts),
      model: response.modelVersion ?? model,
      stopReason: this.mapStopReason(
        candidate?.finishReason as string | undefined,
      ),
      usage: this.extractUsage(response),
      rawResponse: response,
    };
  }

  /**
   * Convert Gemini Part[] to LlmContent[].
   */
  fromGeminiParts(parts: Part[]): LlmContent[] {
    const contents: LlmContent[] = [];

    for (const part of parts) {
      if ('text' in part && part.text !== undefined) {
        contents.push({ type: 'text', text: part.text });
      } else if ('functionCall' in part && part.functionCall) {
        contents.push({
          type: 'tool_call',
          id: crypto.randomUUID(),
          name: part.functionCall.name!,
          arguments: part.functionCall.args ?? {},
        });
      } else if ('inlineData' in part && part.inlineData) {
        contents.push({
          type: 'image',
          source: {
            type: 'base64',
            mediaType: part.inlineData.mimeType!,
            data: part.inlineData.data!,
          },
        });
      }
    }

    return contents;
  }

  /**
   * Map Gemini FinishReason to LlmStopReason.
   */
  mapStopReason(reason: string | undefined): LlmStopReason {
    switch (reason) {
      case 'STOP':
        return 'end_turn';
      case 'MAX_TOKENS':
        return 'max_tokens';
      case 'SAFETY':
      case 'RECITATION':
        return 'content_filter';
      default:
        return 'end_turn';
    }
  }

  /**
   * Extract token usage from GenerateContentResponse.
   */
  private extractUsage(response: GenerateContentResponse): LlmTokenUsage {
    const meta = response.usageMetadata;
    return {
      promptTokens: meta?.promptTokenCount ?? 0,
      completionTokens: meta?.candidatesTokenCount ?? 0,
      totalTokens: meta?.totalTokenCount ?? 0,
      cachedTokens: meta?.cachedContentTokenCount ?? 0,
    };
  }
}
