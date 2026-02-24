# Hotfix: `/auth login` 후 모델 즉시 적용 — 작업 결과서

**작업일자**: 2026-02-24 **작업자**: Claude Opus 4.6 **브랜치**: DID/v0.2
**상태**: ✅ 완료

---

## 1. 문제 개요

### 1.1 증상

`/auth login`으로 프로바이더 전환(Gemini → sLM/Claude/OpenAI) 시 모델이 즉시
적용되지 않아 `/model`을 추가 실행해야만 사용 가능. 전 프로바이더(Claude,
OpenAI, OpenAI-compatible) 공통 발생.

### 1.2 근본 원인

**3가지 핵심 결함**:

| #   | 결함                                                    | 위치                      | 영향                                            |
| --- | ------------------------------------------------------- | ------------------------- | ----------------------------------------------- |
| 1   | `saveModelForProvider()` 미호출                         | `AppContainer.tsx`        | `model.byProvider[provider]`에 미저장           |
| 2   | `resolveProviderModel()` freeformInput LLM_MODEL 미참조 | `providerSelector.ts:284` | 이전 프로바이더 모델이 sLM에 그대로 통과        |
| 3   | `handleApiKeySubmit`에서 기본 모델 미저장               | `AppContainer.tsx`        | provider default에 의존하지만 byProvider 미저장 |

**핵심 경로 비교**:

```
[/model 명령] (정상)
  config.setModel(model, isTemporary=false)
    → onModelChange() → saveModelForProvider()  ← 영구 저장 ✅

[/auth login 명령] (문제)
  config.refreshAuth()
    → createContentGenerator()
      → config.setModel(model, isTemporary=true)  ← 임시만! ❌
  saveModelForProvider() 호출 없음               ← 영구 저장 누락 ❌
```

**추가 문제**: `config.setModel(model, false)`을 `refreshAuth` 후 호출해도, 내부
가드(`this.model !== newModel`)가 동일 모델 재설정을 차단하여 `onModelChange`
콜백이 트리거되지 않음 → `saveModelForProvider` 직접 호출 필요.

---

## 2. 해결 방안

### 2.1 설계 원칙

- **TDD**: Red → Green → Refactor
- **최소 변경**: 3개 파일만 수정, 기존 로직 미변경
- **직접 호출**: `config.setModel(false)` 대신 `saveModelForProvider()` 직접
  호출 (setModel 가드 우회)

### 2.2 변경 파일 목록

| 파일                                                   | 액션 | 변경량 |
| ------------------------------------------------------ | ---- | ------ |
| `packages/core/src/providers/providerSelector.ts`      | 수정 | +8줄   |
| `packages/core/src/providers/providerSelector.test.ts` | 수정 | +40줄  |
| `packages/cli/src/ui/AppContainer.tsx`                 | 수정 | +15줄  |

---

## 3. 구현 세부

### 3.1 결함 #2 수정: `resolveProviderModel` freeformInput LLM_MODEL 우선

**파일**: `packages/core/src/providers/providerSelector.ts` (line 284-297)

**변경 전**:

```typescript
// Non-Gemini model: validate against target provider
if (!isModelValidForProvider(model, provider)) {
  return getDefaultModelFromRegistry(provider);
}
return model;
```

**변경 후**:

```typescript
// Non-Gemini model handling
// For freeformInput providers (sLM/Ollama): LLM_MODEL env takes priority.
// Without this, a stale model from a previous provider (e.g., claude-sonnet-4-6)
// passes through as "valid" because freeformInput accepts any model string.
const llmModelEnv = process.env['LLM_MODEL'];
if (group?.freeformInput && llmModelEnv) {
  return llmModelEnv;
}

if (!isModelValidForProvider(model, provider)) {
  return getDefaultModelFromRegistry(provider);
}
return model;
```

**핵심 포인트**:

- freeformInput 프로바이더(sLM/Ollama)는 `isModelValidForProvider`가 항상 true →
  cross-provider 모델 누수 감지 불가
- `LLM_MODEL` 환경변수는 `/auth login` 시 사용자가 명시 지정한 모델 → 최우선
  적용
- 기존 동작 호환: `LLM_MODEL` 미설정 시 기존 로직 그대로, non-freeformInput
  프로바이더(Claude/OpenAI)에는 영향 없음

### 3.2 결함 #1 수정: `handleSlmConfigComplete` 모델 영구 저장

**파일**: `packages/cli/src/ui/AppContainer.tsx`

**import 추가** (line 92):

```typescript
import { SettingScope, saveModelForProvider } from '../config/settings.js';
```

**변경 위치**: `handleSlmConfigComplete` 함수 내 `refreshAuth` 이후

**변경 전**:

```typescript
await config.refreshAuth(AuthType.USE_GEMINI);
setAuthState(AuthState.Authenticated);
```

**변경 후**:

```typescript
await config.refreshAuth(AuthType.USE_GEMINI);

// Persist model: refreshAuth 내부의 setModel(isTemporary=true)은
// model.byProvider에 저장하지 않음. 명시적으로 영구 저장.
if (slmConfig.model) {
  saveModelForProvider(settings, 'openai-compatible', slmConfig.model);
}

setAuthState(AuthState.Authenticated);
```

### 3.3 결함 #3 수정: `handleApiKeySubmit` 모델 영구 저장

**파일**: `packages/cli/src/ui/AppContainer.tsx`

**변경 위치**: `handleApiKeySubmit` non-Gemini 경로, `refreshAuth` 이후

**변경 전**:

```typescript
await config.refreshAuth(AuthType.USE_GEMINI);
}

setAuthState(AuthState.Authenticated);
```

**변경 후**:

```typescript
await config.refreshAuth(AuthType.USE_GEMINI);

// Persist resolved model: refreshAuth resolves provider default
// (e.g., claude-opus-4-6) but only saves as isTemporary=true.
const resolvedModel = config.getModel();
if (resolvedModel && resolvedModel !== 'default') {
  saveModelForProvider(settings, provider, resolvedModel);
}
}

setAuthState(AuthState.Authenticated);
```

---

## 4. TDD 과정

### 4.1 RED: 테스트 작성 (4개)

**파일**: `packages/core/src/providers/providerSelector.test.ts`

| 테스트                                                                       | 검증 대상                           |
| ---------------------------------------------------------------------------- | ----------------------------------- |
| `should prefer LLM_MODEL over stale cross-provider model on freeformInput`   | Claude→sLM 전환 시 LLM_MODEL 우선   |
| `should prefer LLM_MODEL over stale OpenAI model on freeformInput provider`  | OpenAI→sLM 전환 시 LLM_MODEL 우선   |
| `should use current model on freeformInput when LLM_MODEL is not set`        | LLM_MODEL 미설정 시 기존 동작 유지  |
| `should not affect non-freeformInput providers with LLM_MODEL in non-Gemini` | Claude provider 기존 동작 회귀 방지 |

**RED 결과**: 2 failed, 52 passed (54 total)

### 4.2 GREEN: 구현

`resolveProviderModel()` non-Gemini 분기에 freeformInput + LLM_MODEL 우선 로직
추가.

**GREEN 결과**: 54 passed (54 total) — 기존 50 + 신규 4

---

## 5. 검증 결과

| 검증 항목                    | 결과                                |
| ---------------------------- | ----------------------------------- |
| providerSelector 단위 테스트 | ✅ 54 PASS (기존 50 + 신규 4)       |
| Core 전체 테스트             | ✅ 288 files, 5777 PASS, 24 skipped |
| CLI 전체 테스트              | ✅ 351 files, 4815 PASS, 2 skipped  |
| TypeScript typecheck         | ✅ PASS                             |
| ESLint + Prettier            | ✅ PASS (pre-commit hooks)          |
| Build                        | ✅ PASS                             |

---

## 6. 커밋

**커밋 해시**: `21071c95f`

```
fix(cli): /auth login 후 모델 즉시 적용 — freeformInput LLM_MODEL 우선 + 영구 저장
```

**변경 파일**:

- `packages/core/src/providers/providerSelector.ts`
- `packages/core/src/providers/providerSelector.test.ts`
- `packages/cli/src/ui/AppContainer.tsx`

**참고**: 계획서에서는 Core/CLI 2개 커밋으로 분리 예정이었으나, 변경이 밀접하게
연관되어 단일 커밋으로 통합.

---

## 7. 구현 결정 사항

### `saveModelForProvider` 직접 호출 (계획서와 차이)

**계획서**: `config.setModel(model, false)` 호출 → `onModelChange` →
`saveModelForProvider()`

**실제 구현**: `saveModelForProvider(settings, provider, model)` 직접 호출

**변경 근거**: `refreshAuth()` 내부에서 `config.setModel(model, true)`가 이미
호출되어 `this.model = model`이 설정됨. 이후 `config.setModel(model, false)`를
호출해도 내부 가드(`this.model !== newModel`)가 동일 모델 재설정을 차단하여
`onModelChange` 콜백이 트리거되지 않음. 따라서 `saveModelForProvider`를 직접
호출하는 것이 유일한 해결책.

### freeformInput 한정 LLM_MODEL 참조

**계획서**: 모든 non-Gemini 프로바이더에서 `LLM_MODEL` 환경변수 참조

**실제 구현**: `group?.freeformInput && llmModelEnv` 조건으로 freeformInput
프로바이더만 대상

**변경 근거**: Claude/OpenAI 등 non-freeformInput 프로바이더는
`isModelValidForProvider()`가 cross-provider 모델을 정확히 거부하므로 추가 로직
불필요. freeformInput만이 모든 모델을 유효로 판단하여 누수 발생.

---

## 8. 리뷰 수정 (2차)

### 리뷰 이슈 검증 결과

| #   | 심각도 | 이슈                                                 | 검증    | 수정                                                          |
| --- | ------ | ---------------------------------------------------- | ------- | ------------------------------------------------------------- |
| 1   | HIGH   | freeformInput에서 `--model` CLI 플래그 우선순위 깨짐 | ✅ 확인 | `isRegisteredModelOfOtherProvider()` 도입 — stale 모델만 대체 |
| 2   | MEDIUM | `saveModelForProvider` provider alias 키 정규화 누락 | ✅ 확인 | `normalizeProviderKey()` 적용하여 정규화 후 저장              |
| 3   | LOW    | 핫픽스 경로 회귀 테스트 부재                         | ✅ 확인 | Issue 1에서 3개, Issue 2에서 3개 테스트 추가                  |

### Issue 1 (HIGH): `--model` CLI 플래그 우선순위 복원

**변경 전**:

```typescript
const llmModelEnv = process.env['LLM_MODEL'];
if (group?.freeformInput && llmModelEnv) {
  return llmModelEnv; // ← LLM_MODEL 무조건 우선 → --model 무시!
}
```

**변경 후**:

```typescript
const llmModelEnv = process.env['LLM_MODEL'];
if (group?.freeformInput && llmModelEnv && llmModelEnv !== model) {
  if (isRegisteredModelOfOtherProvider(model, provider)) {
    return llmModelEnv; // stale cross-provider 모델만 LLM_MODEL로 대체
  }
}
```

**`isRegisteredModelOfOtherProvider()` 헬퍼**: 2단계 감지

1. Prefix heuristic: `claude-*`, `gpt-*`, `o[0-9]*`, `gemini-*`, `auto-gemini*`
2. Registry match: 다른 프로바이더의 preset/model ID 정확 일치

**효과**: `'claude-sonnet-4-6'` → Claude 모델(prefix) → LLM_MODEL 사용 ✅
`'my-custom-llama'` → 어떤 프로바이더에도 미소속 → 그대로 사용 (--model 존중) ✅

### Issue 2 (MEDIUM): `saveModelForProvider` provider alias 정규화

**변경 위치**: `packages/cli/src/config/settings.ts`

```typescript
import { normalizeProviderKey } from '../ui/utils/resolveActiveProvider.js';

export function saveModelForProvider(...) {
  const normalizedProvider = normalizeProviderKey(provider);
  // ...
  loadedSettings.setValue(SettingScope.User, 'model.byProvider', {
    ...userByProvider,
    [normalizedProvider]: model,  // ← 정규화된 키로 저장
  });
}
```

**효과**: `'anthropic'` → `'claude'`, `'openai_compatible'` →
`'openai-compatible'`로 정규화하여 `model.byProvider` 조회 키와 일치 보장.

### Issue 3 (LOW): 회귀 테스트 추가

**`providerSelector.test.ts`** (+3개, 총 57):

| 테스트                                                                       | 검증 대상                     |
| ---------------------------------------------------------------------------- | ----------------------------- |
| `should respect user-specified custom model over LLM_MODEL on freeformInput` | --model CLI 플래그 우선순위   |
| `should return LLM_MODEL when model matches it on freeformInput`             | model === LLM_MODEL 충돌 없음 |
| `should prefer LLM_MODEL over stale Gemini model on freeformInput`           | Gemini 분기 처리 확인         |

**`saveModelForProvider.test.ts`** (+3개, 총 8):

| 테스트                                                                 | 검증 대상                  |
| ---------------------------------------------------------------------- | -------------------------- |
| `normalizes provider alias "anthropic" to "claude" in byProvider key`  | anthropic → claude 정규화  |
| `normalizes provider alias "openai_compatible" to "openai-compatible"` | underscore → hyphen 정규화 |
| `handles already-canonical provider key without change`                | 정규화 멱등성              |

### 검증 결과

| 검증 항목                    | 결과                                |
| ---------------------------- | ----------------------------------- |
| providerSelector 단위 테스트 | ✅ 57 PASS (기존 54 + 신규 3)       |
| saveModelForProvider 테스트  | ✅ 8 PASS (기존 5 + 신규 3)         |
| Core 전체 테스트             | ✅ 288 files, 5780 PASS, 24 skipped |
| CLI 전체 테스트              | ✅ 351 files, 4818 PASS, 2 skipped  |
| TypeScript typecheck         | ✅ PASS                             |
| Build                        | ✅ PASS                             |

---

## 9. 핵심 교훈 (Lessons Learned)

1. **`setModel` 가드 주의**: `config.setModel()`은 동일 모델 재설정을 차단하는
   가드가 있음. `refreshAuth` 후 영구 저장이 필요하면 `saveModelForProvider`를
   직접 호출해야 함.

2. **freeformInput의 유효성 검사 한계 + `--model` 우선순위**:
   `isModelValidForProvider`가 freeformInput에서 항상 true → cross-provider 모델
   누수 감지 불가. 단, 무조건 `LLM_MODEL`로 대체하면 `--model` CLI 플래그가
   무시됨. **stale 모델 감지는 레지스트리 등록 + prefix heuristic으로** 수행해야
   안전.

3. **`isTemporary` 파라미터의 파급 효과**: `setModel(model, true)`와
   `setModel(model, false)`는 in-memory 동작은 동일하지만, `onModelChange` 콜백
   호출 여부가 다름 → 영구 저장 경로가 완전히 달라짐.

4. **provider key 정규화는 저장 시점에서**: 로드 시점의 정규화만으로는 저장 시
   alias 키 오염을 방지할 수 없음. `saveModelForProvider` 내부에서
   `normalizeProviderKey`를 적용하는 방어적 프로그래밍이 필요.
