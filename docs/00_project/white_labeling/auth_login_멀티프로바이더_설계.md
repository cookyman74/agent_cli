# /auth login — 멀티 프로바이더 인증 흐름 설계

> **작성일**: 2026-02-14 **기준 브랜치**: `DID/v0.1` **목적**: `/auth login`
> 명령을 멀티 LLM 프로바이더 대응으로 재설계

---

## 1. 현재 상태 (As-Is)

### 1.1 현재 `/auth login` 흐름

```
/auth login (또는 최초 실행)
  ↓
AuthDialog.tsx — Gemini 전용 인증 방법 선택
  ├── Login with Google          (AuthType.LOGIN_WITH_GOOGLE)
  ├── Use Cloud Shell credentials (조건부 — CLOUD_SHELL=true)
  ├── Use Gemini API Key          (AuthType.USE_GEMINI)
  └── Vertex AI                   (AuthType.USE_VERTEX_AI)
  ↓
선택 결과 → settings.security.auth.selectedType에 저장
  ↓
config.refreshAuth(authType) → Gemini 클라이언트 초기화
```

### 1.2 현재 아키텍처의 한계

| 문제                 | 설명                                                                        |
| -------------------- | --------------------------------------------------------------------------- |
| Gemini 전용 설계     | AuthType enum이 Gemini 인증 방법만 정의                                     |
| 프로바이더 선택 부재 | 어떤 LLM을 사용할지 선택하는 단계가 없음                                    |
| API Key 저장소 단일  | `gemini-cli-api-key` 키체인에 하나의 키만 저장                              |
| 환경변수 의존        | 비-Gemini 프로바이더는 환경변수(`LLM_PROVIDER` + `*_API_KEY`)로만 설정 가능 |
| UI 연동 없음         | Claude/OpenAI/sLM 설정을 대화형으로 할 방법이 없음                          |

### 1.3 현재 프로바이더 체계 (core 레이어)

```typescript
// packages/core/src/providers/providerTypes.ts
enum ProviderType {
  Gemini = 'gemini',
  Claude = 'claude',
  OpenAI = 'openai',
  OpenAICompatible = 'openai-compatible', // sLM이 이것을 사용
  Didim = 'didim',
}
```

프로바이더별 환경변수:

| Provider                | API Key 환경변수                   | 기타 환경변수                                              |
| ----------------------- | ---------------------------------- | ---------------------------------------------------------- |
| Gemini                  | `GEMINI_API_KEY`, `GOOGLE_API_KEY` | —                                                          |
| Claude                  | `ANTHROPIC_API_KEY`                | —                                                          |
| OpenAI                  | `OPENAI_API_KEY`                   | —                                                          |
| OpenAI Compatible (sLM) | `LLM_API_KEY`                      | `LLM_BASE_URL`, `LLM_CUSTOM_HEADERS`, `LLM_API_KEY_HEADER` |
| Vertex AI               | `GOOGLE_API_KEY`                   | `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`            |
| Didim                   | `DIDIM_API_KEY`                    | —                                                          |

---

## 2. 목표 상태 (To-Be)

### 2.1 새로운 `/auth login` 흐름 — 2단계 대화형

```
/auth login
  ↓
┌────────────────────────────────────────────┐
│  Step 1: LLM 서비스 선택                     │
│                                            │
│  사용할 LLM 서비스를 선택하세요:              │
│                                            │
│  ○ Gemini        (Google AI)               │
│  ○ Claude        (Anthropic)               │
│  ○ OpenAI        (OpenAI)                  │
│  ○ Vertex AI     (Google Cloud)            │
│  ○ sLM           (Self-hosted / Local LLM) │
│                                            │
│  (Use ↑↓ to navigate, Enter to select)     │
└────────────────────────────────────────────┘
  ↓
  ├── Gemini 선택 ──────────→ Step 2A
  ├── Claude 선택 ──────────→ Step 2B
  ├── OpenAI 선택 ──────────→ Step 2B
  ├── Vertex AI 선택 ───────→ Step 2C
  └── sLM 선택 ────────────→ Step 2D
```

#### Step 2A: Gemini 인증 방법 선택

```
┌────────────────────────────────────────────┐
│  Gemini 인증 방법을 선택하세요:              │
│                                            │
│  ○ Login with Google   (브라우저 OAuth)     │
│  ○ Use API Key         (GEMINI_API_KEY)    │
│                                            │
│  (Use ↑↓ to navigate, Enter to select)     │
│  (Esc: 이전 단계로)                         │
└────────────────────────────────────────────┘
  ↓
  ├── Login with Google → 기존 OAuth 플로우 → 앱 재시작
  └── Use API Key → API Key 입력 대화상자
       ↓
       ┌──────────────────────────────────┐
       │  Gemini API Key를 입력하세요:     │
       │  > AIza************************ │
       │                                  │
       │  발급: https://aistudio.google.  │
       │  com/app/apikey                  │
       │  (Enter: 저장, Ctrl+C: 취소)     │
       └──────────────────────────────────┘
```

#### Step 2B: Claude / OpenAI API Key 입력

```
┌──────────────────────────────────────────────┐
│  Claude 인증 설정                              │
│                                              │
│  인증 방법을 선택하세요:                        │
│                                              │
│  ○ Use API Key  (ANTHROPIC_API_KEY)          │
│                                              │
│  (Enter to select)                           │
│  (Esc: 이전 단계로)                           │
└──────────────────────────────────────────────┘
  ↓
┌──────────────────────────────────────────────┐
│  Anthropic API Key를 입력하세요:               │
│  > sk-ant-********************               │
│                                              │
│  발급: https://console.anthropic.com/        │
│  settings/keys                               │
│  (Enter: 저장, Ctrl+C: 취소)                  │
└──────────────────────────────────────────────┘
```

OpenAI도 동일 구조:

- 환경변수: `OPENAI_API_KEY`
- 발급 URL: `https://platform.openai.com/api-keys`

#### Step 2C: Vertex AI 인증 설정

```
┌──────────────────────────────────────────────┐
│  Vertex AI 인증 설정                           │
│                                              │
│  인증 방법을 선택하세요:                        │
│                                              │
│  ○ Login with Google   (브라우저 OAuth)       │
│  ○ Use API Key         (GOOGLE_API_KEY)      │
│                                              │
│  (Use ↑↓ to navigate, Enter to select)       │
│  (Esc: 이전 단계로)                           │
└──────────────────────────────────────────────┘
  ↓
  ├── Login with Google → OAuth + 프로젝트/위치 입력
  └── Use API Key → API Key 입력
  ↓
┌──────────────────────────────────────────────┐
│  Google Cloud 프로젝트 설정                    │
│                                              │
│  Project ID:                                 │
│  > my-project-123                            │
│                                              │
│  Location (default: us-central1):            │
│  > us-central1                               │
│                                              │
│  (Enter: 저장, Esc: 건너뛰기)                 │
└──────────────────────────────────────────────┘
```

#### Step 2D: sLM (Self-hosted / Local LLM) 설정

```
┌──────────────────────────────────────────────┐
│  sLM 연결 설정                                │
│                                              │
│  OpenAI 호환 API 엔드포인트를 설정합니다.       │
│                                              │
│  API Endpoint URL (필수):                     │
│  > http://localhost:11434/v1                  │
│                                              │
│  (Enter: 다음, Esc: 이전 단계로)               │
└──────────────────────────────────────────────┘
  ↓
┌──────────────────────────────────────────────┐
│  sLM 인증 설정 (선택사항)                      │
│                                              │
│  API Key (없으면 Enter로 건너뛰기):            │
│  > ___________________________________       │
│                                              │
│  Model 이름 (default: default):              │
│  > llama3.1                                  │
│                                              │
│  (Enter: 저장, Esc: 이전 단계로)               │
└──────────────────────────────────────────────┘
  ↓
┌──────────────────────────────────────────────┐
│  sLM 고급 설정 (선택사항)                      │
│                                              │
│  고급 설정을 하시겠습니까?                      │
│                                              │
│  ○ 아니오, 기본값 사용 (권장)                  │
│  ○ 예, 커스텀 헤더 설정                       │
│                                              │
│  (Enter to select)                           │
└──────────────────────────────────────────────┘
  ↓ (고급 설정 선택 시)
┌──────────────────────────────────────────────┐
│  커스텀 HTTP 헤더 (JSON):                     │
│  > {"X-Custom-Auth": "bearer token123"}      │
│                                              │
│  API Key 헤더 이름 (기본: Authorization):      │
│  > X-API-Key                                 │
│                                              │
│  (Enter: 저장, Esc: 건너뛰기)                 │
└──────────────────────────────────────────────┘
```

---

## 3. 전체 상태 전이 다이어그램

```
AuthState (확장)
══════════════════════════════════════════════════════════════

                    ┌───────────────────┐
                    │  Unauthenticated  │
                    └────────┬──────────┘
                             │
                    /auth login 또는 최초 실행
                             │
                             ▼
                ┌──────────────────────┐
                │ SelectingProvider     │  ◄── Step 1: LLM 서비스 선택
                └──────────┬───────────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
          ▼                ▼                ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
│ Gemini Auth │  │  API Key     │  │ sLM Config       │
│ (2A)        │  │  Input (2B)  │  │ (2D)             │
│             │  │  Claude/     │  │ endpoint+key+    │
│ Google/Key  │  │  OpenAI      │  │ model+headers    │
└──────┬──────┘  └──────┬───────┘  └──────┬───────────┘
       │                │                  │
       ▼                ▼                  ▼
┌──────────────────────────────────────────────┐
│  Unauthenticated                              │
│  → refreshAuth / config 저장                   │
│  → 성공 시 Authenticated                       │
│  → 실패 시 에러 표시 + 재시도                    │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────┐
│  Authenticated   │  ◄── 정상 사용
└──────────────────┘
```

---

## 4. 설정 저장 구조

### 4.1 현재 설정 (settings)

```typescript
// security.auth
{
  selectedType: AuthType | undefined,   // 'oauth-personal', 'gemini-api-key', ...
  enforcedType: AuthType | undefined,
  useExternal: boolean | undefined,
}
```

### 4.2 확장된 설정 구조 (제안)

```typescript
// security.auth (확장)
{
  // --- 기존 필드 (Gemini 하위 호환) ---
  selectedType: AuthType | undefined,
  enforcedType: AuthType | undefined,
  useExternal: boolean | undefined,

  // --- 신규 필드 ---
  /** 선택된 LLM 프로바이더 */
  selectedProvider: ProviderType | undefined,
  // 'gemini' | 'claude' | 'openai' | 'openai-compatible' | 'vertex-ai' | 'didim'

  /** 프로바이더별 인증 방법 */
  providerAuthMethod: string | undefined,
  // 'google-login' | 'api-key'

  /** sLM 연결 설정 */
  slmConfig: {
    baseUrl: string | undefined,
    model: string | undefined,
    apiKeyHeaderName: string | undefined,
    customHeaders: string | undefined,  // JSON string
  } | undefined,

  /** Vertex AI 프로젝트 설정 */
  vertexConfig: {
    project: string | undefined,
    location: string | undefined,
  } | undefined,
}
```

### 4.3 API Key 저장 전략

현재 `gemini-cli-api-key` 키체인에 단일 키만 저장하는 구조를 프로바이더별로
확장:

| 키체인 entry     | 프로바이더              | 환경변수 폴백       |
| ---------------- | ----------------------- | ------------------- |
| `gemini-api-key` | Gemini                  | `GEMINI_API_KEY`    |
| `claude-api-key` | Claude                  | `ANTHROPIC_API_KEY` |
| `openai-api-key` | OpenAI                  | `OPENAI_API_KEY`    |
| `slm-api-key`    | sLM (OpenAI Compatible) | `LLM_API_KEY`       |
| `didim-api-key`  | Didim                   | `DIDIM_API_KEY`     |

**우선순위**: 환경변수 > 키체인 저장값 > 대화형 입력

---

## 5. 프로바이더별 인증 상세

### 5.1 Gemini

| 항목             | 값                                              |
| ---------------- | ----------------------------------------------- |
| ProviderType     | `gemini`                                        |
| 인증 방법        | `Login with Google` / `Use API Key`             |
| OAuth            | 브라우저 기반 Google OAuth 2.0 → 앱 재시작 필요 |
| API Key 환경변수 | `GEMINI_API_KEY`                                |
| API Key 발급 URL | https://aistudio.google.com/app/apikey          |
| 키체인 저장      | `gemini-api-key` (기존 호환)                    |
| 기본 모델        | `gemini-2.5-pro`                                |

### 5.2 Claude (Anthropic)

| 항목             | 값                                          |
| ---------------- | ------------------------------------------- |
| ProviderType     | `claude`                                    |
| 인증 방법        | `Use API Key` (단일)                        |
| API Key 환경변수 | `ANTHROPIC_API_KEY`                         |
| API Key 발급 URL | https://console.anthropic.com/settings/keys |
| 키체인 저장      | `claude-api-key`                            |
| 기본 모델        | `claude-sonnet-4-20250514`                  |

### 5.3 OpenAI

| 항목             | 값                                   |
| ---------------- | ------------------------------------ |
| ProviderType     | `openai`                             |
| 인증 방법        | `Use API Key` (단일)                 |
| API Key 환경변수 | `OPENAI_API_KEY`                     |
| API Key 발급 URL | https://platform.openai.com/api-keys |
| 키체인 저장      | `openai-api-key`                     |
| 기본 모델        | `gpt-4o`                             |

### 5.4 Vertex AI (Google Cloud)

| 항목              | 값                                              |
| ----------------- | ----------------------------------------------- |
| ProviderType      | `gemini` (내부적으로 Gemini + Vertex AI 설정)   |
| 인증 방법         | `Login with Google` / `Use API Key`             |
| 추가 설정         | `project` (GCP 프로젝트 ID), `location` (리전)  |
| API Key 환경변수  | `GOOGLE_API_KEY`                                |
| 프로젝트 환경변수 | `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` |
| 키체인 저장       | 기존 OAuth credential 또는 `google-api-key`     |
| 기본 모델         | `gemini-2.5-pro`                                |

> **참고**: Vertex AI는 내부적으로 Gemini 프로바이더의 `AuthType.USE_VERTEX_AI`
> 모드로 동작하지만, 사용자에게는 독립된 선택지로 표시하여 UX를 명확하게 한다.

### 5.5 sLM (Self-hosted / Local LLM)

| 항목         | 값                                                                        |
| ------------ | ------------------------------------------------------------------------- |
| ProviderType | `openai-compatible`                                                       |
| 인증 방법    | 대화형 (endpoint + optional API Key)                                      |
| 필수 입력    | API Endpoint URL (`LLM_BASE_URL`)                                         |
| 선택 입력    | API Key, Model 이름, Custom Headers, API Key Header Name                  |
| 환경변수     | `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_CUSTOM_HEADERS`, `LLM_API_KEY_HEADER` |
| 키체인 저장  | `slm-api-key`                                                             |
| 기본 모델    | `default` (사용자 입력에 따라)                                            |
| 호환 대상    | Ollama, vLLM, LM Studio, llama.cpp server, text-generation-webui 등       |

#### sLM 연결 예시

| 서비스       | Endpoint URL                       | API Key  | Model                              |
| ------------ | ---------------------------------- | -------- | ---------------------------------- |
| Ollama       | `http://localhost:11434/v1`        | (불필요) | `llama3.1`, `codestral`            |
| vLLM         | `http://localhost:8000/v1`         | (불필요) | `meta-llama/Llama-3.1-8B-Instruct` |
| LM Studio    | `http://localhost:1234/v1`         | (불필요) | `loaded-model`                     |
| llama.cpp    | `http://localhost:8080/v1`         | (불필요) | `default`                          |
| Azure OpenAI | `https://{name}.openai.azure.com/` | (필수)   | `gpt-4o`                           |
| Custom API   | `https://api.example.com/v1`       | (필수)   | `custom-model`                     |

---

## 6. 프로바이더 선택 ↔ 설정 저장 ↔ 런타임 매핑

### 6.1 대화형 설정 → 환경변수/설정 매핑

| Step 1 선택              | settings 저장                                            | 환경변수 자동 설정                        | refreshAuth 동작                 |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------- | -------------------------------- |
| Gemini + Google Login    | `selectedProvider=gemini`, `selectedType=oauth-personal` | —                                         | OAuth 플로우                     |
| Gemini + API Key         | `selectedProvider=gemini`, `selectedType=gemini-api-key` | 키체인→`GEMINI_API_KEY`                   | API key 검증                     |
| Claude + API Key         | `selectedProvider=claude`, `providerAuthMethod=api-key`  | 키체인→`ANTHROPIC_API_KEY`                | `LLM_PROVIDER=claude`            |
| OpenAI + API Key         | `selectedProvider=openai`, `providerAuthMethod=api-key`  | 키체인→`OPENAI_API_KEY`                   | `LLM_PROVIDER=openai`            |
| Vertex AI + Google Login | `selectedProvider=gemini`, `selectedType=vertex-ai`      | —                                         | Vertex OAuth 플로우              |
| Vertex AI + API Key      | `selectedProvider=gemini`, `selectedType=vertex-ai`      | 키체인→`GOOGLE_API_KEY`                   | Vertex API key                   |
| sLM                      | `selectedProvider=openai-compatible`, `slmConfig={...}`  | 키체인→`LLM_API_KEY`, `LLM_BASE_URL` 설정 | `LLM_PROVIDER=openai-compatible` |

### 6.2 런타임 프로바이더 결정 흐름

```
앱 시작
  ↓
settings.security.auth.selectedProvider 확인
  ↓
┌── gemini → 기존 Gemini 인증 플로우 (selectedType 기반)
├── claude → process.env['ANTHROPIC_API_KEY'] 설정 + LLM_PROVIDER=claude
├── openai → process.env['OPENAI_API_KEY'] 설정 + LLM_PROVIDER=openai
├── openai-compatible → slmConfig에서 LLM_BASE_URL + LLM_API_KEY 설정
└── undefined → 최초 실행 → /auth login 대화상자 표시
  ↓
selectProvider() → providerSelector.ts의 기존 로직 활용
  ↓
ProviderFactory.create(providerType, config)
```

---

## 7. UI 컴포넌트 설계

### 7.1 새로운/수정 컴포넌트 목록

| 컴포넌트               | 파일                               | 역할                                          | 신규/수정 |
| ---------------------- | ---------------------------------- | --------------------------------------------- | --------- |
| `ProviderSelectDialog` | `ui/auth/ProviderSelectDialog.tsx` | Step 1: LLM 서비스 선택                       | **신규**  |
| `ProviderAuthDialog`   | `ui/auth/ProviderAuthDialog.tsx`   | Step 2: 프로바이더별 인증 설정 라우터         | **신규**  |
| `SlmConfigDialog`      | `ui/auth/SlmConfigDialog.tsx`      | Step 2D: sLM 연결 설정 대화형 입력            | **신규**  |
| `VertexConfigDialog`   | `ui/auth/VertexConfigDialog.tsx`   | Step 2C: Vertex AI 프로젝트 설정              | **신규**  |
| `AuthDialog`           | `ui/auth/AuthDialog.tsx`           | 기존 Gemini 인증 방법 선택 (Step 2A로 재활용) | **수정**  |
| `ApiAuthDialog`        | `ui/auth/ApiAuthDialog.tsx`        | API Key 입력 (프로바이더별 메시지 분기)       | **수정**  |

### 7.2 AuthState enum 확장

```typescript
// packages/cli/src/ui/types.ts
export enum AuthState {
  // --- 기존 ---
  Unauthenticated = 'unauthenticated',
  Updating = 'updating',
  AwaitingApiKeyInput = 'awaiting_api_key_input',
  Authenticated = 'authenticated',
  AwaitingGoogleLoginRestart = 'awaiting_google_login_restart',

  // --- 신규 ---
  /** Step 1: LLM 프로바이더 선택 중 */
  SelectingProvider = 'selecting_provider',
  /** Step 2D: sLM 연결 설정 중 */
  ConfiguringSlm = 'configuring_slm',
  /** Step 2C: Vertex AI 프로젝트 설정 중 */
  ConfiguringVertex = 'configuring_vertex',
}
```

### 7.3 AppContainer 렌더링 분기 (확장)

```typescript
// AppContainer.tsx — 렌더링 분기 (개념)
switch (authState) {
  case AuthState.SelectingProvider:
    return <ProviderSelectDialog onSelect={handleProviderSelect} />;

  case AuthState.Updating:
    // 기존: Gemini AuthDialog (Step 2A)
    // 또는 Claude/OpenAI의 경우 바로 API Key 입력으로 전환
    return <ProviderAuthDialog provider={selectedProvider} />;

  case AuthState.AwaitingApiKeyInput:
    return <ApiAuthDialog provider={selectedProvider} />;

  case AuthState.ConfiguringSlm:
    return <SlmConfigDialog />;

  case AuthState.ConfiguringVertex:
    return <VertexConfigDialog />;

  case AuthState.AwaitingGoogleLoginRestart:
    return <LoginWithGoogleRestartDialog />;

  case AuthState.Unauthenticated:
    return <AuthInProgress />;

  case AuthState.Authenticated:
    return <App />;
}
```

---

## 8. 사용자 시나리오별 플로우

### 8.1 시나리오: 최초 실행 (아무 설정 없음)

```
$ didim
  ↓
설정 로드 → selectedProvider=undefined, selectedType=undefined
  ↓
AuthState → SelectingProvider (Step 1)
  ↓
┌─────────────────────────────────────────────┐
│  ? Didim CLI 시작                            │
│                                             │
│  사용할 LLM 서비스를 선택하세요:              │
│                                             │
│  ● Gemini        Google AI                  │
│  ○ Claude        Anthropic                  │
│  ○ OpenAI        OpenAI                     │
│  ○ Vertex AI     Google Cloud               │
│  ○ sLM           Self-hosted / Local LLM    │
│                                             │
│  (Use ↑↓ to navigate, Enter to select)      │
└─────────────────────────────────────────────┘
```

### 8.2 시나리오: Gemini 선택 → API Key

```
Step 1에서 "Gemini" 선택
  ↓
AuthState → Updating (Step 2A — Gemini AuthDialog)
  ↓
┌──────────────────────────────────────────────┐
│  ? Gemini 인증                                │
│                                              │
│  인증 방법을 선택하세요:                        │
│                                              │
│  ○ Login with Google                         │
│  ● Use API Key                               │
│                                              │
│  (Esc: 이전 단계로)                           │
└──────────────────────────────────────────────┘
  ↓
"Use API Key" 선택
  ↓
AuthState → AwaitingApiKeyInput
  ↓
┌──────────────────────────────────────────────┐
│  Gemini API Key:                              │
│  > _                                         │
│                                              │
│  https://aistudio.google.com/app/apikey       │
│  에서 API Key를 발급받을 수 있습니다.           │
│                                              │
│  (Enter: 저장, Esc: 이전 단계로)               │
└──────────────────────────────────────────────┘
  ↓
키 입력 + Enter
  ↓
키체인에 저장 → settings 업데이트 → refreshAuth → Authenticated
```

### 8.3 시나리오: Claude 선택

```
Step 1에서 "Claude" 선택
  ↓
settings.security.auth.selectedProvider = 'claude'
  ↓
AuthState → AwaitingApiKeyInput (Claude용)
  ↓
┌──────────────────────────────────────────────┐
│  Anthropic API Key:                           │
│  > _                                         │
│                                              │
│  https://console.anthropic.com/settings/keys  │
│  에서 API Key를 발급받을 수 있습니다.           │
│                                              │
│  (Enter: 저장, Esc: 이전 단계로)               │
└──────────────────────────────────────────────┘
  ↓
키 입력 + Enter
  ↓
키체인에 'claude-api-key' 저장
  → process.env['ANTHROPIC_API_KEY'] 설정
  → process.env['LLM_PROVIDER'] = 'claude'
  → refreshAuth → Authenticated
```

### 8.4 시나리오: sLM 선택 (Ollama 예시)

```
Step 1에서 "sLM" 선택
  ↓
AuthState → ConfiguringSlm (Step 2D)
  ↓
┌──────────────────────────────────────────────┐
│  sLM 연결 설정                                │
│                                              │
│  API Endpoint URL:                           │
│  > http://localhost:11434/v1                  │
│                                              │
│  (Enter: 다음)                               │
│  (Esc: 이전 단계로)                           │
└──────────────────────────────────────────────┘
  ↓
Enter
  ↓
┌──────────────────────────────────────────────┐
│  sLM 인증 설정                                │
│                                              │
│  API Key (선택, 없으면 Enter):                │
│  > _                                         │
│                                              │
│  Model 이름 (default: default):              │
│  > llama3.1                                  │
│                                              │
│  (Enter: 저장)                               │
│  (Esc: 이전 단계로)                           │
└──────────────────────────────────────────────┘
  ↓
Enter
  ↓
settings 저장:
  selectedProvider = 'openai-compatible'
  slmConfig.baseUrl = 'http://localhost:11434/v1'
  slmConfig.model = 'llama3.1'
  ↓
process.env['LLM_BASE_URL'] = 'http://localhost:11434/v1'
process.env['LLM_PROVIDER'] = 'openai-compatible'
process.env['LLM_MODEL'] = 'llama3.1'
  ↓
refreshAuth → Authenticated
```

### 8.5 시나리오: 환경변수가 이미 설정된 경우

```
$ export ANTHROPIC_API_KEY=sk-ant-xxx
$ didim
  ↓
settings.selectedProvider=undefined, 환경변수 ANTHROPIC_API_KEY 감지
  ↓
옵션 A: 자동 프로바이더 결정
  → providerSelector가 ANTHROPIC_API_KEY 감지 → Claude 자동 선택
  → AuthState → Authenticated (대화상자 건너뛰기)

옵션 B: 확인 프롬프트 (권장)
  → "ANTHROPIC_API_KEY가 감지되었습니다. Claude로 시작하시겠습니까? (Y/n)"
  → Y → Authenticated
  → n → Step 1 (프로바이더 선택)
```

### 8.6 시나리오: `/auth login`으로 프로바이더 변경

```
이미 Gemini로 인증된 상태에서 /auth login 입력
  ↓
AuthState → SelectingProvider (Step 1)
  ↓
현재 선택된 프로바이더(Gemini)에 체크 표시
  ↓
다른 프로바이더(예: Claude) 선택 → Step 2B → 인증 완료
  ↓
기존 Gemini 설정은 유지 (나중에 다시 전환 가능)
새 프로바이더 설정이 활성화됨
```

---

## 9. 하위 호환성

### 9.1 기존 사용자 마이그레이션

| 기존 상태                                                     | 동작                                              |
| ------------------------------------------------------------- | ------------------------------------------------- |
| `selectedType=gemini-api-key` (기존 Gemini 사용자)            | `selectedProvider=gemini`로 자동 매핑 → 정상 동작 |
| `selectedType=oauth-personal` (기존 Google 로그인 사용자)     | `selectedProvider=gemini`로 자동 매핑 → 정상 동작 |
| `selectedType=vertex-ai` (기존 Vertex 사용자)                 | `selectedProvider=gemini`로 자동 매핑 → 정상 동작 |
| `selectedType=undefined` + `GEMINI_API_KEY` 환경변수          | 기존과 동일 → API Key 자동 감지                   |
| `LLM_PROVIDER=claude` + `ANTHROPIC_API_KEY` (환경변수 사용자) | 기존과 동일 → 환경변수 우선                       |

### 9.2 마이그레이션 로직 (의사 코드)

```typescript
function migrateAuthSettings(settings: AuthSettings): void {
  // 기존 selectedType이 있고 selectedProvider가 없으면 자동 매핑
  if (settings.selectedType && !settings.selectedProvider) {
    if (settings.selectedType === AuthType.USE_VERTEX_AI) {
      // Vertex AI는 별도 프로바이더처럼 보이지만 내부는 Gemini
      settings.selectedProvider = ProviderType.Gemini;
    } else {
      // 다른 AuthType은 모두 Gemini
      settings.selectedProvider = ProviderType.Gemini;
    }
  }
}
```

### 9.3 환경변수 우선순위 (변경 없음)

```
LLM_PROVIDER 환경변수 > settings.selectedProvider > 자동 감지
```

기존 환경변수 기반 사용자(`LLM_PROVIDER=claude ANTHROPIC_API_KEY=xxx didim`)는
설정 변경 없이 그대로 동작한다.

---

## 10. 수정 대상 파일 요약

### 10.1 신규 파일

| #   | 파일                                                | 설명                                  |
| --- | --------------------------------------------------- | ------------------------------------- |
| 1   | `packages/cli/src/ui/auth/ProviderSelectDialog.tsx` | Step 1: LLM 프로바이더 선택 UI        |
| 2   | `packages/cli/src/ui/auth/ProviderAuthDialog.tsx`   | Step 2 라우터 (프로바이더별 분기)     |
| 3   | `packages/cli/src/ui/auth/SlmConfigDialog.tsx`      | Step 2D: sLM 연결 설정 대화형 입력    |
| 4   | `packages/cli/src/ui/auth/VertexConfigDialog.tsx`   | Step 2C: Vertex AI 프로젝트/위치 설정 |

### 10.2 수정 파일

| #   | 파일                                                | 수정 내용                                                                        |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | `packages/cli/src/ui/types.ts`                      | AuthState enum 확장 (`SelectingProvider`, `ConfiguringSlm`, `ConfiguringVertex`) |
| 2   | `packages/cli/src/ui/auth/AuthDialog.tsx`           | Gemini 전용으로 스코프 축소 + Esc로 Step 1 복귀                                  |
| 3   | `packages/cli/src/ui/auth/ApiAuthDialog.tsx`        | 프로바이더별 레이블/URL/placeholder 분기                                         |
| 4   | `packages/cli/src/ui/auth/useAuth.ts`               | `selectedProvider` 기반 상태 전이 로직 추가                                      |
| 5   | `packages/cli/src/ui/AppContainer.tsx`              | 새 AuthState에 대한 렌더링 분기 추가                                             |
| 6   | `packages/cli/src/config/settingsSchema.ts`         | `selectedProvider`, `slmConfig`, `vertexConfig` 설정 스키마 추가                 |
| 7   | `packages/cli/src/config/auth.ts`                   | 프로바이더별 인증 검증 로직 확장                                                 |
| 8   | `packages/cli/src/core/auth.ts`                     | `performInitialAuth` — 프로바이더별 초기화 분기                                  |
| 9   | `packages/cli/src/core/initializer.ts`              | `selectedProvider` 기반 초기화 흐름                                              |
| 10  | `packages/core/src/core/apiKeyCredentialStorage.ts` | 프로바이더별 키체인 entry 지원                                                   |
| 11  | `packages/cli/src/ui/commands/authCommand.ts`       | `/auth login` → Step 1부터 시작하도록 변경                                       |

### 10.3 영향 없음 (기존 유지)

| 파일                                              | 이유                                      |
| ------------------------------------------------- | ----------------------------------------- |
| `packages/core/src/providers/providerTypes.ts`    | ProviderType enum 변경 불필요 (이미 충분) |
| `packages/core/src/providers/providerSelector.ts` | 환경변수 기반 로직 그대로 활용            |
| `packages/core/src/providers/*/bootstrap.ts`      | 프로바이더 부트스트랩은 그대로            |
| `packages/core/src/core/contentGenerator.ts`      | 멀티 프로바이더 로직 기존 활용            |

---

## 11. 구현 우선순위

### Phase 1: 프로바이더 선택 + API Key 인증 (MVP)

```
범위: Gemini, Claude, OpenAI의 API Key 인증
수정: 8개 파일 (신규 2 + 수정 6)
난이도: ★★★☆☆
```

1. `AuthState` 확장 (`SelectingProvider`)
2. `ProviderSelectDialog.tsx` 신규 (Step 1)
3. `ApiAuthDialog.tsx` 수정 (프로바이더별 분기)
4. `useAuth.ts` 수정 (프로바이더 선택 상태 전이)
5. `AppContainer.tsx` 수정 (렌더링 분기)
6. `settingsSchema.ts` 수정 (`selectedProvider` 추가)
7. `apiKeyCredentialStorage.ts` 수정 (프로바이더별 entry)
8. `auth.ts` + `initializer.ts` 수정 (프로바이더별 초기화)

### Phase 2: sLM 대화형 설정

```
범위: sLM (OpenAI-compatible) 연결 설정 대화형 UI
수정: 3개 파일 (신규 1 + 수정 2)
난이도: ★★★☆☆
```

1. `SlmConfigDialog.tsx` 신규 (Step 2D)
2. `AuthState` — `ConfiguringSlm` 추가
3. `useAuth.ts` — sLM 설정 플로우

### Phase 3: Vertex AI + Google Login

```
범위: Vertex AI 프로젝트 설정 + Google OAuth 연동
수정: 2개 파일 (신규 1 + 수정 1)
난이도: ★★☆☆☆
```

1. `VertexConfigDialog.tsx` 신규 (Step 2C)
2. `AuthState` — `ConfiguringVertex` 추가

### Phase 4: 하위 호환 + 마이그레이션

```
범위: 기존 사용자 설정 자동 마이그레이션
수정: 2개 파일
난이도: ★★☆☆☆
```

1. `initializer.ts` — 마이그레이션 로직
2. `useAuth.ts` — 환경변수 자동 감지 + 확인 프롬프트

---

## 12. 개방형 논의 사항

### 12.1 프로바이더 전환 시 기존 대화 처리

프로바이더를 변경하면 현재 대화 히스토리가 새 모델과 호환되지 않을 수 있다.

**선택지**:

- A) 새 세션 강제 시작 (안전)
- B) 히스토리 유지하되 경고 표시 (유연)
- C) 앱 재시작 (현재 Google Login과 동일)

### 12.2 다중 프로바이더 동시 설정 보존

사용자가 Gemini → Claude → OpenAI를 번갈아 사용할 때, 각 프로바이더의 API Key를
모두 키체인에 보존할 것인가?

**권장**: 보존. 프로바이더별 별도 entry로 관리하여 전환 시 재입력 불필요.

### 12.3 `/auth status` 명령 추가 여부

현재 인증 상태를 확인하는 명령:

```
$ /auth status
Provider: Claude (Anthropic)
Auth: API Key (●●●●●●sk-ant-xxx...yz)
Model: claude-sonnet-4-20250514
Status: ✓ Authenticated
```

### 12.4 프로바이더 선택 시 "Didim" 프로바이더 표시 여부

`ProviderType.Didim`은 내부용. 일반 사용자에게 노출할지 결정 필요.

**권장**: 숨김. `DIDIM_API_KEY` 환경변수 설정 시에만 자동 활성화.

---

## 13. 참고 — 현재 코드 핵심 위치

| 코드                | 파일                                                       | 라인      |
| ------------------- | ---------------------------------------------------------- | --------- |
| AuthType enum       | `packages/core/src/providers/providerTypes.ts`             | 40-51     |
| ProviderType enum   | `packages/core/src/providers/providerTypes.ts`             | 13-24     |
| AuthState enum      | `packages/cli/src/ui/types.ts`                             | 24-35     |
| AuthDialog (현재)   | `packages/cli/src/ui/auth/AuthDialog.tsx`                  | 37-257    |
| useAuthCommand hook | `packages/cli/src/ui/auth/useAuth.ts`                      | 37-153    |
| ApiAuthDialog       | `packages/cli/src/ui/auth/ApiAuthDialog.tsx`               | 전체      |
| `/auth` 명령 정의   | `packages/cli/src/ui/commands/authCommand.ts`              | 16-56     |
| 프로바이더 환경변수 | `packages/core/src/providers/providerConfigIntegration.ts` | 237-271   |
| 프로바이더 선택     | `packages/core/src/providers/providerSelector.ts`          | 96-143    |
| API Key 키체인 저장 | `packages/core/src/core/apiKeyCredentialStorage.ts`        | 전체      |
| 앱 초기화           | `packages/cli/src/core/initializer.ts`                     | 35-67     |
| 인증 상태 렌더링    | `packages/cli/src/ui/AppContainer.tsx`                     | 567-638   |
| 설정 스키마         | `packages/cli/src/config/settingsSchema.ts`                | 1323-1361 |
