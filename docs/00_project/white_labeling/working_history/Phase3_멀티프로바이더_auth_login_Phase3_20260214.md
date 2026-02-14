# Phase 3: Vertex AI + Google Login — 작업결과서

> 작성일: 2026-02-14 브랜치: `DID/v0.1` 설계 문서:
> `docs/00_project/white_labeling/auth_login_멀티프로바이더_설계.md`

---

## 1. 작업 범위

Phase 3은 멀티프로바이더 `/auth login` 흐름에 Vertex AI를 추가하는 작업이다.

- **VertexConfigDialog**: 2단계 대화형 설정 UI (Project ID → Location)
- **와이어링**: ProviderSelectDialog → ConfiguringVertex → VertexConfigDialog →
  Authenticated
- **재시작 복원**: 저장된 vertexConfig에서 GOOGLE*CLOUD*\* 환경변수 복원
- **로그아웃 정리**: vertexConfig 설정 + GOOGLE*CLOUD*\* 환경변수 삭제

---

## 2. 신규 파일

| #   | 파일                                                   | 설명                                  |
| --- | ------------------------------------------------------ | ------------------------------------- |
| 1   | `packages/cli/src/ui/auth/VertexConfigDialog.tsx`      | Vertex AI 설정 다이얼로그 (2-step)    |
| 2   | `packages/cli/src/ui/auth/VertexConfigDialog.test.tsx` | VertexConfigDialog 단위 테스트 (14개) |

---

## 3. 수정 파일

| #   | 파일                                                     | 변경 내용                                                           |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | `packages/cli/src/ui/auth/providerMetadata.ts`           | PROVIDER_SELECT_ITEMS에 'vertex-ai' 추가                            |
| 2   | `packages/cli/src/ui/contexts/UIStateContext.tsx`        | `isConfiguringVertex: boolean` 추가                                 |
| 3   | `packages/cli/src/ui/contexts/UIActionsContext.tsx`      | `handleVertexConfigComplete/Cancel` 추가                            |
| 4   | `packages/cli/src/ui/AppContainer.tsx`                   | isConfiguringVertex 파생, handlers, routing, UIState/UIActions memo |
| 5   | `packages/cli/src/ui/components/DialogManager.tsx`       | VertexConfigDialog import + ConfiguringVertex 렌더링 분기           |
| 6   | `packages/cli/src/ui/auth/useAuth.ts`                    | USE*VERTEX_AI 재시작 시 GOOGLE_CLOUD*\* env var 복원                |
| 7   | `packages/cli/src/ui/commands/authCommand.ts`            | logout에 vertexConfig 클리어 + GOOGLE*CLOUD*\* 삭제                 |
| 8   | `packages/cli/src/test-utils/render.tsx`                 | mock UIState/UIActions에 vertex 필드 추가                           |
| 9   | `packages/cli/src/ui/auth/ProviderSelectDialog.test.tsx` | 5개 항목 반영 (4→5), snapshot 업데이트                              |
| 10  | `packages/cli/src/ui/components/DialogManager.test.tsx`  | VertexConfigDialog mock + 테스트 케이스 추가                        |
| 11  | `packages/cli/src/ui/auth/useAuth.test.tsx`              | Vertex AI 재시작 env var 복원 테스트 추가                           |

---

## 4. VertexConfigDialog 구현

### 4.1 2단계 폼

| Step | 필드                    | 검증            | 기본값                                  |
| ---- | ----------------------- | --------------- | --------------------------------------- |
| 1    | Google Cloud Project ID | 비어있으면 에러 | defaultConfig.project                   |
| 2    | Google Cloud Location   | 비어있으면 에러 | defaultConfig.location ?? 'us-central1' |

### 4.2 키보드 인터랙션

- **Enter**: 현재 스텝 제출 (검증 통과 시 다음 스텝 / 완료)
- **Esc (Step 1)**: `onCancel()` 호출 → ProviderSelectDialog 복귀
- **Esc (Step 2)**: Step 1로 돌아감 + buffer를 project 값으로 복원

### 4.3 TextInput useCallback 클로저 이슈

TextInput이 `buffer.text`를 `useCallback` 클로저에 캡처하므로, 테스트에서
`mockBuffer.text` 변경 후 반드시 `rerender()` 호출이 필요하다.
`handleProjectSubmit`에서 `buffer.setText('us-central1')`을 호출하여 클로저 값이
갱신되기 때문.

---

## 5. 와이어링 흐름

```
ProviderSelectDialog → vertex-ai 선택
  → handleProviderSelect('vertex-ai')
  → setAuthState(ConfiguringVertex)
  → DialogManager: isConfiguringVertex → VertexConfigDialog
  → onComplete({ project, location })
  → handleVertexConfigComplete:
      settings.setValue('vertexConfig', { project, location })
      settings.setValue('selectedProvider', 'vertex-ai')
      settings.setValue('selectedType', USE_VERTEX_AI)
      // 이전 프로바이더 env var 정리 (stale routing 방지)
      delete ENABLE_MULTI_PROVIDER, LLM_PROVIDER, ANTHROPIC_API_KEY,
             OPENAI_API_KEY, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL,
             LLM_API_KEY_HEADER, LLM_CUSTOM_HEADERS
      process.env['GOOGLE_CLOUD_PROJECT'] = project
      process.env['GOOGLE_CLOUD_LOCATION'] = location
      config.refreshAuth(USE_VERTEX_AI)
      setAuthState(Authenticated)
```

---

## 6. 재시작 복원

useAuth의 `Unauthenticated` useEffect에서:

```
authType === USE_VERTEX_AI
→ settings.merged.security.auth.vertexConfig에서 project/location 읽기
→ process.env['GOOGLE_CLOUD_PROJECT'] / ['GOOGLE_CLOUD_LOCATION'] 설정
→ config.refreshAuth(USE_VERTEX_AI)
→ Authenticated
```

---

## 7. 로그아웃 정리

`authCommand.ts` logout에 추가:

- `security.auth.vertexConfig` = undefined
- `delete process.env['GOOGLE_CLOUD_PROJECT']`
- `delete process.env['GOOGLE_CLOUD_LOCATION']`

---

## 8. 테스트 결과

```
VertexConfigDialog:       14 passed (+1 buffer restore on Esc)
ProviderSelectDialog:     20 passed (snapshot 업데이트)
DialogManager:            21 passed (+1 vertex)
useAuth:                  27 passed (+1 vertex restart)
SlmConfigDialog:          13 passed
ApiAuthDialog:            10 passed
AuthDialog:               26 passed
AuthInProgress:            5 passed
LoginWithGoogleRestart:    4 passed
────────────────────────────────────
Total:                   140 passed
Typecheck:                ✅
Lint:                     ✅
```

---

## 9. 핵심 설계 결정

### Vertex AI는 ENABLE_MULTI_PROVIDER 불필요

Vertex AI는 Gemini 변형이므로 `LLM_PROVIDER`나 `ENABLE_MULTI_PROVIDER` 환경변수
없이 `AuthType.USE_VERTEX_AI`로 직접 라우팅된다. core의 contentGenerator가
`vertexai: true` + `GOOGLE_CLOUD_PROJECT`/`GOOGLE_CLOUD_LOCATION`으로 네이티브
처리.

### selectedProvider='vertex-ai' (UI) vs providerType='gemini' (내부)

UI에서는 'vertex-ai'를 사용하여 ProviderSelectDialog의 currentProvider가 올바른
항목을 하이라이트하도록 한다. 내부적으로 providerMetadata의
`providerType: 'gemini'`은 참조용이며, 실제 라우팅은 `AuthType.USE_VERTEX_AI`가
담당한다.

---

## 10. 리뷰 반영

### Issue 1 (높음): Vertex 전환 시 이전 provider 환경변수 잔존

**문제**: `handleVertexConfigComplete`에서 `GOOGLE_CLOUD_*` env var만 설정하고
이전 프로바이더 env var (`LLM_PROVIDER`, `ANTHROPIC_API_KEY` 등)를 정리하지
않아, `providerSelector.selectProvider()`가 `LLM_PROVIDER` 우선 감지 → 의도와
다른 프로바이더로 라우팅될 수 있었다.

**수정**: `AppContainer.tsx`의 `handleVertexConfigComplete`에서 `GOOGLE_CLOUD_*`
설정 전에 비-Vertex env var 9개를 `delete`하도록 추가:

```
ENABLE_MULTI_PROVIDER, LLM_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY,
LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_API_KEY_HEADER, LLM_CUSTOM_HEADERS
```

이는 `handleApiKeySubmit`의 Gemini 경로 (line 666-675)와 동일한 패턴이다.

### Issue 2 (중간): Step2 → Esc 시 buffer에 location 값 잔존

**문제**: Step 2에서 Esc를 눌러 Step 1로 돌아갈 때, `handleCancel`이
`setCurrentStep`과 `setValidationError(null)`만 호출하고
`buffer.setText(project)`를 호출하지 않아, buffer에 location
기본값(`us-central1`)이 남아 있었다.

**수정**: `VertexConfigDialog.tsx`의 `handleCancel`에서 Step 2 → Step 1 복귀 시
`buffer.setText(project)` 호출 추가. `useCallback` 의존성 배열에 `buffer`,
`project` 추가 (기존 `stepIndex`, `onCancel`에 추가).

**테스트 추가**:
`'restores buffer to project value when Esc is pressed on step 2'` — Step 2에서
Esc 후 `buffer.setText`가 `'my-gcp-project'`로 호출되는지 검증.

### Issue 3 (중간): Vertex 설정 누락 시 복구 경로 부재

**문제**: `useAuth.ts`에서 `selectedType=USE_VERTEX_AI`인데
`vertexConfig.project`가 없으면(설정 손상/수동 편집), env var 설정을 건너뛰고
`validateAuthMethod` 에러로 `Updating` 상태로 떨어진다. sLM은 동일 상황에서
`ConfiguringSlm`으로 유도하는 복구 분기가 있음 (line 245-248).

**수정**: `useAuth.ts`의 `USE_VERTEX_AI` 블록에서 `!vertexConfig?.project` 시
`setAuthState(AuthState.ConfiguringVertex)` + `return` 추가. 기존
`if (vertexConfig?.project)` 조건 분기를
`if (!vertexConfig?.project) { recovery }` + `unconditional set`으로 변경.

**테스트 추가**:
`'should redirect to ConfiguringVertex when vertexConfig is missing on restart'`
— `vertexConfig: {}` 상태에서 `ConfiguringVertex`로 전이되는지 검증 (useAuth: 28
tests).

### Issue 4 (낮음): env cleanup 회귀 테스트 부재

**문제**: `handleVertexConfigComplete`의 env var 정리 로직이 회귀 테스트 없이
존재. 추후 리팩토링 시 동일 문제가 재발할 가능성.

**수정**: `AppContainer.test.tsx` Regression Tests에 회귀 테스트 추가. 9개 stale
env var 설정 후 `handleVertexConfigComplete` 호출, 모두 `undefined` 검증 +
`GOOGLE_CLOUD_*` 설정 검증 (AppContainer: 71 tests).

### 리뷰 반영 후 테스트 결과

```
VertexConfigDialog:  14 passed (13→14, +1 buffer restore)
useAuth:             28 passed (27→28, +1 vertex config recovery)
AppContainer:        71 passed (70→71, +1 env cleanup regression)
ProviderSelectDialog: 20 passed
DialogManager:       21 passed
SlmConfigDialog:     13 passed
ApiAuthDialog:       10 passed
AuthDialog:          26 passed
AuthInProgress:       5 passed
LoginWithGoogleRestart: 4 passed
────────────────────────────────────
Total:               212 passed
Typecheck:            ✅
Lint:                 ✅
```
