# Phase 1: Core — DidimConverter (순수 변환 함수)

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../multi_provider_model_select/template/99_TDD_plan.md)
>   — TDD 방법론
> - [DidimAIStudio 연동 가이드](../../../../docs/temp_howto_develop_integration_didimaistudio.md)
>   — API 계약
> - [00_master_plan.md](./00_master_plan.md) — 전체 작업계획서

---

## 작업 개요

| 항목        | 내용                                                    |
| ----------- | ------------------------------------------------------- |
| 프로젝트    | DidimAIStudio 연동 — Core Converter 순수 함수           |
| 영향 범위   | `packages/core/src/providers/didim/converter.ts` (신규) |
| 위험 수준   | 🟢 Low — 순수 함수, 외부 의존 없음                      |
| 성능 민감도 | 🟢 Low — 정적 변환 로직                                 |
| 참고 설계   | DidimAIStudio 연동 가이드 §2~§6                         |
| 작업 브랜치 | `DID/v0.3`                                              |

---

## 핵심 리스크 요약

| 리스크                                               | 영향      | 대응 방안                             | 상태 |
| ---------------------------------------------------- | --------- | ------------------------------------- | ---- |
| 도메인 정규화 엣지 케이스 (이중 프로토콜, 경로 포함) | 🟡 Medium | normalizeDidimDomain 전용 테스트 추가 | ⬜   |
| SSE 이벤트 형식 변경 가능성                          | 🟡 Medium | sse/improved 두 모드 분리 파싱        | ⬜   |
| `chat` vs `message` 필드명 혼동                      | 🟢 Low    | 최종 계약 기준 `chat` 사용 확인       | ⬜   |

---

## 1.1 사전 작업 (Pre-Work)

> **목적**: API 계약과 기존 프로바이더 converter 패턴을 정확히 이해한 뒤 시작
> **원칙**: 연동 가이드 문서와 기존 코드를 정확히 이해한 뒤 시작

- [ ] **[CONTEXT]** 작업 목적 및 배경 확인
  - 연동 가이드 문서 검토: §2 핵심 계약, §4 TypeScript 구현 순서
  - API 엔드포인트 3개, 인증 방식, 요청/응답 형식 확인

- [ ] **[ANALYSIS-1]** 기존 프로바이더 converter 패턴 분석
  - `packages/core/src/providers/claude/converter.ts` — 변환 클래스 구조
  - `packages/core/src/providers/openai/responsesConverter.ts` — 최근 추가된
    변환기
  - 확인: 클래스 vs 함수 방식, LlmGenerateRequest/Response 타입

- [ ] **[ANALYSIS-2]** DidimAIStudio API 계약 정리
  - 엔드포인트: `/scenario-gateway/v1/invoke`, `/invoke/sse`,
    `/invoke/sse/improved`
  - 인증: `Authorization: Bearer {jwt}`, `x-thread-id: {id}`
  - 요청: `{ chat: string, thread_id?: string }`
  - 응답: `{ response: string, thread_id: string }`
  - SSE sse 모드: `message` (chunk), `done` (thread_id), `error`
  - SSE improved 모드: `message_partial` (content), `message` (content),
    `complete` (thread_id), `error`

- [ ] **[ANALYSIS-3]** LlmEvent 타입 확인
  - `packages/core/src/providers/events.ts` — LlmEventType enum
  - 매핑 계획: message_partial/message → TextDelta, done/complete → Finished +
    MessageEnd

---

## 1.2 RED Phase: 실패 테스트 작성

> **목적**: 구현할 기능을 정의하는 실패 테스트 작성 **원칙**: 테스트가 실패하는
> 것을 확인한 후에만 구현 시작

### 1.2.1 도메인 정규화 테스트

- [ ] **[RED-1]** `normalizeDidimDomain()` 테스트

  ```typescript
  // packages/core/src/providers/didim/converter.test.ts

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
      expect(
        normalizeDidimDomain('https://https://aistudio.didim365.com'),
      ).toBe('aistudio.didim365.com');
    });

    it('should pass through clean domain', () => {
      expect(normalizeDidimDomain('aistudio.didim365.com')).toBe(
        'aistudio.didim365.com',
      );
    });
  });
  ```

### 1.2.2 엔드포인트 생성 테스트

- [ ] **[RED-2]** `getDidimEndpoint()` 테스트

  ```typescript
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
  });
  ```

### 1.2.3 헤더/바디 생성 테스트

- [ ] **[RED-3]** `buildDidimHeaders()` 테스트

  ```typescript
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
  });
  ```

- [ ] **[RED-4]** `buildDidimRequestBody()` 테스트

  ```typescript
  describe('buildDidimRequestBody', () => {
    it('should create body with chat field', () => {
      const body = buildDidimRequestBody('Hello');
      expect(body).toEqual({ chat: 'Hello' });
    });

    it('should include thread_id when provided', () => {
      const body = buildDidimRequestBody('Hello', 'thread_1');
      expect(body).toEqual({ chat: 'Hello', thread_id: 'thread_1' });
    });
  });
  ```

### 1.2.4 응답 파싱 테스트

- [ ] **[RED-5]** `parseDidimResponse()` 테스트

  ```typescript
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
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/converter.test.ts
  # 반드시 FAIL이어야 함 (converter.ts 미존재)
  ```

---

## 1.3 GREEN Phase: 최소 코드 구현

> **목적**: 테스트를 통과하는 최소한의 코드 구현 **원칙**: "Make it work" —
> 동작하게 만드는 것이 최우선

- [ ] **[TASK-001]** `converter.ts` 타입 정의
  - 파일: `packages/core/src/providers/didim/converter.ts`
  - 내용:

    ```typescript
    export type DidimStreamMode = 'sse' | 'improved';

    export type DidimResponse = {
      response?: unknown;
      thread_id?: unknown;
    };

    export type DidimParsedResponse = {
      content: string;
      threadId: string | null;
    };
    ```

- [ ] **[TASK-002]** `normalizeDidimDomain()` 구현
  - 파일: `packages/core/src/providers/didim/converter.ts`

- [ ] **[TASK-003]** `getDidimEndpoint()` 구현

- [ ] **[TASK-004]** `buildDidimHeaders()` 구현

- [ ] **[TASK-005]** `buildDidimRequestBody()` 구현

- [ ] **[TASK-006]** `parseDidimResponse()` 구현

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/converter.test.ts
  # 반드시 PASS여야 함
  ```

---

## 1.4 RED Phase (2차): SSE 이벤트 파싱 + LlmEvent 변환 테스트

> **목적**: SSE 이벤트를 LlmEvent로 변환하는 로직의 실패 테스트 작성

### 1.4.1 SSE sse 모드 이벤트 파싱

- [ ] **[RED-6]** `parseDidimSseEvent()` sse 모드 테스트

  ```typescript
  describe('parseDidimSseEvent (sse mode)', () => {
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
  });
  ```

### 1.4.2 SSE improved 모드 이벤트 파싱

- [ ] **[RED-7]** `parseDidimSseEvent()` improved 모드 테스트

  ```typescript
  describe('parseDidimSseEvent (improved mode)', () => {
    it('should parse message_partial event', () => {
      const result = parseDidimSseEvent(
        'message_partial',
        '{"content": "Hel"}',
        'improved',
      );
      expect(result).toEqual({ type: 'delta', text: 'Hel' });
    });

    it('should parse message event (final)', () => {
      const result = parseDidimSseEvent(
        'message',
        '{"content": "Hello"}',
        'improved',
      );
      expect(result).toEqual({ type: 'message', text: 'Hello' });
    });

    it('should parse complete event', () => {
      const result = parseDidimSseEvent(
        'complete',
        '{"thread_id": "th_2"}',
        'improved',
      );
      expect(result).toEqual({ type: 'done', threadId: 'th_2' });
    });
  });
  ```

### 1.4.3 LlmEvent 변환

- [ ] **[RED-8]** `convertDidimResponseToLlm()` 테스트

  ```typescript
  describe('convertDidimResponseToLlm', () => {
    it('should convert parsed response to LlmGenerateResponse', () => {
      const result = convertDidimResponseToLlm(
        { content: 'Hello!', threadId: 'th_1' },
        'didim-default',
      );
      expect(result.content).toEqual([{ type: 'text', text: 'Hello!' }]);
      expect(result.stopReason).toBe('end_turn');
    });
  });
  ```

- [ ] **[RED-9]** `convertDidimSseToLlmEvents()` 테스트

  ```typescript
  describe('convertDidimSseToLlmEvents', () => {
    it('should convert delta to TextDelta event', () => {
      const events = convertDidimSseToLlmEvents({ type: 'delta', text: 'Hi' });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LlmEventType.TextDelta);
    });

    it('should convert done to Finished + MessageEnd events', () => {
      const events = convertDidimSseToLlmEvents({
        type: 'done',
        threadId: 'th_1',
      });
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(LlmEventType.Finished);
      expect(events[1].type).toBe(LlmEventType.MessageEnd);
    });

    it('should convert error to Error event', () => {
      const events = convertDidimSseToLlmEvents({
        type: 'error',
        message: 'fail',
      });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LlmEventType.Error);
    });
  });
  ```

- [ ] **[RED-VERIFY-2]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/converter.test.ts
  # 신규 테스트가 FAIL이어야 함
  ```

---

## 1.5 GREEN Phase (2차): SSE 파싱 + LlmEvent 변환 구현

- [ ] **[TASK-007]** SSE 이벤트 타입 정의

  ```typescript
  export type DidimSseEvent =
    | { type: 'delta'; text: string }
    | { type: 'message'; text: string }
    | { type: 'done'; threadId: string | null }
    | { type: 'error'; message: string };
  ```

- [ ] **[TASK-008]** `parseDidimSseEvent()` 구현 (sse + improved 두 모드)

- [ ] **[TASK-009]** `convertDidimResponseToLlm()` 구현

- [ ] **[TASK-010]** `convertDidimSseToLlmEvents()` 구현

- [ ] **[GREEN-VERIFY-2]** 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/converter.test.ts
  # 반드시 PASS여야 함
  ```

---

## 1.6 REFACTOR Phase: 코드 개선

> **목적**: 동작을 유지하면서 코드 구조와 가독성 개선 **원칙**: "Make it right"
> — 테스트가 통과하는 상태에서만 리팩터링

### 1.6.1 구조 개선 (Make it right)

- [ ] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - 타입 정의를 별도 파일로 분리 필요 여부 판단 (types.ts)
  - 도메인 정규화/헤더 빌더 등 순수 함수 그룹핑
  - SSE 파서와 LlmEvent 변환 책임 분리
  - JSDoc 주석 추가 (API 계약 참조)

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core -- --run src/providers/didim/converter.test.ts
  # 여전히 PASS여야 함
  ```

---

## 1.7 사후 작업 (Post-Work)

> **목적**: 수정된 코드 검증 및 작업 결과 문서화 **원칙**: 모든 검증 완료 후
> 작업결과서 작성

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

- [ ] **[VERIFY]** 기능 검증
  - 확인 항목 1: 모든 순수 함수가 외부 의존 없이 동작하는가
  - 확인 항목 2: SSE sse/improved 두 모드 모두 올바르게 파싱되는가
  - 확인 항목 3: LlmEvent 변환이 기존 이벤트 시스템과 호환되는가

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase1_core_didim_converter_{작업일자}.md`
  - 내용: 작업 요약, 변경 파일, 테스트 결과, 이슈, Phase 2 인수 사항

- [ ] **[COMMIT]** 변경사항 커밋
  ```bash
  git add packages/core/src/providers/didim/converter.ts packages/core/src/providers/didim/converter.test.ts
  git commit -m "feat(providers): add DidimConverter — URL/header/body/SSE pure functions"
  ```

---

## ⚠️ 주의사항

### API 계약 주의점

1. **요청 필드**: `{ chat: "..." }` — 과거 문서의 `{ message: "..." }`가 아님
2. **도메인 정규화**: 프로토콜/경로 제거 후 고정 경로
   `/scenario-gateway/v1/invoke` 사용
3. **SSE 모드 차이**: `sse`는 `chunk` 필드, `improved`는 `content` 필드 사용
4. **thread_id**: 응답의 `thread_id`가 string일 때만 저장, 그 외는 null 처리

### TDD 사이클 원칙

1. RED First: 반드시 실패하는 테스트를 먼저 작성
2. Minimal Green: 테스트를 통과하는 최소한의 코드만 구현
3. Safe Refactor: 테스트가 통과하는 상태에서만 리팩터링

---

**상태**: ⬜ 시작 대기
