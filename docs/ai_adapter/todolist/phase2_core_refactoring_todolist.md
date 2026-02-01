# Phase 2: 코어 리팩토링 및 Gemini 분리

> 기간: 3-4주 | 상태: ⏳ 대기 | 의존성: Phase 1 완료
> **v0.3** - 2차 리뷰 반영 (라우팅 레이어, 래퍼 클래스, 테스트 파일 정정)

## System Prompt

Always follow TDD principles. For each task: write a failing test first, implement minimum code to pass, then refactor. Separate structural changes (renaming, extracting) from behavioral changes (new functionality). Run all tests after each change.

---

# PHASE OVERVIEW

## 목표
- 🆕 디렉토리 재구성 (Tidy First 원칙)
- 핵심 경로에서 `@google/genai` 타입 분리
- 스트리밍 로직의 Gemini 결합 해소 (18개 이벤트 매핑)
- 기존 Gemini 경로를 어댑터로 캡슐화
- 🆕 ModelConfigService 호환 레이어 구현
- 🆕 유틸리티 레이어 리팩토링

## 전제 조건
- [ ] Phase 1 모든 Milestone 완료
- [ ] 신규 타입 시스템 (`types.ts`, `events.ts`, `errors.ts`) 준비
- [ ] 어댑터 인프라 (`baseAdapter.ts`, `registry.ts` 등) 준비
- [ ] 🆕 이벤트 매핑 전략 확정
- [ ] 🆕 유틸리티 마이그레이션 계획 승인

## 산출물
```
packages/core/src/
├── core/
│   ├── contentGenerator.ts  [수정]
│   ├── baseLlmClient.ts     [수정]
│   ├── turn.ts              [분리 - 공통 인터페이스]
│   └── client.ts            [수정]
│
├── providers/
│   ├── configAdapter.ts     [수정]
│   └── gemini/
│       ├── adapter.ts       [신규]
│       ├── converter.ts     [신규]
│       ├── eventMapper.ts   [신규 - 18개 이벤트 매핑]
│       ├── chat.ts          [이동 - geminiChat.ts]
│       └── turn.ts          [이동 - Gemini 특화]
│
└── utils/
    ├── tokenCalculation.ts  [수정]
    ├── partUtils.ts         [수정]
    └── llmUtils.ts          [신규]
```

---

# M2.0: 🆕 디렉토리 재구성 (Tidy First) (2-3일)

## 목표
Tidy First 원칙에 따라 구조적 변경 먼저 수행

## 작업 항목

### 2.0.1 Gemini 전용 파일 분리
| ID | 작업 | 상태 | 테스트 |
|----|------|------|--------|
| 2.0.1.1 | `providers/gemini/` 디렉토리 생성 | ⬜ | N/A |
| 2.0.1.2 | `geminiChat.ts` → `providers/gemini/chat.ts` 이동 | ⬜ | 기존 테스트 통과 |
| 2.0.1.3 | Gemini 특화 Turn 로직 분리 | ⬜ | 기존 테스트 통과 |
| 2.0.1.4 | import 경로 업데이트 | ⬜ | 기존 테스트 통과 |

**Tidy First 체크리스트**:
- [ ] 모든 변경이 순수 구조적 (동작 변경 없음)
- [ ] 각 이동마다 테스트 실행하여 회귀 확인
- [ ] 커밋 메시지에 `[STRUCTURAL]` 태그

### 2.0.2 공통 인터페이스 분리
| ID | 작업 | 상태 | 테스트 |
|----|------|------|--------|
| 2.0.2.1 | `core/turn.ts`에서 공통 인터페이스 추출 | ⬜ | 기존 테스트 통과 |
| 2.0.2.2 | `ServerGeminiStreamEvent` → Gemini 전용으로 이동 | ⬜ | 기존 테스트 통과 |
| 2.0.2.3 | `GeminiEventType` → `providers/gemini/types.ts` 이동 | ⬜ | 기존 테스트 통과 |
| 2.0.2.4 | Re-export로 하위 호환성 유지 | ⬜ | 기존 테스트 통과 |

**검증 기준**:
- [ ] 모든 기존 테스트 100% 통과
- [ ] import 경로 변경 외 동작 변경 없음
- [ ] 하위 호환성 유지 (re-export)

---

# M2.1: ContentGenerator/StreamEvent/Retry/Hook 타입 전환 (5-7일) - 확대

## 목표
핵심 경로에서 `@google/genai` 타입 분리

## 작업 항목

### 2.1.1 ContentGenerator 인터페이스 재정의
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.1.1.1 | 현재 `ContentGenerator` 시그니처 분석 | ⬜ | N/A (분석) |
| 2.1.1.2 | `LlmContentGenerator` 인터페이스 정의 | ⬜ | `contentGenerator.test.ts` |
| 2.1.1.3 | `userPromptId` required 유지 확인 | ⬜ | `contentGenerator.test.ts` |
| 2.1.1.4 | `generate()` 메서드 시그니처 전환 | ⬜ | `contentGenerator.test.ts` |
| 2.1.1.5 | `generateStream()` 메서드 시그니처 전환 | ⬜ | `contentGenerator.test.ts` |
| 2.1.1.6 | 레거시 호환 래퍼 추가 | ⬜ | `contentGenerator.test.ts` |
| 2.1.1.7 | 🆕 `countTokens()` 프로바이더 독립화 | ⬜ | `contentGenerator.test.ts` |
| 2.1.1.8 | 🆕 `embedContent()` 프로바이더 독립화 | ⬜ | `contentGenerator.test.ts` |

**TDD 시나리오**:
```typescript
describe('LlmContentGenerator', () => {
  it('should accept provider-agnostic LlmGenerateRequest', async () => {
    const generator = new LlmContentGenerator(mockAdapter);
    const request: LlmGenerateRequest = {
      messages: [{ role: LlmRole.User, content: [{ type: 'text', text: 'Hi' }] }],
      userPromptId: 'test-123'
    };

    const response = await generator.generate(request);
    expect(response.message).toBeDefined();
  });

  it('should maintain backward compatibility with existing ContentGenerator', () => {
    const legacyGenerator: ContentGenerator = createContentGenerator(config);
    // 기존 시그니처 그대로 동작해야 함
    expect(legacyGenerator.generateContent).toBeDefined();
  });
});
```

### 2.1.2 createContentGenerator 팩토리 이관
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.1.2.1 | 현재 팩토리 로직 분석 | ⬜ | N/A (분석) |
| 2.1.2.2 | provider-aware 팩토리 설계 | ⬜ | `factory.test.ts` |
| 2.1.2.3 | `ProviderFactory` 연동 | ⬜ | `factory.test.ts` |
| 2.1.2.4 | 기존 호출부 호환성 유지 | ⬜ | `factory.test.ts` |
| 2.1.2.5 | 기능 플래그 분기 추가 | ⬜ | `factory.test.ts` |

### 2.1.3 BaseLlmClient 타입 전환
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.1.3.1 | 현재 `baseLlmClient.ts` 분석 | ⬜ | N/A (분석) |
| 2.1.3.2 | 요청 타입 `LlmGenerateRequest`로 전환 | ⬜ | `baseLlmClient.test.ts` |
| 2.1.3.3 | 응답 타입 `LlmGenerateResponse`로 전환 | ⬜ | `baseLlmClient.test.ts` |
| 2.1.3.4 | 어댑터 의존성 주입 구조 적용 | ⬜ | `baseLlmClient.test.ts` |
| 2.1.3.5 | 레거시 타입 변환 레이어 추가 | ⬜ | `baseLlmClient.test.ts` |
| 2.1.3.6 | 🆕 `GenerateContentConfig` 호환 유지 | ⬜ | `baseLlmClient.test.ts` |

### 2.1.4 Retry 로직 리팩토링
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.1.4.1 | 현재 `retry.ts` 에러 처리 분석 | ⬜ | N/A (분석) |
| 2.1.4.2 | `LlmError` 기반 재시도 조건 정의 | ⬜ | `retry.test.ts` |
| 2.1.4.3 | `LlmRateLimitError` 재시도 전략 | ⬜ | `retry.test.ts` |
| 2.1.4.4 | 프로바이더별 재시도 헤더 파싱 | ⬜ | `retry.test.ts` |
| 2.1.4.5 | 재시도 통계/로깅 추가 | ⬜ | `retry.test.ts` |

### 2.1.5 Hook 시스템 타입 전환
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.1.5.1 | 현재 `hooks/types.ts` 분석 | ⬜ | N/A (분석) |
| 2.1.5.2 | Hook 이벤트 타입 `LlmStreamEvent` 전환 | ⬜ | `hooks/hookSystem.test.ts` |
| 2.1.5.3 | Hook 컨텍스트 타입 전환 | ⬜ | `hooks/hookEventHandler.test.ts` |
| 2.1.5.4 | 기존 Hook 호환성 테스트 | ⬜ | `hooks/*.test.ts` (9개 파일) |

**Hook 테스트 파일 목록** (실제 존재):
- `hookAggregator.test.ts`, `hookEventHandler.test.ts`, `hookPlanner.test.ts`
- `hookRegistry.test.ts`, `hookRunner.test.ts`, `hookSystem.test.ts`
- `hookTranslator.test.ts`, `trustedHooks.test.ts`, `types.test.ts`

### 2.1.6 🆕 ContentGenerator 래퍼/파생 클래스 마이그레이션
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.1.6.1 | `LoggingContentGenerator` 타입 전환 | ⬜ | `loggingContentGenerator.test.ts` |
| 2.1.6.2 | `RecordingContentGenerator` 타입 전환 | ⬜ | `recordingContentGenerator.test.ts` |
| 2.1.6.3 | `FakeContentGenerator` 타입 전환 | ⬜ | `fakeContentGenerator.test.ts` |
| 2.1.6.4 | `code_assist/codeAssist.ts` ContentGenerator 사용 분석 | ⬜ | N/A (분석) |
| 2.1.6.5 | `code_assist/server.ts` ContentGenerator 사용 분석 | ⬜ | N/A (분석) |
| 2.1.6.6 | CodeAssist ContentGenerator 호환 레이어 | ⬜ | `codeAssist.test.ts` |

**래퍼 클래스 의존성 분석**:
```
contentGenerator.ts (기반)
├── loggingContentGenerator.ts   ← ContentGenerator 래핑
├── recordingContentGenerator.ts ← ContentGenerator 래핑
├── fakeContentGenerator.ts      ← ContentGenerator 구현
└── code_assist/
    ├── codeAssist.ts            ← ContentGenerator 사용
    └── server.ts                ← ContentGenerator 사용
```

**검증 기준**:
- [ ] `ContentGenerator` 호출 경로가 신규 타입으로 동작
- [ ] 🆕 모든 래퍼/파생 클래스 타입 전환 완료
- [ ] Retry/Hook이 프로바이더 독립 에러로 동작
- [ ] 기존 테스트 100% 통과

---

# M2.2: GeminiChat 스트리밍 분해 및 합성기 적용 (5-7일) - 이벤트 매핑

## 목표
스트리밍 로직의 Gemini 결합 해소 (18개 이벤트 매핑)

## 작업 항목

### 2.2.1 🆕 EventMapper 구현 (`providers/gemini/eventMapper.ts`)
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.2.1.1 | `GeminiEventMapper` 클래스 생성 | ⬜ | `eventMapper.test.ts` |
| 2.2.1.2 | `Content` → `TextDelta` 매핑 | ⬜ | `eventMapper.test.ts` |
| 2.2.1.3 | `ToolCallRequest` 매핑 | ⬜ | `eventMapper.test.ts` |
| 2.2.1.4 | `ToolCallResponse` 매핑 | ⬜ | `eventMapper.test.ts` |
| 2.2.1.5 | `ToolCallConfirmation` 매핑 | ⬜ | `eventMapper.test.ts` |
| 2.2.1.6 | `Thought` → `ThoughtDelta` 매핑 | ⬜ | `eventMapper.test.ts` |
| 2.2.1.7 | `Error` 매핑 | ⬜ | `eventMapper.test.ts` |
| 2.2.1.8 | `Finished` 매핑 | ⬜ | `eventMapper.test.ts` |
| 2.2.1.9 | `Retry` 매핑 | ⬜ | `eventMapper.test.ts` |
| 2.2.1.10 | `Citation` 매핑 | ⬜ | `eventMapper.test.ts` |
| 2.2.1.11 | 나머지 8개 이벤트 매핑 | ⬜ | `eventMapper.test.ts` |
| 2.2.1.12 | 역방향 매핑 (LlmStreamEvent → GeminiEvent) | ⬜ | `eventMapper.test.ts` |

**18개 이벤트 매핑 테이블**:
```typescript
const EVENT_MAP = {
  [GeminiEventType.Content]: LlmStreamEventType.TextDelta,
  [GeminiEventType.ToolCallRequest]: LlmStreamEventType.ToolCallRequest,
  [GeminiEventType.ToolCallResponse]: LlmStreamEventType.ToolCallResponse,
  [GeminiEventType.ToolCallConfirmation]: LlmStreamEventType.ToolCallConfirmation,
  [GeminiEventType.UserCancelled]: LlmStreamEventType.UserCancelled,
  [GeminiEventType.Error]: LlmStreamEventType.Error,
  [GeminiEventType.ChatCompressed]: LlmStreamEventType.ChatCompressed,
  [GeminiEventType.Thought]: LlmStreamEventType.ThoughtDelta,
  [GeminiEventType.MaxSessionTurns]: LlmStreamEventType.MaxSessionTurns,
  [GeminiEventType.Finished]: LlmStreamEventType.Finished,
  [GeminiEventType.LoopDetected]: LlmStreamEventType.LoopDetected,
  [GeminiEventType.Citation]: LlmStreamEventType.Citation,
  [GeminiEventType.Retry]: LlmStreamEventType.Retry,
  [GeminiEventType.ContextWindowWillOverflow]: LlmStreamEventType.ContextWindowOverflow,
  [GeminiEventType.InvalidStream]: LlmStreamEventType.InvalidStream,
  [GeminiEventType.ModelInfo]: LlmStreamEventType.ModelInfo,
  [GeminiEventType.AgentExecutionStopped]: LlmStreamEventType.AgentStopped,
  [GeminiEventType.AgentExecutionBlocked]: LlmStreamEventType.AgentBlocked,
};
```

**TDD 시나리오**:
```typescript
describe('GeminiEventMapper', () => {
  it('should map all 18 GeminiEventType to LlmStreamEventType', () => {
    const mapper = new GeminiEventMapper();

    // Content → TextDelta
    const geminiEvent: ServerGeminiContentEvent = {
      type: GeminiEventType.Content,
      value: 'Hello',
      traceId: 'trace-1'
    };

    const llmEvent = mapper.toLlmEvent(geminiEvent);

    expect(llmEvent.type).toBe(LlmStreamEventType.TextDelta);
    expect(llmEvent.text).toBe('Hello');
    expect(llmEvent.traceId).toBe('trace-1');
  });

  it('should handle tool call request with all fields', () => {
    const geminiEvent: ServerGeminiToolCallRequestEvent = {
      type: GeminiEventType.ToolCallRequest,
      value: {
        callId: 'call-1',
        name: 'read_file',
        args: { path: '/tmp/test.txt' },
        isClientInitiated: false,
        prompt_id: 'prompt-1',
        traceId: 'trace-1'
      }
    };

    const llmEvent = mapper.toLlmEvent(geminiEvent);

    expect(llmEvent.type).toBe(LlmStreamEventType.ToolCallRequest);
    expect(llmEvent.name).toBe('read_file');
    expect(llmEvent.args.path).toBe('/tmp/test.txt');
  });

  it('should reverse map LlmStreamEvent to GeminiEventType', () => {
    const mapper = new GeminiEventMapper();

    const llmEvent: LlmStreamEvent = {
      type: LlmStreamEventType.TextDelta,
      text: 'Hello'
    };

    const geminiEvent = mapper.toGeminiEvent(llmEvent);

    expect(geminiEvent.type).toBe(GeminiEventType.Content);
  });
});
```

### 2.2.2 StreamEvent → LlmStreamEvent 전환
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.2.2.1 | 현재 `StreamEvent` 사용처 전체 스캔 | ⬜ | N/A (분석) |
| 2.2.2.2 | `LlmStreamEvent` alias 추가 (병행) | ⬜ | `streamEvent.test.ts` |
| 2.2.2.3 | 핵심 경로 `LlmStreamEvent` 전환 | ⬜ | `streamEvent.test.ts` |
| 2.2.2.4 | 비핵심 경로 점진적 전환 | ⬜ | `streamEvent.test.ts` |
| 2.2.2.5 | 레거시 `StreamEvent` deprecate 표시 | ⬜ | N/A (문서) |

### 2.2.2a 🆕 geminiChat.ts StreamEventType 매핑 (리뷰 반영)
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.2.2a.1 | `geminiChat.ts` 내부 `StreamEventType` enum 분석 | ⬜ | N/A (분석) |
| 2.2.2a.2 | `StreamEventType.CHUNK` → `LlmStreamEvent` 매핑 | ⬜ | `geminiChat.test.ts` |
| 2.2.2a.3 | `StreamEventType.RETRY` → `LlmStreamEvent` 매핑 | ⬜ | `geminiChat.test.ts` |
| 2.2.2a.4 | `StreamEventType.AGENT_EXECUTION_STOPPED` 매핑 | ⬜ | `geminiChat.test.ts` |
| 2.2.2a.5 | `StreamEventType.AGENT_EXECUTION_BLOCKED` 매핑 | ⬜ | `geminiChat.test.ts` |
| 2.2.2a.6 | 두 체계(GeminiEventType + StreamEventType) 통합 전략 | ⬜ | `eventMapper.test.ts` |

**geminiChat.ts 내부 StreamEventType (4개)**:
```typescript
// packages/core/src/core/geminiChat.ts:55-65
export enum StreamEventType {
  CHUNK = 'chunk',                        // GenerateContentResponse 청크
  RETRY = 'retry',                        // 재시도 시그널
  AGENT_EXECUTION_STOPPED = 'agent_stopped',   // 에이전트 중지
  AGENT_EXECUTION_BLOCKED = 'agent_blocked',   // 에이전트 차단
}
```

**이벤트 계층 관계**:
```
geminiChat.ts
├── StreamEventType (4개) ← 내부 스트리밍 제어
│   ├── CHUNK → GenerateContentResponse
│   ├── RETRY → 재시도 신호
│   ├── AGENT_EXECUTION_STOPPED
│   └── AGENT_EXECUTION_BLOCKED
│
└── Turn.ts (소비)
    └── GeminiEventType (18개) ← UI/비즈니스 이벤트

⚠️ 두 체계가 분리되어 있어 통합 전략 필요
```

### 2.2.3 StreamAssembler 적용
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.2.3.1 | GeminiChat 스트림 처리 로직 분석 | ⬜ | N/A (분석) |
| 2.2.3.2 | Gemini 스트림 → 공통 이벤트 변환 | ⬜ | `geminiStream.test.ts` |
| 2.2.3.3 | `StreamAssembler` 통합 | ⬜ | `geminiStream.test.ts` |
| 2.2.3.4 | 텍스트 델타 합성 검증 | ⬜ | `geminiStream.test.ts` |
| 2.2.3.5 | 툴 콜 델타 합성 검증 | ⬜ | `geminiStream.test.ts` |
| 2.2.3.6 | Usage 정보 누적 검증 | ⬜ | `geminiStream.test.ts` |

### 2.2.4 Gemini 에러 매핑
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.2.4.1 | Gemini SDK 에러 타입 분석 | ⬜ | N/A (분석) |
| 2.2.4.2 | `InvalidStreamError` → `LlmStreamError` 매핑 | ⬜ | `errors.test.ts` |
| 2.2.4.3 | Rate limit 에러 매핑 | ⬜ | `errors.test.ts` |
| 2.2.4.4 | Auth 에러 매핑 | ⬜ | `errors.test.ts` |
| 2.2.4.5 | 에러 변환 유틸 함수 구현 | ⬜ | `errors.test.ts` |

### 2.2.5 Telemetry 포맷 변경
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.2.5.1 | 현재 Telemetry semantic 분석 | ⬜ | N/A (분석) |
| 2.2.5.2 | provider-agnostic 스키마 정의 | ⬜ | `telemetry.test.ts` |
| 2.2.5.3 | 공통 필드 정의 (provider, model, latency) | ⬜ | `telemetry.test.ts` |
| 2.2.5.4 | 기존 Telemetry 호환성 유지 | ⬜ | `telemetry.test.ts` |

**검증 기준**:
- [ ] GeminiChat이 신규 StreamEvent로 동작
- [ ] 🆕 18개 이벤트 전수 매핑 완료
- [ ] Telemetry가 provider 공통 스키마로 기록
- [ ] 기존 스트리밍 기능 100% 동작

---

# M2.3: GeminiAdapter 구현 및 동등성 검증 (4-5일) - 확대

## 목표
기존 Gemini 경로를 어댑터로 캡슐화

## 작업 항목

### 2.3.1 GeminiAdapter 구현
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.3.1.1 | `GeminiAdapter` 클래스 생성 | ⬜ | `geminiAdapter.test.ts` |
| 2.3.1.2 | `BaseAdapter` 상속 구현 | ⬜ | `geminiAdapter.test.ts` |
| 2.3.1.3 | `generate()` 메서드 구현 | ⬜ | `geminiAdapter.test.ts` |
| 2.3.1.4 | `generateStream()` 메서드 구현 | ⬜ | `geminiAdapter.test.ts` |
| 2.3.1.5 | `getCapabilities()` 구현 | ⬜ | `geminiAdapter.test.ts` |
| 2.3.1.6 | 설정 검증 로직 구현 | ⬜ | `geminiAdapter.test.ts` |
| 2.3.1.7 | 🆕 `mapToProviderConfig()` 구현 | ⬜ | `geminiAdapter.test.ts` |
| 2.3.1.8 | 🆕 AuthType 처리 통합 | ⬜ | `geminiAdapter.test.ts` |

### 2.3.2 Gemini 타입 변환기 구현
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.3.2.1 | `toGeminiContent()` 변환 함수 | ⬜ | `geminiConverter.test.ts` |
| 2.3.2.2 | `toGeminiMessage()` 변환 함수 | ⬜ | `geminiConverter.test.ts` |
| 2.3.2.3 | `toGeminiTool()` 변환 함수 | ⬜ | `geminiConverter.test.ts` |
| 2.3.2.4 | `fromGeminiResponse()` 변환 함수 | ⬜ | `geminiConverter.test.ts` |
| 2.3.2.5 | `fromGeminiStreamEvent()` 변환 함수 | ⬜ | `geminiConverter.test.ts` |
| 2.3.2.6 | 이미지 콘텐츠 변환 | ⬜ | `geminiConverter.test.ts` |
| 2.3.2.7 | 🆕 `toGenerateContentConfig()` 변환 | ⬜ | `geminiConverter.test.ts` |

### 2.3.3 동등성 검증 테스트
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.3.3.1 | 기본 대화 동등성 테스트 | ⬜ | `geminiParity.test.ts` |
| 2.3.3.2 | 스트리밍 대화 동등성 테스트 | ⬜ | `geminiParity.test.ts` |
| 2.3.3.3 | 도구 호출 동등성 테스트 | ⬜ | `geminiParity.test.ts` |
| 2.3.3.4 | 이미지 입력 동등성 테스트 | ⬜ | `geminiParity.test.ts` |
| 2.3.3.5 | 에러 처리 동등성 테스트 | ⬜ | `geminiParity.test.ts` |
| 2.3.3.6 | Rate limit 동등성 테스트 | ⬜ | `geminiParity.test.ts` |
| 2.3.3.7 | 🆕 18개 스트림 이벤트 동등성 테스트 | ⬜ | `geminiParity.test.ts` |

### 2.3.4 기능 플래그 통합
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.3.4.1 | `ENABLE_MULTI_PROVIDER` 플래그 구현 | ⬜ | `featureFlag.test.ts` |
| 2.3.4.2 | 플래그 기반 경로 분기 | ⬜ | `featureFlag.test.ts` |
| 2.3.4.3 | 런타임 전환 테스트 | ⬜ | `featureFlag.test.ts` |
| 2.3.4.4 | 폴백 로직 구현 | ⬜ | `featureFlag.test.ts` |

**검증 기준**:
- [ ] 기존 Gemini 기능 100% 동작
- [ ] 기능 플래그로 신규 경로 전환 가능
- [ ] 성능 저하 < 50ms
- [ ] 🆕 18개 이벤트 동등성 검증 완료

---

# M2.4: 🆕 ModelConfigService 호환 레이어 (2-3일)

## 목표
ModelConfigService의 GenerateContentConfig 의존성 해결

## 작업 항목

### 2.4.1 호환 레이어 구현
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.4.1.1 | `LlmModelConfig` 인터페이스 정의 | ⬜ | `modelConfig.test.ts` |
| 2.4.1.2 | `GenerateContentConfig` 래퍼 구현 | ⬜ | `modelConfig.test.ts` |
| 2.4.1.3 | 설정 머지 로직 확장 | ⬜ | `modelConfig.test.ts` |
| 2.4.1.4 | 프로바이더별 설정 분기 | ⬜ | `modelConfig.test.ts` |

**TDD 시나리오**:
```typescript
describe('ModelConfigService Compatibility', () => {
  it('should resolve config for Gemini provider', () => {
    const modelConfigService = new ModelConfigService(config);

    const resolved = modelConfigService.getResolvedConfig({
      model: 'gemini-2.0-flash',
      provider: ProviderType.Gemini
    });

    // GenerateContentConfig 형태로 반환
    expect(resolved.generateContentConfig.temperature).toBeDefined();
  });

  it('should resolve config for Claude provider', () => {
    const modelConfigService = new ModelConfigService(config);

    const resolved = modelConfigService.getResolvedConfig({
      model: 'claude-sonnet-4-20250514',
      provider: ProviderType.Claude
    });

    // LlmGenerateConfig 형태로 반환
    expect(resolved.llmConfig.temperature).toBeDefined();
  });
});
```

### 2.4.2 ModelRouterService 연동
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.4.2.1 | 라우팅 컨텍스트 확장 | ⬜ | `router.test.ts` |
| 2.4.2.2 | 프로바이더 인식 라우팅 | ⬜ | `router.test.ts` |
| 2.4.2.3 | 기존 라우팅 전략 호환성 | ⬜ | `router.test.ts` |

**검증 기준**:
- [ ] 기존 ModelConfigService 동작 유지
- [ ] 신규 프로바이더 설정 지원
- [ ] 라우팅 결정이 프로바이더 인식

---

# M2.5: 🆕 유틸리티 레이어 리팩토링 (2-3일)

## 목표
유틸리티 함수들의 프로바이더 독립화

## 작업 항목

### 2.5.1 tokenCalculation.ts 리팩토링
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.5.1.1 | `LlmPart` 타입으로 전환 | ⬜ | `tokenCalculation.test.ts` |
| 2.5.1.2 | `estimateTokenCountSync` 시그니처 변경 | ⬜ | `tokenCalculation.test.ts` |
| 2.5.1.3 | `calculateRequestTokenCount` 시그니처 변경 | ⬜ | `tokenCalculation.test.ts` |
| 2.5.1.4 | 레거시 호환 래퍼 추가 | ⬜ | `tokenCalculation.test.ts` |

**TDD 시나리오**:
```typescript
describe('tokenCalculation', () => {
  it('should estimate tokens for LlmContent', () => {
    const content: LlmContent = { type: 'text', text: 'Hello world' };
    const tokens = estimateTokenCountSync([content]);
    expect(tokens).toBeGreaterThan(0);
  });

  it('should maintain backward compatibility with Part', () => {
    const part: Part = { text: 'Hello world' };
    // 레거시 래퍼 사용
    const tokens = estimateTokenCountSyncLegacy([part]);
    expect(tokens).toBeGreaterThan(0);
  });
});
```

### 2.5.2 partUtils.ts 리팩토링
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.5.2.1 | `partToString` → `contentToString` | ⬜ | `partUtils.test.ts` |
| 2.5.2.2 | `getResponseText` → `getMessageText` | ⬜ | `partUtils.test.ts` |
| 2.5.2.3 | `flatMapTextParts` 시그니처 변경 | ⬜ | `partUtils.test.ts` |
| 2.5.2.4 | 레거시 호환 래퍼 추가 | ⬜ | `partUtils.test.ts` |

### 2.5.3 llmUtils.ts 생성
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.5.3.1 | 공통 LLM 유틸리티 정의 | ⬜ | `llmUtils.test.ts` |
| 2.5.3.2 | 메시지 변환 헬퍼 | ⬜ | `llmUtils.test.ts` |
| 2.5.3.3 | 콘텐츠 타입 체크 헬퍼 | ⬜ | `llmUtils.test.ts` |

**검증 기준**:
- [ ] 모든 유틸리티 프로바이더 독립
- [ ] 레거시 호환성 유지
- [ ] 기존 테스트 100% 통과

---

# M2.6: 🆕 라우팅 레이어 타입 독립화 (2-3일) [Critical - 리뷰 반영]

## 목표
`packages/core/src/routing/routingStrategy.ts`의 `@google/genai` 의존성 제거

## 배경 (Critical 이슈)
`routingStrategy.ts`가 `Content`, `PartListUnion`을 직접 import하고 있어,
이 경로를 다루지 않으면 타입 독립화가 완료되지 않음.

## 현재 의존성 분석
```typescript
// packages/core/src/routing/routingStrategy.ts:7
import type { Content, PartListUnion } from '@google/genai';

export interface RoutingContext {
  history: Content[];           // ← @google/genai 직접 의존
  request: PartListUnion;       // ← @google/genai 직접 의존
  signal: AbortSignal;
  requestedModel?: string;
}
```

## 작업 항목

### 2.6.1 RoutingContext 타입 전환
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.6.1.1 | `RoutingContext` 인터페이스 분석 | ⬜ | N/A (분석) |
| 2.6.1.2 | `LlmRoutingContext` 인터페이스 정의 | ⬜ | `routingStrategy.test.ts` |
| 2.6.1.3 | `history: Content[]` → `history: LlmMessage[]` 전환 | ⬜ | `routingStrategy.test.ts` |
| 2.6.1.4 | `request: PartListUnion` → `request: LlmContent[]` 전환 | ⬜ | `routingStrategy.test.ts` |
| 2.6.1.5 | 레거시 RoutingContext 호환 레이어 | ⬜ | `routingStrategy.test.ts` |

**TDD 시나리오**:
```typescript
describe('RoutingContext Type Independence', () => {
  it('should accept LlmMessage array for history', () => {
    const context: LlmRoutingContext = {
      history: [
        { role: LlmRole.User, content: [{ type: 'text', text: 'Hi' }] }
      ],
      request: [{ type: 'text', text: 'Hello' }],
      signal: new AbortController().signal
    };

    expect(context.history[0].role).toBe(LlmRole.User);
  });

  it('should maintain backward compatibility with Content', () => {
    const geminiContent: Content = { role: 'user', parts: [{ text: 'Hi' }] };
    const legacyContext: RoutingContext = {
      history: [geminiContent],
      request: [{ text: 'Hello' }],
      signal: new AbortController().signal
    };

    // 레거시 래퍼로 변환
    const llmContext = toLlmRoutingContext(legacyContext);
    expect(llmContext.history[0].role).toBe(LlmRole.User);
  });
});
```

### 2.6.2 라우팅 전략 구현체 마이그레이션
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.6.2.1 | `compositeStrategy.ts` 타입 전환 | ⬜ | `compositeStrategy.test.ts` |
| 2.6.2.2 | `classifierStrategy.ts` 타입 전환 | ⬜ | `classifierStrategy.test.ts` |
| 2.6.2.3 | `defaultStrategy.ts` 타입 전환 | ⬜ | `defaultStrategy.test.ts` |
| 2.6.2.4 | `fallbackStrategy.ts` 타입 전환 | ⬜ | `fallbackStrategy.test.ts` |
| 2.6.2.5 | `overrideStrategy.ts` 타입 전환 | ⬜ | `overrideStrategy.test.ts` |
| 2.6.2.6 | `numericalClassifierStrategy.ts` 타입 전환 | ⬜ | `numericalClassifierStrategy.test.ts` |

### 2.6.3 ModelRouterService 마이그레이션
| ID | 작업 | 상태 | 테스트 파일 |
|----|------|------|------------|
| 2.6.3.1 | `modelRouterService.ts` 타입 전환 | ⬜ | `modelRouterService.test.ts` |
| 2.6.3.2 | 라우팅 호출부 타입 전환 | ⬜ | `modelRouterService.test.ts` |
| 2.6.3.3 | 기존 라우팅 동작 동등성 검증 | ⬜ | `routerParity.test.ts` |

**영향 받는 파일 목록**:
```
packages/core/src/routing/
├── routingStrategy.ts        ← Content, PartListUnion import
├── modelRouterService.ts     ← RoutingContext 사용
└── strategies/
    ├── compositeStrategy.ts
    ├── classifierStrategy.ts
    ├── defaultStrategy.ts
    ├── fallbackStrategy.ts
    ├── overrideStrategy.ts
    └── numericalClassifierStrategy.ts
```

**검증 기준**:
- [ ] `routingStrategy.ts`에서 `@google/genai` import 제거
- [ ] 모든 라우팅 전략 구현체 타입 전환 완료
- [ ] 기존 라우팅 테스트 100% 통과
- [ ] 라우팅 동등성 검증 완료

---

# PHASE 2 COMPLETION CHECKLIST

## Quality Gates
- [ ] 모든 단위 테스트 통과
- [ ] 동등성 테스트 100% 통과
- [ ] TypeScript 컴파일 에러 없음
- [ ] ESLint 경고 없음
- [ ] 기존 E2E 테스트 통과

## 성능 검증
- [ ] 응답 지연 증가 < 50ms
- [ ] 메모리 사용량 증가 < 10%
- [ ] 스트리밍 첫 토큰 지연 < 100ms

## 산출물 확인
- [ ] `packages/core/src/providers/gemini/adapter.ts` 생성
- [ ] `packages/core/src/providers/gemini/converter.ts` 생성
- [ ] `packages/core/src/providers/gemini/eventMapper.ts` 생성 🆕
- [ ] `packages/core/src/providers/gemini/chat.ts` 이동 🆕
- [ ] `packages/core/src/providers/gemini/turn.ts` 이동 🆕
- [ ] `packages/core/src/core/contentGenerator.ts` 수정
- [ ] `packages/core/src/core/baseLlmClient.ts` 수정
- [ ] `packages/core/src/core/loggingContentGenerator.ts` 수정 🆕
- [ ] `packages/core/src/core/recordingContentGenerator.ts` 수정 🆕
- [ ] `packages/core/src/core/fakeContentGenerator.ts` 수정 🆕
- [ ] `packages/core/src/utils/retry.ts` 수정
- [ ] `packages/core/src/utils/tokenCalculation.ts` 수정 🆕
- [ ] `packages/core/src/utils/partUtils.ts` 수정 🆕
- [ ] `packages/core/src/utils/llmUtils.ts` 생성 🆕
- [ ] `packages/core/src/routing/routingStrategy.ts` 수정 🆕 [Critical]
- [ ] `packages/core/src/routing/strategies/*.ts` 수정 🆕

## 다음 Phase 진행 조건
- [ ] Phase 2 모든 Milestone 완료
- [ ] 동등성 검증 완료
- [ ] 🆕 18개 이벤트 매핑 검증 완료
- [ ] 기능 플래그 동작 확인
- [ ] 코드 리뷰 완료

---

# ROLLBACK PLAN

## 긴급 롤백 시나리오
1. `ENABLE_MULTI_PROVIDER=false` 설정
2. 기존 Gemini 전용 경로로 폴백
3. 이슈 분석 및 수정

## 점진적 롤백
1. 문제 발생 컴포넌트 식별
2. 해당 컴포넌트만 레거시 모드 전환
3. 나머지 컴포넌트는 신규 경로 유지

---

# NOTES

## 주의사항
- GeminiChat (988라인) 리팩토링 시 점진적 접근
- 스트리밍 로직 변경 시 충분한 테스트 필요
- 기존 테스트 회귀 주의
- 🆕 18개 이벤트 매핑 누락 방지
- 🆕 라우팅 레이어 타입 전환 필수 (routingStrategy.ts) [Critical]

## 리뷰 2 제언사항 반영 [v0.3]
1. **Turn 클래스 rawResponse 설계**: 어댑터 도입 시 원본 응답 유지 방안 구현 단계에서 결정
   - `Turn.debugResponses`에 원본 응답 저장 중
   - `LlmGenerateResponse.rawResponse` 필드 활용 권장
2. **단계적 적용 순서 권장**:
   - 1단계: 타입 정의 (`Llm*`) 및 Alias 적용 (기존 코드 변경 없이)
   - 2단계: Utility 리팩토링 (`tokenCalculation`, `partUtils`)
   - 3단계: Adapter 구현 (실제 로직 분리)
3. **테스트 Mock 교체 비용**: `geminiChat.test.ts` 등의 Mock 객체를 `ContentGenerator` 인터페이스 기반으로 교체 필요 → M3.5에서 처리

## TDD 원칙
1. 각 변환 함수마다 테스트 먼저 작성
2. 에지 케이스 (빈 응답, 에러 등) 테스트 포함
3. 동등성 테스트로 기존 동작 보장
4. 🆕 이벤트 매핑 테스트 전수 작성

## 참고 문서
- [03-technical-design.md](../03-technical-design.md)
- [05-implementation-plan.md](../05-implementation-plan.md)
- 🆕 [event-mapping-matrix.md](../event-mapping-matrix.md)

---

# CHANGE LOG

| 날짜 | 버전 | 변경 내용 |
|------|------|----------|
| 2026-02-01 | 0.1 | 초안 작성 |
| 2026-02-01 | 0.2 | 리뷰 반영: M2.0 디렉토리 재구성 신규, M2.2 EventMapper 상세화(18개 이벤트), M2.4 ModelConfigService 호환 레이어 신규, M2.5 유틸리티 레이어 리팩토링 신규 |
| 2026-02-01 | 0.3 | 2차 리뷰 반영: M2.6 라우팅 레이어 리팩토링 신규 [Critical], 2.1.3 baseLlmClient 파일명 수정, 2.1.5 hooks 테스트 파일 목록 정정, 2.1.6 ContentGenerator 래퍼 마이그레이션 신규, 2.2.2a StreamEventType 매핑 신규 |
