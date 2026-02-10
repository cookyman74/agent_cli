# M3.4.A 추가 수정 — Non-Gemini 상태바 + 라우팅 에러 해결

- **작업일**: 2026-02-10
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료

## 문제 현상

`LLM_PROVIDER=claude`로 실행 시 CLI 상태바에 두 가지 이슈 발생:

1. **모델 표시 오류**: "Auto (Gemini 2.5) /model" — Claude 사용 중인데 Gemini
   모델 표시
2. **에러 표시**: "✖ 3 errors" — 라우팅 과정에서 발생하는 콘솔 에러

## 원인 분석

### 1. 모델 표시 오류

**경로 추적**:

```
Footer.tsx:150 → getDisplayString(model)
  ↑ model = uiState.currentModel
  ↑ AppContainer.tsx:307 → useState(config.getModel())
  ↑ config.getModel() → this.model (= 'auto')
  ↑ getDisplayString('auto') → 'Auto (Gemini 2.5)'
```

**원인**: `config.getModel()`은 원래 설정된 Gemini 모델('auto')을 반환.
`processLlmTurn()`에서 `resolveProviderModel()`로 해석한 프로바이더 모델이
config에 반영되지 않아 상태바가 업데이트되지 않음.

### 2. 라우팅 에러 (✖ 3 errors)

**경로 추적**:

```
processTurn() line 648 → router.route(routingContext)
  → CompositeStrategy → ClassifierStrategy.route()
    → baseLlmClient.generateJson()
      → _generateWithRetry()
        → contentGenerator.generateContent(req, promptId)  [LEGACY]
          → wrapAdapterAsGenerator().generateContent()
            → throw "Provider claude does not support legacy Gemini API"
      → retryWithBackoff catches → not retryable → throws
    → _generateWithRetry catch → reportError()
      → debugLogger.error() → console.error()
        → ConsolePatcher captures as type='error' → errorCount++
```

**원인**: 라우팅 시스템이 `baseLlmClient.generateJson()`을 호출하여 레거시
`generateContent()` (Gemini 전용)를 실행. Non-Gemini 프로바이더에서는 이
메서드가 throw하므로 `reportError()` → `debugLogger.error()` → `console.error()`
→ ConsolePatcher가 type='error'로 캡처하여 상태바 에러 카운트 증가.

**에러 발생 전략**:

- ClassifierStrategy → `baseLlmClient.generateJson()` → throw → reportError (1
  error)
- NumericalClassifierStrategy → 위와 동일 경로 (1 error, 설정에 따라 하나만
  활성)
- 추가 레거시 API 호출 (체크포인트/로깅 등) → 추가 error 가능

## 해결 방법

### 핵심 변경: Non-Gemini 감지를 라우팅 이전으로 이동

**Before** (문제):

```
processTurn() {
  1. routing → router.route() → ClassifierStrategy → generateJson() → LEGACY API THROW
  2. non-Gemini check → too late, routing already ran
}
```

**After** (수정):

```
processTurn() {
  1. non-Gemini check → skip routing entirely
  2. resolveProviderModel() → config.setModel() → status bar update
  3. processLlmTurn() → llm* API (provider-independent)
}
```

### 변경 상세

**`client.ts` 수정**:

```typescript
// BEFORE: non-Gemini check was AFTER routing (line 670-688)
// AFTER: non-Gemini check BEFORE routing (line 633+)

const generator = this.getContentGeneratorOrFail();
if (
  isProviderIndependentGenerator(generator) &&
  generator.providerName !== 'gemini'
) {
  const providerModel = resolveProviderModel(
    this.config.getModel(),
    generator.providerName!,
  );

  // Update config model for status bar display
  this.config.setModel(providerModel, true);

  if (!signal.aborted) {
    yield { type: LlmEventType.ModelInfo, modelName: providerModel };
  }

  turn = yield* this.processLlmTurn(
    generator,
    providerModel,
    request,
    linkedSignal,
    prompt_id,
  );
  return turn;
}

// Gemini path: routing runs only for Gemini providers
const routingContext = { ... };
```

### 해결 효과

| 이슈             | 수정 전                           | 수정 후                         |
| ---------------- | --------------------------------- | ------------------------------- |
| 상태바 모델 표시 | "Auto (Gemini 2.5)"               | "claude-3-5-sonnet-20241022" 등 |
| 에러 카운트      | ✖ 3 errors (라우팅 레거시 throw) | ✖ 0 errors (라우팅 스킵)       |
| 라우팅 호출      | Non-Gemini에서도 실행 (불필요)    | Gemini에서만 실행               |
| 성능             | 라우팅 시도 → 실패 → 지연         | 즉시 non-Gemini 경로 진입       |

## 변경 파일

| 파일                  | 변경 내용                                                             |
| --------------------- | --------------------------------------------------------------------- |
| `core/client.ts`      | Non-Gemini 감지를 라우팅 전으로 이동 + `config.setModel()` 호출 추가  |
| `core/client.test.ts` | 테스트 기대값 업데이트 + 라우팅 미호출/setModel 호출 검증 테스트 추가 |

## 테스트

### 신규 테스트 2건

| 테스트                                            | 검증 내용                                        |
| ------------------------------------------------- | ------------------------------------------------ |
| should skip routing for non-Gemini providers      | `mockRouterService.route` NOT called             |
| should update config model for status bar display | `config.setModel(providerModel, true)` 호출 확인 |

### 기존 테스트 업데이트 2건

| 테스트                                                | 변경                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| should yield LlmEvents from non-Gemini provider       | ModelInfo modelName: 'default-routed-model' → 'test-model' |
| should call llmGenerateContentStream with correct req | model: 'default-routed-model' → 'test-model'               |

## Quality Gate

| 항목          | 결과                       |
| ------------- | -------------------------- |
| TypeCheck     | ✅ PASS                    |
| ESLint        | ✅ PASS                    |
| Client 테스트 | ✅ 82 passed (80→82, +2)   |
| Provider 회귀 | ✅ 37 files / 758 passed   |
| Core 전체     | ✅ 274 files / 5204 passed |

## 설계 결정

### 라우팅 스킵 (vs. 라우팅 호환)

- **결정**: Non-Gemini 프로바이더에서 라우팅을 완전히 스킵
- **근거**:
  1. 라우팅의 목적은 Gemini Pro ↔ Flash 선택 (Non-Gemini와 무관)
  2. 라우팅이 `baseLlmClient.generateJson()`을 호출하여 레거시 Gemini API 사용
  3. Non-Gemini에서 라우팅을 호환시키려면 baseLlmClient를 llm\* API로
     마이그레이션 필요 (범위 초과)
  4. 라우팅 스킵으로 에러와 불필요한 API 호출 동시 해결

### config.setModel(providerModel, true)

- **결정**: `setModel(model, isTemporary=true)`로 임시 모델 설정
- **근거**:
  1. `isTemporary=true`는 사용자 설정 파일에 영구 저장하지 않음
  2. `emitModelChanged()` 호출로 AppContainer 상태바 즉시 업데이트
  3. `getDisplayString()` default case가 비-Gemini 모델명을 그대로 표시
  4. 기존 `setModel()` 인프라 재사용으로 변경 최소화

## 관련 이슈 설명

### getDisplayString() 동작

```typescript
// config/models.ts
export function getDisplayString(model: string, previewFeaturesEnabled) {
  switch (model) {
    case 'auto':
      return 'Auto (Gemini 2.5)';
    case 'auto-preview':
      return 'Auto (Gemini 3)';
    // ... other Gemini aliases
    default:
      return model; // 'claude-3-5-sonnet-20241022' → as-is
  }
}
```

Non-Gemini 모델명은 `default` case로 fall-through하여 원본 모델명이 표시됨.

### ConsolePatcher 에러 캡처 메커니즘

```
debugLogger.error() → console.error() → ConsolePatcher intercepts
  → type='error' message → useConsoleMessages → errorCount
  → Footer.tsx "✖ N errors"
```

라우팅 스킵으로 `reportError()` → `debugLogger.error()` 호출 경로가 제거되어
ConsolePatcher에 type='error' 메시지가 전달되지 않음.
