# M3.0.3 작업 결과서 — 텔레메트리/Agent 레이어 독립화

- **작업일**: 2026-02-09
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료

## 작업 목표

텔레메트리 및 Agent 레이어에서 `@google/genai` SDK 직접 의존성을 제거하여
프로바이더 독립적 구조를 확보한다.

## 작업 순서 및 결과

| 순서 | Sub-task | 작업 내용                                                                    | 테스트 결과           |
| ---- | -------- | ---------------------------------------------------------------------------- | --------------------- |
| 1    | 3.0.3.5  | `sdk.ts` SIGTERM/SIGINT 핸들러 누수 수정                                     | 19/19 PASS (신규 3건) |
| 2    | 3.0.3.4  | `types.ts` `GenerateContentResponseUsageMetadata` → `TelemetryUsageMetadata` | 36/36 PASS            |
| 3    | 3.0.3.2  | `semantic.ts` Part/Content/Candidate/FinishReason 독립화 (7 types + enum)    | 21/21 PASS            |
| 4    | 3.0.3.1  | `loggingContentGenerator.ts` + `types.ts` @google/genai import 완전 제거     | 11/11 + 36/36 PASS    |
| 5    | 3.0.3.3  | `LocalAgentExecutor` AgentChatSession 인터페이스 + factory 패턴 도입 (Q5)    | 38/38 + 26/26 PASS    |

## 변경 파일 상세

### 3.0.3.5: Signal Handler Leak Fix

**파일**: `telemetry/sdk.ts`, `telemetry/sdk.test.ts`

- `initializeTelemetry()`에서 등록한 SIGTERM/SIGINT 핸들러를 named reference로
  변경
- `shutdownTelemetry()` finally 블록에서 `process.removeListener()` 호출
- 핸들러 누적 방지: MaxListenersExceededWarning 경고 해소
- **[리뷰 반영]** 시그널 핸들러 등록을 `sdk.start()` 성공 후(try 블록 내부)로
  이동하여, start 실패 시 핸들러 미등록 보장 (신규 테스트 1건 추가)

### 3.0.3.4: TelemetryUsageMetadata 독립화

**파일**: `telemetry/types.ts`

- `GenerateContentResponseUsageMetadata` SDK import → 로컬
  `TelemetryUsageMetadata` 인터페이스
- 필드: `promptTokenCount`, `candidatesTokenCount`, `cachedContentTokenCount`,
  `thoughtsTokenCount`, `toolUsePromptTokenCount`, `totalTokenCount`
- TypeScript structural typing으로 SDK 객체 호환 유지

### 3.0.3.2: semantic.ts 타입 독립화

**파일**: `telemetry/semantic.ts`

- `@google/genai` import 완전 제거 (runtime + type 모두)
- 6개 로컬 타입 정의:
  - `TelemetryPart` — toOTelPart()에서 사용하는 필드만 포함
  - `TelemetryContent` — parts + role
  - `TelemetryContentUnion` — systemInstruction용 union
  - `TelemetryPartUnion` — Part | string
  - `TelemetryCandidate` — content + finishReason
- `FinishReason` enum → `GeminiFinishReason` const 객체 (문자열 리터럴)
- `OutputMessage.finish_reason` 타입: `FinishReason | string` → `string`

### 3.0.3.1: loggingContentGenerator + types.ts 독립화

**파일**: `core/loggingContentGenerator.ts`, `telemetry/types.ts`,
`core/contentGenerator.ts`

**types.ts 추가 변경**:

- `Content` → `TelemetryContent` (semantic.ts에서)
- `Candidate` → `TelemetryCandidate` (semantic.ts에서)
- `GenerateContentConfig` → `TelemetryGenerateConfig` (로컬 인터페이스)
- `@google/genai` import 완전 제거

**contentGenerator.ts**:

- `GenerateContentParameters`, `GenerateContentResponse` 등 6개 SDK 타입
  re-export 추가

**loggingContentGenerator.ts**:

- interface method 타입: `contentGenerator.ts` re-export 경유
- telemetry 타입: `TelemetryContent`, `TelemetryCandidate`,
  `TelemetryGenerateConfig`, `TelemetryUsageMetadata`
- `@google/genai` import 완전 제거

### 3.0.3.3: AgentChatSession 인터페이스 도입 (Q5)

**파일**: `agents/types.ts`, `agents/local-executor.ts`,
`services/chatCompressionService.ts`

**AgentChatSession 인터페이스** (`agents/types.ts`):

```typescript
export interface AgentChatSession {
  sendMessageStream(...): Promise<AsyncGenerator<StreamEvent>>;
  setHistory(history: Content[]): void;
  getHistory(curated?: boolean): Content[];
  getLastPromptTokenCount(): number;
}
```

**ChatSessionFactory 타입** (`agents/types.ts`):

```typescript
export type ChatSessionFactory = (
  config: Config,
  systemInstruction: string | undefined,
  tools: Tool[],
  history: Content[],
) => AgentChatSession;
```

**LocalAgentExecutor 변경**:

- `new GeminiChat()` 직접 호출 → `this.chatFactory()` factory 호출
- 모든 private 메서드의 `chat: GeminiChat` → `chat: AgentChatSession`
- `create()` static method에 optional `chatFactory` 파라미터 추가
- default factory: `defaultChatSessionFactory` (GeminiChat 생성)
- **[리뷰 반영]** `chatFactory` 주입 경로 회귀 테스트 추가
  (`local-executor.test.ts`): custom factory 주입 시 GeminiChat 미호출 검증

**ChatCompressionService 변경**:

- `compress(chat: GeminiChat)` → `compress(chat: AgentChatSession)`
- `client.ts` 호출자: GeminiChat이 AgentChatSession을 구조적으로 만족하므로 변경
  불필요

## Quality Gate

| 항목       | 결과                                                         |
| ---------- | ------------------------------------------------------------ |
| TypeCheck  | ✅ PASS                                                      |
| ESLint     | ✅ PASS                                                      |
| Core Tests | ✅ 260 files / 4853 passed (baseline 4849 + 신규 2 + 리뷰 2) |

## @google/genai 제거 현황

| 파일                              | Before                   | After                                   |
| --------------------------------- | ------------------------ | --------------------------------------- |
| `telemetry/sdk.ts`                | 0 imports                | 0 imports (핸들러 누수만 수정)          |
| `telemetry/types.ts`              | 3 type imports           | 0 imports ✅                            |
| `telemetry/semantic.ts`           | 1 value + 5 type imports | 0 imports ✅                            |
| `core/loggingContentGenerator.ts` | 10 type imports          | 0 imports ✅                            |
| `agents/local-executor.ts`        | 1 value + 5 type imports | 1 value + 6 type imports (factory 내부) |

> **Note — Agent 독립화 범위 명확화 [리뷰 반영]**:
>
> M3.0.3에서 달성한 것은 **구조적 결합 해소**(factory 패턴)이며, **타입 수준의
> 완전 독립화는 아님**. `AgentChatSession` 인터페이스 자체가 `StreamEvent`
> (`providers/gemini/chat.ts`), `Content`, `Tool` (`@google/genai`) 등 Gemini
> 전용 타입에 여전히 의존한다.
>
> - 달성: GeminiChat **클래스** 직접 결합 제거 → factory 주입으로 구현체 교체
>   가능
> - 미달성: AgentChatSession **메서드 시그니처** 의 프로바이더 중립 타입 전환
> - 향후: agent 레이어 전체의 타입 독립화는 Phase 3 후반부(M3.1+ 신규 프로바이더
>   구현 시) 범위. `Content` → `LlmMessage`, `StreamEvent` → `LlmStreamEvent`,
>   `Tool` → `LlmTool` 등 점진적 전환 예정.

## 설계 결정

### Q5: AgentChatSession 인터페이스 형태

- **결정**: 잠정 방안 그대로 적용 — `AgentChatSession` 추상 인터페이스 +
  `ChatSessionFactory` 타입
- **근거**: GeminiChat 직접 결합만 해소하고, 전체 타입 독립화는 점진적으로 진행
- **향후**: 다른 프로바이더 구현 시 factory를 교체하여 chat session 주입 가능

### Q6: Telemetry Usage 스키마

- **결정**: `TelemetryUsageMetadata` 로컬 인터페이스 (SDK 6개 필드 동일)
- **근거**: structural typing으로 SDK 객체 호환 유지, provider-independent

## 커밋

- `6a09c831d` — refactor(providers): M3.0.3 — 텔레메트리/Agent 레이어
  @google/genai 독립화
- `83c71856b` — docs: M3.0.3 작업 결과서

## 리뷰 반영 (2026-02-09)

### 이슈 #1 [Medium]: sdk.start() 실패 시 시그널 핸들러 누수

- **현상**: `initializeTelemetry()`가 `sdk.start()` 실패 여부와 무관하게
  SIGTERM/SIGINT 핸들러를 등록. `shutdownTelemetry()`는
  `telemetryInitialized=false`일 때 조기 반환하여 핸들러 제거 로직에 도달 불가.
  반복 실패 시 핸들러 누적.
- **수정**: 시그널 핸들러 등록을 try 블록 내부, `telemetryInitialized = true`
  이후로 이동. SDK가 시작되지 않으면 핸들러 자체가 등록되지 않으므로 누수 원천
  차단.
- **테스트**: `should not register signal handlers when sdk.start() fails` 신규
  추가 (19/19 PASS)

### 이슈 #2 [Low]: ChatSessionFactory 주입 경로 회귀 테스트 부재

- **현상**: `create()` static method에 `chatFactory` 파라미터가 추가되었으나,
  custom factory 주입 시 정상 동작을 검증하는 테스트 케이스 없음.
- **수정**: `should use custom chatFactory when provided` 테스트 추가. custom
  factory 주입 → GeminiChat 생성자 미호출 + custom factory 1회 호출 검증.
- **테스트**: 38/38 PASS (신규 1건)

### 이슈 #3 [Low]: Agent 레이어 독립화 부분 완료 상태

- **현상**: `AgentChatSession` 인터페이스가 `StreamEvent`, `Content`, `Tool` 등
  Gemini 전용 타입에 여전히 의존. 구조적 결합(factory 패턴)은 해소되었으나 타입
  수준의 완전 독립화는 미달성.
- **판정**: 코드 수정 불요 — M3.0.3 범위는 "GeminiChat 클래스 직접 결합
  해소"이며, agent 레이어 전체의 타입 독립화는 Phase 3 후반부(M3.1+ 신규
  프로바이더 구현 시) 범위로 명시.
- **조치**: 작업 결과서 Note 섹션에 달성/미달성 범위 및 향후 전환 계획 명확화.

### 리뷰 반영 Quality Gate

| 항목       | 결과                                              |
| ---------- | ------------------------------------------------- |
| TypeCheck  | ✅ PASS                                           |
| ESLint     | ✅ PASS                                           |
| Core Tests | ✅ 260 files / 4853 passed (신규 2건)             |
| 변경 파일  | `sdk.ts`, `sdk.test.ts`, `local-executor.test.ts` |
