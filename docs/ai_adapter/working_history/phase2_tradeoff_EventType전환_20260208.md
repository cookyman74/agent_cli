# Phase 2 연기 항목 해소: EventType 전환 작업 결과서

> 📅 **작업일**: 2026-02-08 📚 **Phase**: Phase 2 연기 항목 해소 🎯 **목표**:
> GeminiEventType / ServerGeminiStreamEvent → LlmEventType / LlmEvent 전환 🔗
> **이전 작업**:
> [Phase2*ETC*연기작업정리\_20260208.md](./Phase2_ETC_연기작업정리_20260208.md)
> 🔗 **관련 문서**: [phase3_handoff.md](../todolist/phase3_handoff.md),
> [event-mapping-matrix.md](../event-mapping-matrix.md)

---

## 📋 작업 요약

### 배경

Phase 2 M2.2 (EventMapper 구현)에서 `LlmEventType` / `LlmEvent`를 신규
도입했으나, 기존 소비자(`turn.ts`, `client.ts`, `loopDetectionService.ts`,
`nonInteractiveCli.ts`, `useGeminiStream.ts`)가 여전히 `GeminiEventType` /
`ServerGeminiStreamEvent`를 참조하여 Phase 3 진입 전 전환이 필요했음.

### 접근 전략

**점진적 전환**: Core 내부 → Core 소비자 → CLI 소비자 순서로, 파일별
Red→Green→Refactor TDD 적용.

**작업 순서**: turn.ts → client.ts → loopDetectionService.ts →
nonInteractiveCli.ts → useGeminiStream.ts (각 파일의 소스 + 테스트 동시 전환)

---

## ✅ 변경 사항

### 변경 파일 목록 (16 files — 초기 11 + 리뷰 후 5)

| #   | 파일                                                      | 변경 내용                                                                                                                                            |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `packages/core/src/core/turn.ts`                          | `run()` 메서드: `ServerGeminiStreamEvent` yield → `LlmEvent` yield, `mapFinishReason`/`mapUsageMetadata` 헬퍼 추가, `LlmFinishReason` re-export 추가 |
| 2   | `packages/core/src/core/turn.test.ts`                     | 모든 mock event를 flat `LlmEvent` 구조로 전환 (281줄)                                                                                                |
| 3   | `packages/core/src/core/client.ts`                        | `turnLoop()`: `ServerGeminiStreamEvent` → `LlmEvent` 이벤트 소비, enum 값 변경                                                                       |
| 4   | `packages/core/src/core/client.test.ts`                   | mock stream events를 `LlmEvent` 구조로 전환 (132줄)                                                                                                  |
| 5   | `packages/core/src/services/loopDetectionService.ts`      | `addAndCheck()`: `LlmEvent` 단일 시그니처로 통합, deprecated `addAndCheckLlm` 제거                                                                   |
| 6   | `packages/core/src/services/loopDetectionService.test.ts` | interop 테스트 제거, 모든 이벤트 LlmEvent 형식으로 통일 (74줄)                                                                                       |
| 7   | `packages/core/src/providers/gemini/geminiStream.ts`      | 타입 import 미세 조정                                                                                                                                |
| 8   | `packages/cli/src/nonInteractiveCli.ts`                   | import `GeminiEventType` → `LlmEventType`, 이벤트 루프 flat field 접근                                                                               |
| 9   | `packages/cli/src/nonInteractiveCli.test.ts`              | `ServerGeminiStreamEvent` → `LlmEvent`, 43개 테스트 이벤트 payload 전환 (520줄)                                                                      |
| 10  | `packages/cli/src/ui/hooks/useGeminiStream.ts`            | import 정리, `FinishReason` 제거, 핸들러 시그니처 변경, switch문 20+ case 전환                                                                       |
| 11  | `packages/cli/src/ui/hooks/useGeminiStream.test.tsx`      | 58개 테스트 이벤트 payload flat 구조 전환 (222줄)                                                                                                    |

### 핵심 매핑 변경

| Before (Gemini-specific)                                                                    | After (Provider-independent)                                                   |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GeminiEventType.Content` / `event.value: string`                                           | `LlmEventType.TextDelta` / `event.text: string`                                |
| `GeminiEventType.Thought` / `event.value: ThoughtSummary`                                   | `LlmEventType.ThoughtDelta` / `event.thought + event.metadata`                 |
| `GeminiEventType.ToolCallRequest` / `event.value: ToolCallRequestInfo`                      | `LlmEventType.ToolCallRequest` / flat `callId, name, args, promptId`           |
| `GeminiEventType.Error` / `event.value: { error }`                                          | `LlmEventType.Error` / `event.error: Error \| string`                          |
| `GeminiEventType.Finished` / `event.value: { reason: FinishReason }`                        | `LlmEventType.Finished` / `event.finishReason: LlmFinishReason`                |
| `GeminiEventType.AgentExecutionStopped` / `event.value: { reason }`                         | `LlmEventType.AgentStopped` / flat `reason, systemMessage, contextCleared`     |
| `GeminiEventType.AgentExecutionBlocked` / `event.value: { reason }`                         | `LlmEventType.AgentBlocked` / flat `reason, systemMessage, contextCleared`     |
| `GeminiEventType.ChatCompressed` / `event.value: { originalTokenCount }`                    | `LlmEventType.ChatCompressed` / `event.originalTokens, event.compressedTokens` |
| `GeminiEventType.ContextWindowWillOverflow` / `event.value: { estimatedRequestTokenCount }` | `LlmEventType.ContextWindowOverflow` / `event.currentTokens, event.maxTokens`  |
| `GeminiEventType.Citation` / `event.value: string`                                          | `LlmEventType.Citation` / `event.citations: LlmCitation[]`                     |
| `GeminiEventType.ModelInfo` / `event.value: string`                                         | `LlmEventType.ModelInfo` / `event.modelName: string`                           |

### handleFinishedEvent 리팩토링

**Before**: Gemini `FinishReason` enum 15가지 각각에 대한 message 매핑
**After**: `LlmFinishReason` 3가지 유의미 reason에 대한 간결한 message 매핑

```typescript
const finishReasonMessages: Partial<Record<LlmFinishReason, string>> = {
  max_tokens: 'Response truncated due to token limits.',
  content_filter: 'Response stopped due to content filtering.',
  error: 'Response stopped due to an error.',
};
```

세부 reason (`SAFETY`, `RECITATION`, `BLOCKLIST` 등)은 `turn.ts`의
`mapFinishReason()`에서 `content_filter`로 통합 매핑됨.

---

## 🔍 Quality Gate 결과

| 검증 항목                       | 결과                                                   |
| ------------------------------- | ------------------------------------------------------ |
| TypeCheck (core)                | ✅ 0 errors                                            |
| TypeCheck (cli)                 | ✅ 0 errors                                            |
| TypeCheck (a2a-server)          | ✅ 0 errors                                            |
| Core tests                      | ✅ 4832 passed, 24 skipped                             |
| CLI tests - nonInteractiveCli   | ✅ 43/43 passed                                        |
| CLI tests - useGeminiStream     | ✅ 58/58 passed                                        |
| CLI tests - 전체                | ✅ 4599 passed, 3 failed (기존 locale 이슈, 변경 무관) |
| a2a-server tests                | ✅ 94/94 passed                                        |
| 잔존 old type 참조 (CLI)        | ✅ 0건 (ui/types.ts 로컬 enum 제외)                    |
| 잔존 old type 참조 (a2a-server) | ✅ 0건                                                 |
| getCurrentSequenceModel 경고    | ✅ 해소 (mock 누락 수정)                               |

### 기존 실패 테스트 (변경 무관)

| 파일                                       | 원인                                   |
| ------------------------------------------ | -------------------------------------- |
| `src/commands/mcp.test.ts`                 | Korean locale에서 영문 help text 기대  |
| `src/commands/extensions/install.test.ts`  | Korean locale에서 영문 yargs 에러 기대 |
| `src/commands/extensions/validate.test.ts` | Korean locale에서 영문 yargs 에러 기대 |

---

## 📊 영향 분석

### 하위 호환성

- `turn.ts` re-export (`GeminiEventType`, `ServerGemini*` types): **유지됨** —
  `@deprecated` 표시
- Core `index.ts` re-export chain: `LlmEventType`과 `GeminiEventType` 모두
  export
- 외부 소비자: 기존 `GeminiEventType` import 여전히 동작 (deprecated 경고만
  표시)

### 삭제된 항목

| 항목                                        | 파일                         | 사유                                                   |
| ------------------------------------------- | ---------------------------- | ------------------------------------------------------ |
| `addAndCheckLlm()` 메서드                   | loopDetectionService.ts      | `addAndCheck(LlmEvent)` 단일 메서드로 통합             |
| interop 테스트                              | loopDetectionService.test.ts | deprecated 메서드 제거로 불필요                        |
| `FinishReason` import                       | useGeminiStream.ts           | `@google/genai` 직접 의존 제거, `LlmFinishReason` 사용 |
| `GeminiErrorEventValue` 타입 참조           | useGeminiStream.ts           | `Error \| string` 직접 사용                            |
| `ServerGeminiChatCompressedEvent` 타입 참조 | useGeminiStream.ts           | flat field 파라미터로 대체                             |
| `ServerGeminiFinishedEvent` 타입 참조       | useGeminiStream.ts           | `LlmFinishReason` 파라미터로 대체                      |

---

## 🔄 리뷰 후 추가 수정 사항

> 📅 **수정일**: 2026-02-08 🔍 **트리거**: 코드 리뷰 피드백 (3건)

### 리뷰 이슈 검증 결과

| #   | 심각도   | 이슈                                                                        | 검증 결과                                     | 조치                 |
| --- | -------- | --------------------------------------------------------------------------- | --------------------------------------------- | -------------------- |
| 1   | **High** | `a2a-server/task.ts` return type `AsyncGenerator<ServerGeminiStreamEvent>`  | ✅ 확인 — TypeCheck 2 errors (lines 932, 973) | a2a-server 전체 전환 |
| 2   | **High** | `acceptAgentMessage` runtime risk — `GeminiEventType.Content + event.value` | ✅ 확인 — 런타임 불일치                       | switch 문 전체 전환  |
| 3   | **Low**  | `getCurrentSequenceModel is not a function` 경고                            | ✅ 확인 — mock 누락                           | mock 추가            |

### 추가 변경 파일 목록 (4 source + 2 test files)

| #   | 파일                                                 | 변경 내용                                                                                                                                                                                                                           |
| --- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12  | `packages/a2a-server/src/agent/task.ts`              | import: `GeminiEventType` → `LlmEventType`, `ServerGeminiStreamEvent` → `LlmEvent`; `acceptAgentMessage` switch 문 전체 전환 (flat field 접근); return types `AsyncGenerator<LlmEvent>`; Error 케이스 `ServerGeminiErrorEvent` 제거 |
| 13  | `packages/a2a-server/src/agent/executor.ts`          | import: `GeminiEventType` → `LlmEventType`; `ToolCallRequest` 감지 시 flat field → `ToolCallRequestInfo` 조립                                                                                                                       |
| 14  | `packages/a2a-server/src/agent/task.test.ts`         | import: `GeminiEventType` → `LlmEventType`; Citation/ModelInfo/Retry/InvalidStream 이벤트 + string literal 이벤트 flat 구조 전환                                                                                                    |
| 15  | `packages/a2a-server/src/http/app.test.ts`           | import: `GeminiEventType` → `LlmEventType`; 7개 ToolCallRequest `value` wrapper 제거 + flat fields; 5개 string literal content/thought 이벤트 전환                                                                                  |
| 16  | `packages/cli/src/ui/hooks/useGeminiStream.test.tsx` | `MockedGeminiClientClass`에 `getCurrentSequenceModel` mock 추가                                                                                                                                                                     |

### a2a-server 핵심 매핑 변경

| Before (a2a-server)                                                             | After                                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `GeminiEventType.Content` / `event.value`                                       | `LlmEventType.TextDelta` / `event.text`                                                          |
| `GeminiEventType.Thought` / `event.value` (ThoughtSummary)                      | `LlmEventType.ThoughtDelta` / `{ description: event.thought, subject: event.metadata?.subject }` |
| `GeminiEventType.Citation` / `event.value` (string)                             | `LlmEventType.Citation` / `event.citations.map(c => c.url).join('\\n')`                          |
| `GeminiEventType.ModelInfo` / `event.value`                                     | `LlmEventType.ModelInfo` / `event.modelName`                                                     |
| `GeminiEventType.Error` / `ServerGeminiErrorEvent` cast                         | `LlmEventType.Error` / `event.error: Error \| string`                                            |
| `GeminiEventType.ToolCallConfirmation` / `event.value.request.callId` + details | `LlmEventType.ToolCallConfirmation` / `event.callId` (details는 scheduler 관리)                  |
| executor: `event.value` → `toolCallRequests.push()`                             | executor: flat field → `ToolCallRequestInfo` 조립 (`callId, name, args, prompt_id`)              |

### ToolCallConfirmation 구조 변경 상세

기존 `acceptAgentMessage`의 `ToolCallConfirmation` case는
`event.value.details`를 `pendingToolConfirmationDetails` Map에 저장했으나,
`LlmToolCallConfirmationEvent`는 `callId`와 `confirmed` 필드만 제공.

**분석 결과**: `ToolCallConfirmation` 이벤트는 turn.ts/client.ts에서 yield되지
않음 (dead code). 실제 tool confirmation 흐름은 scheduler의
`shouldConfirmExecute` → `_schedulerToolCallsUpdate` 경로로 처리됨. 따라서 해당
case를 `event.callId` 로깅만 수행하는 간소화된 형태로 전환.

---

## 💡 Lessons Learned

1. **LlmTokenUsage 필수 필드**:
   `{ promptTokens, completionTokens, totalTokens }` 모두 필수 — 테스트에서
   `{ totalTokens: N }`만 사용하면 TypeCheck 실패
2. **Core 패키지 rebuild 필수**: CLI 테스트가 `@google/gemini-cli-core`를
   `dist/index.js`로 resolve → core 소스 변경 후 반드시
   `npm run build -w @google/gemini-cli-core` 실행
3. **flat event 구조에서 ToolCallRequestInfo 조립**: `LlmEvent`의 `promptId`
   (camelCase) → `ToolCallRequestInfo`의 `prompt_id` (snake_case) 변환 필요
4. **문자열 리터럴 타입 mock**: 테스트에서 `{ type: 'content' }` 같은 문자열
   리터럴을 사용하면 새 enum 값과 불일치 — enum을 사용하도록 통일
5. **Dead code 식별**: `acceptAgentMessage`의 `ToolCallConfirmation` case —
   이벤트 소스(turn.ts/client.ts)에서 yield하지 않는 이벤트 처리 코드는 dead
   code일 수 있음. 변환 시 이벤트 생성 경로를 추적하여 실제 도달 가능성을
   확인해야 함
6. **Mock 메서드 누락 경고**: Mock 객체에서 실제 코드가 호출하는 메서드가
   누락되면 "is not a function" 런타임 경고 발생. Mock 생성 시 호출 대상 메서드
   전수 확인 필요

---

## 📌 잔여 사항

| 항목                                   | 상태    | 비고                                       |
| -------------------------------------- | ------- | ------------------------------------------ |
| `ui/types.ts`의 로컬 `GeminiEventType` | ⏸️ 유지 | UI 상태 관리용 로컬 enum, core enum과 무관 |
| `turn.ts` @deprecated re-exports       | ⏸️ 유지 | Phase 3에서 제거 예정                      |
| `core/index.ts` dual export            | ⏸️ 유지 | 하위 호환 보장, Phase 3 최종 정리 시 제거  |
