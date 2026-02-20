# Phase 1: 프로바이더 인식 기반 구축 + UI 그룹핑

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) - TDD 방법론
> - [원본 수정방안 §3.1](../stats_MultiProviderSupport_plan_20260218.md) - Phase
>   1 상세
> - [메인 계획서](./00_main_plan.md)
>
> **작업 분할 규칙**: 최대 2일 이내 완료

---

## 📋 작업 개요

| 항목        | 내용                                                                                                                   |
| ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| Phase       | Phase 1 (필수)                                                                                                         |
| 목표        | `provider::model` 복합 키 전환, ModelMetrics `provider` 필드 추가, UI 프로바이더 그룹핑, VALID_GEMINI_MODELS 의존 제거 |
| 영향 범위   | `uiTelemetry.ts`, `StatsDisplay.tsx`, `ModelStatsDisplay.tsx`, `SessionContext.tsx`                                    |
| 위험 수준   | 🟠 High (데이터 구조 변경 + UI 레이아웃 변경)                                                                          |
| 성능 민감도 | 🟢 Low                                                                                                                 |
| 선행 Phase  | Phase 0 (Non-Gemini 텔레메트리 수집)                                                                                   |
| 예상 소요   | 1.5~2일                                                                                                                |

---

## 🚨 핵심 리스크

| 리스크                                                  | 영향        | 대응 방안                                                                                                                                                                                                                        | 상태 |
| ------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **[#1-v1.2] Plain model key 충돌 위험**                 | 🔴 Critical | **`{provider}::{model}` 복합 키 재도입**: JSON-safe `::` 구분자 사용. `openai-compatible`의 `freeformInput: true`로 동일 모델명 충돌 가능 확인 → 복합 키로 해결. 레거시 데이터(`::`없음)는 `gemini` 기본값으로 안전 파싱         | ✅   |
| **[#2-v1.2] processApiError에 provider 미설정**         | 🟠 Medium   | `processApiError`에도 `processApiResponse`와 동일한 provider 추출 로직 적용. 에러 전용 모델도 `provider` 필드 포함 필수                                                                                                          | ✅   |
| **[#5] 런타임 provider 추론 폐기**                      | 🟠 Medium   | **런타임 폴백 폐기**: 모델명으로부터 provider를 추론하지 않음 → Phase 0에서 event에 명시적 provider 포함. 단, **영속화된 레거시 키 파싱**(`::` 미포함)은 `gemini` 기본값으로 안전 처리 (다른 개념). Phase 0+1 동시 배포 (atomic) | ✅   |
| **[#5-v1.2] VALID_GEMINI_MODELS 버킷 노이즈**           | 🟠 Medium   | `VALID_GEMINI_MODELS` 제거 후 `provider === 'gemini'` 필터만 적용 시 모든 Gemini 쿼타 버킷 표시 위험. **`PROVIDER_MODEL_REGISTRY.gemini.models`를 대체 allowlist로 사용** → 등록된 Gemini 모델만 quota-only 행 표시              | ✅   |
| **[#6] VALID_GEMINI_MODELS 제거 시 quota-only 행 소실** | 🟠 Medium   | **provider 기반 필터 + `PROVIDER_MODEL_REGISTRY` 모델 목록 매칭**: 쿼타 버킷 중 `PROVIDER_MODEL_REGISTRY.gemini.models`에 등록된 모델만 quota-only 행으로 표시                                                                   | ✅   |
| **[#7-v1.2] 비공개 함수 직접 테스트**                   | 🟡 Low      | `createInitialModelMetrics`/`areModelMetricsEqual`은 비공개 → **행위 기반 테스트**: `UiTelemetryService.addEvent()` + `getMetrics()`로 외부 API 경유 검증. 리팩터링 내성 향상                                                    | ✅   |
| `areModelMetricsEqual()` 필드 누락 → 무한 리렌더        | 🟠 Medium   | provider 추가와 동시에 equality 함수 갱신                                                                                                                                                                                        | ✅   |
| 단일 프로바이더 시 Provider 컬럼 불필요                 | 🟡 Low      | 사용 프로바이더 수 감지 → 조건부 컬럼 렌더링                                                                                                                                                                                     | ✅   |

---

## 1.1 사전 작업 (Pre-Work)

- [x] **[REVIEW]** Phase 0 작업 결과서 검토
  - 파일: `../working_history/Phase0_TelemetryCollection_{작업일자}.md`
  - 확인: 체크리스트 완료 여부, 미해결 이슈 확인

- [x] **[CONTEXT]** Phase 1 작업 목적 확인
  - Phase 0에서 수집이 시작된 Non-Gemini 데이터를 UI에 프로바이더별로 그룹핑하여
    표시
  - **[#1-v1.2] `{provider}::{model}` 복합 키 재도입**: v1.1에서 plain key로
    결정했으나, `openai-compatible`의 `freeformInput: true` (어떤 모델명도
    가능)로 인해 동일 모델명 충돌 위험 확인됨 → JSON-safe `::` 구분자 사용하여
    복합 키 재도입
    - 키 형식: `gemini::gemini-2.5-pro`, `claude::claude-sonnet-4`,
      `openai::gpt-5.2`
    - 레거시 호환: `::` 미포함 키는 `gemini` 프로바이더로 안전 파싱
      (pre-multi-provider 데이터)
    - JSON 출력: `stats.models` 키가 `provider::model` 형식으로 변경됨
      (JSON-safe)
  - `ModelMetrics.provider` 필드도 유지 — 그룹핑 연산에 활용

- [x] **[ANALYSIS]** 현재 코드 분석
  - `packages/core/src/telemetry/uiTelemetry.ts`
    - `ModelMetrics` 인터페이스 (line 39-54): provider 필드 없음
    - `SessionMetrics.models` (line 57): `Record<string, ModelMetrics>` — 모델명
      단일 키 (plain string)
    - `getOrCreateModelMetrics(modelName)` (line 157-162): raw model name 사용
    - `createInitialModelMetrics()` (line 77-92): **비공개 함수 — 직접 테스트
      불가**
    - `processApiError()` (line 182-187): **provider 필드 미설정** — 에러
      카운트만 증가
    - **[#1-v1.2]** `openai-compatible`이 `freeformInput: true` → `gpt-5.2` 등
      OpenAI 동일 모델명 사용 가능 → plain key 충돌
  - `packages/core/src/config/providerModels.ts`
    - `PROVIDER_MODEL_REGISTRY.gemini.models`: 등록된 Gemini 모델 목록 —
      **quota-only 대체 allowlist 후보**
    - `openai-compatible` (line 146-151): `freeformInput: true` — 어떤 모델명도
      허용
  - `packages/core/src/output/json-formatter.ts`
    - line 29: `output.stats = stats` → line 36:
      `JSON.stringify(output, null, 2)` — 키 그대로 직렬화
    - `::` 구분자는 JSON-safe → `{provider}::{model}` 키 직렬화 가능
  - **[#1-v1.2] `SessionMetrics.models` 키 소비자 분석** (코드 검증 완료):
    - `Object.keys()`: SessionContext.tsx (2곳), StatsDisplay.tsx (2곳) — 키
      파싱 필요
    - `Object.entries()`: StatsDisplay.tsx (1곳), ModelStatsDisplay.tsx (1곳) —
      키 파싱 필요
    - `Object.values()`: computeStats.ts (4곳), stream-json-formatter.ts (1곳) —
      **키 형식 무관**
    - 키 직접 표시: StatsDisplay.tsx (`getBaseModelName` 적용),
      ModelStatsDisplay.tsx (raw 키 표시 → `parseCompositeKey` 필요)
  - `packages/cli/src/ui/components/StatsDisplay.tsx`
    - `VALID_GEMINI_MODELS` import (line 27)
    - `buildModelRows()` (line 77-79): 모델 테이블 구성
    - **[#6]** quota-only 행 (line 101-119):
      `VALID_GEMINI_MODELS.has(b.modelId)` 기반 필터
    - **[#5-v1.2]** `provider === 'gemini'` 필터만으로는 모든 쿼타 버킷 표시 →
      `PROVIDER_MODEL_REGISTRY` 제약 필요
  - `packages/cli/src/ui/components/ModelStatsDisplay.tsx`
    - 프로바이더 그룹 없는 플랫 리스트
  - `packages/cli/src/ui/contexts/SessionContext.tsx`
    - `areModelMetricsEqual()` (line 31): **비공개 함수 — 직접 테스트 불가** →
      행위 기반 테스트 필요

- [x] **[SCOPE-CHECK]** 2일 이내 완료 가능 범위 확인
  - 예상 총 소요: 1.5~2일
  - 이번 Phase 완료 조건(DoD):
    1. `ModelMetrics`에 `provider` 필드가 포함됨 (Phase 0에서 추가 — 검증만)
    2. **[#1-v1.2]** `SessionMetrics.models` 키는 `{provider}::{model}` 복합 키
       사용 (JSON-safe `::` 구분자)
    3. **[#1-v1.2]** `buildCompositeKey()` / `parseCompositeKey()` 유틸리티
       export — 레거시 키(`::` 미포함) → `gemini` 기본값
    4. `StatsDisplay.tsx`에서 `VALID_GEMINI_MODELS` 의존 제거
    5. **[#5-v1.2]** quota-only 행 보존:
       `PROVIDER_MODEL_REGISTRY.gemini.models`를 allowlist로 사용 — 등록된
       모델만 표시
    6. 프로바이더 그룹핑 UI 표시 (다중 프로바이더 시)
    7. 단일 프로바이더 시 기존 UX와 동일
    8. `areModelMetricsEqual()`에 provider 비교 포함 (행위 기반 테스트로 검증)
    9. **[#2-v1.2]** `processApiError`에서도 provider 필드 설정됨
    10. **[#5]** 런타임 provider 추론 없음 — provider는 항상 event에서
        명시적으로 추출 (모델명 기반 추론 폐기). 단, 영속화된 레거시 키(`::`
        미포함) 파싱 시 `gemini` 기본값은 유지

---

## 1.2 🔴 RED Phase: 실패 테스트 작성

### RED-1: ModelMetrics provider 필드

> **v1.2 리뷰 반영 (이슈 #7)**: `createInitialModelMetrics()`는 비공개 함수 —
> 직접 호출 테스트 불가. **행위 기반 테스트**: `UiTelemetryService.addEvent()` →
> `getMetrics()` 경유로 provider 필드 존재 검증.

- [x] **[RED]** 새 모델 첫 이벤트 시 provider 필드가 'unknown' 기본값인 테스트

  **파일**: `packages/core/src/telemetry/uiTelemetry.test.ts`

  ```typescript
  describe('ModelMetrics provider', () => {
    it('should have provider field set from event when processing api response', () => {
      // Arrange: ProviderApiResponseEvent with provider='claude', model='claude-sonnet-4'
      // Act: service.addEvent(event)
      // Assert: getMetrics().models['claude::claude-sonnet-4'].provider === 'claude'
    });

    it('should default provider to gemini for legacy ApiResponseEvent', () => {
      // Arrange: 기존 ApiResponseEvent (provider 필드 없음)
      // Act: service.addEvent(event)
      // Assert: getMetrics().models['gemini::gemini-2.5-pro'].provider === 'gemini'
    });
  });
  ```

- [x] **[RED-VERIFY]** 테스트 실패 확인

### RED-2: `{provider}::{model}` 복합 키 유틸리티 + 그룹핑

> **v1.2 리뷰 반영 (이슈 #1)**: plain key 충돌 위험 확인 → `{provider}::{model}`
> 복합 키 재도입. `::` 구분자는 JSON-safe. 레거시 키(`::` 미포함)는 `gemini`
> 기본값으로 안전 파싱.

- [x] **[RED]** 복합 키 빌드/파싱 + 그룹핑 테스트

  ```typescript
  describe('buildCompositeKey / parseCompositeKey', () => {
    it('should build key in provider::model format', () => {
      expect(buildCompositeKey('claude', 'claude-sonnet-4')).toBe('claude::claude-sonnet-4');
    });

    it('should parse composite key into provider and model', () => {
      const { provider, model } = parseCompositeKey('openai::gpt-5.2');
      expect(provider).toBe('openai');
      expect(model).toBe('gpt-5.2');
    });

    it('should default to gemini provider for legacy keys without ::', () => {
      const { provider, model } = parseCompositeKey('gemini-2.5-pro');
      expect(provider).toBe('gemini');
      expect(model).toBe('gemini-2.5-pro');
    });

    it('should handle model names containing :: safely via indexOf', () => {
      // provider::model::variant → provider='provider', model='model::variant'
      const { provider, model } = parseCompositeKey('custom::model::v2');
      expect(provider).toBe('custom');
      expect(model).toBe('model::v2');
    });
  });

  describe('groupModelsByProvider', () => {
    it('should group models by provider extracted from composite key', () => {
      const models: Record<string, ModelMetrics> = {
        'gemini::gemini-2.5-pro': { provider: 'gemini', ... },
        'claude::claude-sonnet-4': { provider: 'claude', ... },
        'gemini::gemini-2.5-flash': { provider: 'gemini', ... },
      };
      const groups = groupModelsByProvider(models);
      expect(groups['gemini']).toHaveLength(2);
      expect(groups['claude']).toHaveLength(1);
    });

    it('should distinguish same model name from different providers', () => {
      // openai-compatible에서 gpt-5.2 사용 시 openai의 gpt-5.2와 구분
      const models: Record<string, ModelMetrics> = {
        'openai::gpt-5.2': { provider: 'openai', ... },
        'openai-compatible::gpt-5.2': { provider: 'openai-compatible', ... },
      };
      expect(Object.keys(models)).toHaveLength(2); // 충돌 없음
    });
  });
  ```

- [x] **[RED-VERIFY]** 테스트 실패 확인

### RED-3: processApiResponse/processApiError 복합 키 + provider 필드

> **v1.2 리뷰 반영 (이슈 #1, #2)**: 복합 키 `{provider}::{model}` 사용 +
> processApiError에도 provider 추출.

- [x] **[RED]** processApiResponse가 복합 키와 provider를 설정하는 테스트

  ```typescript
  describe('processApiResponse composite key + provider', () => {
    it('should use composite key provider::model from ProviderApiResponseEvent', () => {
      // Arrange: ProviderApiResponseEvent with provider='claude', model='claude-sonnet-4'
      // Act: service.addEvent(event)
      // Assert: 'claude::claude-sonnet-4' in Object.keys(getMetrics().models)
      // Assert: metrics['claude::claude-sonnet-4'].provider === 'claude'
    });

    it('should use gemini::model key for legacy ApiResponseEvent', () => {
      // Arrange: 기존 ApiResponseEvent (provider 필드 없음)
      // Act: service.addEvent(event)
      // Assert: 'gemini::gemini-2.5-pro' in Object.keys(getMetrics().models)
    });

    it('should prevent collision of same model name from different providers', () => {
      // Arrange: openai event with model='gpt-5.2' + openai-compatible event with model='gpt-5.2'
      // Act: service.addEvent(openaiEvent); service.addEvent(compatEvent);
      // Assert: Object.keys(models) has both 'openai::gpt-5.2' and 'openai-compatible::gpt-5.2'
      // Assert: metrics are independent
    });
  });
  ```

- [x] **[RED]** processApiError도 provider 필드를 설정하는 테스트

  > **v1.2 이슈 #2**: 현재 `processApiError()` (uiTelemetry.ts:182-187)는
  > provider 미설정.

  ```typescript
  describe('processApiError provider field', () => {
    it('should set provider from ProviderApiErrorEvent', () => {
      // Arrange: ProviderApiErrorEvent with provider='claude', model='claude-sonnet-4'
      // Act: service.addEvent(errorEvent)
      // Assert: metrics['claude::claude-sonnet-4'].provider === 'claude'
    });

    it('should use composite key for error metrics', () => {
      // Arrange: ProviderApiErrorEvent with provider='openai', model='gpt-5.2'
      // Act: service.addEvent(errorEvent)
      // Assert: 'openai::gpt-5.2' in Object.keys(getMetrics().models)
    });
  });
  ```

- [x] **[RED-VERIFY]** 테스트 실패 확인

### RED-4: areModelMetricsEqual provider 비교

> **v1.2 리뷰 반영 (이슈 #7)**: `areModelMetricsEqual()`은 비공개 함수 — 직접
> import 불가. **행위 기반 테스트**: SessionContext의 렌더 트리거 여부로 검증
> (provider 변경 시 리렌더 발생 확인). 또는 `uiTelemetry.ts`에서 같은 복합 키의
> provider 필드가 유지되는지 검증.

- [x] **[RED]** provider 변경이 SessionContext 리렌더를 트리거하는 테스트

  **파일**: `packages/cli/src/ui/contexts/SessionContext.test.tsx` (또는 해당
  테스트 파일)

  ```typescript
  describe('areModelMetricsEqual (behavior-based)', () => {
    it('should trigger re-render when provider field changes in metrics', () => {
      // Approach: SessionContext는 areModelMetricsEqual로 deep compare 수행
      // 동일 키에 provider만 변경된 metrics를 전달하면 렌더가 발생해야 함
      // 구현 방법: SessionContext render count 또는 useMemo dependency 변경 감지
    });
  });
  ```

  > **대안**: `areModelMetricsEqual`을 export하여 직접 테스트하는 것도 가능
  > (리팩터링 시 결정)

- [x] **[RED-VERIFY]** 테스트 실패 확인

### RED-5: StatsDisplay 프로바이더 그룹핑

- [x] **[RED]** 다중 프로바이더 시 그룹 헤더 렌더링 테스트

  **파일**: `packages/cli/src/ui/components/StatsDisplay.test.tsx` (또는 해당
  테스트 파일)

  ```typescript
  it('should render provider group headers when multiple providers exist', () => {
    const models = {
      'gemini::gemini-2.5-pro': { provider: 'gemini', ... },
      'claude::claude-sonnet-4': { provider: 'claude', ... },
    };
    // Assert: 'Gemini', 'Claude' 그룹 헤더가 렌더링됨
    // Assert: 모델명은 parseCompositeKey(key).model로 표시 (provider:: 접두사 미표시)
  });

  it('should not render provider column when single provider', () => {
    const models = {
      'gemini::gemini-2.5-pro': { provider: 'gemini', ... },
      'gemini::gemini-2.5-flash': { provider: 'gemini', ... },
    };
    // Assert: Provider 컬럼 없이 기존 레이아웃 유지
  });
  ```

- [x] **[RED-VERIFY]** 테스트 실패 확인

### RED-6: VALID_GEMINI_MODELS 의존 제거 + quota-only 행 보존

> **v1.1 리뷰 반영 (이슈 #6)**: `VALID_GEMINI_MODELS.has(b.modelId)` 제거 시
> 사용 이력 없는 Gemini 모델의 quota-only 행이 사라지는 문제. **v1.2 리뷰 반영
> (이슈 #5)**: `provider === 'gemini'` 필터만으로는 모든 쿼타 버킷 노출 위험. →
> **`PROVIDER_MODEL_REGISTRY.gemini.models`를 대체 allowlist로 사용** → 등록된
> 모델만 quota-only 행 표시.

- [x] **[RED]** PROVIDER_MODEL_REGISTRY 기반 필터로 Gemini 쿼타 모델 추출 +
      quota-only 행 보존 테스트

  ```typescript
  describe('VALID_GEMINI_MODELS replacement with PROVIDER_MODEL_REGISTRY', () => {
    it('should filter gemini models by composite key provider', () => {
      const models = {
        'gemini::gemini-2.5-pro': { provider: 'gemini', ... },
        'claude::claude-sonnet-4': { provider: 'claude', ... },
      };
      // Assert: geminiModels = ['gemini::gemini-2.5-pro']
    });

    it('should show quota-only rows only for models in PROVIDER_MODEL_REGISTRY.gemini', () => {
      // Arrange: quotas에 gemini-2.5-flash 버킷 존재 (PROVIDER_MODEL_REGISTRY에 등록됨)
      // Arrange: models에는 gemini::gemini-2.5-pro만 존재
      const models = {
        'gemini::gemini-2.5-pro': { provider: 'gemini', ... },
      };
      const quotas = {
        buckets: [
          { modelId: 'gemini-2.5-pro', ... },
          { modelId: 'gemini-2.5-flash', ... },  // PROVIDER_MODEL_REGISTRY에 등록됨, 사용 이력 없음
        ],
      };
      // Assert: gemini-2.5-flash가 quota-only 행으로 표시됨
    });

    it('should NOT show quota-only rows for unknown gemini quota buckets', () => {
      // Arrange: quotas에 'gemini-experimental-xyz' 버킷 존재 (PROVIDER_MODEL_REGISTRY 미등록)
      const quotas = {
        buckets: [
          { modelId: 'gemini-experimental-xyz', ... },  // 미등록 → 표시 안 함
        ],
      };
      // Assert: gemini-experimental-xyz는 quota-only 행으로 표시하지 않음 (노이즈 방지)
    });

    it('should not show quota-only rows for non-gemini providers', () => {
      // Assert: Claude/OpenAI 쿼타 버킷은 quota-only 행으로 표시하지 않음
      // (Phase 3에서 별도 providerQuotas로 처리)
    });
  });
  ```

- [x] **[RED-VERIFY]** 테스트 실패 확인

---

## 1.3 🟢 GREEN Phase: 최소 코드 구현

### TASK-001: ModelMetrics.provider 검증 (Phase 0 산출물)

> **v1.4 이슈 #3 해결**: `ModelMetrics.provider` 필드는 Phase 0 TASK-006에서
> 이미 추가됨. Phase 1에서는 필드 존재를 **전제 조건으로 검증**만 하고, 복합
> 키 + 그룹핑에 집중.

- [x] **[TASK-001]** Phase 0에서 추가한 ModelMetrics.provider 필드 존재 확인
  - 파일: `packages/core/src/telemetry/uiTelemetry.ts`
  - 확인: `provider: string` 필드가 `ModelMetrics` 인터페이스에 존재하고,
    `createInitialModelMetrics()`에서 `'unknown'` 기본값 설정됨
  - 전제 조건: Phase 0 완료 — TASK-006에서 필드 추가 + provider 추출 로직 구현
    완료
  - 예상 소요: 5분 (검증만)

### TASK-002: `buildCompositeKey` / `parseCompositeKey` + `groupModelsByProvider`

> **v1.2 리뷰 반영 (이슈 #1)**: `{provider}::{model}` 복합 키 유틸리티 + 그룹핑
> 함수

- [x] **[TASK-002]** 복합 키 유틸리티 + 그룹핑 구현
  - 파일: `packages/core/src/telemetry/uiTelemetry.ts`
  - 변경:

    ```typescript
    /** provider::model 형식의 복합 키 생성 */
    export function buildCompositeKey(provider: string, model: string): string {
      return `${provider}::${model}`;
    }

    /** 복합 키를 provider와 model로 파싱. 레거시 키(:: 미포함)는 gemini 기본값 */
    export function parseCompositeKey(key: string): {
      provider: string;
      model: string;
    } {
      const idx = key.indexOf('::');
      if (idx === -1) return { provider: 'gemini', model: key }; // 레거시 호환
      return { provider: key.slice(0, idx), model: key.slice(idx + 2) };
    }

    /** provider 필드 기반 모델 그룹핑 */
    export function groupModelsByProvider(
      models: Record<string, ModelMetrics>,
    ): Record<string, Array<[string, ModelMetrics]>> {
      // provider 필드 기반 그룹핑
    }
    ```

  - 예상 소요: 30분

### TASK-003: processApiResponse + processApiError 복합 키 + provider 필드

> **v1.2 리뷰 반영 (이슈 #1, #2)**: 복합 키 사용 + processApiError에도 provider
> 추출.

- [x] **[TASK-003]** processApiResponse/processApiError에서 복합 키 생성 +
      provider 설정
  - 파일: `packages/core/src/telemetry/uiTelemetry.ts`
  - 변경 — processApiResponse:
    ```typescript
    const provider =
      'provider' in event
        ? (event as ProviderApiResponseEvent).provider
        : 'gemini';
    const key = buildCompositeKey(provider, event.model); // provider::model 복합 키
    const modelMetrics = getOrCreateModelMetrics(key);
    modelMetrics.provider = provider;
    ```
  - 변경 — **processApiError (이슈 #2)**:
    ```typescript
    // 기존: provider 미설정, model 키만 사용
    // 수정: processApiResponse와 동일한 provider 추출 + 복합 키 사용
    const provider =
      'provider' in event
        ? (event as ProviderApiErrorEvent).provider
        : 'gemini';
    const key = buildCompositeKey(provider, event.model);
    const modelMetrics = getOrCreateModelMetrics(key);
    modelMetrics.provider = provider;
    modelMetrics.api.totalRequests++;
    modelMetrics.api.totalErrors++;
    modelMetrics.api.totalLatencyMs += event.duration_ms;
    ```
  - 예상 소요: 30분

### TASK-004: areModelMetricsEqual 확장

- [x] **[TASK-004]** provider 비교 추가
  - 파일: `packages/cli/src/ui/contexts/SessionContext.tsx`
  - 변경: `if (a.provider !== b.provider) return false;`
  - 예상 소요: 10분

### TASK-005: StatsDisplay.tsx VALID_GEMINI_MODELS 제거 + 프로바이더 그룹핑

> **v1.1 리뷰 반영 (이슈 #6)**: quota-only 행 보존 로직 필수. **v1.2 리뷰 반영
> (이슈 #1, #5)**: 복합 키 파싱 + `PROVIDER_MODEL_REGISTRY` allowlist.

- [x] **[TASK-005]** 복합 키 파싱 + PROVIDER_MODEL_REGISTRY 기반 필터 + 그룹핑
      UI + quota-only 행 보존
  - 파일: `packages/cli/src/ui/components/StatsDisplay.tsx`
  - 변경:
    - `VALID_GEMINI_MODELS` import 제거
    - `parseCompositeKey` import 추가 (키 → model name 추출)
    - 모델명 표시: `parseCompositeKey(key).model` (복합 키의 provider:: 접두사
      제거)
    - Gemini 모델 필터: `models.filter(([, m]) => m.provider === 'gemini')`
    - **[#5-v1.2] quota-only 행 보존** — `PROVIDER_MODEL_REGISTRY` allowlist:

      ```typescript
      import { PROVIDER_MODEL_REGISTRY } from '@didim365/agent-cli-core';

      // 등록된 Gemini 모델 ID Set 생성
      const registeredGeminiModels = new Set(
        Object.keys(PROVIDER_MODEL_REGISTRY.gemini.models),
      );

      // 사용된 Gemini 모델 (복합 키에서 model 부분 추출)
      const usedGeminiModels = new Set(
        Object.entries(models)
          .filter(([, m]) => m.provider === 'gemini')
          .map(([key]) => getBaseModelName(parseCompositeKey(key).model)),
      );

      // quota-only 행: 등록된 모델 중 미사용 모델만 표시 (노이즈 방지)
      const quotaOnlyBuckets =
        quotas?.buckets?.filter(
          (b) =>
            registeredGeminiModels.has(b.modelId) &&
            !usedGeminiModels.has(b.modelId),
        ) ?? [];
      ```

    - 다중 프로바이더 시 Provider 컬럼/그룹 헤더 추가
    - 단일 프로바이더 시 기존 레이아웃 유지

  - 예상 소요: 1~2시간

### TASK-006: ModelStatsDisplay.tsx 프로바이더 그룹핑

- [x] **[TASK-006]** 프로바이더별 섹션 분리
  - 파일: `packages/cli/src/ui/components/ModelStatsDisplay.tsx`
  - 변경: provider별 그룹핑 후 섹션 헤더 렌더링
  - 예상 소요: 1시간

- [x] **[GREEN-VERIFY]** 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/telemetry/uiTelemetry.test.ts --run
  npm test -w @didim365/agent-cli -- --run
  ```

---

## 1.4 🔵 REFACTOR Phase: 코드 개선

### 1.4.1 구조 개선 (Make it right)

- [x] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - `groupModelsByProvider()` 유틸리티를 별도 파일로 추출 검토
    (uiTelemetry.ts에서 export 시 충분하면 유지)
  - 프로바이더 그룹핑 로직을 공통 유틸리티로 추출 검토
  - quota-only 행 로직과 사용 모델 행 로직 간 중복 제거
  - Ink 컴포넌트 중복 렌더 로직 제거

- [x] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/telemetry/ --run
  npm test -w @didim365/agent-cli -- --run
  ```

---

## 1.5 사후 작업 (Post-Work)

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
  - 확인 항목 1: 기존 Gemini 단일 사용 시 Provider 컬럼 미표시 (기존 UX 유지)
  - 확인 항목 2: 다중 프로바이더 사용 시 그룹핑 정상 표시
  - 확인 항목 3: `VALID_GEMINI_MODELS` 완전 제거 확인 (grep)
  - 확인 항목 4: **[#1-v1.2]** `SessionMetrics.models` 키가
    `{provider}::{model}` 형식인지 확인
  - 확인 항목 5: **[#1-v1.2]** 레거시 키(`::` 미포함) 파싱 시 `gemini` 기본값
    확인
  - 확인 항목 6: **[#1-v1.2]** 동일 모델명이 다른 프로바이더에서 충돌 없이 독립
    기록됨
  - 확인 항목 7: **[#2-v1.2]** `processApiError`에서 provider 필드가 정상 설정됨
  - 확인 항목 8: **[#5-v1.2]** quota-only 행이
    `PROVIDER_MODEL_REGISTRY.gemini.models`에 등록된 모델만 표시
  - 확인 항목 9: **[#6]** 쿼타 버킷에만 존재하는 등록된 Gemini 모델이 quota-only
    행으로 표시됨
  - 확인 항목 10: JSON output에서 `stats.models` 키가 `provider::model` 형식
    (JSON-safe)

- [x] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase1_ProviderRecognition_{작업일자}.md`

- [x] **[COMMIT]** 변경사항 커밋
  ```bash
  git add packages/core/src/telemetry/uiTelemetry.ts \
         packages/cli/src/ui/components/StatsDisplay.tsx \
         packages/cli/src/ui/components/ModelStatsDisplay.tsx \
         packages/cli/src/ui/contexts/SessionContext.tsx
  git commit -m "feat(stats): 프로바이더 인식 기반 + UI 그룹핑 (Phase 1)"
  ```

---

## ⚠️ 주의사항

> **v1.2 리뷰 반영**: 이슈 #1 (복합 키 `::` 재도입), #2 (processApiError
> provider), #5 (PROVIDER_MODEL_REGISTRY allowlist), #6 (quota-only 보존), #7
> (행위 기반 테스트) 적용

1. **[#1-v1.2] `{provider}::{model}` 복합 키**: `SessionMetrics.models` 키는
   `{provider}::{model}` 형식. `::` 구분자는 JSON-safe. 레거시 데이터(`::`
   미포함)는 `parseCompositeKey()`에서 `gemini` 기본값으로 안전 파싱. UI 표시 시
   `parseCompositeKey(key).model`로 모델명만 추출.
2. **[#1-v1.2] JSON 출력 변경**: `stats.models` 키가 `gemini::gemini-2.5-pro`
   형식으로 변경됨 — JSON 소비자에게 알려야 함. `\0`과 달리 `::` 문자는 JSON에서
   정상 직렬화됨.
3. **[#2-v1.2] processApiError provider 필수**: `processApiError()`도
   `processApiResponse()`와 동일한 provider 추출 + 복합 키 로직 적용. 에러만
   발생한 모델도 올바른 provider 필드를 가져야 함.
4. **[#5] 런타임 provider 추론 폐기 + 레거시 키 파싱 구분**: (a) **런타임**:
   provider는 항상 event에서 명시적으로 추출 — 모델명으로부터 provider를
   추론하지 않음. `ProviderApiResponseEvent`는 `provider` 필드 포함, 기존
   `ApiResponseEvent`는 duck typing으로 `'gemini'` 설정. (b) **레거시 키 파싱**:
   `parseCompositeKey()`에서 `::` 미포함 키는 `gemini` 기본값 — 이는
   pre-multi-provider 영속 데이터 호환용이며 런타임 폴백과 다른 개념.
5. **[#5-v1.2] PROVIDER_MODEL_REGISTRY allowlist**: `VALID_GEMINI_MODELS` 제거
   후 대체 allowlist로 `PROVIDER_MODEL_REGISTRY.gemini.models` 사용. 등록된
   Gemini 모델만 quota-only 행 표시 → 알 수 없는 쿼타 버킷 노이즈 방지.
6. **[#6] quota-only 행 보존**: 쿼타 버킷 중 `PROVIDER_MODEL_REGISTRY`에
   등록되고 사용 이력 없는 Gemini 모델만 행으로 표시.
7. **[#7-v1.2] 행위 기반 테스트**:
   `createInitialModelMetrics()`/`areModelMetricsEqual()`은 비공개 →
   `UiTelemetryService.addEvent()` + `getMetrics()` 경유 검증. 리팩터링 내성
   향상.
8. **단일 프로바이더 UX**: 기존 사용자가 Gemini만 사용하면 UI가 변하지 않아야
   함.
9. **areModelMetricsEqual**: provider 추가 누락 시 무한 리렌더 위험 — TASK-004를
   TASK-001과 동시에 적용.
10. **Phase 0+1 atomic 배포**: Phase 0에서 provider event 수집, Phase 1에서 복합
    키 + provider 필드 사용 — 둘 다 머지 후 동작.

---

**작성일**: 2026-02-18 **작성자**: AI Assistant **상태**: ✅ 완료 (2026-02-20)
