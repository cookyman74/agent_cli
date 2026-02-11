/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * OpenAI-compatible provider bootstrap — registers the
 * OpenAiCompatibleAdapter factory in the ProviderRegistry.
 *
 * Supports custom base URL, API key, custom headers, and custom
 * API key header name via environment variables:
 *   - LLM_BASE_URL: Required base URL for the server
 *   - LLM_API_KEY: Optional API key
 *   - LLM_CUSTOM_HEADERS: Optional JSON-encoded custom headers
 *   - LLM_API_KEY_HEADER: Optional custom header name for API key
 *
 * @see docs/ai_adapter/03-technical-design.md §3.4
 */

import OpenAI from 'openai';
import { ProviderRegistry } from '../registry.js';
import { OpenAiCompatibleAdapter } from './adapter.js';
import type { OpenAiClient } from '../openai/adapter.js';
import type { AdapterConfig } from '../types.js';

/**
 * Register the OpenAI-compatible adapter factory in the provider registry.
 *
 * The factory creates an OpenAI SDK client configured with a custom
 * `baseURL` and optional `defaultHeaders`, then wraps it with
 * OpenAiCompatibleAdapter for provider-independent access.
 *
 * @param registry - Optional registry instance. Defaults to singleton.
 */
export function bootstrapOpenAiCompatibleProvider(
  registry?: ProviderRegistry,
): void {
  const reg = registry ?? ProviderRegistry.getInstance();
  if (reg.has('openai-compatible')) return;

  reg.register('openai-compatible', (config: AdapterConfig) => {
    const defaultHeaders: Record<string, string> = {};

    // Parse custom headers from env (JSON string)
    const customHeadersStr = process.env['LLM_CUSTOM_HEADERS'];
    if (customHeadersStr) {
      try {
        const parsed = JSON.parse(customHeadersStr) as Record<string, string>;
        Object.assign(defaultHeaders, parsed);
      } catch {
        // Ignore malformed JSON — proceed without custom headers
      }
    }

    // Custom API key header: use a custom header name instead of
    // the standard Authorization: Bearer header.
    // When LLM_API_KEY_HEADER is set, suppress the default Authorization
    // header by passing 'not-needed' as apiKey to the SDK, and inject
    // the real key via defaultHeaders instead.
    const apiKeyHeaderName = process.env['LLM_API_KEY_HEADER'];
    const useCustomAuthHeader = !!(apiKeyHeaderName && config.apiKey);
    if (useCustomAuthHeader) {
      defaultHeaders[apiKeyHeaderName] = config.apiKey!;
    }

    // Build SDK headers, optionally stripping the auto-generated
    // Authorization: Bearer header when a custom auth header is used.
    // OpenAI SDK buildHeaders merges authHeaders BEFORE defaultHeaders,
    // and treats null values as "delete this header".
    const sdkHeaders: Record<string, string | null> = { ...defaultHeaders };
    if (useCustomAuthHeader) {
      sdkHeaders['Authorization'] = null;
    }

    const client = new OpenAI({
      apiKey: useCustomAuthHeader
        ? 'not-needed'
        : (config.apiKey ?? 'not-needed'),
      baseURL: config.baseUrl,
      defaultHeaders:
        Object.keys(defaultHeaders).length > 0 ? sdkHeaders : undefined,
    });

    return new OpenAiCompatibleAdapter(
      config,
      client as unknown as OpenAiClient,
    );
  });
}
