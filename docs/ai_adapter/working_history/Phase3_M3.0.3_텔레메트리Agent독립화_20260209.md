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
| 1    | 3.0.3.5  | `sdk.ts` SIGTERM/SIGINT 핸들러 누수 수정                                     | 18/18 PASS (신규 2건) |
| 2    | 3.0.3.4  | `types.ts` `GenerateContentResponseUsageMetadata` → `TelemetryUsageMetadata` | 36/36 PASS            |
| 3    | 3.0.3.2  | `semantic.ts` Part/Content/Candidate/FinishReason 독립화 (7 types + enum)    | 21/21 PASS            |
| 4    | 3.0.3.1  | `loggingContentGenerator.ts` + `types.ts` @google/genai import 완전 제거     | 11/11 + 36/36 PASS    |
| 5    | 3.0.3.3  | `LocalAgentExecutor` AgentChatSession 인터페이스 + factory 패턴 도입 (Q5)    | 37/37 + 26/26 PASS    |

## 변경 파일 상세

### 3.0.3.5: Signal Handler Leak Fix

**파일**: `telemetry/sdk.ts`, `telemetry/sdk.test.ts`

- `initializeTelemetry()`에서 등록한 SIGTERM/SIGINT 핸들러를 named reference로
  변경
- `shutdownTelemetry()` finally 블록에서 `process.removeListener()` 호출
- 핸들러 누적 방지: MaxListenersExceededWarning 경고 해소

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

**ChatCompressionService 변경**:

- `compress(chat: GeminiChat)` → `compress(chat: AgentChatSession)`
- `client.ts` 호출자: GeminiChat이 AgentChatSession을 구조적으로 만족하므로 변경
  불필요

## Quality Gate

| 항목       | 결과                                                |
| ---------- | --------------------------------------------------- |
| TypeCheck  | ✅ PASS                                             |
| ESLint     | ✅ PASS                                             |
| Core Tests | ✅ 260 files / 4851 passed (baseline 4849 + 신규 2) |

## @google/genai 제거 현황

| 파일                              | Before                   | After                                   |
| --------------------------------- | ------------------------ | --------------------------------------- |
| `telemetry/sdk.ts`                | 0 imports                | 0 imports (핸들러 누수만 수정)          |
| `telemetry/types.ts`              | 3 type imports           | 0 imports ✅                            |
| `telemetry/semantic.ts`           | 1 value + 5 type imports | 0 imports ✅                            |
| `core/loggingContentGenerator.ts` | 10 type imports          | 0 imports ✅                            |
| `agents/local-executor.ts`        | 1 value + 5 type imports | 1 value + 6 type imports (factory 내부) |

> **Note**: `local-executor.ts`는 factory 정의와 `Type` enum,
> `FunctionDeclaration`, `Schema` 등을 비즈니스 로직에서 직접 사용하므로
> @google/genai import가 남아있음. 이는 agent 레이어 전체의 타입 독립화 (Phase 3
> 후반부) 범위.

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
