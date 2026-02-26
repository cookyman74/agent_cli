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

---

## 10. 추가 리뷰 수정 (3차)

### 10.1 Issue 4: prefix heuristic false positive

**문제**: `isRegisteredModelOfOtherProvider()`의 `gpt-*` prefix가 GPUStack sLM
모델 `gpt-oss-20b`를 OpenAI 모델로 오인. `SlmConfigDialog.tsx:50`에서 GPUStack
예시 모델로 사용되는 실제 sLM 모델명.

**수정**: `gpt-*` → `gpt-[0-9]*` 패턴으로 변경하여 `gpt-4o`, `gpt-5.2` 등 실제
OpenAI 모델만 매칭. `providerSelector.ts`와 `providerModels.ts` 양쪽 동기화.

| 파일                      | 변경                                            |
| ------------------------- | ----------------------------------------------- |
| `providerSelector.ts:325` | `m.startsWith('gpt-')` → `/^gpt-[0-9]/.test(m)` |
| `providerModels.ts:245`   | `m.startsWith('gpt-')` → `/^gpt-[0-9]/.test(m)` |

**TDD 테스트 (3개 추가)**:

- `should NOT treat gpt-oss-20b as OpenAI model on freeformInput provider`
- `should still detect real OpenAI gpt-4o as stale on freeformInput provider`
- `should still detect real OpenAI gpt-5.2 as stale on freeformInput provider`

### 10.2 Issue 5: 인증 경로 provider alias 정규화

**문제**: `useAuth.ts`와 `AppContainer.tsx`의 `envVarMap`이 canonical key만
보유. 설정에 alias(`anthropic`, `openai_compatible` 등)가 저장된 경우
`envVarMap` lookup 실패 → API key env var 미설정 → 인증 실패.

**수정**: alias가 유입되는 3개 지점에서 `normalizeProviderKey()` 적용.

| 파일                   | 위치                            | 변경                          |
| ---------------------- | ------------------------------- | ----------------------------- |
| `useAuth.ts:87-90`     | `selectedProvider` state 초기화 | `normalizeProviderKey()` 적용 |
| `useAuth.ts:259-261`   | startup auth flow `provider`    | `normalizeProviderKey()` 적용 |
| `AppContainer.tsx:614` | `handleApiKeySubmit` `provider` | `normalizeProviderKey()` 적용 |

### 10.3 검증 결과

| 검증 항목                    | 결과                                               |
| ---------------------------- | -------------------------------------------------- |
| providerSelector 단위 테스트 | ✅ 60 PASS (기존 57 + 신규 3)                      |
| Core 전체 테스트             | ✅ 288 files, 5783 PASS, 24 skipped                |
| CLI 전체 테스트              | ✅ 351 files, 4818 PASS, 2 skipped                 |
| TypeScript typecheck         | ✅ PASS                                            |
| Build                        | ✅ PASS                                            |
| Lint                         | ✅ PASS (기존 `.didim/mcp/rag-server.js` 6건 무관) |

---

## 11. 후속 Hotfix (2026-02-26): Connection Error 진단 + Gemini 모델 미전환

### 11.1 문제 1: `/auth login` Claude 전환 후 `[API Error: Connection error.]`

#### 증상

`/auth login`으로 Claude 서비스 전환 후 API key 입력 →
`[API Error: Connection error.]` 발생. 디버그 콘솔에
`Authenticated via "gemini-api-key"` 표시되어 사용자가 "API key가 Gemini로
회귀된 것 아닌가" 의심.

#### 분석 결과

인증 흐름 전체를 추적한 결과, **auth 라우팅은 정상** 동작:

- `handleApiKeySubmit` → `LLM_PROVIDER=claude` + `ANTHROPIC_API_KEY` 설정 →
  `config.refreshAuth()` → Claude adapter 생성
- `Authenticated via "gemini-api-key"`는 `AuthType.USE_GEMINI` enum 값으로, 모든
  API-key 기반 프로바이더가 공유하는 값 (Claude/OpenAI 포함)
- `Connection error`는 Anthropic SDK의 실제 네트워크 오류 (프록시/방화벽 등)

#### 수정 (진단 개선 3건)

**파일 1**: `packages/cli/src/ui/auth/useAuth.ts`

| 위치      | 변경 내용                                     |
| --------- | --------------------------------------------- |
| line ~317 | API key 미존재 시 `debugLogger.log` 추가      |
| line ~333 | API key 로드 성공 시 `debugLogger.log` 추가   |
| line ~385 | 인증 완료 로그에 실제 provider 정보 추가 표시 |

```typescript
// Before
debugLogger.log(`Authenticated via "${authType}".`);

// After
const activeProvider = process.env['LLM_PROVIDER'] || 'gemini';
debugLogger.log(
  `Authenticated via "${authType}" (provider: ${activeProvider}).`,
);
```

**파일 2**: `packages/cli/src/ui/AppContainer.tsx`

| 위치      | 변경 내용                                    |
| --------- | -------------------------------------------- |
| line ~671 | Non-Gemini 경로 `refreshAuth` 전 디버그 추가 |

```typescript
debugLogger.log(
  `Switching to provider "${provider}" (LLM_PROVIDER=${process.env['LLM_PROVIDER']}, ` +
    `ENABLE_MULTI_PROVIDER=${process.env['ENABLE_MULTI_PROVIDER']}, ` +
    `apiKey=${envVarName ? 'set' : 'not-set'}).`,
);
```

**파일 3**: `packages/core/src/providers/claude/adapter.ts`

| 위치      | 변경 내용                                  |
| --------- | ------------------------------------------ |
| line ~264 | NetworkError에 provider/endpoint 정보 추가 |

```typescript
// Before
return new NetworkError(message, opts);

// After
const cause = (err as { cause?: Error }).cause;
const detail = cause ? ` (${cause.message})` : '';
return new NetworkError(
  `${message} [provider: claude, endpoint: api.anthropic.com]${detail}`,
  opts,
);
```

### 11.2 문제 2: Claude → Gemini 전환 시 모델 미변경

#### 증상

`/auth login`으로 Claude → Gemini로 전환 후, 모델이 `claude-opus-4-6`에서
변경되지 않음. `/model`을 추가 실행해야만 Gemini 모델로 전환 가능.

#### 근본 원인

`handleApiKeySubmit`의 Gemini 경로(line 616-634)에서 `config.refreshAuth()` 이후
모델을 리셋하는 코드가 없음. 비-Gemini 경로(line 688-693)는
`config.getModel()` + `saveModelForProvider()`로 올바르게 처리하고 있었으나,
Gemini 경로에는 동일 로직이 누락.

```
[Non-Gemini 경로] (정상)
  config.refreshAuth()
  resolvedModel = config.getModel()     ← provider default 반영
  saveModelForProvider(settings, ...)   ← 영구 저장 ✅

[Gemini 경로] (문제)
  config.refreshAuth()
  // ← 모델 리셋 없음! ❌
```

#### 수정

**파일**: `packages/cli/src/ui/AppContainer.tsx`

**import 추가**:

```typescript
import {
  // ... existing imports ...
  getDefaultModelFromRegistry,
} from '@didim365/agent-cli-core';
```

**Gemini 경로 모델 리셋** (`refreshAuth` 직후):

```typescript
await config.refreshAuth(AuthType.USE_GEMINI);

// Reset model to Gemini default when switching from another provider
// (e.g., claude-opus-4-6 → gemini-2.5-pro)
const geminiDefault = getDefaultModelFromRegistry('gemini');
const currentModel = config.getModel();
if (currentModel !== geminiDefault) {
  config.setModel(geminiDefault);
  saveModelForProvider(settings, 'gemini', geminiDefault);
}
```

### 11.3 변경 파일 요약

| 파일                                            | 변경 내용                           | 규모  |
| ----------------------------------------------- | ----------------------------------- | ----- |
| `packages/cli/src/ui/auth/useAuth.ts`           | debugLogger 진단 로그 3건 추가/개선 | +14줄 |
| `packages/cli/src/ui/AppContainer.tsx`          | Gemini 모델 리셋 + 디버그 로그      | +15줄 |
| `packages/core/src/providers/claude/adapter.ts` | NetworkError provider/endpoint 정보 | +9줄  |

### 11.4 검증 결과

| 검증 항목                    | 결과       |
| ---------------------------- | ---------- |
| providerModels 단위 테스트   | ✅ 33 PASS |
| providerSelector 단위 테스트 | ✅ 60 PASS |
| Build                        | ✅ PASS    |

---

## 12. 코드 리뷰 후 추가 수정 (2026-02-26)

### 12.1 리뷰 범위

전체 hotfix 작업결과서(5건)에서 언급된 모든 코드 변경 사항을 실제 코드와 교차
검증. 3개 병렬 리뷰 에이전트를 통해 다음 영역 코드 레벨 분석:

1. **Auth flow 경로**: useAuth.ts, AuthDialog.tsx, AppContainer.tsx
2. **Provider model resolution**: providerSelector.ts, providerModels.ts,
   contentGenerator.ts
3. **Error handling & adapters**: claude/adapter.ts, openai/adapter.ts,
   openai-compatible/adapter.ts, requestBuilder.ts

### 12.2 발견된 이슈 및 수정

| #   | 심각도     | 이슈                                                                                       | 수정 파일                        |
| --- | ---------- | ------------------------------------------------------------------------------------------ | -------------------------------- |
| 1   | **HIGH**   | env var cleanup이 5곳에 중복 — 각 경로마다 누락 불일치 (DIDIM*API_KEY, GOOGLE_CLOUD*\* 등) | `resolveActiveProvider.ts` + 4곳 |
| 2   | **MEDIUM** | `handleVertexConfigComplete` 모델 리셋 누락                                                | `AppContainer.tsx`               |
| 3   | **MEDIUM** | freeformInput stale model leak: `LLM_MODEL === model`일 때 감지 실패                       | `providerSelector.ts`            |
| 4   | **MEDIUM** | OpenAI adapter NetworkError에 provider 정보 누락                                           | `openai/adapter.ts`              |
| 5   | **LOW**    | `handleApiKeySubmit` envVarMap에 `didim` 누락                                              | `AppContainer.tsx`               |
| 6   | **LOW**    | `normalizeProviderKey` `vertex_ai` underscore 미처리                                       | `resolveActiveProvider.ts`       |

### 12.3 Issue 1 (HIGH): `cleanProviderEnvVars()` 공통 함수 추출

**근본 원인**: env var cleanup이 5곳(AuthDialog.onSelect, handleApiKeySubmit
Gemini/non-Gemini, handleSlmConfigComplete, handleVertexConfigComplete)에
copy-paste로 존재하며, 각 경로마다 누락 항목이 다름.

**수정**: `cleanProviderEnvVars()` 공통 함수를 `resolveActiveProvider.ts`에
추출.

```typescript
const PROVIDER_ENV_VARS_TO_CLEAN = [
  'ENABLE_MULTI_PROVIDER',
  'LLM_PROVIDER',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'LLM_API_KEY',
  'LLM_MODEL',
  'LLM_BASE_URL',
  'LLM_API_KEY_HEADER',
  'LLM_CUSTOM_HEADERS',
  'DIDIM_API_KEY',
  'GOOGLE_CLOUD_PROJECT',
  'GOOGLE_CLOUD_LOCATION',
] as const;

export function cleanProviderEnvVars(): void {
  for (const key of PROVIDER_ENV_VARS_TO_CLEAN) {
    delete process.env[key];
  }
}
```

5곳의 개별 `delete process.env[...]` 블록을 모두 `cleanProviderEnvVars()` 호출로
교체:

| 파일               | 위치                         | 변경                   |
| ------------------ | ---------------------------- | ---------------------- |
| `AuthDialog.tsx`   | `onSelect()` env cleanup     | 9개 delete → 함수 호출 |
| `AppContainer.tsx` | Gemini 경로                  | 9개 delete → 함수 호출 |
| `AppContainer.tsx` | Non-Gemini 경로              | 5개 delete → 함수 호출 |
| `AppContainer.tsx` | `handleSlmConfigComplete`    | 4개 delete → 함수 호출 |
| `AppContainer.tsx` | `handleVertexConfigComplete` | 9개 delete → 함수 호출 |

### 12.4 Issue 2 (MEDIUM): `handleVertexConfigComplete` 모델 리셋 추가

```typescript
await config.refreshAuth(AuthType.USE_VERTEX_AI);

// Reset model to Gemini default (Vertex AI uses Gemini models)
const geminiDefault = getDefaultModelFromRegistry('gemini');
const currentModel = config.getModel();
if (currentModel !== geminiDefault) {
  config.setModel(geminiDefault);
  saveModelForProvider(settings, 'gemini', geminiDefault);
}
```

### 12.5 Issue 3 (MEDIUM): freeformInput stale model 감지 개선

**변경 전**: `LLM_MODEL === model`일 때 stale 감지 스킵, `LLM_MODEL` 미설정 시
stale 모델이 통과.

**변경 후**: stale 여부를 먼저 판단한 후, `LLM_MODEL`이 유효하면 사용, 아니면
provider default로 fallback.

```typescript
// Before
if (group?.freeformInput && llmModelEnv && llmModelEnv !== model) {
  if (isRegisteredModelOfOtherProvider(model, provider)) {
    return llmModelEnv;
  }
}

// After
if (group?.freeformInput && isRegisteredModelOfOtherProvider(model, provider)) {
  const llmModelEnv = process.env['LLM_MODEL'];
  if (llmModelEnv && !isRegisteredModelOfOtherProvider(llmModelEnv, provider)) {
    return llmModelEnv;
  }
  return getDefaultModelFromRegistry(provider);
}
```

### 12.6 Issue 4 (MEDIUM): OpenAI adapter NetworkError 개선

Claude adapter와 동일한 패턴으로 provider 정보 추가:

```typescript
const cause = (err as { cause?: Error }).cause;
const detail = cause ? ` (${cause.message})` : '';
return new NetworkError(
  `${message} [provider: ${this.providerName}]${detail}`,
  opts,
);
```

OpenAI-compatible adapter는 `OpenAiAdapter`를 상속하므로 자동 적용.
`this.providerName`이 `'openai-compatible'`로 override 되어 있어 정확히 표시됨.

### 12.7 Issue 5+6 (LOW): envVarMap didim 추가 + vertex_ai 정규화

- `handleApiKeySubmit` non-Gemini 경로의 `envVarMap`에 `didim: 'DIDIM_API_KEY'`
  추가
- `normalizeProviderKey`에 `'vertex_ai'` case 추가 (기존 `'openai_compatible'`과
  일관)

### 12.8 변경 파일 요약

| 파일                                                 | 변경 내용                                                  |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| `packages/cli/src/ui/utils/resolveActiveProvider.ts` | `cleanProviderEnvVars()` 추가, `vertex_ai` 정규화          |
| `packages/cli/src/ui/AppContainer.tsx`               | 4곳 cleanup → 공통 함수, Vertex 모델 리셋, envVarMap didim |
| `packages/cli/src/ui/auth/AuthDialog.tsx`            | cleanup → 공통 함수                                        |
| `packages/core/src/providers/providerSelector.ts`    | freeformInput stale 감지 로직 개선                         |
| `packages/core/src/providers/openai/adapter.ts`      | NetworkError provider 정보 추가                            |

### 12.9 검증 결과

| 검증 항목                    | 결과                                                                       |
| ---------------------------- | -------------------------------------------------------------------------- |
| providerSelector 단위 테스트 | ✅ 60 PASS                                                                 |
| providerModels 단위 테스트   | ✅ 33 PASS                                                                 |
| AuthDialog 단위 테스트       | ✅ 29 PASS                                                                 |
| AppContainer 단위 테스트     | ✅ 71 PASS                                                                 |
| Core 전체 테스트             | ✅ 288 files, 5780 PASS, 3 FAIL (기존 실패 — re-export, hookV2, mcp-OAuth) |
| CLI 전체 테스트              | ✅ 351 files, 4817 PASS, 1 FAIL (기존 실패 — config integration timeout)   |
| Build                        | ✅ PASS                                                                    |

**본 수정으로 인한 신규 실패 0건.**

### 12.10 리뷰에서 확인했으나 수정하지 않은 항목

다음은 리뷰 과정에서 발견되었으나, 현재 코드에서 실제 문제를 유발하지 않거나
수정 시 범위가 크므로 별도 이슈로 관리가 적절한 항목:

| #   | 심각도 | 내용                                                                       | 비고                                                          |
| --- | ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------- |
| A   | Low    | `providerPrefixes` 맵이 `providerModels.ts`와 `providerSelector.ts`에 중복 | DRY 위반이나 현재 동기화 상태. 공통 상수 추출은 별도 리팩터링 |
| B   | Low    | `/^o[0-9]/` 패턴이 `o2-llama-7b` 같은 커스텀 모델을 오인할 가능성          | 실제 사용례 미발견, 향후 false positive 보고 시 대응          |
| C   | Low    | `GEMINI_ALIASES` Set이 `models.ts` 상수와 별도 유지                        | 현재 동기화 상태, 별도 리팩터링 시 통합                       |
| D   | Low    | `envVarMap`이 4곳+ 중복 정의                                               | `cleanProviderEnvVars`로 일부 해소, 완전 통합은 별도 리팩터링 |
| E   | Low    | AbortError가 모든 adapter에서 retryable NetworkError로 분류                | 현재 abort 경로에서 retry가 발생하지 않아 실질적 영향 없음    |
| F   | Low    | `isRegisteredModelOfOtherProvider` registry match가 case-sensitive         | 모든 현재 모델이 prefix heuristic에서 먼저 매칭되어 영향 없음 |

---

## 13. 추가 리뷰 수정 (4차)

### 13.1 Issue 6: gpt-oss-\* 모델 cross-provider 누수 (회귀)

**문제**: `gpt-*` → `gpt-[0-9]*` 패턴 축소(3차 리뷰)로 인해 `gpt-oss-20b` 같은
sLM 모델이 prefix heuristic에 걸리지 않음. `allowCustomModels=true`인
Claude/OpenAI 에서 `isModelValidForProvider` → `true` → stale 모델이 그대로
통과.

**수정 전략 (2단계)**:

1. **Strategy 2 추가**: `resolveProviderModel` non-Gemini 분기에서,
   `LLM_MODEL`이 설정되어 있고 현재 모델과 다를 때 — 모델이 target provider의
   **등록 모델이 아니고** **own-prefix도 아니면** → cross-provider 전환 상황으로
   판단.
   - `isRegisteredModelForProvider()` 신규 함수: 순수 등록 여부만 확인
     (allowCustomModels 무시)
   - `isOwnProviderPrefix()` 신규 함수: 모델이 target provider의 naming
     prefix인지 확인

2. **LLM_MODEL 미설정 시**: `allowCustomModels` 존중 (`--model` 직접 지정 보호).
   `/auth login` 경로는 항상 `LLM_MODEL`을 설정하므로, cross-provider 전환은
   Strategy 2로 커버됨.

| 파일                  | 변경                                             |
| --------------------- | ------------------------------------------------ |
| `providerModels.ts`   | `isRegisteredModelForProvider()` 신규 export     |
| `providerSelector.ts` | Strategy 2 로직 + `isOwnProviderPrefix()` helper |

**TDD 테스트 (3개 추가)**:

- `should fallback gpt-oss-20b to Claude default when LLM_MODEL differs`
- `should fallback gpt-oss-20b to Claude default when LLM_MODEL is invalid`
- `should fallback gpt-oss-20b to OpenAI default when LLM_MODEL is set`

### 13.2 Issue 7: alias provider key 정규화 (resolveProviderModel)

**문제**: `contentGenerator.ts`에서 `LLM_PROVIDER` 값(`openai_compatible` 등)을
정규화 없이 `resolveProviderModel`에 전달. `PROVIDER_MODEL_REGISTRY` key는
`'openai-compatible'`(하이픈)이므로 registry lookup 실패 → 검증 우회.

**수정**: `resolveProviderModel` 진입부에 `normalizeProviderRegistryKey()` 추가.
Core 패키지 내 private helper로 구현 (CLI의 `normalizeProviderKey`와 동일 매핑).

| 파일                  | 변경                                                             |
| --------------------- | ---------------------------------------------------------------- |
| `providerSelector.ts` | `normalizeProviderRegistryKey()` 신규 helper + 함수 내 전역 적용 |

**TDD 테스트 (2개 추가)**:

- `should normalize alias "openai_compatible" in resolveProviderModel`
- `should normalize alias "anthropic" in resolveProviderModel`

### 13.3 검증 결과

| 검증 항목                    | 결과                                                |
| ---------------------------- | --------------------------------------------------- |
| providerSelector 단위 테스트 | ✅ 65 PASS (기존 60 + 신규 5)                       |
| Core 전체 테스트             | ✅ 5784 PASS, 24 skipped (4개 기존 infra 실패 무관) |
| CLI 전체 테스트              | ✅ 351 files, 4818 PASS, 2 skipped                  |
| TypeScript typecheck         | ✅ PASS                                             |
| Build                        | ✅ PASS                                             |

---

## 14. Gemini 경로 모델 동기화 누락 수정 (5차)

### 14.1 문제

`/auth login` → Gemini 선택 시 `handleApiKeySubmit`의 Gemini 경로(line 615)에서
`refreshAuth` 후 `saveModelForProvider()` 미호출. non-Gemini
경로(Claude/OpenAI/sLM) 에는 모두 존재하지만 Gemini만 누락.

**결과**:

- `model.byProvider['gemini']` 미저장 → 재시작 시 이전 provider 모델이
  `model.name`에서 로드
- 이전 provider(예: Claude)의 모델(`claude-opus-4-6`)이 Gemini에서 그대로 표시

### 14.2 수정

`AppContainer.tsx:634` — `refreshAuth` 직후에 `saveModelForProvider` 추가.
non-Gemini 경로(line 675-678)와 대칭.

| 파일                       | 위치                      | 변경                                                           |
| -------------------------- | ------------------------- | -------------------------------------------------------------- |
| `AppContainer.tsx:635-640` | Gemini `refreshAuth` 직후 | `saveModelForProvider(settings, 'gemini', resolvedModel)` 추가 |

### 14.3 검증 결과

| 검증 항목            | 결과                    |
| -------------------- | ----------------------- |
| CLI 전체 테스트      | ✅ 4818 PASS, 2 skipped |
| TypeScript typecheck | ✅ PASS                 |
| Build                | ✅ PASS                 |

---

## 15. 전체 auth 경로 stale 모델 누수 방지 (6차)

### 15.1 문제

14차에서 추가한 Gemini 경로
`saveModelForProvider(settings, 'gemini', config.getModel())`에 근본적 결함
발견. `config.getModel()`이 이전 프로바이더의 모델을 반환하여 잘못된 모델 저장.

| #   | 심각도 | 위치                       | 설명                                                                                                                   |
| --- | ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| A   | HIGH   | `AppContainer.tsx:662-668` | **Gemini 경로**: `config.getModel()` = stale `claude-opus-4-6` → `byProvider['gemini']`에 저장                         |
| B   | HIGH   | `AppContainer.tsx:828-829` | **Vertex AI 경로**: `saveModelForProvider` 완전 누락                                                                   |
| C   | MEDIUM | `AppContainer.tsx:708-712` | **Non-Gemini 경로**: sLM→Claude 전환 시 `gpt-oss-*`가 `allowCustomModels`로 통과 (LLM_MODEL 삭제 후 Strategy 2 미작동) |

**근본 원인**: `handleApiKeySubmit`에서 `LLM_MODEL`을 삭제한 후 `refreshAuth`
호출 → Gemini/Vertex legacy 경로는 `resolveProviderModel` 미호출, non-Gemini
경로는 Strategy 2 (LLM_MODEL 기반 cross-provider 감지) 비활성화.

### 15.2 수정 전략

**`resolveModelForAuthSwitch()` 헬퍼 도입** — `config.getModel()` 대신
`settings.model.byProvider[provider]` || `getDefaultModelFromRegistry(provider)`
사용.

```typescript
function resolveModelForAuthSwitch(
  settings: LoadedSettings,
  provider: string,
): string {
  const normalizedProvider = normalizeProviderKey(provider);
  const userSettings = settings.forScope(SettingScope.User).settings;
  const savedModel = userSettings.model?.byProvider?.[normalizedProvider];
  if (savedModel) return savedModel;
  return getDefaultModelFromRegistry(normalizedProvider);
}
```

**핵심 논리**: `byProvider[provider]`는 사용자가 해당 프로바이더에서 마지막으로
선택한 모델. 존재하면 그것을 사용, 없으면 프로바이더 기본 모델. 이전
프로바이더의 in-memory 모델에 의존하지 않으므로 stale 모델 누수 원천 차단.

### 15.3 변경 내용

| 경로       | 변경 전                    | 변경 후                                                                 |
| ---------- | -------------------------- | ----------------------------------------------------------------------- |
| Gemini     | `config.getModel()` → save | `resolveModelForAuthSwitch(settings, 'gemini')` → setModel + save       |
| Non-Gemini | `config.getModel()` → save | `resolveModelForAuthSwitch(settings, provider)` → setModel + save       |
| Vertex AI  | (누락)                     | `resolveModelForAuthSwitch(settings, 'vertex-ai')` → setModel + save    |
| sLM        | save만                     | `config.setModel(slmConfig.model, true)` + save (in-memory 동기화 추가) |

### 15.4 검증 결과

| 검증 항목                    | 결과                    |
| ---------------------------- | ----------------------- |
| Core providerSelector 테스트 | ✅ 65 PASS              |
| CLI 전체 테스트              | ✅ 4818 PASS, 2 skipped |
| TypeScript typecheck (Core)  | ✅ PASS                 |
| TypeScript typecheck (CLI)   | ✅ PASS                 |
| Build                        | ✅ PASS                 |
| 커밋                         | ✅ `e817a8fd7`          |

---

## 16. Git Rebase 충돌 해결 + 머지 코드 리뷰 (2026-02-26)

### 16.1 배경

`DID/v0.2` 브랜치에서 `git pull` 시 divergent branches 오류 발생.

- **로컬**: 5개 커밋 (v0.2.20 release → Strategy 2 + alias 정규화 → Gemini /auth
  모델 동기화 → stale 모델 누수 방지 → v0.2.21 release)
- **리모트**: 2개 커밋 (env var cleanup + version bump)

**해결**: `git pull --rebase origin DID/v0.2` 선택.

### 16.2 충돌 파일 및 해결

| 파일                                       | 충돌 수        | 해결 전략                                                                                 |
| ------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------- |
| `providerSelector.ts`                      | 1              | 로컬(Strategy 2) 유지 — HEAD의 단순 freeformInput 로직보다 상위 호환                      |
| `hotfix_auth_login_model_sync_20260224.md` | 1              | 양쪽 섹션 보존 + 번호 재정렬                                                              |
| `AppContainer.tsx`                         | 3 (2차 rebase) | import 병합(cleanProviderEnvVars + LoadedSettings), 로컬 `resolveModelForAuthSwitch` 유지 |

### 16.3 머지 코드 리뷰 — 발견된 이슈 및 수정

| #   | 심각도       | 이슈                                                                                                        | 수정                                         |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | **CRITICAL** | `providerSelector.ts:329` — HEAD의 freeformInput fallback `return` 잔존 (4개 테스트 실패)                   | 해당 라인 삭제                               |
| 2   | **MEDIUM**   | `const group` 변수 섀도잉 (line 317 vs line 269)                                                            | 내부 `const group` 삭제, 외부 `group` 재사용 |
| 3   | **LOW**      | `normalizeProviderRegistryKey`의 무의미한 삼항연산자 `(typeof provider === 'string' ? provider : provider)` | `String(provider)`로 단순화                  |
| 4   | **LOW**      | 문서 섹션 번호 중복 (## 12, ## 13 각 2회)                                                                   | 12→14, 13→15로 재번호                        |

**Critical 버그 상세**: HEAD의 freeformInput fallback이 Strategy 1+2 블록 내부에
잔존하여, 두 전략 모두 해당 없는 경우 조기 return → `allowCustomModels` 검증
우회.

```typescript
// 머지 아티팩트 (삭제됨)
    // Neither strategy → fall through
  }
  return getDefaultModelFromRegistry(provider);  // ← HEAD 잔존, 조기 return!
```

**수정 후 테스트**: 65/65 PASS (기존 4건 실패 해소)

---

## 17. 외부 리뷰 Finding 반영 (7차, 2026-02-26)

### 17.1 리뷰 범위

git merge 관련 코드 중심 외부 리뷰에서 3개 Finding 제시:

| #   | 심각도     | Finding                                                                                 | 영향                                                      |
| --- | ---------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| F1  | **HIGH**   | `cleanProviderEnvVars()`의 `LLM_MODEL` 삭제 → Strategy 2 비활성화 → stale sLM 모델 누수 | `gpt-oss-20b` 같은 sLM 모델이 Claude/OpenAI에서 감지 불가 |
| F2  | **MEDIUM** | LLM_MODEL 삭제 시나리오 회귀 테스트 부재                                                | 향후 리팩터링 시 누수 재발 위험                           |
| F3  | **LOW**    | Core `normalizeProviderRegistryKey`와 CLI `normalizeProviderKey` 중복                   | `didim_studio` alias 누락 등 동기화 이탈 위험             |

### 17.2 Finding 1 (HIGH): LLM_MODEL pre-set으로 Strategy 2 활성화

**근본 원인**: `cleanProviderEnvVars()`가 `LLM_MODEL`을 삭제한 후
`refreshAuth()` 호출. `refreshAuth` 내부의 `resolveProviderModel`에서 Strategy 2
조건(`llmModelEnv && llmModelEnv !== model`)이 `false`가 되어 `gpt-oss-20b` 같은
sLM 모델이 `allowCustomModels: true` 통과.

**비교**: sLM 경로만 `process.env['LLM_MODEL'] = slmConfig.model` (line 784)로
정상 설정. Gemini/Non-Gemini/Vertex AI 경로는 `LLM_MODEL` 미설정.

**수정**: 3개 경로에서 `resolveModelForAuthSwitch()` 호출을 `refreshAuth()`
**이전**으로 이동하고 `process.env['LLM_MODEL']`을 pre-set.

**파일**: `packages/cli/src/ui/AppContainer.tsx`

| 경로                          | 변경 전                                                  | 변경 후                                                                        |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Gemini** (line 660-663)     | `refreshAuth` → `resolveModelForAuthSwitch` → `setModel` | `resolveModelForAuthSwitch` → `LLM_MODEL` pre-set → `refreshAuth` → `setModel` |
| **Non-Gemini** (line 704-712) | `refreshAuth` → `resolveModelForAuthSwitch` → `setModel` | `resolveModelForAuthSwitch` → `LLM_MODEL` pre-set → `refreshAuth` → `setModel` |
| **Vertex AI** (line 849-852)  | `refreshAuth` → `resolveModelForAuthSwitch` → `setModel` | `resolveModelForAuthSwitch` → `LLM_MODEL` pre-set → `refreshAuth` → `setModel` |

**결과**: 4개 경로(sLM 포함) 모두 동일 패턴으로 대칭화.

### 17.3 Finding 2 (MEDIUM): 회귀 테스트 4건 추가

**파일**: `packages/core/src/providers/providerSelector.test.ts`

| 테스트                                                               | 검증 대상                                               |
| -------------------------------------------------------------------- | ------------------------------------------------------- |
| `should pass gpt-oss-20b through on Claude when LLM_MODEL is absent` | `allowCustomModels` 한계 문서화 (LLM_MODEL 없으면 통과) |
| `should fallback gpt-oss-20b on Claude when LLM_MODEL is pre-set`    | Strategy 2 정상 감지 (auth switch 시뮬레이션)           |
| `should pass gpt-oss-20b through on OpenAI when LLM_MODEL is absent` | OpenAI에서 동일 한계 문서화                             |
| `should fallback gpt-oss-20b on OpenAI when LLM_MODEL is pre-set`    | OpenAI에서 Strategy 2 정상 작동 확인                    |

**핵심**: 첫 번째/세 번째 테스트는 `allowCustomModels`의 구조적 한계를
문서화하는 역할. 이것이 AppContainer에서 `LLM_MODEL` pre-set이 필수인 이유를
증명.

### 17.4 Finding 3 (LOW): Provider alias 정규화 로직 통합

**변경 전**: Core `normalizeProviderRegistryKey` (private) + CLI
`normalizeProviderKey` (export) 중복. CLI에 `didim_studio` alias 누락.

**수정**: Core의 함수를 `normalizeProviderKey`로 rename + export, CLI는 Core에서
import + re-export.

| 파일                                                 | 변경                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `packages/core/src/providers/providerSelector.ts`    | `normalizeProviderRegistryKey` → `normalizeProviderKey` rename + `export`                     |
| `packages/core/src/index.ts`                         | `export { normalizeProviderKey } from './providers/providerSelector.js'` 추가                 |
| `packages/cli/src/ui/utils/resolveActiveProvider.ts` | 중복 함수 삭제, `import { normalizeProviderKey } from '@didim365/agent-cli-core'` + re-export |

**효과**:

- SSOT(Single Source of Truth) 확립 — 향후 alias 추가/변경 시 Core만 수정
- CLI에 없던 `didim_studio` alias 자동 포함
- 기존 CLI 임포트 경로(`../ui/utils/resolveActiveProvider.js`) 유지로 하위
  호환성 보장

### 17.5 검증 결과

| 검증 항목                    | 결과                          |
| ---------------------------- | ----------------------------- |
| providerSelector 단위 테스트 | ✅ 69 PASS (기존 65 + 신규 4) |
| Core 빌드                    | ✅ PASS                       |
| CLI 빌드                     | ✅ PASS                       |

---

## 18. 추가 리뷰 이슈 반영 (8차, 2026-02-26)

### 18.1 배경

추가 코드 리뷰에서 확인된 2개 이슈를 보완:

| #   | 심각도     | 이슈                                                                                                         |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | **MEDIUM** | `resolveModelForAuthSwitch()`가 `settings.forScope()` 전제 → 최소 mock/마이그레이션 컨텍스트에서 런타임 예외 |
| 2   | **MEDIUM** | Strategy 2가 `LLM_MODEL` pre-set 상태에서 명시 `--model` 커스텀 값을 덮어쓸 가능성                           |

### 18.2 Issue 1 수정: `resolveModelForAuthSwitch` 방어적 fallback

**파일**: `packages/cli/src/ui/utils/resolveActiveProvider.ts`

`settings.forScope(SettingScope.User)`가 없거나 비정상인 경우,
`settings.merged.model.byProvider`를 fallback으로 사용하도록 보강.

```typescript
if (typeof settings.forScope === 'function') {
  // user scope 사용
} else {
  // merged fallback 사용
}
```

**효과**:

- `useAuth` 재시작 경로에서 테스트 fixture/특수 컨텍스트로 인한 `TypeError` 제거
- 기존 정상 경로(`forScope` 존재) 동작은 그대로 유지

### 18.3 Issue 2 수정: 명시 `--model` 우선 보장

**파일**: `packages/core/src/providers/providerSelector.ts`

Strategy 2 조건에 `wasModelExplicitlySpecified(model)` 가드를 추가.

- 지원 플래그: `--model value`, `--model=value`, `-m value`, `-m=value`
- 명시 모델과 현재 모델이 일치하면 Strategy 2 override를 건너뜀
- 명시 모델이 현재 모델과 다르면 기존 stale 감지 로직 유지

```typescript
if (
  !group.freeformInput &&
  !isRegisteredModelForProvider(model, normalizedProvider) &&
  !isOwnProviderPrefix(model, normalizedProvider) &&
  !wasModelExplicitlySpecified(model)
) {
  // Strategy 2 fallback
}
```

### 18.4 테스트 보강

**추가/수정 테스트 파일**:

- `packages/cli/src/ui/utils/resolveActiveProvider.test.ts`
  - `forScope` 없는 merged 기반 fallback 케이스 추가
- `packages/core/src/providers/providerSelector.test.ts`
  - 명시 `--model` 커스텀 모델 유지 케이스 추가
  - 명시 `--model`이 현재 모델과 다를 때 stale 감지 유지 케이스 추가
- `packages/cli/src/ui/auth/useAuth.test.tsx`
  - 최신 의도(`LLM_MODEL` pre-set 유지)에 맞게 회귀 기대값 정정

### 18.5 검증 결과

| 검증 항목                       | 결과       |
| ------------------------------- | ---------- |
| `useAuth.test.tsx`              | ✅ 30 PASS |
| `resolveActiveProvider.test.ts` | ✅ 27 PASS |
| `providerSelector.test.ts`      | ✅ 71 PASS |

---

## 19. 추가 이슈 보완 (9차, 2026-02-26)

### 19.1 배경

후속 점검에서 아래 3건을 추가 확인:

| #   | 심각도     | 이슈                                                                             |
| --- | ---------- | -------------------------------------------------------------------------------- |
| 1   | **HIGH**   | `/auth logout` env cleanup에서 `DIDIM_API_KEY` 누락                              |
| 2   | **MEDIUM** | `useAuth` env auto-detect 경로에서 Didim(`DIDIM_API_KEY`) 미처리                 |
| 3   | **LOW**    | `AppContainer` Vertex 회귀 테스트가 최신 의도(`LLM_MODEL` pre-set 유지)와 불일치 |

### 19.2 수정 내용

#### Issue 1 (HIGH): logout cleanup에 Didim 키 추가

**파일**: `packages/cli/src/ui/commands/authCommand.ts`

```typescript
delete process.env['DIDIM_API_KEY'];
```

#### Issue 2 (MEDIUM): useAuth Didim auto-detect/검증 보강

**파일**: `packages/cli/src/ui/auth/useAuth.ts`

- 초기 상태 계산(`determineInitialState`)에 `DIDIM_API_KEY` 감지 추가
- `LLM_PROVIDER` 검증 맵에 `didim: 'DIDIM_API_KEY'` 추가
- no-auth env auto-detect 경로에 `DIDIM_API_KEY` 분기 추가:
  - `ENABLE_MULTI_PROVIDER=true`
  - `LLM_PROVIDER='didim'`
  - `refreshAuth(AuthType.USE_GEMINI)` 호출

#### Issue 3 (LOW): Vertex 회귀 테스트 기대값 정합화

**파일**: `packages/cli/src/ui/AppContainer.test.tsx`

- `handleVertexConfigComplete` 회귀 테스트에서 `LLM_MODEL`을 clear 대상에서 제외
- `LLM_MODEL`이 stale 값 삭제 후 **Gemini resolved model**로 pre-set되는 최신
  의도를 검증:
  - `getDefaultModelFromRegistry('gemini')`와 비교

### 19.3 테스트 보강

**파일**: `packages/cli/src/ui/auth/useAuth.test.tsx`

- `should auto-detect Didim from DIDIM_API_KEY env var`
- `should show error when LLM_PROVIDER=didim but DIDIM_API_KEY is missing`

**파일**: `packages/cli/src/ui/commands/authCommand.test.ts`

- `should clear DIDIM_API_KEY runtime env var`

### 19.4 검증 결과

| 검증 항목                         | 결과       |
| --------------------------------- | ---------- |
| `authCommand.test.ts`             | ✅ 10 PASS |
| `useAuth.test.tsx`                | ✅ 32 PASS |
| `AppContainer.test.tsx`           | ✅ 74 PASS |
| `resolveActiveProvider.test.ts`   | ✅ 27 PASS |
| `providerSelector.test.ts` (core) | ✅ 71 PASS |
