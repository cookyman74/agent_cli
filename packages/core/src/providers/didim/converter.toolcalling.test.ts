/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * v0.9.12 Phase 4 RED 테스트: converter v2 tool-calling 이벤트 파싱 + LlmEvent 변환
 *
 * 설계서: 01_didim_tool_calling_provider_expansion_plan.md §6
 * 작업계획서: step04_gemini_cli_adapter_todolist.md
 *
 * 검증 대상:
 * - v2 SSE tool_call 이벤트 → DidimSseEvent 'tool_call' 타입 변환
 * - v2 SSE text_delta 이벤트 → DidimSseEvent 'delta' 타입 변환
 * - v2 SSE finished 이벤트 → DidimSseEvent 'done' 타입 변환 (finish_reason 보존)
 * - v2 SSE error 이벤트 → DidimSseEvent 'error' 타입 변환
 * - DidimSseEvent 'tool_call' → LlmToolCallRequestEvent 변환
 * - DidimSseEvent 'done' (tool_call_pending) → LlmFinishedEvent(finishReason='tool_use') 변환
 * - 기존 v1 text/done/error 이벤트 경로 불변
 *
 * 리뷰 반영:
 * - sequence, checkpoint_id assertion 강화
 * - v2 text_delta 파싱 독립 테스트 추가
 */

import { describe, it, expect } from 'vitest';
import { LlmEventType } from '../events.js';
import type { LlmToolCallRequestEvent } from '../events.js';

// =============================================================================
// 1. parseDidimSseEvent — v2 tool_call 이벤트 파싱
// =============================================================================

describe('parseDidimSseEvent — v2 tool_call events', () => {
  it('parses tool_call SSE event into DidimSseEvent with all fields', async () => {
    const { parseDidimSseEvent } = await import('./converter.js');

    const data = JSON.stringify({
      call_id: 'call_abc123',
      name: 'list_files',
      arguments: { path: '/home/user' },
      thread_id: 'thread-1',
      checkpoint_id: 'cp-1',
      sequence: 0,
    });

    const event = parseDidimSseEvent('tool_call', data, 'improved');

    expect(event).not.toBeNull();
    expect(event!.type).toBe('tool_call');
    if (event!.type === 'tool_call') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event as any).callId).toBe('call_abc123');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event as any).name).toBe('list_files');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event as any).args).toEqual({ path: '/home/user' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event as any).threadId).toBe('thread-1');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event as any).checkpointId).toBe('cp-1');
      // 리뷰 반영: sequence 필드 보존 검증
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event as any).sequence).toBe(0);
    }
  });

  it('parses tool_call SSE event in sse mode as well', async () => {
    const { parseDidimSseEvent } = await import('./converter.js');

    const data = JSON.stringify({
      call_id: 'call_xyz',
      name: 'run_shell',
      arguments: { command: 'ls' },
      thread_id: 't-1',
      checkpoint_id: 'cp-1',
      sequence: 0,
    });

    const event = parseDidimSseEvent('tool_call', data, 'sse');

    expect(event).not.toBeNull();
    expect(event!.type).toBe('tool_call');
  });

  it('parses multiple tool_call events preserving sequence and checkpoint_id', async () => {
    const { parseDidimSseEvent } = await import('./converter.js');

    const event0 = parseDidimSseEvent(
      'tool_call',
      JSON.stringify({
        call_id: 'call_1',
        name: 'read_file',
        arguments: { path: 'a.txt' },
        thread_id: 't-1',
        checkpoint_id: 'cp-1',
        sequence: 0,
      }),
      'improved',
    );

    const event1 = parseDidimSseEvent(
      'tool_call',
      JSON.stringify({
        call_id: 'call_2',
        name: 'write_file',
        arguments: { path: 'b.txt', content: 'hello' },
        thread_id: 't-1',
        checkpoint_id: 'cp-1',
        sequence: 1,
      }),
      'improved',
    );

    expect(event0).not.toBeNull();
    expect(event1).not.toBeNull();
    if (event0!.type === 'tool_call' && event1!.type === 'tool_call') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event0 as any).callId).toBe('call_1');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event0 as any).sequence).toBe(0);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event0 as any).checkpointId).toBe('cp-1');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event1 as any).callId).toBe('call_2');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event1 as any).sequence).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event1 as any).checkpointId).toBe('cp-1');
    }
  });

  it('returns error event when tool_call SSE is missing call_id', async () => {
    const { parseDidimSseEvent } = await import('./converter.js');

    const event = parseDidimSseEvent(
      'tool_call',
      JSON.stringify({
        name: 'list_files',
        arguments: { path: '.' },
        thread_id: 't-1',
        checkpoint_id: 'cp-1',
        sequence: 0,
      }),
      'improved',
    );

    expect(event).not.toBeNull();
    expect(event!.type).toBe('error');
    if (event && event.type === 'error') {
      expect(event.message).toContain('Malformed tool_call');
    }
  });

  it('returns error event when tool_call SSE is missing name', async () => {
    const { parseDidimSseEvent } = await import('./converter.js');

    const event = parseDidimSseEvent(
      'tool_call',
      JSON.stringify({
        call_id: 'call_1',
        arguments: { path: '.' },
        thread_id: 't-1',
        checkpoint_id: 'cp-1',
        sequence: 0,
      }),
      'improved',
    );

    expect(event).not.toBeNull();
    expect(event!.type).toBe('error');
  });
});

// =============================================================================
// 2. parseDidimSseEvent — v2 text_delta 이벤트 파싱 (💡3 리뷰 반영)
// =============================================================================

describe('parseDidimSseEvent — v2 text_delta events', () => {
  it('parses text_delta SSE event into DidimSseEvent with type "delta"', async () => {
    const { parseDidimSseEvent } = await import('./converter.js');

    const data = JSON.stringify({ text: '파일 목록을 확인하겠습니다.' });
    const event = parseDidimSseEvent('text_delta', data, 'improved');

    expect(event).not.toBeNull();
    expect(event!.type).toBe('delta');
    if (event && event.type === 'delta') {
      expect(event.text).toBe('파일 목록을 확인하겠습니다.');
    }
  });

  it('parses text_delta SSE event in sse mode', async () => {
    const { parseDidimSseEvent } = await import('./converter.js');

    const data = JSON.stringify({ text: 'hello world' });
    const event = parseDidimSseEvent('text_delta', data, 'sse');

    expect(event).not.toBeNull();
    expect(event!.type).toBe('delta');
  });
});

// =============================================================================
// 3. parseDidimSseEvent — v2 finished 이벤트 (finish_reason 보존)
// =============================================================================

describe('parseDidimSseEvent — v2 finished events', () => {
  it('parses finished SSE event with finish_reason "stop"', async () => {
    const { parseDidimSseEvent } = await import('./converter.js');

    const data = JSON.stringify({
      finish_reason: 'stop',
      thread_id: 'thread-1',
    });

    const event = parseDidimSseEvent('finished', data, 'improved');

    expect(event).not.toBeNull();
    expect(event!.type).toBe('done');
    if (event && event.type === 'done') {
      expect(event.threadId).toBe('thread-1');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event as any).finishReason).toBe('stop');
    }
  });

  it('parses finished SSE event with finish_reason "tool_call_pending"', async () => {
    const { parseDidimSseEvent } = await import('./converter.js');

    const data = JSON.stringify({
      finish_reason: 'tool_call_pending',
      thread_id: 'thread-1',
    });

    const event = parseDidimSseEvent('finished', data, 'improved');

    expect(event).not.toBeNull();
    expect(event!.type).toBe('done');
    if (event && event.type === 'done') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((event as any).finishReason).toBe('tool_call_pending');
    }
  });
});

// =============================================================================
// 4. parseDidimSseEvent — v2 error 이벤트
// =============================================================================

describe('parseDidimSseEvent — v2 error events', () => {
  it('parses v2 error SSE event with code', async () => {
    const { parseDidimSseEvent } = await import('./converter.js');

    const data = JSON.stringify({
      message: 'resume stream failed: LLM timeout',
      code: 'RESUME_STREAM_ERROR',
    });

    const event = parseDidimSseEvent('error', data, 'improved');

    expect(event).not.toBeNull();
    expect(event!.type).toBe('error');
    if (event && event.type === 'error') {
      expect(event.message).toContain('resume stream failed');
    }
  });
});

// =============================================================================
// 4-b. convertDidimSseToLlmEvents — error code 보존 매핑
// =============================================================================

describe('convertDidimSseToLlmEvents — v2 error code preservation', () => {
  it('preserves error code from server in LlmErrorEvent', async () => {
    const { convertDidimSseToLlmEvents } = await import('./converter.js');

    // error 이벤트에 code가 포함된 경우
    const sseEvent = {
      type: 'error' as const,
      message: 'resume stream failed',
      code: 'RESUME_STREAM_ERROR',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const llmEvents = convertDidimSseToLlmEvents(sseEvent as any);

    expect(llmEvents.length).toBe(1);
    expect(llmEvents[0].type).toBe(LlmEventType.Error);
    if (llmEvents[0].type === LlmEventType.Error) {
      expect(llmEvents[0].code).toBe('RESUME_STREAM_ERROR');
    }
  });
});

// =============================================================================
// 5. convertDidimSseToLlmEvents — tool_call → LlmToolCallRequestEvent
// =============================================================================

describe('convertDidimSseToLlmEvents — v2 tool_call', () => {
  it('converts tool_call DidimSseEvent to LlmToolCallRequestEvent', async () => {
    const { convertDidimSseToLlmEvents } = await import('./converter.js');

    const sseEvent = {
      type: 'tool_call' as const,
      callId: 'call_abc',
      name: 'list_files',
      args: { path: '/tmp' },
      threadId: 'thread-1',
      checkpointId: 'cp-1',
      sequence: 0,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const llmEvents = convertDidimSseToLlmEvents(sseEvent as any);

    expect(llmEvents.length).toBe(1);
    const toolCallEvent = llmEvents[0] as LlmToolCallRequestEvent;
    expect(toolCallEvent.type).toBe(LlmEventType.ToolCallRequest);
    expect(toolCallEvent.callId).toBe('call_abc');
    expect(toolCallEvent.name).toBe('list_files');
    expect(toolCallEvent.args).toEqual({ path: '/tmp' });
  });
});

// =============================================================================
// 6. convertDidimSseToLlmEvents — done(tool_call_pending) → Finished(tool_use)
// =============================================================================

describe('convertDidimSseToLlmEvents — v2 done with finish_reason', () => {
  it('converts done with finishReason "tool_call_pending" to Finished(tool_use)', async () => {
    const { convertDidimSseToLlmEvents } = await import('./converter.js');

    const sseEvent = {
      type: 'done' as const,
      threadId: 'thread-1',
      finishReason: 'tool_call_pending',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const llmEvents = convertDidimSseToLlmEvents(sseEvent as any);

    const finishedEvent = llmEvents.find(
      (e) => e.type === LlmEventType.Finished,
    );
    expect(finishedEvent).toBeDefined();
    expect(finishedEvent!.finishReason).toBe('tool_use');
  });

  it('converts done with finishReason "stop" to Finished(end_turn)', async () => {
    const { convertDidimSseToLlmEvents } = await import('./converter.js');

    const sseEvent = {
      type: 'done' as const,
      threadId: 'thread-1',
      finishReason: 'stop',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const llmEvents = convertDidimSseToLlmEvents(sseEvent as any);

    const finishedEvent = llmEvents.find(
      (e) => e.type === LlmEventType.Finished,
    );
    expect(finishedEvent).toBeDefined();
    expect(finishedEvent!.finishReason).toBe('end_turn');
  });

  it('converts done without finishReason to Finished(end_turn) — v1 호환', async () => {
    const { convertDidimSseToLlmEvents } = await import('./converter.js');

    const sseEvent = {
      type: 'done' as const,
      threadId: 'thread-1',
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const llmEvents = convertDidimSseToLlmEvents(sseEvent as any);

    const finishedEvent = llmEvents.find(
      (e) => e.type === LlmEventType.Finished,
    );
    expect(finishedEvent).toBeDefined();
    expect(finishedEvent!.finishReason).toBe('end_turn');
  });
});

// =============================================================================
// 7. v2 text_delta → LlmTextDeltaEvent 변환 (💡3 리뷰 반영)
// =============================================================================

describe('convertDidimSseToLlmEvents — v2 text_delta', () => {
  it('converts delta (from text_delta) to LlmTextDeltaEvent', async () => {
    const { convertDidimSseToLlmEvents } = await import('./converter.js');

    const events = convertDidimSseToLlmEvents({
      type: 'delta',
      text: '파일 목록입니다.',
    });

    expect(events.length).toBe(1);
    expect(events[0].type).toBe(LlmEventType.TextDelta);
    if (events[0].type === LlmEventType.TextDelta) {
      expect(events[0].text).toBe('파일 목록입니다.');
    }
  });
});

// =============================================================================
// 8. 기존 v1 이벤트 경로 불변 검증
// =============================================================================

describe('convertDidimSseToLlmEvents — v1 backwards compatibility', () => {
  it('converts delta to TextDelta — unchanged from v1', async () => {
    const { convertDidimSseToLlmEvents } = await import('./converter.js');

    const events = convertDidimSseToLlmEvents({
      type: 'delta',
      text: 'hello',
    });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(LlmEventType.TextDelta);
  });

  it('converts error to Error — unchanged from v1', async () => {
    const { convertDidimSseToLlmEvents } = await import('./converter.js');

    const events = convertDidimSseToLlmEvents({
      type: 'error',
      message: 'something went wrong',
    });
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(LlmEventType.Error);
  });
});
