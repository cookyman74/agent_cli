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
| 2   | `packages/cli/src/ui/auth/VertexConfigDialog.test.tsx` | VertexConfigDialog 단위 테스트 (13개) |

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
- **Esc (Step 2)**: Step 1로 돌아감

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
VertexConfigDialog:       13 passed
ProviderSelectDialog:     20 passed (snapshot 업데이트)
DialogManager:            21 passed (+1 vertex)
useAuth:                  27 passed (+1 vertex restart)
SlmConfigDialog:          13 passed
ApiAuthDialog:            10 passed
AuthDialog:               26 passed
AuthInProgress:            5 passed
LoginWithGoogleRestart:    4 passed
────────────────────────────────────
Total:                   139 passed
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
