/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAiCompatibleAdapter — extends OpenAiAdapter for vLLM, TGI,
 * LM Studio, Ollama, and other OpenAI-compatible API servers.
 *
 * Inherits generateContent, generateContentStream, and classifyError
 * from OpenAiAdapter. Overrides providerName and capabilities, and
 * adds a testConnection() method for server reachability checks.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.4
 * @see packages/core/src/providers/openai/adapter.ts (parent class)
 */

import { OpenAiAdapter, type OpenAiClient } from '../openai/adapter.js';
import type { LlmProviderCapabilities, AdapterConfig } from '../types.js';

/**
 * Default capabilities for OpenAI-compatible servers.
 *
 * Conservative defaults — many local/self-hosted models lack vision
 * and tool-calling support. Users can override via config.
 */
const OPENAI_COMPATIBLE_DEFAULT_CAPABILITIES: LlmProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsImageInput: false,
  supportsImageGeneration: false,
  supportsEmbedding: false,
  supportsTokenCount: false,
  supportsSystemMessage: true,
  supportsThought: false,
  maxContextLength: 32_768,
  maxOutputTokens: 4_096,
};

/**
 * Adapter for OpenAI-compatible API servers (vLLM, TGI, LM Studio, Ollama).
 *
 * Extends OpenAiAdapter, reusing its converter and error classification.
 * The bootstrap factory injects an OpenAI SDK client configured with a
 * custom `baseURL` and optional `defaultHeaders`.
 */
export class OpenAiCompatibleAdapter extends OpenAiAdapter {
  override readonly providerName = 'openai-compatible';
  override readonly capabilities: LlmProviderCapabilities;

  constructor(config: AdapterConfig, client: OpenAiClient) {
    super(config, client);

    // Merge user-provided capability overrides with conservative defaults.
    const overrides = config['capabilities'] as
      | Partial<LlmProviderCapabilities>
      | undefined;
    this.capabilities = overrides
      ? { ...OPENAI_COMPATIBLE_DEFAULT_CAPABILITIES, ...overrides }
      : { ...OPENAI_COMPATIBLE_DEFAULT_CAPABILITIES };
  }

  /**
   * Test connectivity to the OpenAI-compatible server.
   *
   * Sends a minimal chat completion request. Any HTTP response (even an
   * error like 401 or 404) confirms the server is reachable. Only network
   * errors (timeout, connection refused) return false.
   *
   * Not part of the ContentGenerator interface — extension-specific.
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.client.chat.completions.create({
        model: 'test',
        messages: [{ role: 'user', content: 'ping' }],
        max_completion_tokens: 1,
      });
      return true;
    } catch (error: unknown) {
      // Got an HTTP response → server is reachable
      const status = (error as Record<string, unknown>)?.['status'] as
        | number
        | undefined;
      return status !== undefined;
    }
  }
}
