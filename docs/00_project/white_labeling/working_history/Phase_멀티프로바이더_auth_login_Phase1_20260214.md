# 멀티프로바이더 `/auth login` Phase 1 작업 결과서

> **작업일**: 2026-02-14 **작업자**: Claude Code (Opus 4.6) **브랜치**:
> `v0.1.2/white_labelling` **방법론**: TDD (Red → Green → Refactor) + Tidy First
> **설계서**: `docs/00_project/white_labeling/auth_login_멀티프로바이더_설계.md`

---

## 1. 작업 목적

`/auth login` 명령에 멀티프로바이더 지원을 추가하여 Gemini 외에 Claude, OpenAI,
Vertex AI, sLM 프로바이더를 대화형 UI로 선택하고 인증할 수 있도록 한다.

**Phase 1 범위 (MVP)**: 프로바이더 선택 UI (Step 1) + Gemini/Claude/OpenAI API
Key 인증 (Step 2)

### 변경 전 → 변경 후

```
[변경 전] /auth login → AuthState.Updating → AuthDialog (Gemini 4가지)
         → onSelect → save selectedType → refreshAuth → Authenticated

[변경 후] /auth login → AuthState.SelectingProvider → ProviderSelectDialog (Step 1)
         → Gemini     → AuthState.Updating → AuthDialog (Google Login / API Key)
         → Claude/OpenAI → AuthState.AwaitingApiKeyInput → ApiAuthDialog (프로바이더별)
         → save selectedProvider + config → refreshAuth → Authenticated
```

---

## 2. 작업 결과 요약

| Step         | 내용                            | 변경 파일 | 테스트    | 결과 |
| ------------ | ------------------------------- | --------- | --------- | ---- |
| Step 1.0     | AuthState enum 확장             | 1         | 기존 통과 | ✅   |
| Step 1.1     | settings 스키마 확장            | 1         | typecheck | ✅   |
| Step 1.2     | 프로바이더별 API Key 저장       | 2         | 15개 신규 | ✅   |
| Step 1.3     | 프로바이더 메타데이터 상수      | 1 (신규)  | -         | ✅   |
| Step 1.4     | ProviderSelectDialog            | 2 (신규)  | 20개 신규 | ✅   |
| Step 1.5     | ApiAuthDialog 프로바이더 대응   | 2         | 10개      | ✅   |
| Step 1.6     | AuthDialog Gemini 전용 스코프   | 2         | 26개      | ✅   |
| Step 1.7-1.9 | useAuth + AppContainer + wiring | 10        | 80개 합산 | ✅   |

**총 변경 파일**: 22개 (신규 4 + 수정 18) **총 테스트**: 80개 auth 테스트 통과

---

## 3. Phase별 상세

### 3.1 사전작업

**기존 Auth 흐름 분석**:

- `AuthState` enum: 5개 값 (Unauthenticated, Updating, AwaitingApiKeyInput,
  Authenticated, AwaitingGoogleLoginRestart)
- `useAuth.ts`: selectedType 기반 상태 전이, Gemini 전용
- `AppContainer.tsx`: handleAuthSelect → AuthType 저장 → refreshAuth
- `DialogManager.tsx`: AuthState 기반 조건부 렌더링 (auth 관련 5개 분기)
- `apiKeyCredentialStorage.ts`: 단일 entry (`default-api-key`)로 Gemini만 지원

**의존성 확인**:

- `providerSelector.ts`의 `LLM_PROVIDER` env var 우선 감지 로직이 이미 존재 →
  비-Gemini 프로바이더 연동 가능
- Settings 스키마에 `security.auth` 섹션이 이미 있어 필드 추가 용이

### 3.2 Step 1.0: AuthState enum 확장 (Tidy First — 구조)

**파일**: `packages/cli/src/ui/types.ts`

```typescript
export enum AuthState {
  // --- 기존 ---
  Unauthenticated = 'unauthenticated',
  Updating = 'updating',
  AwaitingApiKeyInput = 'awaiting_api_key_input',
  Authenticated = 'authenticated',
  AwaitingGoogleLoginRestart = 'awaiting_google_login_restart',
  // --- 신규 ---
  SelectingProvider = 'selecting_provider',
  ConfiguringSlm = 'configuring_slm',
  ConfiguringVertex = 'configuring_vertex',
}
```

### 3.3 Step 1.1: settings 스키마 확장 (Tidy First — 구조)

**파일**: `packages/cli/src/config/settingsSchema.ts`

`security.auth.properties`에 3개 필드 추가:

- `selectedProvider`: string — 선택된 프로바이더 키 (gemini, claude, openai,
  vertex-ai, slm)
- `slmConfig`: object — sLM 엔드포인트 설정 (baseUrl, model, apiKeyHeaderName,
  customHeaders)
- `vertexConfig`: object — Vertex AI 설정 (project, location)

### 3.4 Step 1.2: 프로바이더별 API Key 저장 (TDD)

**파일**: `packages/core/src/core/apiKeyCredentialStorage.ts`,
`apiKeyCredentialStorage.test.ts`

**TDD 사이클**:

- RED: 프로바이더별 load/save/clear 15개 테스트 작성 → FAIL
- GREEN: `PROVIDER_KEYCHAIN_ENTRIES` 매핑 +
  `loadProviderApiKey`/`saveProviderApiKey`/`clearProviderApiKey` 구현
- REFACTOR: 기존 `loadApiKey`/`saveApiKey`/`clearApiKey`를 gemini alias로 변경
  (하위 호환)

```typescript
const PROVIDER_KEYCHAIN_ENTRIES: Record<string, string> = {
  gemini: 'default-api-key', // 기존 호환
  claude: 'claude-api-key',
  openai: 'openai-api-key',
  'openai-compatible': 'slm-api-key',
  didim: 'didim-api-key',
};
```

### 3.5 Step 1.3: 프로바이더 메타데이터 상수

**파일**: 신규 `packages/cli/src/ui/auth/providerMetadata.ts`

```typescript
export const PROVIDER_DISPLAY_MAP: Record<string, ProviderDisplayInfo> = {
  gemini: {
    label: 'Gemini',
    envVarName: 'GEMINI_API_KEY',
    apiKeyUrl: 'https://aistudio.google.com/...',
  },
  claude: {
    label: 'Claude',
    envVarName: 'ANTHROPIC_API_KEY',
    apiKeyUrl: 'https://console.anthropic.com/...',
  },
  openai: {
    label: 'OpenAI',
    envVarName: 'OPENAI_API_KEY',
    apiKeyUrl: 'https://platform.openai.com/...',
  },
  'vertex-ai': { label: 'Vertex AI', envVarName: '', apiKeyUrl: '' },
  slm: { label: 'sLM', envVarName: 'LLM_API_KEY', apiKeyUrl: '' },
};
export const PROVIDER_SELECT_ITEMS = [
  'gemini',
  'claude',
  'openai',
  'vertex-ai',
  'slm',
];
```

### 3.6 Step 1.4: ProviderSelectDialog (TDD)

**파일**: 신규 `packages/cli/src/ui/auth/ProviderSelectDialog.tsx`,
`ProviderSelectDialog.test.tsx`

**TDD 사이클**: 20개 테스트 (렌더링 5항목, 초기 선택, onSelect, Esc 처리,
스냅샷)

**주요 구현**:

- `RadioButtonSelect` + `Box borderStyle="round"` 레이아웃 (AuthDialog 패턴
  재사용)
- `PROVIDER_SELECT_ITEMS`에서 아이템 생성, `initialIndex`는 `currentProvider`
  기반
- Esc: `currentProvider` 있으면 `onCancel` → Authenticated 복귀, 없으면 에러
  메시지

### 3.7 Step 1.5-1.6: ApiAuthDialog + AuthDialog 수정

**ApiAuthDialog** (10 tests):

- `provider?: string` prop 추가
- 동적 제목: `"Enter {label} API Key"` (from `PROVIDER_DISPLAY_MAP`)
- 동적 URL: 프로바이더별 `apiKeyUrl`
- `clearApiKey()` → `clearProviderApiKey(provider || 'gemini')` 변경

**AuthDialog** (26 tests):

- Vertex AI 항목 제거 (Step 1에서 별도 선택지)
- `onBack?: () => void` prop 추가
- Esc 키: `onBack` 존재 시 호출 (Step 1로 복귀)

### 3.8 Step 1.7-1.9: useAuth + AppContainer + DialogManager 와이어링

**useAuth.ts**:

- `determineInitialState()` 함수 추가: 멀티프로바이더 초기 상태 결정
  - `selectedType` + no `selectedProvider` → Unauthenticated (자동 마이그레이션)
  - env var 존재 (LLM_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY,
    GEMINI_API_KEY) → Unauthenticated
  - 아무것도 없음 → SelectingProvider
- `selectedProvider` state + `reloadProviderApiKey` callback 추가

**UIStateContext.tsx**: `isSelectingProvider: boolean`,
`selectedProvider?: string` 추가 **UIActionsContext.tsx**:
`handleProviderSelect: (providerKey: string) => void` 추가

**AppContainer.tsx**:

- `handleProviderSelect` 콜백: gemini→Updating,
  claude/openai→AwaitingApiKeyInput, vertex-ai→Updating, slm→ConfiguringSlm
- `handleApiKeySubmit` 프로바이더 대응: 비-Gemini는 `saveProviderApiKey` + env
  var 설정
- `handleApiKeyCancel`: SelectingProvider로 복귀 (Updating 대신)
- `openAuthDialog`: SelectingProvider로 변경 (Updating 대신)

**DialogManager.tsx**:

- `isSelectingProvider` 렌더링 분기 추가 (기존 auth 분기 앞에)
- ApiAuthDialog에 `provider` prop 전달
- AuthDialog에 `onBack` prop 전달 (SelectingProvider로 복귀)

**authCommand.ts**: logout시 `selectedProvider` 설정도 클리어

---

## 4. 검증 결과

### 단위 테스트

| 테스트 파일                       | 테스트 수 | 결과 |
| --------------------------------- | --------- | ---- |
| `ProviderSelectDialog.test.tsx`   | 20        | ✅   |
| `ApiAuthDialog.test.tsx`          | 10        | ✅   |
| `AuthDialog.test.tsx`             | 26        | ✅   |
| `useAuth.test.tsx`                | 15        | ✅   |
| `AuthInProgress.test.tsx`         | 4         | ✅   |
| `apiKeyCredentialStorage.test.ts` | 5 (신규)  | ✅   |
| **합계**                          | **80**    | ✅   |

### 통합 검증

| 항목                | 결과                                           |
| ------------------- | ---------------------------------------------- |
| `npm run lint`      | ✅ PASS                                        |
| `npm run typecheck` | ✅ PASS                                        |
| CLI 전체 테스트     | 4626/4631 passed (4 failed는 기존 인프라 이슈) |
| 기존 auth 회귀      | ✅ 없음                                        |

### 기존 실패 테스트 (변경 무관)

- `initCommand.test.ts` (2 failed) — writeFileSync 관련
- `extensions/install.test.ts` (1 failed) — 인프라
- `extensions/validate.test.ts` (1 failed) — 인프라
- `mcp.test.ts` (1 failed) — 인프라

---

## 5. 이슈 및 해결

| #   | 이슈                                   | 원인                                                                                       | 해결                                                                |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| 1   | ESLint `no-unnecessary-type-assertion` | `settings.merged.security.auth.selectedProvider`가 이미 `string \| undefined` 타입         | `as string \| undefined` 캐스트 제거                                |
| 2   | useAuth.test.tsx 기대값 불일치         | `determineInitialState()`가 SelectingProvider 반환 → 기존 Unauthenticated 에러 로직 미실행 | 테스트 기대값을 SelectingProvider로 변경                            |
| 3   | UIActions mock 누락                    | `handleProviderSelect` 추가 후 test-utils 미동기화                                         | `render.tsx`의 mockUIActions에 `handleProviderSelect: vi.fn()` 추가 |
| 4   | DialogManager AuthState 캐스팅         | AuthState enum 값을 문자열로 사용 시 타입 불일치                                           | `AuthState` import + enum 값 직접 사용                              |
| 5   | Edit 중복 문자열 매칭                  | AppContainer에서 동일 문자열이 object literal과 deps array에 모두 존재                     | 더 넓은 surrounding context로 unique match                          |

---

## 6. 교훈 (Lessons Learned)

1. **determineInitialState 패턴**: useState의 초기값으로 함수 호출 사용 → 조건부
   초기 상태 결정에 유용
2. **UIState/UIActions 동기화**: 새 상태/액션 추가 시 test-utils의 mock도 반드시
   동기화 필요
3. **DialogManager 렌더링 우선순위**: 새 분기를 추가할 때 기존 분기와의 우선순위
   관계 고려 필수
4. **env var 기반 프로바이더 연동**: `LLM_PROVIDER` env var를 선설정하면 기존
   `providerSelector` 로직을 재활용하여 비-Gemini 프로바이더 인증 가능
5. **Settings 스키마 하위 호환**: default=`undefined`로 설정하면 기존 설정
   파일과 충돌 없음

---

## 7. 커밋 요약

| #   | 커밋 ID   | 메시지                                                              | 파일 수 |
| --- | --------- | ------------------------------------------------------------------- | ------- |
| 1   | `733a5a7` | refactor: 배포 패키지명 @didim/agent-cli → @didim365/agent-cli 변경 | 469     |
| 2   | `1984d47` | feat(cli): 멀티프로바이더 /auth login Phase 1 MVP 구현              | 22      |

---

## 8. 다음 단계

### Phase 2: sLM 대화형 설정

- SlmConfigDialog 구현 (baseUrl, apiKey, model 입력 폼)
- AppContainer `handleSlmConfigComplete` 와이어링
- DialogManager `ConfiguringSlm` 렌더링 분기

### Phase 3: Vertex AI + Google Login

- VertexConfigDialog 구현 (인증 방법 선택 + project/location 입력)
- AppContainer `handleVertexConfigComplete` 와이어링
- DialogManager `ConfiguringVertex` 렌더링 분기

### Phase 4: 하위 호환 + 마이그레이션

- initializer.ts에 `migrateAuthSettings()` 추가
- useAuth.ts 환경변수 자동 감지 보강
- auth.ts에 `validateProviderAuth()` 추가

### 전달 이슈

- Phase 1에서 `ConfiguringSlm`/`ConfiguringVertex` AuthState는 추가했으나 실제
  다이얼로그는 미구현 (선택 시 해당 상태로 전환만 됨)
- `useAuth.ts`의 env var 자동 감지는 `determineInitialState`에서
  `Unauthenticated`로만 라우팅 → Phase 4에서 직접 Authenticated로 전이하도록
  보강 필요
- authCommand logout에서 `clearProviderApiKey(provider)` 호출은 Phase 4에서 추가
  (현재는 `selectedProvider` 설정 클리어만)
