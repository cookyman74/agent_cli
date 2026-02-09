/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * ClaudeAdapter — extends BaseAdapter to wrap Anthropic SDK (@anthropic-ai/sdk).
 *
 * Accepts provider-independent LlmGenerateRequest, converts to Anthropic SDK
 * format, and converts responses back to LlmGenerateResponse / LlmEventStream.
 *
 * NOTE: This is a skeleton implementation for M3.1.0 (bootstrap + directory).
 * Full implementation (generate, stream, converter) will be added in M3.1.1+.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.4
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
import type { LlmEventStream } from '../events.js';

/**
 * Interface for the Anthropic SDK client.
 * This allows dependency injection for testing.
 */
export interface ClaudeClient {
  messages: {
    create(params: Record<string, unknown>): Promise<unknown>;
    countTokens?(params: Record<string, unknown>): Promise<unknown>;
  };
}

/**
 * Claude adapter capabilities — skeleton state (M3.1.0).
 *
 * Active capabilities (requiring method implementation) are set to false
 * until the corresponding methods are implemented in M3.1.1+.
 *
 * Target capabilities when fully implemented:
 *   supportsStreaming: true    (M3.1.1: generateContentStream)
 *   supportsToolCalls: true    (M3.1.2: tool message conversion)
 *   supportsImageInput: true   (M3.1.2: image message conversion)
 *   supportsTokenCount: true   (M3.1.1: countTokens override)
 *   supportsThought: true      (M3.1.3: extended thinking)
 */
const CLAUDE_CAPABILITIES: LlmProviderCapabilities = {
  supportsStreaming: false,
  supportsToolCalls: false,
  supportsImageInput: false,
  supportsImageGeneration: false,
  supportsEmbedding: false,
  supportsTokenCount: false,
  supportsSystemMessage: true,
  supportsThought: false,
  maxContextLength: 200_000,
  maxOutputTokens: 8_192,
};

export class ClaudeAdapter extends BaseAdapter {
  readonly providerName = 'claude';
  readonly capabilities = CLAUDE_CAPABILITIES;

  constructor(
    config: AdapterConfig,
    protected readonly client: ClaudeClient,
  ) {
    super(config);
  }

  // M3.1.1: Full implementation
  generateContent(
    _request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    throw new Error(
      'ClaudeAdapter.generateContent not yet implemented (M3.1.1)',
    );
  }

  // M3.1.1: Full implementation
  generateContentStream(
    _request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): LlmEventStream {
    throw new Error(
      'ClaudeAdapter.generateContentStream not yet implemented (M3.1.1)',
    );
  }

  // M3.1.1: Full implementation
  protected mapToProviderConfig(
    _config: LlmGenerateConfig,
  ): Record<string, unknown> {
    throw new Error(
      'ClaudeAdapter.mapToProviderConfig not yet implemented (M3.1.1)',
    );
  }
}
