# M3.4.A 추가 수정 — Non-Gemini 상태바 + 라우팅 에러 해결

- **작업일**: 2026-02-10
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료

## 문제 현상

`LLM_PROVIDER=claude`로 실행 시 CLI 상태바에 두 가지 이슈 발생:

1. **모델 표시 오류**: "Auto (Gemini 2.5) /model" — Claude 사용 중인데 Gemini
   모델 표시
2. **에러 표시**: "✖ N errors" — 레거시 Gemini API 호출이 throw하면서 발생하는
   에러

## 원인 분석

### 1차 원인 (커밋 24d972d)

#### 모델 표시 — 라우팅 후 모델 설정

```
processTurn() line 670 → router.route() → modelToUse 결정
  → non-Gemini check (line 688) → resolveProviderModel() → 모델 해석 완료
  → BUT config.setModel() 미호출 → 상태바 업데이트 없음
Footer.tsx → getDisplayString(config.getModel()) → getDisplayString('auto') → "Auto (Gemini 2.5)"
```

**원인**: `processTurn()` 내 non-Gemini 체크가 라우팅 이후에 위치. 라우팅 자체가
레거시 API를 사용하여 non-Gemini에서 throw하고, `config.setModel()`이 호출되지
않아 상태바가 초기값 'auto'를 유지.

#### 에러 — 라우팅 레거시 API throw (✖ 3 errors → ✖ 1 error)

```
processTurn() → router.route(routingContext)
  → CompositeStrategy → ClassifierStrategy.route()
    → baseLlmClient.generateJson() → _generateWithRetry()
      → contentGenerator.generateContent() [LEGACY] → throw
    → _generateWithRetry catch → reportError()
      → debugLogger.error() → console.error() → ConsolePatcher → errorCount++
```

### 2차 원인 (커밋 이번)

1차 수정 후에도 "Auto (Gemini 2.5)" + "✖ 1 error" 잔존:

#### 모델 표시 — 초기화 시 모델 미설정

```
config.initialize() → createContentGenerator()
  → selectProvider() → selection.type = 'claude'
  → wrapAdapterAsGenerator(adapter) → return
  → config.model = 'auto' (변경 안 됨!)

AppContainer mount → useState(config.getModel()) → 'auto' → "Auto (Gemini 2.5)"
```

**원인**: `createContentGenerator()`에서 non-Gemini 프로바이더를 생성하면서
`config.setModel()`을 호출하지 않음. 모델 설정은 `processTurn()` 내에서만
이루어지므로, 사용자가 메시지를 보내기 전까지 상태바가 업데이트되지 않음.

#### 에러 — 배경 세션 요약 생성 (✖ 1 error)

```
AppContainer useEffect → generateSummary(config) [fire-and-forget]
  → sessionSummaryUtils.generateAndSaveSummary()
    → new BaseLlmClient(contentGenerator, config)
    → baseLlmClient.generateContent() → _generateWithRetry()
      → contentGenerator.generateContent() [LEGACY] → throw
    → _generateWithRetry catch → reportError()
      → debugLogger.error() → console.error() → ConsolePatcher → errorCount++
```

**원인**: CLI 시작 시 이전 세션 요약을 생성하는 `generateSummary()`가
`baseLlmClient.generateContent()`를 호출. 이 메서드는 레거시 Gemini
`generateContent()`를 사용하여 non-Gemini 프로바이더에서 throw.

## 해결 방법

### 1차 수정 (커밋 24d972d): Non-Gemini 감지를 라우팅 이전으로 이동

**`client.ts`**: `processTurn()` 내 non-Gemini 체크를 라우팅 전으로 이동 +
`config.setModel(providerModel, true)` 호출.

```typescript
// processTurn() 내부 — 라우팅 전에 non-Gemini 체크
const generator = this.getContentGeneratorOrFail();
if (
  isProviderIndependentGenerator(generator) &&
  generator.providerName !== 'gemini'
) {
  const providerModel = resolveProviderModel(
    this.config.getModel(),
    generator.providerName!,
  );
  this.config.setModel(providerModel, true);
  // ... processLlmTurn()
}
// Gemini path: routing runs only for Gemini providers
```

### 2차 수정 (이번 커밋): 초기화 시 모델 설정 + 요약 생성 스킵

#### A. `contentGenerator.ts` — 초기화 시 모델 해석 및 설정

```typescript
if (selection.type !== ProviderType.Gemini) {
  // ... adapter 생성 ...

  // Resolve provider-appropriate model and update config for status bar.
  const providerModel = resolveProviderModel(
    gcConfig.getModel(),
    selection.type,
  );
  gcConfig.setModel(providerModel, true);

  return new LoggingContentGenerator(wrapAdapterAsGenerator(adapter), gcConfig);
}
```

**이벤트 타이밍 분석**:

```
React render → useState(config.getModel()) = 'auto' → initial render
  ↓ (after paint)
useEffect #1 → config.initialize() → createContentGenerator() → setModel()
  → emitModelChanged() [비동기 완료 시점]
useEffect #3 → coreEvents.on(ModelChanged, handler) [동기 구독]
```

React `useEffect`는 렌더 후 순서대로 실행되나, useEffect #1 내부의
`config.initialize()`는 비동기(`await`). 따라서:

1. useEffect #1: `config.initialize()` 시작 (async)
2. useEffect #3: `coreEvents.on(ModelChanged)` 구독 (sync)
3. `config.initialize()` 완료 → `setModel()` → `emitModelChanged()`
4. 구독된 핸들러가 `setCurrentModel(config.getModel())` 호출 → 상태바 업데이트

#### B. `sessionSummaryUtils.ts` — Non-Gemini 프로바이더 요약 생성 스킵

```typescript
const contentGenerator = config.getContentGenerator();
if (!contentGenerator) {
  return;
}

// Skip for non-Gemini — BaseLlmClient uses legacy generateContent()
if (
  contentGenerator.providerName &&
  contentGenerator.providerName !== 'gemini'
) {
  debugLogger.debug(
    `[SessionSummary] Non-Gemini provider (${contentGenerator.providerName}), skipping`,
  );
  return;
}
```

## 해결 효과

| 이슈             | 1차 수정 전         | 1차 수정 후        | 2차 수정 후             |
| ---------------- | ------------------- | ------------------ | ----------------------- |
| 상태바 모델 표시 | "Auto (Gemini 2.5)" | 메시지 후 업데이트 | 초기화 시 즉시 업데이트 |
| 에러 카운트      | ✖ 3 errors         | ✖ 1 error         | ✖ 0 errors             |
| 라우팅 호출      | Non-Gemini에서 실행 | Gemini에서만 실행  | (동일)                  |
| 세션 요약        | throw → reportError | (동일)             | Non-Gemini 스킵         |

## 변경 파일

### 1차 커밋 (24d972d)

| 파일                  | 변경 내용                                                             |
| --------------------- | --------------------------------------------------------------------- |
| `core/client.ts`      | Non-Gemini 감지를 라우팅 전으로 이동 + `config.setModel()` 호출 추가  |
| `core/client.test.ts` | 테스트 기대값 업데이트 + 라우팅 미호출/setModel 호출 검증 테스트 추가 |

### 2차 커밋 (이번)

| 파일                                          | 변경 내용                                             |
| --------------------------------------------- | ----------------------------------------------------- |
| `core/contentGenerator.ts`                    | 초기화 시 resolveProviderModel → config.setModel 호출 |
| `core/contentGenerator.multiProvider.test.ts` | Mock config에 setModel 추가                           |
| `services/sessionSummaryUtils.ts`             | Non-Gemini 프로바이더 시 요약 생성 스킵               |

## 테스트

### 1차 신규 테스트 2건 (client.test.ts)

| 테스트                                            | 검증 내용                                        |
| ------------------------------------------------- | ------------------------------------------------ |
| should skip routing for non-Gemini providers      | `mockRouterService.route` NOT called             |
| should update config model for status bar display | `config.setModel(providerModel, true)` 호출 확인 |

### 2차 기존 테스트 수정 1건 (contentGenerator.multiProvider.test.ts)

| 테스트                  | 변경                                               |
| ----------------------- | -------------------------------------------------- |
| createMockConfig helper | `setModel: vi.fn()` 추가 (7개 non-Gemini 시나리오) |

## Quality Gate

| 항목                    | 결과                     |
| ----------------------- | ------------------------ |
| TypeCheck               | ✅ PASS                  |
| ESLint                  | ✅ PASS                  |
| Client 테스트           | ✅ 80 passed (1 skipped) |
| contentGenerator 테스트 | ✅ 14 passed             |
| Services 테스트         | ✅ 321 passed            |
| Provider 회귀           | ✅ 37 files / 758 passed |

## 설계 결정

### 초기화 시 모델 설정 (vs. processTurn에서만 설정)

- **결정**: `createContentGenerator()` 내에서 `config.setModel()` 호출
- **근거**:
  1. 상태바는 컴포넌트 마운트 시 `useState(config.getModel())`로 초기화
  2. `processTurn()`은 사용자 메시지 전송 시에만 실행
  3. 초기화 시 모델을 설정하면 CLI 시작 즉시 올바른 모델 표시
  4. React useEffect 비동기 실행 타이밍으로 이벤트 구독이 선행 보장

### 세션 요약 스킵 (vs. llm\* API 사용)

- **결정**: Non-Gemini 프로바이더에서 세션 요약 생성을 완전히 스킵
- **근거**:
  1. `BaseLlmClient.generateContent()`가 레거시 Gemini API 사용 (구조적 한계)
  2. llm\* API를 사용하도록 변환하려면 `BaseLlmClient` 전체 마이그레이션 필요
  3. 세션 요약은 UI 편의 기능이며 핵심 기능 아님
  4. 스킵으로 `reportError` → `console.error` 경로 완전 차단

### providerName 체크 (vs. isProviderIndependentGenerator)

- **결정**: `sessionSummaryUtils`에서 `contentGenerator.providerName` 간단 체크
  사용
- **근거**:
  1. `providerName`은 `wrapAdapterAsGenerator`가 설정하는 필드
  2. 네이티브 Gemini 경로에서는 `providerName`이 undefined → 조건 false → 요약
     진행
  3. `isProviderIndependentGenerator` import 불필요 → 의존성 최소화
