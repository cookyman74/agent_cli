# Multi-Provider `/model` Command — 전체 작업계획서

> **프로젝트**: 멀티 프로바이더 환경에서 `/model` UX/동작/영속화 일관성 확보
> **작업 브랜치**: `DID/v0.1` **작업 방법론**: TDD (Red → Green → Refactor) +
> Tidy First **작성일**: 2026-02-15

---

## 1. 프로젝트 개요

### 1.1 목표

현재 `/model` 다이얼로그는 Gemini 모델만 표시한다. 프로바이더(Claude, OpenAI,
sLM, DidimAIStudio)에 맞는 모델 목록을 동적으로 표시하고, 선택 결과를
세션/재시작/전환 시점까지 일관되게 유지한다.

### 1.2 핵심 설계 결정

| #   | 결정                                      | 설계 근거                                                             |
| --- | ----------------------------------------- | --------------------------------------------------------------------- |
| 1   | Provider Model Registry (SSOT)            | 프로바이더별 모델/프리셋/기본값 이중 관리 방지                        |
| 2   | `DEFAULT_PROVIDER_MODELS` 레지스트리 파생 | 기존 코드 하위 호환 + SSOT 유지                                       |
| 3   | `resolveActiveProvider()` 다중 소스 감지  | `selectedProvider` → `LLM_PROVIDER` → API KEY → fallback              |
| 4   | Cross-provider prefix 기반 차단           | `claude-*` → OpenAI 거부, 커스텀 모델은 허용                          |
| 5   | 영속화 이중 동기화                        | 런타임(`config.setModel`) + env(`LLM_MODEL`) + sLM(`slmConfig.model`) |
| 6   | `model.byProvider` 프로바이더별 기억      | 전역 `model.name` 하위 호환 유지하면서 프로바이더별 최근 모델 복원    |

### 1.3 참고 문서

| 문서                                                                        | 설명                                     |
| --------------------------------------------------------------------------- | ---------------------------------------- |
| [메인 설계 문서](../multi_provider_model_select_design.md)                  | 요약 + 의사결정 + 추적 인덱스            |
| [01_context_as_is.md](../detail_plan/01_context_as_is.md)                   | AS-IS 분석 (9개 이슈)                    |
| [02_target_ux_to_be.md](../detail_plan/02_target_ux_to_be.md)               | 프로바이더별 TO-BE UX                    |
| [03_architecture_design.md](../detail_plan/03_architecture_design.md)       | 설계 상세 (§3.1~§3.9)                    |
| [04_change_scope_and_steps.md](../detail_plan/04_change_scope_and_steps.md) | 변경 범위 (10 파일) + 구현 순서 (7 Step) |
| [05_validation_plan.md](../detail_plan/05_validation_plan.md)               | 검증 계획 (20개 E2E 시나리오)            |
| [06_review_log.md](../detail_plan/06_review_log.md)                         | 리뷰 이슈 #1~#14 반영 이력               |
| [99_TDD_plan.md](../template/99_TDD_plan.md)                                | TDD 방법론                               |

---

## 2. 변경 범위 요약

### 2.1 수정 파일 목록

| #   | 파일                                                    | 변경     | 분류 | Phase |
| --- | ------------------------------------------------------- | -------- | ---- | ----- |
| 1   | `packages/core/src/config/providerModels.ts`            | **신규** | Core | 1     |
| 2   | `packages/core/src/providers/providerSelector.ts`       | 수정     | Core | 1     |
| 3   | `packages/core/src/index.ts`                            | 수정     | Core | 1     |
| 4   | `packages/cli/src/ui/utils/resolveActiveProvider.ts`    | **신규** | CLI  | 2     |
| 5   | `packages/cli/src/config/settingsSchema.ts`             | 수정     | CLI  | 2     |
| 6   | `packages/cli/src/config/settings.ts`                   | 수정     | CLI  | 2     |
| 7   | `packages/cli/src/config/config.ts`                     | 수정     | CLI  | 2     |
| 8   | `packages/cli/src/ui/components/ModelDialog.tsx`        | 수정     | CLI  | 3     |
| 9   | `packages/cli/src/ui/components/FreeformModelInput.tsx` | **신규** | CLI  | 3     |
| 10  | `packages/cli/src/ui/components/DialogManager.tsx`      | 수정     | CLI  | 3     |

### 2.2 의존 관계

```
Phase 1 (Core 레지스트리)
  └─▶ Phase 2 (Provider 감지 + Settings)
        └─▶ Phase 3 (ModelDialog UI 리팩토링)
              └─▶ Phase 4 (Quality Gates + E2E 검증)
```

> 각 Phase는 이전 Phase 완료를 전제로 한다. Phase 간 병렬 수행 불가.

---

## 3. Phase별 작업 요약

### Phase 1: Core — 모델 레지스트리 + Provider Selector 정합성

> **상세 계획서**:
> [Phase1_core_model_registry.md](./Phase1_core_model_registry.md)

| 항목      | 내용                                                                         |
| --------- | ---------------------------------------------------------------------------- |
| 범위      | `providerModels.ts` (신규), `providerSelector.ts`, `index.ts`                |
| 위험 수준 | 🟡 Medium                                                                    |
| 설계 참조 | §3.1 레지스트리, §3.2 DEFAULT_PROVIDER_MODELS 파생, §3.4 Cross-provider 검증 |
| 리뷰 이슈 | #2 (cross-provider), #5 (이중 관리), #6 (커스텀 모델), #8 (Gemini 기본값)    |

**주요 산출물:**

- `PROVIDER_MODEL_REGISTRY` — 5개 프로바이더 모델 레지스트리
- `getDefaultModelFromRegistry()` — SSOT 기본 모델 함수
- `isModelValidForProvider()` — prefix 기반 cross-provider 검증
- `DEFAULT_PROVIDER_MODELS` 레지스트리 파생으로 교체
- `resolveProviderModel()` cross-provider 검증 추가

**TDD 사이클:**

| 단계            | 내용                                                              | 상태 |
| --------------- | ----------------------------------------------------------------- | ---- |
| 1.1 사전 작업   | 기존 코드 분석 + 베이스라인 테스트                                | ⬜   |
| 1.2 RED         | `providerModels.test.ts` — 레지스트리/기본모델/검증 테스트        | ⬜   |
| 1.3 GREEN       | `providerModels.ts` 구현 + `index.ts` export                      | ⬜   |
| 1.4 RED (2차)   | `providerSelector.test.ts` — DEFAULT 파생 + cross-provider 테스트 | ⬜   |
| 1.5 GREEN (2차) | `providerSelector.ts` 수정                                        | ⬜   |
| 1.6 REFACTOR    | 코드 구조 개선, 중복 제거                                         | ⬜   |
| 1.7 사후 작업   | 빌드 + 린트 + 타입체크 + 결과서 + 커밋                            | ⬜   |

---

### Phase 2: CLI — 프로바이더 감지 유틸 + 설정 스키마 확장

> **상세 계획서**:
> [Phase2_cli_provider_detect_and_settings.md](./Phase2_cli_provider_detect_and_settings.md)

| 항목      | 내용                                                                               |
| --------- | ---------------------------------------------------------------------------------- |
| 범위      | `resolveActiveProvider.ts` (신규), `settingsSchema.ts`, `settings.ts`, `config.ts` |
| 위험 수준 | 🟡 Medium                                                                          |
| 설계 참조 | §3.3 프로바이더 감지, §3.7 byProvider 영속화 + startup                             |
| 리뷰 이슈 | #1 (env 감지), #9 (Didim env), #10 (byProvider), #11 (scope 오염), #12 (startup)   |

**주요 산출물:**

- `resolveActiveProvider()` — 다중 소스 프로바이더 감지 +
  `normalizeProviderKey()`
  > ⚠️ **drift risk**: Core의 `selectProvider()`와 API key 감지 로직이 중복된다.
  > `resolveActiveProvider()`는 CLI 전용(UI state `selectedProvider` 최우선,
  > 반환: string key), `selectProvider()`는 Core 전용(API 요청 시 auth 결정,
  > 반환: `ProviderSelection`). 의도적 분리이나, API key 감지 순서/매핑 변경 시
  > 양쪽 동기화 필수. Phase 2 테스트에서 **계약 기반 일관성 검증**: (1)
  > `LLM_PROVIDER` 설정 시 동일 프로바이더 선택, (2)
  > `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` 단독 시 동일 프로바이더 감지. 완전
  > 동일성이 아닌 공통 입력에 대한 동일 결과만 검증.
- `model.byProvider` 스키마 정의 (settingsSchema.ts)
- `saveModelForProvider()` — user scope 전용 저장 (scope 오염 방지)
- startup model resolution에 `byProvider[activeProvider]` 삽입 — 우선순위 체인:
  `argv.model > LLM_MODEL > GEMINI_MODEL > byProvider[activeProvider] > model.name > defaultModel`
  > ⚠️ **activeProvider 결정 규칙** (startup 시점):
  > `process.env['LLM_PROVIDER'] || normalizeProviderKey(settings.security?.auth?.selectedProvider) || undefined`.
  > `selectedProvider`는 **merged scope**에서 읽는다 (실효 값 = user +
  > workspace + default 병합). 이는 scope 오염 방지(R5)가 적용되는
  > `model.byProvider` **쓰기**(user scope 전용)와 구분된다 — startup provider
  > 판별은 읽기 전용이므로 merged가 적절. `LLM_PROVIDER`가 없고
  > `selectedProvider`만 settings에 저장된 케이스도 커버한다. 둘 다 없으면
  > `activeProvider`는 undefined → `byProvider` 룩업 건너뜀 → `model.name`
  > fallback으로 기존 동작과 동일.

**TDD 사이클:**

| 단계              | 내용                                                                 | 상태 |
| ----------------- | -------------------------------------------------------------------- | ---- |
| 2.1 사전 작업     | Phase 1 결과서 검토 + 기존 코드 분석                                 | ⬜   |
| 2.2 RED (Part A)  | `resolveActiveProvider.test.ts` — 정규화 + env fallback 테스트       | ⬜   |
| 2.2 RED (Part B)  | settings 스키마 + `saveModelForProvider` 테스트                      | ⬜   |
| 2.2 RED (Part C)  | startup `byProvider` 우선 규칙 테스트                                | ⬜   |
| 2.3 GREEN (A/B/C) | `resolveActiveProvider.ts` + settingsSchema + settings + config 구현 | ⬜   |
| 2.4 REFACTOR      | 코드 구조 개선, 에러 핸들링 패턴 통일                                | ⬜   |
| 2.5 사후 작업     | 빌드 + 린트 + 타입체크 + Phase 1 회귀 확인 + 결과서 + 커밋           | ⬜   |

---

### Phase 3: CLI — ModelDialog 리팩토링 + FreeformModelInput + 연결

> **상세 계획서**:
> [Phase3_model_dialog_refactor.md](./Phase3_model_dialog_refactor.md)

| 항목      | 내용                                                                              |
| --------- | --------------------------------------------------------------------------------- |
| 범위      | `ModelDialog.tsx`, `FreeformModelInput.tsx` (신규), `DialogManager.tsx`           |
| 위험 수준 | 🟠 High                                                                           |
| 설계 참조 | §3.5 ModelDialog, §3.6 영속화 동기화, §3.8 DialogManager, §3.9 FreeformModelInput |
| 리뷰 이슈 | #3 (LLM_MODEL sync), #7 (sLM 재시작 복원), #13 (slmConfig null guard)             |

**주요 산출물:**

- `ModelDialog.tsx` — 프로바이더별 동적 분기 (Gemini/Claude/OpenAI/Didim
  비활성/sLM 텍스트 입력)
- `FreeformModelInput.tsx` — sLM 전용 텍스트 입력 컴포넌트
- `handleSelect` — `LLM_MODEL` env + `slmConfig.model` + `model.byProvider` 3중
  동기화
- `DialogManager.tsx` — `selectedProvider` prop 전달

**TDD 사이클:**

| 단계                   | 내용                                                                  | 상태 |
| ---------------------- | --------------------------------------------------------------------- | ---- |
| 3.1 사전 작업          | Phase 2 결과서 검토 + 기존 ModelDialog 분석                           | ⬜   |
| 3.2 RED (Part A)       | 프로바이더별 분기 렌더링 테스트 (Gemini/Claude/OpenAI/Didim/env 감지) | ⬜   |
| 3.3 GREEN (Part A)     | ModelDialog props 확장 + 프로바이더별 분기 구현                       | ⬜   |
| 3.4 RED (Part B)       | handleSelect 영속화 + FreeformModelInput 테스트                       | ⬜   |
| 3.5 GREEN (Part B)     | FreeformModelInput 생성 + handleSelect 동기화 구현                    | ⬜   |
| 3.6 RED/GREEN (Part C) | DialogManager `selectedProvider` 전달                                 | ⬜   |
| 3.7 REFACTOR           | Gemini 전용 로직 헬퍼 추출 + 스냅샷 업데이트                          | ⬜   |
| 3.8 사후 작업          | 빌드 + 린트 + 타입체크 + Phase 1~2 회귀 확인 + 결과서 + 커밋          | ⬜   |

---

### Phase 4: Quality Gates + 통합 검증

> **상세 계획서**:
> [Phase4_quality_gates_and_e2e.md](./Phase4_quality_gates_and_e2e.md)

| 항목      | 내용                                                                          |
| --------- | ----------------------------------------------------------------------------- |
| 범위      | Phase 1~3 전체 변경 사항                                                      |
| 위험 수준 | 🟡 Medium                                                                     |
| 설계 참조 | [05_validation_plan.md](../detail_plan/05_validation_plan.md) — 20개 시나리오 |

**Quality Gates:**

| Gate | 내용                                                             | 상태 |
| ---- | ---------------------------------------------------------------- | ---- |
| QG1  | Typecheck + Lint (Core + CLI)                                    | ⬜   |
| QG2  | 단위 테스트 전수 확인 (변경 파일 연관 테스트 전수 + 신규 테스트) | ⬜   |
| QG3  | Cross-Module 통합 테스트 (Core→CLI 연동)                         | ⬜   |
| QG4  | 수동 E2E 시나리오 검증 (20개)                                    | ⬜   |

**E2E 시나리오 요약:**

| 구분          | 시나리오                                                      | 건수 |
| ------------- | ------------------------------------------------------------- | ---- |
| 기본 동작     | 프로바이더별 모델 목록 표시 (#1~#8)                           | 8    |
| 모델 선택     | 선택 + 하이라이트 복원 (#9~#11)                               | 3    |
| 고급 시나리오 | env 감지, cross-provider, sLM 복원, byProvider 기억 (#12~#20) | 9    |

> **주의**: E2E #19 (Didim env 감지)는 `LLM_PROVIDER=didim` 전제조건 필수 —
> `useAuth.ts`가 `DIDIM_API_KEY` 단독 자동감지를 미지원하므로 명시적
> `LLM_PROVIDER` 설정 없이는 앱 진입 불가. 상세:
> [05_validation_plan.md #19](../detail_plan/05_validation_plan.md), 리스크 R9.

---

## 4. 리스크 매트릭스 (전체)

| #   | 리스크                                                                  | 영향 | Phase | 대응 방안                                                                                                        |
| --- | ----------------------------------------------------------------------- | ---- | ----- | ---------------------------------------------------------------------------------------------------------------- |
| R1  | `DEFAULT_PROVIDER_MODELS` 교체 시 기존 테스트 깨짐                      | 🟠   | 1     | 기존 테스트 먼저 확인, 단계적 교체                                                                               |
| R2  | `isModelOwnedByOtherProvider` prefix 오탐                               | 🟡   | 1     | 엣지 케이스(o1, o3-pro 등) 전용 테스트                                                                           |
| R3  | `model.byProvider` 스키마 추가 시 기존 settings 파싱 오류               | 🟠   | 2     | optional 필드, 하위 호환 테스트                                                                                  |
| R4  | startup resolution 변경으로 기존 모델 선택 깨짐                         | 🟠   | 2     | `LLM_PROVIDER` 미설정 시 기존 경로 동일 동작 검증                                                                |
| R5  | `saveModelForProvider` scope 오염 (이슈 #11)                            | 🟡   | 2     | user scope 원본 읽기 전용 테스트                                                                                 |
| R6  | 기존 ModelDialog 테스트 전면 깨짐                                       | 🔴   | 3     | 기존 스냅샷 백업, 단계적 수정                                                                                    |
| R7  | `handleSelect` 영속화 누락 (sLM/byProvider)                             | 🟠   | 3     | env + slmConfig + byProvider 동기화 테스트                                                                       |
| R8  | Core rebuild 누락으로 CLI 테스트 실패                                   | 🟠   | 4     | Phase 4 시작 시 `npm run build -w @didim365/agent-cli-core` 필수                                                 |
| R9  | Didim env-only 시나리오: `useAuth.ts`가 `DIDIM_API_KEY` 자동감지 미지원 | 🟡   | 2/4   | E2E #19 전제조건을 `LLM_PROVIDER=didim`으로 명확화. `useAuth.ts` 보완은 본 프로젝트 범위 외(별도 이슈 등록 권장) |

---

## 5. 커밋 전략

Tidy First 원칙에 따라 **구조적 변경**과 **동작 변경**을 분리하여 커밋한다.

| Phase | 커밋 | 유형 | 메시지                                                                                 |
| ----- | ---- | ---- | -------------------------------------------------------------------------------------- |
| 1     | 1차  | 구조 | `feat(core): add PROVIDER_MODEL_REGISTRY + SSOT helpers (providerModels.ts)`           |
| 1     | 2차  | 동작 | `feat(core): derive DEFAULT_PROVIDER_MODELS from registry + cross-provider validation` |
| 2     | 1차  | 구조 | `feat(cli): add resolveActiveProvider util — multi-source provider detection`          |
| 2     | 2차  | 동작 | `feat(cli): add model.byProvider schema + saveModelForProvider + startup resolution`   |
| 3     | 1차  | 구조 | `feat(cli): add FreeformModelInput component for sLM model selection`                  |
| 3     | 2차  | 동작 | `feat(cli): refactor ModelDialog for multi-provider model selection`                   |
| 4     | 1차  | 검증 | `test(cli): Phase 4 quality gates — integration tests + snapshot updates`              |

---

## 6. 진행 상황 추적

### Phase별 진행 상태

| Phase | 범위                        | PRE | RED | GREEN | REFACTOR | POST | 결과서 | 커밋 | 상태    |
| ----- | --------------------------- | --- | --- | ----- | -------- | ---- | ------ | ---- | ------- |
| 1     | Core 레지스트리             | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜ 대기 |
| 2     | Provider 감지 + Settings    | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜ 대기 |
| 3     | ModelDialog + FreeformInput | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜ 대기 |
| 4     | Quality Gates + E2E         | ⬜  | —   | —     | —        | ⬜   | ⬜     | ⬜   | ⬜ 대기 |

### 최종 완료 조건

| #   | 항목                                                    | 상태 |
| --- | ------------------------------------------------------- | ---- |
| 1   | Phase 1~3 모든 TDD 사이클 (Red → Green → Refactor) 완료 | ⬜   |
| 2   | 전체 테스트 통과 (`npm test`)                           | ⬜   |
| 3   | Typecheck 에러 0개                                      | ⬜   |
| 4   | Lint 경고 0개                                           | ⬜   |
| 5   | E2E 시나리오 20개 통과                                  | ⬜   |
| 6   | Phase 1~4 각 작업 결과서 작성 완료                      | ⬜   |
| 7   | 모든 변경사항 커밋 완료 (7개 커밋)                      | ⬜   |
| 8   | PR 생성 및 코드 리뷰 요청                               | ⬜   |

---

## 7. 작업 규칙

### 7.1 TDD 사이클

1. **RED**: 실패하는 테스트를 먼저 작성한다
2. **GREEN**: 테스트를 통과하는 최소한의 코드를 구현한다
3. **REFACTOR**: 동작을 유지하면서 코드 구조를 개선한다

### 7.2 Tidy First

- 구조적 변경(파일 생성, 리팩토링)과 동작 변경(기능 추가)을 **별도 커밋**으로
  분리
- 구조적 변경을 먼저 수행한 후 동작 변경을 진행

### 7.3 Phase 간 전환

- 이전 Phase의 **모든 완료 조건**이 충족된 후에만 다음 Phase 시작
- Phase 시작 시 이전 Phase의 **작업 결과서**를 반드시 검토
- Phase 2 이후는 이전 Phase의 **회귀 테스트** 통과 확인 필수

### 7.4 작업 결과서

- 각 Phase 완료 시 `../working_history/Phase{N}_{제목}_{작업일자}.md` 작성
  (디렉토리 미존재 시 생성)
- 내용: 작업 요약, 변경 파일, 테스트 결과, 발견 이슈, 다음 Phase 인수 사항

---

**상태**: ⬜ Phase 1 시작 대기
