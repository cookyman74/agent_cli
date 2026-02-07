/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TelemetryBridge — provider-agnostic telemetry schema utilities.
 *
 * Bridges LlmTokenUsage (providers layer) ↔ GenAIUsageDetails (telemetry layer).
 * Provides factory functions to create API telemetry events with a provider field.
 *
 * @see M2.2.5 Telemetry 포맷 변경
 */

import type { LlmTokenUsage } from './types.js';
import type { GenAIUsageDetails } from '../telemetry/types.js';

// ============================================================================
// Usage Conversion
// ============================================================================

/**
 * Converts provider-agnostic LlmTokenUsage to telemetry GenAIUsageDetails.
 */
export function llmTokenUsageToGenAIUsage(
  usage: LlmTokenUsage,
): GenAIUsageDetails {
  return {
    input_token_count: usage.promptTokens,
    output_token_count: usage.completionTokens,
    total_token_count: usage.totalTokens,
    cached_content_token_count: usage.cachedTokens ?? 0,
    thoughts_token_count: usage.thoughtTokens ?? 0,
    tool_token_count: usage.toolTokens ?? 0,
  };
}

/**
 * Converts telemetry GenAIUsageDetails back to provider-agnostic LlmTokenUsage.
 */
export function genAIUsageToLlmTokenUsage(
  genAI: GenAIUsageDetails,
): LlmTokenUsage {
  return {
    promptTokens: genAI.input_token_count,
    completionTokens: genAI.output_token_count,
    totalTokens: genAI.total_token_count,
    cachedTokens: genAI.cached_content_token_count,
    thoughtTokens: genAI.thoughts_token_count,
    toolTokens: genAI.tool_token_count,
  };
}

// ============================================================================
// Provider-aware API Response Event
// ============================================================================

export interface ProviderApiResponseEventParams {
  model: string;
  durationMs: number;
  promptId: string;
  usage: LlmTokenUsage;
  provider?: string;
  authType?: string;
  responseText?: string;
  statusCode?: number | string;
  finishReasons?: string[];
}

/**
 * Provider-aware API response telemetry event.
 *
 * Drop-in replacement for ApiResponseEvent that accepts LlmTokenUsage
 * and includes a provider field.
 */
export class ProviderApiResponseEvent {
  'event.name' = 'api_response' as const;
  'event.timestamp': string;
  model: string;
  duration_ms: number;
  usage: GenAIUsageDetails;
  provider: string;
  prompt_id: string;
  auth_type?: string;
  response_text?: string;
  status_code?: number | string;

  constructor(params: ProviderApiResponseEventParams) {
    this['event.timestamp'] = new Date().toISOString();
    this.model = params.model;
    this.duration_ms = params.durationMs;
    this.usage = llmTokenUsageToGenAIUsage(params.usage);
    this.provider = params.provider ?? 'unknown';
    this.prompt_id = params.promptId;
    this.auth_type = params.authType;
    this.response_text = params.responseText;
    this.status_code = params.statusCode ?? 200;
  }

  toLogBody(): string {
    return `API response from ${this.model}. Status: ${this.status_code || 'N/A'}. Duration: ${this.duration_ms}ms.`;
  }
}

/**
 * Factory function to create a ProviderApiResponseEvent.
 */
export function createProviderApiResponseEvent(
  params: ProviderApiResponseEventParams,
): ProviderApiResponseEvent {
  return new ProviderApiResponseEvent(params);
}

// ============================================================================
// Provider-aware API Error Event
// ============================================================================

export interface ProviderApiErrorEventParams {
  model: string;
  error: string;
  durationMs: number;
  promptId: string;
  provider?: string;
  authType?: string;
  errorType?: string;
  statusCode?: number | string;
}

/**
 * Provider-aware API error telemetry event.
 */
export class ProviderApiErrorEvent {
  'event.name' = 'api_error' as const;
  'event.timestamp': string;
  model: string;
  error: string;
  error_type?: string;
  status_code?: number | string;
  duration_ms: number;
  provider: string;
  prompt_id: string;
  auth_type?: string;

  constructor(params: ProviderApiErrorEventParams) {
    this['event.timestamp'] = new Date().toISOString();
    this.model = params.model;
    this.error = params.error;
    this.error_type = params.errorType;
    this.status_code = params.statusCode;
    this.duration_ms = params.durationMs;
    this.provider = params.provider ?? 'unknown';
    this.prompt_id = params.promptId;
    this.auth_type = params.authType;
  }

  toLogBody(): string {
    return `API error for ${this.model}. Error: ${this.error}. Duration: ${this.duration_ms}ms.`;
  }
}

/**
 * Factory function to create a ProviderApiErrorEvent.
 */
export function createProviderApiErrorEvent(
  params: ProviderApiErrorEventParams,
): ProviderApiErrorEvent {
  return new ProviderApiErrorEvent(params);
}
