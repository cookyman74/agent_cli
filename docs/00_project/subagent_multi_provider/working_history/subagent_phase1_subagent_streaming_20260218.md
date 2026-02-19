# Phase 1: Category A — 서브에이전트 스트리밍 경로 작업 기록

**작업일**: 2026-02-18 **작업자**: AI Assistant **브랜치**:
`v0.2.0/se_manager_agent` **이전 작업**: 없음 (Phase 1 — 최초 작업) **관련
문서**:

- [main_todolist_20260218.md](../main_todolist_20260218.md)
- [phase1_subagent_streaming.md](../phase_todolist/phase1_subagent_streaming.md)
- [plan_20260218.md](../plan_20260218.md) — §5.A + §5.B.1

---

## 작업 개요

### 목표

- non-Gemini 프로바이더(Claude, OpenAI)에서 로컬 서브에이전트(Codebase
  Investigator, CLI Help, Generalist)가 실행 가능하도록 수정
- `fixToolResultRoles()` 공유 유틸리티 선행 구현 (role 변환 + multi-tool_result
  분할)
- `LlmAgentChatSession` 신규 생성 (LlmEvent → StreamEvent 변환 브릿지)
- `local-invocation.ts`에 non-Gemini provider 감지 시 chatFactory 주입

### 근본 원인

`LocalSubagentInvocation.execute()`가 `LocalAgentExecutor.create()`에
`chatFactory`를 전달하지 않음 → `defaultChatSessionFactory`가 항상 `GeminiChat`
생성 → `generateContentStream()` (레거시 메서드) 호출 → non-Gemini 어댑터에서
throw: `Provider "claude" does not support legacy Gemini API. Use llm* methods.`

### 작업 범위

- **파일 생성**:
  - `packages/core/src/core/llmMessageUtils.ts`: fixToolResultRoles 공유
    유틸리티 (~90줄)
  - `packages/core/src/core/llmMessageUtils.test.ts`: 14개 테스트 케이스
    (~327줄)
  - `packages/core/src/agents/llmAgentChatSession.ts`: LlmAgentChatSession +
    convertLlmEventToStreamEvent (~360줄)
  - `packages/core/src/agents/llmAgentChatSession.test.ts`: 23개 테스트 케이스
    (~570줄)
- **파일 수정**:
  - `packages/core/src/agents/local-invocation.ts`:
    buildChatFactoryIfNonGemini() 메서드 추가 (+55줄)
  - `packages/core/src/agents/local-invocation.test.ts`: non-Gemini factory 주입
    테스트 3건 추가 (+80줄)

---

## 🔴 Red Phase (테스트 작성)

### 1.2 fixToolResultRoles 테스트 (14개)

| #   | 테스트                                                                      | 설명                                 |
| --- | --------------------------------------------------------------------------- | ------------------------------------ |
| 1   | `changes role to tool for user message with only valid tool_result content` | tool_result-only user → role: 'tool' |
| 2   | `keeps user role for text-only messages`                                    | 텍스트 메시지 무변경                 |
| 3   | `keeps user role for mixed content (text + tool_result)`                    | 혼합 content 무변경                  |
| 4   | `keeps user role for empty content`                                         | 빈 content 가드                      |
| 5   | `does not change assistant role`                                            | assistant role 무변경                |
| 6   | `does not change system role`                                               | system role 무변경                   |
| 7   | `keeps user role when tool_result has empty toolCallId`                     | 빈 toolCallId 가드 [2차 #4]          |
| 8   | `keeps user role when some tool_results have empty toolCallId`              | 부분 빈 toolCallId                   |
| 9   | `splits multi-tool_result message into individual tool messages`            | 분할 검증 [3차 #1]                   |
| 10  | `does not split single tool_result message`                                 | 단일은 분할 안 함                    |
| 11  | `does not split when any toolCallId is empty (keeps as user)`               | 빈 id면 분할 안 함                   |
| 12  | `preserves non-tool_result messages unchanged in sequence`                  | 시퀀스 보존                          |
| 13  | `returns empty array for empty input`                                       | 빈 배열                              |
| 14  | `handles multiple messages with various roles`                              | 복합 시퀀스                          |

**RED 확인**: `npm test -w @didim365/agent-cli-core -- src/core/llmMessageUtils`
→ 14 FAILED ✅

### 1.3 LlmAgentChatSession 테스트 (23개)

| 그룹                         | 테스트 수 | 주요 검증                                                                                                                                                            |
| ---------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| convertLlmEventToStreamEvent | 10        | TextDelta→CHUNK, ThoughtDelta→CHUNK(thought:true), ToolCallRequest→CHUNK(functionCalls), Retry→RETRY, AgentStopped/Blocked→해당 타입, Finished/MessageEnd/Error→null |
| sendMessageStream            | 7         | 모델 해석(resolveProviderModel), request.model override, fixToolResultRoles 적용, user content history 추가, Error→throw 전파, AbortSignal 전달                      |
| history management           | 4         | streaming 전 user 추가, streaming 후 model 추가, error 시 미추가, setHistory/getHistory                                                                              |
| getLastPromptTokenCount      | 2         | Finished/MessageEnd usage로 갱신                                                                                                                                     |

**RED 확인**:
`npm test -w @didim365/agent-cli-core -- src/agents/llmAgentChatSession` → 23
FAILED ✅

### 1.3.3 local-invocation factory 주입 테스트 (3개)

| #   | 테스트                                                                    | 설명                            |
| --- | ------------------------------------------------------------------------- | ------------------------------- |
| 1   | `passes chatFactory to LocalAgentExecutor.create for non-Gemini provider` | non-Gemini + llm\* → 4인자 호출 |
| 2   | `does not pass chatFactory for Gemini provider`                           | Gemini → 3인자 호출             |
| 3   | `does not pass chatFactory for non-Gemini without llm* support`           | llm\* 미지원 → 3인자 호출       |

**RED 확인**:
`npm test -w @didim365/agent-cli-core -- src/agents/local-invocation` → 1 FAILED
(신규 테스트) ✅

---

## 🟢 Green Phase (구현)

### 1.2.2 llmMessageUtils.ts 구현

- `isValidToolResult()`: content가 tool_result + 비어있지 않은 toolCallId인지
  검사하는 type guard
- `fixToolResultRoles()`:
  1. user role만 처리, 나머지 pass-through
  2. 빈 content 가드 (vacuous truth 방지)
  3. `every(isValidToolResult)` — 전부 유효한 tool_result인지 검사
  4. 단일 tool_result → role 변경만
  5. 다중 tool_result → 개별 메시지로 분할 + role 변경 [3차 #1]

**GREEN 확인**: 14/14 PASS ✅

### 1.4.1 LlmAgentChatSession 구현

- `convertLlmEventToStreamEvent()`: LlmEvent → StreamEvent 변환 함수
  - TextDelta →
    `{ type: CHUNK, value: { candidates: [{ content: { parts: [{ text }] } }] } }`
  - ThoughtDelta →
    `{ type: CHUNK, value: { candidates: [{ content: { parts: [{ text, thought: true }] } }] } }`
  - ToolCallRequest →
    `{ type: CHUNK, value: { candidates: [...], functionCalls: [...] } }`
  - Retry → `{ type: RETRY }`
  - AgentStopped/Blocked → 해당 타입
  - 나머지 → null

- `LlmAgentChatSession` class (DI 패턴):
  - constructor: 모든 외부 함수 주입 (resolveProviderModelFn, buildLlmRequestFn,
    fixToolResultRolesFn, convertContentsToLlmMessagesFn)
  - `sendMessageStream()`: PartListUnion→Part[] 변환, history 추가, request
    빌드, fixToolResultRoles 적용, model override, 스트림 호출
  - `processEventStream()`: usage 추적(Finished/MessageEnd), Error→throw,
    텍스트/toolCall 축적, history 추가
  - `addModelResponseToHistory()`: 텍스트 + functionCall parts를 model Content로
    추가

**GREEN 확인**: 23/23 PASS ✅

### 1.4.2 local-invocation.ts factory 주입

- `buildChatFactoryIfNonGemini()` private 메서드 추가:
  - `config.getContentGenerator()` try-catch (fake config에서 undefined 반환 시
    안전 처리)
  - provider 감지:
    `providerName == null || 'gemini' || !isProviderIndependentGenerator` →
    undefined
  - non-Gemini + llm\* → `LlmAgentChatSession` factory 반환
- `execute()` 수정: chatFactory 존재 시 4인자 호출, 미존재 시 3인자 호출 (기존
  테스트 호환)

**GREEN 확인**: 14/14 PASS ✅

---

## ✅ 검증 결과

### 테스트 실행 결과

```bash
# fixToolResultRoles
npm test -w @didim365/agent-cli-core -- src/core/llmMessageUtils
# 결과: 14/14 PASS

# LlmAgentChatSession + 전체 에이전트
npm test -w @didim365/agent-cli-core -- src/agents/
# 결과: 210/210 PASS (16 test files)

# 종합 (agents + core utils)
# 결과: 224/224 PASS (17 test files)
```

**결과**:

- 통과: 224/224 테스트
- 실패: 0/224 테스트
- 기존 테스트 회귀: 없음

### TypeScript 컴파일 체크

```bash
npm run typecheck -w @didim365/agent-cli-core
# 결과: ✅ 에러 0개
```

### Linter 결과

```bash
npm run lint -w @didim365/agent-cli-core
# 결과: ✅ 경고 0개, 에러 0개
```

---

## 🐛 이슈 및 해결

### 이슈 1: getContentGenerator() undefined 반환

- **증상**: `buildChatFactoryIfNonGemini()`에서 `config.getContentGenerator()`
  호출 시 `Cannot read properties of undefined (reading 'providerName')` — 기존
  6개 테스트 실패
- **원인**: `makeFakeConfig()`가 `getContentGenerator()`를 구현하지 않아
  undefined 반환
- **해결**: try-catch로 감싸서 예외 시 undefined 반환

### 이슈 2: create() 호출 인자 수 불일치

- **증상**: 기존 테스트가 `create(definition, config, onActivity)` 3인자를
  expect하나, 수정 후 항상 4인자(4번째=undefined) 전달
- **원인**: `chatFactory ?? undefined`를 항상 4번째 인자로 전달
- **해결**: 삼항 연산자로 조건부 호출 —
  `chatFactory ? create(4 args) : create(3 args)`

### 이슈 3: LlmTokenUsage import 경로

- **증상**: TS2459 — `LlmTokenUsage` not exported from `events.js`
- **원인**: `LlmTokenUsage`는 `providers/types.js`에 정의
- **해결**: import 경로를 `'../providers/types.js'`로 변경

### 이슈 4: llmGenerateContentStream 반환 타입

- **증상**: TS2322 — `Promise<AsyncGenerator<LlmEvent>>`와 실제 반환 타입 불일치
- **원인**: `LlmEventStream = AsyncGenerator<LlmEvent, void, unknown>` (Promise
  래핑 없음)
- **해결**: 인터페이스에서 Promise 제거, `await` 제거, 테스트에서
  `mockResolvedValue` → `mockReturnValue`

### 이슈 5: PartListUnion → Part[] 타입 변환

- **증상**: TS2322 — `PartUnion[]`이 `Part[]`에 할당 불가
- **원인**: `PartUnion = Part | string`, `Array.isArray`가 `PartUnion[]`로만
  좁힘
- **해결**: `.map((p) => typeof p === 'string' ? { text: p } : p)` 변환

### 이슈 6: SDK Part 타입에 type 필드 없음

- **증상**: TS2353 — `{ type: 'text', text: ... }` 사용 시 Part에 type 필드 없음
- **원인**: `@google/genai` SDK의 `Part`는 discriminated union이 아닌 optional
  필드 패턴
- **해결**: 테스트에서 `[{ type: 'text', text: ... }]` → `[{ text: ... }]`

### 이슈 7: Content.role 타입

- **증상**: TS2322 — `Content.role`이 `string | undefined`
- **원인**: SDK에서 role이 optional 정의
- **해결**: 명시적 타입 선언 대신 `session.getHistory()` 직접 사용

### 이슈 8: 라이선스 헤더 누락

- **증상**: ESLint headers/header-format 에러
- **해결**: 4개 신규 파일 모두에 `@license` + `Copyright 2025 Google LLC` +
  `SPDX-License-Identifier: Apache-2.0` 추가

### 이슈 9: 미사용 eslint-disable 지시문

- **증상**: 불필요한
  `eslint-disable-next-line @typescript-eslint/no-unused-vars`
- **해결**: `const _ of gen` → `const _event of gen` (eslint-disable 제거)

---

## 📝 다음 단계

- [ ] Phase 2: Category B — `BaseLlmClient._generateWithRetry()` 레거시 호출을
      `llmGenerateContent()` 경로로 분기
  - 상세 계획:
    [phase2_basellmclient.md](../phase_todolist/phase2_basellmclient.md)
  - 사전 확인: Phase 1 결과서(본 문서) 리뷰 후 착수

### Phase 2 전달사항

1. **fixToolResultRoles() 재사용**: Phase 2의 `BaseLlmClient`에서도
   `fixToolResultRoles()`를 import하여 사용 (이미 `core/llmMessageUtils.ts`에
   구현 완료)
2. **DI 패턴**: `LlmAgentChatSession`은 DI 패턴으로 모든 외부 함수를 주입받음.
   Phase 2에서 유사 패턴 적용 시 참고
3. **GenerateContentResponse 부분 구성**: `as GenerateContentResponse` 캐스팅
   사용. local-executor가 접근하는 필드만 채움 (`candidates[0].content.parts`,
   `functionCalls`, `parts.find(p => p.thought).text`)
4. **미해결 이슈**: orphan tool message (대응 assistant tool_call 없는 tool
   메시지) — 정상 플로우에서는 LlmResponseAccumulator가 페어링 유지하므로
   발생하지 않음. 히스토리 truncation 도입 시 검토 필요

---

## 📊 커밋 요약

| 순서 | 커밋 ID     | 타입  | 설명                                                             | 테스트 |
| ---- | ----------- | ----- | ---------------------------------------------------------------- | ------ |
| 1    | `aff625923` | GREEN | fixToolResultRoles 유틸리티 (role 변환 + multi-tool_result 분할) | ✅     |
| 2    | `b634b846f` | GREEN | LlmAgentChatSession (LlmEvent→StreamEvent 변환 + DI 패턴)        | ✅     |
| 3    | `144f63ff3` | GREEN | local-invocation non-Gemini chatFactory 주입                     | ✅     |
| 4    | `c63468808` | DOC   | 설계서 및 작업계획서                                             | -      |

**총 커밋 수**: 4개

---

## ✅ 완료 기준 체크

- [x] RED: fixToolResultRoles 유틸 + 빈 toolCallId 가드 테스트
- [x] RED: multi-tool_result 분할 테스트 [3차 #1]
- [x] GREEN: llmMessageUtils.ts 구현 (role 변환 + 분할) + 테스트 통과
- [x] RED: LlmAgentChatSession 변환 테스트 작성
- [x] RED: Error→throw, Finished+MessageEnd usage 테스트 작성
- [x] RED: fixToolResultRoles 적용 + 분할 테스트 (Category A)
- [x] RED: local-invocation factory 주입 테스트 작성
- [x] GREEN: LlmAgentChatSession 구현 (resolvedConfig.model 기반) + 통과 [4차
      #1]
- [x] GREEN: local-invocation 수정 + 테스트 통과
- [x] REFACTOR: Phase 1 구조 개선 (typecheck + lint clean)
- [x] Phase 1 커밋 완료 (4건)
- [x] 완료 조건 체크표시 + 작업 결과서 작성

### Quality Gates

- [x] 모든 단위 테스트 통과 (224/224)
- [x] TypeScript 컴파일 에러 없음
- [x] ESLint 경고 없음
- [x] 기존 테스트 회귀 없음
- [x] 문서 업데이트 완료

---

## 🔍 리뷰 Finding 해결 (2026-02-18)

### Finding #1 [HIGH] — generateContentConfig 유실

**문제**: non-Gemini 서브에이전트 경로에서
`generateContentConfig`(temperature/topP/maxOutputTokens 등)가 유실됨.
`local-executor.ts`가 `modelConfigKey`에 `{ model, overrideScope }` 전달하지만,
`LlmAgentChatSession.sendMessageStream()`은 `model`만 사용하고 generation
파라미터를 무시.

**원인 검증**: ✅ 확인됨

- GeminiChat은 `sendMessageStream()` 내부에서
  `getResolvedConfig(modelConfigKey)`를 호출하여 `generateContentConfig`를 자체
  해석
- LlmAgentChatSession은 `modelConfigKey.model`만 사용

**해결**:

- `ResolvedGenerateConfig` 인터페이스 신규 정의 (temperature, topP, topK,
  maxOutputTokens, stopSequences)
- `LlmAgentChatSessionOptions`에 `resolveGenerateConfigFn?` DI 추가
- `sendMessageStream()`에서 `resolveGenerateConfigFn(modelConfigKey)` 호출 후
  request에 병합 (maxOutputTokens → maxTokens 매핑)
- `local-invocation.ts` factory에서
  `config.modelConfigService.getResolvedConfig(key).generateContentConfig` 주입

**변경 파일**: `llmAgentChatSession.ts`, `local-invocation.ts`

### Finding #2 [MEDIUM] — getHistory() 내부 배열 노출

**문제**: `getHistory(_curated?)` 가 `this.history` 참조를 직접 반환. 외부
mutate 시 내부 상태 오염 가능.

**원인 검증**: ✅ 확인됨

- GeminiChat은 `extractCuratedHistory()` + `structuredClone()` 사용
- LlmAgentChatSession은 raw 참조 반환

**해결**: `return structuredClone(this.history)` — GeminiChat 계약과 동일한 deep
copy 반환

**변경 파일**: `llmAgentChatSession.ts`

### Finding #3 [MEDIUM] — non-Gemini + llm\* 미지원 시 late failure

**문제**: `buildChatFactoryIfNonGemini()`에서 non-Gemini인데 `llm*` 미지원 시
`undefined` 반환 → `defaultChatSessionFactory` → `GeminiChat` → legacy API 호출
→ 늦은 에러.

**원인 검증**: ✅ 확인됨

- 기존 코드:
  `providerName == null || 'gemini' || !isProviderIndependentGenerator` 모두
  `return undefined`

**해결**: 조건 분리

- `providerName == null || 'gemini'` → `return undefined` (정상: Gemini default
  factory 사용)
- `!isProviderIndependentGenerator(generator)` → `throw new Error(...)`
  (fail-fast: 명확한 에러 메시지)
- `execute()` try-catch에서 잡혀서 `ToolErrorType.EXECUTION_FAILED` 결과로
  반환됨

**변경 파일**: `local-invocation.ts`

### Finding #4 [LOW] — 누락 테스트 케이스

**추가된 테스트**:

| 파일                          | 테스트명                                                                          | Finding |
| ----------------------------- | --------------------------------------------------------------------------------- | ------- |
| `llmAgentChatSession.test.ts` | `applies generation config from resolveGenerateConfigFn to request`               | #1      |
| `llmAgentChatSession.test.ts` | `does not override request fields when resolveGenerateConfigFn returns undefined` | #1      |
| `llmAgentChatSession.test.ts` | `getHistory returns deep copy — external mutation does not affect internal state` | #2      |
| `local-invocation.test.ts`    | `fails fast for non-Gemini provider without llm* methods` (기존 테스트 수정)      | #3      |

### Finding #5 [MEDIUM] — setHistory() 후 토큰 수 캐시 불일치

**문제**: `setHistory()`가 history만 교체하고 `lastPromptTokenCount`를
재계산하지 않음. 압축 서비스(`chatCompressionService.ts:267`)가
`getLastPromptTokenCount()`로 임계치 판단하므로, 압축 직후 턴에서 왜곡 가능.

**원인 검증**: ✅ 확인됨

- GeminiChat(`chat.ts:687-691`)은 `setHistory()` 시 `estimateTokenCountSync()`로
  즉시 재계산
- LlmAgentChatSession은 재계산 없이 stale 값 유지

**해결**: `setHistory()`에서 GeminiChat과 동일하게
`estimateTokenCountSync(this.history.flatMap(c => c.parts || []))` 호출하여
`lastPromptTokenCount` 갱신

**변경 파일**: `llmAgentChatSession.ts` **추가 테스트**:
`recalculates token count after setHistory [리뷰 #5]`

### 리뷰 후 검증 결과

```bash
# 대상 테스트
npm test -w @didim365/agent-cli-core -- src/agents/llmAgentChatSession.test.ts src/agents/local-invocation.test.ts
# 결과: 41/41 PASS (기존 37 + 신규 4)

# TypeScript
npm run typecheck
# 결과: ✅ 에러 0개

# ESLint
npx eslint packages/core/src/agents/llmAgentChatSession.ts packages/core/src/agents/local-invocation.ts
# 결과: ✅ 경고 0개, 에러 0개
```

---

**작업 완료 시간**: 2026-02-18 (리뷰 #5 반영: 2026-02-19) **최종 상태**: ✅ 완료
(리뷰 Finding #1~#5 반영 포함)
