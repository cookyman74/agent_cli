# Phase 2: M2.2 GeminiChat 스트리밍 분해 및 합성기 적용 작업 결과서

> 📅 **작업일**: 2026-02-07 📚 **Phase**: Phase 2 - M2.2 🎯 **목표**: Gemini
> 스트리밍 이벤트를 프로바이더 독립 이벤트로 매핑 및 스트림 변환 유틸리티 구축
> 🔗 **이전 작업**:
> [Phase2_M2.1_ContentGenerator인터페이스재정의\_20260207.md](./Phase2_M2.1_ContentGenerator인터페이스재정의_20260207.md)
> 🔗 **관련 문서**:
> [phase2_core_refactoring_todolist.md](../todolist/phase2_core_refactoring_todolist.md) -
> M2.2

---

## 📋 작업 요약

### 2.2.1 EventMapper 구현 ✅

| 항목                                 | 상태 | 비고                     |
| ------------------------------------ | :--: | ------------------------ |
| GeminiEventMapper 클래스 생성        |  ✅  | 451줄                    |
| Content → TextDelta 매핑             |  ✅  | traceId 전파             |
| Thought → ThoughtDelta 매핑          |  ✅  | subject/description 반영 |
| ToolCallRequest 매핑                 |  ✅  | 모든 필드 매핑           |
| ToolCallResponse 매핑                |  ✅  | responseParts 보존       |
| ToolCallConfirmation 매핑            |  ✅  | 다형성 처리              |
| Error/Finished/Retry 매핑            |  ✅  | FinishReason 변환 포함   |
| 나머지 8개 이벤트 매핑               |  ✅  | 18개 전체 매핑 완료      |
| 역방향 매핑 (LlmEvent → GeminiEvent) |  ✅  | 12개 이벤트 역방향 지원  |

### 2.2.1 리뷰 수정 ✅

| 이슈                       | 수정 내역                                                      |
| -------------------------- | -------------------------------------------------------------- |
| 메서드명 혼란              | `toLlmFinishReasonToGemini` → `toGeminiFinishReason` 이름 변경 |
| 테스트 커버리지 부족       | 엣지 케이스 9개 추가 (20 → 29 테스트)                          |
| ToolCallResponse 정보 손실 | `responseParts` 원본 보존 (JSON.stringify 제거)                |
| 확인 이벤트 기본값 오류    | `confirmed` 미존재시 `false` 반환 (기존 `true`)                |
| Citation 위치 정보 더미값  | `startIndex`/`endIndex` 생략 (LlmCitation 타입 optional화)     |
| Agent 이벤트 컨텍스트 손실 | `systemMessage`, `contextCleared` 필드 추가                    |
| 역방향 매핑 제한           | 에러 메시지에 지원 이벤트 목록 문서화                          |

**추가 엣지 케이스 테스트** (20개 → 29개):

- Finished without usageMetadata
- SAFETY → content_filter FinishReason 매핑
- Error without status code
- ChatCompressed with null value
- ToolCallResponse with error
- Unknown GeminiEventType → Error fallback
- 역방향: Finished → Finished (usage 포함)
- 역방향: ThoughtDelta → Thought
- 역방향: 미지원 타입 throw 검증

### 2.2.2 StreamEvent → LlmEvent 전환 ✅

| 항목                                        | 상태 | 비고                                |
| ------------------------------------------- | :--: | ----------------------------------- |
| StreamEvent 사용처 전체 스캔                |  ✅  | turn.ts 12개, client.ts 24개 참조점 |
| 스트림 변환 유틸리티 (`streamConverter.ts`) |  ✅  | 2개 함수 (78줄)                     |
| `loopDetectionService.addAndCheckLlm()`     |  ✅  | LlmEvent 수용, 기존 상태 공유       |
| client.ts 마이그레이션 코멘트               |  ✅  | TODO(M2.3) 코멘트 추가              |
| `StreamEvent` / `addAndCheck` @deprecated   |  ✅  | JSDoc 마킹 완료                     |

### 2.2.2a StreamEventType 통합 전략 ✅

| 항목                                               | 상태 | 비고                               |
| -------------------------------------------------- | :--: | ---------------------------------- |
| `StreamEventType` enum 분석                        |  ✅  | 4종, geminiChat.ts 정의            |
| `CHUNK` 1:N 분해 → 직접 매핑 불가 확인             |  ✅  | 설계 결정: Turn 출력 레벨 변환     |
| `RETRY/STOPPED/BLOCKED` → 기존 Turn 경유 경로 확인 |  ✅  | GeminiEventType → EventMapper 경로 |
| `StreamEventType` @deprecated 마킹                 |  ✅  | geminiChat.ts JSDoc 추가           |

### 2.2.3 StreamAssembler 적용 ✅

| 항목                                | 상태 | 비고                               |
| ----------------------------------- | :--: | ---------------------------------- |
| GeminiChat 스트림 처리 로직 분석    |  ✅  | Turn → client 파이프라인 파악      |
| `createGeminiStreamPipeline()` 구현 |  ✅  | EventMapper + StreamAssembler 통합 |
| `GeminiStreamPipeline` 인터페이스   |  ✅  | stream + assembler 이중 접근       |
| 텍스트 델타 합성 검증               |  ✅  | 다수 Content → text 연결           |
| 툴 콜 델타 합성 검증                |  ✅  | 단일/다수 ToolCallRequest 수집     |
| Usage 정보 누적 검증                |  ✅  | Finished(usageMetadata) → usage    |
| 통합 테스트                         |  ✅  | 15개 테스트 (geminiStream.test.ts) |

---

## 📁 파일 변경 사항

### 신규 파일

| 파일                                       | 설명                             |
| ------------------------------------------ | -------------------------------- |
| `providers/gemini/eventMapper.ts`          | GeminiEventMapper 클래스 (451줄) |
| `providers/gemini/eventMapper.test.ts`     | EventMapper TDD 테스트 (29개)    |
| `providers/gemini/streamConverter.ts`      | 스트림 변환 유틸리티 (78줄)      |
| `providers/gemini/streamConverter.test.ts` | StreamConverter TDD 테스트 (5개) |
| `providers/gemini/geminiStream.ts`         | 통합 파이프라인 유틸리티 (90줄)  |
| `providers/gemini/geminiStream.test.ts`    | 통합 파이프라인 테스트 (15개)    |

### 수정 파일

| 파일                                    | 변경 내용                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `providers/gemini/index.ts`             | GeminiEventMapper, convertGeminiStream, convertGeminiStreamWithReturn, createGeminiStreamPipeline export 추가 |
| `providers/events.ts`                   | Agent 이벤트 필드 추가, Citation optional화, result 타입 확장                                                 |
| `services/loopDetectionService.ts`      | `addAndCheckLlm(LlmEvent)` 메서드 추가, `addAndCheck` @deprecated 마킹, LlmEvent import 추가                  |
| `services/loopDetectionService.test.ts` | addAndCheckLlm 테스트 6개 추가 (47 → 53 테스트)                                                               |
| `core/geminiChat.ts`                    | `StreamEventType`, `StreamEvent` @deprecated JSDoc 추가                                                       |
| `core/client.ts`                        | `loopDetector.addAndCheck()` 호출부에 TODO(M2.3) 마이그레이션 코멘트                                          |

---

## 🗺️ 이벤트 매핑 구조

### 정방향 매핑 (18종: Gemini → LlmEvent)

| GeminiEventType           | LlmEventType          |
| ------------------------- | --------------------- |
| Content                   | TextDelta             |
| Thought                   | ThoughtDelta          |
| ToolCallRequest           | ToolCallRequest       |
| ToolCallResponse          | ToolCallResponse      |
| ToolCallConfirmation      | ToolCallConfirmation  |
| Error                     | Error                 |
| Finished                  | Finished              |
| Retry                     | Retry                 |
| UserCancelled             | UserCancelled         |
| ChatCompressed            | ChatCompressed        |
| LoopDetected              | LoopDetected          |
| MaxSessionTurns           | MaxSessionTurns       |
| ContextWindowWillOverflow | ContextWindowOverflow |
| InvalidStream             | InvalidStream         |
| ModelInfo                 | ModelInfo             |
| AgentExecutionStopped     | AgentStopped          |
| AgentExecutionBlocked     | AgentBlocked          |
| Citation                  | Citation              |

### 역방향 매핑 (12종: LlmEvent → Gemini)

TextDelta, ThoughtDelta, Error, UserCancelled, Retry, LoopDetected,
MaxSessionTurns, InvalidStream, Finished, AgentStopped, AgentBlocked, ModelInfo

> ToolCallRequest/Response/Confirmation은 역방향 미지원 (context enrichment
> 필요)

---

## 🏗️ 설계 결정

### StreamEventType.CHUNK 1:N 분해

```
StreamEvent.CHUNK (GenerateContentResponse)
  → turn.ts 분해 → N개 GeminiEventType 이벤트
    → EventMapper → N개 LlmEvent
```

CHUNK는 `GenerateContentResponse`를 포함하며, Turn이 텍스트/thoughts/tool
calls/citations 등으로 다수 분해. 따라서 StreamEventType → LlmEvent 직접 매핑은
불가하며, **변환 경계는 Turn 출력 레벨**(`ServerGeminiStreamEvent` →
`LlmEvent`)에 설정.

### 스트림 변환 유틸리티

| 함수                                       | 용도                                                             |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `convertGeminiStream()`                    | `AsyncGenerator<ServerGeminiStreamEvent>` → `LlmEventStream`     |
| `convertGeminiStreamWithReturn<TReturn>()` | return value 보존 (client.ts의 `AsyncGenerator<..., Turn>` 대응) |

### loopDetectionService 이중 지원

`addAndCheck()` (Gemini)와 `addAndCheckLlm()` (LlmEvent)가 동일한 내부 상태
공유:

- `toolCallRepetitionCount`, `lastToolCallKey`
- `streamContentHistory`, `contentStats`
- `loopDetected`, `disabledForSession`

→ 마이그레이션 기간 중 두 API 혼용 가능

---

## ✅ 테스트 결과

### M2.2 전체 테스트

```
eventMapper.test.ts          : 29 passed
streamConverter.test.ts      :  5 passed
loopDetectionService.test.ts : 53 passed (47 기존 + 6 신규)
geminiStream.test.ts         : 15 passed (M2.2.3 통합 테스트)
streamAssembler.test.ts      : 22 passed (기존, 회귀 확인)
────────────────────────────────────────
합계                          : 124 passed
```

### TypeScript 컴파일

```
npx tsc --noEmit -p packages/core/tsconfig.json
→ 에러 없음 (clean)
```

---

## 🐛 이슈 및 해결

### 이슈 1: 메서드명 혼란 (`toLlmFinishReasonToGemini`)

- **증상**: 메서드명에 `toLlm`과 `ToGemini`가 동시에 포함되어 방향이 불명확
- **원인**: 초기 네이밍 시 실수
- **해결**: `toGeminiFinishReason`으로 이름 변경 (역방향 매핑임을 명확히)

### 이슈 2: 테스트에서 string literal vs enum 타입 불일치

- **증상**: `addAndCheckLlm` 테스트에서 `'tool_call_request' as const` 사용 시
  TypeScript 에러
- **원인**: `LlmEvent` 유니온 타입은 `LlmEventType` enum 값을 요구
- **해결**: 모든 테스트 이벤트에 `LlmEventType.ToolCallRequest` 등 enum 값 사용,
  `LlmEvent` 타입 어노테이션 추가

---

## 📝 다음 작업

- [x] **M2.2.3**: StreamAssembler 적용 — EventMapper + StreamAssembler 통합
      파이프라인
- [x] **M2.2.4**: Gemini 에러 매핑 — errorClassifier + EventMapper isRetryable
- [ ] **M2.3**: Turn/Client 레벨 LlmEvent 전환 (processTurn → LlmEvent 스트림)

### 다음 작업에 전달할 이슈

| 이슈                                    | 영향                                          | 대응 방안                                     |
| --------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| `client.ts`의 24개 GeminiEventType 참조 | M2.3 전환 시 대규모 변경 예상                 | convertGeminiStreamWithReturn 활용            |
| `turn.ts`의 12개 이벤트 생성점          | Turn 반환 타입 변경 시 영향 범위 큼           | 단계적 전환 (내부 유지 → 출력만 변환)         |
| `ToolCallResponse.name = ''` 설계       | caller가 ToolCallRequestInfo로 name 보강 필요 | M2.3에서 enrichment 로직 검토                 |
| `createGeminiStreamPipelineWithReturn`  | client.ts의 Turn return value 보존 필요       | M2.3에서 WithReturn 변형 추가                 |
| InvalidStream reason 미전파             | turn.ts가 reason 없이 이벤트 생성             | M2.3에서 turn.ts InvalidStreamError.type 전달 |

---

### 2.2.4 Gemini 에러 매핑 ✅

| 항목                             | 상태 | 비고                                   |
| -------------------------------- | :--: | -------------------------------------- |
| Gemini SDK 에러 타입 분석        |  ✅  | StructuredError, ApiError, retry.ts    |
| errorClassifier.ts 구현          |  ✅  | HTTP status → LlmErrorType 매핑        |
| EventMapper mapErrorEvent 개선   |  ✅  | isRetryable 설정 (classifyGeminiError) |
| InvalidStream reason 인프라 준비 |  ✅  | types.ts + EventMapper (M2.3 연동용)   |
| Rate limit 매핑 (429)            |  ✅  | RATE_LIMIT, isRetryable: true          |
| Auth 매핑 (401/403)              |  ✅  | AUTHENTICATION, isRetryable: false     |
| index.ts export 추가             |  ✅  | classifyGeminiError, type 내보내기     |

**신규 파일**:

| 파일                                       | 설명                        |
| ------------------------------------------ | --------------------------- |
| `providers/gemini/errorClassifier.ts`      | Gemini 에러 분류기 (~70줄)  |
| `providers/gemini/errorClassifier.test.ts` | 에러 분류 TDD 테스트 (10개) |

**수정 파일**:

| 파일                                   | 변경 내용                                                        |
| -------------------------------------- | ---------------------------------------------------------------- |
| `providers/gemini/eventMapper.ts`      | mapErrorEvent에 isRetryable, mapInvalidStreamEvent에 reason 전파 |
| `providers/gemini/eventMapper.test.ts` | isRetryable 테스트 4개 + InvalidStream reason 테스트 2개 추가    |
| `providers/gemini/types.ts`            | ServerGeminiInvalidStreamEvent에 optional reason 추가            |
| `providers/gemini/index.ts`            | classifyGeminiError, GeminiErrorClassification export 추가       |

---

### 2.2.5 Telemetry 포맷 변경 ✅

| 항목                               | 상태 | 비고                                         |
| ---------------------------------- | :--: | -------------------------------------------- |
| 현재 Telemetry semantic 분석       |  ✅  | types.ts 4개, semantic.ts 6개 @google/genai  |
| `LlmTokenUsage` 확장               |  ✅  | `thoughtTokens`, `toolTokens` optional 추가  |
| `llmTokenUsageToGenAIUsage()` 구현 |  ✅  | LlmTokenUsage → GenAIUsageDetails 변환       |
| `genAIUsageToLlmTokenUsage()` 구현 |  ✅  | GenAIUsageDetails → LlmTokenUsage 역변환     |
| `ProviderApiResponseEvent` 구현    |  ✅  | LlmTokenUsage 수용 + provider 필드           |
| `ProviderApiErrorEvent` 구현       |  ✅  | provider 필드 포함 에러 이벤트               |
| index.ts export 추가               |  ✅  | telemetryBridge 내보내기                     |
| 라운드트립 변환 검증               |  ✅  | LlmTokenUsage ↔ GenAIUsageDetails 왕복 일치 |

**신규 파일**:

| 파일                                | 설명                               |
| ----------------------------------- | ---------------------------------- |
| `providers/telemetryBridge.ts`      | provider-agnostic telemetry 브릿지 |
| `providers/telemetryBridge.test.ts` | TDD 테스트 (13개)                  |

**수정 파일**:

| 파일                 | 변경 내용                                            |
| -------------------- | ---------------------------------------------------- |
| `providers/types.ts` | `LlmTokenUsage`에 `thoughtTokens`, `toolTokens` 추가 |
| `providers/index.ts` | telemetryBridge export 추가                          |

**Telemetry `@google/genai` 의존성 분석 결과**:

| 파일                    | @google/genai imports                                                                   | M2.2.5 범위      | 잔여 (M2.7)                |
| ----------------------- | --------------------------------------------------------------------------------------- | ---------------- | -------------------------- |
| `telemetry/types.ts`    | `Content`, `Candidate`, `GenerateContentConfig`, `GenerateContentResponseUsageMetadata` | UsageMetadata ✅ | Content, Candidate, Config |
| `telemetry/semantic.ts` | `FinishReason`, `Candidate`, `Content`, `ContentUnion`, `Part`, `PartUnion`             | —                | 전체 (M2.7)                |

---

## ✅ 테스트 결과

### M2.2 전체 테스트

```
telemetryBridge.test.ts      : 13 passed (M2.2.5 신규)
errorClassifier.test.ts      : 10 passed (기존, 회귀 확인)
eventMapper.test.ts          : 35 passed (기존, 회귀 확인)
streamConverter.test.ts      :  5 passed (기존, 회귀 확인)
loopDetectionService.test.ts : 53 passed (기존, 회귀 확인)
geminiStream.test.ts         : 15 passed (기존, 회귀 확인)
streamAssembler.test.ts      : 22 passed (기존, 회귀 확인)
────────────────────────────────────────
합계                          : 153 passed
```

### providers/ 전체 테스트

```
providers/ 디렉토리 전체: 297 passed (18 test files)
```

### TypeScript 컴파일

```
npx tsc --noEmit -p packages/core/tsconfig.json
→ 에러 없음 (clean)
```

---

## 🔖 커밋 정보

| 순서 | 커밋 ID     | 설명                                                |
| ---- | ----------- | --------------------------------------------------- |
| 1    | `819cadbd8` | M2.2.1 리뷰 수정 + M2.2.2 스트림 변환 + @deprecated |
| 2    | `06e426ae5` | M2.2.3 StreamAssembler 적용 — 통합 파이프라인       |
| 3    | `128ede2b9` | M2.2.4 Gemini 에러 매핑 — errorClassifier 구현      |
| 4    | 3af6fbfb6   | M2.2.5 Telemetry 포맷 변경 — telemetryBridge 구현   |

---

## ✅ 완료 기준 체크

- [x] 모든 테스트 통과 (153개 M2.2 + 297개 providers/)
- [x] TypeScript 컴파일 에러 없음
- [x] 체크리스트 최종 확인 (2.2.1 ✅, 2.2.2 ✅, 2.2.2a ✅, 2.2.3 ✅, 2.2.4 ✅,
      2.2.5 ✅)
- [x] 작업 결과서 업데이트
- [x] 커밋: 3af6fbfb6 (feat), f92e7ac79 (docs)
- [x] 이슈 전달: 다음 작업(M2.3)에 전달할 이슈 문서화

---

### 다음 작업에 전달할 이슈 (M2.2.5 추가분)

| 이슈                                             | 영향                                                   | 대응 방안                                              |
| ------------------------------------------------ | ------------------------------------------------------ | ------------------------------------------------------ |
| `telemetry/types.ts` Content/Candidate 잔여 결합 | ApiRequestEvent, ApiResponseEvent 시그니처 Gemini 전용 | M2.7에서 Provider-agnostic prompt/response 스키마 도입 |
| `telemetry/semantic.ts` 전체 Gemini 결합         | toInputMessages/toOutputMessages 등 Part 기반          | M2.7에서 LlmContent 기반 변환기로 교체                 |
| `loggingContentGenerator.ts` Gemini 타입 사용    | ApiResponseEvent 생성 시 UsageMetadata 직접 전달       | M2.3에서 ProviderApiResponseEvent 사용으로 전환        |

---

**최종 상태**: ✅ M2.2 전체 완료 (2.2.1~2.2.5)
