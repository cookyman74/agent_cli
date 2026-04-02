/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * v0.9.12 Phase 4 RED 테스트: adapter v2 tool-calling 지원
 *
 * 설계서: 01_didim_tool_calling_provider_expansion_plan.md §6
 * 작업계획서: step04_gemini_cli_adapter_todolist.md
 *
 * 검증 대상:
 * - supportsToolCalls capability 전환
 * - v2 /agent/chat 요청: messages[], execution_mode, channel_type, client
 * - tool_call SSE → LlmToolCallRequestEvent emit
 * - /agent/tool-results 재주입 → resume 스트림 (공개 API)
 * - is_error:true 전파 (로컬 도구 실패)
 * - thread_id 유지 + override/생성 정책
 * - 다중 tool_call + partial 202 핸들링
 * - plain text-only 응답 호환 (URL 검증 포함)
 * - bootstrap env/config/JWT user_id 해석
 *
 * 리뷰 반영:
 * - 🚨 execution_mode="external_tool_execution" + channel_type="cli" 필수 검증
 * - ⚠️ is_error:true 전파 테스트
 * - submitToolResults → 공개 인터페이스로 변경
 * - bootstrap config/env 해석 테스트 추가
 * - thread_id 공급 정책 테스트 추가
 * - 다중 tool_call 테스트 추가
 * - plain text URL 검증 추가
 */

import { describe, it, expect, vi } from 'vitest';
import type { LlmGenerateRequest, AdapterConfig } from '../types.js';
import type {
  LlmEvent,
  LlmToolCallRequestEvent,
  LlmFinishedEvent,
} from '../events.js';
import { LlmEventType } from '../events.js';

// ============================================================================
// Test Helpers
// ============================================================================

const TEST_PROMPT_ID = 'test-prompt-v2';

interface CreateAdapterOptions {
  fetch?: typeof globalThis.fetch;
  apiKey?: string;
  serverAddress?: string;
  streamMode?: 'sse' | 'improved';
  scenarioMyPageId?: number;
  userId?: string;
  threadId?: string;
}

/**
 * Lazily import DidimAdapter to allow RED phase to fail with module error.
 * v2 확장 파라미터 (scenarioMyPageId, userId, threadId)는 GREEN에서 생성자 확장.
 */
async function createAdapter(
  options: CreateAdapterOptions = {},
): Promise<InstanceType<typeof import('./adapter.js').DidimAdapter>> {
  const { DidimAdapter } = await import('./adapter.js');
  const config: AdapterConfig = {
    apiKey: options.apiKey ?? 'test-jwt-token',
    baseUrl: '',
  };
  return new DidimAdapter(
    config,
    options.fetch ?? vi.fn(),
    options.apiKey ?? 'test-jwt-token',
    options.serverAddress ?? 'aistudio.didim365.com',
    options.streamMode ?? 'improved',
    // v2 확장 파라미터
    options.scenarioMyPageId ?? 1,
    options.userId ?? 'test-user',
    options.threadId,
  );
}

function createBasicRequest(): LlmGenerateRequest {
  return {
    model: 'didim-default',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  };
}

function createToolCallingRequest(): LlmGenerateRequest {
  return {
    model: 'didim-default',
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: '현재 디렉토리 파일 목록을 보여줘' }],
      },
    ],
    tools: [
      {
        name: 'list_files',
        description: '디렉토리 파일 목록 조회',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: '경로' },
          },
          required: ['path'],
        },
      },
    ],
  };
}

/**
 * v2 tool_call SSE: text_delta → tool_call → finished(tool_call_pending)
 */
function createV2ToolCallSseLines(): string[] {
  return [
    'event: text_delta\n' +
      `data: ${JSON.stringify({ text: '파일 목록을 확인하겠습니다.' })}\n\n`,
    'event: tool_call\n' +
      `data: ${JSON.stringify({
        call_id: 'call_abc123',
        name: 'list_files',
        arguments: { path: '.' },
        thread_id: 'thread-v2-1',
        checkpoint_id: 'cp-1',
        sequence: 0,
      })}\n\n`,
    'event: finished\n' +
      `data: ${JSON.stringify({
        finish_reason: 'tool_call_pending',
        thread_id: 'thread-v2-1',
      })}\n\n`,
  ];
}

/**
 * v2 다중 tool_call SSE: tool_call x2 → finished(tool_call_pending)
 */
function createV2MultiToolCallSseLines(): string[] {
  return [
    'event: tool_call\n' +
      `data: ${JSON.stringify({
        call_id: 'call_1',
        name: 'read_file',
        arguments: { path: 'a.txt' },
        thread_id: 'thread-v2-1',
        checkpoint_id: 'cp-1',
        sequence: 0,
      })}\n\n`,
    'event: tool_call\n' +
      `data: ${JSON.stringify({
        call_id: 'call_2',
        name: 'write_file',
        arguments: { path: 'b.txt', content: 'hello' },
        thread_id: 'thread-v2-1',
        checkpoint_id: 'cp-1',
        sequence: 1,
      })}\n\n`,
    'event: finished\n' +
      `data: ${JSON.stringify({
        finish_reason: 'tool_call_pending',
        thread_id: 'thread-v2-1',
      })}\n\n`,
  ];
}

/**
 * v2 resume SSE: text_delta → finished(stop)
 */
function createV2ResumeSseLines(): string[] {
  return [
    'event: text_delta\n' +
      `data: ${JSON.stringify({ text: '현재 디렉토리에는 a.txt, b.txt가 있습니다.' })}\n\n`,
    'event: finished\n' +
      `data: ${JSON.stringify({
        finish_reason: 'stop',
        thread_id: 'thread-v2-1',
      })}\n\n`,
  ];
}

function mockSseFetch(lines: string[]): typeof globalThis.fetch {
  const encoder = new TextEncoder();
  const combined = lines.join('');
  const bytes = encoder.encode(combined);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });

  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: stream,
    headers: new Headers(),
  });
}

async function collectEvents(
  stream: AsyncGenerator<LlmEvent, void, unknown>,
): Promise<LlmEvent[]> {
  const events: LlmEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

/**
 * Sequential fetch mock: 첫 번째 호출 → firstLines, 두 번째 → secondLines
 */
function createSequentialFetch(
  firstLines: string[],
  secondLines: string[],
): typeof globalThis.fetch {
  const first = mockSseFetch(firstLines);
  const second = mockSseFetch(secondLines);
  let callCount = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return vi.fn().mockImplementation((...args: any[]) => {
    callCount++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (callCount === 1) return (first as any)(...args);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (second as any)(...args);
  });
}

// =============================================================================
// 1. Capability 전환
// =============================================================================

describe('DidimAdapter v2 capabilities', () => {
  it('reports supportsToolCalls as true', async () => {
    const adapter = await createAdapter();
    expect(adapter.capabilities.supportsToolCalls).toBe(true);
  });

  it('still reports supportsStreaming as true', async () => {
    const adapter = await createAdapter();
    expect(adapter.capabilities.supportsStreaming).toBe(true);
  });
});

// =============================================================================
// 2. v2 /agent/chat 요청 형식 (🚨 execution_mode + channel_type 검증)
// =============================================================================

describe('DidimAdapter v2 request format', () => {
  it('sends POST to /api/v2/agent/chat with messages[] body', async () => {
    const mockFetch = mockSseFetch(createV2ToolCallSseLines());
    const adapter = await createAdapter({ fetch: mockFetch });

    const stream = adapter.generateContentStream(
      createToolCallingRequest(),
      TEST_PROMPT_ID,
    );
    await collectEvents(stream);

    expect(mockFetch).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [url, fetchOptions] = (mockFetch as any).mock.calls[0];

    expect(url).toContain('/api/v2/agent/chat');

    const body = JSON.parse(fetchOptions.body);
    expect(body.messages).toBeDefined();
    expect(Array.isArray(body.messages)).toBe(true);
    expect(body.messages[0].role).toBe('user');
    expect(body.messages[0].content).toBeDefined();
  });

  it('includes all v2 required fields: scenario, user, qa, execution_mode, channel_type', async () => {
    const mockFetch = mockSseFetch(createV2ToolCallSseLines());
    const adapter = await createAdapter({
      fetch: mockFetch,
      scenarioMyPageId: 42,
      userId: 'user-123',
    });

    const stream = adapter.generateContentStream(
      createToolCallingRequest(),
      TEST_PROMPT_ID,
    );
    await collectEvents(stream);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = JSON.parse((mockFetch as any).mock.calls[0][1].body);
    expect(body.scenario_my_page_id).toBe(42);
    expect(body.user_id).toBe('user-123');
    expect(body.qa_id).toBeDefined();
    expect(typeof body.qa_id).toBe('string');

    // 🚨 리뷰 반영: execution_mode + channel_type 필수
    expect(body.execution_mode).toBe('external_tool_execution');
    expect(body.channel_type).toBe('cli');
  });

  it('includes client info in v2 request', async () => {
    const mockFetch = mockSseFetch(createV2ToolCallSseLines());
    const adapter = await createAdapter({ fetch: mockFetch });

    const stream = adapter.generateContentStream(
      createToolCallingRequest(),
      TEST_PROMPT_ID,
    );
    await collectEvents(stream);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = JSON.parse((mockFetch as any).mock.calls[0][1].body);
    expect(body.client).toBeDefined();
    expect(body.client.name).toBe('agent-cli');
    expect(typeof body.client.version).toBe('string');
  });
});

// =============================================================================
// 3. tool_call SSE → LlmToolCallRequestEvent
// =============================================================================

describe('DidimAdapter v2 tool_call event emission', () => {
  it('emits LlmToolCallRequestEvent from v2 tool_call SSE', async () => {
    const mockFetch = mockSseFetch(createV2ToolCallSseLines());
    const adapter = await createAdapter({ fetch: mockFetch });

    const events = await collectEvents(
      adapter.generateContentStream(createToolCallingRequest(), TEST_PROMPT_ID),
    );

    const toolCallEvents = events.filter(
      (e) => e.type === LlmEventType.ToolCallRequest,
    );

    expect(toolCallEvents.length).toBe(1);
    expect(toolCallEvents[0].callId).toBe('call_abc123');
    expect(toolCallEvents[0].name).toBe('list_files');
    expect(toolCallEvents[0].args).toEqual({ path: '.' });
  });

  it('emits Finished with finishReason "tool_use" after tool_call', async () => {
    const mockFetch = mockSseFetch(createV2ToolCallSseLines());
    const adapter = await createAdapter({ fetch: mockFetch });

    const events = await collectEvents(
      adapter.generateContentStream(createToolCallingRequest(), TEST_PROMPT_ID),
    );

    const finishedEvents = events.filter(
      (e) => e.type === LlmEventType.Finished,
    );

    expect(finishedEvents.length).toBeGreaterThanOrEqual(1);
    expect(finishedEvents[0].finishReason).toBe('tool_use');
  });

  it('emits TextDelta before ToolCallRequest in mixed stream', async () => {
    const mockFetch = mockSseFetch(createV2ToolCallSseLines());
    const adapter = await createAdapter({ fetch: mockFetch });

    const events = await collectEvents(
      adapter.generateContentStream(createToolCallingRequest(), TEST_PROMPT_ID),
    );

    const textIdx = events.findIndex((e) => e.type === LlmEventType.TextDelta);
    const toolIdx = events.findIndex(
      (e) => e.type === LlmEventType.ToolCallRequest,
    );

    expect(textIdx).toBeGreaterThanOrEqual(0);
    expect(toolIdx).toBeGreaterThan(textIdx);
  });

  it('emits multiple ToolCallRequestEvents for multi-tool response', async () => {
    const mockFetch = mockSseFetch(createV2MultiToolCallSseLines());
    const adapter = await createAdapter({ fetch: mockFetch });

    const events = await collectEvents(
      adapter.generateContentStream(createToolCallingRequest(), TEST_PROMPT_ID),
    );

    const toolCallEvents = events.filter(
      (e) => e.type === LlmEventType.ToolCallRequest,
    );

    expect(toolCallEvents.length).toBe(2);
    expect(toolCallEvents[0].callId).toBe('call_1');
    expect(toolCallEvents[0].name).toBe('read_file');
    expect(toolCallEvents[1].callId).toBe('call_2');
    expect(toolCallEvents[1].name).toBe('write_file');
  });
});

// =============================================================================
// 4. /tool-results 재주입 → resume 스트림 (공개 API)
// =============================================================================

describe('DidimAdapter v2 tool-results submission and resume', () => {
  it('submits tool results via public submitToolResults and resumes stream', async () => {
    const seqFetch = createSequentialFetch(
      createV2ToolCallSseLines(),
      createV2ResumeSseLines(),
    );
    const adapter = await createAdapter({ fetch: seqFetch });

    // 1단계: 스트림 시작 → tool_call 수신
    const firstEvents = await collectEvents(
      adapter.generateContentStream(createToolCallingRequest(), TEST_PROMPT_ID),
    );

    const toolCall = firstEvents.find(
      (e) => e.type === LlmEventType.ToolCallRequest,
    ) as LlmToolCallRequestEvent;
    expect(toolCall).toBeDefined();

    // 2단계: tool 결과 제출 → resume 스트림
    // 리뷰 반영: 공개 API로 호출 (타입 안전)
    const resumeEvents = await collectEvents(
      adapter.submitToolResults(
        [
          {
            callId: toolCall.callId,
            name: toolCall.name,
            result: 'a.txt\nb.txt',
          },
        ],
        TEST_PROMPT_ID,
      ),
    );

    const textEvents = resumeEvents.filter(
      (e) => e.type === LlmEventType.TextDelta,
    );
    expect(textEvents.length).toBeGreaterThanOrEqual(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(textEvents.some((e) => (e as any).text.includes('a.txt'))).toBe(
      true,
    );

    const finished = resumeEvents.find(
      (e) => e.type === LlmEventType.Finished,
    ) as LlmFinishedEvent;
    expect(finished).toBeDefined();
    expect(finished.finishReason).toBe('end_turn');
  });

  it('sends correct thread_id and checkpoint_id in tool-results body', async () => {
    const seqFetch = createSequentialFetch(
      createV2ToolCallSseLines(),
      createV2ResumeSseLines(),
    );
    const adapter = await createAdapter({ fetch: seqFetch });

    await collectEvents(
      adapter.generateContentStream(createToolCallingRequest(), TEST_PROMPT_ID),
    );

    await collectEvents(
      adapter.submitToolResults(
        [{ callId: 'call_abc123', name: 'list_files', result: 'ok' }],
        TEST_PROMPT_ID,
      ),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secondCallArgs = (seqFetch as any).mock.calls[1];
    const [resumeUrl, resumeOptions] = secondCallArgs;

    expect(resumeUrl).toContain('/api/v2/agent/tool-results');

    const resumeBody = JSON.parse(resumeOptions.body);
    expect(resumeBody.thread_id).toBe('thread-v2-1');
    expect(resumeBody.checkpoint_id).toBe('cp-1');
    expect(resumeBody.tool_results).toBeDefined();
    expect(resumeBody.tool_results[0].call_id).toBe('call_abc123');
  });

  it('sends is_error=true when local tool execution fails', async () => {
    const seqFetch = createSequentialFetch(
      createV2ToolCallSseLines(),
      createV2ResumeSseLines(),
    );
    const adapter = await createAdapter({ fetch: seqFetch });

    await collectEvents(
      adapter.generateContentStream(createToolCallingRequest(), TEST_PROMPT_ID),
    );

    // ⚠️ 리뷰 반영: 에러 결과 전달
    await collectEvents(
      adapter.submitToolResults(
        [
          {
            callId: 'call_abc123',
            name: 'list_files',
            result: 'Error: ENOENT: no such file or directory',
            isError: true,
          },
        ],
        TEST_PROMPT_ID,
      ),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resumeBody = JSON.parse((seqFetch as any).mock.calls[1][1].body);
    expect(resumeBody.tool_results[0].is_error).toBe(true);
    expect(resumeBody.tool_results[0].result).toContain('ENOENT');
  });
});

// =============================================================================
// 4-b. submitToolResults 전제 상태 방어
// =============================================================================

describe('DidimAdapter v2 submitToolResults precondition guard', () => {
  it('yields error when called without prior tool_call (no checkpoint_id)', async () => {
    const adapter = await createAdapter({ fetch: vi.fn() });

    // generateContentStream을 호출하지 않고 바로 submitToolResults 호출
    const events = await collectEvents(
      adapter.submitToolResults(
        [{ callId: 'call_1', name: 'test', result: 'ok' }],
        TEST_PROMPT_ID,
      ),
    );

    const errorEvents = events.filter((e) => e.type === LlmEventType.Error);
    expect(errorEvents.length).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(String((errorEvents[0] as any).error)).toContain(
      'submitToolResults requires prior tool_call event',
    );
  });
});

// =============================================================================
// 5. thread_id 공급 정책
// =============================================================================

describe('DidimAdapter v2 thread_id policy', () => {
  it('uses SSE-returned thread_id in subsequent tool-results request', async () => {
    const seqFetch = createSequentialFetch(
      createV2ToolCallSseLines(),
      createV2ResumeSseLines(),
    );
    const adapter = await createAdapter({ fetch: seqFetch });

    await collectEvents(
      adapter.generateContentStream(createToolCallingRequest(), TEST_PROMPT_ID),
    );

    await collectEvents(
      adapter.submitToolResults(
        [{ callId: 'call_abc123', name: 'list_files', result: 'done' }],
        TEST_PROMPT_ID,
      ),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secondBody = JSON.parse((seqFetch as any).mock.calls[1][1].body);
    expect(secondBody.thread_id).toBe('thread-v2-1');
  });

  it('uses config threadId override when provided', async () => {
    const mockFetch = mockSseFetch(createV2ToolCallSseLines());
    const adapter = await createAdapter({
      fetch: mockFetch,
      threadId: 'my-custom-thread',
    });

    await collectEvents(
      adapter.generateContentStream(createToolCallingRequest(), TEST_PROMPT_ID),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = JSON.parse((mockFetch as any).mock.calls[0][1].body);
    expect(body.thread_id).toBe('my-custom-thread');
  });

  it('generates session UUID when no threadId config provided', async () => {
    const mockFetch = mockSseFetch(createV2ToolCallSseLines());
    const adapter = await createAdapter({
      fetch: mockFetch,
      threadId: undefined,
    });

    await collectEvents(
      adapter.generateContentStream(createToolCallingRequest(), TEST_PROMPT_ID),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body = JSON.parse((mockFetch as any).mock.calls[0][1].body);
    // thread_id가 존재하고 빈 문자열이 아님 (UUID 자동 생성)
    expect(body.thread_id).toBeDefined();
    expect(typeof body.thread_id).toBe('string');
    expect(body.thread_id.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 6. plain text-only 응답 (v1 호환 + URL 검증)
// =============================================================================

describe('DidimAdapter v2 plain text compatibility', () => {
  it('supports plain text-only responses without tool_call', async () => {
    const plainSseLines = [
      'event: text_delta\n' +
        `data: ${JSON.stringify({ text: '안녕하세요! 무엇을 도와드릴까요?' })}\n\n`,
      'event: finished\n' +
        `data: ${JSON.stringify({
          finish_reason: 'stop',
          thread_id: 'thread-plain',
        })}\n\n`,
    ];

    const mockFetch = mockSseFetch(plainSseLines);
    const adapter = await createAdapter({ fetch: mockFetch });

    const events = await collectEvents(
      adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
    );

    const textEvents = events.filter((e) => e.type === LlmEventType.TextDelta);
    expect(textEvents.length).toBeGreaterThanOrEqual(1);

    const toolCallEvents = events.filter(
      (e) => e.type === LlmEventType.ToolCallRequest,
    );
    expect(toolCallEvents.length).toBe(0);

    const finished = events.find(
      (e) => e.type === LlmEventType.Finished,
    ) as LlmFinishedEvent;
    expect(finished).toBeDefined();
    expect(finished.finishReason).toBe('end_turn');
  });

  it('uses v2 /agent/chat endpoint even for plain text requests', async () => {
    const plainSseLines = [
      'event: text_delta\n' + `data: ${JSON.stringify({ text: 'ok' })}\n\n`,
      'event: finished\n' +
        `data: ${JSON.stringify({ finish_reason: 'stop', thread_id: 't' })}\n\n`,
    ];

    const mockFetch = mockSseFetch(plainSseLines);
    const adapter = await createAdapter({ fetch: mockFetch });

    await collectEvents(
      adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
    );

    // Low 리뷰 반영: plain text도 v2 endpoint 사용 확인
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [url] = (mockFetch as any).mock.calls[0];
    expect(url).toContain('/api/v2/agent/chat');
  });
});

// =============================================================================
// 7. partial 202 → 추가 /tool-results → 최종 resume 루프
// =============================================================================

describe('DidimAdapter v2 partial 202 handling', () => {
  it('handles partial 202 response and retries until resume SSE', async () => {
    // 다중 tool_call 후 부분 제출 시나리오:
    // 1차 fetch: /agent/chat → 2개 tool_call + finished(tool_call_pending)
    // 2차 fetch: /tool-results (1/2 제출) → 202 JSON partial
    // 3차 fetch: /tool-results (2/2 제출) → 200 SSE resume

    const chatFetch = mockSseFetch(createV2MultiToolCallSseLines());

    const partial202Response = {
      ok: true,
      status: 202,
      json: () =>
        Promise.resolve({
          status: 'partial_received',
          pending_call_ids: ['call_2'],
        }),
      headers: new Headers({ 'content-type': 'application/json' }),
    } as unknown as Response;

    const resumeFetch = mockSseFetch(createV2ResumeSseLines());

    let callCount = 0;
    const seqFetch: typeof globalThis.fetch = vi
      .fn()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((...args: any[]) => {
        callCount++;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (callCount === 1) return (chatFetch as any)(...args);
        if (callCount === 2) return Promise.resolve(partial202Response);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (resumeFetch as any)(...args);
      });

    const adapter = await createAdapter({ fetch: seqFetch });

    // 1단계: tool_call 2개 수신
    const firstEvents = await collectEvents(
      adapter.generateContentStream(createToolCallingRequest(), TEST_PROMPT_ID),
    );
    const toolCalls = firstEvents.filter(
      (e) => e.type === LlmEventType.ToolCallRequest,
    );
    expect(toolCalls.length).toBe(2);

    // 2단계: 첫 번째 결과만 제출 → 202 partial
    const partialResult = adapter.submitToolResults(
      [{ callId: 'call_1', name: 'read_file', result: 'file content' }],
      TEST_PROMPT_ID,
    );

    // partial 응답: action="partial" 또는 pending_call_ids 포함
    // (adapter가 202를 어떻게 표현하는지는 GREEN에서 결정)
    // 최소한 에러 없이 처리되어야 함
    await collectEvents(partialResult);
    // partial은 빈 스트림 (202 → yield nothing)

    // 3단계: 나머지 결과 제출 → resume SSE
    const resumeEvents = await collectEvents(
      adapter.submitToolResults(
        [{ callId: 'call_2', name: 'write_file', result: 'ok' }],
        TEST_PROMPT_ID,
      ),
    );

    const textEvents = resumeEvents.filter(
      (e) => e.type === LlmEventType.TextDelta,
    );
    expect(textEvents.length).toBeGreaterThanOrEqual(1);

    const finished = resumeEvents.find(
      (e) => e.type === LlmEventType.Finished,
    ) as LlmFinishedEvent;
    expect(finished).toBeDefined();
    expect(finished.finishReason).toBe('end_turn');
  });
});

// =============================================================================
// 8. 다중 도구 결과 일괄 제출 (💡1 리뷰 반영)
// =============================================================================

describe('DidimAdapter v2 multi-result submission', () => {
  it('posts multiple tool results in a single request', async () => {
    const seqFetch = createSequentialFetch(
      createV2MultiToolCallSseLines(),
      createV2ResumeSseLines(),
    );
    const adapter = await createAdapter({ fetch: seqFetch });

    await collectEvents(
      adapter.generateContentStream(createToolCallingRequest(), TEST_PROMPT_ID),
    );

    await collectEvents(
      adapter.submitToolResults(
        [
          { callId: 'call_1', name: 'read_file', result: 'file1 content' },
          {
            callId: 'call_2',
            name: 'write_file',
            result: 'ok',
            isError: false,
          },
        ],
        TEST_PROMPT_ID,
      ),
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const resumeBody = JSON.parse((seqFetch as any).mock.calls[1][1].body);
    expect(resumeBody.tool_results).toHaveLength(2);
    expect(resumeBody.tool_results[0].call_id).toBe('call_1');
    expect(resumeBody.tool_results[0].name).toBe('read_file');
    expect(resumeBody.tool_results[1].call_id).toBe('call_2');
    expect(resumeBody.tool_results[1].name).toBe('write_file');
  });
});

// =============================================================================
// 9. bootstrap config/env 해석
// =============================================================================

describe('bootstrapDidimProvider v2 config resolution', () => {
  /**
   * bootstrap 테스트는 ProviderRegistry 싱글턴 + createAdapter() API를 사용한다.
   * 각 테스트에서 clear()로 격리하고, 사용 후 env를 정리한다.
   */

  it('reads scenarioMyPageId from DIDIM_SCENARIO_ID env var', async () => {
    const { bootstrapDidimProvider } = await import('./bootstrap.js');
    const { ProviderRegistry } = await import('../registry.js');

    const registry = ProviderRegistry.getInstance();
    registry.unregister('didim');

    process.env['DIDIM_API_KEY'] = 'test-key';
    process.env['DIDIM_SERVER_ADDRESS'] = 'test.server.com';
    process.env['DIDIM_SCENARIO_ID'] = '99';

    try {
      bootstrapDidimProvider(registry);

      const adapter = registry.createAdapter('didim', {
        apiKey: 'test-key',
        baseUrl: '',
      });

      // GREEN에서 adapter.scenarioMyPageId getter 또는 내부 필드로 노출
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((adapter as any).scenarioMyPageId).toBe(99);
    } finally {
      registry.unregister('didim');
      delete process.env['DIDIM_SCENARIO_ID'];
      delete process.env['DIDIM_API_KEY'];
      delete process.env['DIDIM_SERVER_ADDRESS'];
    }
  });

  it('extracts user_id from JWT apiKey payload', async () => {
    const { bootstrapDidimProvider } = await import('./bootstrap.js');
    const { ProviderRegistry } = await import('../registry.js');

    const registry = ProviderRegistry.getInstance();
    registry.unregister('didim');

    // JWT: header.payload.signature (payload에 user_id)
    const payload = Buffer.from(
      JSON.stringify({ user_id: 'jwt-user-42' }),
    ).toString('base64url');
    const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.fake-signature`;

    process.env['DIDIM_API_KEY'] = fakeJwt;
    process.env['DIDIM_SERVER_ADDRESS'] = 'test.server.com';

    try {
      bootstrapDidimProvider(registry);

      const adapter = registry.createAdapter('didim', {
        apiKey: fakeJwt,
        baseUrl: '',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((adapter as any).userId).toBe('jwt-user-42');
    } finally {
      registry.unregister('didim');
      delete process.env['DIDIM_API_KEY'];
      delete process.env['DIDIM_SERVER_ADDRESS'];
    }
  });

  it('falls back to DIDIM_USER_ID env when JWT decode fails', async () => {
    const { bootstrapDidimProvider } = await import('./bootstrap.js');
    const { ProviderRegistry } = await import('../registry.js');

    const registry = ProviderRegistry.getInstance();
    registry.unregister('didim');

    process.env['DIDIM_API_KEY'] = 'not-a-valid-jwt';
    process.env['DIDIM_SERVER_ADDRESS'] = 'test.server.com';
    process.env['DIDIM_USER_ID'] = 'fallback-user';

    try {
      bootstrapDidimProvider(registry);

      const adapter = registry.createAdapter('didim', {
        apiKey: 'not-a-valid-jwt',
        baseUrl: '',
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((adapter as any).userId).toBe('fallback-user');
    } finally {
      registry.unregister('didim');
      delete process.env['DIDIM_API_KEY'];
      delete process.env['DIDIM_SERVER_ADDRESS'];
      delete process.env['DIDIM_USER_ID'];
    }
  });

  it('reads threadId from config override', async () => {
    const { bootstrapDidimProvider } = await import('./bootstrap.js');
    const { ProviderRegistry } = await import('../registry.js');

    const registry = ProviderRegistry.getInstance();
    registry.unregister('didim');

    process.env['DIDIM_API_KEY'] = 'test-key';
    process.env['DIDIM_SERVER_ADDRESS'] = 'test.server.com';

    try {
      bootstrapDidimProvider(registry);

      const adapter = registry.createAdapter('didim', {
        apiKey: 'test-key',
        baseUrl: '',
        threadId: 'config-thread-override',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((adapter as any).threadId).toBe('config-thread-override');
    } finally {
      registry.unregister('didim');
      delete process.env['DIDIM_API_KEY'];
      delete process.env['DIDIM_SERVER_ADDRESS'];
    }
  });
});
