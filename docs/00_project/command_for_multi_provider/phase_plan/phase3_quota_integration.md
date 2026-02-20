# Phase 3: 쿼타 통합 (adapter 헤더 수집 선행)

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) - TDD 방법론
> - [원본 수정방안 §3.3](../stats_MultiProviderSupport_plan_20260218.md) - Phase
>   3 상세
> - [메인 계획서](./00_main_plan.md)
>
> **작업 분할 규칙**: 최대 2일 이내 완료

---

## 📋 작업 개요

| 항목        | 내용                                                                                              |
| ----------- | ------------------------------------------------------------------------------------------------- |
| Phase       | Phase 3 (선택 — adapter 변경 필수)                                                                |
| 목표        | Claude/OpenAI/openai-compatible adapter에서 rate-limit 헤더 수집 → ProviderQuotaService → UI 표시 |
| 영향 범위   | `claude/adapter.ts`, `openai/adapter.ts`, `telemetry/types.ts`, `cli/ui/*`                        |
| 위험 수준   | 🟠 High (adapter 레이어 변경 + SDK 구현 의존)                                                     |
| 성능 민감도 | 🟢 Low                                                                                            |
| 선행 Phase  | Phase 2 (cacheCreation 파이프라인)                                                                |
| 예상 소요   | 2일                                                                                               |

### 핵심 문제

현재 Claude/OpenAI adapter는 SDK 응답에서 rate-limit 헤더를 추출하지 않는다.
UI에서 `providerQuotas`를 표시하려면 adapter → 텔레메트리 → UI 전체 경로가
필요하다. 또한 기존 `HistoryItemDisplay.tsx`는 `quotas`만 `StatsDisplay`에
전달하므로 렌더 경로도 함께 수정해야 한다.

---

## 🚨 핵심 리스크

| 리스크                                                    | 영향      | 대응 방안                                                                                                                                                                                                                                                                       | 상태 |
| --------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **[#2] 데이터 경로 비어있음** (adapter→quota→render)      | 🔴 High   | **전체 경로 한번에 구현**: adapter 헤더 수집 → ProviderQuotaService → statsCommand 분기 → HistoryItemStats → HistoryItemDisplay → StatsDisplay 렌더. DoD에 구간별 수동 추적 필수                                                                                                | ⬜   |
| **[#3-v1.2] providerQuotaService 미존재**                 | 🔴 High   | `CommandContext`에 providerQuotaService 없음 (`statsCommand.ts`는 `config.refreshUserQuota()`만 사용). **ProviderQuotaService 신규 설계 필수** — 인터페이스, lifecycle, 데이터 소스, 소유권(core 또는 cli) 결정                                                                 | ⬜   |
| **[#4-v1.2] 스트리밍 rate-limit 헤더 전달 경로 없음**     | 🔴 High   | `LlmFinishedEvent`/`LlmMessageEndEvent`에 rate-limit 필드 없음. adapter가 SDK raw response에서 헤더 접근해도 이벤트 스트림으로 전달 불가. **해결 방안**: (A) `LlmMessageEndEvent`에 `rateLimits?` 필드 추가 또는 (B) adapter에서 직접 ProviderQuotaService에 push (out-of-band) | ⬜   |
| **[#8-v1.2] openai-compatible 범위**                      | 🟠 Medium | `OpenAiCompatibleAdapter`는 `OpenAiAdapter` 상속 → rate-limit 헤더 처리 자동 상속. 단, 커스텀 서버는 rate-limit 헤더 미반환 가능 → optional 처리 필수                                                                                                                           | ⬜   |
| SDK 응답에서 헤더 접근 불가                               | 🔴 High   | Anthropic/OpenAI SDK 소스 사전 조사, 불가 시 Phase 보류                                                                                                                                                                                                                         | ⬜   |
| Anthropic SDK `response.headers` 접근 방법 불확실         | 🟠 Medium | `@anthropic-ai/sdk` d.ts 및 소스 확인                                                                                                                                                                                                                                           | ⬜   |
| OpenAI SDK `_response?.headers` 비공개 API 의존           | 🟠 Medium | `openai` SDK 릴리스 노트 확인, 대안 경로 조사                                                                                                                                                                                                                                   | ⬜   |
| `providerQuotas` 렌더 경로 누락 (v3-6)                    | 🟡 Medium | StatsDisplayProps + HistoryItemDisplay 동시 수정                                                                                                                                                                                                                                | ⬜   |
| `providerTypes.ts` core export 미노출 (이슈 #9)           | 🟡 Low    | `telemetry/types.ts`에 정의하여 기존 export 활용                                                                                                                                                                                                                                | ⬜   |
| **[#2-v1.3] MessageEnd→ProviderQuotaService 브릿지 누락** | 🟠 High   | adapter가 rateLimits를 yield해도 소비자가 없으면 ProviderQuotaService 미갱신. TASK-003A로 `LoggingContentGenerator`에 브릿지 구현                                                                                                                                               | ⬜   |
| **[#3-v1.3] statsCommand providerName 미존재**            | 🟠 High   | `statsCommand.ts`에 `providerName` 변수 없음 — Gemini 쿼타는 항상 fetch, Non-Gemini는 ProviderQuotaService로 분리                                                                                                                                                               | ⬜   |
| **[#7-v1.3] CommandContext 인스턴스 주입 누락**           | 🟠 Medium | 타입만 추가 시 런타임 undefined. `slashCommandProcessor.ts` useMemo에 실제 인스턴스 주입 필요                                                                                                                                                                                   | ⬜   |
| **[#8-v1.3] LlmGenerateResponse rateLimits 필드 없음**    | 🟡 Low    | 비스트림 경로에서도 rate-limit 전달 필요. TASK-000에서 `providers/types.ts` 동시 수정                                                                                                                                                                                           | ⬜   |

---

## 3.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 2 작업 결과서 검토
  - 파일: `../working_history/Phase2_CacheCreation_{작업일자}.md`
  - 확인: 체크리스트 완료, 미해결 이슈

- [ ] **[CONTEXT]** Phase 3 작업 목적 확인
  - Non-Gemini 프로바이더의 쿼타/rate-limit 정보를 `/stats`에 표시
  - Gemini: 기존 `refreshUserQuota()` 유지
  - Claude/OpenAI/openai-compatible: 응답 헤더에서 rate-limit 추출

- [ ] **[ANALYSIS-CRITICAL]** SDK 헤더 접근 가능성 조사 (Phase 실행 전 필수)
  - `node_modules/@anthropic-ai/sdk` d.ts 확인
    - `messages.create()` 반환 타입에 `headers` 또는 `_response` 접근 가능한지
    - rate-limit 헤더: `anthropic-ratelimit-requests-limit`, `-remaining`,
      `-reset`
  - `node_modules/openai` d.ts 확인
    - `chat.completions.create()` 반환 타입
    - `_response?.headers` 또는 `response.headers` 접근 가능한지
    - rate-limit 헤더: `x-ratelimit-limit-requests`, `-remaining-requests`,
      `-reset-requests`
  - **결과**: 접근 불가 시 Phase 3 보류, Phase 4로 건너뛰기

- [ ] **[ANALYSIS-CRITICAL]** 스트리밍 rate-limit 전달 경로 설계 (Phase 실행 전
      필수)

  > **v1.2 이슈 #4**: 현재 `LlmFinishedEvent`/`LlmMessageEndEvent`에 rate-limit
  > 필드 없음. adapter가 SDK 응답에서 헤더를 추출해도 이벤트 스트림 프로토콜로
  > 전달할 수 없음.
  - **코드 검증 결과** (v1.2):
    - `LlmFinishedEvent`: `finishReason?` + `usage?` — rate-limit 필드 없음
    - `LlmMessageEndEvent`: `usage?` — rate-limit 필드 없음
    - `LlmGenerateResponse`: `id`, `content`, `model`, `stopReason`, `usage?`,
      `rawResponse?` — rate-limit 없음
    - Claude adapter: SDK `signal` 옵션만 전달, 헤더 접근 없음
    - OpenAI adapter: `stream_options: { include_usage: true }` 만 설정, 헤더
      접근 없음
    - 유일한 기존 rate-limit 전달: `LlmError.retryAfterMs` (에러 시에만)
  - **해결 방안 선택**:
    - **(A) LlmMessageEndEvent 확장**: `rateLimits?: RateLimitInfo` 필드 추가 →
      기존 이벤트 프로토콜 내 전달
      - 장점: 기존 스트림 파이프라인 활용, 일관된 데이터 흐름
      - 단점: providers/events.ts 인터페이스 변경, 모든 adapter 수정 필요
    - **(B) Out-of-band push**: adapter에서 직접 ProviderQuotaService에 push
      - 장점: 이벤트 인터페이스 변경 없음
      - 단점: adapter가 ProviderQuotaService에 의존 → DI 변경 필요
    - **권장**: 방안 (A) — 이벤트 중심 아키텍처 일관성 유지

- [ ] **[ANALYSIS-NEW]** ProviderQuotaService 설계 (Phase 실행 전 필수)

  > **v1.2 이슈 #3**: `providerQuotaService`가 코드베이스에 존재하지 않음.
  > `CommandContext`에도 없음 — `statsCommand.ts`는
  > `config.refreshUserQuota()`만 사용.
  - **설계 항목**:
    - 인터페이스:
      `ProviderQuotaService { update(provider, quota): void; getAll(): Record<string, ProviderQuota>; get(provider): ProviderQuota | undefined }`
    - 소유권: `packages/core/src/telemetry/` 또는 `packages/core/src/providers/`
    - Lifecycle: 세션 범위 singleton — `LoggingContentGenerator` 생성 시 주입
      또는 글로벌 인스턴스
    - 데이터 소스: adapter 이벤트 스트림의 `LlmMessageEndEvent.rateLimits` (방안
      A) 또는 adapter 직접 push (방안 B)
    - 소비자 연결: `CommandContext.services`에 추가 → `statsCommand`에서 접근
    - **기존 Gemini 쿼타와 분리**: `refreshUserQuota()`는 API 호출 기반,
      ProviderQuotaService는 응답 헤더 기반 → 다른 lifecycle

- [ ] **[ANALYSIS]** 렌더 경로 현황 분석
  - `packages/cli/src/ui/components/HistoryItemDisplay.tsx` (line 122)
    - 현재: `<StatsDisplay duration={...} quotas={...quotas} />` —
      `providerQuotas` 미전달
  - `packages/cli/src/ui/components/StatsDisplay.tsx`
    - `StatsDisplayProps`:
      `{ duration: string; title?: string; quotas?: RetrieveUserQuotaResponse }`
      — `providerQuotas` 없음
  - `packages/cli/src/ui/types.ts`
    - `HistoryItemStats`: `quotas?: RetrieveUserQuotaResponse` —
      `providerQuotas` 없음

- [ ] **[ANALYSIS]** openai-compatible 범위 확인

  > **v1.2 이슈 #8**: `OpenAiCompatibleAdapter extends OpenAiAdapter` —
  > rate-limit 처리 상속됨. 단, 커스텀 OpenAI-compatible 서버는 rate-limit
  > 헤더를 반환하지 않을 수 있음.
  - `packages/core/src/providers/openai-compatible/adapter.ts` (line 40-69)
    - `providerName = 'openai-compatible'`, `OpenAiAdapter` 상속
    - rate-limit 헤더 파싱 로직은 부모 클래스에서 상속 — **추가 구현 불필요**
    - 단, 헤더 없는 경우 `rateLimits: undefined` →
      `ProviderQuotaService.update()` 미호출 (null 가드)

- [ ] **[SCOPE-CHECK]** 2일 이내 완료 가능 범위 확인
  - 예상 총 소요: 2일
  - SDK 조사 결과 접근 불가 시: Phase 보류 (소요 0일)
  - 이번 Phase 완료 조건(DoD):
    1. Claude/OpenAI adapter가 rate-limit 헤더를 추출하여
       `LlmMessageEndEvent.rateLimits`에 포함 (방안 A 채택 시)
    2. **[#3-v1.2]** `ProviderQuotaService` 인터페이스 + 구현체가 core에서
       export됨
    3. **[#3-v1.2]** `CommandContext.services.providerQuotaService` 연결 완성
    4. `ProviderQuota` 인터페이스가 core에서 export됨
    5. `HistoryItemStats.providerQuotas` 필드 추가
    6. `StatsDisplayProps.providerQuotas` prop 추가
    7. `HistoryItemDisplay` → `StatsDisplay` prop 전달 완성
    8. 프로바이더별 쿼타 UI 렌더링
    9. **[#4-v1.2]** 스트리밍 경로에서 rate-limit 데이터가 UI까지 도달 확인
    10. **[#8-v1.2]** openai-compatible adapter가 rate-limit 처리를 상속하며,
        헤더 없는 경우 graceful 처리
    11. **[#2] 전체 데이터 경로 검증**: adapter → LlmMessageEndEvent.rateLimits
        → ProviderQuotaService.update → statsCommand → HistoryItemStats →
        HistoryItemDisplay → StatsDisplayProps → StatsDisplay render — 각 구간
        수동 추적 확인
    12. **[#2-v1.3]** `LoggingContentGenerator`(또는 대안 위치)에서
        MessageEnd.rateLimits → ProviderQuotaService.update() 호출이 구현됨
    13. **[#3-v1.3]** statsCommand에서 Gemini 쿼타는 항상 `refreshUserQuota()`
        호출 (providerName 조건 없음)
    14. **[#7-v1.3]** `slashCommandProcessor.ts`의 commandContext에
        ProviderQuotaService 인스턴스가 실제 주입됨
    15. **[#8-v1.3]** `LlmGenerateResponse`에 `rateLimits?` 필드 추가됨
        (비스트림 경로)

---

## 3.2 🔴 RED Phase: 실패 테스트 작성

### RED-1: adapter 헤더 수집 + LlmMessageEndEvent 확장

> **v1.2 이슈 #4**: 스트리밍 경로에서 rate-limit 전달 메커니즘이 없음. **방안
> (A)**: `LlmMessageEndEvent`에 `rateLimits?` 필드 추가 → adapter가 스트림 종료
> 시 포함.

- [ ] **[RED]** LlmMessageEndEvent에 rateLimits 필드 존재 테스트

  **파일**: `packages/core/src/providers/events.test.ts` (또는 관련 테스트)

  ```typescript
  describe('LlmMessageEndEvent rateLimits', () => {
    it('should accept optional rateLimits field', () => {
      const event: LlmMessageEndEvent = {
        type: LlmEventType.MessageEnd,
        usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
        rateLimits: {
          requestsLimit: 100,
          requestsRemaining: 50,
          tokensLimit: 100000,
          tokensRemaining: 80000,
          resetTime: new Date('2026-02-18T12:00:00Z'),
        },
      };
      expect(event.rateLimits).toBeDefined();
    });
  });
  ```

- [ ] **[RED]** Claude adapter가 rate-limit 헤더를 추출하여 MessageEnd에
      포함하는 테스트

  **파일**: `packages/core/src/providers/claude/adapter.test.ts`

  ```typescript
  describe('rate-limit header extraction', () => {
    it('should include rateLimits in MessageEnd event from response headers', async () => {
      // Arrange: mock SDK stream response with headers
      //   anthropic-ratelimit-requests-limit: 100
      //   anthropic-ratelimit-requests-remaining: 50
      // Act: consume adapter.generateContentStream()
      // Assert: MessageEnd event has rateLimits.requestsLimit === 100
    });

    it('should yield MessageEnd without rateLimits when headers absent', async () => {
      // Arrange: mock SDK response without rate-limit headers
      // Assert: MessageEnd event has rateLimits === undefined
    });
  });
  ```

- [ ] **[RED]** OpenAI adapter 동일 테스트

  **파일**: `packages/core/src/providers/openai/adapter.test.ts`

  ```typescript
  describe('rate-limit header extraction', () => {
    it('should include rateLimits in MessageEnd event from response headers', async () => {
      // Arrange: x-ratelimit-limit-requests, -remaining-requests headers
      // Assert: MessageEnd event has rateLimits
    });
  });
  ```

- [ ] **[RED]** openai-compatible adapter 상속 동작 테스트

  > **v1.2 이슈 #8**: openai-compatible은 OpenAiAdapter 상속 → rate-limit 처리
  > 자동 상속.

  **파일**: `packages/core/src/providers/openai-compatible/adapter.test.ts`

  ```typescript
  describe('rate-limit header extraction (inherited)', () => {
    it('should extract rate-limit headers like OpenAiAdapter', async () => {
      // OpenAiAdapter와 동일 동작 확인
    });

    it('should gracefully handle missing rate-limit headers', async () => {
      // 커스텀 서버에서 rate-limit 헤더 미반환 시 → rateLimits: undefined
    });
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### RED-2: ProviderQuota 타입

- [ ] **[RED]** ProviderQuota 인터페이스 존재 및 export 테스트

  > **v1.4 이슈 #1 수정**: flat 스키마 사용 — TASK-003 `ProviderQuota`
  > 인터페이스 및 `RateLimitInfo`와 일관.

  ```typescript
  import { ProviderQuota } from '@didim365/agent-cli-core';

  it('ProviderQuota should be importable from core', () => {
    const quota: ProviderQuota = {
      provider: 'claude',
      requestsLimit: 100,
      requestsRemaining: 50,
      tokensLimit: 100000,
      tokensRemaining: 80000,
      updatedAt: new Date(),
    };
    expect(quota.provider).toBe('claude');
    expect(quota.requestsRemaining).toBe(50);
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### RED-3: HistoryItemStats providerQuotas

- [ ] **[RED]** HistoryItemStats에 providerQuotas 필드 존재 테스트

  **파일**: `packages/cli/src/ui/types.test.ts` (또는 관련 테스트)

  > **v1.4 이슈 #1 수정**: flat 스키마 사용 — TASK-003 `ProviderQuota`
  > 인터페이스와 일관.

  ```typescript
  it('HistoryItemStats should accept providerQuotas field', () => {
    const stats: HistoryItemStats = {
      type: 'stats',
      duration: '5.2s',
      providerQuotas: {
        claude: {
          provider: 'claude',
          requestsLimit: 100,
          requestsRemaining: 50,
          updatedAt: new Date(),
        },
      },
    };
    expect(stats.providerQuotas).toBeDefined();
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### RED-4: StatsDisplay providerQuotas 렌더링

- [ ] **[RED]** StatsDisplay가 providerQuotas를 렌더링하는 테스트

  **파일**: `packages/cli/src/ui/components/StatsDisplay.test.tsx`

  ```typescript
  it('should render provider quota section when providerQuotas provided', () => {
    // Arrange: StatsDisplayProps with providerQuotas
    // Assert: Provider-specific quota information rendered
  });

  it('should not render provider quota section when providerQuotas is undefined', () => {
    // Arrange: StatsDisplayProps without providerQuotas
    // Assert: Only Gemini quota section (if quotas provided)
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

### RED-5: ProviderQuotaService + statsCommand 쿼타 분기

> **v1.2 이슈 #3**: `providerQuotaService`가 미존재. 신규 설계 필요.

- [ ] **[RED]** ProviderQuotaService 인터페이스 + 구현 테스트

  **파일**: `packages/core/src/telemetry/providerQuotaService.test.ts` (신규)

  ```typescript
  describe('ProviderQuotaService', () => {
    it('should store and retrieve quota for a provider', () => {
      const service = new ProviderQuotaService();
      service.update('claude', { requestsLimit: 100, requestsRemaining: 50 });
      expect(service.get('claude')?.requestsRemaining).toBe(50);
    });

    it('should update existing quota (latest value wins)', () => {
      const service = new ProviderQuotaService();
      service.update('claude', { requestsLimit: 100, requestsRemaining: 50 });
      service.update('claude', { requestsLimit: 100, requestsRemaining: 30 });
      expect(service.get('claude')?.requestsRemaining).toBe(30);
    });

    it('should return all provider quotas via getAll()', () => {
      const service = new ProviderQuotaService();
      service.update('claude', { requestsLimit: 100 });
      service.update('openai', { requestsLimit: 200 });
      const all = service.getAll();
      expect(Object.keys(all)).toEqual(['claude', 'openai']);
    });

    it('should return undefined for unknown provider', () => {
      const service = new ProviderQuotaService();
      expect(service.get('unknown')).toBeUndefined();
    });
  });
  ```

- [ ] **[RED]** statsCommand가 ProviderQuotaService를 사용하는 테스트

  **파일**: `packages/cli/src/ui/commands/statsCommand.test.ts`

  ```typescript
  it('should set quotas for gemini provider via refreshUserQuota()', () => {
    // provider = 'gemini' → statsItem.quotas = refreshUserQuota()
  });

  it('should set providerQuotas from providerQuotaService.getAll()', () => {
    // Arrange: mock providerQuotaService.getAll() → { claude: {...}, openai: {...} }
    // Assert: statsItem.providerQuotas 설정됨
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인

---

## 3.3 🟢 GREEN Phase: 최소 코드 구현

### TASK-000: LlmMessageEndEvent rateLimits 필드 추가

> **v1.2 이슈 #4 해결**: 스트리밍 경로에 rate-limit 전달 메커니즘 추가.

- [ ] **[TASK-000]** LlmMessageEndEvent + LlmGenerateResponse 인터페이스 확장
  - 파일: `packages/core/src/providers/events.ts`
  - 변경 (스트리밍):

    ```typescript
    export interface RateLimitInfo {
      requestsLimit?: number;
      requestsRemaining?: number;
      tokensLimit?: number;
      tokensRemaining?: number;
      resetTime?: Date;
    }

    export interface LlmMessageEndEvent extends LlmBaseEvent {
      type: typeof LlmEventType.MessageEnd;
      usage?: LlmTokenUsage;
      rateLimits?: RateLimitInfo; // 신규
    }
    ```

  - 파일: `packages/core/src/providers/types.ts`
  - 변경 (비스트리밍):
    > **v1.3 이슈 #8**: `LlmGenerateResponse`에도 `rateLimits?` 필드 추가 필요.
    > 현재:
    > `{ id: string, content, model, stopReason: LlmStopReason, usage?, rawResponse? }`
    > — rateLimits 없음. **v1.4 이슈 #2 주의**: 기존 필수 필드(`id: string`,
    > `stopReason: LlmStopReason`)의 타입을 변경하지 않음. `rateLimits?`
    > optional 필드만 추가 — 기존 타입 계약 보존.
    ```typescript
    export interface LlmGenerateResponse {
      id: string; // 기존 required — 변경 금지
      content: LlmContent[];
      model: string;
      stopReason: LlmStopReason; // 기존 required + enum — 변경 금지
      usage?: LlmTokenUsage;
      rateLimits?: RateLimitInfo; // 신규 — 비스트림 rate-limit 전달
      rawResponse?: unknown;
    }
    ```
  - 예상 소요: 20분

### TASK-001: Claude adapter 헤더 수집

- [ ] **[TASK-001]** Anthropic SDK 응답에서 rate-limit 헤더 추출 → MessageEnd에
      포함
  - 파일: `packages/core/src/providers/claude/adapter.ts`
  - 변경: `generateContentStream()`에서 마지막 MessageEnd 이벤트에 `rateLimits`
    포함
  - 헤더: `anthropic-ratelimit-requests-limit`, `-remaining`, `-reset`
  - 비스트림 `generateContent()`: `LlmGenerateResponse`에도 `rateLimits` 포함
    검토
  - 예상 소요: 1시간

### TASK-002: OpenAI adapter 헤더 수집

- [ ] **[TASK-002]** OpenAI SDK 응답에서 rate-limit 헤더 추출 → MessageEnd에
      포함
  - 파일: `packages/core/src/providers/openai/adapter.ts`
  - 변경: 동일 패턴
  - 헤더: `x-ratelimit-limit-requests`, `-remaining-requests`, `-reset-requests`
  - **[#8-v1.2]** openai-compatible는 자동 상속 — 헤더 없는 경우
    `rateLimits: undefined` (null 가드)
  - 예상 소요: 1시간

### TASK-003: ProviderQuota + ProviderQuotaService 구현

> **v1.2 이슈 #3 해결**: ProviderQuotaService 신규 설계 및 구현.

- [ ] **[TASK-003]** ProviderQuota 인터페이스 + ProviderQuotaService 클래스
      구현 + export
  - 파일: `packages/core/src/telemetry/types.ts` — ProviderQuota 인터페이스 정의
    ```typescript
    export interface ProviderQuota {
      provider: string;
      requestsLimit?: number;
      requestsRemaining?: number;
      tokensLimit?: number;
      tokensRemaining?: number;
      resetTime?: Date;
      updatedAt: Date; // 마지막 업데이트 시각
    }
    ```
  - 파일: `packages/core/src/telemetry/providerQuotaService.ts` (신규)

    ```typescript
    export class ProviderQuotaService {
      private quotas = new Map<string, ProviderQuota>();

      update(
        provider: string,
        quota: Omit<ProviderQuota, 'provider' | 'updatedAt'>,
      ): void {
        this.quotas.set(provider, {
          ...quota,
          provider,
          updatedAt: new Date(),
        });
      }

      get(provider: string): ProviderQuota | undefined {
        return this.quotas.get(provider);
      }

      getAll(): Record<string, ProviderQuota> {
        return Object.fromEntries(this.quotas);
      }
    }
    ```

  - 파일: `packages/core/src/index.ts` — export 추가
  - **Lifecycle**: 세션 범위 singleton — `LoggingContentGenerator` 또는 `Client`
    생성 시 주입
  - 예상 소요: 30분

### TASK-003A: MessageEnd.rateLimits → ProviderQuotaService 연결

> **v1.3 이슈 #2**: adapter가 `LlmMessageEndEvent.rateLimits`에 rate-limit
> 데이터를 포함해도, 이를 소비하여 `ProviderQuotaService.update()`를 호출하는
> 코드가 없으면 UI까지 도달 불가.

- [ ] **[TASK-003A]** MessageEnd 이벤트의 rateLimits를 ProviderQuotaService에
      전달하는 브릿지 구현
  - **호출 위치 (권장)**: `LoggingContentGenerator.llmLoggingStreamWrapper()` —
    이미 MessageEnd에서 usage를 수집하는 위치
    - 이유: core 레이어에서 처리하면 CLI/UI 레이어 의존 없이 동작. 기존 usage
      수집 패턴과 일관됨
    - 대안: `useGeminiStream.ts`의 `case LlmEventType.MessageEnd:` (현재
      `// Will add the missing logic later` 상태)
  - 파일: `packages/core/src/core/loggingContentGenerator.ts`
  - 변경:
    ```typescript
    // llmLoggingStreamWrapper 내 MessageEnd 처리 시:
    if (event.type === LlmEventType.MessageEnd) {
      lastUsage = event.usage;
      // v1.3: rate-limit → ProviderQuotaService 전달
      if (event.rateLimits && this.providerQuotaService) {
        this.providerQuotaService.update(
          this.wrapped.providerName ?? 'unknown',
          event.rateLimits,
        );
      }
    }
    ```
  - **비스트림 경로**: `llmGenerateContent()`에서도 동일 처리
    ```typescript
    // generateContent 성공 후:
    if (response.rateLimits && this.providerQuotaService) {
      this.providerQuotaService.update(
        this.wrapped.providerName ?? 'unknown',
        response.rateLimits,
      );
    }
    ```
  - **DI**: `LoggingContentGenerator` 생성자에
    `providerQuotaService?: ProviderQuotaService` optional 파라미터 추가
  - 예상 소요: 30분

### TASK-004: HistoryItemStats 타입 확장

- [ ] **[TASK-004]** providerQuotas 필드 추가
  - 파일: `packages/cli/src/ui/types.ts`
  - 변경: `providerQuotas?: Record<string, ProviderQuota>` 추가
  - 예상 소요: 10분

### TASK-005: StatsDisplayProps 확장 + 렌더링

- [ ] **[TASK-005]** providerQuotas prop 추가 및 렌더 분기
  - 파일: `packages/cli/src/ui/components/StatsDisplay.tsx`
  - 변경:
    - `StatsDisplayProps`에 `providerQuotas?: Record<string, ProviderQuota>`
      추가
    - Gemini: 기존 `quotas` 섹션 유지
    - Non-Gemini: `providerQuotas` 기반 새 섹션 렌더링
  - 예상 소요: 1시간

### TASK-006: HistoryItemDisplay prop 전달

- [ ] **[TASK-006]** providerQuotas를 StatsDisplay에 전달
  - 파일: `packages/cli/src/ui/components/HistoryItemDisplay.tsx`
  - 변경:
    ```typescript
    <StatsDisplay
      duration={item.duration}
      quotas={item.quotas}
      providerQuotas={item.providerQuotas}
    />
    ```
  - 예상 소요: 10분

### TASK-007: CommandContext 확장 + statsCommand 쿼타 분기

> **v1.2 이슈 #3 해결**: `CommandContext.services`에 `providerQuotaService`
> 추가.

- [ ] **[TASK-007]** CommandContext.services 확장 + 주입 + statsCommand 분기
      구현

  > **v1.3 이슈 #3**: 기존 `statsCommand.ts`에 `providerName` 변수가 존재하지
  > 않음. Gemini 쿼타는 항상 서버 API로 fetch (기존 동작 유지), Non-Gemini는
  > ProviderQuotaService에서 조회. **v1.3 이슈 #7**: `CommandContext`에 타입만
  > 추가하면 런타임 값이 undefined. `slashCommandProcessor.ts`의
  > `commandContext` useMemo에 실제 인스턴스 주입 필요.
  - 파일: `packages/cli/src/ui/commands/types.ts`
  - 변경: `CommandContext.services`에
    `providerQuotaService?: ProviderQuotaService` 추가

  - 파일: `packages/cli/src/ui/hooks/slashCommandProcessor.ts`
  - 변경 (주입 포인트):

    > **v1.3 이슈 #7 해결**: slashCommandProcessor.ts:205의 `commandContext`
    > useMemo에 실제 인스턴스 주입

    ```typescript
    // slashCommandProcessor.ts — commandContext useMemo (line ~205)
    const commandContext = useMemo(
      () => ({
        services: {
          config,
          settings,
          git: gitService,
          logger,
          providerQuotaService, // ← 신규 주입 (props 또는 context에서 전달)
        },
      }),
      [config, settings, gitService, logger, providerQuotaService],
    );
    ```
    - **providerQuotaService 전달 경로**: `LoggingContentGenerator` 생성 시 동일
      인스턴스 → React context 또는 props로 CLI 레이어까지 전달
    - 대안: `useGeminiStream` hook 내부에서 세션 범위 singleton 생성 후
      commandContext에 주입

  - 파일: `packages/cli/src/ui/commands/statsCommand.ts`
  - 변경:

    > **v1.3 이슈 #3 해결**: `providerName` 조건 제거 → Gemini 쿼타는 항상
    > fetch, Non-Gemini는 ProviderQuotaService.

    ```typescript
    // Gemini 쿼타: 항상 서버 API 호출 (기존 동작 유지 — providerName 조건 불필요)
    statsItem.quotas = await config.refreshUserQuota();

    // Non-Gemini 쿼타: 응답 헤더 기반 ProviderQuotaService
    const providerQuotaService = context.services.providerQuotaService;
    if (providerQuotaService) {
      statsItem.providerQuotas = providerQuotaService.getAll();
    }
    ```

  - 예상 소요: 45분

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/providers/claude/adapter.test.ts --run
  npm test -w @didim365/agent-cli-core -- src/providers/openai/adapter.test.ts --run
  npm test -w @didim365/agent-cli -- --run
  ```

---

## 3.4 🔵 REFACTOR Phase: 코드 개선

### 3.4.1 구조 개선 (Make it right)

- [ ] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - adapter 헤더 추출 로직을 공통 유틸리티로 추출 (Claude/OpenAI 헤더 파싱 패턴
    유사)
  - `ProviderQuotaService` 클래스 분리 검토 (현재 statsCommand에 인라인이면)
  - 쿼타 표시 컴포넌트를 `GeminiQuotaSection` / `ProviderQuotaSection` 으로 분리

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인

---

## 3.5 사후 작업 (Post-Work)

- [ ] **[TEST]** 전체 테스트 실행

  ```bash
  npm run test
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
  - 확인 항목 1: Claude 사용 시 rate-limit 쿼타 표시
  - 확인 항목 2: OpenAI 사용 시 rate-limit 쿼타 표시
  - 확인 항목 3: Gemini 기존 쿼타 정상 동작 (regression)
  - 확인 항목 4: `providerQuotas` 렌더 경로 완전성 (HistoryItemDisplay →
    StatsDisplay)
  - 확인 항목 5: 쿼타 없는 프로바이더(didim, 커스텀 openai-compatible 서버) 시
    쿼타 섹션 미표시
  - **확인 항목 6 [#4-v1.2]**: 스트리밍 경로에서 rate-limit이
    `LlmMessageEndEvent.rateLimits` → `ProviderQuotaService.update()` 경유로
    전달됨
  - **확인 항목 7 [#8-v1.2]**: openai-compatible adapter가 OpenAI rate-limit
    처리를 상속하며, 헤더 미반환 시 graceful 동작
  - **확인 항목 8 [#2]**: 전체 데이터 경로 수동 추적 — adapter response headers
    → LlmMessageEndEvent.rateLimits → ProviderQuotaService.update → statsCommand
    → HistoryItemStats → HistoryItemDisplay → StatsDisplay. 각 구간 데이터 유실
    없음

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase3_QuotaIntegration_{작업일자}.md`

- [ ] **[COMMIT]** 변경사항 커밋

  > **v1.4 이슈 #6 수정**: TASK 전체 범위 반영 — 누락 파일 추가.

  ```bash
  git add packages/core/src/providers/events.ts \
         packages/core/src/providers/types.ts \
         packages/core/src/providers/claude/adapter.ts \
         packages/core/src/providers/openai/adapter.ts \
         packages/core/src/telemetry/types.ts \
         packages/core/src/telemetry/providerQuotaService.ts \
         packages/core/src/core/loggingContentGenerator.ts \
         packages/core/src/index.ts \
         packages/cli/src/ui/types.ts \
         packages/cli/src/ui/commands/types.ts \
         packages/cli/src/ui/commands/statsCommand.ts \
         packages/cli/src/ui/hooks/slashCommandProcessor.ts \
         packages/cli/src/ui/components/StatsDisplay.tsx \
         packages/cli/src/ui/components/HistoryItemDisplay.tsx
  git commit -m "feat(stats): 프로바이더별 쿼타 통합 (Phase 3)"
  ```

---

## ⚠️ 주의사항

> **v1.2 리뷰 반영**: 이슈 #3 (ProviderQuotaService 설계), #4 (스트리밍
> rate-limit 경로), #8 (openai-compatible 범위) 적용 **v1.3 리뷰 반영**: 이슈 #2
> (MessageEnd→ProviderQuotaService 브릿지), #3 (providerName 미존재), #7
> (CommandContext 인스턴스 주입), #8 (LlmGenerateResponse rateLimits) 적용

1. **SDK 사전 조사 필수**: TASK-001/002 착수 전 반드시 SDK d.ts에서 헤더 접근
   가능성 확인
2. **접근 불가 시 보류**: adapter 헤더 수집이 불가하면 Phase 3 전체를 보류하고
   Phase 4로 진행
3. **[#4-v1.2] LlmMessageEndEvent + LlmGenerateResponse 확장**:
   스트리밍(`LlmMessageEndEvent`)과 비스트리밍(`LlmGenerateResponse`) 모두
   `rateLimits?` 필드 추가. 기존 consumer가 `rateLimits` 필드를 무시하는지 확인
   필수 (optional이므로 안전)
4. **[#3-v1.2] ProviderQuotaService lifecycle**: 세션 범위 singleton.
   `LoggingContentGenerator` 생성 시 주입 (TASK-003A DI).
   `CommandContext.services`에 연결하여 `statsCommand`에서 접근
5. **[#8-v1.2] openai-compatible 상속**: `OpenAiCompatibleAdapter`는
   `OpenAiAdapter` 상속 → rate-limit 처리 자동 상속. 커스텀 서버가 rate-limit
   헤더를 반환하지 않을 수 있으므로 `rateLimits: undefined` 시 graceful 처리
   (null 가드)
6. **렌더 경로 완전성**: `HistoryItemStats` → `HistoryItemDisplay` →
   `StatsDisplayProps` → `StatsDisplay` 전체 경로 동시 수정
7. **하위 호환**: `HistoryItemStats.quotas`는 기존 필드 유지, `providerQuotas`를
   병행 (기존 Gemini 경로 보존)
8. **export 경로**: `ProviderQuota` + `ProviderQuotaService`를 `telemetry/`
   하위에 정의하여 기존 core index export 경로 활용
9. **[#2-v1.3] MessageEnd→ProviderQuotaService 브릿지 필수**: TASK-003A에서
   `LoggingContentGenerator.llmLoggingStreamWrapper()` 내에 `event.rateLimits` →
   `ProviderQuotaService.update()` 호출 구현. 비스트림
   경로(`llmGenerateContent`)도 동일 처리
10. **[#3-v1.3] statsCommand에 providerName 없음**: Gemini 쿼타는 항상
    `refreshUserQuota()` 호출 (조건 없음). Non-Gemini는
    `ProviderQuotaService.getAll()`로 조회
11. **[#7-v1.3] CommandContext 인스턴스 주입**: `slashCommandProcessor.ts`의
    `commandContext` useMemo에 `providerQuotaService` 실제 인스턴스 주입 필수.
    타입만 추가하면 런타임 undefined

---

**작성일**: 2026-02-18 **작성자**: AI Assistant **상태**: ⬜ 작성 중
