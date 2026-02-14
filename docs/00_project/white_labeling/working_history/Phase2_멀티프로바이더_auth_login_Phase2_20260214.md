# 멀티프로바이더 `/auth login` Phase 2 작업 결과서

> **작업일**: 2026-02-14 **작업자**: Claude Code (Opus 4.6) **브랜치**:
> `v0.1.2/white_labelling` **방법론**: TDD (Red → Green → Refactor) + Tidy First
> **설계서**: `docs/00_project/white_labeling/auth_login_멀티프로바이더_설계.md`

---

## 1. 작업 목적

Phase 1에서 구현한 프로바이더 선택 UI에 sLM (Self-hosted / Local LLM) 대화형
설정 흐름을 추가한다. 사용자가 `/auth login`에서 sLM을 선택하면 3단계 대화형
폼으로 엔드포인트/키/모델을 설정하고, OpenAI-compatible API로 인증 완료한다.

**Phase 2 범위**: SlmConfigDialog (3단계 폼) + sLM 플로우 와이어링

### 변경 전 → 변경 후

```
[변경 전] sLM 선택 시 → ConfiguringSlm 상태이나 다이얼로그 미구현 → UI 멈춤
         (Phase 1에서 PROVIDER_SELECT_ITEMS에서 제거하여 우회)

[변경 후] sLM 선택 시 → AuthState.ConfiguringSlm → SlmConfigDialog (3단계 폼)
         → Step 1: API Endpoint URL (필수, http/https 검증)
         → Step 2: API Key (선택) + Model Name (선택)
         → Step 3: API Key Header Name (선택) + Custom Headers JSON (선택)
         → save slmConfig + env vars → refreshAuth → Authenticated
```

---

## 2. 작업 결과 요약

| Step     | 내용                | 변경 파일 | 테스트    | 결과 |
| -------- | ------------------- | --------- | --------- | ---- |
| Step 2.0 | SlmConfigDialog TDD | 2 (신규)  | 11개 신규 | ✅   |
| Step 2.1 | sLM 플로우 와이어링 | 9         | 기존 통과 | ✅   |

**총 변경 파일**: 11개 (신규 2 + 수정 9) **총 테스트**: 97개 auth 테스트 통과
(기존 86 + 신규 11)

---

## 3. Phase별 상세

### 3.1 사전작업

**sLM 프로바이더 요구사항 분석** (이전 세션 Explore agent):

- `providerSelector.ts`: `LLM_PROVIDER=openai-compatible` 시 OpenAI SDK 기반
  어댑터 생성
- 필요 env vars: `LLM_PROVIDER`, `LLM_BASE_URL` (필수), `LLM_API_KEY` (선택),
  `LLM_MODEL` (선택)
- `settingsSchema.ts`: `slmConfig` 필드 이미 정의 (baseUrl, model,
  apiKeyHeaderName, customHeaders)
- `AppContainer.tsx`: `handleProviderSelect`에서 `slm` 선택 시 `ConfiguringSlm`
  라우팅 코드 자리 확보
- `useAuth.ts`: 재시작 시 `selectedProvider='openai-compatible'` 처리 로직 필요

**의존성 확인**:

- Phase 1에서 AuthState.ConfiguringSlm 이미 정의
- Phase 1에서 PROVIDER_SELECT_ITEMS에서 slm 제거 → Phase 2에서 복원 필요
- Phase 1에서 UIState/UIActions에 slm 관련 인터페이스 미정의 → 추가 필요

### 3.2 본작업 — Step 2.0: SlmConfigDialog (TDD)

**파일**: 신규 `packages/cli/src/ui/auth/SlmConfigDialog.tsx`,
`SlmConfigDialog.test.tsx`

**TDD 사이클**:

- 🔴 RED: 11개 테스트 작성 → FAIL
  - Step A: API Endpoint URL 렌더링, URL 검증 (http/https 필수), 유효 URL로 다음
    단계
  - Step B: API Key + Model Name 입력, 다음 단계 진행
  - Step C: API Key Header Name + Custom Headers JSON 입력, onComplete 콜백
  - 네비게이션: Esc로 이전 단계, Step 1에서 Esc는 onCancel
- 🟢 GREEN: 최소 구현
  - `useTextBuffer` + `TextInput` 패턴 재사용 (ApiAuthDialog와 동일)
  - 3개 `useTextBuffer` 인스턴스: 기본 버퍼 + modelBuffer + headersBuffer
  - `isValidUrl()`: `/^https?:\/\/.+/` 정규식
  - Step 간 상태 전이: `setCurrentStep()` + `buffer.setText('')`
- 🔵 REFACTOR: switch 문에 default case 추가 (ESLint)

**SlmConfig 인터페이스**:

```typescript
export interface SlmConfig {
  baseUrl: string;
  model?: string;
  apiKey?: string;
  apiKeyHeaderName?: string;
  customHeaders?: string;
}
```

### 3.3 본작업 — Step 2.1: sLM 플로우 와이어링

**9개 파일 수정**:

| #   | 파일                            | 변경 내용                                                             |
| --- | ------------------------------- | --------------------------------------------------------------------- |
| 1   | `providerMetadata.ts`           | `PROVIDER_SELECT_ITEMS`에 `'slm'` 복원 (3→4항목)                      |
| 2   | `AppContainer.tsx`              | `isConfiguringSlm` 파생 상태, `handleSlmConfigComplete`/`Cancel` 콜백 |
| 3   | `UIStateContext.tsx`            | `isConfiguringSlm: boolean` 추가                                      |
| 4   | `UIActionsContext.tsx`          | `handleSlmConfigComplete`, `handleSlmConfigCancel` 추가               |
| 5   | `DialogManager.tsx`             | `isConfiguringSlm` → SlmConfigDialog 렌더링 분기                      |
| 6   | `useAuth.ts`                    | `openai-compatible` 프로바이더 재시작 자동인증 (slmConfig → env vars) |
| 7   | `authCommand.ts`                | logout시 `slmConfig` 클리어, `LLM_BASE_URL`/`LLM_MODEL` env var 삭제  |
| 8   | `render.tsx`                    | mock 업데이트 (`isConfiguringSlm`, `handleSlmConfigComplete/Cancel`)  |
| 9   | `ProviderSelectDialog.test.tsx` | 3→4항목 반영, sLM 레이블 검증, 스냅샷 갱신                            |

**handleSlmConfigComplete 핵심 로직**:

```typescript
// 1. settings 영속 저장
settings.setValue(SettingScope.User, 'security.auth.slmConfig', slmConfig);
settings.setValue(
  SettingScope.User,
  'security.auth.selectedProvider',
  'openai-compatible',
);
settings.setValue(
  SettingScope.User,
  'security.auth.selectedType',
  AuthType.USE_GEMINI,
);

// 2. env vars 설정 → providerSelector가 openai-compatible 어댑터 생성
process.env['LLM_PROVIDER'] = 'openai-compatible';
process.env['LLM_BASE_URL'] = slmConfig.baseUrl;
if (slmConfig.apiKey) {
  process.env['LLM_API_KEY'] = slmConfig.apiKey;
}
if (slmConfig.model) {
  process.env['LLM_MODEL'] = slmConfig.model;
}

// 3. refreshAuth → providerSelector → OpenAI-compatible adapter
await config.refreshAuth(AuthType.USE_GEMINI);
setAuthState(AuthState.Authenticated);
```

**useAuth 재시작 자동인증 (openai-compatible)**:

```typescript
if (provider === 'openai-compatible') {
  // slmConfig 로드 → baseUrl 없으면 ConfiguringSlm
  // env vars 설정 → API key는 선택 (없어도 인증 진행)
}
```

---

## 4. 검증 결과

### 단위 테스트

| 테스트 파일                     | 테스트 수              | 결과 |
| ------------------------------- | ---------------------- | ---- |
| `SlmConfigDialog.test.tsx`      | 11 (신규)              | ✅   |
| `ProviderSelectDialog.test.tsx` | 19 (기존, 항목수 변경) | ✅   |
| `ApiAuthDialog.test.tsx`        | 10                     | ✅   |
| `AuthDialog.test.tsx`           | 26                     | ✅   |
| `useAuth.test.tsx`              | 22                     | ✅   |
| `AuthInProgress.test.tsx`       | 4                      | ✅   |
| `authCommand.test.ts`           | 5                      | ✅   |
| **합계**                        | **97**                 | ✅   |

### 통합 검증

| 항목                | 결과    |
| ------------------- | ------- |
| `npm run lint`      | ✅ PASS |
| `npm run typecheck` | ✅ PASS |
| auth 테스트 회귀    | ✅ 없음 |

---

## 5. 이슈 및 해결

| #   | 이슈                                 | 원인                                               | 해결                                         |
| --- | ------------------------------------ | -------------------------------------------------- | -------------------------------------------- |
| 1   | `@testing-library/react` import 실패 | 프로젝트에 해당 패키지 미설치                      | `import { act } from 'react'` 로 변경        |
| 2   | Step B 테스트에서 상태 전이 미반영   | `pressEnterInTextInput()` 후 React 상태 미업데이트 | `act()` 래핑으로 해결                        |
| 3   | ESLint `default-case` 경고           | switch 문에 default case 미지정                    | `default: return ''` / `default: break` 추가 |
| 4   | ProviderSelectDialog 항목 수 변경    | slm 복원으로 3→4항목                               | 테스트 기대값 + 스냅샷 갱신                  |
| 5   | UIActions mock 누락                  | `handleSlmConfigComplete/Cancel` 미정의            | `render.tsx` mockUIActions에 추가            |

---

## 6. 교훈 (Lessons Learned)

1. **다중 TextBuffer 패턴**: 한 다이얼로그에서 여러 입력 필드를 관리할 때 별도
   `useTextBuffer` 인스턴스 사용 (buffer, modelBuffer, headersBuffer)
2. **sLM API key 선택성**: Claude/OpenAI와 달리 sLM은 API key 없이도 인증 진행 →
   `AwaitingApiKeyInput` 리다이렉트 불필요
3. **React `act()` import**: `@testing-library/react` 대신 `react` 자체에서
   `act` import 가능 (ink-testing-library 환경)
4. **PROVIDER_SELECT_ITEMS 라이프사이클**: Phase 1에서 미구현 항목 제거 → Phase
   2에서 복원 → 항상 테스트/스냅샷 갱신 필요
5. **env var 정리 확장**: sLM은 `LLM_BASE_URL`/`LLM_MODEL` 추가 env var 사용 →
   logout에서도 정리 필요

---

## 7. 다음 단계

### Phase 3: Vertex AI + Google Login

- VertexConfigDialog 구현 (인증 방법 선택 + project/location 입력)
- AppContainer `handleVertexConfigComplete` 와이어링
- DialogManager `ConfiguringVertex` 렌더링 분기
- PROVIDER_SELECT_ITEMS에 `'vertex-ai'` 복원

### Phase 4: 하위 호환 + 마이그레이션

- initializer.ts에 `migrateAuthSettings()` 추가
- auth.ts에 `validateProviderAuth()` 추가
- E2E 수동 검증 5개 시나리오

---

---

## 8. 리뷰 반영 (Phase 1 + Phase 2)

> **리뷰 일시**: 2026-02-14 **이슈 총 5건**: 높음 2건 + 중간 3건 → **전부 확인
> 후 수정 완료**

### 이슈 목록 및 수정 결과

| #   | 심각도 | 이슈                                                     | 관련 파일                                                   | 수정 내용                                                                                                                       |
| --- | ------ | -------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 높음   | SlmConfigDialog 멀티 TextInput 포커스 문제               | `SlmConfigDialog.tsx`                                       | `focusedField` 상태 + Tab 키 전환 + `focus` prop 적용 + 시각적 border 표시                                                      |
| 2   | 높음   | Step 3 고급 설정(apiKeyHeaderName, customHeaders) 미매핑 | `AppContainer.tsx`, `useAuth.ts`                            | `handleSlmConfigComplete`에 `LLM_API_KEY_HEADER`/`LLM_CUSTOM_HEADERS` env var 매핑 추가, useAuth 재시작 경로에도 동일 매핑 추가 |
| 3   | 중간   | sLM 재설정 시 이전 env var 잔존                          | `AppContainer.tsx`, `useAuth.ts`, `authCommand.ts`          | 설정 전 `delete process.env[...]`로 optional env vars 명시적 정리, logout에 `LLM_API_KEY_HEADER`/`LLM_CUSTOM_HEADERS` 추가      |
| 4   | 중간   | 저장값(openai-compatible) vs UI값(slm) 매핑 누락         | `ProviderSelectDialog.tsx`, `ProviderSelectDialog.test.tsx` | `currentProvider === 'openai-compatible'` → `slm` 매핑 추가, 테스트 1건 추가                                                    |
| 5   | 중간   | `ENABLE_MULTI_PROVIDER` 플래그 누락으로 비-Gemini 무동작 | `AppContainer.tsx`, `useAuth.ts`, `authCommand.ts`          | 모든 비-Gemini 인증 경로(7곳)에 `ENABLE_MULTI_PROVIDER=true` 추가, Gemini 경로/logout에 `delete` 추가                           |

### 이슈 상세

#### Issue 1: SlmConfigDialog 멀티 TextInput 포커스 관리

**문제**: Step 2(API Key + Model)와 Step 3(Header + Custom Headers)에서 여러
TextInput이 동시에 `focus=true`가 되어 키 입력이 양쪽에 모두 전달되는 문제.
`useKeypress`는 broadcast 모델이므로 `isActive`/`focus` prop으로 제어 필수.

**수정**:

- `focusedField` 상태 (`'primary' | 'secondary'`) 추가
- Tab 키 핸들러로 포커스 전환
- 각 TextInput에 `focus={focusedField === 'primary'|'secondary'}` prop 적용
- 포커스된 필드에 `theme.border.focused` 색상 표시
- Step 전환 시 `focusedField` → `'primary'`로 리셋
- Footer에 "Tab to switch fields" 안내 추가

**참조 패턴**: `BaseSettingsDialog.tsx`, `EditorSettingsDialog.tsx`의 Tab 기반
포커스 전환

#### Issue 2: Step 3 고급 설정 env var 미매핑

**문제**: `SlmConfigDialog`가 `apiKeyHeaderName`과 `customHeaders`를 수집하지만,
`handleSlmConfigComplete`에서 해당 값을 env var(`LLM_API_KEY_HEADER`,
`LLM_CUSTOM_HEADERS`)로 설정하지 않아 `bootstrap.ts`에 전달되지 않음.

**수정**:

- `AppContainer.tsx` `handleSlmConfigComplete`: `slmConfig.apiKeyHeaderName` →
  `LLM_API_KEY_HEADER`, `slmConfig.customHeaders` → `LLM_CUSTOM_HEADERS` 매핑
- `useAuth.ts` openai-compatible 재시작 경로: 동일 매핑 추가

#### Issue 3: sLM 재설정 시 stale env var

**문제**: sLM 재설정 시 이전 설정의 optional env var(LLM_MODEL, LLM_API_KEY
등)가 잔존하여 의도치 않은 동작 유발.

**수정**:

- `handleSlmConfigComplete`에서 새 값 설정 전 optional env vars 일괄 `delete`
- `useAuth.ts` 재시작 경로에도 동일 패턴 적용
- `authCommand.ts` logout에 `LLM_API_KEY_HEADER`, `LLM_CUSTOM_HEADERS` 정리 추가

#### Issue 4: 저장값 vs UI값 매핑 누락

**문제**: settings에 `selectedProvider='openai-compatible'`로 저장되지만,
ProviderSelectDialog의 items는 `value='slm'` 사용. `/auth login` 재진입 시 초기
선택이 맞지 않음.

**수정**:

- `ProviderSelectDialog.tsx`: `currentProvider === 'openai-compatible'` → `slm`
  매핑 추가
- 테스트 1건 추가: `'maps openai-compatible to slm (index 3)'`

#### Issue 5: ENABLE_MULTI_PROVIDER 플래그 미설정

**문제**: `isMultiProviderEnabled()` (featureFlag.ts)가 `ENABLE_MULTI_PROVIDER`
env var를 확인하며 기본값 `false`. 비-Gemini 프로바이더 선택 시 이 플래그를
설정하지 않으면 `contentGenerator.ts:299`에서 ProviderFactory 경로가 아닌 Gemini
SDK 경로로 폴스루.

**수정**:

- `AppContainer.tsx`: `handleApiKeySubmit` (비-Gemini),
  `handleSlmConfigComplete`에 `ENABLE_MULTI_PROVIDER=true` 추가
- `AppContainer.tsx`: Gemini 경로에
  `delete process.env['ENABLE_MULTI_PROVIDER']` 추가
- `useAuth.ts`: env var 자동감지 3곳(LLM_PROVIDER, ANTHROPIC_API_KEY,
  OPENAI_API_KEY) + 재시작 2곳(openai-compatible, claude/openai)에
  `ENABLE_MULTI_PROVIDER=true` 추가
- `authCommand.ts`: logout에 `delete process.env['ENABLE_MULTI_PROVIDER']` 추가

### 리뷰 반영 검증 결과

| 항목                             | 결과         |
| -------------------------------- | ------------ |
| `npm run typecheck`              | ✅ PASS      |
| `npm run lint`                   | ✅ PASS      |
| auth 테스트 (107건)              | ✅ 전부 통과 |
| authCommand 테스트               | ✅ 전부 통과 |
| ProviderSelectDialog 신규 테스트 | ✅ 통과      |

---

---

## 9. 추가 리뷰 반영 (2차)

> **리뷰 일시**: 2026-02-14 **이슈 총 5건**: 높음 2건 + 중간 2건 + 낮음 1건

### 코드 기반 검증 결과

| #   | 심각도 | 이슈                                      | 검증 결과                        | 수정 내용                                                |
| --- | ------ | ----------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| 1   | 높음   | SlmConfigDialog 다중 포커스               | ✅ 이전 커밋(3c3f694)에서 수정됨 | `focus` prop + `focusedField` 상태 이미 적용             |
| 2   | 높음   | Step3 고급 설정 env var 미매핑            | ✅ 이전 커밋(3c3f694)에서 수정됨 | `LLM_API_KEY_HEADER`/`LLM_CUSTOM_HEADERS` 매핑 이미 적용 |
| 3   | 중간   | LLM_MODEL env var 프로바이더 전환 시 누수 | ❌ **실제 버그 확인**            | 3곳에 sLM env var 정리 추가                              |
| 4   | 중간   | slm/openai-compatible 키 불일치           | ✅ 이전 커밋(3c3f694)에서 수정됨 | `openai-compatible→slm` 매핑 이미 적용                   |
| 5   | 낮음   | 테스트 갭                                 | ❌ **확인됨**                    | useAuth 3건 + DialogManager 2건 테스트 추가              |

### Issue 3 상세: LLM_MODEL env var 프로바이더 전환 시 누수

**문제**: sLM 설정 완료 시 `LLM_MODEL` 등 env var를 설정하지만, 이후
`/auth login`으로 Claude/OpenAI나 Gemini로 전환 시 이를 정리하지 않음.
`providerSelector.ts:262`에서 `LLM_MODEL`이 non-Gemini 모델 결정에 최우선
사용되므로, sLM에서 설정한 모델명(e.g., `llama3`)이 Claude/OpenAI에도 적용되는
심각한 버그.

**수정 (3곳)**:

1. `AppContainer.tsx` `handleApiKeySubmit` Gemini 경로: `LLM_MODEL`,
   `LLM_BASE_URL`, `LLM_API_KEY_HEADER`, `LLM_CUSTOM_HEADERS` delete 추가
2. `AppContainer.tsx` `handleApiKeySubmit` non-Gemini 경로: sLM-specific env
   vars 5개 delete 후 새 값 설정
3. `useAuth.ts` Claude/OpenAI 재시작 경로: sLM-specific env vars 5개 delete 추가

**영향받는 env vars**: `LLM_MODEL`, `LLM_BASE_URL`, `LLM_API_KEY`,
`LLM_API_KEY_HEADER`, `LLM_CUSTOM_HEADERS`

### Issue 5 상세: 테스트 갭 보강

**추가된 테스트**:

| 파일                     | 테스트명                                                            | 검증 내용                                      |
| ------------------------ | ------------------------------------------------------------------- | ---------------------------------------------- |
| `useAuth.test.tsx`       | openai-compatible restart with slmConfig including advanced headers | sLM 재기동 시 전체 env var (6개) 올바르게 설정 |
| `useAuth.test.tsx`       | ConfiguringSlm when openai-compatible has no baseUrl                | baseUrl 없으면 ConfiguringSlm 상태 전이        |
| `useAuth.test.tsx`       | clean sLM env vars when restarting with Claude provider             | Claude 재시작 시 sLM env vars 5개 정리 확인    |
| `DialogManager.test.tsx` | isSelectingProvider → ProviderSelectDialog                          | 프로바이더 선택 다이얼로그 렌더 확인           |
| `DialogManager.test.tsx` | isConfiguringSlm → SlmConfigDialog                                  | sLM 설정 다이얼로그 렌더 확인                  |

**테스트 beforeEach 보강**: `ENABLE_MULTI_PROVIDER`, `LLM_MODEL`,
`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_API_KEY_HEADER`, `LLM_CUSTOM_HEADERS` env
var cleanup 추가

### 검증 결과

| 항목                        | 결과             |
| --------------------------- | ---------------- |
| `npm run typecheck`         | ✅ PASS          |
| `npm run lint`              | ✅ PASS          |
| auth 테스트 (110건)         | ✅ 전부 통과     |
| authCommand 테스트 (9건)    | ✅ 전부 통과     |
| DialogManager 테스트 (20건) | ✅ 전부 통과     |
| useAuth 신규 테스트 (3건)   | ✅ 전부 통과     |
| **전체 (130건)**            | ✅ **전부 통과** |

---

---

## 10. 추가 리뷰 반영 (3차)

> **리뷰 일시**: 2026-02-14 **이슈 1건**: 중간

### 이슈: sLM API Key를 비워서 저장해도 키체인에 이전 키가 잔존

**문제**: `handleSlmConfigComplete`에서 `slmConfig.apiKey`가 truthy일 때만
`saveProviderApiKey`를 호출. 사용자가 API key를 의도적으로 비우면 키체인 삭제가
수행되지 않아, 재시작 시 `reloadProviderApiKey('openai-compatible')`가 이전 키를
다시 로드.

**수정**: `if (slmConfig.apiKey)` 가드 제거 → 항상
`saveProviderApiKey('openai-compatible', slmConfig.apiKey)` 호출.
`saveProviderApiKey`는 빈값/undefined 전달 시 `deleteCredentials`를 실행하므로
키체인이 올바르게 동기화됨.

```typescript
// Before (buggy)
if (slmConfig.apiKey) {
  await saveProviderApiKey('openai-compatible', slmConfig.apiKey);
  process.env['LLM_API_KEY'] = slmConfig.apiKey;
}

// After (fixed)
await saveProviderApiKey('openai-compatible', slmConfig.apiKey);
if (slmConfig.apiKey) {
  process.env['LLM_API_KEY'] = slmConfig.apiKey;
}
```

### 검증 결과

| 항목                | 결과             |
| ------------------- | ---------------- |
| `npm run typecheck` | ✅ PASS          |
| `npm run lint`      | ✅ PASS          |
| **전체 (130건)**    | ✅ **전부 통과** |

---

**작성일**: 2026-02-14 **상태**: ✅ Phase 2 완료 + 리뷰 1차·2차·3차 반영 완료
