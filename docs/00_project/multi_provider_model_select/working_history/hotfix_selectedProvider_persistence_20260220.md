# Hotfix: selectedProvider 미저장으로 인한 /model 다이얼로그 프로바이더 불일치

## 작업 일자

2026-02-20

## 증상

- Claude 사용 후 Gemini OAuth로 전환 → `/model` 명령어 실행 시 Claude 모델
  목록이 표시됨
- API Key 인증에서는 정상 동작 (세션 내 재시작 없음)

## 근본 원인

### 문제 코드: `AppContainer.tsx` — `handleAuthSelect()`

Gemini 인증(OAuth/API Key) 선택 시 `security.auth.selectedType`만 settings에
저장하고, `security.auth.selectedProvider`는 갱신하지 않음.

```
handleProviderSelect('gemini')  → setSelectedProvider('gemini') [메모리만]
handleAuthSelect(LOGIN_WITH_GOOGLE) → settings에 selectedType 저장
                                    → selectedProvider 미저장 ← 버그
process.exit(RELAUNCH_EXIT_CODE)    → 메모리 소실
재시작 → settings.merged.security.auth.selectedProvider → 이전 값 'claude' 로드
/model → resolveActiveProvider('claude') → Claude 모델 표시
```

### API Key가 정상 동작하는 이유

API Key 인증은 앱 재시작이 없으므로 메모리의 `selectedProvider='gemini'`이 세션
내내 유지됨. 단, 수동 재시작 시에는 동일 버그 발생 가능.

### 영향 범위

| 인증 방식              | 재시작 | selectedProvider 소스          | 결과             |
| ---------------------- | ------ | ------------------------------ | ---------------- |
| API Key                | ❌     | 메모리 (`setSelectedProvider`) | ✅ 정상 (우연히) |
| OAuth                  | ✅     | settings (이전 값)             | ❌ 버그          |
| API Key 후 수동 재시작 | ✅     | settings (이전 값)             | ❌ 버그          |

## 수정 내용

### 파일: `packages/cli/src/ui/AppContainer.tsx`

#### 1. `handleAuthSelect()` — Gemini 인증 선택 시 provider 저장 (line 615)

```typescript
// Before
settings.setValue(scope, 'security.auth.selectedType', authType);

// After
settings.setValue(scope, 'security.auth.selectedType', authType);
// Persist provider so /model resolves correctly after restart (e.g. OAuth)
settings.setValue(scope, 'security.auth.selectedProvider', 'gemini');
setSelectedProvider('gemini');
```

deps 배열에 `setSelectedProvider` 추가:

```typescript
// Before
[settings, config, setAuthState, onAuthError, setAuthContext][
  // After
  (settings,
  config,
  setAuthState,
  setSelectedProvider,
  onAuthError,
  setAuthContext)
];
```

#### 2. `handleApiKeySubmit()` Gemini 경로 — provider 저장 (line 679)

```typescript
// Before
await saveApiKey(apiKey);
await reloadApiKey();
await config.refreshAuth(AuthType.USE_GEMINI);

// After
await saveApiKey(apiKey);
await reloadApiKey();
// Persist provider so /model resolves correctly on next startup
settings.setValue(
  SettingScope.User,
  'security.auth.selectedProvider',
  'gemini',
);
await config.refreshAuth(AuthType.USE_GEMINI);
```

### 추가 수정: `packages/core/src/config/config.ts`

#### `refreshUserQuota()` — gemini-3.1-pro-preview quota 체크 추가

```typescript
// Before
const hasAccess =
  quota.buckets?.some((b) => b.modelId === PREVIEW_GEMINI_MODEL) ?? false;

// After
const hasAccess =
  quota.buckets?.some(
    (b) =>
      b.modelId === PREVIEW_GEMINI_31_MODEL ||
      b.modelId === PREVIEW_GEMINI_MODEL,
  ) ?? false;
```

## 변경 파일

| 파일                                   | 변경 내용                                                        | 규모 |
| -------------------------------------- | ---------------------------------------------------------------- | ---- |
| `packages/cli/src/ui/AppContainer.tsx` | `handleAuthSelect`, `handleApiKeySubmit`에 selectedProvider 저장 | +9줄 |
| `packages/core/src/config/config.ts`   | `refreshUserQuota()` gemini-3.1-pro-preview quota 체크           | +4줄 |

## 검증 결과

| 테스트                               | 결과                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------- |
| `AppContainer.test.tsx` (71 tests)   | ✅ PASS                                                                     |
| `useAuth.test.tsx` (30 tests)        | ✅ PASS                                                                     |
| `DialogManager.test.tsx` (22 tests)  | ✅ PASS                                                                     |
| `ModelDialog.test.tsx` (28/30 tests) | ✅ 28 PASS, 2 FAIL (기존 실패 — OpenAI 모델 목록 변경 관련, 본 수정과 무관) |
| typecheck                            | ✅ PASS                                                                     |
| lint                                 | ✅ PASS                                                                     |

## 리뷰 후 추가 수정 (2026-02-20)

### [HIGH] Issue #1: AuthDialog.tsx — 실제 OAuth 경로 selectedProvider 미저장

**문제**: 초기 hotfix는 `AppContainer.handleAuthSelect()`에만 적용. 실제 OAuth
UI는 `DialogManager → AuthDialog.onSelect()`를 통해 처리되므로 해당 경로에서도
selectedProvider 저장이 필요.

**수정**: `packages/cli/src/ui/auth/AuthDialog.tsx`

```typescript
// AuthDialog.onSelect() 내부 — selectedType 저장 직후 추가:
settings.setValue(scope, 'security.auth.selectedProvider', 'gemini');
if (setSelectedProvider) {
  setSelectedProvider('gemini');
}
```

- `setSelectedProvider` optional prop 추가
- `DialogManager.tsx`에서 `uiActions.setSelectedProvider` 전달
- `UIActionsContext.tsx`에 `setSelectedProvider` 인터페이스 추가
- `AppContainer.tsx`의 `uiActions` 객체 + deps에 `setSelectedProvider` 포함

### [HIGH] Issue #2: Non-Gemini 환경변수 클린업

**문제**: Claude/OpenAI에서 Gemini OAuth로 전환 시 `LLM_PROVIDER`,
`ENABLE_MULTI_PROVIDER`, `ANTHROPIC_API_KEY` 등 환경변수가 잔존하면
`providerSelector.ts`에서 Gemini가 아닌 이전 프로바이더로 라우팅됨.

**수정**: `packages/cli/src/ui/auth/AuthDialog.tsx` — `onSelect()` 내부

```typescript
// Clear non-Gemini env vars to prevent providerSelector mis-routing
delete process.env['LLM_PROVIDER'];
delete process.env['ENABLE_MULTI_PROVIDER'];
delete process.env['ANTHROPIC_API_KEY'];
delete process.env['OPENAI_API_KEY'];
delete process.env['LLM_API_KEY'];
delete process.env['LLM_MODEL'];
delete process.env['LLM_BASE_URL'];
delete process.env['LLM_API_KEY_HEADER'];
delete process.env['LLM_CUSTOM_HEADERS'];
```

### [LOW] Issue #3: AuthDialog 회귀 테스트 추가

**수정**: `packages/cli/src/ui/auth/AuthDialog.test.tsx` — 3개 테스트 추가

1. `saves selectedProvider=gemini to settings on LOGIN_WITH_GOOGLE`
   - settings.setValue → `security.auth.selectedProvider`, `gemini` 검증
   - setSelectedProvider('gemini') 호출 검증
2. `saves selectedProvider=gemini to settings on USE_GEMINI`
   - API Key 경로에서도 selectedProvider 저장 검증
3. `clears non-Gemini env vars on auth select to prevent provider mis-routing`
   - LLM_PROVIDER, ENABLE_MULTI_PROVIDER, ANTHROPIC_API_KEY 클린업 검증

### [LOW] Issue #4: Quota check flash-preview 추가 + 테스트 보강

**수정 1**: `packages/core/src/config/config.ts` — `refreshUserQuota()`

```typescript
// Before (초기 hotfix)
const hasAccess =
  quota.buckets?.some(
    (b) =>
      b.modelId === PREVIEW_GEMINI_31_MODEL ||
      b.modelId === PREVIEW_GEMINI_MODEL,
  ) ?? false;

// After
const hasAccess =
  quota.buckets?.some(
    (b) =>
      b.modelId === PREVIEW_GEMINI_31_MODEL ||
      b.modelId === PREVIEW_GEMINI_MODEL ||
      b.modelId === PREVIEW_GEMINI_FLASH_MODEL,
  ) ?? false;
```

**수정 2**: `packages/core/src/config/config.test.ts` — 2개 테스트 추가

1. `should update hasAccessToPreviewModel to true if quota includes gemini-3.1-pro-preview`
2. `should update hasAccessToPreviewModel to true if quota includes gemini-3-flash-preview`

## 리뷰 수정 후 변경 파일

| 파일                                                | 변경 내용                            | 규모  |
| --------------------------------------------------- | ------------------------------------ | ----- |
| `packages/cli/src/ui/auth/AuthDialog.tsx`           | selectedProvider 저장 + env 클린업   | +23줄 |
| `packages/cli/src/ui/auth/AuthDialog.test.tsx`      | 3개 회귀 테스트 추가                 | +48줄 |
| `packages/cli/src/ui/components/DialogManager.tsx`  | setSelectedProvider prop 전달        | +1줄  |
| `packages/cli/src/ui/contexts/UIActionsContext.tsx` | setSelectedProvider 인터페이스 추가  | +1줄  |
| `packages/cli/src/ui/AppContainer.tsx`              | uiActions에 setSelectedProvider 포함 | +2줄  |
| `packages/core/src/config/config.ts`                | flash-preview quota 체크 추가        | +1줄  |
| `packages/core/src/config/config.test.ts`           | 3.1-pro/flash quota 테스트 2개       | +18줄 |

## 리뷰 수정 후 검증 결과

| 테스트                               | 결과                                   |
| ------------------------------------ | -------------------------------------- |
| `AuthDialog.test.tsx` (29 tests)     | ✅ PASS                                |
| `config.test.ts` (140 tests)         | ✅ PASS                                |
| Core 전체 (284 files, 5666 tests)    | ✅ PASS                                |
| CLI 전체 (349/351 files, 4766 tests) | ✅ PASS (2 file pre-existing failures) |
| typecheck                            | ✅ PASS                                |

## 추가 수정: 인증 로직 중복 제거 (2026-02-20)

### [LOW] Issue #5: AppContainer.handleAuthSelect dead code 제거

**문제**: AuthDialog가 자체 `onSelect` 콜백으로 인증 선택을 처리하는데,
`AppContainer.handleAuthSelect`에 유사 로직이 dead code로 남아 있음.
`uiActions.handleAuthSelect`를 호출하는 곳은 **어디에도 없음**. 두 경로가 다시
어긋날 유지보수 드리프트 리스크 존재.

**수정**: Dead code 경로 완전 제거, AuthDialog.onSelect를 단일 진실 공급원으로
확립.

| 파일                    | 변경 내용                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppContainer.tsx`      | `handleAuthSelect` useCallback 제거 (~50줄), uiActions 객체/deps에서 제거, 미사용 import 3개 제거 (`ChangeAuthRequestedError`, `writeToStdout`, `clearCachedCredentialFile`) |
| `UIActionsContext.tsx`  | `handleAuthSelect` 인터페이스 멤버 제거, 미사용 `AuthType` import 제거                                                                                                       |
| `test-utils/render.tsx` | mock에서 `handleAuthSelect: vi.fn()` 제거                                                                                                                                    |

**검증**:

| 테스트                              | 결과    |
| ----------------------------------- | ------- |
| `AuthDialog.test.tsx` (29 tests)    | ✅ PASS |
| `DialogManager.test.tsx` (22 tests) | ✅ PASS |
| `AppContainer.test.tsx` (71 tests)  | ✅ PASS |
| typecheck                           | ✅ PASS |

## 관련 이슈

- OAuth 재시작 후 `/model` 프로바이더 불일치
- `gemini-3.1-pro-preview` OAuth quota 체크 누락
- Non-Gemini 환경변수 잔존으로 인한 프로바이더 라우팅 오류
- AppContainer/AuthDialog 인증 로직 중복에 의한 드리프트 리스크
