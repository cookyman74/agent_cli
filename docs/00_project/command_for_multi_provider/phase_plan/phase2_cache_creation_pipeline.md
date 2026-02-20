# Phase 2: cacheCreation 토큰 파이프라인 전 구간 수정

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) - TDD 방법론
> - [원본 수정방안 §3.2](../stats_MultiProviderSupport_plan_20260218.md) - Phase
>   2 상세
> - [메인 계획서](./00_main_plan.md)
>
> **작업 분할 규칙**: 최대 2일 이내 완료

---

## 📋 작업 개요

| 항목        | 내용                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------- |
| Phase       | Phase 2 (권장)                                                                                              |
| 목표        | `LlmTokenUsage.cacheCreationTokens` → `GenAIUsageDetails` → `ModelMetrics` → UI 전 구간 파이프라인 완성     |
| 영향 범위   | `telemetry/types.ts`, `telemetryBridge.ts`, `uiTelemetry.ts`, `SessionContext.tsx`, `ModelStatsDisplay.tsx` |
| 위험 수준   | 🟡 Medium (타입 확장 중심, 기존 필드 변경 없음)                                                             |
| 성능 민감도 | 🟢 Low                                                                                                      |
| 선행 Phase  | Phase 1 (`provider::model` 복합 키 + provider 필드 + UI 그룹핑)                                             |
| 예상 소요   | 1~1.5일                                                                                                     |

### 핵심 문제

`LlmTokenUsage.cacheCreationTokens`는 이미 존재하지만 (주로 Claude), 텔레메트리
파이프라인의 중간 단계들에서 매핑이 누락되어 UI까지 도달하지 않는다.

```
LlmTokenUsage.cacheCreationTokens
    → ❌ TelemetryUsageMetadata (누락)
    → ❌ GenAIUsageDetails (누락)
    → ❌ telemetryBridge 매핑 (누락)
    → ❌ ModelMetrics.tokens.cacheCreation (누락)
    → ❌ ModelStatsDisplay UI (누락)
```

---

## 🚨 핵심 리스크

| 리스크                                                             | 영향      | 대응 방안                                                                                              | 상태 |
| ------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------------------------------ | ---- |
| 기존 GenAIUsageDetails 필드 순서/호환                              | 🟡 Low    | optional 필드로 추가, 기존 값 영향 없음                                                                | ✅   |
| `areModelMetricsEqual` cacheCreation 누락 → 리렌더                 | 🟡 Medium | Phase 2에서 반드시 동시 추가                                                                           | ✅   |
| cacheCreation 값이 0인 프로바이더에서 불필요한 UI 행               | 🟢 Low    | 조건부 행 표시 (`hasCacheCreation` 체크)                                                               | ✅   |
| **[v1.4 #5] GenAIUsageDetails 필수 필드 추가 시 하류 컴파일 에러** | 🟠 Medium | `ApiResponseEvent` 생성자 + `telemetryBridge.test.ts` 테스트 데이터도 동시 갱신 필수 (TASK-001에 포함) | ✅   |

---

## 2.1 사전 작업 (Pre-Work)

- [x] **[REVIEW]** Phase 1 작업 결과서 검토
  - 파일: `../working_history/Phase1_ProviderRecognition_20260220.md`
  - 확인: 체크리스트 완료, 미해결 이슈

- [x] **[CONTEXT]** Phase 2 작업 목적 확인
  - Claude 프로바이더의 `cacheCreationTokens`가 전체 파이프라인을 통해 UI에
    표시되도록 함
  - Gemini/OpenAI 등 미지원 프로바이더는 0으로 유지 → UI에서 자동 숨김

- [x] **[ANALYSIS]** 현재 코드 분석
  - `packages/core/src/providers/types.ts`
    - `LlmTokenUsage` (line 179): `cacheCreationTokens?: number` (line 185) — ✅
      존재
  - `packages/core/src/telemetry/types.ts`
    - `TelemetryUsageMetadata` (line 19): `cacheCreationTokenCount` — ❌ 없음
    - `GenAIUsageDetails` (line 569): `cache_creation_token_count` — ❌ 없음
  - `packages/core/src/providers/telemetryBridge.ts`
    - `llmTokenUsageToGenAIUsage()` (line 26-37): cacheCreation 매핑 — ❌ 없음
    - `genAIUsageToLlmTokenUsage()`: 역방향도 확인
  - `packages/core/src/telemetry/uiTelemetry.ts`
    - `ModelMetrics.tokens`: `cacheCreation` — ❌ 없음 (Phase 1에서 provider
      필드만 추가됨)
    - `processApiResponse()`: cacheCreation 집계 — ❌ 없음
  - `packages/cli/src/ui/contexts/SessionContext.tsx`
    - `areModelMetricsEqual()`: cacheCreation 비교 — ❌ 없음
  - `packages/cli/src/ui/components/ModelStatsDisplay.tsx`
    - cacheCreation 행 — ❌ 없음

- [x] **[SCOPE-CHECK]** 2일 이내 완료 가능 범위 확인
  - 예상 총 소요: 1~1.5일
  - 이번 Phase 완료 조건(DoD):
    1. `GenAIUsageDetails.cache_creation_token_count` 필드 추가
    2. `TelemetryUsageMetadata.cacheCreationTokenCount` 필드 추가
    3. `llmTokenUsageToGenAIUsage()` cacheCreation 매핑 동작
    4. `ModelMetrics.tokens.cacheCreation` 값 정상 집계
    5. `areModelMetricsEqual()`에 cacheCreation 포함
    6. `ModelStatsDisplay`에 조건부 행 표시 (값 > 0일 때만)

---

## 2.2 🔴 RED Phase: 실패 테스트 작성

### RED-1: GenAIUsageDetails cacheCreation 필드

- [x] **[RED]** GenAIUsageDetails에 cache_creation_token_count 포함 테스트

  **파일**: `packages/core/src/telemetry/types.test.ts` (또는 관련 테스트)

  ```typescript
  it('GenAIUsageDetails should include cache_creation_token_count', () => {
    const usage: GenAIUsageDetails = {
      input_token_count: 100,
      output_token_count: 50,
      cached_content_token_count: 20,
      cache_creation_token_count: 30, // 신규
      thoughts_token_count: 0,
      tool_token_count: 0,
      total_token_count: 150,
    };
    expect(usage.cache_creation_token_count).toBe(30);
  });
  ```

- [x] **[RED-VERIFY]** 테스트 실패 확인

### RED-2: telemetryBridge cacheCreation 매핑

- [x] **[RED]** llmTokenUsageToGenAIUsage가 cacheCreation을 매핑하는 테스트

  **파일**: `packages/core/src/providers/telemetryBridge.test.ts`

  ```typescript
  describe('llmTokenUsageToGenAIUsage cacheCreation', () => {
    it('should map cacheCreationTokens to cache_creation_token_count', () => {
      const usage: LlmTokenUsage = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cacheCreationTokens: 30,
      };
      const result = llmTokenUsageToGenAIUsage(usage);
      expect(result.cache_creation_token_count).toBe(30);
    });

    it('should default cache_creation_token_count to 0 when undefined', () => {
      const usage: LlmTokenUsage = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      };
      const result = llmTokenUsageToGenAIUsage(usage);
      expect(result.cache_creation_token_count).toBe(0);
    });
  });
  ```

- [x] **[RED-VERIFY]** 테스트 실패 확인

### RED-3: 역방향 매핑

- [x] **[RED]** genAIUsageToLlmTokenUsage가 cache_creation을 역매핑하는 테스트

  ```typescript
  it('should map cache_creation_token_count back to cacheCreationTokens', () => {
    const genAI: GenAIUsageDetails = { ..., cache_creation_token_count: 30 };
    const result = genAIUsageToLlmTokenUsage(genAI);
    expect(result.cacheCreationTokens).toBe(30);
  });
  ```

- [x] **[RED-VERIFY]** 테스트 실패 확인

### RED-4: ModelMetrics cacheCreation 집계

- [x] **[RED]** processApiResponse가 cacheCreation을 집계하는 테스트

  **파일**: `packages/core/src/telemetry/uiTelemetry.test.ts`

  ```typescript
  describe('processApiResponse cacheCreation', () => {
    it('should accumulate cache_creation_token_count in ModelMetrics', () => {
      // Arrange: event with usage.cache_creation_token_count = 30
      // Act: service.addEvent(event)
      // Assert: metrics.tokens.cacheCreation === 30
    });

    it('should default cacheCreation to 0 when field missing', () => {
      // Arrange: event without cache_creation_token_count
      // Act: service.addEvent(event)
      // Assert: metrics.tokens.cacheCreation === 0
    });
  });
  ```

- [x] **[RED-VERIFY]** 테스트 실패 확인

### RED-5: areModelMetricsEqual cacheCreation 비교

> **v1.4 이슈 #4 수정**: `areModelMetricsEqual()`은 모듈 스코프 비공개 함수
> (export 없음). v1.2에서 Phase 1 RED-4를 행위 기반으로 전환한 것과 동일하게,
> 행위 기반 테스트 사용. **접근법**: SessionContext가 metrics 변경을 감지하여
> 리렌더하는지 검증.

- [x] **[RED]** cacheCreation 변경이 SessionContext 리렌더를 트리거하는 테스트

  **파일**: `packages/cli/src/ui/contexts/SessionContext.test.tsx`

  ```typescript
  describe('areModelMetricsEqual cacheCreation (behavior-based)', () => {
    it('should trigger re-render when cacheCreation changes in metrics', () => {
      // Approach: SessionContext의 useMemo/useRef가 areModelMetricsEqual로 deep compare
      // cacheCreation만 변경된 metrics를 전달하면 리렌더가 발생해야 함
      // 방법 1: render count 비교
      // 방법 2: snapshot diff 확인
    });

    it('should not trigger re-render when cacheCreation is unchanged', () => {
      // 동일 cacheCreation → 리렌더 미발생 확인
    });
  });
  ```

  > **대안**: `areModelMetricsEqual`을 export하여 직접 테스트하는 것도 가능
  > (리팩터링 시 결정)

- [x] **[RED-VERIFY]** 테스트 실패 확인

### RED-6: ModelStatsDisplay cacheCreation 조건부 행

- [x] **[RED]** cacheCreation > 0일 때 행 렌더, 0일 때 미렌더 테스트

  **파일**: `packages/cli/src/ui/components/ModelStatsDisplay.test.tsx`

  ```typescript
  it('should render Cache Creation row when any model has cacheCreation > 0', () => {
    // Arrange: models with cacheCreation: 30
    // Assert: 'Cache Creation' 행 렌더됨
  });

  it('should not render Cache Creation row when all models have cacheCreation = 0', () => {
    // Arrange: models with cacheCreation: 0
    // Assert: 'Cache Creation' 행 미렌더
  });
  ```

- [x] **[RED-VERIFY]** 테스트 실패 확인

---

## 2.3 🟢 GREEN Phase: 최소 코드 구현

### TASK-001: GenAIUsageDetails 확장 + ApiResponseEvent 생성자 갱신

> **v1.4 이슈 #5 수정**: `GenAIUsageDetails`에 필수 필드 추가 시, 이
> 인터페이스를 인라인 생성하는 `ApiResponseEvent` 생성자 (types.ts:638-644)도
> 반드시 동시 갱신해야 컴파일 에러 방지. `telemetryBridge.test.ts`의
> `GenAIUsageDetails` 직접 생성 테스트 데이터도 갱신 필요.

- [x] **[TASK-001]** cache_creation_token_count 필드 추가 + 하류 생성 사이트
      갱신
  - 파일: `packages/core/src/telemetry/types.ts`
  - 변경 (1) — GenAIUsageDetails 인터페이스:
    ```typescript
    export interface GenAIUsageDetails {
      input_token_count: number;
      output_token_count: number;
      cached_content_token_count: number;
      cache_creation_token_count: number; // 신규 — 필수 필드
      thoughts_token_count: number;
      tool_token_count: number;
      total_token_count: number;
    }
    ```
  - 변경 (2) — ApiResponseEvent 생성자 (types.ts ~line 638):
    ```typescript
    this.usage = {
      input_token_count: usage_data?.promptTokenCount ?? 0,
      output_token_count: usage_data?.candidatesTokenCount ?? 0,
      cached_content_token_count: usage_data?.cachedContentTokenCount ?? 0,
      cache_creation_token_count: usage_data?.cacheCreationTokenCount ?? 0, // 신규
      thoughts_token_count: usage_data?.thoughtsTokenCount ?? 0,
      tool_token_count: usage_data?.toolUsePromptTokenCount ?? 0,
      total_token_count: usage_data?.totalTokenCount ?? 0,
    };
    ```
  - 변경 (3) — 기존 테스트 데이터 갱신:
    - `telemetryBridge.test.ts`: `GenAIUsageDetails` 직접 생성하는 테스트에
      `cache_creation_token_count: 0` 추가
    - `types.test.ts` (있을 경우): 동일 처리
  - 예상 소요: 15분

### TASK-002: TelemetryUsageMetadata 확장

- [x] **[TASK-002]** cacheCreationTokenCount 필드 추가
  - 파일: `packages/core/src/telemetry/types.ts`
  - 변경: `cacheCreationTokenCount?: number;` 추가
  - 예상 소요: 5분

### TASK-003: telemetryBridge 매핑 추가

- [x] **[TASK-003]** 정방향 + 역방향 cacheCreation 매핑
  - 파일: `packages/core/src/providers/telemetryBridge.ts`
  - 변경:
    - `llmTokenUsageToGenAIUsage`:
      `cache_creation_token_count: usage.cacheCreationTokens ?? 0`
    - `genAIUsageToLlmTokenUsage`:
      `cacheCreationTokens: usage.cache_creation_token_count ?? 0`
  - 예상 소요: 15분

### TASK-004: ModelMetrics.tokens.cacheCreation 추가

- [x] **[TASK-004]** ModelMetrics 타입 + 초기값 + 집계 로직
  - 파일: `packages/core/src/telemetry/uiTelemetry.ts`
  - 변경:
    - `tokens.cacheCreation: number` 추가
    - `createInitialModelMetrics()`: `cacheCreation: 0`
    - `processApiResponse()`:
      `modelMetrics.tokens.cacheCreation += event.usage.cache_creation_token_count ?? 0`
  - 예상 소요: 20분

### TASK-005: areModelMetricsEqual cacheCreation 추가

- [x] **[TASK-005]** equality 함수에 cacheCreation 비교 추가
  - 파일: `packages/cli/src/ui/contexts/SessionContext.tsx`
  - 변경: `a.tokens.cacheCreation !== b.tokens.cacheCreation` 추가
  - 예상 소요: 5분

### TASK-006: ModelStatsDisplay cacheCreation 행 추가

- [x] **[TASK-006]** 조건부 행 렌더링
  - 파일: `packages/cli/src/ui/components/ModelStatsDisplay.tsx`
  - 변경:
    ```typescript
    const hasCacheCreation = models.some(m => m.tokens.cacheCreation > 0);
    {hasCacheCreation && (
      <Row label="Cache Creation">
        {models.map(m => formatTokenCount(m.tokens.cacheCreation))}
      </Row>
    )}
    ```
  - 예상 소요: 30분

- [x] **[GREEN-VERIFY]** 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/telemetry/ --run
  npm test -w @didim365/agent-cli-core -- src/providers/telemetryBridge.test.ts --run
  npm test -w @didim365/agent-cli -- --run
  ```

---

## 2.4 🔵 REFACTOR Phase: 코드 개선

### 2.4.1 구조 개선 (Make it right)

- [x] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - `llmTokenUsageToGenAIUsage` / `genAIUsageToLlmTokenUsage` 매핑 필드 순서
    일관성 확인
  - `processApiResponse`의 토큰 집계 로직이 필드 수 증가로 가독성 떨어지면
    helper 추출
  - `hasCacheCreation` 계산을 useMemo 등으로 최적화 필요성 검토

- [x] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인

---

## 2.5 사후 작업 (Post-Work)

- [x] **[TEST]** 전체 테스트 실행

  ```bash
  npm run test
  ```

- [x] **[TYPECHECK]** 타입체크

  ```bash
  npm run typecheck
  ```

- [x] **[LINT]** 린터 검사

  ```bash
  npm run lint
  ```

- [x] **[VERIFY]** 기능 검증
  - 확인 항목 1: Claude 사용 시 cacheCreation 행 표시
  - 확인 항목 2: Gemini/OpenAI만 사용 시 cacheCreation 행 미표시
  - 확인 항목 3: telemetryBridge 정방향/역방향 매핑 일관성

- [x] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase2_CacheCreation_{작업일자}.md`

- [x] **[COMMIT]** 변경사항 커밋
  ```bash
  git add packages/core/src/telemetry/types.ts \
         packages/core/src/providers/telemetryBridge.ts \
         packages/core/src/telemetry/uiTelemetry.ts \
         packages/cli/src/ui/contexts/SessionContext.tsx \
         packages/cli/src/ui/components/ModelStatsDisplay.tsx
  git commit -m "feat(telemetry): cacheCreation 토큰 파이프라인 전 구간 수정 (Phase 2)"
  ```

---

## ⚠️ 주의사항

1. **필드 추가만**: 기존 필드 변경 없이 신규 필드만 추가 — regression 위험 최소
2. **Optional → 0 기본값**: `cacheCreationTokens ?? 0` 패턴 — undefined 안전
   처리
3. **조건부 UI**: `hasCacheCreation` 체크 — 불필요한 행 미표시로 기존 UX 유지
4. **areModelMetricsEqual 동시 갱신**: cacheCreation 추가와 equality 갱신을
   반드시 같은 Phase에서 처리
5. **[v1.4 #5] 필수 필드 하류 갱신**:
   `GenAIUsageDetails.cache_creation_token_count: number`는 필수 필드.
   `ApiResponseEvent` 생성자(types.ts ~line 638)에서 인라인 생성하므로 반드시
   동시 갱신. `telemetryBridge.test.ts` 테스트 데이터에도 추가 필요
6. **[v1.4 #4] areModelMetricsEqual 행위 기반 테스트**: RED-5는 비공개 함수 직접
   호출 불가 → SessionContext 리렌더 감지로 검증

---

**작성일**: 2026-02-18 **최종 수정일**: 2026-02-20 **작성자**: AI Assistant
**상태**: ✅ 완료
