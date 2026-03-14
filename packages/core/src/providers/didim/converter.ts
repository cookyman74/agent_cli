/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * DidimAIStudio converter — pure functions for request/response transformation.
 *
 * Converts between the LLM-agnostic types used by the adapter layer and the
 * DidimAIStudio REST/SSE API format.
 *
 * API contract (master plan §1.2 + 06-didiaistudio-plan.md):
 * - Invoke:   POST {baseUrl}/scenario-gateway/v1/invoke
 * - SSE:      POST {baseUrl}/scenario-gateway/v1/invoke/sse
 * - Improved: POST {baseUrl}/scenario-gateway/v1/invoke/sse/improved
 * - Auth:     Authorization: Bearer {jwt_token}
 * - Body:     { chat: string, thread_id?: string }
 * - Response: { response: string, thread_id: string }
 *
 * Improved mode event types (OpenAPI spec + 06-plan):
 * - message_partial:  토큰 스트리밍 (chunk/content/message 필드)
 * - message_complete: ToolMessage 완료 (message 필드 or process_name)
 * - message_metadata: 실행 컨텍스트 (langgraph_node, step, model) → 비콘텐츠
 * - process:          노드 진행 상황 → 비콘텐츠
 * - message:          최종 완성 응답 → adapter가 delta 이후 중복 억제
 * - complete/done:    실행 완료 (thread_id, qa_id)
 * - error:            에러
 */

import {
  type LlmEvent,
  type LlmFinishedEvent,
  type LlmMessageEndEvent,
  type LlmTextDeltaEvent,
  type LlmErrorEvent,
  LlmEventType,
} from '../events.js';
import type { LlmGenerateResponse } from '../types.js';

// ============================================================================
// Types
// ============================================================================

/** SSE stream mode. */
export type DidimStreamMode = 'sse' | 'improved';

/** Raw response from the DidimAIStudio invoke endpoint. */
export interface DidimResponse {
  response?: unknown;
  thread_id?: unknown;
}

/** Parsed response in application-level types. */
export interface DidimParsedResponse {
  content: string;
  threadId: string | null;
}

/**
 * Intermediate SSE event after parsing, before LlmEvent conversion.
 *
 * - delta:         토큰 스트리밍 텍스트 (message_partial, sse message)
 * - final_message: improved 모드 최종 완성 응답 — adapter가 delta 이후 중복 억제
 * - done:          스트림 완료 (complete/done 이벤트)
 * - error:         에러
 * - metadata:      비콘텐츠 메타데이터 (message_metadata, process, message_complete 중 비텍스트)
 */
export type DidimSseEvent =
  | { type: 'delta'; text: string }
  | { type: 'final_message'; text: string }
  | { type: 'done'; threadId: string | null }
  | { type: 'error'; message: string }
  | { type: 'metadata'; eventName: string; data: Record<string, unknown> };

/** Options for endpoint generation. */
export interface DidimEndpointOptions {
  streaming?: boolean;
  streamMode?: DidimStreamMode;
}

/** Default response ID prefix for DidimAIStudio (no server-side ID). */
const DIDIM_RESPONSE_ID_PREFIX = 'didim-';

// ============================================================================
// Domain & Endpoint
// ============================================================================

const INVOKE_PATH = '/scenario-gateway/v1/invoke';

/**
 * Normalizes a DidimAIStudio domain by stripping protocol prefixes,
 * trailing slashes, and path segments. Preserves port numbers.
 */
export function normalizeDidimDomain(raw: string): string {
  if (!raw || !raw.trim()) {
    return '';
  }

  let domain = raw.trim();

  // Strip protocol(s) — handles double-protocol edge case
  domain = domain.replace(/^(https?:\/\/)+/i, '');

  // Strip query string, hash, and path
  domain = domain.split('?')[0].split('#')[0];
  const slashIdx = domain.indexOf('/');
  if (slashIdx !== -1) {
    domain = domain.substring(0, slashIdx);
  }

  return domain;
}

/**
 * Detects the protocol scheme from a raw domain/URL string.
 * Returns 'http' if explicitly specified, otherwise defaults to 'https'.
 *
 * Supports http:// for local development (e.g., http://localhost:8008).
 */
export function detectScheme(raw: string): 'http' | 'https' {
  return /^http:\/\//i.test(raw.trim()) ? 'http' : 'https';
}

/**
 * Builds the full endpoint URL for a given domain and options.
 * Preserves http:// protocol when explicitly provided (local dev support).
 */
export function getDidimEndpoint(
  domain: string,
  options?: DidimEndpointOptions,
): string {
  const scheme = detectScheme(domain);
  const normalizedDomain = normalizeDidimDomain(domain);
  if (!normalizedDomain) {
    throw new Error('Invalid domain provided');
  }
  let url = `${scheme}://${normalizedDomain}${INVOKE_PATH}`;

  if (options?.streaming) {
    url += '/sse';
    if (options.streamMode === 'improved') {
      url += '/improved';
    }
  }

  return url;
}

// ============================================================================
// Headers & Body
// ============================================================================

/**
 * Builds HTTP headers for a DidimAIStudio request.
 * Trims threadId before use — whitespace-only values are excluded.
 */
export function buildDidimHeaders(
  jwtToken: string,
  threadId?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${jwtToken}`,
    'Content-Type': 'application/json',
  };

  const trimmed = threadId?.trim();
  if (trimmed) {
    headers['x-thread-id'] = trimmed;
  }

  return headers;
}

/**
 * Builds the JSON request body for a DidimAIStudio request.
 * Trims threadId before use — whitespace-only values are excluded.
 */
export function buildDidimRequestBody(
  chat: string,
  threadId?: string | null,
): Record<string, string> {
  const body: Record<string, string> = { chat };
  const trimmed = threadId?.trim();
  if (trimmed) {
    body['thread_id'] = trimmed;
  }
  return body;
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parses a raw DidimAIStudio invoke response into typed application data.
 */
export function parseDidimResponse(raw: DidimResponse): DidimParsedResponse {
  const content = typeof raw.response === 'string' ? raw.response : '';
  const threadId = typeof raw.thread_id === 'string' ? raw.thread_id : null;
  return { content, threadId };
}

// ============================================================================
// SSE Event Parsing
// ============================================================================

/**
 * Extracts a text field from parsed SSE data using a fallback chain.
 *
 * Design docs use inconsistent field names across documents:
 * - 06-didiaistudio-plan.md: "chunk"
 * - master plan: "content"
 * - OpenAPI description: "message"
 *
 * This function tries all known field names to handle any server version.
 */
function extractTextField(parsed: Record<string, unknown>): string {
  for (const key of ['chunk', 'content', 'message']) {
    if (typeof parsed[key] === 'string') {
      return parsed[key];
    }
  }
  return '';
}

/**
 * Parses a single SSE event (event name + data string) into a DidimSseEvent.
 *
 * Handles both `sse` and `improved` stream modes with graceful fallback
 * for malformed input (invalid JSON, unknown events, empty/whitespace keep-alive).
 *
 * @returns Parsed event, or `null` for ignored/keep-alive/metadata events.
 */
export function parseDidimSseEvent(
  eventName: string,
  data: string,
  mode: DidimStreamMode,
): DidimSseEvent | null {
  // Empty or whitespace-only data → keep-alive, ignore
  if (!data || !data.trim()) {
    return null;
  }

  // Parse JSON safely
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data) as Record<string, unknown>;
  } catch {
    // Invalid JSON → return error event with raw data for debugging
    return { type: 'error', message: `Invalid JSON: ${data}` };
  }

  if (mode === 'sse') {
    return parseSseMode(eventName, parsed);
  }
  return parseImprovedMode(eventName, parsed);
}

function parseSseMode(
  eventName: string,
  parsed: Record<string, unknown>,
): DidimSseEvent | null {
  switch (eventName) {
    case 'message':
      return {
        type: 'delta',
        text: typeof parsed['chunk'] === 'string' ? parsed['chunk'] : '',
      };
    case 'done':
      return {
        type: 'done',
        threadId:
          typeof parsed['thread_id'] === 'string' ? parsed['thread_id'] : null,
      };
    case 'error':
      return {
        type: 'error',
        message:
          typeof parsed['message'] === 'string'
            ? parsed['message']
            : 'Unknown error',
      };
    default:
      return null;
  }
}

function parseImprovedMode(
  eventName: string,
  parsed: Record<string, unknown>,
): DidimSseEvent | null {
  switch (eventName) {
    // Token streaming
    case 'message_partial':
      return {
        type: 'delta',
        text: extractTextField(parsed),
      };

    // ToolMessage completion — may carry text content
    case 'message_complete':
      return {
        type: 'delta',
        text: extractTextField(parsed),
      };

    // Final completed response — adapter suppresses when deltas already emitted
    case 'message':
      return {
        type: 'final_message',
        text: extractTextField(parsed),
      };

    // Completion event — supports both 'complete' (OpenAPI) and 'done' (06-plan)
    case 'complete':
    case 'done':
      return {
        type: 'done',
        threadId:
          typeof parsed['thread_id'] === 'string' ? parsed['thread_id'] : null,
      };

    case 'error':
      return {
        type: 'error',
        message:
          typeof parsed['message'] === 'string'
            ? parsed['message']
            : typeof parsed['error'] === 'string'
              ? parsed['error']
              : 'Unknown error',
      };

    // Non-content metadata events — recognized but not converted to text
    case 'message_metadata':
    case 'process':
      return {
        type: 'metadata',
        eventName,
        data: parsed,
      };

    default:
      // Unknown event — return null. Phase 2 adapter can log if needed.
      return null;
  }
}

// ============================================================================
// LlmEvent Conversion
// ============================================================================

/**
 * Generates a unique response ID for DidimAIStudio responses.
 * DidimAIStudio does not provide server-side response IDs.
 */
export function generateDidimResponseId(): string {
  return `${DIDIM_RESPONSE_ID_PREFIX}${crypto.randomUUID()}`;
}

/**
 * Converts a parsed DidimAIStudio invoke response to an LlmGenerateResponse.
 */
export function convertDidimResponseToLlm(
  parsed: DidimParsedResponse,
  model: string,
): LlmGenerateResponse {
  return {
    id: generateDidimResponseId(),
    content: [{ type: 'text', text: parsed.content }],
    model,
    stopReason: 'end_turn',
  };
}

/**
 * Converts a DidimSseEvent to one or more LlmEvents.
 *
 * Event mapping:
 * - delta         → TextDelta
 * - final_message → TextDelta (adapter suppresses when deltas already emitted)
 * - done          → Finished + MessageEnd (in order)
 * - error         → Error
 * - metadata      → [] (non-content, silently skipped)
 */
export function convertDidimSseToLlmEvents(event: DidimSseEvent): LlmEvent[] {
  switch (event.type) {
    case 'delta':
    case 'final_message': {
      const textEvent: LlmTextDeltaEvent = {
        type: LlmEventType.TextDelta,
        text: event.text,
      };
      return [textEvent];
    }

    case 'done': {
      const finishedEvent: LlmFinishedEvent = {
        type: LlmEventType.Finished,
        finishReason: 'end_turn',
      };
      const messageEndEvent: LlmMessageEndEvent = {
        type: LlmEventType.MessageEnd,
      };
      return [finishedEvent, messageEndEvent];
    }

    case 'error': {
      const errorEvent: LlmErrorEvent = {
        type: LlmEventType.Error,
        error: event.message || 'Unknown DidimAIStudio error',
      };
      return [errorEvent];
    }

    case 'metadata':
      // Non-content events — no LlmEvents produced
      return [];

    default:
      return [];
  }
}
