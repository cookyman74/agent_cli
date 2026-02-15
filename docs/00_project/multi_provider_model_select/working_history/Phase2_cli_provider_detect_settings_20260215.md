# Phase 2: CLI 프로바이더 감지 + Settings 확장

**작업일**: 2026-02-15 **작업자**: Claude Opus 4.6 **브랜치**:
`v0.1.2/white_labelling` **설계문서**:
`docs/00_project/multi_provider_model_select/02_Phase2_cli_provider_detect_and_settings.md`

---

## 1. 작업 범위

| 항목     | 내용                                                                                  |
| -------- | ------------------------------------------------------------------------------------- |
| 목표     | `/model` 다이얼로그가 프로바이더별 모델 목록을 표시하기 위한 인프라 구축              |
| 범위     | resolveActiveProvider 유틸, settings 스키마 확장(byProvider), startup 모델 resolution |
| 선행조건 | Phase 1 PROVIDER_MODEL_REGISTRY SSOT (M1.0-M1.4) ✅                                   |

## 2. 구현 상세

### 2.1 resolveActiveProvider 유틸 (NEW)

**파일**: `packages/cli/src/ui/utils/resolveActiveProvider.ts`

- `resolveActiveProvider(selectedProvider?)` — 다중 소스 프로바이더 감지
  - Priority: selectedProvider → LLM_PROVIDER env → API 키 기반 → fallback
    'gemini'
- `normalizeProviderKey(key)` — UI/env 키 → 레지스트리 키 매핑
  - slm → openai-compatible, vertex-ai → gemini, didim-studio → didim

**테스트**: `resolveActiveProvider.test.ts` — 19 tests

- normalizeProviderKey (6), selectedProvider priority (5), LLM_PROVIDER fallback
  (2), API key detection (4), fallback (2)

### 2.2 Settings 스키마 확장

**파일**: `packages/cli/src/config/settingsSchema.ts`

- `model.byProvider` 추가 (type: object, showInDialog: false, default: {})
- 프로바이더별 마지막 선택 모델 기억용

**테스트**: `settingsSchema.test.ts` — 기존 22 → 26 tests (+4)

### 2.3 saveModelForProvider 헬퍼 (NEW)

**파일**: `packages/cli/src/config/settings.ts`

- `saveModelForProvider(loadedSettings, provider, model)` — 듀얼 쓰기
  - `model.name` (전역, 하위호환) + `model.byProvider[provider]` (프로바이더별)
  - User scope only 읽기 — scope pollution 방지 (Issue #11)

**테스트**: `saveModelForProvider.test.ts` — 5 tests (lightweight mock, no fs/os
dependency)

### 2.4 Startup 모델 Resolution 확장

**파일**: `packages/cli/src/config/config.ts`

- `activeProvider` 계산: LLM_PROVIDER → selectedProvider(normalized) → undefined
- specifiedModel 우선순위: argv.model > LLM_MODEL > GEMINI_MODEL >
  **byProvider[activeProvider]** > model.name
- `normalizeProviderKeyForStartup()` 헬퍼 — undefined 안전 처리

**테스트**: `config.test.ts` — 기존 179 → 181 tests (+2 net new, 3 기존 호환)

## 3. 테스트 요약

| 파일                          | 테스트 수 | 상태    |
| ----------------------------- | --------- | ------- |
| resolveActiveProvider.test.ts | 19        | ✅ PASS |
| settingsSchema.test.ts        | 26        | ✅ PASS |
| saveModelForProvider.test.ts  | 5         | ✅ PASS |
| config.test.ts                | 181       | ✅ PASS |
| **Phase 2 합계**              | **231**   | ✅      |
| Core 회귀 (Phase 1)           | 5348      | ✅ PASS |

## 4. 검증

- [x] Phase 2 전체 231 tests PASS
- [x] Core 회귀 5348 tests PASS (281 files)
- [x] ESLint PASS
- [x] TypeScript typecheck PASS
- [x] Build PASS
- [x] 기존 CLI 실패 4건 확인 — Phase 2 무관 (initCommand 2, extensions 2건, 기존
      인프라 이슈)

## 5. 설계 결정 기록

| 결정                                    | 근거                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| resolveActiveProvider를 ui/utils에 배치 | ModelDialog(Phase 3)와 config.ts 양쪽에서 사용, UI 레이어 유틸 |
| normalizeProviderKey 별도 export        | config.ts startup에서 직접 import 재사용                       |
| byProvider: showInDialog=false          | 사용자에게 직접 노출할 설정이 아님                             |
| User scope only 읽기                    | workspace/system 값이 user scope로 역류 방지                   |
| normalizeProviderKeyForStartup wrapper  | undefined 입력 안전 처리, inline 대비 의도 명확                |

## 6. 리스크 매트릭스 대응 결과

| 리스크                                                         | 대응                                                                                                                                     | 상태                         |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `model.byProvider` 스키마 추가 시 기존 settings 파싱 오류      | optional 필드, default={}, 기존 181 config tests 전수 PASS                                                                               | ✅ 해소                      |
| startup resolution 변경으로 기존 모델 선택 깨짐                | 기존 179 tests 유지 + 2 new behavioral tests PASS                                                                                        | ✅ 해소                      |
| `saveModelForProvider` scope 오염 (이슈 #11)                   | user scope only 읽기 + 전용 테스트 (`scope 오염 방지`)                                                                                   | ✅ 해소                      |
| `resolveActiveProvider()` vs Core `selectProvider()` drift     | API 키 감지 순서가 코드 수준에서 동일함을 확인 (ANTHROPIC→OPENAI→DIDIM). 명시적 cross-validation 테스트는 미작성                         | ⚠️ Phase 4 E2E에서 검증 예정 |
| Didim env-only: `useAuth.ts`가 `DIDIM_API_KEY` 자동감지 미지원 | `resolveActiveProvider()`는 감지 가능하나 앱 진입(`useAuth`)에서 제한. Known limitation — E2E 전제조건을 `LLM_PROVIDER=didim`으로 명확화 | ⚠️ 기존 알려진 한계          |

## 7. 파일 변경 목록

### 신규

- `packages/cli/src/ui/utils/resolveActiveProvider.ts`
- `packages/cli/src/ui/utils/resolveActiveProvider.test.ts`
- `packages/cli/src/config/saveModelForProvider.test.ts`

### 수정

- `packages/cli/src/config/settingsSchema.ts` — byProvider 스키마 추가
- `packages/cli/src/config/settingsSchema.test.ts` — +4 tests
- `packages/cli/src/config/settings.ts` — saveModelForProvider() 추가
- `packages/cli/src/config/config.ts` — startup resolution +
  normalizeProviderKey import
- `packages/cli/src/config/config.test.ts` — +5 tests (2 net new)
