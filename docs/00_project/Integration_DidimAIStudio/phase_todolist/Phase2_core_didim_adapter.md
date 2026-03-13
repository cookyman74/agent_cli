# Phase 2: Core — DidimAdapter + Bootstrap + ContentGenerator 등록

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../multi_provider_model_select/template/99_TDD_plan.md)
>   — TDD 방법론
> - [Phase1 결과서](../working_history/) — 이전 Phase 결과 검토
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

| 리스크                                            | 영향      | 대응 방안                              | 상태 |
| ------------------------------------------------- | --------- | -------------------------------------- | ---- |
| BaseAdapter 구현 시 필수 메서드 누락              | 🟠 Medium | abstract 메서드 전수 확인              | ⬜   |
| contentGenerator.ts 수정으로 기존 프로바이더 회귀 | 🟠 Medium | bootstrap 추가만 수행 + 회귀 테스트    | ⬜   |
| SSE POST 방식 ReadableStream 파싱 복잡도          | 🟡 Medium | 기존 OpenAI SSE 파서 패턴 참고         | ⬜   |
| thread_id 상태 관리 누수                          | 🟡 Medium | adapter 내부 상태로 관리 + 초기화 명시 | ⬜   |
| fetch API 환경별 차이 (Node.js vs browser)        | 🟢 Low    | Node.js 20+ 네이티브 fetch 사용        | ⬜   |

---

## 2.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 1 작업 결과서 검토
  - 파일: `../working_history/Phase1_core_didim_converter_{작업일자}.md`
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

  ```typescript
  // packages/core/src/providers/didim/adapter.test.ts

  describe('DidimAdapter', () => {
    it('should have providerName "didim"', () => {
      const adapter = createAdapter();
      expect(adapter.providerName).toBe('didim');
    });

    it('should have toolCalling disabled', () => {
      const adapter = createAdapter();
      expect(adapter.capabilities.toolCalling).toBe(false);
    });
  });
  ```

- [ ] **[RED-2]** generateContent 정상 응답 테스트

  ```typescript
  describe('generateContent', () => {
    it('should send POST request to invoke endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        createMockResponse({
          response: 'Hello!',
          thread_id: 'th_1',
        }),
      );
      const adapter = createAdapter({ fetch: mockFetch });

      await adapter.generateContent(createBasicRequest());

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/scenario-gateway/v1/invoke'),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should return LlmGenerateResponse with text content', async () => {
      const adapter = createAdapter({
        fetch: mockFetchWith({ response: 'Hello!', thread_id: 'th_1' }),
      });

      const result = await adapter.generateContent(createBasicRequest());

      expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
      expect(result.stopReason).toBe('end_turn');
    });

    it('should include Authorization Bearer header', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValue(createMockResponse({ response: 'Hi' }));
      const adapter = createAdapter({ fetch: mockFetch, apiKey: 'jwt_123' });

      await adapter.generateContent(createBasicRequest());

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

      await adapter.generateContent(createBasicRequest());
      await adapter.generateContent(createBasicRequest());

      const [, secondOptions] = mockFetch.mock.calls[1];
      expect(secondOptions.headers['x-thread-id']).toBe('th_1');
    });
  });
  ```

- [ ] **[RED-3]** generateContent 에러 처리 테스트

  ```typescript
  describe('generateContent error handling', () => {
    it('should throw on 401 with JWT expiry message', async () => {
      const adapter = createAdapter({
        fetch: vi.fn().mockResolvedValue({ ok: false, status: 401 }),
      });

      await expect(
        adapter.generateContent(createBasicRequest()),
      ).rejects.toThrow(/JWT.*expired|invalid/i);
    });

    it('should throw on non-ok response', async () => {
      const adapter = createAdapter({
        fetch: vi.fn().mockResolvedValue({ ok: false, status: 500 }),
      });

      await expect(
        adapter.generateContent(createBasicRequest()),
      ).rejects.toThrow(/500/);
    });

    it('should throw on network error', async () => {
      const adapter = createAdapter({
        fetch: vi.fn().mockRejectedValue(new Error('Network failure')),
      });

      await expect(
        adapter.generateContent(createBasicRequest()),
      ).rejects.toThrow('Network failure');
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
  - `capabilities: { toolCalling: false, vision: false, streaming: true }`
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

  ```typescript
  describe('generateContentStream', () => {
    it('should yield TextDelta events from SSE stream', async () => {
      const adapter = createAdapter({
        fetch: mockSseFetch([
          'event: message\ndata: {"chunk": "Hello"}\n\n',
          'event: message\ndata: {"chunk": " world"}\n\n',
          'event: done\ndata: {"thread_id": "th_1"}\n\n',
        ]),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest()),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas).toHaveLength(2);
    });

    it('should yield Finished + MessageEnd on done event', async () => {
      const adapter = createAdapter({
        fetch: mockSseFetch([
          'event: message\ndata: {"chunk": "Hi"}\n\n',
          'event: done\ndata: {"thread_id": "th_1"}\n\n',
        ]),
        streamMode: 'sse',
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest()),
      );

      expect(events.some((e) => e.type === LlmEventType.Finished)).toBe(true);
      expect(events.some((e) => e.type === LlmEventType.MessageEnd)).toBe(true);
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
        adapter.generateContentStream(createBasicRequest()),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas).toHaveLength(2);
    });
  });
  ```

- [ ] **[RED-6]** 스트리밍 에러 테스트

  ```typescript
  describe('generateContentStream error handling', () => {
    it('should yield Error event on SSE error', async () => {
      const adapter = createAdapter({
        fetch: mockSseFetch([
          'event: error\ndata: {"message": "Server error"}\n\n',
        ]),
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest()),
      );

      expect(events.some((e) => e.type === LlmEventType.Error)).toBe(true);
    });

    it('should yield Error event on fetch failure', async () => {
      const adapter = createAdapter({
        fetch: vi.fn().mockRejectedValue(new Error('Connection lost')),
      });

      const events = await collectEvents(
        adapter.generateContentStream(createBasicRequest()),
      );

      expect(events.some((e) => e.type === LlmEventType.Error)).toBe(true);
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
    it('should register didim factory in ProviderRegistry', () => {
      const registry = new ProviderRegistry();
      bootstrapDidimProvider(registry);

      expect(registry.has('didim')).toBe(true);
    });

    it('should create DidimAdapter from factory', () => {
      const registry = new ProviderRegistry();
      bootstrapDidimProvider(registry);

      const adapter = registry.create('didim', createMockConfig());
      expect(adapter.providerName).toBe('didim');
    });
  });
  ```

- [ ] **[RED-VERIFY-C]** Part C 테스트 실패 확인

---

## 2.7 GREEN Phase (Part C): Bootstrap + ContentGenerator 연동

- [ ] **[TASK-007]** `bootstrap.ts` 구현

  ```typescript
  export function bootstrapDidimProvider(registry: ProviderRegistry): void {
    registry.register('didim', (config) => {
      const apiKey = process.env['DIDIM_API_KEY'] ?? '';
      const serverAddress = config.getDidimServerAddress?.() ?? '';
      const streamMode = config.getDidimStreamMode?.() ?? 'sse';
      return new DidimAdapter(
        config,
        globalThis.fetch.bind(globalThis),
        apiKey,
        serverAddress,
        streamMode,
      );
    });
  }
  ```

- [ ] **[TASK-008]** `index.ts` 작성
  - export: DidimAdapter, bootstrapDidimProvider, converter 함수들

- [ ] **[TASK-009]** `packages/core/src/providers/index.ts` 수정
  - import/export Didim namespace 추가

- [ ] **[TASK-010]** `contentGenerator.ts` 수정
  - `bootstrapDidimProvider(registry)` 호출 추가

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
  - 파일: `../working_history/Phase2_core_didim_adapter_{작업일자}.md`

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
2. `capabilities` — `toolCalling: false`, `vision: false`, `streaming: true`
3. `generateContent()` — 비스트리밍 POST /invoke
4. `generateContentStream()` — SSE POST /invoke/sse 또는 /invoke/sse/improved
5. `countTokens()` — 미지원 (BaseAdapter 기본 UnsupportedFeatureError)

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
