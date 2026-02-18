# Phase 3 작업 결과서: GeminiClient.generateContent() 도구 호출 경로

**작업일**: 2026-02-19 **브랜치**: `v0.2.0/se_manager_agent` **Phase**: Phase 3
— Category C (GeminiClient.generateContent)

---

## 1. 작업 요약

### 목적

`web-fetch.ts`, `web-search.ts`, `summarizer.ts` 등이 호출하는
`GeminiClient.generateContent()`가 항상 레거시
`contentGenerator.generateContent()` (Gemini API)를 호출하여 non-Gemini
프로바이더에서 "Provider does not support legacy Gemini API" 에러가 발생하는
문제 해결.

### 핵심 구현

- `generateContent()` 진입 시 프로바이더 감지 → non-Gemini일 때
  `_generateContentNonGemini()` 경로 분기
- Gemini 전용 도구 가드: `web-fetch`, `web-fetch-fallback`, `web-search` → throw
  Error (환각 방지)
- `getResolvedConfig(modelConfigKey).model` → `resolveProviderModel()` 모델 해석
  체인 (config alias 안전 처리)
- `convertContentsToLlmMessages()` + `fixToolResultRoles()` + generation config
  적용
- `retryWithBackoff()` 적용 (Gemini 전용 콜백 미설정)
- `_convertLlmResponseToGeminiResponse()` 응답 변환

### 파급 효과

- **호출자 코드 변경: 0건** — web-fetch, web-search, summarizer 등 모든
  generateContent() 호출자가 자동으로 multi-provider 지원
- **web-fetch/web-search**: non-Gemini에서 명시적 에러 반환 (기존 catch 블록이
  error result 반환) → 환각 방지

---

## 2. 변경 파일

| 파일                       | 액션     | 변경량       |
| -------------------------- | -------- | ------------ |
| `core/client.ts`           | **수정** | +95줄 +리뷰  |
| `core/client.test.ts`      | **수정** | +175줄 +리뷰 |
| `tools/web-fetch.test.ts`  | **수정** | +리뷰        |
| `tools/web-search.test.ts` | **수정** | +리뷰        |

---

## 3. 구현 상세

### 3.1 client.ts 변경

#### import 추가

```typescript
import { fixToolResultRoles } from './llmMessageUtils.js';
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
} from '../providers/types.js';
import type { Part } from '@google/genai'; // 기존 import에 Part 추가
```

#### generateContent() 분기 로직

```typescript
const generator = this.getContentGeneratorOrFail();
const providerName = generator.providerName;
const isNonGemini = providerName != null && providerName !== 'gemini';

if (isNonGemini && isProviderIndependentGenerator(generator)) {
  return this._generateContentNonGemini(
    modelConfigKey,
    contents,
    abortSignal,
    providerName,
  );
}
// ... 기존 Gemini 경로 유지
```

#### 신규 private 메서드

1. **`_generateContentNonGemini()`**: Gemini 전용 도구 가드 + 모델 해석 + 메시지
   변환 + retryWithBackoff + 응답 변환
2. **`_convertLlmResponseToGeminiResponse()`**: LlmGenerateResponse →
   GenerateContentResponse 변환 (BaseLlmClient와 동일 — TODO: 공통 유틸리티
   추출)

#### Gemini 전용 도구 가드

```typescript
const GEMINI_ONLY_TOOLS: Record<string, string> = {
  'web-fetch': `URL context requires Gemini provider with urlContext capability. Not available for ${providerName}.`,
  'web-fetch-fallback': `URL context requires Gemini provider. Fallback to HTTP fetch. Not available for ${providerName}.`,
  'web-search': `Web search requires Gemini provider with googleSearch capability. Not available for ${providerName}. Do not retry this tool.`,
};
```

#### 모델 해석 체인

```
modelConfigKey.model (config alias, e.g. 'web-fetch')
  → getResolvedConfig(modelConfigKey) → resolvedConfig.model (e.g. 'gemini-2.5-flash')
    → resolveProviderModel(resolvedConfig.model, providerName) → provider model
```

### 3.2 테스트 추가 (10 tests)

| 테스트                            | 검증 항목                                                  |
| --------------------------------- | ---------------------------------------------------------- |
| C1: non-Gemini llmGenerateContent | llmGenerateContent 호출, legacy 미호출                     |
| C2: systemInstruction 포함        | LlmGenerateRequest.systemInstruction 존재                  |
| C3: retry                         | retryable LlmError 시 재시도 후 성공                       |
| C4: temperature/topP              | resolvedConfig의 temperature=0.5, topP=0.9 반영            |
| C5: fixToolResultRoles            | functionResponse → tool role 변환                          |
| C6: Gemini 회귀                   | 기존 legacy generateContent 경로 유지                      |
| C7: 모델 해석                     | config alias → resolvedConfig.model → resolveProviderModel |
| C8a: web-fetch throw              | non-Gemini web-fetch → throw (urlContext 없음)             |
| C8b: web-search throw             | non-Gemini web-search → throw (googleSearch 없음)          |
| C8c: 일반 modelConfigKey          | non-Gemini summarizer-default → 정상 llm\* 경로            |

---

## 4. 테스트 실행 결과

```
client.test.ts: 94 passed, 1 skipped (기존 84 + 신규 10)
web-fetch.test.ts: 31 passed (회귀 없음)
web-search.test.ts: 9 passed (회귀 없음)
agents/: 266 passed (회귀 없음)
baseLlmClient.test.ts: 43 passed (회귀 없음)
typecheck: 0 errors
lint: 0 errors
```

---

## 5. 완료 조건 달성 여부

| 검증 항목                                                                         | 상태                |
| --------------------------------------------------------------------------------- | ------------------- |
| RED: GeminiClient.generateContent non-Gemini + retry 테스트                       | ✅                  |
| RED: resolvedConfig.model 기반 모델 해석 테스트                                   | ✅                  |
| RED: non-Gemini web-fetch/web-search throw 에러 + 일반 modelConfigKey 통과 테스트 | ✅                  |
| GREEN: client.ts llm\* 직접 분기 + retryWithBackoff + 가드 + 테스트 통과          | ✅                  |
| REFACTOR: \_convertLlmResponseToGeminiResponse DRY 검토                           | ✅ (TODO 주석 추가) |
| Phase 3 커밋 완료                                                                 | ✅                  |
| 완료 조건 체크표시 + 작업 결과서 작성                                             | ✅                  |
| 리뷰 #1: retryWithBackoff signal 전달                                             | ✅                  |
| 리뷰 #2: non-Gemini mismatch guard 추가                                           | ✅                  |
| 리뷰 #3: web-fetch/web-search 도구 단위 테스트 추가                               | ✅                  |

---

## 6. 리뷰 반영 (3건)

### 리뷰 #1 [HIGH] — retryWithBackoff signal 미전달

**검증 결과**: 확인됨 — `_generateContentNonGemini()` line 1322:
`retryWithBackoff(apiCall, { authType })` — `signal: abortSignal` 누락. backoff
delay 중 취소 신호가 반영되지 않아 abort 후에도 재시도가 계속될 수 있음.

**수정 내용**:

- `retryWithBackoff()` 호출 시 `signal: abortSignal` 옵션 추가
- `retry.ts:147`에서 `signal.aborted` 체크 → 즉시 AbortError throw
- `retry.ts:273`에서 `delay(backoffTime, signal)` → abort 시 delay 즉시 중단

**테스트**: C9 — pre-abort 상태에서 `retryWithBackoff`가 signal.aborted 체크 후
즉시 AbortError throw, API 호출 0회 검증

### 리뷰 #2 [MEDIUM] — non-Gemini + llm\* 없는 비정상 wiring fail-fast 없음

**검증 결과**: 확인됨 — `generateContent()` line 1129-1139:
`isNonGemini && isProviderIndependentGenerator()` 분기만 존재.
`isNonGemini && !isProviderIndependentGenerator()` 시 Gemini legacy path로
fallthrough → 결국 "Provider does not support legacy Gemini API" 에러 발생.
`sendMessageStream()` (line 651)에는 동일 가드가 있으나 `generateContent()`에는
누락.

**수정 내용**:

- non-Gemini llm\* 분기와 Gemini legacy path 사이에 mismatch guard 추가
- `throw new Error(...)` — sendMessageStream의 yield 에러 이벤트와 달리 throw
  방식 사용 (generateContent는 Promise 반환 함수이므로 throw가 자연스러움)
- 에러 메시지에 "This is a configuration error." 문구 추가 — 디버깅 용이성

**테스트**: C10 — llm\* 메서드 없는 non-Gemini generator 생성 후
`generateContent()` 호출 시 `requires llm* methods` 에러 검증

### 리뷰 #3 [LOW] — web-fetch/web-search 도구 단위 테스트 공백

**검증 결과**: 확인됨 — web-fetch.test.ts와 web-search.test.ts에 non-Gemini
guard 에러 전파 경로에 대한 직접 테스트 없음. 기존 에러 테스트(API error, fetch
failed)는 일반 에러만 검증.

**수정 내용**:

- `web-fetch.test.ts`: non-Gemini urlContext guard 에러 메시지로
  `mockGenerateContent.mockRejectedValue()` → `WEB_FETCH_PROCESSING_ERROR` 타입
  - `urlContext` 메시지 포함 검증
- `web-search.test.ts`: non-Gemini googleSearch guard 에러 메시지로
  `mockGeminiClient.generateContent.mockRejectedValue()` → `WEB_SEARCH_FAILED`
  타입 + `googleSearch` 메시지 포함 검증

---

## 7. 리뷰 반영 후 테스트 결과

```
client.test.ts: 96 passed, 1 skipped (기존 84 + Phase 3 10 + 리뷰 2)
web-fetch.test.ts: 32 passed (기존 31 + 리뷰 1)
web-search.test.ts: 10 passed (기존 9 + 리뷰 1)
agents/ 전체: 214 passed (회귀 없음)
typecheck: 0 errors
lint: 0 errors
```

---

## 8. Phase 4 전달사항

### 재사용 가능 유틸리티

- `_convertLlmResponseToGeminiResponse()`: baseLlmClient.ts와 동일 — 향후
  typeConversion.ts로 공통 추출 대상

### 주의사항

- `_generateContentNonGemini()`는 availability context
  (`getAvailabilityContext`, `onPersistent429`, `onValidationRequired`)를
  사용하지 않음 — non-Gemini 프로바이더는 Gemini availability 서비스 대상이 아님
- web-fetch `executeFallback()` 미발동: throw 방식은 web-fetch.ts catch(382) →
  error result 반환. HTTP fallback 원하면 web-fetch.ts에 non-Gemini 가드 2줄
  추가 필요 (선택적, TASK-C02)
- web-search 에러 메시지에 "Do not retry this tool" 문구 포함 — model 학습 유도
  (반복 호출 억제)
- config alias (`'web-fetch'`, `'loop-detection'` 등)는 절대
  resolveProviderModel()에 직접 전달하지 말 것 — 항상
  `getResolvedConfig(modelConfigKey).model`로 해석 후 전달
