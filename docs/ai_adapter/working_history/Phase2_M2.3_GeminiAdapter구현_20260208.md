# Phase 2: M2.3 GeminiAdapter 구현 및 동등성 검증 작업 결과서

> 📅 **작업일**: 2026-02-08 📚 **Phase**: Phase 2 - M2.3 🎯 **목표**:
> GeminiAdapter/Converter 구현 + 레거시 경로와 동등성 검증 + 기능 플래그 🔗
> **이전 작업**:
> [Phase2_M2.2_EventMapper구현\_20260207.md](./Phase2_M2.2_EventMapper구현_20260207.md)
> 🔗 **관련 문서**:
> [phase2_core_refactoring_todolist.md](../todolist/phase2_core_refactoring_todolist.md) -
> M2.3

---

## 📋 작업 요약

### 2.3.2 GeminiConverter ✅

| 항목                                                               | 상태 | 비고                                     |
| ------------------------------------------------------------------ | :--: | ---------------------------------------- |
| toGeminiContents (LlmMessage[] → Content[])                        |  ✅  | system/user/assistant 분리               |
| toGeminiParts (LlmContent[] → Part[])                              |  ✅  | text/image/tool_call/tool_result/thought |
| toGeminiRequest (LlmGenerateRequest → GenerateContentParameters)   |  ✅  | config 내부에 모든 설정 배치             |
| toGeminiTools (LlmToolDefinition[] → Tool[])                       |  ✅  | functionDeclarations 래핑                |
| toGeminiToolConfig (LlmToolChoice → ToolConfig)                    |  ✅  | auto/none/required/specific              |
| fromGeminiResponse (GenerateContentResponse → LlmGenerateResponse) |  ✅  | text/functionCall/inlineData             |
| fromGeminiParts (Part[] → LlmContent[])                            |  ✅  | 역방향 변환                              |
| mapStopReason (FinishReason → LlmStopReason)                       |  ✅  | STOP/MAX_TOKENS/SAFETY/RECITATION        |

**테스트**: 33개 (geminiConverter.test.ts)

### 2.3.1 GeminiAdapter ✅

| 항목                            | 상태 | 비고                                            |
| ------------------------------- | :--: | ----------------------------------------------- |
| BaseAdapter 상속                |  ✅  | providerName='gemini'                           |
| GeminiModelsApi DI 인터페이스   |  ✅  | generateContent/Stream/countTokens/embedContent |
| generateContent (non-streaming) |  ✅  | converter 경유, validateRequest                 |
| generateContentStream           |  ✅  | AsyncGenerator<LlmEvent>, bind 패턴             |
| countTokens                     |  ✅  | override + models.countTokens 위임              |
| capabilities 선언               |  ✅  | streaming/tools/image/embedding/thought 지원    |
| config validation               |  ✅  | null config 거부, apiKey 없이도 허용 (ADC)      |

**테스트**: 15개 (geminiAdapter.test.ts)

### 2.3.3 동등성 검증 ✅

| 항목                       | 상태 | 비고                                   |
| -------------------------- | :--: | -------------------------------------- |
| 2.3.3.1 기본 대화 동등성   |  ✅  | content/stopReason/usage 비교          |
| 2.3.3.2 스트리밍 동등성    |  ✅  | text_delta/finished 이벤트 비교        |
| 2.3.3.3 도구 호출 동등성   |  ✅  | name/arguments 일치 검증               |
| 2.3.3.4 이미지 입력 동등성 |  ✅  | inlineData 변환 일치 검증              |
| 2.3.3.5 에러 처리 동등성   |  ✅  | 에러 분류/retryable 일치               |
| 2.3.3.6 Rate limit 동등성  |  ✅  | 429/503 retryable 검증                 |
| 2.3.3.7 18개 이벤트 동등성 |  ✅  | 전체 GeminiEventType→LlmEventType 매핑 |

**테스트**: 37개 (geminiParity.test.ts)

### 2.3.4 기능 플래그 ✅

| 항목                                 | 상태 | 비고                            |
| ------------------------------------ | :--: | ------------------------------- |
| 2.3.4.1 ENABLE_MULTI_PROVIDER 플래그 |  ✅  | env var 기반, true/1/false/0    |
| 2.3.4.2 플래그 기반 경로 분기        |  ✅  | legacy vs new 경로 분기         |
| 2.3.4.3 런타임 전환 테스트           |  ✅  | setMultiProviderOverride/clear  |
| 2.3.4.4 폴백 로직 구현               |  ✅  | withFallback(primary, fallback) |

**테스트**: 16개 (featureFlag.test.ts)

---

## 📊 검증 결과

| 검증 항목           |      결과       | 비고                  |
| ------------------- | :-------------: | --------------------- |
| 전체 테스트         | ✅ 398/398 pass | 기존 297 + 신규 101   |
| TypeScript 컴파일   |     ✅ 클린     | tsc --noEmit 0 errors |
| ESLint              |     ✅ 통과     | pre-commit hook 통과  |
| 기존 기능 100% 동작 |       ✅        | 기존 테스트 전체 통과 |
| 18개 이벤트 동등성  |       ✅        | 전체 매핑 검증 완료   |

---

## 📁 파일 목록

### 신규 생성

| 파일                                       | 용도                           | LOC  |
| ------------------------------------------ | ------------------------------ | ---- |
| `providers/gemini/converter.ts`            | Llm ↔ Gemini SDK 타입 변환기  | ~340 |
| `providers/gemini/adapter.ts`              | BaseAdapter 확장 Gemini 어댑터 | ~210 |
| `providers/gemini/featureFlag.ts`          | 멀티 프로바이더 기능 플래그    | ~75  |
| `providers/gemini/geminiConverter.test.ts` | Converter TDD 테스트           | ~575 |
| `providers/gemini/geminiAdapter.test.ts`   | Adapter TDD 테스트             | ~320 |
| `providers/gemini/geminiParity.test.ts`    | 동등성 검증 테스트             | ~570 |
| `providers/gemini/featureFlag.test.ts`     | 기능 플래그 테스트             | ~155 |

### 수정

| 파일                        | 변경 내용                                               |
| --------------------------- | ------------------------------------------------------- |
| `providers/gemini/index.ts` | GeminiAdapter, GeminiConverter, featureFlag export 추가 |

---

## 🔑 핵심 설계 결정

### 1. GenerateContentParameters SDK 구조

**문제**: 설계 문서(§3.3.2)의 API shape과 실제 SDK 타입이 다름 **해결**:
`node_modules/@google/genai/dist/genai.d.ts` 직접 확인 후 수정

```
실제 구조: { model, contents, config?: GenerateContentConfig }
config 내부: systemInstruction, tools, toolConfig, temperature, maxOutputTokens, ...
```

### 2. GeminiModelsApi DI 인터페이스

테스트에서 실제 SDK 인스턴스 없이 모킹 가능하도록 인터페이스 추출.
`Record<string, unknown>` 파라미터 타입으로 SDK 타입 변환 단순화.

### 3. no-this-alias ESLint 규칙

`const self = this` 대신 `bind(this)` 패턴 사용:

```typescript
const convertChunk = this.convertChunkToEvents.bind(this);
```

### 4. ContentListUnion 타입 처리

SDK의 `contents` 필드가 `ContentListUnion` (union type)이라 배열 인덱스 접근
불가. 테스트에서 `as Array<{ parts?: unknown[] }>` 캐스팅으로 해결.

---

## ⚠️ 다음 마일스톤 이월 사항

### M2.4로 이월

| 항목                                                  | 우선순위 | 비고                              |
| ----------------------------------------------------- | -------- | --------------------------------- |
| ModelConfigService LlmGenerateConfig 호환             | 높음     | GenerateContentConfig 의존성 해결 |
| loggingContentGenerator ProviderApiResponseEvent 전환 | 중간     | M2.2에서 이월                     |
| client.ts GeminiEventType 참조 정리                   | 중간     | M2.2에서 이월                     |
| turn.ts 이벤트 생성점 전환                            | 중간     | M2.2에서 이월                     |

---

## 📌 커밋 정보

| 커밋 | 해시      | 설명                                                    |
| ---- | --------- | ------------------------------------------------------- |
| feat | 91a8f1e5e | feat(providers): M2.3 GeminiAdapter 구현 및 동등성 검증 |
| docs | (미커밋)  | 작업 결과서                                             |

---

## ✅ 체크리스트

- [x] 본작업 완료: 2.3.1 + 2.3.2 + 2.3.3 + 2.3.4
- [x] 테스트: 101개 신규, 398개 전체 통과
- [x] TypeScript 컴파일: 클린
- [x] ESLint: 통과 (pre-commit hook)
- [x] 커밋: 91a8f1e5e (feat)
- [ ] 커밋: (docs — 사용자 확인 대기)
