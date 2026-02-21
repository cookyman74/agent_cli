# Hotfix: /auth login 후 모델 자동 전환

> **작업일**: 2026-02-21 **브랜치**: `v0.2.0/se_manager_agent` **버전**: 0.2.14
> **범위**: CLI `/auth login` 프로바이더 전환 시 모델 자동 갱신

---

## 1. 문제 정의

### 1.1 증상

Claude 프로바이더 사용 중 `/auth login` → Gemini 선택 → API key 로그인 완료 후,
UI(상태바, `/about`)에 여전히 Claude 모델(`claude-opus-4-6`)이 표시됨. `/model`
명령어로 수동 재설정하면 정상 전환됨.

### 1.2 근본 원인

`handleApiKeySubmit()` (AppContainer.tsx:602)이 provider를 전환하고
`config.refreshAuth()`를 호출하지만, **`config.setModel()`을 호출하지 않음**.

```
현재 흐름:
handleApiKeySubmit()
  → settings.selectedProvider = 'gemini'     ✅ provider 전환
  → config.refreshAuth()                     ✅ ContentGenerator 재생성
  → config.model = ???                       ❌ 여전히 이전 모델
```

`config.model`은 Config 생성자에서 한 번 설정된 후, 명시적 `setModel()` 호출
없이는 갱신되지 않음. `resolveProviderModel()`이 메시지 전송 시 런타임
교정하지만, 이는 UI에 반영되지 않음.

### 1.3 영향 범위

| 항목                         | 영향                                          |
| ---------------------------- | --------------------------------------------- |
| 실제 API 호출                | 정상 (`resolveProviderModel()`이 런타임 교정) |
| UI 모델 표시 (상태바)        | **불일치** — 이전 프로바이더 모델 표시        |
| `/about` Provider/Model 필드 | **불일치**                                    |
| `/model` 다이얼로그          | 정상 — 새 프로바이더 모델 목록 표시           |
| `model.byProvider` 저장      | 영향 없음 — `/model`에서 persist 시만 저장    |

---

## 2. 설계 방향

### 2.1 핵심 원칙

1. **기존 `resolveProviderModel()` 재사용**: 이미 검증된 모델 유효성 검사 +
   fallback 로직 활용
2. **`model.byProvider` 우선**: 이전에 해당 프로바이더에서 사용한 모델이 있으면
   복원
3. **최소 변경**: `handleApiKeySubmit()` 흐름에 모델 전환 로직 추가만으로 해결
4. **UI 자동 갱신**: `config.setModel()` → `coreEvents.emitModelChanged` → React
   state 갱신

### 2.2 모델 해석 우선순위 (기존 startup 로직과 동일)

```
1. LLM_MODEL 환경변수 (sLM 등 명시적 지정 시)
2. model.byProvider[newProvider] (이전에 해당 프로바이더에서 저장한 모델)
3. resolveProviderModel(currentModel, newProvider) (현재 모델이 새 프로바이더에 유효하면 유지)
4. getDefaultModelFromRegistry(newProvider) (위 모두 실패 시 프로바이더 기본 모델)
```

### 2.3 `setModel()` 호출 전략

| 상황                 | isTemporary | 이유                                            |
| -------------------- | ----------- | ----------------------------------------------- |
| `byProvider` 복원    | `true`      | 이미 저장된 값이므로 재저장 불필요              |
| 기본 모델 fallback   | `true`      | 사용자가 `/model`로 명시적 선택하기 전까지 임시 |
| sLM(`LLM_MODEL` env) | `true`      | env가 이미 설정되어 있으므로 persist 불필요     |

→ auth 전환에서의 모델 갱신은 항상 **임시(isTemporary=true)** — 사용자가
`/model`에서 persist 모드로 선택할 때만 `byProvider`에 저장.

---

## 3. 단계별 작업 계획

### 3.1 사전 작업 — 코드 분석 ✅

- [x] `handleApiKeySubmit()` 흐름 분석 (AppContainer.tsx:602-689)
- [x] `config.setModel()` + `coreEvents.emitModelChanged` 전파 경로 확인
- [x] `resolveProviderModel()` 모델 유효성 검사 로직 확인
- [x] `model.byProvider` 저장/조회 구조 확인
- [x] `handleSlmConfigComplete` / `handleVertexConfigComplete` 패턴 확인
- [x] UI state 갱신 경로 확인: `coreEvents.emitModelChanged` → `setCurrentModel`
- [x] 기존 테스트 패턴 파악

### 3.2 본작업 — 구현

#### Step 1: 모델 자동 전환 헬퍼 함수 작성

**파일**: `packages/cli/src/ui/utils/resolveModelForProvider.ts` (신규)

```typescript
/**
 * Resolve the appropriate model when switching to a new provider.
 *
 * Priority:
 * 1. LLM_MODEL env var (explicit override)
 * 2. model.byProvider[provider] (previously saved for this provider)
 * 3. resolveProviderModel(currentModel, provider) (validate current model)
 * 4. getDefaultModelFromRegistry(provider) (provider default)
 */
export function resolveModelForProviderSwitch(
  currentModel: string,
  newProvider: string,
  settings: LoadedSettings,
): string;
```

**주요 로직**:

- `process.env['LLM_MODEL']` 확인 → 유효하면 사용
- `settings.merged.model?.byProvider?.[newProvider]` 확인 → 있으면 복원
- `resolveProviderModel(currentModel, newProvider)` → 현재 모델이 유효하면 유지
- 위 모두 실패 → `getDefaultModelFromRegistry(newProvider)`

**테스트**: `resolveModelForProvider.test.ts`

- byProvider에 저장된 모델 복원
- LLM_MODEL env 우선순위
- 현재 모델이 새 프로바이더에 유효한 경우 유지
- cross-provider 모델 → 기본 모델 fallback
- sLM(openai-compatible) + freeformInput 처리

#### Step 2: `handleApiKeySubmit()`에 모델 전환 로직 추가

**파일**: `packages/cli/src/ui/AppContainer.tsx`

**변경 위치**: `config.refreshAuth()` 호출 직후 (line 633, 670)

```typescript
// After: config.refreshAuth() 호출 후
await config.refreshAuth(AuthType.USE_GEMINI);

// 신규: 프로바이더에 맞는 모델로 자동 전환
const resolvedModel = resolveModelForProviderSwitch(
  config.getModel(),
  provider,
  settings,
);
if (resolvedModel !== config.getModel()) {
  config.setModel(resolvedModel, /* isTemporary */ true);
}

setAuthState(AuthState.Authenticated);
```

**적용 대상**: Gemini 경로 (line 633) + Non-Gemini 경로 (line 670) 모두.

**테스트 검증 포인트**:

- claude → gemini 전환 시 `config.setModel()` 호출 확인
- gemini → openai 전환 시 `config.setModel()` 호출 확인
- 동일 프로바이더 재인증 시 모델 변경 없음 확인
- `byProvider` 복원 우선순위 확인
- `coreEvents.emitModelChanged` 발행 확인 (UI state 갱신 트리거)

#### Step 3: `handleSlmConfigComplete`에도 동일 패턴 적용

**파일**: `packages/cli/src/ui/AppContainer.tsx`

**변경 위치**: `handleSlmConfigComplete()` 내 `config.refreshAuth()` 직후 (line
~755)

```typescript
await config.refreshAuth(AuthType.USE_GEMINI);

// sLM: LLM_MODEL env가 설정되어 있으면 그것을 사용, 아니면 'default'
const slmModel = process.env['LLM_MODEL'] || slmConfig.model || 'default';
if (slmModel !== config.getModel()) {
  config.setModel(slmModel, true);
}
```

**참고**: sLM은 `freeformInput: true`이므로 레지스트리 기본 모델이 `'default'`.
`handleSlmConfigComplete`에서 `LLM_MODEL` env를 직접 설정하므로 이를 우선 참조.

#### Step 4: `handleVertexConfigComplete`에도 동일 패턴 적용

**파일**: `packages/cli/src/ui/AppContainer.tsx`

**변경 위치**: `handleVertexConfigComplete()` 내 `config.refreshAuth()` 직후
(line ~810)

```typescript
await config.refreshAuth(AuthType.USE_VERTEX_AI);

// Vertex AI는 Gemini 모델 사용 — 현재 모델이 Gemini 유효이면 유지
const resolvedModel = resolveModelForProviderSwitch(
  config.getModel(),
  'gemini', // Vertex AI는 gemini 모델 사용
  settings,
);
if (resolvedModel !== config.getModel()) {
  config.setModel(resolvedModel, true);
}
```

#### Step 5: 통합 테스트 + 회귀 검증

**테스트 범위**:

- `resolveModelForProvider.test.ts` — 단위 테스트 (Step 1)
- `AppContainer.test.tsx` — handleApiKeySubmit 후 `config.setModel` 호출 검증
- 기존 테스트 회귀: CLI 전체 + Core 전체

### 3.3 사후 작업

- [ ] 전체 테스트 통과 확인 (`npm run test`)
- [ ] Typecheck 통과 (`npm run typecheck`)
- [ ] Lint 통과 (`npm run lint`)
- [ ] 수동 검증 (실제 `/auth login` provider 전환 후 모델 표시 확인)
- [ ] 작업 결과서 업데이트

---

## 4. 변경 파일 목록 (예상)

| #   | 파일                                                           | 유형 | 규모                |
| --- | -------------------------------------------------------------- | ---- | ------------------- |
| 1   | `packages/cli/src/ui/utils/resolveModelForProvider.ts`         | 신규 | ~40줄               |
| 2   | `packages/cli/src/ui/utils/resolveModelForProvider.test.ts`    | 신규 | ~120줄              |
| 3   | `packages/cli/src/ui/AppContainer.tsx`                         | 수정 | +15줄 (3개 handler) |
| 4   | `packages/cli/src/ui/AppContainer.test.tsx` (또는 관련 테스트) | 수정 | +40줄               |

---

## 5. 핵심 의존 코드 참조

| 코드                                  | 위치                    | 역할                        |
| ------------------------------------- | ----------------------- | --------------------------- |
| `handleApiKeySubmit()`                | AppContainer.tsx:602    | auth 완료 후 provider 설정  |
| `handleSlmConfigComplete()`           | AppContainer.tsx:696    | sLM auth 완료               |
| `handleVertexConfigComplete()`        | AppContainer.tsx:767    | Vertex AI auth 완료         |
| `config.setModel(model, isTemporary)` | config.ts:1060          | 모델 갱신 + 이벤트 발행     |
| `coreEvents.emitModelChanged()`       | config.ts:1065          | UI state 갱신 트리거        |
| `setCurrentModel(config.getModel())`  | AppContainer.tsx:401    | React state 갱신 리스너     |
| `resolveProviderModel()`              | providerSelector.ts:260 | 모델-프로바이더 유효성 검사 |
| `getDefaultModelFromRegistry()`       | providerModels.ts:177   | 프로바이더 기본 모델 조회   |
| `model.byProvider[provider]`          | settings.ts:903         | 프로바이더별 저장 모델      |
| `saveModelForProvider()`              | settings.ts:888         | 프로바이더별 모델 저장      |
| `onModelChange` 콜백                  | config.ts:819           | `/model` persist 시 호출    |

---

## 6. 검증 시나리오

| #   | 시나리오                                             | 기대 결과                                        |
| --- | ---------------------------------------------------- | ------------------------------------------------ |
| 1   | Claude → Gemini 전환 (byProvider에 gemini 모델 있음) | byProvider 저장 모델로 복원                      |
| 2   | Claude → Gemini 전환 (byProvider에 gemini 없음)      | gemini 기본 모델(`gemini-2.5-pro`) 적용          |
| 3   | Gemini → OpenAI 전환                                 | openai 기본 모델(`gpt-5.2`) 또는 byProvider 복원 |
| 4   | Claude → Claude 재인증 (동일 프로바이더)             | 모델 변경 없음                                   |
| 5   | sLM 설정 (LLM_MODEL env 있음)                        | LLM_MODEL env 값 사용                            |
| 6   | sLM 설정 (LLM_MODEL env 없음, slmConfig.model 있음)  | slmConfig.model 사용                             |
| 7   | Vertex AI 전환                                       | gemini 계열 모델 유지/적용                       |
| 8   | UI 상태바 + `/about` 모델 표시                       | 전환 후 즉시 새 모델 표시                        |
| 9   | `LLM_MODEL` env 설정된 상태에서 provider 전환        | env 값 우선 적용                                 |

---

## 7. 리스크 및 고려사항

| 리스크                                                            | 영향                              | 완화 방안                                                           |
| ----------------------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------- |
| `setModel(isTemporary=true)` 호출이 `byProvider`에 저장하지 않음  | 재시작 시 startup 로직에서 재해석 | `byProvider` 저장은 `/model` persist에서만 — 의도된 동작            |
| `refreshAuth()` 전에 `setModel()` 호출 시 ContentGenerator 불일치 | API 호출 실패 가능                | `refreshAuth()` 후에 `setModel()` 호출하여 순서 보장                |
| `handleSlmConfigComplete`의 `LLM_MODEL` env 시점                  | env 설정 전 resolve 시 누락       | `handleSlmConfigComplete` 내에서 env 설정 후 모델 resolve           |
| AppContainer.test.tsx mock 복잡도                                 | 테스트 작성 비용                  | 핵심 경로만 검증, resolveModelForProvider는 별도 단위 테스트로 분리 |

---

## 8. 완료 조건

| 검증 항목                                                        | 상태 |
| ---------------------------------------------------------------- | ---- |
| `resolveModelForProviderSwitch()` 헬퍼 구현 + 단위 테스트        | ⬜   |
| `handleApiKeySubmit()` 모델 자동 전환 적용 (Gemini + Non-Gemini) | ⬜   |
| `handleSlmConfigComplete()` 모델 자동 전환 적용                  | ⬜   |
| `handleVertexConfigComplete()` 모델 자동 전환 적용               | ⬜   |
| UI state(`currentModel`) 자동 갱신 확인                          | ⬜   |
| 기존 테스트 회귀 없음 (Core + CLI 전체)                          | ⬜   |
| Typecheck + Lint 통과                                            | ⬜   |
| 수동 검증: provider 전환 후 상태바/about 모델 즉시 갱신          | ⬜   |
