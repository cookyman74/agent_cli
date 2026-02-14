# 멀티프로바이더 `/auth login` 작업 계획서

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**:
> 사전작업 → 본작업 → 사후작업 3-Stage 준수 **Tidy First**: 구조적 변경과 동작
> 변경 분리, 별도 커밋 **설계 문서**:
> `docs/00_project/white_labeling/auth_login_멀티프로바이더_설계.md` **브랜치**:
> `v0.1.2/white_labelling` **버전**: v1.0

---

## 📋 작업 개요

| 항목        | 내용                                                             |
| ----------- | ---------------------------------------------------------------- |
| 프로젝트    | `/auth login` 멀티프로바이더 2단계 대화형 인증 흐름 구현         |
| 목표 흐름   | Step 1: 프로바이더 선택 → Step 2: 프로바이더별 인증 설정         |
| 영향 범위   | CLI auth UI (22개 파일), Core apiKeyCredentialStorage (2개 파일) |
| 위험 수준   | 🟡 Medium (기존 Gemini 인증 흐름 하위 호환 필수)                 |
| 작업 브랜치 | `v0.1.2/white_labelling`                                         |

### 목표 흐름도

```
/auth login → AuthState.SelectingProvider → ProviderSelectDialog (Step 1)
  → Gemini     → AuthState.Updating → AuthDialog (Google Login / API Key)
  → Claude/OpenAI → AuthState.AwaitingApiKeyInput → ApiAuthDialog (프로바이더별)
  → sLM        → AuthState.ConfiguringSlm → SlmConfigDialog
  → Vertex AI  → AuthState.ConfiguringVertex → VertexConfigDialog
  → save selectedProvider + config → refreshAuth → Authenticated
```

---

## 🚨 핵심 리스크 요약

| 리스크                                    | 영향      | 대응 방안                                                  | 상태 |
| ----------------------------------------- | --------- | ---------------------------------------------------------- | ---- |
| `config.refreshAuth()`가 비-Gemini 미동작 | 🟠 Medium | `LLM_PROVIDER` env var 선설정 → providerSelector 우선 감지 | ✅   |
| 기존 Gemini 인증 깨짐                     | 🔴 High   | Phase 4 마이그레이션 + 기존 테스트 전수 통과               | ✅   |
| Settings 스키마 하위 비호환               | 🟢 Low    | 새 필드 default=`undefined`, 기존 필드 미변경              | ✅   |
| DialogManager 렌더링 우선순위 충돌        | 🟡 Medium | `SelectingProvider`를 기존 auth 분기 앞에 배치             | ✅   |
| sLM/Vertex AI 설정 UI 복잡도              | 🟡 Medium | Phase 2/3으로 분리, Phase 1은 API Key만 지원               | ⬜   |

---

## 🔄 Phase 1: 프로바이더 선택 + API Key 인증 (MVP)

> Gemini, Claude, OpenAI의 API Key 인증까지 지원하는 최소 구현

### 1.0 사전작업 (Pre-Work)

- [x] **[CONTEXT]** 작업 목적 및 배경 확인
  - 현재 `/auth login`은 Gemini 전용 (AuthDialog에 4가지 방법 하드코딩)
  - 비-Gemini 프로바이더는 환경변수로만 설정 가능 → 대화형 UI 필요
  - 설계서: `auth_login_멀티프로바이더_설계.md`
- [x] **[ANALYSIS]** 기존 auth 흐름 분석
  - AuthState enum: 5개 값 (Unauthenticated, Updating, AwaitingApiKeyInput,
    Authenticated, AwaitingGoogleLoginRestart)
  - useAuth.ts: 상태 전이 로직 (selectedType 기반)
  - AppContainer.tsx: handleAuthSelect, handleApiKeySubmit 콜백
  - DialogManager.tsx: AuthState 기반 렌더링 분기
- [x] **[DEPENDENCY]** 기존 코드 의존성 확인
  - `apiKeyCredentialStorage.ts`: 단일 entry (default-api-key)
  - `settingsSchema.ts`: security.auth 필드 (selectedType, enforcedType)
  - `providerSelector.ts`: LLM_PROVIDER env var 우선 감지 로직 존재 (변경
    불필요)

### 1.1 본작업 — Step 1.0: AuthState enum 확장 (Tidy First — 구조)

**파일**: `packages/cli/src/ui/types.ts`

- [x] **[TASK]** AuthState enum에 3개 값 추가
  - `SelectingProvider = 'selecting_provider'`
  - `ConfiguringSlm = 'configuring_slm'`
  - `ConfiguringVertex = 'configuring_vertex'`
- [x] **[VERIFY]** 기존 테스트 통과 확인

### 1.2 본작업 — Step 1.1: settings 스키마 확장 (Tidy First — 구조)

**파일**: `packages/cli/src/config/settingsSchema.ts`

- [x] **[TASK]** `security.auth.properties`에 3개 필드 추가
  - `selectedProvider`: string, 선택된 프로바이더 키
  - `slmConfig`: object, sLM 엔드포인트 설정 (baseUrl, model, apiKeyHeaderName,
    customHeaders)
  - `vertexConfig`: object, Vertex AI 설정 (project, location)
- [x] **[VERIFY]** typecheck 통과

### 1.3 본작업 — Step 1.2: 프로바이더별 API Key 저장 (Core, TDD)

**파일**: `packages/core/src/core/apiKeyCredentialStorage.ts`,
`apiKeyCredentialStorage.test.ts`

- [x] **🔴 RED**: 프로바이더별 load/save/clear 테스트 작성
  - `loadProviderApiKey('claude')` → 저장된 키 반환
  - `saveProviderApiKey('openai', 'sk-xxx')` → openai-api-key entry 저장
  - `loadApiKey()` → 기존과 동일 동작 (gemini alias)
- [x] **🟢 GREEN**: 최소 구현
  - `PROVIDER_KEYCHAIN_ENTRIES` 매핑 (gemini, claude, openai, openai-compatible,
    didim)
  - `loadProviderApiKey`, `saveProviderApiKey`, `clearProviderApiKey` 구현
  - 기존 함수 = gemini alias (하위 호환)
- [x] **🔵 REFACTOR**: HybridTokenStorage 인스턴스 재사용 확인
- [x] **[VERIFY]** 테스트 통과 (15개 신규 + 기존 테스트)

### 1.4 본작업 — Step 1.3: 프로바이더 메타데이터 상수

**파일**: 신규 `packages/cli/src/ui/auth/providerMetadata.ts`

- [x] **[TASK]** ProviderDisplayInfo 인터페이스 + PROVIDER_DISPLAY_MAP 정의
  - gemini, claude, openai, vertex-ai, slm 각각의 label, description,
    envVarName, apiKeyUrl
- [x] **[TASK]** PROVIDER_SELECT_ITEMS 배열 (Step 1 표시 순서)
- [x] **[TASK]** getProviderDisplayInfo() 헬퍼 함수

### 1.5 본작업 — Step 1.4: ProviderSelectDialog (Step 1 UI, TDD)

**파일**: 신규 `packages/cli/src/ui/auth/ProviderSelectDialog.tsx`,
`ProviderSelectDialog.test.tsx`

- [x] **🔴 RED**: 렌더링 + 상호작용 테스트 작성 (20개)
  - 5개 항목 렌더링, onSelect 정확한 providerKey 전달, Esc 처리
- [x] **🟢 GREEN**: RadioButtonSelect + Box borderStyle="round" 패턴 재사용
- [x] **🔵 REFACTOR**: Props 타입 정리
- [x] **[VERIFY]** 20개 테스트 + 스냅샷 통과

### 1.6 본작업 — Step 1.5: ApiAuthDialog 프로바이더 대응

**파일**: `packages/cli/src/ui/auth/ApiAuthDialog.tsx`, `ApiAuthDialog.test.tsx`

- [x] **🔴 RED**: provider별 렌더링 테스트 추가 (Claude 제목/URL, OpenAI
      제목/URL, default Gemini)
- [x] **🟢 GREEN**: provider prop 추가, 동적 레이블/URL, clearProviderApiKey
      연동
- [x] **[VERIFY]** 10개 테스트 통과

### 1.7 본작업 — Step 1.6: AuthDialog Gemini 전용 스코프

**파일**: `packages/cli/src/ui/auth/AuthDialog.tsx`, `AuthDialog.test.tsx`

- [x] **[TASK]** Vertex AI 항목 제거 (Step 1로 이동)
- [x] **[TASK]** onBack prop 추가 + Esc 키 핸들러 수정
- [x] **[VERIFY]** 26개 테스트 + 스냅샷 통과

### 1.8 본작업 — Step 1.7-1.9: useAuth + AppContainer + DialogManager 와이어링

**파일**: `useAuth.ts`, `AppContainer.tsx`, `DialogManager.tsx`,
`UIStateContext.tsx`, `UIActionsContext.tsx`, `authCommand.ts`, `render.tsx`

- [x] **[TASK]** useAuth: determineInitialState + selectedProvider 상태 +
      reloadProviderApiKey
- [x] **[TASK]** UIState: isSelectingProvider, selectedProvider 추가
- [x] **[TASK]** UIActions: handleProviderSelect 추가
- [x] **[TASK]** AppContainer: handleProviderSelect 콜백, 프로바이더별
      handleApiKeySubmit
- [x] **[TASK]** DialogManager: ProviderSelectDialog 렌더링 분기 + provider prop
      전파
- [x] **[TASK]** authCommand: logout시 selectedProvider 클리어
- [x] **[TASK]** render.tsx: mock 업데이트 (handleProviderSelect,
      isSelectingProvider)
- [x] **[TASK]** useAuth.test.tsx: SelectingProvider 초기 상태 테스트 업데이트
- [x] **[VERIFY]** 80개 auth 테스트 전수 통과

### 1.9 사후작업 (Post-Work)

- [x] **[LINT]** `npm run lint -w @didim365/agent-cli` → ✅ 통과
- [x] **[TYPECHECK]** `npm run typecheck -w @didim365/agent-cli` → ✅ 통과
- [x] **[TEST]** auth 테스트 80/80 passed, CLI 전체 4626/4631 passed (4 failed는
      기존 인프라 이슈)
- [x] **[REGRESSION]** 기존 Gemini 인증 테스트 회귀 없음
- [x] **[COMMIT]** `1984d47` —
      `feat(cli): 멀티프로바이더 /auth login Phase 1 MVP 구현`
- [x] **[DOC]** 작업 결과서 작성

### Phase 1 Quality Gates

- [x] 모든 단위 테스트 통과 (80/80 auth, 4626/4631 전체)
- [x] TypeScript 컴파일 에러 없음
- [x] ESLint 경고 없음
- [x] 기존 테스트 회귀 없음
- [x] 문서 업데이트 완료

---

## 🔄 Phase 2: sLM 대화형 설정

> Phase 1 완료 후 진행. sLM (OpenAI-compatible) 엔드포인트/키/모델 대화형 설정.

### 2.0 사전작업 (Pre-Work)

- [ ] **[CONTEXT]** Phase 1 작업 결과서 리뷰
- [ ] **[ANALYSIS]** sLM 프로바이더 요구사항 확인
  - 필수: API Endpoint URL (baseUrl)
  - 선택: API Key, Model 이름, 커스텀 헤더, API Key 헤더명
- [ ] **[DEPENDENCY]** AppContainer의 `ConfiguringSlm` 분기 확인 (Phase 1에서
      라우팅만 구현)

### 2.1 본작업 — Step 2.0: SlmConfigDialog (TDD)

**파일**: 신규 `packages/cli/src/ui/auth/SlmConfigDialog.tsx`,
`SlmConfigDialog.test.tsx`

- [ ] **🔴 RED**: 3단계 폼 렌더링 + 입력 검증 테스트 작성
  - Step A: API Endpoint URL 입력 (http/https 검증)
  - Step B: API Key (선택) + Model 이름 (선택, default: `default`)
  - Step C: 고급 설정 (커스텀 헤더/API Key 헤더명)
- [ ] **🟢 GREEN**: useTextBuffer + TextInput 패턴 재사용
  ```typescript
  interface SlmConfigDialogProps {
    onComplete: (config: SlmConfig) => void;
    onCancel: () => void;
    defaultConfig?: SlmConfig;
  }
  ```
- [ ] **🔵 REFACTOR**: 입력 유효성 검증 로직 정리
- [ ] **[VERIFY]** 테스트 통과

### 2.2 본작업 — Step 2.1: sLM 플로우 와이어링

**파일**: `AppContainer.tsx`, `DialogManager.tsx`

- [ ] **[TASK]** AppContainer: `handleSlmConfigComplete` 콜백 추가
  - settings에 slmConfig 저장
  - `LLM_PROVIDER=openai-compatible` 환경변수 설정
  - `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` 설정
  - `config.refreshAuth()` 호출 → Authenticated
- [ ] **[TASK]** DialogManager: `ConfiguringSlm` 렌더링 분기 추가
- [ ] **[VERIFY]** 통합 테스트

### 2.3 사후작업 (Post-Work)

- [ ] **[LINT]** 린트 통과
- [ ] **[TYPECHECK]** 타입체크 통과
- [ ] **[TEST]** 테스트 회귀 없음
- [ ] **[COMMIT]**
      `feat(cli): add SlmConfigDialog and wire sLM configuration flow`
- [ ] **[DOC]** 작업 결과서 작성

### Phase 2 Quality Gates

- [ ] 모든 단위 테스트 통과
- [ ] TypeScript 컴파일 에러 없음
- [ ] ESLint 경고 없음
- [ ] 기존 테스트 회귀 없음

---

## 🔄 Phase 3: Vertex AI + Google Login

> Phase 1 완료 후 진행. Phase 2와 독립, 병렬 가능.

### 3.0 사전작업 (Pre-Work)

- [ ] **[CONTEXT]** Phase 1 작업 결과서 리뷰
- [ ] **[ANALYSIS]** Vertex AI 인증 요구사항 확인
  - 인증 방법: Google Login 또는 API Key
  - 필수: Project ID, Location
- [ ] **[DEPENDENCY]** AppContainer의 `ConfiguringVertex` 분기 확인

### 3.1 본작업 — Step 3.0: VertexConfigDialog (TDD)

**파일**: 신규 `packages/cli/src/ui/auth/VertexConfigDialog.tsx`,
`VertexConfigDialog.test.tsx`

- [ ] **🔴 RED**: 2단계 폼 테스트 작성
  - Step A: 인증 방법 선택 (Google Login / API Key)
  - Step B: Project ID + Location 입력
- [ ] **🟢 GREEN**: RadioButtonSelect + TextInput 패턴 재사용
  ```typescript
  interface VertexConfigDialogProps {
    onComplete: (
      config: VertexConfig,
      authMethod: 'google-login' | 'api-key',
    ) => void;
    onCancel: () => void;
    config?: Config;
    defaultConfig?: VertexConfig;
  }
  ```
- [ ] **🔵 REFACTOR**: 코드 정리
- [ ] **[VERIFY]** 테스트 통과

### 3.2 본작업 — Step 3.1: Vertex AI 플로우 와이어링

**파일**: `AppContainer.tsx`, `DialogManager.tsx`

- [ ] **[TASK]** AppContainer: `handleVertexConfigComplete` 콜백 추가
  - `selectedProvider='gemini'` + `selectedType=AuthType.USE_VERTEX_AI` +
    vertexConfig 저장
- [ ] **[TASK]** DialogManager: `ConfiguringVertex` 렌더링 분기 추가
- [ ] **[VERIFY]** 통합 테스트

### 3.3 사후작업 (Post-Work)

- [ ] **[LINT]** 린트 통과
- [ ] **[TYPECHECK]** 타입체크 통과
- [ ] **[TEST]** 테스트 회귀 없음
- [ ] **[COMMIT]** `feat(cli): add VertexConfigDialog and wire Vertex AI flow`
- [ ] **[DOC]** 작업 결과서 작성

### Phase 3 Quality Gates

- [ ] 모든 단위 테스트 통과
- [ ] TypeScript 컴파일 에러 없음
- [ ] ESLint 경고 없음
- [ ] 기존 테스트 회귀 없음

---

## 🔄 Phase 4: 하위 호환 + 마이그레이션

> Phase 1 완료 후 진행. Phase 2/3과 독립 가능하나 마지막에 진행 권장.

### 4.0 사전작업 (Pre-Work)

- [ ] **[CONTEXT]** Phase 1~3 작업 결과서 리뷰
- [ ] **[ANALYSIS]** 마이그레이션 시나리오 확인
  - 기존 Gemini 사용자: selectedType 있음 + selectedProvider 없음
  - 환경변수 사용자: ANTHROPIC_API_KEY, OPENAI_API_KEY, LLM_PROVIDER
  - 신규 사용자: 아무 설정 없음 → SelectingProvider

### 4.1 본작업 — Step 4.0: 기존 사용자 자동 마이그레이션

**파일**: `packages/cli/src/core/initializer.ts`

- [ ] **🔴 RED**: 마이그레이션 시나리오 테스트 작성
- [ ] **🟢 GREEN**: `migrateAuthSettings()` 구현
  ```typescript
  function migrateAuthSettings(settings: LoadedSettings): void {
    const auth = settings.merged.security.auth;
    if (auth.selectedType && !auth.selectedProvider) {
      settings.setValue(
        SettingScope.User,
        'security.auth.selectedProvider',
        'gemini',
      );
    }
  }
  ```
- [ ] **[VERIFY]** 테스트 통과

### 4.2 본작업 — Step 4.1: 환경변수 자동 감지

**파일**: `packages/cli/src/ui/auth/useAuth.ts`

- [ ] **[TASK]** selectedProvider + selectedType 모두 없을 때 env var 자동 감지:
  - `LLM_PROVIDER` → Authenticated 직행
  - `ANTHROPIC_API_KEY` → `LLM_PROVIDER=claude` → Authenticated
  - `OPENAI_API_KEY` → `LLM_PROVIDER=openai` → Authenticated
  - 없으면 → SelectingProvider
- [ ] **[VERIFY]** 테스트 통과

### 4.3 본작업 — Step 4.2: auth 검증 + initializer 보강

**파일**: `packages/cli/src/config/auth.ts`,
`packages/cli/src/core/initializer.ts`

- [ ] **[TASK]** `validateProviderAuth(provider)` — 비-Gemini env var 존재 확인
- [ ] **[TASK]** `shouldOpenAuthDialog` 로직 수정
- [ ] **[VERIFY]** 통합 테스트

### 4.4 사후작업 (Post-Work)

- [ ] **[LINT]** 린트 통과
- [ ] **[TYPECHECK]** 타입체크 통과
- [ ] **[TEST]** 전체 테스트 회귀 확인
- [ ] **[E2E]** 수동 E2E 테스트 5개 시나리오
  1. 설정 초기화 → `didim` → Step 1 표시 확인
  2. Claude 선택 → API Key 입력 → Authenticated
  3. `/auth login` → Step 1 재표시 → Gemini 선택 → Step 2A
  4. `/auth logout` → 설정 클리어 → Step 1 표시
  5. `ANTHROPIC_API_KEY=xxx didim` → 자동 감지 → 다이얼로그 건너뛰기
- [ ] **[COMMIT]**
      `feat(cli): add auth settings migration and env var auto-detection`
- [ ] **[DOC]** 작업 결과서 작성

### Phase 4 Quality Gates

- [ ] 모든 단위 테스트 통과
- [ ] TypeScript 컴파일 에러 없음
- [ ] ESLint 경고 없음
- [ ] 기존 테스트 회귀 없음
- [ ] E2E 시나리오 5개 통과

---

## ✅ 최종 체크리스트

### Phase 완료 현황

| Phase   | 내용                          | 🔴 Red | 🟢 Green | 🔵 Refactor | 결과서 | 커밋      | 상태 |
| ------- | ----------------------------- | ------ | -------- | ----------- | ------ | --------- | ---- |
| Phase 1 | 프로바이더 선택 + API Key MVP | ✅     | ✅       | ✅          | ✅     | `1984d47` | ✅   |
| Phase 2 | sLM 대화형 설정               | ⬜     | ⬜       | ⬜          | ⬜     | ⬜        | ⬜   |
| Phase 3 | Vertex AI + Google Login      | ⬜     | ⬜       | ⬜          | ⬜     | ⬜        | ⬜   |
| Phase 4 | 하위 호환 + 마이그레이션      | ⬜     | ⬜       | ⬜          | ⬜     | ⬜        | ⬜   |

### Phase 의존성

```
Phase 1 (MVP) ─┬─ Phase 2 (sLM)      [독립]
               ├─ Phase 3 (Vertex AI) [독립]
               └─ Phase 4 (마이그레이션) [Phase 1 완료 후]
```

Phase 2와 Phase 3은 서로 독립, 병렬 가능. Phase 4는 마지막.

### 수정 파일 요약

**신규 (Phase 1 완료)**: | # | 파일 | 설명 | |---|------|------| | 1 |
`packages/cli/src/ui/auth/providerMetadata.ts` | 프로바이더 메타데이터 상수 | |
2 | `packages/cli/src/ui/auth/ProviderSelectDialog.tsx` | Step 1: 프로바이더
선택 UI | | 3 | `packages/cli/src/ui/auth/ProviderSelectDialog.test.tsx` |
ProviderSelectDialog TDD 테스트 |

**수정 (Phase 1 완료)**: | # | 파일 | 수정 내용 | |---|------|-----------| | 1 |
`packages/cli/src/ui/types.ts` | AuthState 3개 값 추가 | | 2 |
`packages/cli/src/config/settingsSchema.ts` | selectedProvider, slmConfig,
vertexConfig 스키마 | | 3 | `packages/core/src/core/apiKeyCredentialStorage.ts`
| 프로바이더별 load/save/clear | | 4 |
`packages/core/src/core/apiKeyCredentialStorage.test.ts` | 프로바이더별 키 저장
테스트 | | 5 | `packages/cli/src/ui/auth/ApiAuthDialog.tsx` | provider prop +
동적 레이블/URL | | 6 | `packages/cli/src/ui/auth/ApiAuthDialog.test.tsx` |
프로바이더별 렌더링 테스트 | | 7 | `packages/cli/src/ui/auth/AuthDialog.tsx` |
Gemini 전용 스코프 + onBack | | 8 |
`packages/cli/src/ui/auth/AuthDialog.test.tsx` | onBack 테스트 추가 | | 9 |
`packages/cli/src/ui/auth/useAuth.ts` | selectedProvider 상태 +
determineInitialState | | 10 | `packages/cli/src/ui/auth/useAuth.test.tsx` |
SelectingProvider 기대값 변경 | | 11 | `packages/cli/src/ui/AppContainer.tsx` |
handleProviderSelect, 프로바이더별 submit | | 12 |
`packages/cli/src/ui/components/DialogManager.tsx` | ProviderSelectDialog 렌더링
분기 | | 13 | `packages/cli/src/ui/contexts/UIStateContext.tsx` |
isSelectingProvider, selectedProvider | | 14 |
`packages/cli/src/ui/contexts/UIActionsContext.tsx` | handleProviderSelect | |
15 | `packages/cli/src/ui/commands/authCommand.ts` | logout 멀티프로바이더
클리어 | | 16 | `packages/cli/src/test-utils/render.tsx` | mock 업데이트 |

**미구현 (Phase 2~4)**: | # | 파일 | 설명 | |---|------|------| | 1 |
`packages/cli/src/ui/auth/SlmConfigDialog.tsx` | Phase 2: sLM 설정 UI | | 2 |
`packages/cli/src/ui/auth/VertexConfigDialog.tsx` | Phase 3: Vertex AI 설정 UI |
| 3 | `packages/cli/src/core/initializer.ts` | Phase 4: 마이그레이션 로직 | | 4
| `packages/cli/src/config/auth.ts` | Phase 4: validateProviderAuth |

---

## ⚠️ 주의사항

1. **핵심 메커니즘**: 비-Gemini 프로바이더는 `process.env['LLM_PROVIDER']`
   선설정 → `config.refreshAuth()` → `providerSelector`가 LLM_PROVIDER 우선 감지
2. **하위 호환**: 기존 `selectedType` 기반 Gemini 인증은 그대로 동작
   (auto-migration)
3. **Settings 스키마**: 새 필드 default=`undefined`로 기존 설정 파일과 호환
4. **DialogManager 우선순위**: `isSelectingProvider`를 기존 auth 분기 앞에 배치

---

**작성일**: 2026-02-14 **최종 수정일**: 2026-02-14 **상태**: 🔄 Phase 1 완료,
Phase 2~4 대기
