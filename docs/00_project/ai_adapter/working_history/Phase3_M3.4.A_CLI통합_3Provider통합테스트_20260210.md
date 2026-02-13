# M3.4.A 작업 결과서 — CLI 통합 + 3-Provider 통합 테스트

- **작업일**: 2026-02-10
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료

## 작업 목표

CLI 런타임이 legacy Gemini 메서드(`GeminiChat.sendMessageStream`)만 호출하여
non-Gemini 프로바이더를 사용할 수 없는 문제를 해결하고, 3-Provider 통합 테스트를
작성한다.

1. **Stage 1**: `requestBuilder.ts` — Gemini 런타임 상태 → `LlmGenerateRequest`
   조립
2. **Stage 2**: `historyBuilder.ts` — LlmEvent 스트림 → Gemini `Content` 역변환
3. **Stage 3-4**: `client.ts` `processLlmTurn()` 분기 + `providerName` 감지
4. **Stage 5**: `typeConversion.ts` callId round-trip 보존
5. **M3.4.1**: 멀티 프로바이더 통합 테스트 44건 (3.4.1.1~3.4.1.4)

## 사전 분석

### 기존 경로 vs 신규 경로

| 항목          | Gemini 경로 (기존)                                 | Non-Gemini 경로 (신규)                           |
| ------------- | -------------------------------------------------- | ------------------------------------------------ |
| 진입점        | `processTurn()` → `turn.run()`                     | `processTurn()` → `processLlmTurn()`             |
| API 호출      | `GeminiChat.sendMessageStream()`                   | `generator.llmGenerateContentStream()`           |
| 요청 변환     | 불필요 (Gemini 네이티브)                           | `buildLlmRequestFromGeminiState()`               |
| 응답 처리     | `processStreamResponse()` (Gemini GenerateContent) | `LlmResponseAccumulator.addEvent()` (LlmEvent)   |
| 히스토리 저장 | Turn 내부에서 자동                                 | `accumulator.toContent()` → `chat.addHistory()`  |
| 이벤트 yield  | Turn → StreamEventType → LlmEvent (eventMapper)    | LlmEvent 직접 yield (변환 불필요)                |
| 에러 처리     | retryWithBackoff + 429 폴백                        | adapter 내부 classifyError → LlmErrorEvent yield |

### 접근 방식 결정

| 대안                            | 기각 사유                                                      |
| ------------------------------- | -------------------------------------------------------------- |
| LlmEvent→GenerateContent 역변환 | Gemini 전용 필드 손실, processStreamResponse 비호환            |
| StreamEventType 확장            | `@deprecated` 표시된 타입, 확장 부적절                         |
| **processTurn 분기 (채택)**     | client.ts가 이미 typeConversion 사용, Turn 생성/소비 통제 가능 |

### 의도적 생략 (Non-Gemini 경로)

- AfterModel hooks (Gemini 전용 `GenerateContentParameters/Response` 의존)
- retryWithBackoff / 429 폴백 (adapter 내부 에러 처리로 충분)
- checkNextSpeaker (Gemini 전용)
- chat compression (Gemini 전용 토큰 카운팅 의존)
- ensureActiveLoopHasThoughtSignatures (Gemini 전용)

## 작업 순서 및 결과

| 순서 | 작업                                     | 테스트 수      | 결과      |
| ---- | ---------------------------------------- | -------------- | --------- |
| 1    | Stage 1: requestBuilder TDD              | +18            | 18 PASS   |
| 2    | Stage 2: historyBuilder TDD              | +16            | 34 PASS   |
| 3    | ESLint fix (auto-fix 24건)               | 0              | 34 PASS   |
| 4    | TypeCheck fix (Type enum 13건)           | 0              | 34 PASS   |
| 5    | Stage 3-4: processLlmTurn + providerName | +7             | 78 PASS   |
| 6    | Stage 5: callId round-trip fix           | +1 (수정 포함) | 5185 PASS |
| 7    | M3.4.1: 통합 테스트 44건                 | +44            | 44 PASS   |

## 변경 파일 상세

### 신규 파일

| 파일                                                    | 내용                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `providers/gemini/requestBuilder.ts`                    | `buildLlmRequestFromGeminiState()`, `convertGeminiToolsToLlm()` |
| `providers/gemini/requestBuilder.test.ts`               | 18 tests — request 조립, config 매핑, tools 역변환, callId      |
| `providers/gemini/historyBuilder.ts`                    | `LlmResponseAccumulator` 클래스                                 |
| `providers/gemini/historyBuilder.test.ts`               | 16 tests — text/tool/mixed/finished/error 축적                  |
| `providers/__tests__/multiProvider.integration.test.ts` | 11 tests — 프로바이더 전환 + 동시 사용                          |
| `providers/__tests__/providerConfigIntegration.test.ts` | 14 tests — config passthrough + validation                      |
| `providers/__tests__/errorHandling.integration.test.ts` | 19 tests — 에러 분류 + 스트림 에러 + 직렬화                     |

### 수정 파일

| 파일                                 | 변경 내용                                                     |
| ------------------------------------ | ------------------------------------------------------------- |
| `core/client.ts`                     | `processLlmTurn()` private 메서드 + `processTurn()` 분기 추가 |
| `core/client.test.ts`                | non-Gemini provider 경로 테스트 7건 추가                      |
| `core/contentGenerator.ts`           | `GeminiContentGenerator.providerName?: string` 추가           |
| `providers/gemini/chat.ts`           | `getSystemInstruction()`, `getConfiguredTools()` getter 추가  |
| `providers/gemini/typeConversion.ts` | `functionCall.id`, `functionResponse.id` → callId 보존 수정   |

## 구현 상세

### requestBuilder.ts — Gemini 상태 → LlmGenerateRequest

**`buildLlmRequestFromGeminiState()`**:

- `Content[] history` → `convertContentsToLlmMessages()` (typeConversion 재사용)
- `PartListUnion currentRequest` → `convertPartListUnionToLlmContents()`
  (typeConversion 재사용)
- `GenerateContentConfig` → `temperature`, `maxOutputTokens→maxTokens`, `topP`,
  `topK`, `stopSequences` 매핑
- `Tool[]` → `convertGeminiToolsToLlm()` 역변환

**`convertGeminiToolsToLlm()`**:

- `functionDeclarations[]` → `LlmToolDefinition[]`
- 재귀적 `Schema` → `LlmToolProperty` 변환 (`convertSchemaToProperty`)
- `Type.OBJECT` → `'object'`, `Type.STRING` → `'string'` 등 소문자 변환

### historyBuilder.ts — LlmResponseAccumulator

**축적 이벤트**: `TextDelta` → text 청크 축적, `ToolCallRequest` →
ToolCallRequestInfo + functionCall Part 축적, `Finished` → finishReason, `Error`
→ errorOccurred 플래그

**`toContent()`**: `{ role: 'model', parts: [textPart, ...functionCallParts] }`
— Gemini history에 저장 가능한 Content 생성

**`getPendingToolCalls()`**: `ToolCallRequestInfo[]` — agentic loop에서 tool
실행용

### client.ts — processLlmTurn() 분기

**감지 로직**:

```typescript
const generator = this.getContentGeneratorOrFail();
if (
  isProviderIndependentGenerator(generator) &&
  generator.providerName !== 'gemini'
) {
  turn =
    yield *
    this.processLlmTurn(
      generator,
      modelToUse,
      request,
      linkedSignal,
      prompt_id,
    );
  return turn;
}
```

**processLlmTurn() 흐름**:

1. User request → history 추가 + chatRecordingService 기록
2. `buildLlmRequestFromGeminiState()` → LlmGenerateRequest 조립
3. `llmGenerateContentStream()` → LlmEvent 순회 + yield + accumulator 축적
4. 스트림 완료 → model Content history 추가 + chatRecordingService 기록
5. Turn-compatible duck-typed 객체 반환 (`as unknown as Turn`)

### typeConversion.ts — callId 보존

**수정 전**:

- `functionCall`: `id: crypto.randomUUID()` (새 UUID 생성)
- `functionResponse`: `toolCallId: ''` (빈 문자열)

**수정 후**:

- `functionCall`: `id: part.functionCall.id ?? crypto.randomUUID()` (SDK id
  우선)
- `functionResponse`: `toolCallId: part.functionResponse.id ?? ''` (SDK id 우선)

## 테스트 현황

### M3.4.1 통합 테스트 — 44 tests (3 files)

| 파일 (카테고리)                             | 테스트 수 | 검증 내용                                                                                                                    |
| ------------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **multiProvider (3.4.1.1)** 프로바이더 전환 | 7         | 3 provider 등록, providerName, generateContent 전환, stream 전환, 대소문자 무관, capabilities, model passthrough             |
| **multiProvider (3.4.1.2)** 동시 사용       | 4         | concurrent generateContent, concurrent stream, 독립 인스턴스, mixed concurrent                                               |
| **providerConfig (3.4.1.3)** 설정 검증      | 14        | config passthrough (apiKey/baseUrl/timeout/custom), createWithValidation, request config 해석, base validation               |
| **errorHandling (3.4.1.4)** 에러 처리       | 19        | 4 error type × 3 providers, retryable 분류, stream error events, mid-stream error, wrapError, registry errors, serialization |

### Stage 1-5 단위 테스트 — 42 tests

| 파일                               | 테스트 수 | 검증 내용                                                |
| ---------------------------------- | --------- | -------------------------------------------------------- |
| `requestBuilder.test.ts`           | 18        | empty tools, conversion, nested, config mapping, callId  |
| `historyBuilder.test.ts`           | 16        | text/tool/mixed accumulation, finished, error, empty     |
| `client.test.ts` (non-Gemini 신규) | 7         | event yield, Turn 미호출, history, recording, tool calls |
| `typeConversion.ts` (기존 수정)    | 1 (수정)  | callId round-trip 검증                                   |

## Quality Gate

| 항목          | 결과                       |
| ------------- | -------------------------- |
| TypeCheck     | ✅ PASS                    |
| ESLint        | ✅ PASS                    |
| 통합 테스트   | ✅ 3 files / 44 passed     |
| Provider 회귀 | ✅ 37 files / 741 passed   |
| Core 전체     | ✅ 274 files / 5185 passed |

**변화**: 33 files / 677 → 37 files / 741 (+4 files, +64 tests)

## 설계 결정

### processTurn 분기 (vs Turn 래핑)

- **결정**: `processTurn()` 내부에서 non-Gemini 감지 시 `processLlmTurn()`
  메서드로 분기
- **근거**: Turn 클래스는 Gemini 전용 로직(processStreamResponse,
  InvalidStreamError, MALFORMED_FUNCTION_CALL)에 깊이 결합. LlmEvent를 직접
  yield하면 변환 오버헤드 제거, adapter의 에러 분류 활용 가능.

### Turn duck typing (as unknown as Turn)

- **결정**:
  `{ pendingToolCalls, finishReason, getResponseText, getDebugResponses }`
  객체를 `as unknown as Turn`으로 캐스팅
- **근거**: Turn 클래스의 `debugResponses` private 필드 접근 불가. processTurn
  호출자가 사용하는 Turn API는 위 4개 필드뿐이므로 duck typing으로 호환.

### GeminiChat getter 추가 (vs private 필드 노출)

- **결정**: `getSystemInstruction()`, `getConfiguredTools()` public getter
  메서드 추가
- **근거**: `systemInstruction`과 `tools`는 private 필드. requestBuilder가
  LlmGenerateRequest 조립 시 필요. private→public 변경보다 getter가 API surface
  축소.

### callId 보존 (typeConversion.ts)

- **결정**: `functionCall.id`와 `functionResponse.id`를 SDK 값 우선으로 보존
- **근거**: Non-Gemini 프로바이더는 자체 callId 체계 사용. history → request
  round-trip에서 callId 소실 시 tool response 매칭 실패. Gemini 네이티브는 SDK가
  id를 설정하지 않으므로 기존 `randomUUID()` 폴백 유지.

### 통합 테스트: Mock Adapter 패턴

- **결정**: BaseAdapter를 상속하는 Mock Adapter (MockGeminiAdapter,
  MockClaudeAdapter, MockOpenAiAdapter)를 테스트 내부에 정의
- **근거**: 실제 SDK 호출 없이 Registry → Factory → Adapter →
  generateContent/Stream 전체 라이프사이클을 검증. 각 Mock은 `[provider]` 태그를
  응답에 포함하여 cross-contamination 검증 가능.

## 커밋 이력

| 커밋        | 메시지                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------- |
| `ee113784d` | `refactor(providers): M3.4.A Stage 1-2 — requestBuilder + historyBuilder for non-Gemini CLI integration` |
| `1051bd090` | `feat(providers): M3.4.A Stage 3-4 — processLlmTurn branching for non-Gemini providers`                  |
| `6ef11ce2d` | `fix(providers): M3.4.A Stage 5 — preserve callId through functionCall/functionResponse round-trip`      |

## 알려진 제한사항

### Non-Gemini 경로에서 생략된 기능

| 기능                     | 사유                                                       | 해결 시점             |
| ------------------------ | ---------------------------------------------------------- | --------------------- |
| AfterModel hooks         | Gemini 전용 `GenerateContentParameters/Response` 타입 의존 | 타입 독립화 후        |
| retryWithBackoff         | adapter 내부 에러 처리로 충분, 추후 필요 시 추가           | 필요 시               |
| chat compression         | Gemini 전용 토큰 카운팅 의존                               | 토큰 카운팅 독립화 후 |
| checkNextSpeaker         | Gemini 전용 기능                                           | 필요 시               |
| generateContent 비스트림 | 스트리밍이 CLI 주요 경로, 낮은 우선순위                    | 필요 시               |

### M3.4.1 통합 테스트 범위

통합 테스트는 Mock Adapter를 사용하므로 실제 SDK 호출은 검증하지 않음. 실제 API
호출 검증은 M3.4.2 E2E 테스트에서 수행 예정.

## 리뷰 반영 (2026-02-10)

### 리뷰 지적 사항 및 수정 결과

| #   | 심각도 | 이슈                                                                       | 검증 결과                                                           | 수정 내용                                                                                                                                   |
| --- | ------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 높음   | `processLlmTurn()`에서 AbortSignal을 `llmGenerateContentStream()`에 미전달 | ✅ 확인 — 3번째 인자 `options` 누락                                 | `{ signal }` 옵션 추가 (client.ts:862)                                                                                                      |
| 2   | 높음   | abort 후 partial response가 history에 저장됨                               | ✅ 확인 — `!isError` 조건만 존재, `signal.aborted` 미체크           | `!isError && !signal.aborted` 조건으로 변경 (client.ts:878)                                                                                 |
| 3   | 중간   | Non-Gemini 경로에 루프 감지 미적용                                         | ✅ 확인 — Gemini 경로의 `loopDetector.addAndCheck()` 대응 코드 없음 | `processLlmTurn` event loop에 `loopDetector.addAndCheck()` 추가 + `controller` 파라미터 추가하여 loop detected 시 abort (client.ts:870-878) |

### 변경 파일

| 파일                  | 변경 내용                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/client.ts`      | (1) `llmGenerateContentStream` 호출 시 `{ signal }` 옵션 전달, (2) history recording 조건에 `!signal.aborted` 추가, (3) `processLlmTurn` 시그니처에 `controller: AbortController` 추가 + event loop에 `loopDetector.addAndCheck()` 루프 감지 추가 |
| `core/client.test.ts` | `llmGenerateContentStream` 호출 기대값에 `signal` 옵션 검증 추가                                                                                                                                                                                  |

### Quality Gate (1차 리뷰 반영 후)

| 항목          | 결과                     |
| ------------- | ------------------------ |
| TypeCheck     | ✅ PASS                  |
| ESLint        | ✅ PASS                  |
| Client 테스트 | ✅ 80 passed (1 skipped) |
| Provider 회귀 | ✅ 37 files / 758 passed |

### 2차 리뷰 — SDK 레이어 AbortSignal 전달 누락

| #   | 심각도 | 이슈                                                                                                                  | 검증 결과                                                                                     | 수정 내용                                                                    |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 5   | 중간   | `client.ts`에서 `{ signal }` 전달하나, Claude/OpenAI 어댑터가 `_options`로 미사용 → SDK 네트워크 요청에 signal 미전달 | ✅ 확인 — 양쪽 어댑터 `generateContent`/`generateContentStream` 모두 `_options` (unused) 선언 | `options?.signal`을 SDK `create()` 호출의 2번째 인자 `RequestOptions`로 전달 |

**배경**: Anthropic/OpenAI SDK 모두 `RequestOptions.signal?: AbortSignal`을
지원하며, 스트림의 `for await` break 시 내부 abort도 동작하지만, 외부 signal
전달로 네트워크 레벨 즉시 취소가 가능해짐.

### 2차 리뷰 변경 파일

| 파일                          | 변경 내용                                                                                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `providers/claude/adapter.ts` | `generateContent`: `client.messages.create(params, { signal })`, `generateContentStream`: `client.messages.create({...params, stream: true}, { signal })`                                 |
| `providers/openai/adapter.ts` | `generateContent`: `client.chat.completions.create(params, { signal })`, `generateContentStream`: `client.chat.completions.create({...params, stream: true, stream_options}, { signal })` |

### Quality Gate (2차 리뷰 반영 후)

| 항목          | 결과                     |
| ------------- | ------------------------ |
| TypeCheck     | ✅ PASS                  |
| ESLint        | ✅ PASS                  |
| Provider 회귀 | ✅ 37 files / 758 passed |

## 향후 작업

- **M3.4.A 잔여**: 3.4.2 (E2E 테스트), 3.4.3 (성능 회귀), 3.4.4 (문서), 3.4.5
  (안정화)
- **M3.3**: OpenAI-Compatible(vLLM/sLM) 어댑터 — OpenAI SDK 재사용, baseURL 동적
  설정
- **M3.4.B**: M3.3 의존 항목 (vLLM E2E + 문서 상세화)
