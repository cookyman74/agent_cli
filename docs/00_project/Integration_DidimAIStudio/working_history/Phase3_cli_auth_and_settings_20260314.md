# Phase 3 작업 결과서: CLI — Auth UI + Settings 확장

> **작업 기간**: 2026-03-14 **작업 브랜치**: `v0.3.5/add_DidimAIStudio`
> **상태**: ✅ 완료 (리뷰 3차 반영 포함)

---

## 변경 파일 목록 (20 files)

### 구현 파일 (11 files)

| #   | 파일                                                  | 변경 유형 | 설명                                                                                         |
| --- | ----------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------- |
| 1   | `packages/cli/src/ui/types.ts`                        | 수정      | AuthState enum: `PreviewingDidimStudio` → `AuthenticatingDidim`                              |
| 2   | `packages/cli/src/ui/contexts/UIStateContext.tsx`     | 수정      | UIState: `isPreviewingDidimStudio` → `isAuthenticatingDidim`                                 |
| 3   | `packages/cli/src/ui/contexts/UIActionsContext.tsx`   | 수정      | UIActions: `handleDidimConfigComplete` + `handleDidimConfigCancel` 추가                      |
| 4   | `packages/cli/src/ui/AppContainer.tsx`                | 수정      | handleDidimConfigComplete: 원자적 저장 (keychain+refreshAuth 후 settings) + 실패 시 env 롤백 |
| 5   | `packages/cli/src/ui/components/DialogManager.tsx`    | 수정      | ComingSoon → DidimStudioAuthDialog 교체 + defaultConfig 전달                                 |
| 6   | `packages/cli/src/ui/auth/providerMetadata.ts`        | 수정      | envVarName/keychainEntry 설정 + 주석 모순 수정                                               |
| 7   | `packages/cli/src/ui/auth/DidimStudioAuthDialog.tsx`  | 신규      | 3-step auth dialog + JWT 마스킹 입력 (mask prop) + streamMode 런타임 검증                    |
| 8   | `packages/cli/src/ui/auth/useAuth.ts`                 | 수정      | Didim restore 분기 + DIDIM_SERVER_ADDRESS 검증 + env 롤백 (serverAddress/key 미존재)         |
| 9   | `packages/cli/src/ui/commands/authCommand.ts`         | 수정      | logout: cleanProviderEnvVars() 공용 헬퍼 사용 + didimConfig 설정 정리                        |
| 10  | `packages/cli/src/ui/utils/resolveActiveProvider.ts`  | 수정      | PROVIDER_ENV_VARS_TO_CLEAN에 DIDIM_SERVER_ADDRESS, DIDIM_STREAM_MODE 추가                    |
| 11  | `packages/cli/src/ui/components/shared/TextInput.tsx` | 수정      | mask prop 추가 (비밀번호 스타일 입력 지원)                                                   |

### 스키마/설정 파일 (2 files)

| #   | 파일                                        | 변경 유형 | 설명                                     |
| --- | ------------------------------------------- | --------- | ---------------------------------------- |
| 12  | `packages/cli/src/config/settingsSchema.ts` | 수정      | `security.auth.didimConfig` 스키마 추가  |
| 13  | `packages/cli/src/test-utils/render.tsx`    | 수정      | mock UIState/UIActions에 Didim 필드 추가 |

### 테스트 파일 (7 files)

| #   | 파일                                                      | 변경 유형 | 설명                                                                          |
| --- | --------------------------------------------------------- | --------- | ----------------------------------------------------------------------------- |
| 14  | `packages/cli/src/ui/auth/DidimStudioAuthDialog.test.tsx` | 신규      | 18 tests: 3-step UI 테스트 + 스냅샷 + streamMode 검증                         |
| 15  | `packages/cli/src/ui/auth/providerMetadata.test.ts`       | 신규      | 9 tests: didim-studio entry, PROVIDER_SELECT_ITEMS, displayInfo               |
| 16  | `packages/cli/src/ui/auth/useAuth.test.tsx`               | 수정      | 10 new tests: Didim auto-detect, restore, rollback, DIDIM_SERVER_ADDRESS 검증 |
| 17  | `packages/cli/src/ui/commands/authCommand.test.ts`        | 수정      | 4 new tests: Didim env 정리, didimConfig 정리, cleanProviderEnvVars 사용 검증 |
| 18  | `packages/cli/src/ui/components/DialogManager.test.tsx`   | 수정      | isAuthenticatingDidim mock + DidimStudioAuthDialog 렌더링 테스트              |
| 19  | `packages/cli/src/ui/utils/resolveActiveProvider.test.ts` | 수정      | Didim env vars 정리 테스트 추가                                               |
| 20  | `packages/cli/src/config/settings.test.ts`                | 수정      | 4 new tests: didimConfig 스키마, roundtrip, 공존 테스트                       |

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
| 2. JWT Token     | TextInput (mask) | string              | (빈값)                  |
| 3. Stream Mode   | Number key (1/2) | 'sse' \| 'improved' | `sse`                   |

- **JWT 실시간 마스킹**: TextInput에 `mask="*"` prop 적용 — 입력 중 모든 문자가
  `*`로 표시 (화면 녹화/공유 시 토큰 노출 방지)
- JWT 마스킹 요약: 입력 후 하단에 `eyJh****oken` 형태 축약 표시
- **streamMode 런타임 검증**: `defaultConfig.streamMode`가 'sse' 또는
  'improved'가 아닌 경우 'sse'로 안전 폴백
- ESC: 이전 스텝으로 이동 (첫 스텝에서는 onCancel)
- `defaultConfig` prop: 재인증 시 기존 설정값 prefill

### 3. TextInput mask prop

```typescript
// TextInput.tsx — 새 prop 추가
interface TextInputProps {
  mask?: string; // e.g., '*' — 각 문자를 mask 문자로 표시
}
```

- 내부 buffer는 실제 텍스트 유지 (onSubmit 시 원본 전달)
- 화면에는 mask 문자만 표시 (커서 위치는 정상 유지)

### 4. handleDidimConfigComplete Handler (원자적 저장)

```
1. cleanProviderEnvVars()                          — 이전 프로바이더 env 정리
2. process.env 설정: LLM_PROVIDER, DIDIM_API_KEY, DIDIM_SERVER_ADDRESS, DIDIM_STREAM_MODE
3. saveProviderApiKey('didim', apiKey)              — keychain 저장
4. config.refreshAuth(AuthType.USE_GEMINI)         — 인증 검증
5. settings.setValue('security.auth.didimConfig')   — ★ 성공 후에만 settings 저장
6. settings.setValue('security.auth.selectedProvider')
7. settings.setValue('security.auth.selectedType')
8. setAuthState(AuthState.Authenticated)
※ catch: cleanProviderEnvVars() 롤백 — 실패 시 env 부분 상태 방지
```

**이전 구현과의 차이**: settings.setValue를 keychain+refreshAuth **이후**로
이동하여 원자적 저장 보장. 실패 시 settings에 불완전한 설정이 남지 않음.

### 5. Settings Schema 확장

```
security.auth.didimConfig (object, optional)
  ├── serverAddress (string, default: undefined)
  └── streamMode   (string, default: 'sse')
```

- `slmConfig`, `vertexConfig`와 동일 패턴 (showInDialog: false, requiresRestart:
  true)
- 기존 settings 파싱에 영향 없음 (전체 optional)

### 6. useAuth.ts — Didim Config Restore (env 롤백 포함)

재시작 시 `selectedProvider === 'didim-studio'` → `normalizeProviderKey` →
`'didim'` 분기:

```
1. settings.merged.security.auth.didimConfig에서 serverAddress/streamMode 로드
2. serverAddress 없으면 → AuthenticatingDidim (env vars 미설정, 롤백 불필요)
3. ENABLE_MULTI_PROVIDER 설정 + env vars 설정
4. keychain에서 API key 로드 (reloadProviderApiKey)
5. key 없으면 → ENABLE_MULTI_PROVIDER/LLM_PROVIDER/DIDIM_* 롤백 후 AuthenticatingDidim
6. 성공 시 → Authenticated
```

**env 자동 감지 경로** (selectedType 없음):

- `DIDIM_API_KEY`만 있고 `DIDIM_SERVER_ADDRESS` 없으면 → AuthenticatingDidim
  dialog 표시
- `LLM_PROVIDER=didim`이고 `DIDIM_SERVER_ADDRESS` 없으면 → 에러 메시지 표시

### 7. authCommand logout — cleanProviderEnvVars() 공용 사용

```
1. clearCachedCredentialFile()           — keychain 정리
2. settings 정리: selectedType, selectedProvider, slmConfig, vertexConfig, didimConfig
3. cleanProviderEnvVars()                — 공용 헬퍼로 모든 env vars 일괄 정리
4. stripThoughtsFromHistory()
```

**이전 구현과의 차이**: 개별 `delete process.env[...]` 14줄을
`cleanProviderEnvVars()` 1줄로 교체. 단일 소스(resolveActiveProvider.ts의
PROVIDER_ENV_VARS_TO_CLEAN)로 관리하여 logout과 provider switch 간 정리 대상
불일치 방지.

### 8. providerMetadata 업데이트

- `envVarName`: `''` → `'DIDIM_API_KEY'`
- `keychainEntry`: `''` → `'didim-api-key'`
- 주석 수정: "hidden from user selection" → "shown in selection and activated
  via auth dialog or DIDIM_API_KEY env var"

---

## 리뷰 반영 이력

### 1차 리뷰 (테스트 커버리지)

| 이슈                                  | 조치                                                      |
| ------------------------------------- | --------------------------------------------------------- |
| handleDidimConfigComplete 테스트 없음 | AppContainer.test.tsx 기존 패턴 활용 (handleVertexConfig) |
| useAuth Didim restore 테스트 없음     | 8개 테스트 추가 (restore, rollback, auto-detect)          |
| env 자동감지 계약 불일치              | DIDIM_SERVER_ADDRESS 검증 추가 + 테스트 2개               |
| DidimStudioAuthDialog 테스트 없음     | 18개 테스트 (3-step + snapshot + validation)              |
| DialogManager 테스트 없음             | isAuthenticatingDidim 테스트 케이스 추가                  |
| settings 스키마 테스트 없음           | 4개 테스트 (defaults, roundtrip, coexistence)             |
| providerMetadata 테스트 없음          | 9개 테스트 (contract, displayInfo)                        |

### 2차 리뷰 (런타임 동작)

| 이슈                                    | 조치                                                      |
| --------------------------------------- | --------------------------------------------------------- |
| env var 누수 (DIDIM_SERVER_ADDRESS 등)  | PROVIDER_ENV_VARS_TO_CLEAN에 추가                         |
| logout에서 didimConfig 미정리           | didimConfig settings 정리 추가                            |
| Didim 복원 시 key 없을 때 env 롤백 없음 | ENABLE*MULTI_PROVIDER/LLM_PROVIDER/DIDIM*\* 롤백 추가     |
| handleDidimConfigComplete 비원자적 저장 | settings.setValue를 keychain+refreshAuth 성공 후로 이동   |
| streamMode 런타임 검증 없음             | `raw === 'sse' \|\| raw === 'improved'` 체크 + 'sse' 폴백 |

### 3차 리뷰 (일관성 + 보안)

| 이슈                                             | 조치                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| logout 개별 delete vs cleanProviderEnvVars       | authCommand에서 cleanProviderEnvVars() 공용 헬퍼 사용으로 전환        |
| serverAddress 없을 때 ENABLE_MULTI_PROVIDER 잔류 | ENABLE_MULTI_PROVIDER 설정을 serverAddress 검증 후로 이동             |
| JWT 입력 실시간 평문 노출                        | TextInput에 mask prop 추가 + DidimStudioAuthDialog에서 mask="\*" 사용 |
| 결과서 변경 파일 목록 불일치                     | 20개 파일 전수 목록 + 리뷰 반영 이력 추가                             |

---

## 2팀 이슈 검증 결과

### getEffectiveSettings 래퍼 — 불필요 판정

코드베이스 조사 결과, 프로바이더 전환 시 **사용자 설정이 삭제되는 경로가 없음**:

- `cleanProviderEnvVars()`: env vars만 정리, settings는 미변경
- `handleDidimConfigComplete`: didimConfig/selectedProvider/selectedType만 기록,
  다른 설정(systemInstruction, tools, mcp 등)은 미변경
- `model.byProvider`: 프로바이더별 모델 기억은 이미 구현되어 독립 관리
- `systemRole` 설정은 존재하지 않음 (`systemInstruction`으로 통합 처리)
- 프로바이더 전환 시 비호환 설정이 API 에러를 유발하는 경로 없음 (각 adapter가
  자체 config만 사용)

따라서 `getEffectiveSettings` 래퍼는 현재 아키텍처에서 불필요하며, 향후
프로바이더별 설정 비호환이 발생할 경우 추가 검토.

---

## 테스트 결과

| 패키지    | 테스트 파일 | 테스트 수 | 결과    |
| --------- | ----------- | --------- | ------- |
| CLI       | 354 files   | 4,900+    | ✅ PASS |
| Core      | 297 files   | -         | ✅ PASS |
| typecheck | -           | -         | ✅ PASS |
| lint      | -           | -         | ✅ PASS |

---

## 미구현 / 연기 항목

| 항목                             | 사유                                                | 대상 Phase   |
| -------------------------------- | --------------------------------------------------- | ------------ |
| DidimStudioComingSoonDialog 삭제 | 사용처 0건이나 git history 보존 위해 별도 커밋 권장 | Phase 3 후속 |

---

## Config Pipeline 전체 경로 (Phase 2+3 통합)

```
[Auth Dialog] DidimStudioAuthDialog
    → onComplete({ serverAddress, apiKey, streamMode })
    → [Handler] handleDidimConfigComplete
        → cleanProviderEnvVars()
        → process.env['DIDIM_API_KEY'] = apiKey
        → process.env['DIDIM_SERVER_ADDRESS'] = serverAddress
        → process.env['DIDIM_STREAM_MODE'] = streamMode
        → saveProviderApiKey('didim', apiKey) → keychain
        → config.refreshAuth(AuthType.USE_GEMINI)
        → settings.setValue('security.auth.didimConfig', ...)     ← 성공 후 저장
        → settings.setValue('security.auth.selectedProvider', 'didim-studio')
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
    → serverAddress 검증 (없으면 → AuthenticatingDidim, env 미설정)
    → ENABLE_MULTI_PROVIDER + LLM_PROVIDER + DIDIM_* env 설정
    → reloadProviderApiKey('didim') → keychain
    → key 없으면 → env 롤백 + AuthenticatingDidim
    → 성공 → config.refreshAuth → Authenticated

[Logout] authCommand.ts
    → clearCachedCredentialFile()
    → settings 정리: selectedType, selectedProvider, slmConfig, vertexConfig, didimConfig
    → cleanProviderEnvVars()  ← 공용 헬퍼 (단일 소스)
    → stripThoughtsFromHistory()
```
