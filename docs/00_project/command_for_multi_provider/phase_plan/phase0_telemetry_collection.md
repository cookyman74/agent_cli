# Phase 0: Non-Gemini 텔레메트리 수집 경로 구축

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) - TDD 방법론
> - [원본 수정방안 §3.0](../stats_MultiProviderSupport_plan_20260218.md) - Phase
>   0 상세
> - [메인 계획서](./00_main_plan.md)
>
> **작업 분할 규칙**: 최대 2일 이내 완료

---

## 📋 작업 개요

| 항목        | 내용                                                                               |
| ----------- | ---------------------------------------------------------------------------------- |
| Phase       | Phase 0 (선행 필수)                                                                |
| 목표        | Non-Gemini 프로바이더의 API 호출이 `/stats`에 반영되도록 텔레메트리 로깅 경로 구축 |
| 영향 범위   | `loggingContentGenerator.ts`, `loggers.ts`, `uiTelemetry.ts`                       |
| 위험 수준   | 🔴 Critical — 이 Phase 미완 시 Phase 1~4 전체 무의미                               |
| 성능 민감도 | 🟢 Low                                                                             |
| 선행 Phase  | 없음                                                                               |
| 예상 소요   | 1.5~2일                                                                            |

### 핵심 문제

`LoggingContentGenerator.llmLoggingStreamWrapper()` (line 473)는
`debugLogger.debug()`만 호출하고 `logApiResponse()`/`logApiError()`를 호출하지
않는다. UI 통계는 `loggers.ts:255` → `uiTelemetryService.addEvent()` 경로를
통해서만 적재되므로, **Non-Gemini 프로바이더의 /stats가 항상 비어 있다**.

---

## 🚨 핵심 리스크

| 리스크                                                                   | 영향      | 대응 방안                                                                                                                                                                          | 상태 |
| ------------------------------------------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **[#3] ProviderApiResponseEvent에 toLogRecord/toSemanticLogRecord 없음** | 🔴 High   | **3경로 통합 폐기** → UI 전용 경로(`uiTelemetryService.addEvent`) + lightweight OTEL metrics 카운터만 기록. Clearcut은 `ProviderApiResponseEvent`에 logRecord 메서드 없으므로 생략 | ⬜   |
| Gemini 기존 경로 regression                                              | 🔴 High   | UiEvent union 확장 시 duck typing 보존, 기존 Gemini 테스트 전체 실행                                                                                                               | ⬜   |
| adapter Error yield 패턴 미처리                                          | 🟠 Medium | 스트림 루프 내 Error 이벤트 감지 + catch 블록 이중 처리                                                                                                                            | ⬜   |
| usage 없는 정상 응답 카운트 누락                                         | 🟡 Medium | usage 없으면 빈 usage 기본값으로 요청 카운트만 기록                                                                                                                                | ⬜   |

---

## 0.1 사전 작업 (Pre-Work)

> **목적**: 본작업의 실패를 줄이기 위한 작업 준비 과정 **원칙**: 전체 작업의
> 목적과 배경, 기존 코드 구조를 파악하여 맥락 이해 및 일관성 유지

- [ ] **[CONTEXT]** 작업 목적 및 배경 확인
  - PRD 문서 검토:
    [원본 수정방안 §3.0](../stats_MultiProviderSupport_plan_20260218.md)
  - v2/v3 리뷰 반영 사항 확인: 이슈 #1 (수집 단절), v3-2 (Error yield), v3-3
    (usage-less), v3-4 (OTEL 우회)

- [ ] **[ANALYSIS]** 현재 코드 분석
  - `packages/core/src/core/loggingContentGenerator.ts`
    - `llmLoggingStreamWrapper()` (line 473-494): 현재 debugLogger만 사용
    - `llmGenerateContent()` (line 423-449): 비스트림도 debugLogger만 사용
    - `loggingStreamWrapper()` (line 330-378): Gemini용 — 참고 패턴
    - `_logApiResponse()` (line 135-167): Gemini용 — 신규 메서드의 참고 모델
  - `packages/core/src/telemetry/loggers.ts`
    - `logApiResponse()` (line 255): 3개 경로 (uiTelemetry + Clearcut + OTEL)
      - ⚠️ Clearcut `logApiResponseEvent()` (line 768): `ApiResponseEvent`만
        수용 — `ProviderApiResponseEvent` 비호환
      - ⚠️ OTEL `bufferTelemetryEvent()`: `event.toLogRecord(config)` 호출 —
        `ProviderApiResponseEvent`에 없음
      - ✅ uiTelemetryService: duck typing → `ProviderApiResponseEvent` 호환
        가능
    - `logApiError()` (line 224): 에러 처리 3개 경로 (동일 제약)
  - `packages/core/src/telemetry/uiTelemetry.ts`
    - `UiEvent` 타입 (line 21-24):
      `ApiResponseEvent | ApiErrorEvent | ToolCallEvent`
    - `processApiResponse()` (line 164): model 키 기반
  - `packages/core/src/providers/telemetryBridge.ts`
    - `ProviderApiResponseEvent` (line 77-104): provider 필드 포함
    - `ProviderApiErrorEvent` (line 133-160): 에러 이벤트
    - `createProviderApiResponseEvent()`: 팩토리 함수
  - `packages/core/src/providers/openai/adapter.ts`
    - `generateContentStream()` (line 162-168): `yield createErrorEvent()` —
      throw 아님
  - `packages/core/src/providers/claude/adapter.ts`
    - `generateContentStream()` (line 154-161): 동일 패턴

- [ ] **[ANALYSIS]** 기존 테스트 현황 확인
  - `loggingContentGenerator.test.ts`: 기존 Gemini 경로 테스트 확인
  - `uiTelemetry.test.ts`: processApiResponse 기존 테스트 확인
  - `loggers.test.ts`: logApiResponse/logApiError 테스트 확인
  - `telemetryBridge.test.ts`: ProviderApiResponseEvent 생성 테스트 확인

- [ ] **[SCOPE-CHECK]** 2일 이내 완료 가능 범위 확인
  - 예상 총 소요: 1.5~2일
  - 이번 Phase 완료 조건(DoD):
    1. `llmLoggingStreamWrapper`에서 Non-Gemini API 호출이 텔레메트리에 기록됨
    2. `llmGenerateContent`(비스트림)도 동일하게 텔레메트리 기록됨
    3. Error 이벤트(yield)도 에러 텔레메트리로 기록됨
    4. `UiEvent`가 `ProviderApiResponseEvent`/`ProviderApiErrorEvent`를 수용함
    5. 기존 Gemini 텔레메트리 경로가 정상 동작함 (regression 없음)
    6. **[#3]** `logProviderApiResponse`는 UI 전용 + lightweight OTEL counter만
       사용 (Clearcut/OTEL logRecord 생략)
    7. **[v1.4 #3]** `ModelMetrics.provider` 필드가 추가되고,
       processApiResponse/processApiError에서 provider 값이 설정됨

---

## 0.2 🔴 RED Phase: 실패 테스트 작성

> **목적**: 구현할 기능을 정의하는 실패 테스트 작성 **원칙**: 테스트가 실패하는
> 것을 확인한 후에만 구현 시작

### RED-1: llmLoggingStreamWrapper 정상 응답 텔레메트리

- [ ] **[RED]** 스트림 완료 시 logProviderApiResponse 호출 테스트

  **파일**: `packages/core/src/core/loggingContentGenerator.test.ts` (신규
  describe 블록)

  ```typescript
  describe('llmLoggingStreamWrapper telemetry', () => {
    it('should call logProviderApiResponse on successful stream completion', async () => {
      // Arrange: LlmEventStream with MessageEnd (usage 포함)
      // Act: llmLoggingStreamWrapper 소비
      // Assert: logProviderApiResponse가 provider, model, duration, usage와 함께 호출됨
    });
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/loggingContentGenerator.test.ts --run
  # 반드시 FAIL이어야 함
  ```

### RED-2: llmLoggingStreamWrapper Error 이벤트 텔레메트리

- [ ] **[RED]** adapter가 yield한 Error 이벤트에 대한 에러 텔레메트리 테스트

  ```typescript
  it('should call logProviderApiError when stream contains Error event', async () => {
    // Arrange: LlmEventStream with LlmEventType.Error yield (throw 아님)
    // Act: llmLoggingStreamWrapper 소비
    // Assert: logProviderApiError가 호출됨, logProviderApiResponse는 미호출
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### RED-3: llmLoggingStreamWrapper usage 없는 정상 응답

- [ ] **[RED]** usage 없는 정상 스트림에 대한 요청 카운트 테스트

  ```typescript
  it('should call logProviderApiResponse with empty usage when stream has no MessageEnd usage', async () => {
    // Arrange: LlmEventStream with TextDelta + Finished (MessageEnd 없음)
    // Act: llmLoggingStreamWrapper 소비
    // Assert: logProviderApiResponse가 빈 usage로 호출됨 (카운트는 기록)
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### RED-4: llmLoggingStreamWrapper 네트워크 예외

- [ ] **[RED]** 스트림 소비 중 네트워크 예외 발생 시 에러 텔레메트리 테스트

  ```typescript
  it('should call logProviderApiError and rethrow on network-level exception', async () => {
    // Arrange: LlmEventStream that throws Error
    // Act & Assert: throw 확인 + logProviderApiError 호출 확인
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### RED-5: llmGenerateContent (비스트림) 텔레메트리

- [ ] **[RED]** 비스트림 정상 응답 텔레메트리 테스트

  ```typescript
  describe('llmGenerateContent telemetry', () => {
    it('should call logProviderApiResponse on successful non-stream response', async () => {
      // Arrange: mock wrapped.llmGenerateContent → LlmGenerateResponse (with usage)
      // Act: generator.llmGenerateContent(request, promptId)
      // Assert: logProviderApiResponse 호출됨
    });

    it('should call logProviderApiError on non-stream error', async () => {
      // Arrange: mock wrapped.llmGenerateContent → throw Error
      // Act & Assert: throw + logProviderApiError 호출
    });
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### RED-6: logProviderApiResponse UI 전용 + lightweight OTEL

> **v1.1 리뷰 반영 (이슈 #3)**: `ProviderApiResponseEvent`는
> `toLogRecord()`/`toSemanticLogRecord()` 미구현. Clearcut
> `logApiResponseEvent()`는 `ApiResponseEvent`만 수용. → **3경로 통합 폐기**. UI
> 전용 경로(`uiTelemetryService.addEvent`) + lightweight OTEL counter metrics만
> 기록.

- [ ] **[RED]** logProviderApiResponse가 uiTelemetry + OTEL counter만 호출하는
      테스트

  **파일**: `packages/core/src/telemetry/loggers.test.ts` (신규 describe 블록)

  ```typescript
  describe('logProviderApiResponse', () => {
    it('should dispatch event to uiTelemetryService', () => {
      // Arrange: ProviderApiResponseEvent mock
      // Act: logProviderApiResponse(config, event)
      // Assert: uiTelemetryService.addEvent 호출됨
    });

    it('should record lightweight OTEL counter metric (not logRecord)', () => {
      // Arrange: ProviderApiResponseEvent mock
      // Act: logProviderApiResponse(config, event)
      // Assert: OTEL counter increment 호출됨 (bufferTelemetryEvent 미호출)
    });

    it('should NOT call ClearcutLogger.logApiResponseEvent', () => {
      // Arrange: ProviderApiResponseEvent mock
      // Act: logProviderApiResponse(config, event)
      // Assert: ClearcutLogger.logApiResponseEvent 미호출 (타입 비호환)
    });
  });

  describe('logProviderApiError', () => {
    it('should dispatch error event to uiTelemetryService', () => {
      // Arrange: ProviderApiErrorEvent mock
      // Act: logProviderApiError(config, event)
      // Assert: uiTelemetryService.addEvent 호출됨
    });
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### RED-7: UiEvent 타입 확장 및 processApiResponse provider 추출

- [ ] **[RED]** processApiResponse가 ProviderApiResponseEvent의 provider를
      인식하는 테스트

  **파일**: `packages/core/src/telemetry/uiTelemetry.test.ts` (신규 describe
  블록)

  ```typescript
  describe('processApiResponse with ProviderApiResponseEvent', () => {
    it('should extract provider from ProviderApiResponseEvent', () => {
      // Arrange: ProviderApiResponseEvent with provider='claude'
      // Act: uiTelemetryService.addEvent(event)
      // Assert: sessionMetrics.models에 provider='claude' 포함
    });

    it('should default to gemini for legacy ApiResponseEvent without provider', () => {
      // Arrange: 기존 ApiResponseEvent (provider 필드 없음)
      // Act: uiTelemetryService.addEvent(event)
      // Assert: sessionMetrics.models에 provider='gemini' 포함
    });
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

---

## 0.3 🟢 GREEN Phase: 최소 코드 구현

> **목적**: 테스트를 통과하는 최소한의 코드 구현 **원칙**: "Make it work" —
> 동작하게 만드는 것이 최우선, 최적화는 Refactor에서

### TASK-001: \_logLlmApiResponse / \_logLlmApiError 메서드 추가

- [ ] **[TASK-001]** LoggingContentGenerator에 Non-Gemini 텔레메트리 메서드 신설
  - 파일: `packages/core/src/core/loggingContentGenerator.ts`
  - 변경 내용:

    ```typescript
    private _logLlmApiResponse(
      model: string, durationMs: number, promptId: string, usage: LlmTokenUsage,
    ): void {
      const event = createProviderApiResponseEvent({
        model, durationMs, promptId, usage,
        provider: this.wrapped.providerName ?? 'unknown',
      });
      logProviderApiResponse(this.config, event);
    }

    private _logLlmApiError(
      model: string, durationMs: number, promptId: string, error: unknown,
    ): void {
      // error → message 추출 후 createProviderApiErrorEvent 호출
      logProviderApiError(this.config, event);
    }
    ```

  - 예상 소요: 30분

### TASK-002: llmLoggingStreamWrapper 텔레메트리 추가

- [ ] **[TASK-002]** 스트림 래퍼에 Error 이벤트 감지 + usage 수집 + 텔레메트리
      로깅
  - 파일: `packages/core/src/core/loggingContentGenerator.ts`
  - 변경 내용:
    - `for await` 루프 내에서 `LlmEventType.MessageEnd` → `lastUsage` 수집
    - `LlmEventType.Error` → `errorEvent` 캡처
    - 루프 완료 후: `errorEvent` 있으면 `_logLlmApiError`, 없으면
      `_logLlmApiResponse`
    - `catch` 블록: 네트워크 예외 시 `_logLlmApiError` + `throw`
  - 참고: 원본 §3.0.1 코드 블록
  - 예상 소요: 45분

### TASK-003: llmGenerateContent 텔레메트리 추가

- [ ] **[TASK-003]** 비스트림 호출에 텔레메트리 로깅
  - 파일: `packages/core/src/core/loggingContentGenerator.ts`
  - 변경 내용:
    - `try` 블록: 성공 시
      `_logLlmApiResponse(request.model, durationMs, promptId, response.usage)`
    - `catch` 블록:
      `_logLlmApiError(request.model, durationMs, promptId, error)` + `throw`
  - 참고: 원본 §3.0.5 코드 블록
  - 예상 소요: 20분

### TASK-004: logProviderApiResponse / logProviderApiError 신설

> **v1.1 리뷰 반영 (이슈 #3)**: 3경로 통합 폐기 → UI 전용 + lightweight OTEL

- [ ] **[TASK-004]** loggers.ts에 Non-Gemini 전용 텔레메트리 로깅 함수
  - 파일: `packages/core/src/telemetry/loggers.ts`
  - 변경 내용:
    - `logProviderApiResponse(config, event)`:
      - ✅ `uiTelemetryService.addEvent(event)` — UI 통계용 (기존 Gemini 경로와
        동일)
      - ✅ OTEL counter metric increment — request count/token count 카운터만
        기록
      - ❌ ~~Clearcut `logApiResponseEvent`~~ — `ProviderApiResponseEvent`는
        `ApiResponseEvent` 타입 아님, 생략
      - ❌ ~~OTEL `bufferTelemetryEvent(event.toLogRecord())`~~ —
        `toLogRecord()` 메서드 없음, 생략
    - `logProviderApiError(config, event)`:
      - ✅ `uiTelemetryService.addEvent(event)` — UI 에러 표시용
      - ❌ ~~Clearcut/OTEL logRecord~~ — 동일 사유로 생략
  - 참고: 원본 §3.0.2 코드 블록 (3경로 → 축소 적용)
  - 예상 소요: 30분

### TASK-005: UiEvent 타입 확장

- [ ] **[TASK-005]** ProviderApiResponseEvent / ProviderApiErrorEvent를 UiEvent
      union에 추가
  - 파일: `packages/core/src/telemetry/uiTelemetry.ts`
  - 변경 내용:
    ```typescript
    export type UiEvent =
      | (ApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE })
      | (ProviderApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE })
      | (ApiErrorEvent & { 'event.name': typeof EVENT_API_ERROR })
      | (ProviderApiErrorEvent & { 'event.name': typeof EVENT_API_ERROR })
      | (ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL });
    ```
  - 예상 소요: 15분

### TASK-006: ModelMetrics.provider 필드 추가 + processApiResponse/processApiError provider 추출

> **v1.2 이슈 #2**: `processApiError()` (line 182-187)도 동일한 provider 추출이
> 필요. 현재는 error count만 증가하고 provider를 설정하지 않음 → Phase 1에서
> 복합 키 적용 시 `provider: 'unknown'` 상태가 됨. **v1.4 이슈 #3 해결**:
> `ModelMetrics.provider` 필드는 Phase 0에서 추가 (Phase 1이 아님). Phase 0
> RED-7에서 `sessionMetrics.models에 provider='claude' 포함`을 검증하려면 이
> 필드가 필요함. Phase 1은 이 필드가 존재한다고 가정하고 복합 키 + 그룹핑에
> 집중.

- [ ] **[TASK-006]** ModelMetrics.provider 추가 + duck typing으로 provider 필드
      감지 + 레거시 호환 (Response + Error 모두)
  - 파일: `packages/core/src/telemetry/uiTelemetry.ts`
  - 변경 — ModelMetrics 인터페이스:
    ```typescript
    export interface ModelMetrics {
      provider: string;  // 신규 — Phase 0에서 추가 (v1.4 이슈 #3)
      api: { ... };
      tokens: { ... };
    }
    ```
  - 변경 — createInitialModelMetrics:
    ```typescript
    const createInitialModelMetrics = (): ModelMetrics => ({
      provider: 'unknown',  // 기본값 — addEvent 시 실제 provider로 갱신됨
      api: { ... },
      tokens: { ... },
    });
    ```
  - 변경 — processApiResponse:
    ```typescript
    const provider =
      'provider' in event
        ? (event as ProviderApiResponseEvent).provider
        : 'gemini';
    modelMetrics.provider = provider;
    ```
  - 변경 — processApiError (신규):
    ```typescript
    const provider =
      'provider' in event
        ? (event as ProviderApiErrorEvent).provider
        : 'gemini';
    modelMetrics.provider = provider;
    ```
  - 예상 소요: 30분

- [ ] **[GREEN-VERIFY]** 전체 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/loggingContentGenerator.test.ts --run
  npm test -w @didim365/agent-cli-core -- src/telemetry/loggers.test.ts --run
  npm test -w @didim365/agent-cli-core -- src/telemetry/uiTelemetry.test.ts --run
  ```

---

## 0.4 🔵 REFACTOR Phase: 코드 개선

> **목적**: 동작을 유지하면서 코드 구조 개선 **원칙**: "Make it right" —
> 테스트가 통과하는 상태에서만 리팩터링

### 0.4.1 구조 개선 (Make it right)

- [ ] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - `_logLlmApiResponse`와 `_logLlmApiError`의 error message 추출 로직 검토
    - `instanceof Error`, `'error' in error`, `String(error)` 분기가 명확한지
      확인
  - `logProviderApiResponse`와 기존 `logApiResponse` 간 공통 로직 추출 가능성
    검토
    - OTEL metrics 기록 부분이 중복되면 private helper 추출
  - import 정리 및 불필요한 타입 캐스팅 최소화
  - 네이밍 일관성: `_logLlm*` vs `_log*` 접두사 통일

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/core/loggingContentGenerator.test.ts --run
  npm test -w @didim365/agent-cli-core -- src/telemetry/ --run
  ```

### 0.4.2 성능 개선 (Make it fast) ⚡

> 성능 민감도 🟢 Low — 이 섹션은 간략히 검토만 수행

- [ ] **[REFACTOR-PERF-ANALYZE]** 성능 체크리스트 검토

  | 항목                          | 현재 상태               | 개선 필요 | 주의사항          |
  | ----------------------------- | ----------------------- | --------- | ----------------- |
  | 이벤트 처리 오버헤드          | 매 이벤트마다 type 체크 | ❌ (미미) | O(1) 비교         |
  | Date.now() 호출               | 스트림 시작/종료 2회    | ❌        | 충분히 가벼움     |
  | ProviderApiResponseEvent 생성 | 요청당 1회              | ❌        | GC 부담 무시 가능 |

---

## 0.5 사후 작업 (Post-Work)

> **목적**: 수정된 코드 검증 및 작업 결과 문서화 **원칙**: 모든 검증 완료 후
> 작업결과서 작성

- [ ] **[TEST]** 전체 테스트 실행

  ```bash
  npm test -w @didim365/agent-cli-core -- --run
  ```

- [ ] **[TYPECHECK]** 타입체크

  ```bash
  npm run typecheck
  ```

- [ ] **[LINT]** 린터 검사

  ```bash
  npm run lint
  ```

- [ ] **[VERIFY]** 기능 검증
  - 확인 항목 1: 기존 Gemini 테스트 전체 통과 (regression 없음)
  - 확인 항목 2: 새 테스트(RED-1~RED-7) 전체 통과
  - 확인 항목 3: `UiEvent` 타입이 기존 `ApiResponseEvent` + 신규
    `ProviderApiResponseEvent` 모두 수용

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase0_TelemetryCollection_{작업일자}.md`
  - 내용:
    - 작업 목표 및 범위
    - Red/Green/Refactor 각 단계 결과
    - 테스트 실행 결과
    - 이슈 및 해결 방법
    - Phase 1 착수 전 확인 사항

- [ ] **[COMMIT]** 변경사항 커밋
  ```bash
  git add packages/core/src/core/loggingContentGenerator.ts \
         packages/core/src/telemetry/loggers.ts \
         packages/core/src/telemetry/uiTelemetry.ts \
         packages/core/src/core/loggingContentGenerator.test.ts \
         packages/core/src/telemetry/loggers.test.ts \
         packages/core/src/telemetry/uiTelemetry.test.ts
  git commit -m "feat(telemetry): Non-Gemini 프로바이더 텔레메트리 수집 경로 구축 (Phase 0)"
  ```

---

## ⚠️ 주의사항

### TDD 사이클 원칙

1. **Red First**: 반드시 실패하는 테스트를 먼저 작성
2. **Minimal Green**: 테스트를 통과하는 최소한의 코드만 구현 (최적화 X)
3. **Safe Refactor**: 테스트가 통과하는 상태에서만 리팩터링 진행

### Phase 0 특수 주의

4. **Gemini 경로 보존**: `UiEvent` 확장 시 기존 `ApiResponseEvent` duck typing이
   깨지지 않도록 주의
5. **Error yield 패턴**: adapter는 throw 대신 yield — `for await` 루프에서
   감지해야 함
6. **Usage 없는 응답**: `lastUsage` 없어도 요청 카운트 기록 — 빈 usage 기본값
   사용
7. **[#3] UI 전용 경로**: `logProviderApiResponse`는
   `uiTelemetryService.addEvent` + lightweight OTEL counter만 처리.
   Clearcut/OTEL logRecord 경로는 `ProviderApiResponseEvent`가
   `toLogRecord()`/`toSemanticLogRecord()` 미구현이므로 생략

### ⚠️ Known Limitation — 관측 가능성 감소 (v1.2 이슈 #9)

> **의도적 제약**: Non-Gemini 프로바이더는 Clearcut logRecord / OTEL logRecord
> 경로를 사용하지 않음. 이는 `ProviderApiResponseEvent`가 `toLogRecord()` /
> `toSemanticLogRecord()` 메서드를 구현하지 않기 때문.
>
> **영향**:
>
> - Non-Gemini API 호출에 대한 Clearcut 로그 미생성
> - OTEL에 구조화된 logRecord 미전송 (lightweight counter metric만 기록)
> - UI 통계(`/stats`)는 정상 동작 (uiTelemetryService 경로 사용)
> - OTEL counter metric은 본 Phase의 `logProviderApiResponse` TASK-004 구현 시
>   기록 예정 (현시점 미구현)
>
> **향후 개선 경로**:
>
> 1. `ProviderApiResponseEvent`에 `toLogRecord()` 구현 → Clearcut/OTEL 전체 경로
>    복원
> 2. 또는 provider-agnostic `UnifiedApiResponseEvent` 도입 → 모든 프로바이더에
>    3경로 통합
>
> **의사결정 근거**: UI 통계가 최우선 목표이며, Clearcut/OTEL은 Gemini 전용 내부
> 서비스. Non-Gemini 프로바이더의 OTEL 통합은 별도 Phase로 분리 가능.

---

**작성일**: 2026-02-18 **작성자**: AI Assistant **상태**: ⬜ 작성 중
