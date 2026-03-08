# TDD Plan: OpenAI GPT-5.4 / Gemini 3.1 Provider Model Update

- 기준 문서: `openai_gpt54_gemini31_provider_plan_20260308.md`
- TDD 방식: Red → Green → Refactor
- 커밋 원칙: 구조적 변경 / 동작 변경 분리

## Phase 0: Gemini Auto (Gemini 3) 라우팅 정합성 수정 ✅

### 0-1. resolveModel(PREVIEW_GEMINI_MODEL_AUTO)가 PREVIEW_GEMINI_31_MODEL을 반환

- [x] **RED**: `models.test.ts`에서 `resolveModel(PREVIEW_GEMINI_MODEL_AUTO)` →
      `PREVIEW_GEMINI_31_MODEL` 기대 테스트 추가
- [x] **GREEN**: `models.ts`의 `resolveModel()` switch case 수정:
      `PREVIEW_GEMINI_MODEL_AUTO` → `PREVIEW_GEMINI_31_MODEL` 반환
- [x] **REFACTOR**: 필요 시 상수명 정리

### 0-2. PREVIEW_CHAIN 1순위를 gemini-3.1-pro-preview로 변경

- [x] **RED**: `policyCatalog.test.ts`에서 preview chain `chain[0].model` →
      `PREVIEW_GEMINI_31_MODEL` 기대 테스트 수정
- [x] **GREEN**: `policyCatalog.ts`의 `PREVIEW_CHAIN` 배열 1순위를
      `PREVIEW_GEMINI_31_MODEL`로 변경 (import 추가)
- [x] **REFACTOR**: 기존 `PREVIEW_GEMINI_MODEL`이 fallback 2순위로 유지되는지
      확인

### 0-3. resolveClassifierModel의 preview auto 분기 갱신

- [x] **RED**: `models.test.ts`에서
      `resolveClassifierModel(PREVIEW_GEMINI_MODEL_AUTO, 'pro')` →
      `PREVIEW_GEMINI_31_MODEL` 기대
- [x] **GREEN**: `models.ts`의 `resolveClassifierModel()` 내
      `PREVIEW_GEMINI_MODEL` 참조를 `PREVIEW_GEMINI_31_MODEL`로 변경
- [x] **REFACTOR**: 없음

### 0-4. getDisplayString 정합성

- [x] **RED**: `models.test.ts`에서
      `getDisplayString(GEMINI_MODEL_ALIAS_PRO, true)` →
      `PREVIEW_GEMINI_31_MODEL` 기대
- [x] **GREEN**: `models.ts`의 `getDisplayString()` preview 분기에서
      `PREVIEW_GEMINI_31_MODEL` 반환
- [x] **REFACTOR**: 없음

### 0-5. defaultStrategy.test.ts 기대값 갱신

- [x] **RED**: `defaultStrategy.test.ts`에서 `PREVIEW_GEMINI_MODEL_AUTO` 라우팅
      기대값을 `PREVIEW_GEMINI_31_MODEL`로 수정
- [x] **GREEN**: Phase 0-1에서 이미 구현 완료 (기대값만 수정)
- [x] **REFACTOR**: 없음

### 0-6. fallbackIntegration.test.ts 기대값 갱신

- [x] **RED**: `fallbackIntegration.test.ts`에서 fallback 시나리오 기대 모델을
      3.1 기준으로 수정
- [x] **GREEN**: Phase 0-2에서 이미 구현 완료 (기대값만 수정)
- [x] **REFACTOR**: 없음

### 0-7. providerModels.ts preset 설명 갱신

- [x] **RED**: 없음 (설명 문구 변경은 동작 테스트 불가)
- [x] **GREEN**: `providerModels.ts`의 `auto-gemini-3` preset description을
      `gemini-3.1-pro-preview, gemini-3-flash-preview` 기준으로 갱신
- [x] **REFACTOR**: 없음

---

## Phase A: OpenAI 모델 레지스트리 갱신 ✅

### A-1. OpenAI preset을 gpt-5.4로 변경

- [x] **RED**: `providerModels.test.ts`에서
      `getDefaultModelFromRegistry('openai')` → `'gpt-5.4'` 기대 테스트 수정
- [x] **GREEN**: `providerModels.ts`의 OpenAI preset을 `gpt-5.4`로 변경,
      `gpt-5.4`에 `isDefault: true` 부여, `gpt-5.3-codex`에서 `isDefault` 제거
- [x] **REFACTOR**: 없음

### A-2. gpt-5.4, gpt-5.4-pro를 manual 목록에 추가

- [x] **RED**: `providerModels.test.ts`에서 OpenAI models 배열에 `gpt-5.4`,
      `gpt-5.4-pro` 포함 확인 테스트 추가
- [x] **GREEN**: `providerModels.ts`의 OpenAI models 배열에 `gpt-5.4`,
      `gpt-5.4-pro` 항목 추가
- [x] **REFACTOR**: `gpt-5.3-codex` 호환성 보존용 하단 잔류 결정

### A-3. providerSelector.test.ts 기대값 갱신

- [x] **RED**: `providerSelector.test.ts`에서
      `openai default matches registry (gpt-5.3-codex)` → `gpt-5.4` 기대값 수정
- [x] **GREEN**: Phase A-1에서 이미 구현 완료
- [x] **REFACTOR**: cross-provider fallback 테스트에서 `gpt-5.3-codex` 하드코딩
      → `gpt-5.4` 수정

### A-4. isModelValidForProvider가 gpt-5.4 계열 인식

- [x] **RED**: `providerModels.test.ts`에서
      `isModelValidForProvider('gpt-5.4', 'openai')` → `true` 테스트 추가
- [x] **GREEN**: Phase A-2에서 이미 등록 완료 (레지스트리 기반 자동 인식)
- [x] **REFACTOR**: 없음

---

## Phase B: OpenAI 가격/통계 보정 ✅

### B-1. gpt-5.4 가격 추가

- [x] **RED**: `costEstimation.test.ts`에서 `MODEL_PRICING['openai']['gpt-5.4']`
      존재 확인 테스트 추가
- [x] **GREEN**: `costEstimation.ts`의 OpenAI 가격표에 `gpt-5.4` 추가 (input
      $2.50, cached $0.625, output $20.00)
- [x] **REFACTOR**: 없음

### B-2. gpt-5.4-pro 가격 추가

- [x] **RED**: `costEstimation.test.ts`에서
      `MODEL_PRICING['openai']['gpt-5.4-pro']` 존재 확인 테스트 추가
- [x] **GREEN**: `costEstimation.ts`에 `gpt-5.4-pro` 추가 (input $30.00, output
      $180.00, cachedPerMToken 생략)
- [x] **REFACTOR**: 없음

### B-3. gpt-5-mini 가격 보정

- [x] **RED**: `costEstimation.test.ts`에서
      `MODEL_PRICING['openai']['gpt-5-mini']` 단가 검증 (input $0.25, output
      $2.00)
- [x] **GREEN**: `costEstimation.ts`의 `gpt-5-mini` 가격을 공식 기준으로 보정
      (input 0.4→0.25, cached 0.1→0.025, output 1.6→2.00)
- [x] **REFACTOR**: 없음

### B-4. gpt-5.4 비용 계산 통합 테스트

- [x] **RED**: `costEstimation.test.ts`에서 `gpt-5.4` 토큰으로 `estimateCost()`
      호출 → 비용 정확성 검증
- [x] **GREEN**: Phase B-1에서 이미 가격표 등록 완료 (estimateCost는 테이블 기반
      동작)
- [x] **REFACTOR**: 없음

---

## Phase C: Gemini 3.1 문구 정리 ✅

### C-1. providerModels.ts Gemini 3.1 displayName 명확화

- [x] **GREEN**: `providerModels.ts`의 `gemini-3.1-pro-preview` 항목에
      `displayName: 'Gemini 3.1 Pro Preview'` 추가, description에 "Preview API
      model" 명시

### C-2. 문서 갱신 — docs/cli/model.md

- [x] **GREEN**: OpenAI 섹션을 `gpt-5.4` 기준으로 갱신, Gemini 섹션에
      `gemini-3.1-pro-preview` 추가, 구형 참조 정리

### C-3. 문서 갱신 — docs/providers.md

- [x] **GREEN**: OpenAI 예시를 `gpt-5.4` 기준으로 갱신, Model Resolution 테이블
      갱신

### C-4. 문서 갱신 — docs/index.md

- [x] **GREEN**: Provider Matrix 테이블 갱신

### C-5. 문서 갱신 — docs/get-started/authentication.md

- [x] **GREEN**: OpenAI 모델 목록 갱신 (configuration.md는 참조 없음 → 스킵)

### C-6. 문서 갱신 — docs/short_manual.md

- [x] **GREEN**: 모델 지정 예시 갱신

---

## 검증 ✅

### V-1. 단위 테스트 실행

```
7 files, 172 tests — all passed
```

### V-2. 정적 검증

```
typecheck: pass
lint: pass
```

---

## 지금 하지 않을 대상 (명시적 제외)

- `gemini-3.1-pro-preview` → `gemini-3.1-pro` 일괄 rename (Phase E)
- Gemini 기본 모델을 `gemini-3.1-pro`로 교체
- `gemini-3.1-flash-lite-preview` 추가 (Phase D — 선택 사항)
- `high`/`general`을 독립 모델 ID로 등록
- quota/token/compression 경로에 미검증 stable ID 선반영
