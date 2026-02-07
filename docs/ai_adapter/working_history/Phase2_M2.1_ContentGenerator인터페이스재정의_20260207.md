# Phase 2: M2.1 ContentGenerator 인터페이스 재정의 작업 결과서

> 📅 **작업일**: 2026-02-07 📚 **Phase**: Phase 2 - M2.1 🎯 **목표**: 핵심
> 경로에서 `@google/genai` 타입 분리 🔄 **리뷰 반영**: 2026-02-07 (코드 기반
> 리뷰 및 수정) 🔄 **2차 리뷰 반영**: 2026-02-07 (생성자 의존성 제한사항 문서화
> 및 TODO 추가)

---

## 📋 작업 요약

### 완료된 작업 (2.1.1) ✅

| 항목                                      | 상태 | 비고                                     |
| ----------------------------------------- | :--: | ---------------------------------------- |
| 현재 ContentGenerator 시그니처 분석       |  ✅  | @google/genai 타입 직접 사용 확인        |
| providers/types.ts ContentGenerator 확인  |  ✅  | 프로바이더 독립적 인터페이스 이미 정의됨 |
| GeminiContentGenerator로 rename           |  ✅  | 레거시 호환성 유지                       |
| ContentGenerator 레거시 별칭 유지         |  ✅  | 기존 코드 호환성 100%                    |
| createContentGenerator 반환 타입 업데이트 |  ✅  | GeminiContentGenerator 반환              |

### 부분 완료 (2.1.2) ⏸️

| 항목                 | 상태 | 비고                           |
| -------------------- | :--: | ------------------------------ |
| 팩토리 로직 분석     |  ✅  | Gemini 전용 확인               |
| ProviderFactory 분석 |  ✅  | BaseAdapter 반환               |
| ProviderFactory 연동 |  ⏸️  | M2.2에서 GeminiAdapter 구현 후 |
| 기능 플래그 분기     |  ⏸️  | M2.2 이후                      |

### 완료된 작업 (2.1.3) ✅

| 항목                                      | 상태 | 비고                                 |
| ----------------------------------------- | :--: | ------------------------------------ |
| 현재 baseLlmClient.ts 분석                |  ✅  | @google/genai 타입 의존성 확인       |
| LlmGenerateJsonOptions 인터페이스 정의    |  ✅  | LlmMessage[] 기반                    |
| LlmGenerateContentOptions 인터페이스 정의 |  ✅  | LlmMessage[] 기반                    |
| 레거시 별칭 @deprecated 표시              |  ✅  | 기존 코드 호환성 100%                |
| **메서드 로직에 신규 타입 연결**          |  ✅  | 오버로딩 구현 및 변환 로직 적용 완료 |

### 완료된 작업 (2.1.4) ✅

| 항목                                       | 상태 | 비고                                             |
| ------------------------------------------ | :--: | ------------------------------------------------ |
| retry.ts Gemini 의존성 분석                |  ✅  | GenerateContentResponse, ApiError 등 확인        |
| RetryOptions 제네릭 전환                   |  ✅  | `RetryOptions<T>`, shouldRetryOnContent 제네릭화 |
| isRetryableError에 LlmError 우선 체크 추가 |  ✅  | isLlmError → isRetryable 사용                    |
| LlmError 기반 재시도 경로 추가             |  ✅  | retryAfterMs, onTerminalError 지원               |
| classifyError 콜백 추가                    |  ✅  | 프로바이더별 에러 분류 콜백                      |
| 기존 Google 에러 경로 보존                 |  ✅  | classifyGoogleError 레거시 경로 유지             |
| onPersistent429 @deprecated 표시           |  ✅  | onTerminalError로 대체 권장                      |
| TDD 테스트 12개 작성 및 통과               |  ✅  | retry_llm_error.test.ts                          |
| 기존 retry 테스트 30개 호환성 확인         |  ✅  | 하위 호환성 100%                                 |

---

## 🔍 리뷰 결과 (2026-02-07)

### 발견된 문제점 및 해결

| 문제                        | 원인                                                                                        | 해결                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| TypeScript 유니온 타입 에러 | `GenerateJsonOptions \| LlmGenerateJsonOptions`에서 `contents` 접근 시 타입 에러            | 테스트 파일에 타입 단언(`as GenerateJsonOptions`) 추가     |
| system role 처리 누락       | `convertLlmMessagesToContents`에서 system role이 그대로 전달됨 (Gemini는 user/model만 허용) | system role 메시지 필터링 추가                             |
| 테스트 커버리지 부족        | tool_call, tool_result, thought, system role 테스트 없음                                    | 5개 테스트 케이스 추가 (총 9개 → 14개 예정, 현재 9개 통과) |

### 수정된 파일

| 파일                                                     | 변경 내용                                           |
| -------------------------------------------------------- | --------------------------------------------------- |
| `core/baseLlmClient.ts`                                  | system role 필터링 추가, 주석 보강                  |
| `core/baseLlmClient_new_types.test.ts`                   | 미사용 import 제거, tool/thought/system 테스트 추가 |
| `routing/strategies/classifierStrategy.test.ts`          | 타입 단언 추가                                      |
| `routing/strategies/numericalClassifierStrategy.test.ts` | 타입 단언 추가                                      |
| `services/chatCompressionService.test.ts`                | 타입 단언 추가                                      |
| `services/loopDetectionService.test.ts`                  | 타입 단언 추가                                      |
| `providers/baseAdapter.test.ts`                          | override modifier 추가 (M2.2 관련)                  |
| `providers/streamAssembler.test.ts`                      | finishReason 타입 수정 (M2.2 관련)                  |

---

## 🔍 추가 리뷰 이슈 검증 (2026-02-07, 2차 검증 완료)

### 검증 요청된 이슈 3건

| 이슈                         | 검증 결과                       | 2차 검증  | 조치             |
| ---------------------------- | ------------------------------- | --------- | ---------------- |
| 신규 Llm 옵션 실사용 여부    | ✅ **확인됨**                   | ✅ 재확인 | 없음             |
| 주입 타입 Gemini 전용 의존성 | ✅ **확인됨 (의도된 제한사항)** | ✅ 재확인 | TODO 코멘트 추가 |
| 이중 API 표면 혼란           | ✅ **@deprecated로 완화**       | ✅ 재확인 | 없음             |

### 1. 신규 Llm 옵션 실사용 확인 ✅

**결론: 신규 타입이 Union 타입 + 타입 가드 + 변환 로직을 통해 실제 경로에서
사용됨**

**코드 근거:**

- `baseLlmClient.ts:166-231`: `convertLlmMessagesToContents()` 함수가
  `LlmMessage[]` → `Content[]` 변환
- `baseLlmClient.ts:236-239`: `isLlmGenerateJsonOptions()` 타입 가드로 분기
- `baseLlmClient.ts:245-249`: `isLlmGenerateContentOptions()` 타입 가드로 분기
- `baseLlmClient.ts:265-266`:
  `generateJson(options: GenerateJsonOptions | LlmGenerateJsonOptions)`
- `baseLlmClient.ts:373-375`:
  `generateContent(options: GenerateContentOptions | LlmGenerateContentOptions)`
- `baseLlmClient_new_types.test.ts`: 9개 테스트가 새 타입 경로 검증

### 2. 생성자 의존성: Gemini 전용 ContentGenerator ⚠️

**결론: 확인된 구조적 제한사항 → M2.3 GeminiAdapter 연동 시 해소**

**의존성 구조:**

```
baseLlmClient.ts:16  →  import { ContentGenerator } from './contentGenerator.js'
                         ↓
contentGenerator.ts:59 →  type ContentGenerator = GeminiContentGenerator
                         ↓
contentGenerator.ts:35 →  interface GeminiContentGenerator {
                            generateContent(request: GenerateContentParameters, ...)
                            ...  ← @google/genai 타입 직접 사용
                          }
```

**프로바이더 독립 ContentGenerator와의 차이:**

```
providers/types.ts:364 →  interface ContentGenerator {
                            generateContent(request: LlmGenerateRequest, ...)
                            ...  ← 프로바이더 독립 타입 사용
                          }
```

**현재 상태:**

- `BaseLlmClient` 생성자가 `core/contentGenerator.ts`의 Gemini 전용
  `ContentGenerator`에 묶여 있어 `providers/types.ts`의 프로바이더 독립
  `ContentGenerator`를 주입할 수 없는 구조
- 내부 메서드 `_generateWithRetry()`가 `GenerateContentParameters`(Gemini
  전용)로 API 호출 → 생성자 타입만 변경하면 내부 로직도 함께 수정 필요

**2차 리뷰 조치:**

- `baseLlmClient.ts:16-17`: TODO(M2.2) 코멘트 추가
- `baseLlmClient.ts:254-257`: 클래스 JSDoc에 의존성 제한사항 명시
- 해결 시점: M2.3 `GeminiAdapter` 구현 시 생성자가 프로바이더 독립 인터페이스를
  받도록 리팩토링

### 3. @deprecated 주석으로 이중 API 표면 완화 ✅

**결론: 모든 레거시 타입에 @deprecated 주석 존재 확인**

- `baseLlmClient.ts:36`: `@deprecated Use LlmGenerateJsonOptions for new code.`
- `baseLlmClient.ts:93`:
  `@deprecated Use LlmGenerateContentOptions for new code.`
- `contentGenerator.ts:32`:
  `@deprecated For new multi-provider code, use ContentGenerator from '../providers/types.js'`
- `contentGenerator.ts:56`:
  `@deprecated Use GeminiContentGenerator for Gemini-specific code`

**마이그레이션 전략:** 구형/신형 타입 공존(backward compatibility) → 점진적
마이그레이션 후 구형 제거

---

## ⚠️ 알려진 제한사항

| 이슈                             | 현재 상태                                                                                               | 해결 시점                     | 코드 위치                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------- |
| BaseLlmClient 생성자 Gemini 의존 | `core/contentGenerator.ts`의 `ContentGenerator` 주입 → `providers/types.ts`의 독립 인터페이스 주입 불가 | **M2.3** (GeminiAdapter 구현) | `baseLlmClient.ts:16, 258` |
| 내부 API 호출 Gemini 전용        | `_generateWithRetry()`가 `GenerateContentParameters`로 직접 호출                                        | **M2.3** (어댑터 캡슐화)      | `baseLlmClient.ts:462-467` |
| 이중 옵션 정의                   | 구형(`GenerateJsonOptions`)/신형(`LlmGenerateJsonOptions`) 타입 공존                                    | 전체 마이그레이션 후          | `baseLlmClient.ts:40, 68`  |
| system role 메시지 병합 미구현   | system role은 필터링만 됨 (systemInstruction과 병합 안됨)                                               | 필요 시                       | `baseLlmClient.ts:168`     |

**생성자 의존성 해소 경로:**

```
M2.1.3 (현재) → M2.3 GeminiAdapter 구현 → BaseLlmClient 생성자 리팩토링
  ✅ 메서드 레벨 타입 전환      어댑터가 Gemini 전용 로직 캡슐화     생성자가 providers/types.ts의
  ✅ 변환 로직 구현               → 프로바이더 독립 인터페이스 반환      ContentGenerator 수용
  ✅ @deprecated 표시
  ⚠️ 생성자는 여전히 Gemini 전용
```

---

## 📁 파일 변경 사항

### 수정 파일

| 파일                                   | 변경 내용                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `core/contentGenerator.ts`             | `GeminiContentGenerator` 인터페이스 생성, `ContentGenerator` 별칭                   |
| `core/baseLlmClient.ts`                | `LlmGenerate*Options` 추가, `convertLlmMessagesToContents` 구현, system role 필터링 |
| `core/baseLlmClient_new_types.test.ts` | 9개 테스트 (tool, thought, system 테스트 추가)                                      |
| `routing/strategies/*.test.ts`         | 타입 단언 추가 (2개 파일)                                                           |
| `services/*.test.ts`                   | 타입 단언 추가 (2개 파일)                                                           |
| `providers/baseAdapter.test.ts`        | override modifier 추가 (M2.2 관련)                                                  |
| `providers/streamAssembler.test.ts`    | finishReason 타입 수정 (M2.2 관련)                                                  |
| `utils/retry.ts`                       | LlmError 기반 재시도 로직, 제네릭 T, classifyError/onTerminalError 콜백 (M2.1.4)    |
| `utils/retry_llm_error.test.ts`        | 신규 LlmError 재시도 테스트 12개 (M2.1.4)                                           |

---

## ✅ 테스트 결과

```
baseLlmClient 관련 테스트:
Test Files  2 passed (2)
     Tests  38 passed (38)

신규 타입 테스트 (baseLlmClient_new_types.test.ts):
- generateJson (New Type) - 1 test
- generateContent (New Type) - 1 test
- Image Handling - 2 tests
- Tool Handling - 3 tests
- Thought Handling - 1 test
- System Role Handling - 1 test
```

TypeScript 컴파일: ✅ 에러 없음

---

## 🏗️ 구현된 변환 로직

### convertLlmMessagesToContents 함수

```typescript
function convertLlmMessagesToContents(messages: LlmMessage[]): Content[] {
  return messages
    .filter((msg) => msg.role !== 'system') // System messages filtered
    .map((msg) => {
      const parts = msg.content.map((content) => {
        // text, image (base64/url), tool_call, tool_result, thought 처리
      });

      // Role 매핑: assistant → model, tool → user, user → user
      const role =
        msg.role === 'assistant'
          ? 'model'
          : msg.role === 'tool'
            ? 'user'
            : 'user';

      return { role, parts };
    });
}
```

### 지원되는 콘텐츠 타입

| LlmContent Type | Gemini Part Type                         |
| --------------- | ---------------------------------------- |
| text            | { text: string }                         |
| image (base64)  | { inlineData: { mimeType, data } }       |
| image (url)     | { fileData: { mimeType, fileUri } }      |
| tool_call       | { functionCall: { name, args } }         |
| tool_result     | { functionResponse: { name, response } } |
| thought         | { text: "[Thought] ..." }                |

---

## 🏗️ M2.1.4 Retry 로직 리팩토링 상세

### 제거된 Gemini 의존성

| 변경 전                                                   | 변경 후                        |
| --------------------------------------------------------- | ------------------------------ |
| `import type { GenerateContentResponse }` (retry.ts)      | 제거 (제네릭 T로 대체)         |
| `shouldRetryOnContent(result as GenerateContentResponse)` | `shouldRetryOnContent(result)` |

### 추가된 프로바이더 독립 필드 (RetryOptions)

```typescript
export interface RetryOptions<T = unknown> {
  // 기존 필드 유지...
  shouldRetryOnContent?: (content: T) => boolean;        // GenerateContentResponse → T
  /** @deprecated Use onTerminalError */
  onPersistent429?: (...) => Promise<...>;               // 레거시 유지
  onTerminalError?: (authType?, error?) => Promise<...>; // NEW: 프로바이더 독립
  classifyError?: (error: unknown) => unknown;           // NEW: 커스텀 에러 분류
}
```

### Catch 블록 에러 처리 흐름

```
catch (error)
  │
  ├─ AbortError → throw (기존)
  │
  ├─ classifyError 콜백 → processedError 생성
  │
  ├─ isLlmError(processedError)? ──── NEW PATH
  │   ├─ isRetryable=false → onTerminalError → throw
  │   ├─ attempt >= maxAttempts → onTerminalError → throw
  │   └─ retryAfterMs? → delay(retryAfterMs)
  │       └─ else → exponential backoff
  │
  ├─ !classifyErrorFn? ──── Legacy Google path (classifyError 미제공 시에만 실행)
  │   ├─ classifyGoogleError(error)
  │   ├─ TerminalQuotaError → onPersistent429
  │   ├─ ValidationRequiredError → onValidationRequired
  │   └─ RetryableQuotaError/5xx → backoff
  │
  └─ Generic retry (shouldRetryOnError → backoff or throw)
```

> **리뷰 반영 (2026-02-07)**: `classifyErrorFn`이 제공된 경우 레거시 Google
> 경로를 건너뛰도록 수정. 비-Google 프로바이더의 에러(예: Claude 429)가
> `classifyGoogleError`에 의해 `RetryableQuotaError`로 잘못 분류되는 문제 방지.

### isRetryableError 변경

```typescript
export function isRetryableError(error, retryFetchErrors?): boolean {
  // NEW: LlmError 우선 체크
  if (isLlmError(error)) {
    return error.isRetryable;
  }
  // 기존 로직 유지: network codes, fetch errors, ApiError, status codes
}
```

### 테스트 커버리지 (retry_llm_error.test.ts)

| #   | 테스트                                     | 검증 내용                    |
| --- | ------------------------------------------ | ---------------------------- |
| 1   | LlmError isRetryable=true → 재시도         | exponential backoff 경로     |
| 2   | LlmError isRetryable=false → 즉시 throw    | AuthenticationError 처리     |
| 3   | RateLimitError + retryAfterMs → 지정 대기  | setTimeout(fn, 15000) 검증   |
| 4   | RateLimitError max exhausted → onTerminal  | 폴백 콜백 + 재시도           |
| 5   | NetworkError → 재시도                      | isRetryable=true 경로        |
| 6   | classifyError 콜백 사용                    | 커스텀 분류기 → retryAfterMs |
| 7   | classifyError 미제공 → classifyGoogleError | 429 하위 호환성              |
| 8   | isRetryableError: LlmError true            | RateLimitError               |
| 9   | isRetryableError: LlmError false           | AuthenticationError          |
| 10  | isRetryableError: non-LlmError 500         | 기존 status 체크 경로        |
| 11  | Generic shouldRetryOnContent\<T\>          | CustomResponse (GCR 없이)    |
| 12  | onTerminalError: non-retryable LlmError    | MODEL_NOT_FOUND → 폴백       |

---

---

## 🔗 M2.1.5 Hook 시스템 타입 전환 (2026-02-07)

### 완료된 작업 (2.1.5.1~2.1.5.4) ✅

| 항목                                                              | 상태 | 비고                                   |
| ----------------------------------------------------------------- | :--: | -------------------------------------- |
| 2.1.5.1 Hook 시스템 분석                                          |  ✅  | 4개 파일의 @google/genai 의존성 매핑   |
| 2.1.5.2 Hook 이벤트 타입 전환 (hookAggregator, types, hookSystem) |  ✅  | Union 타입 + 신규 메서드 + @deprecated |
| 2.1.5.3 Hook 컨텍스트 타입 전환 (hookEventHandler)                |  ✅  | V2 fire 메서드 3개 추가                |
| 2.1.5.4 기존 Hook 호환성 테스트                                   |  ✅  | 155/155 전체 통과                      |

### 핵심 발견

Hook 시스템에는 이미 `hookTranslator.ts`가 의도적인 브릿지 레이어로 존재하며,
`LLMRequest`/`LLMResponse`/`HookToolConfig`라는 프로바이더 독립 타입을 정의하고
있었다. 훅 입력(BeforeModelInput 등)은 이미 이 독립 타입을 사용하지만,
**출력(result) 인터페이스와 fire 메서드 시그니처**가 여전히 Gemini SDK 타입을
직접 노출하고 있어 이를 전환했다.

### 🔴 Red Phase

**테스트 파일**: `hooks/hookSystem_new_types.test.ts` (14개 테스트)

| #     | 테스트                                            | 검증 내용                                                            |
| ----- | ------------------------------------------------- | -------------------------------------------------------------------- |
| 1     | hookAggregator string literal compatibility       | `FunctionCallingConfigMode` enum 없이 `'NONE'`/`'ANY'`/`'AUTO'` 동작 |
| 2-3   | BeforeModelHookOutput.getSyntheticLLMResponse()   | LLMResponse 직접 반환 + undefined 처리                               |
| 4-5   | AfterModelHookOutput.getModifiedLLMResponse()     | LLMResponse 직접 반환 + undefined 처리                               |
| 6-7   | BeforeToolSelectionHookOutput.getHookToolConfig() | HookToolConfig 직접 반환 + undefined 처리                            |
| 8-9   | applyLLMRequestModifications with LLMRequest      | LLMRequest 입력 처리 + DefaultHookOutput passthrough                 |
| 10-12 | hookEventHandler V2 methods                       | V2 fire 메서드 3개 프로토타입 존재 확인                              |
| 13-14 | Legacy compatibility                              | GenerateContentParameters/toolConfig 레거시 호환                     |

초기 결과: 10 failed, 4 passed → 레거시 호환 테스트만 통과

### 🟢 Green Phase

#### 1. `hookAggregator.ts` — `FunctionCallingConfigMode` 제거

| 변경 전                                                     | 변경 후                                    |
| ----------------------------------------------------------- | ------------------------------------------ |
| `import { FunctionCallingConfigMode } from '@google/genai'` | import 제거                                |
| `let finalMode: FunctionCallingConfigMode`                  | `let finalMode: 'NONE' \| 'ANY' \| 'AUTO'` |
| `FunctionCallingConfigMode.NONE/ANY/AUTO`                   | `'NONE'`/`'ANY'`/`'AUTO'` 문자열 리터럴    |

#### 2. `types.ts` — Union 타입 + 신규 메서드

- `isGenerateContentParameters` 타입 가드 추가 (`'contents' in obj`)
- `DefaultHookOutput.applyLLMRequestModifications`:
  `GenerateContentParameters | LLMRequest` Union 타입
- `BeforeModelHookOutput`: `getSyntheticResponse()` @deprecated → **신규**
  `getSyntheticLLMResponse()`
- `AfterModelHookOutput`: `getModifiedResponse()` @deprecated → **신규**
  `getModifiedLLMResponse()`
- `BeforeToolSelectionHookOutput`: **신규** `getHookToolConfig()`

#### 3. `hookEventHandler.ts` — V2 메서드 3개

기존 fire 메서드 @deprecated. V2는 `hookTranslator` 변환 없이 LLMRequest 직접
사용:

```typescript
async fireBeforeModelEventV2(llmRequest: LLMRequest): Promise<AggregatedHookResult>
async fireAfterModelEventV2(llmRequest: LLMRequest, llmResponse: LLMResponse): Promise<AggregatedHookResult>
async fireBeforeToolSelectionEventV2(llmRequest: LLMRequest): Promise<AggregatedHookResult>
```

#### 4. `hookSystem.ts` — Result 인터페이스 + Fire 메서드

Result 인터페이스에 프로바이더 독립 필드 추가:

| 인터페이스                      | 신규 필드                                                       |
| ------------------------------- | --------------------------------------------------------------- |
| `BeforeModelHookResult`         | `syntheticLLMResponse`, `modifiedLLMConfig`, `modifiedMessages` |
| `AfterModelHookResult`          | `llmResponse`                                                   |
| `BeforeToolSelectionHookResult` | `hookToolConfig`                                                |

Fire 메서드: `const isLegacy = 'contents' in llmRequest`로 분기 → Legacy
path(기존) vs New path(V2)

### 타입 흐름

```
Legacy Path (GenerateContentParameters)
  → hookEventHandler.fire*Event() [@deprecated]
    → hookTranslator.toHookLLMRequest() 변환

New Path (LLMRequest)
  → hookEventHandler.fire*EventV2() [신규]
    → LLMRequest 직접 사용 (변환 없음)
```

### 이슈 및 해결

| 이슈                                    | 원인                                      | 해결                                     |
| --------------------------------------- | ----------------------------------------- | ---------------------------------------- |
| Config 생성자 `/tmp/test` 에러          | Config가 유효 디렉토리 검증               | 통합 테스트 → 단위 테스트로 전환         |
| `BeforeToolSelectionOutput` 타입 불일치 | `Record<string, unknown>` 인덱스 시그니처 | `as BeforeToolSelectionOutput` 타입 단언 |

### 수정/생성 파일

| 파일                                 | 변경 내용                                                     |
| ------------------------------------ | ------------------------------------------------------------- |
| `hooks/hookAggregator.ts`            | `FunctionCallingConfigMode` import 제거, string 리터럴 대체   |
| `hooks/types.ts`                     | 타입 가드, Union 타입 apply, 신규 get 메서드 3개, @deprecated |
| `hooks/hookEventHandler.ts`          | V2 fire 메서드 3개 추가, 기존 @deprecated                     |
| `hooks/hookSystem.ts`                | Result 인터페이스 확장, fire 메서드 Union 시그니처            |
| `hooks/hookSystem_new_types.test.ts` | **신규** — 14개 테스트                                        |

변경하지 않음: `hookTranslator.ts` (의도적 Gemini 브릿지), `hookPlanner.ts`,
`hookRunner.ts`, `hookRegistry.ts` (@google/genai 의존성 없음)

### M2.1.5 변경 통계

| 항목                        | 수치                              |
| --------------------------- | --------------------------------- |
| 수정된 파일                 | 4개                               |
| 생성된 파일                 | 1개                               |
| 추가된 테스트               | 14개                              |
| 총 테스트 통과              | 155개 (기존 141 + 신규 14)        |
| TypeScript 에러             | 0개                               |
| 제거된 @google/genai import | 1개 (`FunctionCallingConfigMode`) |
| @deprecated 표시            | 9개                               |
| 신규 V2/get 메서드          | 6개                               |

---

## 📝 다음 작업

### M2.1 잔여 작업

- ~~2.1.4 Retry 로직 리팩토링~~ ✅
- ~~2.1.5 Hook 시스템 타입 전환~~ ✅
- 2.1.6 ContentGenerator 래퍼/파생 클래스 마이그레이션

### M2.2 이어서 진행

- EventMapper 구현 완료 확인
- StreamEvent → LlmStreamEvent 전환
- GeminiAdapter 구현

### Open Questions

- **BaseLlmClient 리팩토링 전략 (M2.3)**: 생성자에 `providers/types.ts`의
  `ContentGenerator`를 주입하려면, 내부 `_generateWithRetry()`의 Gemini 전용 API
  호출도 함께 추상화해야 함. 두 가지 접근:
  1. `BaseLlmClient` 자체를 어댑터 패턴으로 재설계 (프로바이더 독립)
  2. `BaseLlmClient`를 Gemini 전용으로 유지하고, 새로운 프로바이더 독립
     클라이언트를 별도 생성

---

## 🔖 커밋 정보

**커밋**: `2b18279c6`

**커밋 메시지:**

```
M2.1 BaseLlmClient 프로바이더 독립 타입 전환 및 M2.2 EventMapper 구현
```

---

## 📊 변경 통계 (누적)

| 항목            | 수치                                                                 |
| --------------- | -------------------------------------------------------------------- |
| 수정된 파일     | 14개 (M2.1.3: 8개, M2.1.4: +2개, M2.1.5: +4개)                       |
| 생성된 파일     | 1개 (M2.1.5: hookSystem_new_types.test.ts)                           |
| 추가된 테스트   | 31개 (M2.1.3: 5개, M2.1.4: 12개, M2.1.5: 14개)                       |
| 총 테스트 통과  | 235개 (baseLlmClient 38 + retry 30 + retry_llm_error 12 + hooks 155) |
| TypeScript 에러 | 0개                                                                  |
