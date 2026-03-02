# 작업결과서: Provider Default Model 업데이트

**작업일**: 2026-03-02 **브랜치**: `DID/v0.2` → `v0.3.1/add_default_model`
**작업자**: Claude Opus 4.6 **버전**: v0.3.1

---

## 1. 작업 요약

PROVIDER_MODEL_REGISTRY에 OpenAI `gpt-5.3-codex` 모델을 추가하고 기본 모델로
설정:

| Provider   | Before (기존 기본) | After (변경 후 기본)        |
| ---------- | ------------------ | --------------------------- |
| **OpenAI** | `gpt-5.2`          | `gpt-5.3-codex` (신규 추가) |
| **Gemini** | `gemini-2.5-pro`   | 변경 없음 (Stable/GA 유지)  |
| **Claude** | `claude-opus-4-6`  | 변경 없음                   |

### 1.1 Gemini 기본 모델 유지 결정

`gemini-3.1-pro-preview`를 기본 모델로 변경하는 방안을 검토했으나, 공식 문서
확인 결과 **여전히 Preview 상태**이므로 기본 모델을 `gemini-2.5-pro`
(Stable/GA)로 유지:

| 모델                     | 상태              | 비고                            |
| ------------------------ | ----------------- | ------------------------------- |
| `gemini-3.1-pro-preview` | **Preview** (New) | 2026-02-19 출시, GA 시기 미정   |
| `gemini-3-pro-preview`   | **Discontinuing** | 2026-03-09 종료 예정            |
| `gemini-2.5-pro`         | **Stable (GA)**   | 현재 안정 버전 → 기본 모델 유지 |

- `providerModels.ts` 레지스트리에 `gemini-3.1-pro-preview` 모델은 목록에 포함
  (수동 선택 가능)
- Preview 기능 활성화 시 `auto-gemini-3` 프리셋으로 Gemini 3 계열 사용 가능
- `models.ts`의 `DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'` 상수 변경 없음

---

## 2. 변경 내역

### 2.1 `packages/core/src/config/providerModels.ts` (SSOT)

**OpenAI 섹션:**

- `gpt-5.3-codex` 모델 신규 추가 (models 배열 첫 번째 위치)
  - `description: 'Codex model for software engineering, 1M context'`
  - `isDefault: true`
- `gpt-5.2`에서 `isDefault: true` 제거
- preset 변경: `value: 'gpt-5.3-codex'`, `title: 'Recommended (gpt-5.3-codex)'`

**Gemini 섹션:**

- `isDefault: true`는 `gemini-2.5-pro`에 유지 (변경 없음)
- `gemini-3.1-pro-preview`는 목록 첫 번째 항목으로 배치 (description 추가)

### 2.2 테스트 파일 업데이트 (3개)

| 파일                                                   | 변경 내용                                                            |
| ------------------------------------------------------ | -------------------------------------------------------------------- |
| `packages/core/src/config/providerModels.test.ts`      | `getDefaultModelFromRegistry('openai')` 기대값: `gpt-5.3-codex`      |
| `packages/core/src/providers/providerSelector.test.ts` | OpenAI default + cross-provider fallback 기대값 업데이트             |
| `packages/cli/src/ui/components/ModelDialog.test.tsx`  | OpenAI preset 제목, mockGetModel 기본값, manual 모델 목록 assertions |

---

## 3. 테스트 결과

### 3.1 직접 관련 테스트

| 테스트 파일                | 결과     | 테스트 수 |
| -------------------------- | -------- | --------- |
| `providerModels.test.ts`   | **PASS** | 33/33     |
| `providerSelector.test.ts` | **PASS** | 71/71     |
| `ModelDialog.test.tsx`     | **PASS** | 30/30     |

### 3.2 전체 패키지 테스트

| 패키지                            | 결과                       | 테스트 수               |
| --------------------------------- | -------------------------- | ----------------------- |
| `@didim365/agent-cli` (CLI)       | **ALL PASS**               | 4,856/4,856 (352 files) |
| `@didim365/agent-cli-core` (Core) | **5,936 pass / 2 timeout** | 291/293 files           |

### 3.3 Core 패키지 2건 Timeout 분석

**결론: 기존부터 존재하는 flaky timeout — 본 작업과 무관**

| 테스트                                                                             | 원인                                                      |
| ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `src/index.test.ts` > "should export GeminiChat..."                                | `await import('./index.js')` barrel export 전체 해석 ~3s  |
| `src/hooks/hookSystem_new_types.test.ts` > "should have fireBeforeModelEventV2..." | `await import('./hookEventHandler.js')` 전이적 import ~3s |

**상세 분석:**

1. **단독 실행 시 PASS**: 두 테스트를 단독 실행하면 각각 ~3초에 완료되어 **21/21
   pass**
2. **전체 스위트 실행 시 FAIL**: 293개 파일 동시 실행 시 worker thread 리소스
   경쟁으로 5초 기본 timeout 초과
3. **원인**: `vitest.config.ts`에서 `timeout: 30000` 사용 — Vitest 3.x에서는
   `testTimeout` 키가 필요 (기존 `timeout` 키는 무시됨)
4. **검증**: `git stash`로 변경사항 제거 후 동일 테스트 실행 → 역시 단독 PASS
   (21/21), 전체 스위트에서 동일하게 timeout 발생
5. **변경 파일 중복 없음**: `index.ts`, `hookEventHandler.ts` 등 실패 테스트
   의존 파일은 본 작업에서 수정하지 않음

**향후 수정 방안** (별도 작업):

```diff
# packages/core/vitest.config.ts
-    timeout: 30000,
-    hookTimeout: 30000,
+    testTimeout: 60000,
+    hookTimeout: 60000,
```

---

## 4. 영향 범위

### 4.1 `getDefaultModelFromRegistry()` 호출 경로

```
/auth login → provider 선택 → getDefaultModelFromRegistry(providerKey)
  → gemini: 'gemini-2.5-pro' (변경 없음)
  → openai: 'gpt-5.3-codex' (was 'gpt-5.2')

/model → ModelDialog → PROVIDER_MODEL_REGISTRY → preset/models 렌더링
  → OpenAI preset: 'Recommended (gpt-5.3-codex)'
```

### 4.2 Cross-Provider Resolution

`resolveProviderModel(staleModel, targetProvider)` fallback 시:

- Claude → OpenAI 전환: `claude-opus-4-6` → `gpt-5.3-codex` (was `gpt-5.2`)
- Gemini cross-provider fallback: `gemini-2.5-pro` 유지

### 4.3 변경하지 않은 항목

- `models.ts` 상수: `DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro'` 유지
- `isModelOwnedByOtherProvider()` prefix 패턴: `gpt-5.3-codex`는 기존
  `/^gpt-[0-9]/` 패턴에 매칭 → 변경 불필요
- Claude 기본 모델: `claude-opus-4-6` 유지
- Didim/OpenAI-compatible: 변경 없음

---

## 5. 수정 파일 요약

| #   | 파일                                                   | 변경 유형                                  |
| --- | ------------------------------------------------------ | ------------------------------------------ |
| 1   | `packages/core/src/config/providerModels.ts`           | gpt-5.3-codex 추가 + OpenAI 기본 모델 변경 |
| 2   | `packages/core/src/config/providerModels.test.ts`      | OpenAI 기대값 업데이트                     |
| 3   | `packages/core/src/providers/providerSelector.test.ts` | OpenAI 기대값 + fallback 기대값 업데이트   |
| 4   | `packages/cli/src/ui/components/ModelDialog.test.tsx`  | OpenAI UI 렌더 assertions 업데이트         |
| 5   | `packages/core/package.json`                           | 버전 0.2.26 → 0.3.1                        |
| 6   | `packages/cli/package.json`                            | 버전 0.2.26 → 0.3.1, core 의존성 0.3.1     |
