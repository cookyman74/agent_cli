# Phase 1 작업 결과서 — 프로바이더 인식 기반 구축 + UI 그룹핑

- **작업일**: 2026-02-20
- **브랜치**: `v0.2.0/stats_multi_provider`
- **상태**: ✅ 완료
- **참조 계획서**:
  `docs/00_project/command_for_multi_provider/phase_plan/phase1_provider_recognition.md`
- **선행 Phase**: Phase 0 (Non-Gemini 텔레메트리 수집 경로 구축)

## 작업 목표

`{provider}::{model}` 복합 키 전환, `ModelMetrics.provider` 필드 활용, UI
프로바이더 그룹핑, `VALID_GEMINI_MODELS` 의존 제거. Phase 0에서 수집이 시작된
Non-Gemini 프로바이더 데이터를 프로바이더별로 구분하여 UI에 정확하게 표시한다.

## 작업 순서 및 결과

| 순서 | TASK     | 작업 내용                                                          | 테스트 결과    |
| ---- | -------- | ------------------------------------------------------------------ | -------------- |
| 1    | RED-1~3  | composite key 유틸리티 + processApi\* 복합 키 테스트 12개          | 12 FAIL (예상) |
| 2    | RED-4    | areModelMetricsEqual provider 비교 행위 테스트 1개                 | 1 FAIL (예상)  |
| 3    | RED-5    | StatsDisplay 프로바이더 그룹핑 테스트 2개                          | 2 FAIL (예상)  |
| 4    | RED-6    | PROVIDER_MODEL_REGISTRY quota-only 필터 테스트 2개                 | (기존 통과)    |
| 5    | TASK-001 | Phase 0 ModelMetrics.provider 필드 존재 검증                       | ✅ 검증 완료   |
| 6    | TASK-002 | buildCompositeKey/parseCompositeKey/groupModelsByProvider 구현     | 35/35 PASS     |
| 7    | TASK-003 | processApiResponse/processApiError 복합 키 전환 + 기존 테스트 갱신 | 35/35 PASS     |
| 8    | TASK-004 | areModelMetricsEqual provider 비교 추가                            | 5/5 PASS       |
| 9    | TASK-005 | StatsDisplay VALID_GEMINI_MODELS → PROVIDER_MODEL_REGISTRY 전환    | 18/18 PASS     |
| 10   | TASK-006 | ModelStatsDisplay parseCompositeKey 컬럼 헤더                      | PASS           |
| 11   | REFACTOR | extractProviderAndMetrics() DRY 추출                               | 35/35 PASS     |
| 12   | POST     | typecheck + lint + 전체 테스트 (5694 passed)                       | ✅             |

## 변경 파일 상세

### 소스 파일 (4개)

#### `packages/core/src/telemetry/uiTelemetry.ts`

- **`buildCompositeKey()`** (신규 export): `{provider}::{model}` 형식 복합 키
  생성
- **`parseCompositeKey()`** (신규 export): 복합 키를 provider/model로 파싱. `::`
  미포함 레거시 키는 `gemini` 기본값
- **`groupModelsByProvider()`** (신규 export): `parseCompositeKey` 기반 모델
  그룹핑
- **`extractProviderAndMetrics()`** (신규 private): provider duck typing 추출 +
  복합 키 생성 + `getOrCreateModelMetrics()` 호출을 DRY 통합
- **`processApiResponse()`** (수정): `this.extractProviderAndMetrics(event)`
  사용으로 복합 키 + provider 설정
- **`processApiError()`** (수정): 동일 패턴 적용 — Phase 0에서 누락된 provider
  설정 완료

#### `packages/cli/src/ui/contexts/SessionContext.tsx`

- **`areModelMetricsEqual()`** (수정):
  `if (a.provider !== b.provider) return false;` 추가 — provider 변경 시 리렌더
  트리거

#### `packages/cli/src/ui/components/StatsDisplay.tsx`

- **import 변경**: `VALID_GEMINI_MODELS` 제거 → `PROVIDER_MODEL_REGISTRY`,
  `parseCompositeKey` 추가
- **`GEMINI_MODEL_ALLOWLIST`** (신규 상수):
  `PROVIDER_MODEL_REGISTRY['gemini']?.models.map(m => m.id)` 기반 Set
- **`buildModelRows()`** (수정):
  - `getModelName()`:
    `parseCompositeKey(compositeKey).model.replace('-001', '')` — 복합 키에서
    모델명 추출
  - quota-only 필터: `GEMINI_MODEL_ALLOWLIST.has(b.modelId)` — 등록된 Gemini
    모델만 quota-only 행 표시

#### `packages/cli/src/ui/components/ModelStatsDisplay.tsx`

- **import 추가**: `parseCompositeKey` from `@didim365/agent-cli-core`
- **컬럼 헤더** (수정): `header: parseCompositeKey(name).model` — 복합 키에서
  `provider::` 접두사 제거하여 모델명만 표시

### 테스트 파일 (3개)

| 파일                      | 변경                                                                         | 신규 테스트 |
| ------------------------- | ---------------------------------------------------------------------------- | ----------- |
| `uiTelemetry.test.ts`     | RED-1~3 + 기존 테스트 composite key 갱신 + Phase 0 테스트 composite key 갱신 | 12개        |
| `SessionContext.test.tsx` | RED-4 provider 변경 리렌더 행위 테스트                                       | 1개         |
| `StatsDisplay.test.tsx`   | RED-5 (그룹핑 2개) + RED-6 (quota-only 2개)                                  | 4개         |

### 기존 테스트 호환성 갱신

복합 키 전환으로 인해 기존 테스트의 키 접근 패턴을 일괄 갱신:

- `models['gemini-2.5-pro']` → `models['gemini::gemini-2.5-pro']`
- `models['gemini-2.5-flash']` → `models['gemini::gemini-2.5-flash']`
- Phase 0 테스트의 `modelKey = 'claude-sonnet-4-20250514'` →
  `'claude::claude-sonnet-4-20250514'`
- `ModelMetricsWithProvider` 타입 캐스트 제거 (provider가 `ModelMetrics`에 직접
  존재)

### 문서 파일 (3개)

| 파일                             | 변경                                                                |
| -------------------------------- | ------------------------------------------------------------------- |
| `phase1_provider_recognition.md` | 전체 체크리스트 `[x]` 완료, 리스크 테이블 `✅` 전환, 상태 `✅ 완료` |
| `phase0_telemetry_collection.md` | 미미한 연관 갱신                                                    |
| `00_main_plan.md`                | Phase 1 행 전체 `✅`, 일정 기록                                     |

## DoD 검증

| #   | 항목                                                                     | 상태 |
| --- | ------------------------------------------------------------------------ | ---- |
| 1   | `ModelMetrics`에 `provider` 필드 포함 (Phase 0 산출물 검증)              | ✅   |
| 2   | `SessionMetrics.models` 키가 `{provider}::{model}` 복합 키 사용          | ✅   |
| 3   | `buildCompositeKey()`/`parseCompositeKey()` 유틸리티 export, 레거시 호환 | ✅   |
| 4   | `StatsDisplay.tsx`에서 `VALID_GEMINI_MODELS` 의존 완전 제거              | ✅   |
| 5   | quota-only 행 `PROVIDER_MODEL_REGISTRY.gemini.models` allowlist 사용     | ✅   |
| 6   | 프로바이더 그룹핑 UI 표시 (다중 프로바이더 시 모델명만 표시)             | ✅   |
| 7   | 단일 프로바이더 시 기존 UX 유지                                          | ✅   |
| 8   | `areModelMetricsEqual()`에 provider 비교 포함 (행위 기반 테스트 검증)    | ✅   |
| 9   | `processApiError`에서 provider 필드 정상 설정                            | ✅   |
| 10  | 런타임 provider 추론 없음 — event에서 명시적 추출만 사용                 | ✅   |

## 핵심 리스크 해결 결과

| 리스크                                    | 해결 방법                                                             |
| ----------------------------------------- | --------------------------------------------------------------------- |
| [#1-v1.2] Plain model key 충돌            | `{provider}::{model}` 복합 키로 완전 분리. `::` JSON-safe 구분자      |
| [#2-v1.2] processApiError provider 미설정 | `extractProviderAndMetrics()` DRY 메서드로 Response/Error 동일 로직   |
| [#5] 런타임 provider 추론 폐기            | event의 `provider` 필드 duck typing 추출, 레거시 키는 `gemini` 기본값 |
| [#5-v1.2] VALID_GEMINI_MODELS 버킷 노이즈 | `PROVIDER_MODEL_REGISTRY.gemini.models` 기반 `GEMINI_MODEL_ALLOWLIST` |
| [#6] quota-only 행 소실                   | `GEMINI_MODEL_ALLOWLIST.has(b.modelId)` 필터로 등록된 모델만 표시     |
| [#7-v1.2] 비공개 함수 직접 테스트         | 행위 기반 테스트: `addEvent()` + `getMetrics()` / 렌더 카운트 검증    |
| areModelMetricsEqual 무한 리렌더          | `a.provider !== b.provider` 비교 추가                                 |

## Lessons Learned

- **기존 테스트 일괄 갱신**: 복합 키 전환 시 모든 기존 테스트의 키 접근
  패턴(`models['model-name']`)을 복합 키 형식으로 갱신해야 함. `replace_all`로
  효율적 처리 가능하나, Phase 0 테스트도 함께 갱신 필요
- **DRY 리팩터링 타이밍**: `processApiResponse`/`processApiError`의 provider
  추출 로직이 동일 → GREEN 후 REFACTOR에서 `extractProviderAndMetrics()` private
  메서드로 추출. RED/GREEN에서는 중복 허용
- **행위 기반 테스트의 복잡도**: `areModelMetricsEqual()` 같은 비공개 함수는
  SessionContext 렌더 카운트로 간접 검증. 테스트 설정이 복잡하지만 리팩터링
  내성이 높음
- **PROVIDER_MODEL_REGISTRY 활용**: `VALID_GEMINI_MODELS` 하드코딩 Set 대신
  registry 기반 동적 allowlist로 전환 — 모델 추가/제거 시 자동 반영
- **Phase 0+1 atomic 변경**: Phase 0(수집)과 Phase 1(표시)은 함께 배포되어야 함.
  복합 키가 없는 Phase 0 데이터는 `parseCompositeKey()`의 레거시 파싱으로 호환

## 리뷰 이슈 검증 및 수정 결과

| #   | 심각도 | 이슈                                                                          | 판정          | 수정 내용                                                          |
| --- | ------ | ----------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------ |
| 1   | HIGH   | 다중 프로바이더 UI 그룹핑 미구현 — 동일 모델명 충돌 시 구분 불가              | **CONFIRMED** | `hasMultipleProviders` 감지 + `model (provider)` 형식 표시         |
| 2   | HIGH   | ModelStatsDisplay 컬럼 헤더 동일 식별 충돌                                    | **CONFIRMED** | 동일 패턴 적용 — `hasMultipleProviders` 시 `model (provider)` 헤더 |
| 3   | MEDIUM | quota-only 필터가 provider 미고려 — 비Gemini 모델이 Gemini quota-only 은폐    | **CONFIRMED** | `usedModelNames` → `usedGeminiModelIds` (Gemini provider만 필터)   |
| 4   | MEDIUM | 테스트명 "group headers"이지만 실제는 prefix 미노출만 검증                    | **CONFIRMED** | 테스트명/assertions 갱신 + 동일 모델명 충돌 검증 테스트 추가       |
| 5   | MEDIUM | 기존 테스트가 plain key 위주 — composite key 경로 미검증                      | **CONFIRMED** | StatsDisplay/ModelStatsDisplay 기존 테스트 전수 composite key 전환 |
| 6   | LOW    | `groupModelsByProvider` 주석 부정확 — "provider 필드 기반"이지만 실제 키 파싱 | **CONFIRMED** | 주석 "복합 키 파싱 기반"으로 정정                                  |

## 검증 결과

```
typecheck:  ✅ tsc --noEmit 통과
lint:       ✅ eslint 통과
tests:      ✅ 284 files, 5694 passed, 0 failed, 24 skipped
```
