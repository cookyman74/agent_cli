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

## 관련 이슈

- OAuth 재시작 후 `/model` 프로바이더 불일치
- `gemini-3.1-pro-preview` OAuth quota 체크 누락
