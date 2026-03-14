# Phase 3 작업 결과서: CLI — Auth UI + Settings 확장

> **작업 기간**: 2026-03-14 **작업 브랜치**: `v0.3.5/add_DidimAIStudio`
> **상태**: ✅ 완료

---

## 변경 파일 목록 (11 files)

| #   | 파일                                                 | 변경 유형 | 설명                                                                    |
| --- | ---------------------------------------------------- | --------- | ----------------------------------------------------------------------- |
| 1   | `packages/cli/src/ui/types.ts`                       | 수정      | AuthState enum: `PreviewingDidimStudio` → `AuthenticatingDidim`         |
| 2   | `packages/cli/src/ui/contexts/UIStateContext.tsx`    | 수정      | UIState: `isPreviewingDidimStudio` → `isAuthenticatingDidim`            |
| 3   | `packages/cli/src/ui/contexts/UIActionsContext.tsx`  | 수정      | UIActions: `handleDidimConfigComplete` + `handleDidimConfigCancel` 추가 |
| 4   | `packages/cli/src/ui/AppContainer.tsx`               | 수정      | 7곳 리네임 + `handleDidimConfigComplete` handler 구현                   |
| 5   | `packages/cli/src/ui/components/DialogManager.tsx`   | 수정      | ComingSoon → DidimStudioAuthDialog 교체 + defaultConfig 전달            |
| 6   | `packages/cli/src/ui/auth/providerMetadata.ts`       | 수정      | envVarName/keychainEntry 설정 + 주석 모순 수정                          |
| 7   | `packages/cli/src/ui/auth/DidimStudioAuthDialog.tsx` | 신규      | 3-step auth dialog (domain → JWT → streamMode)                          |
| 8   | `packages/cli/src/ui/auth/useAuth.ts`                | 수정      | Didim config restore 분기 추가 (재시작 시 settings 복원)                |
| 9   | `packages/cli/src/config/settingsSchema.ts`          | 수정      | `security.auth.didimConfig` 스키마 추가                                 |
| 10  | `packages/cli/src/test-utils/render.tsx`             | 수정      | mock UIState/UIActions에 Didim 필드 추가                                |
| 11  | `docs/...working_history/Phase3_...20260314.md`      | 신규      | 본 결과서                                                               |

---

## 구현 상세

### 1. Auth 상태머신 리네임 (9곳 전수 변경)

| 변경 전                           | 변경 후                         |
| --------------------------------- | ------------------------------- |
| `AuthState.PreviewingDidimStudio` | `AuthState.AuthenticatingDidim` |
| `isPreviewingDidimStudio`         | `isAuthenticatingDidim`         |

- AppContainer.tsx 7곳, UIStateContext.tsx 1곳, types.ts 1곳 — 전수 변경 완료
- `npm run typecheck`로 누락 없음 확인

### 2. DidimStudioAuthDialog 컴포넌트

VertexConfigDialog 패턴을 따르는 3-step auth dialog:

| Step             | 입력             | 타입                | 기본값                  |
| ---------------- | ---------------- | ------------------- | ----------------------- |
| 1. Server Domain | TextInput        | string              | `aistudio.didim365.com` |
| 2. JWT Token     | TextInput        | string              | (빈값)                  |
| 3. Stream Mode   | Number key (1/2) | 'sse' \| 'improved' | `sse`                   |

- JWT 마스킹: 입력 후 하단에 `eyJh****xyz0` 형태로 표시 (TextInput 자체는 평문,
  기존 모든 프로바이더와 동일)
- ESC: 이전 스텝으로 이동 (첫 스텝에서는 onCancel)
- `defaultConfig` prop: 재인증 시 기존 설정값 prefill

### 3. handleDidimConfigComplete Handler

handleSlmConfigComplete/handleVertexConfigComplete 패턴 준수:

```
1. settings.setValue('security.auth.didimConfig', { serverAddress, streamMode })
2. settings.setValue('security.auth.selectedProvider', 'didim-studio')
3. settings.setValue('security.auth.selectedType', AuthType.USE_GEMINI)
4. cleanProviderEnvVars()
5. process.env 설정: LLM_PROVIDER, DIDIM_API_KEY, DIDIM_SERVER_ADDRESS, DIDIM_STREAM_MODE
6. saveProviderApiKey('didim', apiKey) → keychain 저장
7. config.refreshAuth(AuthType.USE_GEMINI)
8. setAuthState(AuthState.Authenticated)
```

### 4. Settings Schema 확장

```
security.auth.didimConfig (object, optional)
  ├── serverAddress (string, default: undefined)
  └── streamMode   (string, default: 'sse')
```

- `slmConfig`, `vertexConfig`와 동일 패턴 (showInDialog: false, requiresRestart:
  true)
- 기존 settings 파싱에 영향 없음 (전체 optional)

### 5. useAuth.ts — Didim Config Restore

재시작 시 `selectedProvider === 'didim-studio'` → `normalizeProviderKey` →
`'didim'` 분기:

```
1. settings.merged.security.auth.didimConfig에서 serverAddress/streamMode 로드
2. serverAddress 없으면 → AuthenticatingDidim 상태로 전환 (auth dialog 표시)
3. keychain에서 API key 로드 (reloadProviderApiKey)
4. key 없으면 → AuthenticatingDidim 상태로 전환
5. 모든 env vars 설정 (LLM_PROVIDER, DIDIM_API_KEY, DIDIM_SERVER_ADDRESS, DIDIM_STREAM_MODE)
```

### 6. providerMetadata 업데이트

- `envVarName`: `''` → `'DIDIM_API_KEY'`
- `keychainEntry`: `''` → `'didim-api-key'`
- 주석 수정: "hidden from user selection" → "shown in selection and activated
  via auth dialog or DIDIM_API_KEY env var"

---

## 테스트 결과

| 패키지            | 테스트 파일 | 테스트 수 | 결과    |
| ----------------- | ----------- | --------- | ------- |
| CLI               | 352 files   | 4,860     | ✅ PASS |
| Core (Didim 회귀) | 3 files     | 141       | ✅ PASS |
| typecheck         | -           | -         | ✅ PASS |
| lint              | -           | -         | ✅ PASS |

---

## 미구현 / 연기 항목

| 항목                              | 사유                                                                                 | 대상 Phase   |
| --------------------------------- | ------------------------------------------------------------------------------------ | ------------ |
| DidimStudioComingSoonDialog 삭제  | 사용처 0건이나 git history 보존 위해 별도 커밋 권장                                  | Phase 3 후속 |
| `getEffectiveSettings` 래퍼       | Didim 비호환 설정 런타임 오버라이드 — 현재 Didim은 scenario gateway라 설정 충돌 없음 | Phase 4      |
| DidimStudioAuthDialog 테스트      | Ink 컴포넌트 테스트는 Phase 4 E2E에서 검증                                           | Phase 4      |
| AppContainer.test.tsx 테스트 추가 | handleDidimConfigComplete 동작 테스트                                                | Phase 4      |

---

## Config Pipeline 전체 경로 (Phase 2+3 통합)

```
[Auth Dialog] DidimStudioAuthDialog
    → onComplete({ serverAddress, apiKey, streamMode })
    → [Handler] handleDidimConfigComplete
        → settings.setValue('security.auth.didimConfig', ...)
        → settings.setValue('security.auth.selectedProvider', 'didim-studio')
        → process.env['DIDIM_API_KEY'] = apiKey
        → process.env['DIDIM_SERVER_ADDRESS'] = serverAddress
        → process.env['DIDIM_STREAM_MODE'] = streamMode
        → saveProviderApiKey('didim', apiKey) → keychain
        → config.refreshAuth(AuthType.USE_GEMINI)
    → [Auth] useAuth
        → normalizeProviderKey('didim-studio') → 'didim'
    → [Selection] selectProvider()
        → ProviderSelection { type: 'didim', serverAddress, streamMode }
    → [ContentGenerator] contentGenerator.ts
        → AdapterConfig { apiKey, serverAddress, streamMode }
    → [Bootstrap] bootstrapDidimProvider
        → new DidimAdapter(config, fetch, apiKey, serverAddress, streamMode)

[Restart] useAuth.ts
    → settings.merged.security.auth.selectedProvider = 'didim-studio'
    → normalizeProviderKey → 'didim'
    → didimConfig = settings.merged.security.auth.didimConfig
    → reloadProviderApiKey('didim') → keychain
    → process.env 복원
    → config.refreshAuth → Authenticated
```
