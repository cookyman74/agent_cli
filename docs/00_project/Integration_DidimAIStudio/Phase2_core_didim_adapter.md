# Phase 2: Core — DidimAdapter + Bootstrap + ContentGenerator 등록

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../multi_provider_model_select/template/99_TDD_plan.md)
>   — TDD 방법론
> - [Phase1 결과서](./working_history/) — 이전 Phase 결과 검토
> - [DidimAIStudio 연동 가이드](../../../../docs/temp_howto_develop_integration_didimaistudio.md)
>   — §5, §6

---

## 작업 개요

| 항목        | 내용                                                                                    |
| ----------- | --------------------------------------------------------------------------------------- |
| 프로젝트    | DidimAIStudio 연동 — Adapter + Bootstrap                                                |
| 영향 범위   | `packages/core/src/providers/didim/` (adapter, bootstrap, index), `contentGenerator.ts` |
| 위험 수준   | 🟡 Medium — BaseAdapter 구현, contentGenerator 수정                                     |
| 성능 민감도 | 🟡 Medium — 네트워크 I/O, SSE 스트리밍                                                  |
| 참고 설계   | ClaudeAdapter, OpenAiAdapter 패턴                                                       |
| 작업 브랜치 | `DID/v0.3`                                                                              |

---

## 핵심 리스크 요약

| 리스크                                            | 영향      | 대응 방안                                           | 상태 |
| ------------------------------------------------- | --------- | --------------------------------------------------- | ---- |
| BaseAdapter 구현 시 필수 메서드 누락              | 🟠 Medium | abstract 메서드 전수 확인                           | ⬜   |
| contentGenerator.ts 수정으로 기존 프로바이더 회귀 | 🟠 Medium | bootstrap 추가만 수행 + 회귀 테스트                 | ⬜   |
| SSE POST 방식 ReadableStream 파싱 복잡도          | 🟡 Medium | 기존 OpenAI SSE 파서 패턴 참고                      | ⬜   |
| thread_id 상태 관리 누수                          | 🟡 Medium | adapter 내부 상태로 관리 + 초기화 명시              | ⬜   |
| fetch API 환경별 차이 (Node.js vs browser)        | 🟢 Low    | Node.js 20+ 네이티브 fetch 사용                     | ⬜   |
| AdapterConfig에 Didim 설정 전달 경로 부재         | 🟠 Medium | AdapterConfig index signature + DidimProviderConfig | ⬜   |
| countTokens UnsupportedFeatureError 전파          | 🟡 Medium | 호출부 전수 조사 + 에러 핸들링 보강                 | ⬜   |

---

## 2.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 1 작업 결과서 검토
  - 파일: `./working_history/Phase1_core_didim_converter_{작업일자}.md`
  - 확인: 체크리스트 완료, 미해결 이슈, converter 함수 목록

- [ ] **[CONTEXT]** Phase 2 작업 목적 확인
  - DidimAdapter: BaseAdapter를 상속하여 generateContent + generateContentStream
    구현
  - Bootstrap: ProviderRegistry에 factory 등록
  - ContentGenerator: bootstrapDidimProvider 호출 추가

- [ ] **[ANALYSIS-1]** BaseAdapter 추상 메서드 분석
  - 파일: `packages/core/src/providers/baseAdapter.ts`
  - 확인: `providerName`, `capabilities`, `generateContent()`,
    `generateContentStream()`, `countTokens()`
  - **⚠️ 메서드 시그니처 주의**:
    `generateContent(request, userPromptId, options?)`,
    `generateContentStream(request, userPromptId, options?)` —
    `userPromptId: string`이 2번째 필수 파라미터

- [ ] **[ANALYSIS-2]** ClaudeAdapter 패턴 분석
  - 파일: `packages/core/src/providers/claude/adapter.ts`
  - 확인: HTTP 클라이언트 DI 패턴, 에러 분류, 스트리밍 AsyncGenerator

- [ ] **[ANALYSIS-3]** ContentGenerator bootstrap 패턴 분석
  - 파일: `packages/core/src/core/contentGenerator.ts`
  - 확인: bootstrapClaudeProvider, bootstrapOpenAiProvider 호출 위치

- [ ] **[ANALYSIS-4]** Phase 1 회귀 테스트 실행
  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/converter.test.ts
  ```

---

## 2.2 RED Phase (Part A): 비스트리밍 generateContent 테스트

> **목적**: 일반 채팅 요청/응답의 실패 테스트 작성

- [ ] **[RED-1]** DidimAdapter 생성 테스트

  > **1팀 보완 제안 대응**: Didim이 지원하지 않는 모든 기능 플래그를 명시적으로
  > 검증한다. `LlmProviderCapabilities`는 10개 필드 (types.ts:308-319).

  ```typescript
  // packages/core/src/providers/didim/adapter.test.ts

  describe('DidimAdapter', () => {
    it('should have providerName "didim"', () => {
      const adapter = createAdapter();
      expect(adapter.providerName).toBe('didim');
    });

    it('should have correct capabilities (all unsupported features disabled)', () => {
      const adapter = createAdapter();
      const caps = adapter.capabilities;

      // Didim 지원 기능
      expect(caps.supportsStreaming).toBe(true);

      // Didim 미지원 기능 — 전수 검증
      expect(caps.supportsToolCalls).toBe(false);
      expect(caps.supportsImageInput).toBe(false);
      expect(caps.supportsImageGeneration).toBe(false);
      expect(caps.supportsEmbedding).toBe(false);
      expect(caps.supportsTokenCount).toBe(false);
      expect(caps.supportsSystemMessage).toBe(false);
      expect(caps.supportsThought).toBe(false);

      // 수치 필드 (알 수 없음 → 0)
      expect(caps.maxContextLength).toBe(0);
      expect(caps.maxOutputTokens).toBe(0);
    });
  });
  ```

- [ ] **[RED-2]** generateContent 정상 응답 테스트

  ```typescript
  // 헬퍼: userPromptId는 BaseAdapter의 필수 2번째 파라미터
  const TEST_PROMPT_ID = 'test-prompt-001';

  describe('generateContent', () => {
    it('should send POST request to invoke endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse({
          response: 'Hello!',
          thread_id: 'th_1',
        }),
      );
      const adapter = createAdapter({ fetch: mockFetch });

      await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/scenario-gateway/v1/invoke'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should return LlmGenerateResponse with text content', async () => {
      const adapter = createAdapter({
        fetch: mockFetchWith({ response: 'Hello!', thread_id: 'th_1' }),
      });

      const result = await adapter.generateContent(
        createBasicRequest(),
        TEST_PROMPT_ID,
      );

      expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
      expect(result.stopReason).toBe('end_turn');
    });

    it('should include Authorization Bearer header', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ response: 'Hi' }));
      const adapter = createAdapter({ fetch: mockFetch, apiKey: 'jwt_123' });

      await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer jwt_123');
    });

    it('should store and reuse thread_id across calls', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(
          createMockResponse({ response: 'R1', thread_id: 'th_1' }),
        )
        .mockResolvedValueOnce(
          createMockResponse({ response: 'R2', thread_id: 'th_1' }),
        );
      const adapter = createAdapter({ fetch: mockFetch });

      await adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID);
      await adapter.generateContent(createBasicRequest(), 'prompt-002');

      const [, secondOptions] = mockFetch.mock.calls[1];
      expect(secondOptions.headers['x-thread-id']).toBe('th_1');
    });
  });
  ```

  > **⚠️ 메서드 시그니처**: `generateContent(request, userPromptId, options?)`,
  > `generateContentStream(request, userPromptId, options?)` —
  > `userPromptId: string`은 `baseAdapter.ts:89`에서 정의된 필수 파라미터. 모든
  > 테스트에서 반드시 전달해야 함.

- [ ] **[RED-3]** generateContent 에러 처리 테스트

  ```typescript
  describe('generateContent error handling', () => {
    it('should throw on 401 with JWT expiry message', async () => {
      const adapter = createAdapter({
        fetch: vi.fn().mockResolvedValue({ ok: false, status: 401 }),
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow(/JWT.*expired|invalid/i);
    });

    it('should throw on non-ok response', async () => {
      const adapter = createAdapter({
        fetch: vi.fn().mockResolvedValue({ ok: false, status: 500 }),
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow(/500/);
    });

    it('should throw on network error', async () => {
      const adapter = createAdapter({
        fetch: vi.fn().mockRejectedValue(new Error('Network failure')),
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow('Network failure');
    });
  });
  ```

- [ ] **[RED-3B]** generateContent I/O 실패 경로 테스트 (2팀 Issue #6 대응)

  > **⚠️ 네트워크 계층 실패**: fetch 자체는 성공하지만 response 처리에서
  > 실패하는 경로들. 실제 운영 환경에서 발생 가능한 I/O 실패 패턴.

  ```typescript
  describe('generateContent I/O failure paths', () => {
    it('should handle response with null body', async () => {
      const adapter = createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: null,
          json: vi.fn().mockRejectedValue(new Error('No body')),
        }),
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow();
    });

    it('should handle JSON parse failure in response', async () => {
      const adapter = createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token')),
        }),
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow();
    });

    it('should handle fetch timeout/abort', async () => {
      const adapter = createAdapter({
        fetch: vi
          .fn()
          .mockRejectedValue(new DOMException('Aborted', 'AbortError')),
      });

      await expect(
        adapter.generateContent(createBasicRequest(), TEST_PROMPT_ID),
      ).rejects.toThrow(/abort/i);
    });
  });
  ```

- [ ] **[RED-VERIFY-A]** Part A 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/adapter.test.ts
  # 반드시 FAIL이어야 함
  ```

---

## 2.3 GREEN Phase (Part A): 비스트리밍 구현

- [ ] **[TASK-001]** DidimHttpClient 인터페이스 정의

  ```typescript
  export interface DidimHttpClient {
    fetch(url: string, init: RequestInit): Promise<Response>;
  }
  ```

- [ ] **[TASK-002]** DidimAdapter 클래스 스켈레톤
  - BaseAdapter 상속
  - `providerName: 'didim'`
  - `capabilities: { supportsToolCalls: false, supportsImageInput: false, supportsStreaming: true, ... }`
    - **전체 필드** (`LlmProviderCapabilities`): `supportsStreaming`,
      `supportsToolCalls`, `supportsImageInput`, `supportsImageGeneration`,
      `supportsEmbedding`, `supportsTokenCount`, `supportsSystemMessage`,
      `supportsThought`, `maxContextLength`, `maxOutputTokens`
  - constructor: `(config, httpClient, apiKey, serverAddress, streamMode)`

- [ ] **[TASK-003]** `generateContent()` 구현
  - Phase 1의 converter 함수 활용
  - fetch → parseDidimResponse → convertDidimResponseToLlm
  - thread_id 자동 저장/전송

- [ ] **[TASK-004]** 에러 분류 구현
  - 401 → AuthenticationError
  - 408/timeout → TimeoutError
  - 기타 → ProviderError

- [ ] **[GREEN-VERIFY-A]** Part A 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/adapter.test.ts
  # Part A 테스트 PASS여야 함
  ```

---

## 2.4 RED Phase (Part B): SSE 스트리밍 테스트

- [ ] **[RED-4]** generateContentStream 기본 테스트

  > **⚠️ 2팀 Issue #5 대응**: 이벤트 존재 여부만이 아닌 payload 내용과 순서를
  > 정확히 검증.
  >
  > - TextDelta.text: 실제 텍스트 값 확인
  > - Finished.finishReason: 'end_turn' 기대
  > - Finished → MessageEnd 순서 보장
  > - Error.error: 필수 필드 비어있지 않은지 확인

  ```typescript
  describe('generateContentStream', () => {
    it('should yield TextDelta events with correct text from SSE stream', async () => {
      const adapter = createAdapter({
        fetch: mockSseFetch([
          'event: message\ndata: {"chunk": "Hello"}\n\n',
          'event: message\ndata: {"chunk": " world"}\n\n',
          'event: done\ndata: {"thread_id": "th_1"}\n\n',
        ]),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas).toHaveLength(2);
      // payload 정확성 검증
      expect((textDeltas[0] as LlmTextDeltaEvent).text).toBe('Hello');
      expect((textDeltas[1] as LlmTextDeltaEvent).text).toBe(' world');
    });

    it('should yield Finished then MessageEnd in correct order on done event', async () => {
      const adapter = createAdapter({
        fetch: mockSseFetch([
          'event: message\ndata: {"chunk": "Hi"}\n\n',
          'event: done\ndata: {"thread_id": "th_1"}\n\n',
        ]),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      // 순서 검증: Finished가 MessageEnd보다 먼저
      const finishedIdx = events.findIndex(
        (e) => e.type === LlmEventType.Finished,
      );
      const messageEndIdx = events.findIndex(
        (e) => e.type === LlmEventType.MessageEnd,
      );
      expect(finishedIdx).toBeGreaterThan(-1);
      expect(messageEndIdx).toBeGreaterThan(-1);
      expect(finishedIdx).toBeLessThan(messageEndIdx);

      // Finished payload 검증
      const finished = events[finishedIdx] as LlmFinishedEvent;
      expect(finished.finishReason).toBe('end_turn');
    });
  });
  ```

- [ ] **[RED-5]** improved 모드 스트리밍 테스트

  ```typescript
  describe('generateContentStream (improved mode)', () => {
    it('should handle message_partial events', async () => {
      const adapter = createAdapter({
        fetch: mockSseFetch([
          'event: message_partial\ndata: {"content": "Hel"}\n\n',
          'event: message_partial\ndata: {"content": "lo"}\n\n',
          'event: complete\ndata: {"thread_id": "th_2"}\n\n',
        ]),
        streamMode: 'improved',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas).toHaveLength(2);
    });
  });
  ```

- [ ] **[RED-6]** 스트리밍 에러 테스트

  > **⚠️ 2팀 Issue #5 대응**: Error 이벤트의 error payload가 비어있지 않은지,
  > 에러 메시지가 정확한지까지 검증한다.

  ```typescript
  describe('generateContentStream error handling', () => {
    it('should yield Error event with correct message on SSE error', async () => {
      const adapter = createAdapter({
        fetch: mockSseFetch([
          'event: error\ndata: {"message": "Server error"}\n\n',
        ]),
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as LlmErrorEvent;
      expect(errorEvent).toBeDefined();
      // error 필드는 LlmErrorEvent의 필수 필드 (Error | string)
      expect(errorEvent.error).toBeDefined();
      expect(String(errorEvent.error)).toContain('Server error');
    });

    it('should yield Error event on fetch failure', async () => {
      const adapter = createAdapter({
        fetch: vi.fn().mockRejectedValue(new Error('Connection lost')),
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as LlmErrorEvent;
      expect(errorEvent).toBeDefined();
      expect(String(errorEvent.error)).toContain('Connection lost');
    });

    it('should yield Error event on non-OK streaming response', async () => {
      // 2팀 Issue #6 대응: SSE 요청이 200이 아닌 응답을 반환하는 경우
      const adapter = createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 503,
          body: null,
          statusText: 'Service Unavailable',
        }),
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as LlmErrorEvent;
      expect(errorEvent).toBeDefined();
    });

    it('should yield Error event when response.body is null', async () => {
      // 2팀 Issue #6 대응: fetch 성공이지만 body가 null인 경우
      const adapter = createAdapter({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          body: null, // ReadableStream 없음
        }),
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest(), TEST_PROMPT_ID),
      );

      const errorEvent = events.find(
        (e) => e.type === LlmEventType.Error,
      ) as LlmErrorEvent;
      expect(errorEvent).toBeDefined();
    });
  });
  ```

- [ ] **[RED-VERIFY-B]** Part B 테스트 실패 확인

---

## 2.5 GREEN Phase (Part B): SSE 스트리밍 구현

- [ ] **[TASK-005]** SSE ReadableStream 파서 구현
  - `fetch + response.body.getReader()` 패턴
  - TextDecoder로 바이트 → 문자열 변환
  - `event:` / `data:` 라인 파싱
  - 빈 줄로 이벤트 디스패치

- [ ] **[TASK-006]** `generateContentStream()` AsyncGenerator 구현
  - SSE 파서 → `parseDidimSseEvent()` → `convertDidimSseToLlmEvents()` → yield
  - 에러 발생 시 `createErrorEvent()` yield (throw 대신)
  - thread_id 자동 저장

- [ ] **[GREEN-VERIFY-B]** Part B 테스트 통과 확인

---

## 2.6 RED Phase (Part C): Bootstrap + 등록 테스트

- [ ] **[RED-7]** bootstrapDidimProvider 테스트

  ```typescript
  // packages/core/src/providers/didim/bootstrap.test.ts

  describe('bootstrapDidimProvider', () => {
    let registry: ProviderRegistry;

    beforeEach(() => {
      // ProviderRegistry는 private constructor → getInstance() 사용
      registry = ProviderRegistry.getInstance();
      registry.clear(); // 테스트 격리
    });

    it('should register didim factory in ProviderRegistry', () => {
      bootstrapDidimProvider(registry);

      expect(registry.has('didim')).toBe(true);
    });

    it('should create DidimAdapter from factory', () => {
      bootstrapDidimProvider(registry);

      // registry.createAdapter() 사용 (create()가 아님)
      const adapter = registry.createAdapter('didim', createMockConfig());
      expect(adapter.providerName).toBe('didim');
    });
  });
  ```

  > **⚠️ API 주의**: `ProviderRegistry`는 singleton 패턴 —
  > `new ProviderRegistry()` 불가, `getInstance()` 사용. adapter 생성은
  > `createAdapter()` 메서드 사용.

- [ ] **[RED-8]** Didim 설정 전달 배선(wiring) 테스트 (2팀 Issue #1 — High)

  > **⚠️ 핵심**: 가장 치명적인 런타임 리스크는 `serverAddress`와 `streamMode`가
  > bootstrap/contentGenerator 경로를 거쳐 어댑터까지 도달하느냐이다. 이 배선이
  > 테스트에서 빠지면 어댑터가 빈 주소로 요청을 보내는 오류가 프로덕션에서야
  > 발견된다.

  ```typescript
  // packages/core/src/providers/didim/bootstrap.test.ts (continued)

  describe('Didim config wiring (bootstrap → adapter)', () => {
    let registry: ProviderRegistry;

    beforeEach(() => {
      registry = ProviderRegistry.getInstance();
      registry.clear();
      bootstrapDidimProvider(registry);
    });

    it('should pass serverAddress from AdapterConfig to DidimAdapter', () => {
      const adapter = registry.createAdapter('didim', {
        apiKey: 'test-jwt',
        baseUrl: '',
        serverAddress: 'aistudio.didim365.com',
        streamMode: 'sse',
      }) as DidimAdapter;

      // adapter 내부에 serverAddress가 전달되었는지 검증
      // (getServerAddress getter 또는 첫 번째 요청 URL로 간접 검증)
      expect(adapter.providerName).toBe('didim');
      // 실제 구현 시: mock fetch로 요청 URL에 serverAddress 포함 확인
    });

    it('should pass streamMode from AdapterConfig to DidimAdapter', () => {
      const adapter = registry.createAdapter('didim', {
        apiKey: 'test-jwt',
        baseUrl: '',
        serverAddress: 'aistudio.didim365.com',
        streamMode: 'improved',
      }) as DidimAdapter;

      // adapter가 improved 모드로 구성되었는지 검증
      // 실제 구현 시: generateContentStream의 URL에 /sse/improved 포함 확인
      expect(adapter.providerName).toBe('didim');
    });

    it('should fallback to env vars when AdapterConfig fields are missing', () => {
      vi.stubEnv('DIDIM_API_KEY', 'env-jwt');
      vi.stubEnv('DIDIM_SERVER_ADDRESS', 'env.didim365.com');
      vi.stubEnv('DIDIM_STREAM_MODE', 'improved');

      const adapter = registry.createAdapter('didim', {
        apiKey: '', // 빈 값 → env fallback
        baseUrl: '',
      }) as DidimAdapter;

      expect(adapter.providerName).toBe('didim');
      // 실제 구현 시: env에서 읽은 값이 adapter에 전달되었는지 검증
    });
  });
  ```

- [ ] **[RED-VERIFY-C]** Part C 테스트 실패 확인

---

## 2.7 GREEN Phase (Part C): Bootstrap + ContentGenerator 연동

- [ ] **[TASK-007]** `bootstrap.ts` 구현

  ```typescript
  export function bootstrapDidimProvider(registry: ProviderRegistry): void {
    registry.register('didim', (config: AdapterConfig) => {
      // AdapterConfig의 index signature [key: string]: unknown 활용
      // contentGenerator.ts에서 전달하는 Didim 전용 필드를 추출
      const apiKey =
        (config.apiKey as string) ?? process.env['DIDIM_API_KEY'] ?? '';
      const serverAddress = (config['serverAddress'] as string) ?? '';
      const streamMode = (config['streamMode'] as string) ?? 'sse';
      return new DidimAdapter(
        config,
        globalThis.fetch.bind(globalThis),
        apiKey,
        serverAddress,
        streamMode as DidimStreamMode,
      );
    });
  }
  ```

  > **⚠️ Config 전달 경로 (Issue #1 대응)**: `AdapterConfig`는 단순 데이터
  > 컨테이너이며 `{ apiKey, baseUrl, [key]: unknown }` 구조. Didim 전용 필드
  > (`serverAddress`, `streamMode`)는 index signature를 통해 전달.
  > `contentGenerator.ts`에서 adapter 생성 시 이 필드들을 포함하여 전달해야 함.
  >
  > **관련 변경 필요**:
  >
  > - `contentGenerator.ts`의 Didim adapter 생성 시점에서 `DidimProviderConfig`
  >   또는 settings에서 `serverAddress`/`streamMode` 값을 읽어 AdapterConfig에
  >   포함
  > - `DidimProviderConfig` (`providerConfig.ts:80`)에 `streamMode` 필드 추가
  >   검토

- [ ] **[TASK-008]** `index.ts` 작성
  - export: DidimAdapter, bootstrapDidimProvider, converter 함수들

- [ ] **[TASK-009]** `packages/core/src/providers/index.ts` 수정
  - import/export Didim namespace 추가

- [ ] **[TASK-010]** `contentGenerator.ts` 수정
  - `bootstrapDidimProvider(registry)` 호출 추가
  - **⚠️ Didim config 전달 경로 구현 (2팀 2차 Issue #1 — 핵심)**: 현재
    `contentGenerator.ts:311-314`에서 non-Gemini adapter 생성 시
    `{ apiKey: selection.apiKey, baseUrl: selection.baseUrl }` 만 전달한다.
    Didim adapter에는 `serverAddress`와 `streamMode`가 추가로 필요하다.

    **변경 방법 (택 1)**:

    **방법 A**: `selectProvider()` 확장 — `ProviderSelection`에 Didim 전용 필드
    추가

    ```typescript
    // providerSelector.ts
    export interface ProviderSelection {
      type: ProviderType;
      authType?: AuthType;
      apiKey?: string;
      baseUrl?: string;
      // Didim 전용 (env 또는 settings에서 resolve)
      serverAddress?: string;
      streamMode?: string;
    }
    ```

    **방법 B**: `contentGenerator.ts`에서 Didim 분기 시 env/config에서 직접 읽기

    ```typescript
    if (selection.type === ProviderType.Didim) {
      const adapter = factory.create(selection.type, {
        apiKey: selection.apiKey,
        serverAddress: process.env['DIDIM_SERVER_ADDRESS'] ?? '',
        streamMode: process.env['DIDIM_STREAM_MODE'] ?? 'sse',
      });
    }
    ```

    **방법 C**: `ContentGeneratorConfig` 확장

    ```typescript
    export type ContentGeneratorConfig = {
      apiKey?: string;
      vertexai?: boolean;
      authType?: AuthType;
      proxy?: string;
      // Didim 전용
      didimServerAddress?: string;
      didimStreamMode?: string;
    };
    ```

    → CLI `config.ts`에서 `didimConfig` settings를 이 필드에 매핑

    구현 시점에 기존 프로바이더에 영향 없는 방법을 선택한다. **핵심**: 어떤
    방법이든 `settings.security.auth.didimConfig.serverAddress` →
    `DidimAdapter constructor` 까지 값이 전달되는 경로를 반드시 확보해야 한다.

- [ ] **[TASK-010-VERIFY]** Config 전달 경로 테스트 구현 (RED-8 테스트
      통과시키기)

  > **참조**: RED-8에서 작성한 config wiring 테스트를 GREEN에서 통과시킨다.
  > bootstrap factory에서 AdapterConfig의 index signature를 통해
  > `serverAddress`/`streamMode`가 DidimAdapter 생성자까지 전달되는지 실제
  > 구현으로 검증한다.

- [ ] **[GREEN-VERIFY-C]** Part C 테스트 통과 확인

---

## 2.8 REFACTOR Phase: 코드 개선

- [ ] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - 에러 분류 로직 → `classifyDidimError()` 분리
  - HTTP 클라이언트 기본값 처리 최적화
  - SSE 파서 → 재사용 가능한 private 메서드로 추출

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/
  ```

---

## 2.9 사후 작업 (Post-Work)

- [ ] **[TEST]** 전체 Core 테스트 실행

  ```bash
  npm test -w @didim365/agent-cli-core -- --run
  ```

- [ ] **[TYPECHECK]** 타입 검사

  ```bash
  npm run typecheck -w @didim365/agent-cli-core
  ```

- [ ] **[LINT]** 린터 검사

  ```bash
  npm run lint -w @didim365/agent-cli-core
  ```

- [ ] **[BUILD]** Core 빌드 확인 (CLI 의존성)

  ```bash
  npm run build -w @didim365/agent-cli-core
  ```

- [ ] **[REGRESSION]** Phase 1 회귀 테스트

  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/converter.test.ts
  ```

- [ ] **[VERIFY]** 기능 검증
  - 확인 항목 1: DidimAdapter가 ProviderRegistry에 정상 등록되는가
  - 확인 항목 2: 기존 프로바이더(Gemini, Claude, OpenAI)의 bootstrap이 영향받지
    않는가
  - 확인 항목 3: generateContentStream이 SSE sse/improved 두 모드를 올바르게
    처리하는가
  - 확인 항목 4: thread_id가 요청 간에 올바르게 유지되는가

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `./working_history/Phase2_core_didim_adapter_{작업일자}.md`

- [ ] **[COMMIT]** 변경사항 커밋 (Tidy First: 구조 → 동작 분리)
  ```bash
  # 구조적 변경
  git commit -m "feat(providers): add DidimAdapter skeleton + bootstrap registration"
  # 동작 변경
  git commit -m "feat(providers): implement DidimAdapter generateContent + SSE streaming"
  # contentGenerator 연동
  git commit -m "feat(core): register bootstrapDidimProvider in contentGenerator"
  ```

---

## ⚠️ 주의사항

### BaseAdapter 구현 체크리스트

1. `providerName` — `'didim'` 문자열
2. `capabilities` — `LlmProviderCapabilities` 인터페이스 전체 구현:
   - `supportsStreaming: true`
   - `supportsToolCalls: false`
   - `supportsImageInput: false`
   - `supportsImageGeneration: false`
   - `supportsEmbedding: false`
   - `supportsTokenCount: false` ← countTokens 미지원 명시
   - `supportsSystemMessage: false` (시나리오 기반)
   - `supportsThought: false`
   - `maxContextLength: 0` (알 수 없음)
   - `maxOutputTokens: 0` (알 수 없음)
3. `generateContent()` — 비스트리밍 POST /invoke
4. `generateContentStream()` — SSE POST /invoke/sse 또는 /invoke/sse/improved
5. `countTokens()` — 미지원 (BaseAdapter 기본 UnsupportedFeatureError)

### countTokens UnsupportedFeatureError 전파 대응 (2팀 Issue #2)

> `BaseAdapter.countTokens()`는 `supportsTokenCount: false`일 때
> `UnsupportedFeatureError`를 throw한다. 현재 호출 체인에 try-catch가 없다:
>
> - `contentGenerator.ts` → `llmCountTokens` wrapper
> - `loggingContentGenerator.ts` → passthrough (에러 bubbling)
> - `recordingContentGenerator.ts` → passthrough
>
> **조치**: Phase 2에서 countTokens 호출부를 전수 조사하고, Didim adapter 등록
> 후 UnsupportedFeatureError가 발생해도 CLI가 크래시하지 않도록 상위 레벨에서
> graceful 처리를 추가한다. 최소한 adapter bridge / content generator
> wrapper에서 catch.

### DidimProviderConfig 확장 (1팀 Issue #6)

> 현재 `DidimProviderConfig` (`providerConfig.ts:80`)는 `{ apiKey, endpoint? }`
> 만 가진다. Didim adapter에 필요한 `streamMode` 필드가 빠져 있다.
>
> **조치**: `DidimProviderConfig`에 `streamMode?: DidimStreamMode` 필드를
> 추가하여 typed config 레이어와 AdapterConfig 전달 경로가 일관되도록 한다.
> `contentGenerator.ts`에서 adapter 생성 시 이 config를 참조한다.

### SSE 파싱 주의점

1. DidimAIStudio는 `EventSource`가 아닌 `POST + ReadableStream` 방식
2. `event:` 라인으로 이벤트 타입 결정, `data:` 라인으로 페이로드 수집
3. 빈 줄(`\n\n`)이 이벤트 경계
4. JSON 파싱 실패 시 raw 텍스트를 content로 fallback

### contentGenerator.ts 수정 최소화

- `bootstrapDidimProvider(registry)` 한 줄 추가만 수행
- 기존 bootstrap 호출 순서/조건 변경 금지
- import 추가 시 기존 import 그룹과 일관되게 배치

---

**상태**: ⬜ Phase 1 완료 후 시작
