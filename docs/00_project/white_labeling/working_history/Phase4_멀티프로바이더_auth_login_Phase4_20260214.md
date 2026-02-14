# Phase 4: 하위 호환 + 마이그레이션 — 작업결과서

> 작성일: 2026-02-14 브랜치: `DID/v0.1` 설계 문서:
> `docs/00_project/white_labeling/auth_login_멀티프로바이더_설계.md`

---

## 1. 작업 범위

Phase 4는 멀티프로바이더 `/auth login` 흐름의 하위 호환 및 마이그레이션을
담당한다.

- **migrateAuthSettings**: 기존 Gemini 사용자의 영속적 마이그레이션
  (`selectedProvider='gemini'` 자동 추가)
- **비-Gemini startup auth 스킵**: Claude/OpenAI/sLM/Vertex AI 프로바이더는
  React UI(`useAuth.ts`)에서 env var 설정 후 인증하므로, `initializeApp`
  단계에서 `performInitialAuth` 호출 생략
- **shouldOpenAuthDialog 로직 수정**: 비-Gemini 프로바이더를 올바르게 판단하도록
  조건식 변경

---

## 2. 수정 파일

| #   | 파일                                        | 변경 내용                                                                                   |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | `packages/cli/src/core/initializer.ts`      | `migrateAuthSettings()` 추가, 비-Gemini startup auth 스킵, `shouldOpenAuthDialog` 로직 유지 |
| 2   | `packages/cli/src/core/initializer.test.ts` | 14개 테스트 추가 (마이그레이션 4 + 스킵 5 + shouldOpenAuthDialog 5)                         |
| 3   | `packages/cli/src/gemini.tsx`               | 선행 auth 블록에 `shouldSkipEarlyAuth` 조건 추가                                            |

---

## 3. 핵심 구현

### 3.1 migrateAuthSettings

기존 Gemini 사용자는 `selectedType` (e.g., `'oauth'`, `'use-gemini'`)만 있고
`selectedProvider`가 없다. `migrateAuthSettings`는 이 상태를 감지하여
`selectedProvider='gemini'`을 영속적으로 저장한다.

이전에는 `useAuth.ts`의 `determineInitialState()`가 매 재시작마다 이 상태를
감지하여 `Unauthenticated`로 라우팅했지만, 마이그레이션 자체는 비영속적이었다.

### 3.2 비-Gemini startup auth 스킵

`performInitialAuth(config, USE_GEMINI)` 호출 시 `refreshAuth(USE_GEMINI)`가
실행되는데, 비-Gemini 프로바이더는 이 시점에 필요한 env var (`LLM_PROVIDER`,
`ANTHROPIC_API_KEY` 등)가 아직 설정되지 않았다. 이 env var들은 `useAuth.ts`에서
settings로부터 복원된다.

따라서 `selectedProvider`가 `'gemini'`이 아닌 모든 경우에 startup auth를
스킵하고, `useAuth.ts`에 전체 auth 흐름을 위임한다.

### 3.3 shouldOpenAuthDialog — 기존 로직 유지

기존 조건 `!selectedType || !!authError`를 변경하지 않았다. 비-Gemini
프로바이더는 `selectedType=USE_GEMINI`이므로 `!selectedType`은 `false` → dialog
미표시 (정상). `selectedProvider`만 있고 `selectedType`이 없는 불완전 상태에서도
`!selectedType`이 `true` → dialog 표시 (정상).

---

## 4. 이미 구현된 항목

### Step 4.1: 환경변수 자동 감지 (Phase 1에서 완료)

`useAuth.ts` `determineInitialState()` + main auth effect에서 이미 구현:

- `LLM_PROVIDER` → `Unauthenticated` → 자동 인증
- `ANTHROPIC_API_KEY` → `LLM_PROVIDER=claude` 설정 → 자동 인증
- `OPENAI_API_KEY` → `LLM_PROVIDER=openai` 설정 → 자동 인증
- 없으면 → `SelectingProvider`

테스트 4개 이미 존재 (`useAuth.test.tsx`).

### Step 4.2: validateProviderAuth (불필요)

`useAuth.ts`가 이미 프로바이더별 암묵적 검증 수행:

- Claude/OpenAI: API key 없으면 → `AwaitingApiKeyInput`
- sLM: baseUrl 없으면 → `ConfiguringSlm`
- Vertex AI: project/location 없으면 → `ConfiguringVertex`

별도 함수 추가 시 로직 중복.

---

## 5. 리뷰 반영

### Issue 1 (높음): gemini.tsx 선행 auth에서 non-Gemini fatal exit

**문제**: `gemini.tsx:387-409`의 선행 auth 블록이 `initializeApp()` 이전에
실행된다. non-Gemini 프로바이더(`selectedType=USE_GEMINI`)일 때
`validateAuthMethod('use-gemini')`이 `GEMINI_API_KEY` 미설정으로 실패 →
sandbox에서 `process.exit(FATAL_AUTHENTICATION_ERROR)`.

**원인**: `initializeApp()`의 `shouldSkipStartupAuth` 로직이 `gemini.tsx` 선행
auth 블록에는 적용되지 않았다.

**수정**: `gemini.tsx`에 동일한 `shouldSkipEarlyAuth` 조건 추가.

```typescript
const selectedProvider = settings.merged.security.auth.selectedProvider;
const shouldSkipEarlyAuth = !!selectedProvider && selectedProvider !== 'gemini';
```

interactive 브랜치(`line 397`)와 non-interactive 브랜치(`line 409`)에
`!shouldSkipEarlyAuth` 조건 추가.

### Issue 2 (중간): shouldOpenAuthDialog 불완전 상태 미처리

**문제**: Phase 4에서 `shouldOpenAuthDialog` 조건을
`(!selectedType && !selectedProvider) || !!authError`로 변경했으나,
`selectedProvider`만 있고 `selectedType`이 없는 불완전 상태에서 dialog가 열리지
않는 edge case 발생.

**수정**: 기존 조건 `!selectedType || !!authError`를 유지. 이 조건이 모든
시나리오를 올바르게 처리한다:

- 비-Gemini: `selectedType=USE_GEMINI` → `!selectedType` = false → dialog 미표시
  (정상)
- 불완전: `selectedType=undefined` → `!selectedType` = true → dialog 표시 (정상)
- 신규: `selectedType=undefined` → dialog 표시 (정상)

테스트 1개 추가: "should be true when selectedProvider exists without
selectedType (incomplete state)"

### Issue 3 (낮음): 마이그레이션 scope 오염

**문제**: `migrateAuthSettings`가 `settings.merged.security.auth`를 읽어
`selectedType`을 확인했다. `merged`는 workspace/system/user 전체 scope의 병합
결과이므로, workspace scope에 `selectedType`이 있는 경우에도 user scope에
`selectedProvider='gemini'`이 기록되어 설정 오염 발생.

**수정**: user scope 전용으로 변경.

```typescript
function migrateAuthSettings(settings: LoadedSettings): void {
  const userAuth = settings.user.settings.security?.auth;
  if (userAuth?.selectedType && !userAuth?.selectedProvider) {
    settings.setValue(
      SettingScope.User,
      'security.auth.selectedProvider',
      'gemini',
    );
  }
}
```

`Settings` 타입은 모든 필드가 optional(`?`)이므로 optional chaining 사용. 테스트
1개 추가: "should not migrate when selectedType exists only in workspace/system
scope, not user scope"

### Issue 4 (높음): Vertex 레거시 사용자 마이그레이션 오분류

**문제**: `migrateAuthSettings`가 `selectedType` 값에 관계없이 항상
`selectedProvider='gemini'`으로 저장.
`selectedType='vertex-ai'`(USE_VERTEX_AI)인 Vertex 레거시 사용자도
`selectedProvider='gemini'`으로 매핑되어,
`shouldSkipStartupAuth`/`shouldSkipEarlyAuth`
조건(`selectedProvider !== 'gemini'`)을 통과하지 못한다.

**수정**: `resolveProviderFromAuthType()` 함수 추가. `selectedType` 값에 따라
올바른 `selectedProvider`를 매핑.

```typescript
function resolveProviderFromAuthType(selectedType: string): string {
  if (selectedType === 'vertex-ai') {
    // AuthType.USE_VERTEX_AI
    return 'vertex-ai';
  }
  return 'gemini';
}
```

테스트 1개 추가: "should set selectedProvider to vertex-ai when selectedType is
USE_VERTEX_AI"

### Issue 5 (중간): non-interactive 모드에서 non-Gemini 저장 로그인 미지원

**문제**: `gemini.tsx:728`의 non-interactive 메인 경로가
`validateNonInteractiveAuth(selectedType=USE_GEMINI)`를 호출. 이 함수는
`validateAuthMethod('gemini-api-key')`에서 `GEMINI_API_KEY` 확인 → 미설정 시
`process.exit(FATAL_AUTHENTICATION_ERROR)`. Claude/OpenAI로 로그인 저장 후 `-p`
모드 실행 시 치명 종료.

**원인**: `validateNonInteractiveAuth`는 Gemini auth type만 이해. interactive
모드에서는 `useAuth.ts`가 env var 복원 후 `refreshAuth` 호출하지만,
non-interactive 경로에는 이 로직이 없다.

**수정**: non-interactive 메인 경로에 non-Gemini 프로바이더용 env var 복원 +
직접 `refreshAuth` 분기 추가.

`restoreNonGeminiEnvVars()` 함수로 추출하여 테스트 가능하게 구현. Vertex AI를
포함한 모든 non-Gemini 프로바이더를 처리.

```typescript
if (isNonGeminiNonInteractive) {
  await restoreNonGeminiEnvVars(nonInteractiveProvider, settings);
  const authType = nonInteractiveProvider === 'vertex-ai'
    ? AuthType.USE_VERTEX_AI : AuthType.USE_GEMINI;
  await config.refreshAuth(authType);
} else {
  const authType = await validateNonInteractiveAuth(...);
  await config.refreshAuth(authType);
}
```

### Issue 6 (중간): Vertex AI non-interactive 설정 복원 경로 누락

**문제**: Issue 5 수정에서 `vertex-ai`를 non-Gemini 분기에서
제외(`!== 'vertex-ai'`). `validateNonInteractiveAuth`는 env만 검증하고
settings에서 `GOOGLE_CLOUD_PROJECT`/`LOCATION`을 복원하지 않음. Vertex 사용자가
settings에만 config 저장하고 env var 없이 `-p` 실행 시 실패.

**수정**: `restoreNonGeminiEnvVars`에 Vertex AI 분기 추가. settings의
`vertexConfig`에서 `GOOGLE_CLOUD_PROJECT`/`LOCATION` 복원. non-interactive
분기에서 `vertex-ai` 제외 조건 삭제 — 모든 non-Gemini를 통합 처리.

### Issue 7 (중간): env 우선순위 불일치

**문제**: Issue 5의 env var 복원 코드가 keychain 값으로 기존 env var를 무조건
덮어씀. `useAuth.ts:123-128`은 기존 env 우선 사용.

**수정**: `restoreNonGeminiEnvVars` 내 모든 `process.env` 설정에
`!process.env[key]` 가드 추가. 사용자가 실행 시점에 설정한 env var가 항상 우선.

### Issue 8 (낮음): non-interactive 복원 분기 테스트 부재

**수정**: `restoreNonGeminiEnvVars.test.ts` 신규 작성 (11개 테스트).

| 테스트                       | 내용                                            |
| ---------------------------- | ----------------------------------------------- |
| Claude env 복원              | LLM_PROVIDER + ANTHROPIC_API_KEY from keychain  |
| Claude env 우선순위          | 기존 ANTHROPIC_API_KEY 보존                     |
| Claude LLM_PROVIDER 우선순위 | 기존 LLM_PROVIDER 보존                          |
| OpenAI env 복원              | OPENAI_API_KEY from keychain                    |
| OpenAI env 우선순위          | 기존 OPENAI_API_KEY 보존                        |
| Vertex settings 복원         | GOOGLE_CLOUD_PROJECT/LOCATION from vertexConfig |
| Vertex env 우선순위          | 기존 env 보존                                   |
| Vertex config 누락           | 미설정 시 graceful 처리                         |
| sLM 전체 복원                | baseUrl, model, apiKeyHeaderName, customHeaders |
| sLM env 우선순위             | 기존 LLM_BASE_URL/API_KEY 보존                  |
| keychain 키 없음             | null 반환 시 env 미설정                         |

---

## 6. 수정 파일 (리뷰 3차 반영 후)

| #   | 파일                                               | 변경 내용                                                                              |
| --- | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | `packages/cli/src/core/initializer.ts`             | `resolveProviderFromAuthType()` 추가, user-scope 마이그레이션                          |
| 2   | `packages/cli/src/core/initializer.test.ts`        | 15개 테스트 추가 (마이그레이션 5 + 스킵 5 + shouldOpenAuthDialog 5)                    |
| 3   | `packages/cli/src/gemini.tsx`                      | `shouldSkipEarlyAuth` + `restoreNonGeminiEnvVars()` 추출 + `loadProviderApiKey` import |
| 4   | `packages/cli/src/restoreNonGeminiEnvVars.test.ts` | 11개 테스트 (env 복원 + 우선순위 + Vertex + sLM)                                       |

---

## 7. 테스트 결과 (리뷰 3차 반영 후)

```
initializer.test.ts:          20 passed (5 기존 + 15 신규)
  - migrateAuthSettings:       5 passed (+1 Vertex, +1 scope)
  - non-Gemini startup:        5 passed
  - shouldOpenAuthDialog:       5 passed (+1 불완전 상태)
restoreNonGeminiEnvVars.test:  11 passed (신규)
useAuth.test.tsx:              29 passed
auth 전체:                    121 passed
────────────────────────────────────
Total:                        152+ passed
Typecheck:                     ✅
Lint:                          ✅
```

---

## 8. 다음 단계

- **수동 E2E 테스트**: 5개 시나리오 사용자 확인 필요
- **멀티프로바이더 auth login 전체 완료**: Phase 1~4 모두 구현 완료
