# Phase 1: 기반 작업 및 의존성 분석

> 기간: 2-3주 | 상태: ✅ 완료 **v0.3** - M1.4 완료

## System Prompt

Always follow TDD principles. For each task: write a failing test first,
implement minimum code to pass, then refactor. Never mix structural and
behavioral changes in the same commit.

---

# PHASE OVERVIEW

## 설계서 참조 (Design Document References)

| 설계서                                                    | 관련 섹션                                                              | 참조 목적                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------- |
| [01-overview.md](../01-overview.md)                       | §1.3 현재 상태 분석, §1.4 ContentGenerator 구현체, §1.5 식별된 문제점  | 현재 구조 이해, 문제점 파악 |
| [02-architecture.md](../02-architecture.md)               | §2.1 현재 아키텍처, §2.2 목표 아키텍처, §2.4 프로바이더 선택 흐름      | 아키텍처 방향성, 설계 원칙  |
| [03-technical-design.md](../03-technical-design.md)       | §3.1 타입 시스템, §3.3.1 기본 어댑터, §3.6 통합 팩토리, §3.7 에러 처리 | 타입 정의, 어댑터 구조      |
| [05-implementation-plan.md](../05-implementation-plan.md) | §5.2 Phase 1 상세                                                      | 마일스톤별 상세 계획        |

## 목표

- 소스코드 기반 의존성/변경 범위 확정 (100+ 파일 분석)
- 프로바이더 독립 타입 시스템 구축 (이벤트 매핑 포함)
- 어댑터 확장성을 위한 공통 인프라 구성
- Provider 선택 경로/Config 설계 (AuthType 확장)
- 🆕 유틸리티/테스트 마이그레이션 계획 수립

## 산출물

```
packages/core/src/providers/
├── types.ts
├── errors.ts
├── events.ts              # 🆕 LlmStreamEvent 정의
├── legacyAliases.ts
├── baseAdapter.ts
├── registry.ts
├── factory.ts
├── streamAssembler.ts
├── contentResolver.ts
├── modelSpec.ts
└── configAdapter.ts       # 🆕 ModelConfigService 호환

docs/ai_adapter/
├── migration-plan.md
├── event-mapping-matrix.md  # 🆕 GeminiEventType 매핑
└── utility-migration.md     # 🆕 유틸리티 마이그레이션
```

---

# 3-STAGE WORK PROCESS (사전작업/본작업/사후작업)

각 Milestone 작업은 다음 3단계로 진행:

## 1️⃣ 사전작업 (Pre-work)

- [ ] 작업 개요 파악: 현재 Milestone 목표 및 세부 작업 확인
- [ ] 이전 작업 리뷰: 이전 Milestone 작업 결과서 확인 (`working_history/`
      디렉토리)
- [ ] 이슈 파악: 이전 작업에서 전달된 이슈 및 Open Questions 확인
- [ ] 설계서 참조: 관련 설계 문서 검토

## 2️⃣ 본작업 (Main work) - TDD 사이클

- [ ] **Red**: 실패하는 테스트 작성
- [ ] **Green**: 최소한의 코드로 테스트 통과
- [ ] **Refactor**: 코드 개선 (테스트 통과 유지)
- [ ] 체크리스트 업데이트: 작업 완료 시 ✅ 표시

## 3️⃣ 사후작업 (Post-work)

- [ ] 체크리스트 최종 확인: 해당 Milestone 모든 항목 완료 확인
- [ ] 작업 결과서 작성: `working_history/Phase1_{Milestone}_{작업일자}.md`
- [ ] 커밋: 변경사항 커밋 및 커밋 ID 기록
- [ ] 이슈 전달: 다음 작업에 전달할 이슈 문서화

### 작업 결과서 템플릿

- 경로: `docs/ai_adapter/template/03_work_result_report_template.md`

---

# M1.0: 코드 인벤토리 및 영향도 분석 (3일) - 확대

> 📚 **설계서 참조**:
> [01-overview.md §1.3-1.5](../01-overview.md#13-현재-상태-분석),
> [02-architecture.md §2.1](../02-architecture.md#21-현재-아키텍처),
> [05-implementation-plan.md §M1.0](../05-implementation-plan.md#m10-코드-인벤토리-및-영향도-분석-2일)

## 목표

소스코드 기반 의존성/변경 범위 확정

## 작업 항목

### 1.0.1 `@google/genai` 의존성 인벤토리

| ID      | 작업                                       | 상태 | 테스트     |
| ------- | ------------------------------------------ | ---- | ---------- |
| 1.0.1.1 | `@google/genai` import 사용 파일 전체 스캔 | [x]  | N/A (분석) |
| 1.0.1.2 | 직접 타입 참조 vs 간접 참조 분류           | [x]  | N/A (분석) |
| 1.0.1.3 | 핵심 경로(critical path) 파일 식별         | [x]  | N/A (분석) |
| 1.0.1.4 | 의존성 그래프 시각화 문서 작성             | [x]  | N/A (문서) |

**검증 기준**:

- [ ] 100+ 파일 의존성 목록 완성
- [ ] 핵심 경로 파일 명확히 식별

**핵심 경로 파일 (이미 식별됨)**:

```
packages/core/src/core/
├── contentGenerator.ts   # GenerateContentParameters, GenerateContentResponse
├── baseLlmClient.ts      # Content, Part, GenerateContentConfig
├── turn.ts               # PartListUnion, FunctionCall, FinishReason, GeminiEventType
├── geminiChat.ts         # 988라인, 전체 Gemini 전용
└── client.ts             # GeminiClient

packages/core/src/services/
└── modelConfigService.ts # GenerateContentConfig 종속

packages/core/src/utils/
├── tokenCalculation.ts   # Part, PartListUnion
├── partUtils.ts          # GenerateContentResponse, PartListUnion
└── generateContentResponseUtilities.ts
```

### 1.0.2 🆕 GeminiEventType 의존 분석

| ID      | 작업                                    | 상태 | 테스트     |
| ------- | --------------------------------------- | ---- | ---------- |
| 1.0.2.1 | GeminiEventType 18개 이벤트 사용처 분석 | [x]  | N/A (분석) |
| 1.0.2.2 | ServerGeminiStreamEvent 소비자 식별     | [x]  | N/A (분석) |
| 1.0.2.3 | 이벤트 흐름 다이어그램 작성             | [x]  | N/A (문서) |
| 1.0.2.4 | 프로바이더별 이벤트 매핑 초안 작성      | [x]  | N/A (문서) |

**GeminiEventType 전체 목록 (18개)**:

```typescript
// turn.ts:52-71에서 확인
(Content,
  ToolCallRequest,
  ToolCallResponse,
  ToolCallConfirmation,
  UserCancelled,
  Error,
  ChatCompressed,
  Thought,
  MaxSessionTurns,
  Finished,
  LoopDetected,
  Citation,
  Retry,
  ContextWindowWillOverflow,
  InvalidStream,
  ModelInfo,
  AgentExecutionStopped,
  AgentExecutionBlocked);
```

### 1.0.3 핵심 인터페이스 의존 관계 맵핑

| ID      | 작업                                        | 상태 | 테스트     |
| ------- | ------------------------------------------- | ---- | ---------- |
| 1.0.3.1 | `ContentGenerator` 의존 파일 분석           | [x]  | N/A (분석) |
| 1.0.3.2 | `StreamEvent`/`StreamEventType` 사용처 분석 | [x]  | N/A (분석) |
| 1.0.3.3 | Hook 시스템 의존 분석                       | [x]  | N/A (분석) |
| 1.0.3.4 | Telemetry 의존 분석                         | [x]  | N/A (분석) |
| 1.0.3.5 | Retry 로직 의존 분석                        | [x]  | N/A (분석) |

### 1.0.4 🆕 ModelConfigService 종속성 분석

| ID      | 작업                                     | 상태 | 테스트     |
| ------- | ---------------------------------------- | ---- | ---------- |
| 1.0.4.1 | `GenerateContentConfig` 사용처 전수 조사 | [x]  | N/A (분석) |
| 1.0.4.2 | `ModelRouterService` 연동 지점 식별      | [x]  | N/A (분석) |
| 1.0.4.3 | 설정 우선순위/머지 로직 분석             | [x]  | N/A (분석) |
| 1.0.4.4 | 호환 레이어 설계안 작성                  | [x]  | N/A (설계) |

### 1.0.5 마이그레이션 전략 수립

| ID      | 작업                                 | 상태 | 테스트     |
| ------- | ------------------------------------ | ---- | ---------- |
| 1.0.5.1 | 단계별 마이그레이션 순서 정의        | [x]  | N/A (설계) |
| 1.0.5.2 | alias 전략 설계 (레거시 호환)        | [x]  | N/A (설계) |
| 1.0.5.3 | 병행 운영 기간 정의                  | [x]  | N/A (설계) |
| 1.0.5.4 | migration-plan.md 문서 작성          | [x]  | N/A (문서) |
| 1.0.5.5 | 🆕 event-mapping-matrix.md 문서 작성 | [x]  | N/A (문서) |

**산출물**:

- `docs/ai_adapter/migration-plan.md`
- `docs/ai_adapter/event-mapping-matrix.md`

---

# M1.1: 타입/에러/호환 레이어 설계 (3-4일) - 이벤트 매핑 포함

> 📚 **설계서 참조**:
> [03-technical-design.md §3.1 타입 시스템](../03-technical-design.md#31-프로바이더-독립적-타입-시스템),
> [§3.7 에러 처리](../03-technical-design.md#37-에러-처리),
> [05-implementation-plan.md §M1.1](../05-implementation-plan.md#m11-타입에러호환-레이어-설계-3일)

## 목표

프로바이더 독립 타입과 호환 레이어 정의 (이벤트 타입 포함)

## 작업 항목

### 1.1.1 핵심 메시지 타입 정의 (`types.ts`)

| ID      | 작업                             | 상태 | 테스트 파일     |
| ------- | -------------------------------- | ---- | --------------- |
| 1.1.1.1 | `LlmRole` enum 정의              | [x]  | `types.test.ts` |
| 1.1.1.2 | `LlmTextContent` 타입 정의       | [x]  | `types.test.ts` |
| 1.1.1.3 | `LlmImageContent` 타입 정의      | [x]  | `types.test.ts` |
| 1.1.1.4 | `LlmToolCallContent` 타입 정의   | [x]  | `types.test.ts` |
| 1.1.1.5 | `LlmToolResultContent` 타입 정의 | [x]  | `types.test.ts` |
| 1.1.1.6 | `LlmThoughtContent` 타입 정의    | [x]  | `types.test.ts` |
| 1.1.1.7 | `LlmContent` union 타입 정의     | [x]  | `types.test.ts` |
| 1.1.1.8 | `LlmMessage` 인터페이스 정의     | [x]  | `types.test.ts` |

### 1.1.2 요청/응답 타입 정의

| ID      | 작업                                                | 상태 | 테스트 파일     |
| ------- | --------------------------------------------------- | ---- | --------------- |
| 1.1.2.1 | `LlmGenerateRequest` 인터페이스                     | [x]  | `types.test.ts` |
| 1.1.2.2 | `LlmGenerateResponse` 인터페이스                    | [x]  | `types.test.ts` |
| 1.1.2.3 | `LlmUsage` 인터페이스                               | [x]  | `types.test.ts` |
| 1.1.2.4 | `LlmToolDefinition` 인터페이스                      | [x]  | `types.test.ts` |
| 1.1.2.5 | 🆕 `LlmGenerateConfig` 인터페이스 (프로바이더 독립) | [x]  | `types.test.ts` |

### 1.1.3 🆕 스트림 이벤트 타입 정의 (`events.ts`) - 확대

| ID       | 작업                                  | 상태 | 테스트 파일      |
| -------- | ------------------------------------- | ---- | ---------------- |
| 1.1.3.1  | `LlmStreamEventType` enum (18개 매핑) | [x]  | `events.test.ts` |
| 1.1.3.2  | `LlmStreamTextDelta` 타입             | [x]  | `events.test.ts` |
| 1.1.3.3  | `LlmStreamToolCallDelta` 타입         | [x]  | `events.test.ts` |
| 1.1.3.4  | `LlmStreamThoughtDelta` 타입          | [x]  | `events.test.ts` |
| 1.1.3.5  | `LlmStreamUsage` 타입                 | [x]  | `events.test.ts` |
| 1.1.3.6  | 🆕 `LlmStreamToolCallRequest` 타입    | [x]  | `events.test.ts` |
| 1.1.3.7  | 🆕 `LlmStreamToolCallResponse` 타입   | [x]  | `events.test.ts` |
| 1.1.3.8  | 🆕 `LlmStreamError` 타입              | [x]  | `events.test.ts` |
| 1.1.3.9  | 🆕 `LlmStreamFinished` 타입           | [x]  | `events.test.ts` |
| 1.1.3.10 | 🆕 `LlmStreamRetry` 타입              | [x]  | `events.test.ts` |
| 1.1.3.11 | 🆕 `LlmStreamCitation` 타입           | [x]  | `events.test.ts` |
| 1.1.3.12 | `LlmStreamEvent` union 타입           | [x]  | `events.test.ts` |
| 1.1.3.13 | `LlmStream` AsyncIterable 타입        | [x]  | `events.test.ts` |

**GeminiEventType → LlmStreamEventType 매핑**:

```typescript
// 매핑 테이블 (18개 이벤트)
GeminiEventType.Content          → LlmStreamEventType.TextDelta
GeminiEventType.ToolCallRequest  → LlmStreamEventType.ToolCallRequest
GeminiEventType.ToolCallResponse → LlmStreamEventType.ToolCallResponse
GeminiEventType.ToolCallConfirmation → LlmStreamEventType.ToolCallConfirmation
GeminiEventType.UserCancelled    → LlmStreamEventType.UserCancelled
GeminiEventType.Error            → LlmStreamEventType.Error
GeminiEventType.ChatCompressed   → LlmStreamEventType.ChatCompressed (Gemini 특화)
GeminiEventType.Thought          → LlmStreamEventType.ThoughtDelta
GeminiEventType.MaxSessionTurns  → LlmStreamEventType.MaxSessionTurns
GeminiEventType.Finished         → LlmStreamEventType.Finished
GeminiEventType.LoopDetected     → LlmStreamEventType.LoopDetected
GeminiEventType.Citation         → LlmStreamEventType.Citation
GeminiEventType.Retry            → LlmStreamEventType.Retry
GeminiEventType.ContextWindowWillOverflow → LlmStreamEventType.ContextWindowOverflow
GeminiEventType.InvalidStream    → LlmStreamEventType.InvalidStream
GeminiEventType.ModelInfo        → LlmStreamEventType.ModelInfo
GeminiEventType.AgentExecutionStopped → LlmStreamEventType.AgentStopped
GeminiEventType.AgentExecutionBlocked → LlmStreamEventType.AgentBlocked
```

**TDD 시나리오**:

```typescript
describe('LlmStreamEvent', () => {
  it('should define all 18 event types mapped from GeminiEventType', () => {
    expect(Object.keys(LlmStreamEventType)).toHaveLength(18);
  });

  it('should create text delta event', () => {
    const event: LlmStreamEvent = {
      type: LlmStreamEventType.TextDelta,
      text: 'Hello',
      traceId: 'trace-123',
    };
    expect(event.type).toBe(LlmStreamEventType.TextDelta);
  });

  it('should create tool call request event', () => {
    const event: LlmStreamEvent = {
      type: LlmStreamEventType.ToolCallRequest,
      callId: 'call-1',
      name: 'read_file',
      args: { path: '/tmp/test.txt' },
    };
    expect(event.name).toBe('read_file');
  });
});
```

### 1.1.4 에러 타입 정의 (`errors.ts`)

| ID      | 작업                            | 상태 | 테스트 파일      |
| ------- | ------------------------------- | ---- | ---------------- |
| 1.1.4.1 | `LlmErrorType` enum             | [x]  | `errors.test.ts` |
| 1.1.4.2 | `LlmError` 기본 클래스          | [x]  | `errors.test.ts` |
| 1.1.4.3 | `LlmRateLimitError` 클래스      | [x]  | `errors.test.ts` |
| 1.1.4.4 | `LlmAuthenticationError` 클래스 | [x]  | `errors.test.ts` |
| 1.1.4.5 | `LlmInvalidRequestError` 클래스 | [x]  | `errors.test.ts` |
| 1.1.4.6 | `LlmStreamError` 클래스         | [x]  | `errors.test.ts` |
| 1.1.4.7 | 에러 변환 유틸 함수             | [x]  | `errors.test.ts` |

### 1.1.5 레거시 호환 레이어 (`legacyAliases.ts`)

| ID      | 작업                                | 상태 | 테스트 파일             |
| ------- | ----------------------------------- | ---- | ----------------------- |
| 1.1.5.1 | `GenerateContentResponse` alias     | [x]  | `legacyAliases.test.ts` |
| 1.1.5.2 | `StreamEvent` alias                 | [x]  | `legacyAliases.test.ts` |
| 1.1.5.3 | `Content` alias                     | [x]  | `legacyAliases.test.ts` |
| 1.1.5.4 | `GeminiEventType` alias (기존 유지) | [x]  | `legacyAliases.test.ts` |
| 1.1.5.5 | 변환 헬퍼 함수                      | [x]  | `legacyAliases.test.ts` |

**검증 기준**:

- [x] 신규 타입이 SDK 비의존
- [x] 레거시 타입과 병행 컴파일 가능
- [x] 18개 이벤트 타입 전수 매핑 완료
- [x] 타입 가드 함수 동작 확인

---

# M1.2: Adapter 인프라 구축 (4-5일) - ModelSpec 연동

> 📚 **설계서 참조**:
> [02-architecture.md §2.2 목표 아키텍처](../02-architecture.md#22-목표-아키텍처),
> [03-technical-design.md §3.3.1 기본 어댑터](../03-technical-design.md#331-기본-어댑터-추상-클래스),
> [§3.6 통합 팩토리](../03-technical-design.md#36-통합-팩토리-createcontentgenerator-확장),
> [05-implementation-plan.md §M1.2](../05-implementation-plan.md#m12-adapter-인프라-구축-3-4일)

## 목표

어댑터 확장성을 위한 공통 인프라 구성 (ModelConfigService 호환 포함)

## 작업 항목

### 1.2.1 BaseAdapter 추상 클래스 (`baseAdapter.ts`)

| ID      | 작업                                   | 상태 | 테스트 파일           |
| ------- | -------------------------------------- | ---- | --------------------- |
| 1.2.1.1 | `LlmAdapter` 인터페이스 정의           | [x]  | `baseAdapter.test.ts` |
| 1.2.1.2 | `BaseAdapter` 추상 클래스 구현         | [x]  | `baseAdapter.test.ts` |
| 1.2.1.3 | `generate()` 추상 메서드               | [x]  | `baseAdapter.test.ts` |
| 1.2.1.4 | `generateStream()` 추상 메서드         | [x]  | `baseAdapter.test.ts` |
| 1.2.1.5 | `validateConfig()` 메서드              | [x]  | `baseAdapter.test.ts` |
| 1.2.1.6 | `getCapabilities()` 메서드             | [x]  | `baseAdapter.test.ts` |
| 1.2.1.7 | 🆕 `mapToProviderConfig()` 추상 메서드 | [x]  | `baseAdapter.test.ts` |

**TDD 시나리오**:

```typescript
describe('BaseAdapter', () => {
  it('should require mapToProviderConfig implementation', () => {
    class TestAdapter extends BaseAdapter {
      mapToProviderConfig(config: LlmGenerateConfig) {
        // 프로바이더별 구현
      }
    }
    expect(new TestAdapter(config).mapToProviderConfig).toBeDefined();
  });
});
```

### 1.2.2 Provider Registry (`registry.ts`)

| ID      | 작업                           | 상태 | 테스트 파일        |
| ------- | ------------------------------ | ---- | ------------------ |
| 1.2.2.1 | `ProviderRegistry` 싱글톤 구현 | [x]  | `registry.test.ts` |
| 1.2.2.2 | `register()` 메서드            | [x]  | `registry.test.ts` |
| 1.2.2.3 | `get()` 메서드                 | [x]  | `registry.test.ts` |
| 1.2.2.4 | `list()` 메서드                | [x]  | `registry.test.ts` |
| 1.2.2.5 | `has()` 메서드                 | [x]  | `registry.test.ts` |

### 1.2.3 Provider Factory (`factory.ts`)

| ID      | 작업                          | 상태 | 테스트 파일       |
| ------- | ----------------------------- | ---- | ----------------- |
| 1.2.3.1 | `ProviderFactory` 클래스      | [x]  | `factory.test.ts` |
| 1.2.3.2 | `create()` 메서드             | [x]  | `factory.test.ts` |
| 1.2.3.3 | Dynamic import 지원           | [ ]  | `factory.test.ts` |
| 1.2.3.4 | 에러 처리 (미등록 프로바이더) | [x]  | `factory.test.ts` |

### 1.2.4 Stream Assembler (`streamAssembler.ts`)

| ID      | 작업                     | 상태 | 테스트 파일               |
| ------- | ------------------------ | ---- | ------------------------- |
| 1.2.4.1 | `StreamAssembler` 클래스 | [x]  | `streamAssembler.test.ts` |
| 1.2.4.2 | 텍스트 델타 합성         | [x]  | `streamAssembler.test.ts` |
| 1.2.4.3 | 툴 콜 델타 합성          | [x]  | `streamAssembler.test.ts` |
| 1.2.4.4 | Usage 정보 누적          | [x]  | `streamAssembler.test.ts` |
| 1.2.4.5 | 완료된 메시지 반환       | [x]  | `streamAssembler.test.ts` |
| 1.2.4.6 | 🆕 이벤트 타입 변환 지원 | [ ]  | `streamAssembler.test.ts` |

### 1.2.5 Content Resolver (`contentResolver.ts`)

| ID      | 작업                     | 상태 | 테스트 파일               |
| ------- | ------------------------ | ---- | ------------------------- |
| 1.2.5.1 | `ContentResolver` 클래스 | [x]  | `contentResolver.test.ts` |
| 1.2.5.2 | 이미지 URL → base64 변환 | ⬜   | `contentResolver.test.ts` |
| 1.2.5.3 | 파일 경로 → base64 변환  | ⬜   | `contentResolver.test.ts` |
| 1.2.5.4 | MIME 타입 감지           | [x]  | `contentResolver.test.ts` |
| 1.2.5.5 | 캐싱 전략                | ⬜   | `contentResolver.test.ts` |

### 1.2.6 Model Spec (`modelSpec.ts`) - 확대

| ID      | 작업                                    | 상태 | 테스트 파일         |
| ------- | --------------------------------------- | ---- | ------------------- |
| 1.2.6.1 | `ModelSpec` 인터페이스                  | [x]  | `modelSpec.test.ts` |
| 1.2.6.2 | `ModelCapabilities` 인터페이스          | [x]  | `modelSpec.test.ts` |
| 1.2.6.3 | 기본 모델 스펙 정의                     | [x]  | `modelSpec.test.ts` |
| 1.2.6.4 | 기능 가용성 체크 함수                   | [x]  | `modelSpec.test.ts` |
| 1.2.6.5 | 🆕 `ModelConfigService` 연동 인터페이스 | ⬜   | `modelSpec.test.ts` |

### 1.2.7 🆕 Config Adapter (`configAdapter.ts`)

| ID      | 작업                                                 | 상태 | 테스트 파일             |
| ------- | ---------------------------------------------------- | ---- | ----------------------- |
| 1.2.7.1 | `ConfigAdapter` 인터페이스 정의                      | [x]  | `configAdapter.test.ts` |
| 1.2.7.2 | `LlmGenerateConfig` → `GenerateContentConfig` 변환   | [x]  | `configAdapter.test.ts` |
| 1.2.7.3 | `GenerateContentConfig` → `LlmGenerateConfig` 역변환 | [x]  | `configAdapter.test.ts` |
| 1.2.7.4 | 설정 머지 로직                                       | [x]  | `configAdapter.test.ts` |

**TDD 시나리오**:

```typescript
describe('ConfigAdapter', () => {
  it('should convert LlmGenerateConfig to GenerateContentConfig', () => {
    const llmConfig: LlmGenerateConfig = {
      temperature: 0.7,
      maxTokens: 1000,
      topP: 0.9
    };

    const geminiConfig = toGenerateContentConfig(llmConfig);

    expect(geminiConfig.temperature).toBe(0.7);
    expect(geminiConfig.maxOutputTokens).toBe(1000);
    expect(geminiConfig.topP).toBe(0.9);
  });

  it('should preserve unknown fields for provider-specific options', () => {
    const llmConfig: LlmGenerateConfig = {
      temperature: 0.7,
      providerOptions: {
        gemini: { safetySettings: [...] }
      }
    };

    const geminiConfig = toGenerateContentConfig(llmConfig);
    expect(geminiConfig.safetySettings).toBeDefined();
  });
});
```

**검증 기준**:

- [x] 신규 어댑터가 인프라만으로 통합 가능
- [x] StreamAssembler로 Claude/OpenAI 스트림 합성 시나리오 만족
- [x] 🆕 ModelConfigService와 호환 레이어 동작 확인

---

# M1.3: Provider 선택 경로/Config 설계 (2-3일) - AuthType 확장

> 📚 **설계서 참조**:
> [02-architecture.md §2.4 프로바이더 선택 흐름](../02-architecture.md#24-프로바이더-선택-흐름),
> [§2.5 설정 구조](../02-architecture.md#25-설정-구조),
> [05-implementation-plan.md §M1.3](../05-implementation-plan.md#m13-provider-선택-경로config-설계-2일)

## 목표

기존 `authType` 기반 흐름과 새 provider 선택 경로의 공존

## 작업 항목

### 1.3.1 🆕 ProviderType 정의 (AuthType 확장)

| ID      | 작업                            | 상태 | 테스트 파일             |
| ------- | ------------------------------- | ---- | ----------------------- |
| 1.3.1.1 | `ProviderType` enum 정의        | [x]  | `providerTypes.test.ts` |
| 1.3.1.2 | 기존 `AuthType`과의 관계 정의   | [x]  | `providerTypes.test.ts` |
| 1.3.1.3 | 프로바이더-인증타입 매핑 테이블 | [x]  | `providerTypes.test.ts` |

**ProviderType과 AuthType 관계**:

```typescript
enum ProviderType {
  Gemini = 'gemini',
  Claude = 'claude',
  OpenAI = 'openai',
  OpenAICompatible = 'openai-compatible',
  Didim = 'didim',
}

// AuthType은 Gemini 프로바이더 전용 세부 인증 방식
// 다른 프로바이더는 API Key 기반
enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal', // Gemini only
  USE_GEMINI = 'gemini-api-key', // Gemini only
  USE_VERTEX_AI = 'vertex-ai', // Gemini only
  LEGACY_CLOUD_SHELL = 'cloud-shell', // Gemini only
  COMPUTE_ADC = 'compute-default-credentials', // Gemini only
}
```

### 1.3.2 Provider Config 타입 정의

| ID      | 작업                                   | 상태 | 테스트 파일              |
| ------- | -------------------------------------- | ---- | ------------------------ |
| 1.3.2.1 | `ProviderConfig` 기본 인터페이스       | [x]  | `providerConfig.test.ts` |
| 1.3.2.2 | `GeminiProviderConfig` (authType 포함) | [x]  | `providerConfig.test.ts` |
| 1.3.2.3 | `ClaudeProviderConfig`                 | [x]  | `providerConfig.test.ts` |
| 1.3.2.4 | `OpenAIProviderConfig`                 | [x]  | `providerConfig.test.ts` |
| 1.3.2.5 | `OpenAICompatibleConfig`               | [x]  | `providerConfig.test.ts` |
| 1.3.2.6 | 🆕 `DidimProviderConfig`               | [x]  | `providerConfig.test.ts` |

### 1.3.3 Provider 선택 우선순위 로직

| ID      | 작업                           | 상태 | 테스트 파일                |
| ------- | ------------------------------ | ---- | -------------------------- |
| 1.3.3.1 | 환경변수 파싱 (`LLM_PROVIDER`) | [x]  | `providerSelector.test.ts` |
| 1.3.3.2 | authType 호환 로직             | [x]  | `providerSelector.test.ts` |
| 1.3.3.3 | 우선순위 결정 로직             | [x]  | `providerSelector.test.ts` |
| 1.3.3.4 | 기본값 폴백 로직               | [x]  | `providerSelector.test.ts` |
| 1.3.3.5 | 🆕 프로바이더별 환경변수 검증  | [x]  | `providerSelector.test.ts` |

**우선순위 규칙**:

```
LLM_PROVIDER > authType > GEMINI_API_KEY
```

**프로바이더별 환경변수**:

```
Gemini: GEMINI_API_KEY, GOOGLE_API_KEY, GOOGLE_CLOUD_PROJECT
Claude: ANTHROPIC_API_KEY
OpenAI: OPENAI_API_KEY
Didim: DIDIM_API_KEY, DIDIM_ENDPOINT
OpenAI-Compatible: LLM_BASE_URL, LLM_API_KEY
```

**TDD 시나리오**:

```typescript
describe('ProviderSelector', () => {
  it('should prioritize LLM_PROVIDER over authType', () => {
    vi.stubEnv('LLM_PROVIDER', 'claude');
    vi.stubEnv('ANTHROPIC_API_KEY', 'xxx');

    const result = selectProvider();
    expect(result.type).toBe(ProviderType.Claude);
  });

  it('should use authType for Gemini when LLM_PROVIDER not set', () => {
    vi.stubEnv('GEMINI_API_KEY', 'xxx');

    const result = selectProvider({ authType: AuthType.USE_GEMINI });
    expect(result.type).toBe(ProviderType.Gemini);
    expect(result.authType).toBe(AuthType.USE_GEMINI);
  });

  it('should validate required env vars per provider', () => {
    vi.stubEnv('LLM_PROVIDER', 'claude');
    // ANTHROPIC_API_KEY not set

    expect(() => selectProvider()).toThrow('ANTHROPIC_API_KEY is required');
  });
});
```

### 1.3.4 Configuration 통합

| ID      | 작업                          | 상태 | 테스트 파일                         |
| ------- | ----------------------------- | ---- | ----------------------------------- |
| 1.3.4.1 | providerConfigIntegration구현 | [x]  | `providerConfigIntegration.test.ts` |
| 1.3.4.2 | index.ts export 추가          | [x]  | N/A                                 |
| 1.3.4.3 | 환경변수 통합                 | [x]  | `providerConfigIntegration.test.ts` |
| 1.3.4.4 | 설정 검증 로직                | [x]  | `providerConfigIntegration.test.ts` |

**검증 기준**:

- [x] 기존 인증 흐름(ADC/OAuth/Vertex) 유지
- [x] 신규 provider 선택 경로 동작
- [x] 우선순위 충돌 시 동작 예측 가능
- [x] 🆕 프로바이더별 환경변수 검증 동작

---

# M1.4: 🆕 유틸리티/테스트 마이그레이션 계획 (2일)

> 📚 **설계서 참조**:
> [01-overview.md §1.3.4 의존성 현황](../01-overview.md#134-의존성-현황),
> [03-technical-design.md §3.1 타입 시스템](../03-technical-design.md#31-프로바이더-독립적-타입-시스템)
> (유틸리티 타입 전환 참고)

## 목표

유틸리티 레이어 및 테스트 마이그레이션 상세 계획 수립

## 작업 항목

### 1.4.1 유틸리티 레이어 분석

| ID      | 작업                                       | 상태 | 테스트     |
| ------- | ------------------------------------------ | ---- | ---------- |
| 1.4.1.1 | `tokenCalculation.ts` 의존성 분석          | ✅   | N/A (분석) |
| 1.4.1.2 | `partUtils.ts` 의존성 분석                 | ✅   | N/A (분석) |
| 1.4.1.3 | `generateContentResponseUtilities.ts` 분석 | ✅   | N/A (분석) |
| 1.4.1.4 | 프로바이더 독립 유틸 설계                  | ✅   | N/A (설계) |

**현재 유틸리티 의존성**:

```typescript
// tokenCalculation.ts
import type { PartListUnion, Part } from '@google/genai';

// partUtils.ts
import type {
  GenerateContentResponse,
  PartListUnion,
  Part,
  PartUnion,
} from '@google/genai';
```

### 1.4.2 테스트 파일 분석

| ID      | 작업                              | 상태 | 테스트     |
| ------- | --------------------------------- | ---- | ---------- |
| 1.4.2.1 | Gemini 전용 테스트 파일 목록 작성 | ✅   | N/A (분석) |
| 1.4.2.2 | 테스트 수정 범위 추정             | ✅   | N/A (분석) |
| 1.4.2.3 | 테스트 마이그레이션 우선순위 정의 | ✅   | N/A (설계) |
| 1.4.2.4 | 테스트 공통화 전략 수립           | ✅   | N/A (설계) |

### 1.4.3 마이그레이션 계획 문서화

| ID      | 작업                          | 상태 | 테스트     |
| ------- | ----------------------------- | ---- | ---------- |
| 1.4.3.1 | utility-migration.md 작성     | ✅   | N/A (문서) |
| 1.4.3.2 | 테스트 마이그레이션 일정 수립 | ✅   | N/A (문서) |

**산출물**: `docs/ai_adapter/utility-migration.md`

---

# PHASE 1 COMPLETION CHECKLIST

## Quality Gates

- [ ] 모든 단위 테스트 통과 (`npm run test -w @didim365/agent-cli-core`)
- [ ] TypeScript 컴파일 에러 없음 (`npm run typecheck`)
- [ ] ESLint 경고 없음 (`npm run lint`)
- [ ] 기존 테스트 회귀 없음 (`npm run test`)

## 산출물 확인

- [ ] `packages/core/src/providers/types.ts` 생성
- [ ] `packages/core/src/providers/events.ts` 생성 🆕
- [ ] `packages/core/src/providers/errors.ts` 생성
- [ ] `packages/core/src/providers/legacyAliases.ts` 생성
- [ ] `packages/core/src/providers/baseAdapter.ts` 생성
- [ ] `packages/core/src/providers/registry.ts` 생성
- [ ] `packages/core/src/providers/factory.ts` 생성
- [ ] `packages/core/src/providers/streamAssembler.ts` 생성
- [ ] `packages/core/src/providers/contentResolver.ts` 생성
- [ ] `packages/core/src/providers/modelSpec.ts` 생성
- [ ] `packages/core/src/providers/configAdapter.ts` 생성 🆕
- [ ] `docs/ai_adapter/migration-plan.md` 생성
- [ ] `docs/ai_adapter/event-mapping-matrix.md` 생성 🆕
- [ ] `docs/ai_adapter/utility-migration.md` 생성 🆕

## 다음 Phase 진행 조건

- [ ] Phase 1 모든 Milestone 완료
- [ ] 코드 리뷰 완료
- [ ] 문서 리뷰 완료
- [ ] 🆕 이벤트 매핑 전략 확정
- [ ] 🆕 유틸리티 마이그레이션 계획 승인

---

# NOTES

## TDD 원칙 준수

1. 테스트 먼저 작성 (Red)
2. 최소 코드로 통과 (Green)
3. 리팩토링 (Refactor)

## 커밋 분리

- 구조적 변경: `[STRUCTURAL]` 태그
- 동작 변경: `[BEHAVIORAL]` 태그

## 참고 문서

- [03-technical-design.md](../03-technical-design.md)
- [05-implementation-plan.md](../05-implementation-plan.md)

---

# CHANGE LOG

| 날짜       | 버전 | 변경 내용                                                                                                                                                                      |
| ---------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2026-02-01 | 0.1  | 초안 작성                                                                                                                                                                      |
| 2026-02-01 | 0.2  | 리뷰 반영: M1.0 확대(GeminiEventType/ModelConfigService 분석), M1.1 이벤트 매핑 추가, M1.2 ConfigAdapter 추가, M1.3 AuthType 확장, M1.4 유틸리티/테스트 마이그레이션 계획 신규 |
