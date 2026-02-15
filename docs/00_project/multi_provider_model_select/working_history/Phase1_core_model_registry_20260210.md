# Phase 1 작업 결과서: Core — 모델 레지스트리 + Provider Selector 정합성

**작업일**: 2026-02-10 **브랜치**: `v0.1.2/white_labelling` **상태**: ✅ 완료

---

## 1. 작업 요약

Phase 1은 Multi-Provider `/model` Command의 Core 레이어 기반을 구축하는
작업이다. `PROVIDER_MODEL_REGISTRY`를 SSOT로 생성하고, 기존
`DEFAULT_PROVIDER_MODELS`를 레지스트리에서 파생하도록 교체하며,
`resolveProviderModel()`에 cross-provider 모델 검증을 추가했다.

### TDD 사이클

| 단계            | 내용                                                          | 상태 |
| --------------- | ------------------------------------------------------------- | ---- |
| 1.1 사전 작업   | 기존 코드 분석 + 베이스라인 테스트 (34 PASS)                  | ✅   |
| 1.2 RED         | `providerModels.test.ts` — 30개 테스트 작성 (FAIL 확인)       | ✅   |
| 1.3 GREEN       | `providerModels.ts` 구현 + `index.ts` export (30 PASS)        | ✅   |
| 1.4 RED (2차)   | `providerSelector.test.ts` — 10개 테스트 추가 (5 FAIL 확인)   | ✅   |
| 1.5 GREEN (2차) | `providerSelector.ts` 수정 (44 PASS)                          | ✅   |
| 1.6 REFACTOR    | JSDoc 업데이트, 불필요한 타입 캐스팅 제거, 미사용 import 정리 | ✅   |
| 1.7 사후 작업   | 빌드 + 린트 + 타입체크 + 결과서 + 커밋                        | ✅   |

---

## 2. 변경 파일

| 파일                                                   | 변경     | 내용                                                |
| ------------------------------------------------------ | -------- | --------------------------------------------------- |
| `packages/core/src/config/providerModels.ts`           | **신규** | PROVIDER_MODEL_REGISTRY, 헬퍼 함수 3개              |
| `packages/core/src/config/providerModels.test.ts`      | **신규** | 30개 테스트 (구조/기본모델/검증)                    |
| `packages/core/src/providers/providerSelector.ts`      | 수정     | DEFAULT_PROVIDER_MODELS 파생 + cross-provider 검증  |
| `packages/core/src/providers/providerSelector.test.ts` | 수정     | 10개 테스트 추가 (레지스트리 파생 + cross-provider) |
| `packages/core/src/index.ts`                           | 수정     | providerModels.ts public export 추가                |

---

## 3. 테스트 결과

### 신규 테스트 (providerModels.test.ts): 30 PASS

- PROVIDER_MODEL_REGISTRY 구조: 8개
- getDefaultModelFromRegistry: 6개
- isModelValidForProvider: 16개

### 신규 테스트 (providerSelector.test.ts 추가): 16 PASS

- DEFAULT_PROVIDER_MODELS from registry: 4개
- resolveProviderModel cross-provider validation: 6개
- 리뷰 반영 — LLM_MODEL cross-provider 검증: 3개
- 리뷰 반영 — Didim modelSelectionDisabled 강제: 3개

### 회귀 테스트

- 기존 providerSelector.test.ts: 34 → 모두 PASS (회귀 없음)
- Core 전체: 281 파일, 5339 PASS, 0 FAIL
- 리뷰 반영 후 전체: 80 PASS (providerModels 30 + providerSelector 50)

### Quality Gates

| Gate      | 결과        |
| --------- | ----------- |
| Build     | ✅          |
| Lint      | ✅ 0 errors |
| Typecheck | ✅ 0 errors |

---

## 4. 주요 결정 및 이슈

### 4.1 Gemini 기본값

`getDefaultModelFromRegistry('gemini')`은 `gemini-2.5-pro`를 반환한다
(`auto-gemini-3`이 아님). Auto 모델 분기(`previewFeatures` 여부)는 기존
`config.ts`의 로직이 담당한다.

### 4.2 DEFAULT_PROVIDER_MODELS 변경

| 프로바이더 | 이전 값                    | 변경 후 값              |
| ---------- | -------------------------- | ----------------------- |
| Claude     | `claude-sonnet-4-20250514` | `claude-opus-4-6`       |
| OpenAI     | `gpt-4o`                   | `gpt-4.1`               |
| Gemini     | `gemini-2.5-pro`           | `gemini-2.5-pro` (동일) |

### 4.3 isModelOwnedByOtherProvider

OpenAI의 `o3`, `o4-mini` 등 `o[0-9]` prefix 패턴을 정규식으로 매칭하여
cross-provider 차단 대상에 포함시켰다.

### 4.4 lint 수정

- `provider as string` 불필요 캐스팅 제거 (ProviderType은 string enum)
- 테스트 파일 미사용 type import 및 unused 변수(`key`) 제거

---

## 5. 리뷰 반영 (2026-02-10)

### 5.1 [MEDIUM] LLM_MODEL cross-provider 검증 우회

- **위치**: `providerSelector.ts` — `resolveProviderModel()` Gemini-specific
  분기
- **문제**: `LLM_MODEL` env를 `isModelValidForProvider()` 없이 반환 → OpenAI
  provider에서 `LLM_MODEL=claude-opus-4-6`이 그대로 통과
- **수정**: `LLM_MODEL` 반환 전 `isModelValidForProvider(llmModel, provider)`
  검증 추가. `freeformInput` provider(openai-compatible)는
  `isModelValidForProvider()`가 이미 `true` 반환하므로 별도 예외 불필요.
- **테스트**: 3개 추가
  - cross-provider LLM_MODEL 거부 (claude on openai → gpt-4.1)
  - valid LLM_MODEL 허용 (gpt-4o-2024-08-06 on openai)
  - unknown-prefix LLM_MODEL 허용 (my-local-llama on openai)

### 5.2 [MEDIUM] Didim modelSelectionDisabled passthrough 허용

- **위치**: `providerSelector.ts` — `resolveProviderModel()` 전체
- **문제**: `isModelValidForProvider('gpt-4.1', 'didim')` → `true`
  (modelSelectionDisabled 스킵) → 이전 provider 모델이 Didim에 전달
- **수정**: `resolveProviderModel()` 최상단에
  `group?.modelSelectionDisabled → getDefaultModelFromRegistry(provider)` 조기
  반환 추가. `isModelValidForProvider()` 정책은 변경하지 않음 (validation과
  resolution의 책임 분리 유지).
- **테스트**: 3개 추가
  - non-Gemini 모델(gpt-4.1) → didim-default 강제
  - Gemini 모델(gemini-2.5-pro) → didim-default 강제
  - LLM_MODEL 설정 시에도 → didim-default 강제

### 5.3 Quality Gates (리뷰 반영 후)

| Gate      | 결과            |
| --------- | --------------- |
| Tests     | 80 PASS (30+50) |
| Build     | ✅              |
| Lint      | ✅ 0 errors     |
| Typecheck | ✅ 0 errors     |

---

## 6. Phase 2 인수 사항

- `PROVIDER_MODEL_REGISTRY`는 `@didim365/agent-cli-core`에서 export됨
- `getDefaultModelFromRegistry()`, `isModelValidForProvider()` 사용 가능
- Phase 2에서 `resolveActiveProvider()`가 이 레지스트리 키와 매칭되어야 함
- `DEFAULT_PROVIDER_MODELS` 값이 변경됨 (Claude: opus, OpenAI: gpt-4.1) — Phase
  2 테스트에서 이 값 기준으로 검증 필요
- `LLM_MODEL`은 cross-provider 검증 대상 — Phase 2의 sLM env 동기화 시
  `isModelValidForProvider()` 통과하는 모델만 설정해야 함
- Didim provider는 `resolveProviderModel()`에서 항상 `didim-default` 반환 —
  Phase 3 ModelDialog에서 Didim 모델 선택 비활성 처리와 일관
