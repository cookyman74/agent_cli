/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  Part,
  EmbedContentParameters,
  GenerateContentResponse,
  GenerateContentParameters,
  GenerateContentConfig,
} from '@google/genai';
import type { Config } from '../config/config.js';
// TODO(M2.2): Replace with provider-independent ContentGenerator from '../providers/types.js'
// after GeminiAdapter implementation. Currently bound to Gemini-specific GeminiContentGenerator.
import type { ContentGenerator } from './contentGenerator.js';
import { isProviderIndependentGenerator } from './contentGenerator.js';
import type { AuthType } from './contentGenerator.js';
import { handleFallback } from '../fallback/handler.js';
import { getResponseText } from '../utils/partUtils.js';
import { reportError } from '../utils/errorReporting.js';
import { getErrorMessage } from '../utils/errors.js';
import { logMalformedJsonResponse } from '../telemetry/loggers.js';
import { MalformedJsonResponseEvent } from '../telemetry/types.js';
import { retryWithBackoff } from '../utils/retry.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import {
  applyModelSelection,
  createAvailabilityContextProvider,
} from '../availability/policyHelpers.js';
import type {
  LlmMessage,
  LlmGenerateRequest,
  LlmGenerateResponse,
} from '../providers/types.js';
import { convertContentsToLlmMessages } from '../providers/gemini/typeConversion.js';
import { fixToolResultRoles } from './llmMessageUtils.js';
import { resolveProviderModel } from '../providers/providerSelector.js';

const DEFAULT_MAX_ATTEMPTS = 5;

/**
 * Options for the generateJson utility function.
 * @deprecated Use LlmGenerateJsonOptions for new code.
 */
export interface GenerateJsonOptions {
  /** The desired model config. */
  modelConfigKey: ModelConfigKey;
  /** The input prompt or history. */
  contents: Content[];
  /** The required JSON schema for the output. */
  schema: Record<string, unknown>;
  /**
   * Task-specific system instructions.
   * If omitted, no system instruction is sent.
   */
  systemInstruction?: string | Part | Part[] | Content;
  /** Signal for cancellation. */
  abortSignal: AbortSignal;
  /**
   * A unique ID for the prompt, used for logging/telemetry correlation.
   */
  promptId: string;
  /**
   * The maximum number of attempts for the request.
   */
  maxAttempts?: number;
}

/**
 * Provider-independent options for generateJson.
 * Uses LlmMessage[] instead of Content[] for multi-provider support.
 */
export interface LlmGenerateJsonOptions {
  /** The desired model config. */
  modelConfigKey: ModelConfigKey;
  /** The input prompt or history (provider-independent). */
  messages: LlmMessage[];
  /** The required JSON schema for the output. */
  schema: Record<string, unknown>;
  /**
   * Task-specific system instructions (string only for provider independence).
   */
  systemInstruction?: string;
  /** Signal for cancellation. */
  abortSignal: AbortSignal;
  /**
   * A unique ID for the prompt, used for logging/telemetry correlation.
   */
  promptId: string;
  /**
   * The maximum number of attempts for the request.
   */
  maxAttempts?: number;
}

/**
 * Options for the generateContent utility function.
 * @deprecated Use LlmGenerateContentOptions for new code.
 */
export interface GenerateContentOptions {
  /** The desired model config. */
  modelConfigKey: ModelConfigKey;
  /** The input prompt or history. */
  contents: Content[];
  /**
   * Task-specific system instructions.
   * If omitted, no system instruction is sent.
   */
  systemInstruction?: string | Part | Part[] | Content;
  /** Signal for cancellation. */
  abortSignal: AbortSignal;
  /**
   * A unique ID for the prompt, used for logging/telemetry correlation.
   */
  promptId: string;
  /**
   * The maximum number of attempts for the request.
   */
  maxAttempts?: number;
}

/**
 * Provider-independent options for generateContent.
 * Uses LlmMessage[] instead of Content[] for multi-provider support.
 */
export interface LlmGenerateContentOptions {
  /** The desired model config. */
  modelConfigKey: ModelConfigKey;
  /** The input prompt or history (provider-independent). */
  messages: LlmMessage[];
  /**
   * Task-specific system instructions (string only for provider independence).
   */
  systemInstruction?: string;
  /** Signal for cancellation. */
  abortSignal: AbortSignal;
  /**
   * A unique ID for the prompt, used for logging/telemetry correlation.
   */
  promptId: string;
  /**
   * The maximum number of attempts for the request.
   */
  maxAttempts?: number;
}

interface _CommonGenerateOptions {
  modelConfigKey: ModelConfigKey;
  contents: Content[];
  systemInstruction?: string | Part | Part[] | Content;
  abortSignal: AbortSignal;
  promptId: string;
  maxAttempts?: number;
  additionalProperties?: {
    responseJsonSchema: Record<string, unknown>;
    responseMimeType: string;
  };
}

// ============================================================================
// Type Conversion Utilities
// ============================================================================

/**
 * Converts provider-independent LlmMessage[] to Gemini Content[].
 * This is the bridge between multi-provider types and Gemini-specific types.
 *
 * Note: 'system' role messages are filtered out and should be passed
 * via the systemInstruction parameter instead.
 */
function convertLlmMessagesToContents(messages: LlmMessage[]): Content[] {
  return messages
    .filter((msg) => msg.role !== 'system') // System messages handled via systemInstruction
    .map((msg) => {
      const parts: Part[] = msg.content.map((content) => {
        switch (content.type) {
          case 'text':
            return { text: content.text };
          case 'image': {
            if (content.source.type === 'base64') {
              return {
                inlineData: {
                  mimeType: content.source.mediaType,
                  data: content.source.data,
                },
              };
            } else {
              // URL-based images - use fileData for Gemini
              return {
                fileData: {
                  mimeType: content.source.mediaType,
                  fileUri: content.source.url,
                },
              };
            }
          }
          case 'tool_call':
            return {
              functionCall: {
                id: content.id, // [리뷰 #2] preserve tool_call ID for round-trip
                name: content.name,
                args: content.arguments,
              },
            };
          case 'tool_result':
            return {
              functionResponse: {
                id: content.toolCallId, // [리뷰 #2] preserve tool_result ID for round-trip
                name: content.name ?? '',
                response:
                  typeof content.content === 'string'
                    ? { result: content.content }
                    : content.content,
              },
            };
          case 'thought':
            // Gemini uses thought in response, not request - convert to text
            return { text: `[Thought] ${content.thought}` };
          default:
            return { text: '' };
        }
      });

      // Map role: LlmRole -> Gemini role
      // 'assistant' -> 'model', 'tool' -> 'user', 'user' -> 'user'
      const role =
        msg.role === 'assistant'
          ? 'model'
          : msg.role === 'tool'
            ? 'user'
            : 'user';

      return {
        role,
        parts,
      };
    });
}

/**
 * Type guard to check if options use provider-independent LlmMessage[]
 */
function isLlmGenerateJsonOptions(
  options: GenerateJsonOptions | LlmGenerateJsonOptions,
): options is LlmGenerateJsonOptions {
  return 'messages' in options && !('contents' in options);
}

/**
 * Type guard to check if options use provider-independent LlmMessage[]
 */
function isLlmGenerateContentOptions(
  options: GenerateContentOptions | LlmGenerateContentOptions,
): options is LlmGenerateContentOptions {
  return 'messages' in options && !('contents' in options);
}

/**
 * A client dedicated to stateless, utility-focused LLM calls.
 *
 * Note: Currently depends on Gemini-specific ContentGenerator (core/contentGenerator.ts).
 * TODO(M2.2): Refactor to accept provider-independent ContentGenerator (providers/types.ts)
 * via GeminiAdapter, enabling multi-provider support.
 */
export class BaseLlmClient {
  constructor(
    private readonly contentGenerator: ContentGenerator,
    private readonly config: Config,
    private readonly authType?: AuthType,
  ) {}

  async generateJson(
    options: GenerateJsonOptions | LlmGenerateJsonOptions,
  ): Promise<Record<string, unknown>> {
    // Normalize to internal format - support both legacy and new types
    let contents: Content[];
    let systemInstruction: string | Part | Part[] | Content | undefined;

    if (isLlmGenerateJsonOptions(options)) {
      // New provider-independent type
      contents = convertLlmMessagesToContents(options.messages);
      systemInstruction = options.systemInstruction;
    } else {
      // Legacy Gemini-specific type
      contents = options.contents;
      systemInstruction = options.systemInstruction;
    }

    const { schema, modelConfigKey, abortSignal, promptId, maxAttempts } =
      options;

    const { model } =
      this.config.modelConfigService.getResolvedConfig(modelConfigKey);

    // [리뷰 #5] For non-Gemini providers, resolve the actual provider model
    // for accurate telemetry logging in cleanJsonResponse().
    const providerName = this.contentGenerator.providerName;
    const isNonGemini = providerName != null && providerName !== 'gemini';
    const telemetryModel = isNonGemini
      ? resolveProviderModel(model, providerName)
      : model;

    const shouldRetryOnContent = (response: GenerateContentResponse) => {
      const text = getResponseText(response)?.trim();
      if (!text) {
        return true; // Retry on empty response
      }
      try {
        // We don't use the result, just check if it's valid JSON
        JSON.parse(this.cleanJsonResponse(text, telemetryModel));
        return false; // It's valid, don't retry
      } catch (_e) {
        return true; // It's not valid, retry
      }
    };

    const result = await this._generateWithRetry(
      {
        modelConfigKey,
        contents,
        abortSignal,
        promptId,
        maxAttempts,
        systemInstruction,
        additionalProperties: {
          responseJsonSchema: schema,
          responseMimeType: 'application/json',
        },
      },
      shouldRetryOnContent,
      'generateJson',
    );

    // If we are here, the content is valid (not empty and parsable).
    return JSON.parse(
      this.cleanJsonResponse(getResponseText(result)!.trim(), telemetryModel),
    );
  }

  async generateEmbedding(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }
    const embedModelParams: EmbedContentParameters = {
      model: this.config.getEmbeddingModel(),
      contents: texts,
    };

    const embedContentResponse =
      await this.contentGenerator.embedContent(embedModelParams);
    if (
      !embedContentResponse.embeddings ||
      embedContentResponse.embeddings.length === 0
    ) {
      throw new Error('No embeddings found in API response.');
    }

    if (embedContentResponse.embeddings.length !== texts.length) {
      throw new Error(
        `API returned a mismatched number of embeddings. Expected ${texts.length}, got ${embedContentResponse.embeddings.length}.`,
      );
    }

    return embedContentResponse.embeddings.map((embedding, index) => {
      const values = embedding.values;
      if (!values || values.length === 0) {
        throw new Error(
          `API returned an empty embedding for input text at index ${index}: "${texts[index]}"`,
        );
      }
      return values;
    });
  }

  private cleanJsonResponse(text: string, model: string): string {
    const prefix = '```json';
    const suffix = '```';
    if (text.startsWith(prefix) && text.endsWith(suffix)) {
      logMalformedJsonResponse(
        this.config,
        new MalformedJsonResponseEvent(model),
      );
      return text.substring(prefix.length, text.length - suffix.length).trim();
    }
    return text;
  }

  async generateContent(
    options: GenerateContentOptions | LlmGenerateContentOptions,
  ): Promise<GenerateContentResponse> {
    // Normalize to internal format - support both legacy and new types
    let contents: Content[];
    let systemInstruction: string | Part | Part[] | Content | undefined;

    if (isLlmGenerateContentOptions(options)) {
      // New provider-independent type
      contents = convertLlmMessagesToContents(options.messages);
      systemInstruction = options.systemInstruction;
    } else {
      // Legacy Gemini-specific type
      contents = options.contents;
      systemInstruction = options.systemInstruction;
    }

    const { modelConfigKey, abortSignal, promptId, maxAttempts } = options;

    const shouldRetryOnContent = (response: GenerateContentResponse) => {
      const text = getResponseText(response)?.trim();
      return !text; // Retry on empty response
    };

    return this._generateWithRetry(
      {
        modelConfigKey,
        contents,
        systemInstruction,
        abortSignal,
        promptId,
        maxAttempts,
      },
      shouldRetryOnContent,
      'generateContent',
    );
  }

  private async _generateWithRetry(
    options: _CommonGenerateOptions,
    shouldRetryOnContent: (response: GenerateContentResponse) => boolean,
    errorContext: 'generateJson' | 'generateContent',
  ): Promise<GenerateContentResponse> {
    const {
      modelConfigKey,
      contents,
      systemInstruction,
      abortSignal,
      promptId,
      maxAttempts,
      additionalProperties,
    } = options;

    const {
      model,
      config: generateContentConfig,
      maxAttempts: availabilityMaxAttempts,
    } = applyModelSelection(this.config, modelConfigKey);

    let currentModel = model;
    let currentGenerateContentConfig = generateContentConfig;

    // ── Non-Gemini provider: use llm* path ──────────────────────────
    const providerName = this.contentGenerator.providerName;
    const isNonGemini = providerName != null && providerName !== 'gemini';

    if (isNonGemini && isProviderIndependentGenerator(this.contentGenerator)) {
      return this._generateWithRetryLlm(
        options,
        shouldRetryOnContent,
        errorContext,
        currentModel,
        providerName,
        currentGenerateContentConfig,
        availabilityMaxAttempts,
      );
    }

    // ── Gemini (legacy) path ────────────────────────────────────────

    // Define callback to fetch context dynamically since active model may get updated during retry loop
    const getAvailabilityContext = createAvailabilityContextProvider(
      this.config,
      () => currentModel,
    );

    try {
      const apiCall = () => {
        // Ensure we use the current active model
        // in case a fallback occurred in a previous attempt.
        const activeModel = this.config.getActiveModel();
        if (activeModel !== currentModel) {
          currentModel = activeModel;
          // Re-resolve config if model changed during retry
          const { generateContentConfig } =
            this.config.modelConfigService.getResolvedConfig({
              ...modelConfigKey,
              model: activeModel,
            });
          currentGenerateContentConfig = generateContentConfig;
        }
        const finalConfig: GenerateContentConfig = {
          ...currentGenerateContentConfig,
          ...(systemInstruction && { systemInstruction }),
          ...additionalProperties,
          abortSignal,
        };
        const requestParams: GenerateContentParameters = {
          model: currentModel,
          config: finalConfig,
          contents,
        };
        return this.contentGenerator.generateContent(requestParams, promptId);
      };

      return await retryWithBackoff(apiCall, {
        shouldRetryOnContent,
        maxAttempts:
          availabilityMaxAttempts ?? maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        getAvailabilityContext,
        onPersistent429: this.config.isInteractive()
          ? (authType, error) =>
              handleFallback(this.config, currentModel, authType, error)
          : undefined,
        authType:
          this.authType ?? this.config.getContentGeneratorConfig()?.authType,
      });
    } catch (error) {
      if (abortSignal?.aborted) {
        throw error;
      }

      // Check if the error is from exhausting retries, and report accordingly.
      if (
        error instanceof Error &&
        error.message.includes('Retry attempts exhausted')
      ) {
        await reportError(
          error,
          `API returned invalid content after all retries.`,
          contents,
          `${errorContext}-invalid-content`,
        );
      } else {
        await reportError(
          error,
          `Error generating content via API.`,
          contents,
          `${errorContext}-api`,
        );
      }

      throw new Error(`Failed to generate content: ${getErrorMessage(error)}`);
    }
  }

  // ── Non-Gemini llm* path ────────────────────────────────────────

  /**
   * Non-Gemini variant of _generateWithRetry.
   * Converts Content[] → LlmMessage[], calls llmGenerateContent(),
   * and converts the response back to GenerateContentResponse.
   */
  private async _generateWithRetryLlm(
    options: _CommonGenerateOptions,
    shouldRetryOnContent: (response: GenerateContentResponse) => boolean,
    errorContext: 'generateJson' | 'generateContent',
    resolvedModel: string,
    providerName: string,
    generateContentConfig?: GenerateContentConfig,
    availabilityMaxAttempts?: number,
  ): Promise<GenerateContentResponse> {
    const {
      contents,
      systemInstruction,
      abortSignal,
      promptId,
      maxAttempts,
      additionalProperties,
    } = options;

    try {
      const apiCall = () =>
        this._callLlmGenerateContent({
          contents,
          systemInstruction,
          resolvedModel,
          providerName,
          promptId,
          abortSignal,
          additionalProperties,
          generateContentConfig,
        });

      return await retryWithBackoff(apiCall, {
        shouldRetryOnContent,
        maxAttempts:
          availabilityMaxAttempts ?? maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        authType:
          this.authType ?? this.config.getContentGeneratorConfig()?.authType,
      });
    } catch (error) {
      if (abortSignal?.aborted) {
        throw error;
      }

      if (
        error instanceof Error &&
        error.message.includes('Retry attempts exhausted')
      ) {
        await reportError(
          error,
          `API returned invalid content after all retries.`,
          contents,
          `${errorContext}-invalid-content`,
        );
      } else {
        await reportError(
          error,
          `Error generating content via API.`,
          contents,
          `${errorContext}-api`,
        );
      }

      throw new Error(`Failed to generate content: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Builds an LlmGenerateRequest from Gemini Content[] and calls llmGenerateContent().
   * Returns GenerateContentResponse for compatibility with existing callers.
   */
  private async _callLlmGenerateContent(params: {
    contents: Content[];
    systemInstruction?: string | Part | Part[] | Content;
    resolvedModel: string;
    providerName: string;
    promptId: string;
    abortSignal: AbortSignal;
    additionalProperties?: _CommonGenerateOptions['additionalProperties'];
    generateContentConfig?: GenerateContentConfig;
  }): Promise<GenerateContentResponse> {
    const {
      contents,
      systemInstruction,
      resolvedModel,
      providerName,
      promptId,
      abortSignal,
      additionalProperties,
      generateContentConfig,
    } = params;

    // 1. Convert Content[] → LlmMessage[]
    const messages = convertContentsToLlmMessages(contents);

    // 2. Apply fixToolResultRoles (role correction + multi-tool_result split)
    const fixedMessages = fixToolResultRoles(messages);

    // 3. Resolve provider model
    const providerModel = resolveProviderModel(resolvedModel, providerName);

    // 4. Normalize systemInstruction to string
    const systemInstructionStr =
      this._normalizeSystemInstruction(systemInstruction);

    // 5. Build LlmGenerateRequest
    const request: LlmGenerateRequest = {
      model: providerModel,
      messages: fixedMessages,
    };
    if (systemInstructionStr) {
      request.systemInstruction = systemInstructionStr;
    }
    if (additionalProperties) {
      request.responseFormat = 'json';
    }

    // 5b. Apply generation config (temperature, topP, topK, maxOutputTokens) [리뷰 #1]
    if (generateContentConfig) {
      const cfg = generateContentConfig as Record<string, unknown>;
      if (cfg['temperature'] != null)
        request.temperature = cfg['temperature'] as number;
      if (cfg['topP'] != null) request.topP = cfg['topP'] as number;
      if (cfg['topK'] != null) request.topK = cfg['topK'] as number;
      if (cfg['maxOutputTokens'] != null)
        request.maxTokens = cfg['maxOutputTokens'] as number;
      if (cfg['stopSequences'] != null)
        request.stopSequences = cfg['stopSequences'] as string[];
    }

    // 6. Call llmGenerateContent (type-safe: isProviderIndependentGenerator checked by caller)
    const llmResponse = await this.contentGenerator.llmGenerateContent!(
      request,
      promptId,
      { signal: abortSignal },
    );

    // 7. Convert to GenerateContentResponse
    return this._convertLlmResponseToGeminiResponse(llmResponse);
  }

  /**
   * Normalizes various systemInstruction forms to a plain string.
   * BaseLlmClient callers pass string | Part | Part[] | Content.
   */
  private _normalizeSystemInstruction(
    si: string | Part | Part[] | Content | undefined,
  ): string | undefined {
    if (si === undefined) return undefined;
    if (typeof si === 'string') return si;

    // Part[] form
    if (Array.isArray(si)) {
      return si
        .map((p) => p.text ?? '')
        .filter(Boolean)
        .join('\n');
    }

    // Content form (has 'role' and 'parts')
    if ('parts' in si && Array.isArray(si.parts)) {
      return si.parts
        .map((p: Part) => p.text ?? '')
        .filter(Boolean)
        .join('\n');
    }

    // Single Part form
    if ('text' in si) {
      return si.text ?? undefined;
    }

    return undefined;
  }

  /**
   * Converts LlmGenerateResponse to GenerateContentResponse.
   * Builds the minimal structure needed by getResponseText() and callers:
   * `candidates[0].content.parts[0].text`
   */
  private _convertLlmResponseToGeminiResponse(
    llmResponse: LlmGenerateResponse,
  ): GenerateContentResponse {
    const parts: Part[] = [];
    for (const c of llmResponse.content) {
      switch (c.type) {
        case 'text':
          parts.push({ text: c.text });
          break;
        case 'tool_call':
          parts.push({
            functionCall: {
              id: c.id,
              name: c.name,
              args: c.arguments,
            },
          });
          break;
        case 'thought':
          parts.push({ text: c.thought, thought: true } as Part);
          break;
        default:
          break;
      }
    }

    return {
      candidates: [
        {
          content: {
            role: 'model',
            parts,
          },
        },
      ],
    } as GenerateContentResponse;
  }
}
