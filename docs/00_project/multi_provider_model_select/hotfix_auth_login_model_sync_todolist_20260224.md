# Hotfix: `/auth login` 후 모델 미적용 문제 수정

> **목적**: `/auth login`으로 프로바이더 전환 시 모델이 즉시 적용되지 않아
> `/model`을 추가 실행해야 하는 문제 해결 **영향 범위**: Claude, OpenAI,
> OpenAI-compatible(sLM/Ollama) 전 프로바이더 공통 **작업 방법론**: TDD (Red →
> Green → Refactor) **작업 브랜치**: `DID/v0.2`

---

## 1. 문제 분석

### 1.1 증상

| 시나리오                                          | 기대 동작                         | 실제 동작                           |
| ------------------------------------------------- | --------------------------------- | ----------------------------------- |
| `/auth login` → sLM 선택 → Ollama `qwen3:8b` 설정 | 즉시 `qwen3:8b`로 대화 가능       | 모델 미적용, `/model`로 재설정 필요 |
| `/auth login` → Claude 선택 → API Key 입력        | 즉시 Claude 기본 모델로 대화 가능 | 모델 미적용, `/model`로 재설정 필요 |
| `/auth login` → OpenAI 선택 → API Key 입력        | 즉시 OpenAI 기본 모델로 대화 가능 | 모델 미적용, `/model`로 재설정 필요 |

### 1.2 근본 원인 분석

**핵심 경로 비교**:

```
[/model 명령] (정상 동작)
  ModelDialog.handleSelect()
    → config.setModel(model, isTemporary=false)   ← 영구 저장
      → onModelChange() 콜백 호출
        → saveModelForProvider()                   ← model.byProvider[provider] 저장
      → CoreEvent.ModelChanged 이벤트 발행
    → process.env['LLM_MODEL'] = model             ← 환경변수 동기화
    → settings.setValue('slmConfig.model', model)   ← sLM 설정 동기화

[/auth login 명령] (문제 경로)
  handleSlmConfigComplete() / handleApiKeySubmit()
    → process.env['LLM_MODEL'] = model             ← 환경변수 설정
    → config.refreshAuth()
      → createContentGenerator()
        → resolveProviderModel()                    ← 모델 해석
        → config.setModel(model, isTemporary=true)  ← 임시 저장만!
          → CoreEvent.ModelChanged 이벤트 발행      ← OK
          → onModelChange() 호출 안 됨!             ← ❌ 영구 저장 누락
    → saveModelForProvider() 호출 없음              ← ❌ model.byProvider 누락
```

**3가지 핵심 결함**:

| #   | 결함                                                                        | 위치                                                                 | 영향                                                                                                         |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | `saveModelForProvider()` 미호출                                             | `AppContainer.tsx` — `handleSlmConfigComplete`, `handleApiKeySubmit` | 모델이 `model.byProvider[provider]`에 저장되지 않음 → 세션 내/재시작 시 모델 해석 실패                       |
| 2   | `resolveProviderModel()` — non-Gemini→non-Gemini 전환 시 `LLM_MODEL` 미참조 | `providerSelector.ts:284-289`                                        | 이전 프로바이더 모델(예: `claude-sonnet-4-6`)이 freeformInput 프로바이더(sLM)에 그대로 통과                  |
| 3   | `handleApiKeySubmit`에서 Claude/OpenAI 기본 모델 미설정                     | `AppContainer.tsx:634-671`                                           | `LLM_MODEL` env 삭제 후 기본 모델 명시 설정 없음 → provider default에 의존하지만 `model.byProvider`에 미저장 |

### 1.3 영향 받는 파일

| 파일                                                   | 역할                      | 변경 필요                                                          |
| ------------------------------------------------------ | ------------------------- | ------------------------------------------------------------------ |
| `packages/cli/src/ui/AppContainer.tsx`                 | `/auth login` 완료 핸들러 | `handleSlmConfigComplete`, `handleApiKeySubmit`에 모델 동기화 추가 |
| `packages/core/src/providers/providerSelector.ts`      | 모델 해석                 | `resolveProviderModel()` non-Gemini 분기 `LLM_MODEL` 참조 추가     |
| `packages/core/src/providers/providerSelector.test.ts` | 테스트                    | 신규 테스트 추가                                                   |
| `packages/cli/src/ui/AppContainer.test.tsx` (선택)     | 테스트                    | 통합 테스트 추가                                                   |

---

## 2. 사전 작업 (Pre-Work)

- [ ] **[CONTEXT]** 관련 코드 흐름 최종 확인
  - `handleSlmConfigComplete` (AppContainer.tsx:696-760)
  - `handleApiKeySubmit` (AppContainer.tsx:602-689)
  - `refreshAuth` (config.ts:887-936)
  - `createContentGenerator` (contentGenerator.ts:243-335)
  - `resolveProviderModel` (providerSelector.ts:260-290)
  - `setModel` (config.ts:1060-1071)
  - `saveModelForProvider` (settings.ts:888-914)

- [ ] **[BASELINE]** 기존 테스트 베이스라인 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/providers/providerSelector
  npm test -w @didim365/agent-cli
  ```

---

## 3. 본작업 — TDD

### 3.1 결함 #2 수정: `resolveProviderModel` non-Gemini 분기 강화

> `resolveProviderModel()`에서 현재 모델이 non-Gemini일 때 `LLM_MODEL`
> 환경변수를 확인하지 않는 문제. 프로바이더 전환 시(예: Claude → sLM) 이전
> 프로바이더 모델이 freeformInput 프로바이더에 그대로 통과되는 버그.

#### 3.1.1 테스트 작성 (Red)

**파일**: `packages/core/src/providers/providerSelector.test.ts`

```typescript
describe('resolveProviderModel — cross-provider switch with LLM_MODEL', () => {
  it('should prefer LLM_MODEL over stale non-Gemini model when switching providers', () => {
    // 시나리오: Claude 모델이 설정된 상태에서 sLM(openai-compatible)으로 전환
    // 현재 모델: 'claude-sonnet-4-6' (Claude 모델)
    // LLM_MODEL: 'qwen3:8b' (사용자가 /auth login에서 설정)
    // 기대: 'qwen3:8b' 반환 (LLM_MODEL 우선)
    vi.stubEnv('LLM_MODEL', 'qwen3:8b');
    const result = resolveProviderModel(
      'claude-sonnet-4-6',
      'openai-compatible',
    );
    expect(result).toBe('qwen3:8b');
  });

  it('should prefer LLM_MODEL over stale non-Gemini model for Claude provider', () => {
    // 시나리오: OpenAI 모델이 설정된 상태에서 Claude로 전환
    vi.stubEnv('LLM_MODEL', 'claude-sonnet-4-6');
    const result = resolveProviderModel('gpt-4o', 'claude');
    expect(result).toBe('claude-sonnet-4-6');
  });

  it('should use current model if LLM_MODEL is not set and model is valid', () => {
    // LLM_MODEL 미설정, 현재 모델이 대상 프로바이더에 유효
    delete process.env['LLM_MODEL'];
    const result = resolveProviderModel('qwen3:8b', 'openai-compatible');
    expect(result).toBe('qwen3:8b');
  });

  it('should fallback to provider default when LLM_MODEL is invalid for target', () => {
    // LLM_MODEL이 대상 프로바이더에 유효하지 않은 경우
    vi.stubEnv('LLM_MODEL', 'gemini-2.5-flash');
    const result = resolveProviderModel('old-model', 'claude');
    // gemini-2.5-flash는 Claude에 유효하지 않음 → Claude 기본 모델
    expect(result).toBe(getDefaultModelFromRegistry('claude'));
  });
});
```

#### 3.1.2 구현 (Green)

**파일**: `packages/core/src/providers/providerSelector.ts`

**변경 전** (line 284-289):

```typescript
// Non-Gemini model: validate against target provider
if (!isModelValidForProvider(model, provider)) {
  return getDefaultModelFromRegistry(provider);
}
return model;
```

**변경 후**:

```typescript
// Non-Gemini model: check LLM_MODEL env for cross-provider switch
const llmModelEnv = process.env['LLM_MODEL'];
if (llmModelEnv && llmModelEnv !== model) {
  // LLM_MODEL이 설정되어 있고 현재 모델과 다르면 → 프로바이더 전환 상황
  if (isModelValidForProvider(llmModelEnv, provider)) {
    return llmModelEnv;
  }
}

// Current model: validate against target provider
if (!isModelValidForProvider(model, provider)) {
  return getDefaultModelFromRegistry(provider);
}
return model;
```

**변경 포인트**:

- non-Gemini 모델 분기에서도 `LLM_MODEL` 환경변수 확인
- `LLM_MODEL`이 현재 모델과 다르고, 대상 프로바이더에 유효하면 우선 사용
- 기존 동작 호환: `LLM_MODEL` 미설정 시 기존 로직 그대로

---

### 3.2 결함 #1, #3 수정: `/auth login` 후 모델 영구 저장

> `/auth login` 완료 후 `saveModelForProvider()`가 호출되지 않아
> `model.byProvider[provider]`에 모델이 저장되지 않는 문제.
> `handleSlmConfigComplete`와 `handleApiKeySubmit` 모두 해당.

#### 3.2.1 `handleSlmConfigComplete` 수정

**파일**: `packages/cli/src/ui/AppContainer.tsx`

**변경 위치**: `handleSlmConfigComplete` 함수 내 `refreshAuth` 이후

**변경 전** (line ~755):

```typescript
// Refresh auth in core
await config.refreshAuth(AuthType.USE_GEMINI);
setAuthState(AuthState.Authenticated);
```

**변경 후**:

```typescript
// Refresh auth in core — creates new ContentGenerator for the provider
await config.refreshAuth(AuthType.USE_GEMINI);

// Sync model: refreshAuth 내부에서 resolveProviderModel → setModel(temp)이
// 호출되지만 isTemporary=true이므로 byProvider에 저장되지 않음.
// 명시적으로 setModel(false)을 호출하여 영구 저장 + UI 동기화.
if (slmConfig.model) {
  config.setModel(slmConfig.model, false);
}

setAuthState(AuthState.Authenticated);
```

#### 3.2.2 `handleApiKeySubmit` 수정

**파일**: `packages/cli/src/ui/AppContainer.tsx`

**변경 위치**: `handleApiKeySubmit` 함수 내 non-Gemini 경로, `refreshAuth` 이후

**변경 전** (line ~670):

```typescript
await config.refreshAuth(AuthType.USE_GEMINI);
}

setAuthState(AuthState.Authenticated);
```

**변경 후**:

```typescript
await config.refreshAuth(AuthType.USE_GEMINI);

// Sync model: refreshAuth 후 resolvedModel을 영구 저장
// config.getModel()은 refreshAuth 내부에서 resolveProviderModel로 설정된 값
const resolvedModel = config.getModel();
if (resolvedModel && resolvedModel !== 'default') {
  config.setModel(resolvedModel, false);
}
}

setAuthState(AuthState.Authenticated);
```

**변경 포인트**:

- `refreshAuth()` 이후 `config.getModel()`로 해석된 모델명 확인
- `config.setModel(model, false)` 호출 → `onModelChange` →
  `saveModelForProvider()`
- `model.byProvider[provider]`에 영구 저장
- `CoreEvent.ModelChanged` 재발행 → UI 갱신 보장
- `'default'` 제외: `openai-compatible` freeformInput의 fallback 값은 저장
  불필요

---

## 4. 검증

### 4.1 단위 테스트

```bash
# resolveProviderModel 테스트
npm test -w @didim365/agent-cli-core -- src/providers/providerSelector

# 전체 core 회귀
npm test -w @didim365/agent-cli-core

# CLI 테스트
npm test -w @didim365/agent-cli
```

### 4.2 수동 검증 시나리오

| #   | 시나리오                                             | 검증 항목                                |
| --- | ---------------------------------------------------- | ---------------------------------------- |
| 1   | Gemini → sLM(Ollama qwen3:8b) 전환 via `/auth login` | 모델명 `qwen3:8b` 표시 + 즉시 대화 가능  |
| 2   | Gemini → Claude 전환 via `/auth login`               | Claude 기본 모델 표시 + 즉시 대화 가능   |
| 3   | Gemini → OpenAI 전환 via `/auth login`               | OpenAI 기본 모델 표시 + 즉시 대화 가능   |
| 4   | Claude → sLM(Ollama) 전환 via `/auth login`          | `qwen3:8b` 표시 (cross-provider #2 검증) |
| 5   | 전환 후 CLI 재시작                                   | 저장된 모델로 자동 복원                  |
| 6   | 전환 후 `/model` 실행                                | 현재 모델이 올바르게 선택된 상태         |

### 4.3 빌드 + 타입체크

```bash
npm run build
npm run typecheck
npm run lint
```

---

## 5. 완료 조건

| 검증 항목                                                                | 상태 |
| ------------------------------------------------------------------------ | ---- |
| `resolveProviderModel` non-Gemini 분기 `LLM_MODEL` 참조 — TDD 4개 테스트 | ⬜   |
| `handleSlmConfigComplete` 모델 영구 저장 — `setModel(model, false)` 추가 | ⬜   |
| `handleApiKeySubmit` (Claude/OpenAI) 모델 영구 저장 추가                 | ⬜   |
| sLM(Ollama) `/auth login` 후 즉시 사용 가능 — 수동 검증                  | ⬜   |
| Claude/OpenAI `/auth login` 후 즉시 사용 가능 — 수동 검증                | ⬜   |
| Cross-provider 전환 시 모델 정확 해석 (Claude→sLM 등)                    | ⬜   |
| 기존 providerSelector 테스트 회귀 없음                                   | ⬜   |
| Core + CLI 전체 테스트 PASS                                              | ⬜   |
| 빌드 + 타입체크 + 린트 PASS                                              | ⬜   |
| 커밋 완료 + 작업 결과서 작성                                             | ⬜   |

---

## 6. 커밋 전략

1. **커밋 1** (Core):
   `fix(providers): resolveProviderModel — non-Gemini 분기 LLM_MODEL 참조 추가`
   - `providerSelector.ts`, `providerSelector.test.ts`

2. **커밋 2** (CLI):
   `fix(cli): /auth login 후 모델 즉시 적용 — saveModelForProvider 동기화`
   - `AppContainer.tsx`

---

## 7. 작업 결과서

> 작업 완료 시 작성

**파일**: `working_history/hotfix_auth_login_model_sync_20260224.md`
