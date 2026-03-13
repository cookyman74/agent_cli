/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';

import {
  type LlmErrorEvent,
  type LlmFinishedEvent,
  type LlmTextDeltaEvent,
  LlmEventType,
} from '../events.js';

import {
  normalizeDidimDomain,
  detectScheme,
  getDidimEndpoint,
  buildDidimHeaders,
  buildDidimRequestBody,
  parseDidimResponse,
  parseDidimSseEvent,
  convertDidimResponseToLlm,
  convertDidimSseToLlmEvents,
} from './converter.js';

// ============================================================================
// RED-1: normalizeDidimDomain
// ============================================================================
describe('normalizeDidimDomain', () => {
  it('should remove https:// prefix', () => {
    expect(normalizeDidimDomain('https://aistudio.didim365.com')).toBe(
      'aistudio.didim365.com',
    );
  });

  it('should remove http:// prefix', () => {
    expect(normalizeDidimDomain('http://aistudio.didim365.com')).toBe(
      'aistudio.didim365.com',
    );
  });

  it('should remove trailing slash', () => {
    expect(normalizeDidimDomain('aistudio.didim365.com/')).toBe(
      'aistudio.didim365.com',
    );
  });

  it('should remove path segments', () => {
    expect(normalizeDidimDomain('aistudio.didim365.com/some/path')).toBe(
      'aistudio.didim365.com',
    );
  });

  it('should handle double protocol', () => {
    expect(normalizeDidimDomain('https://https://aistudio.didim365.com')).toBe(
      'aistudio.didim365.com',
    );
  });

  it('should pass through clean domain', () => {
    expect(normalizeDidimDomain('aistudio.didim365.com')).toBe(
      'aistudio.didim365.com',
    );
  });

  it('should return empty string for empty input', () => {
    expect(normalizeDidimDomain('')).toBe('');
  });

  it('should return empty string for whitespace-only input', () => {
    expect(normalizeDidimDomain('   ')).toBe('');
  });

  it('should preserve port number in domain', () => {
    expect(normalizeDidimDomain('aistudio.didim365.com:8443')).toBe(
      'aistudio.didim365.com:8443',
    );
  });

  it('should strip query string from domain', () => {
    expect(normalizeDidimDomain('aistudio.didim365.com?key=val')).toBe(
      'aistudio.didim365.com',
    );
  });

  it('should handle domain with port and path', () => {
    expect(
      normalizeDidimDomain('https://aistudio.didim365.com:8443/api/v1'),
    ).toBe('aistudio.didim365.com:8443');
  });
});

// ============================================================================
// RED-1b: detectScheme
// ============================================================================
describe('detectScheme', () => {
  it('should detect http:// as http', () => {
    expect(detectScheme('http://localhost:8008')).toBe('http');
  });

  it('should detect https:// as https', () => {
    expect(detectScheme('https://aistudio.didim365.com')).toBe('https');
  });

  it('should default to https when no protocol specified', () => {
    expect(detectScheme('aistudio.didim365.com')).toBe('https');
  });

  it('should handle whitespace before protocol', () => {
    expect(detectScheme('  http://localhost')).toBe('http');
  });
});

// ============================================================================
// RED-2: getDidimEndpoint
// ============================================================================
describe('getDidimEndpoint', () => {
  it('should return invoke URL for non-streaming', () => {
    expect(getDidimEndpoint('aistudio.didim365.com')).toBe(
      'https://aistudio.didim365.com/scenario-gateway/v1/invoke',
    );
  });

  it('should return /sse URL for sse streaming mode', () => {
    expect(
      getDidimEndpoint('aistudio.didim365.com', {
        streaming: true,
        streamMode: 'sse',
      }),
    ).toBe('https://aistudio.didim365.com/scenario-gateway/v1/invoke/sse');
  });

  it('should return /sse/improved URL for improved streaming mode', () => {
    expect(
      getDidimEndpoint('aistudio.didim365.com', {
        streaming: true,
        streamMode: 'improved',
      }),
    ).toBe(
      'https://aistudio.didim365.com/scenario-gateway/v1/invoke/sse/improved',
    );
  });

  it('should normalize domain before building URL', () => {
    expect(getDidimEndpoint('https://aistudio.didim365.com/path')).toBe(
      'https://aistudio.didim365.com/scenario-gateway/v1/invoke',
    );
  });

  it('should throw error for empty domain', () => {
    expect(() => getDidimEndpoint('')).toThrow('Invalid domain provided');
  });

  it('should throw error for whitespace-only domain', () => {
    expect(() => getDidimEndpoint('   ')).toThrow('Invalid domain provided');
  });

  // --- http:// protocol preservation for local dev (2팀 R2 이슈 3) ---
  it('should preserve http:// for local development', () => {
    expect(getDidimEndpoint('http://localhost:8008')).toBe(
      'http://localhost:8008/scenario-gateway/v1/invoke',
    );
  });

  it('should preserve http:// for local dev with streaming', () => {
    expect(
      getDidimEndpoint('http://localhost:8008', {
        streaming: true,
        streamMode: 'improved',
      }),
    ).toBe('http://localhost:8008/scenario-gateway/v1/invoke/sse/improved');
  });

  it('should default to https:// when no protocol specified', () => {
    expect(getDidimEndpoint('aistudio.didim365.com')).toBe(
      'https://aistudio.didim365.com/scenario-gateway/v1/invoke',
    );
  });
});

// ============================================================================
// RED-3: buildDidimHeaders
// ============================================================================
describe('buildDidimHeaders', () => {
  it('should include Authorization Bearer header', () => {
    const headers = buildDidimHeaders('jwt_token_123');
    expect(headers['Authorization']).toBe('Bearer jwt_token_123');
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('should include x-thread-id when provided', () => {
    const headers = buildDidimHeaders('jwt_token', 'thread_abc');
    expect(headers['x-thread-id']).toBe('thread_abc');
  });

  it('should not include x-thread-id when null', () => {
    const headers = buildDidimHeaders('jwt_token', null);
    expect(headers['x-thread-id']).toBeUndefined();
  });

  it('should not include x-thread-id when empty string', () => {
    const headers = buildDidimHeaders('jwt_token', '');
    expect(headers['x-thread-id']).toBeUndefined();
  });

  it('should not include x-thread-id when whitespace-only', () => {
    const headers = buildDidimHeaders('jwt_token', '   ');
    expect(headers['x-thread-id']).toBeUndefined();
  });

  // --- threadId trim (2팀 R2 이슈 6) ---
  it('should trim threadId value before setting header', () => {
    const headers = buildDidimHeaders('jwt_token', '  th_1  ');
    expect(headers['x-thread-id']).toBe('th_1');
  });
});

// ============================================================================
// RED-4: buildDidimRequestBody
// ============================================================================
describe('buildDidimRequestBody', () => {
  it('should create body with chat field', () => {
    const body = buildDidimRequestBody('Hello');
    expect(body).toEqual({ chat: 'Hello' });
  });

  it('should include thread_id when provided', () => {
    const body = buildDidimRequestBody('Hello', 'thread_1');
    expect(body).toEqual({ chat: 'Hello', thread_id: 'thread_1' });
  });

  it('should not include thread_id when empty string', () => {
    const body = buildDidimRequestBody('Hello', '');
    expect(body).toEqual({ chat: 'Hello' });
  });

  it('should not include thread_id when whitespace-only', () => {
    const body = buildDidimRequestBody('Hello', '   ');
    expect(body).toEqual({ chat: 'Hello' });
  });

  // --- threadId trim (2팀 R2 이슈 6) ---
  it('should trim threadId value before setting body field', () => {
    const body = buildDidimRequestBody('Hello', '  thread_1  ');
    expect(body).toEqual({ chat: 'Hello', thread_id: 'thread_1' });
  });
});

// ============================================================================
// RED-5: parseDidimResponse
// ============================================================================
describe('parseDidimResponse', () => {
  it('should extract response and thread_id', () => {
    const result = parseDidimResponse({
      response: 'Hello!',
      thread_id: 'th_1',
    });
    expect(result).toEqual({ content: 'Hello!', threadId: 'th_1' });
  });

  it('should handle non-string response as empty', () => {
    const result = parseDidimResponse({ response: 123 });
    expect(result.content).toBe('');
  });

  it('should handle missing thread_id as null', () => {
    const result = parseDidimResponse({ response: 'Hi' });
    expect(result.threadId).toBeNull();
  });
});

// ============================================================================
// RED-6: parseDidimSseEvent (sse mode)
// ============================================================================
describe('parseDidimSseEvent (sse mode)', () => {
  // --- Happy path ---
  it('should parse message event with chunk', () => {
    const result = parseDidimSseEvent('message', '{"chunk": "Hello"}', 'sse');
    expect(result).toEqual({ type: 'delta', text: 'Hello' });
  });

  it('should parse done event with thread_id', () => {
    const result = parseDidimSseEvent('done', '{"thread_id": "th_1"}', 'sse');
    expect(result).toEqual({ type: 'done', threadId: 'th_1' });
  });

  it('should parse error event', () => {
    const result = parseDidimSseEvent('error', '{"message": "fail"}', 'sse');
    expect(result).toEqual({ type: 'error', message: 'fail' });
  });

  // --- Malformed input ---
  it('should return error event with message for invalid JSON data', () => {
    const result = parseDidimSseEvent('message', '{invalid json}', 'sse');
    expect(result).not.toBeNull();
    expect(result!.type).toBe('error');
    expect((result as { type: 'error'; message: string }).message).toContain(
      'Invalid JSON',
    );
  });

  it('should handle unknown event type gracefully', () => {
    const result = parseDidimSseEvent(
      'unknown_event',
      '{"data": "test"}',
      'sse',
    );
    expect(result).toBeNull();
  });

  it('should handle empty data (keep-alive frame)', () => {
    const result = parseDidimSseEvent('message', '', 'sse');
    expect(result).toBeNull();
  });

  // --- Keep-alive whitespace (2팀 R2 이슈 4) ---
  it('should handle whitespace-only data as keep-alive', () => {
    const result = parseDidimSseEvent('message', '   ', 'sse');
    expect(result).toBeNull();
  });

  it('should handle missing chunk field in message event', () => {
    const result = parseDidimSseEvent('message', '{"other": "field"}', 'sse');
    expect(result).toEqual({ type: 'delta', text: '' });
  });

  it('should handle non-string chunk type as empty text', () => {
    const result = parseDidimSseEvent('message', '{"chunk": 123}', 'sse');
    expect(result).toEqual({ type: 'delta', text: '' });
  });

  it('should handle empty JSON object as delta with empty text', () => {
    const result = parseDidimSseEvent('message', '{}', 'sse');
    expect(result).toEqual({ type: 'delta', text: '' });
  });
});

// ============================================================================
// RED-7: parseDidimSseEvent (improved mode)
// ============================================================================
describe('parseDidimSseEvent (improved mode)', () => {
  // --- Happy path ---
  it('should parse message_partial with chunk field', () => {
    const result = parseDidimSseEvent(
      'message_partial',
      '{"chunk": "Hel"}',
      'improved',
    );
    expect(result).toEqual({ type: 'delta', text: 'Hel' });
  });

  it('should parse message_partial with content field (fallback)', () => {
    const result = parseDidimSseEvent(
      'message_partial',
      '{"content": "Hel"}',
      'improved',
    );
    expect(result).toEqual({ type: 'delta', text: 'Hel' });
  });

  it('should parse message_partial with message field (fallback)', () => {
    const result = parseDidimSseEvent(
      'message_partial',
      '{"message": "Hel"}',
      'improved',
    );
    expect(result).toEqual({ type: 'delta', text: 'Hel' });
  });

  it('should prefer chunk over content over message for field extraction', () => {
    const result = parseDidimSseEvent(
      'message_partial',
      '{"chunk": "A", "content": "B", "message": "C"}',
      'improved',
    );
    expect(result).toEqual({ type: 'delta', text: 'A' });
  });

  it('should parse message event as final_message', () => {
    const result = parseDidimSseEvent(
      'message',
      '{"chunk": "Hello"}',
      'improved',
    );
    expect(result).toEqual({ type: 'final_message', text: 'Hello' });
  });

  it('should parse complete event as done', () => {
    const result = parseDidimSseEvent(
      'complete',
      '{"thread_id": "th_2"}',
      'improved',
    );
    expect(result).toEqual({ type: 'done', threadId: 'th_2' });
  });

  // --- done event (06-plan uses 'done', OpenAPI uses 'complete') ---
  it('should parse done event as done in improved mode', () => {
    const result = parseDidimSseEvent(
      'done',
      '{"thread_id": "th_3"}',
      'improved',
    );
    expect(result).toEqual({ type: 'done', threadId: 'th_3' });
  });

  // --- Improved mode additional event types (2팀 R2 이슈 1) ---
  it('should parse message_complete as delta with text', () => {
    const result = parseDidimSseEvent(
      'message_complete',
      '{"message": "Tool result"}',
      'improved',
    );
    expect(result).toEqual({ type: 'delta', text: 'Tool result' });
  });

  it('should parse message_metadata as metadata event', () => {
    const result = parseDidimSseEvent(
      'message_metadata',
      '{"langgraph_node": "step_1", "step": 1, "model": "gpt-4"}',
      'improved',
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('metadata');
    const meta = result as {
      type: 'metadata';
      eventName: string;
      data: Record<string, unknown>;
    };
    expect(meta.eventName).toBe('message_metadata');
    expect(meta.data['langgraph_node']).toBe('step_1');
  });

  it('should parse process as metadata event', () => {
    const result = parseDidimSseEvent(
      'process',
      '{"process_name": "search", "process_type": "function"}',
      'improved',
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('metadata');
    const meta = result as {
      type: 'metadata';
      eventName: string;
      data: Record<string, unknown>;
    };
    expect(meta.eventName).toBe('process');
    expect(meta.data['process_name']).toBe('search');
  });

  // --- error with 'error' field (OpenAPI: {"error": "...", "error_code": "..."}) ---
  it('should parse error event with error field', () => {
    const result = parseDidimSseEvent(
      'error',
      '{"error": "AUTH_FAILED", "error_code": "401"}',
      'improved',
    );
    expect(result).toEqual({ type: 'error', message: 'AUTH_FAILED' });
  });

  it('should parse error event with message field', () => {
    const result = parseDidimSseEvent(
      'error',
      '{"message": "Server error"}',
      'improved',
    );
    expect(result).toEqual({ type: 'error', message: 'Server error' });
  });

  // --- Malformed input ---
  it('should return error event with message for invalid JSON in improved mode', () => {
    const result = parseDidimSseEvent(
      'message_partial',
      'not-json',
      'improved',
    );
    expect(result).not.toBeNull();
    expect(result!.type).toBe('error');
    expect((result as { type: 'error'; message: string }).message).toContain(
      'Invalid JSON',
    );
  });

  it('should handle missing text fields in message_partial', () => {
    const result = parseDidimSseEvent(
      'message_partial',
      '{"other": "value"}',
      'improved',
    );
    expect(result).toEqual({ type: 'delta', text: '' });
  });

  it('should handle empty keep-alive data in improved mode', () => {
    const result = parseDidimSseEvent('message_partial', '', 'improved');
    expect(result).toBeNull();
  });

  it('should handle whitespace-only data as keep-alive in improved mode', () => {
    const result = parseDidimSseEvent('message_partial', '  \n  ', 'improved');
    expect(result).toBeNull();
  });

  it('should handle non-string content type as empty text', () => {
    const result = parseDidimSseEvent(
      'message_partial',
      '{"content": true}',
      'improved',
    );
    expect(result).toEqual({ type: 'delta', text: '' });
  });

  it('should return null for unknown event type in improved mode', () => {
    const result = parseDidimSseEvent(
      'totally_unknown',
      '{"data": "test"}',
      'improved',
    );
    expect(result).toBeNull();
  });
});

// ============================================================================
// RED-8: convertDidimResponseToLlm
// ============================================================================
describe('convertDidimResponseToLlm', () => {
  it('should return a full LlmGenerateResponse with id, model, content, and stopReason', () => {
    const result = convertDidimResponseToLlm(
      { content: 'Hello!', threadId: 'th_1' },
      'didim-default',
    );
    expect(result.id).toMatch(/^didim-/);
    expect(result.model).toBe('didim-default');
    expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
    expect(result.stopReason).toBe('end_turn');
  });

  it('should generate unique ids for each call', () => {
    const r1 = convertDidimResponseToLlm(
      { content: 'A', threadId: null },
      'didim-default',
    );
    const r2 = convertDidimResponseToLlm(
      { content: 'B', threadId: null },
      'didim-default',
    );
    expect(r1.id).not.toBe(r2.id);
  });

  it('should handle empty content', () => {
    const result = convertDidimResponseToLlm(
      { content: '', threadId: 'th_1' },
      'didim-default',
    );
    expect(result.content).toEqual([{ type: 'text', text: '' }]);
  });

  it('should pass through the model parameter', () => {
    const result = convertDidimResponseToLlm(
      { content: 'test', threadId: null },
      'custom-scenario-model',
    );
    expect(result.model).toBe('custom-scenario-model');
  });
});

// ============================================================================
// RED-9: convertDidimSseToLlmEvents
// ============================================================================
describe('convertDidimSseToLlmEvents', () => {
  it('should convert delta to TextDelta event with correct text', () => {
    const events = convertDidimSseToLlmEvents({ type: 'delta', text: 'Hi' });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(LlmEventType.TextDelta);
    expect((events[0] as LlmTextDeltaEvent).text).toBe('Hi');
  });

  // --- improved message → final_message (2팀 R2 이슈 2) ---
  it('should convert final_message to TextDelta event', () => {
    const events = convertDidimSseToLlmEvents({
      type: 'final_message',
      text: 'Full response',
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(LlmEventType.TextDelta);
    expect((events[0] as LlmTextDeltaEvent).text).toBe('Full response');
  });

  it('should convert done to Finished then MessageEnd in correct order', () => {
    const events = convertDidimSseToLlmEvents({
      type: 'done',
      threadId: 'th_1',
    });
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe(LlmEventType.Finished);
    expect(events[1].type).toBe(LlmEventType.MessageEnd);
    expect((events[0] as LlmFinishedEvent).finishReason).toBe('end_turn');
  });

  it('should convert error to Error event with error payload', () => {
    const events = convertDidimSseToLlmEvents({
      type: 'error',
      message: 'Server failure',
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(LlmEventType.Error);
    const errorEvent = events[0] as LlmErrorEvent;
    expect(errorEvent.error).toBeDefined();
    expect(String(errorEvent.error)).toContain('Server failure');
  });

  it('should use fallback message for empty error string', () => {
    const events = convertDidimSseToLlmEvents({
      type: 'error',
      message: '',
    });
    const errorEvent = events[0] as LlmErrorEvent;
    expect(errorEvent.error).toBe('Unknown DidimAIStudio error');
  });

  // --- metadata → empty (2팀 R2 이슈 1) ---
  it('should produce no LlmEvents for metadata events', () => {
    const events = convertDidimSseToLlmEvents({
      type: 'metadata',
      eventName: 'message_metadata',
      data: { langgraph_node: 'step_1' },
    });
    expect(events).toHaveLength(0);
  });
});
