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

**작성일**: 2026-02-14 **상태**: ✅ Phase 2 완료
