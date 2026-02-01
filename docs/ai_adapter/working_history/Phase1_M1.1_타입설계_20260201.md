# Phase 1, Milestone 1.1: 타입/에러/호환 레이어 설계 - 작업 결과서

- **작업일**: 2026-02-01
- **상태**: ✅ 완료
- **커밋**: `b6668553c`

---

## 📋 작업 개요

프로바이더 독립 타입 시스템을 구현하여 Gemini, Claude, OpenAI, vLLM 등 다양한
LLM 프로바이더를 지원하기 위한 기반을 마련.

---

## 📊 작업 결과

### 새 파일 (6개, 1528줄)

| 파일               | 라인 | 설명                                                              |
| ------------------ | ---- | ----------------------------------------------------------------- |
| `types.ts`         | ~280 | 핵심 타입: LlmMessage, LlmContent, LlmGenerateRequest/Response 등 |
| `events.ts`        | ~340 | 스트림 이벤트: LlmEventType (18개), 이벤트 페이로드, 타입 가드    |
| `errors.ts`        | ~310 | 에러 타입: LlmError, LlmErrorType, 서브클래스 9개                 |
| `legacyAliases.ts` | ~170 | 레거시 호환: Content→LlmMessage, Part→LlmContent 등               |
| `index.ts`         | ~30  | 모듈 re-export                                                    |
| `types.test.ts`    | ~264 | 테스트 19개                                                       |

### 핵심 타입 정의

```typescript
// LlmContent 유니온 타입 (5가지)
LlmTextContent |
  LlmImageContent |
  LlmToolCallContent |
  LlmToolResultContent |
  LlmThoughtContent;

// LlmMessage 구조
interface LlmMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: LlmContent[];
  name?: string;
  toolCallId?: string;
}

// LlmEventType (GeminiEventType 18개 매핑)
(TextDelta,
  ThoughtDelta,
  ToolCallRequest,
  ToolCallResponse,
  ToolCallConfirmation,
  Finished,
  MessageEnd,
  Error,
  UserCancelled,
  Retry,
  InvalidStream,
  ContextWindowOverflow,
  MaxSessionTurns,
  ChatCompressed,
  LoopDetected,
  AgentStopped,
  AgentBlocked,
  ModelInfo,
  Citation);
```

---

## ✅ 검증 결과

| 항목       | 결과          |
| ---------- | ------------- |
| **빌드**   | ✅ 성공       |
| **테스트** | ✅ 19/19 통과 |
| **린트**   | ✅ 통과       |

---

## 🔄 GeminiEventType → LlmEventType 매핑

| GeminiEventType           | LlmEventType          | 유형       |
| ------------------------- | --------------------- | ---------- |
| Content                   | TextDelta             | 공통       |
| Thought                   | ThoughtDelta          | 공통       |
| ToolCallRequest           | ToolCallRequest       | 공통       |
| ToolCallResponse          | ToolCallResponse      | 공통       |
| ToolCallConfirmation      | ToolCallConfirmation  | 공통       |
| Finished                  | Finished              | 공통       |
| Error                     | Error                 | 공통       |
| UserCancelled             | UserCancelled         | 공통       |
| Retry                     | Retry                 | 공통       |
| InvalidStream             | InvalidStream         | 공통       |
| ContextWindowWillOverflow | ContextWindowOverflow | 공통       |
| MaxSessionTurns           | MaxSessionTurns       | 공통       |
| LoopDetected              | LoopDetected          | 공통       |
| AgentExecutionStopped     | AgentStopped          | 공통       |
| AgentExecutionBlocked     | AgentBlocked          | 공통       |
| ModelInfo                 | ModelInfo             | 공통       |
| ChatCompressed            | ChatCompressed        | Gemini특화 |
| Citation                  | Citation              | Gemini특화 |

---

## 📝 다음 작업 (M1.2)에 전달할 이슈

| ID  | 이슈                                               | 우선순위 |
| --- | -------------------------------------------------- | -------- |
| I-5 | BaseAdapter 추상 클래스 구현 필요                  | High     |
| I-6 | GeminiAdapter는 GeminiTypeConverter와 함께 구현    | High     |
| I-7 | ContentGenerator 인터페이스 재정의 (types.ts 참조) | High     |

---

## 📁 파일 위치

```
packages/core/src/providers/
├── index.ts           # 모듈 re-export
├── types.ts           # 핵심 타입 정의
├── types.test.ts      # 타입 테스트
├── events.ts          # 스트림 이벤트 타입
├── errors.ts          # 에러 타입
└── legacyAliases.ts   # 레거시 호환 Alias
```

---

**작성**: AI Assistant  
**완료**: 2026-02-01 23:15 KST

---

## 📝 리뷰 피드백 반영 (2026-02-01 23:25)

### 수정된 이슈

| 심각도       | 이슈                       | 수정 내용                                                                                                  |
| ------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Critical** | 스트림 이벤트 2중 정의     | `types.ts`에서 `LlmStreamEventType` 제거, 간소화된 `LlmStreamEvent` 유지. 상세 이벤트는 `events.ts`로 통합 |
| **High**     | 이벤트 개수 불일치 (18→19) | `events.ts` 문서 주석 수정: "18 events + MessageEnd = 19 total"                                            |
| **High**     | 이미지 URL 필드 구조       | `LlmImageSource` 유니온 타입 도입: base64는 `data`, url은 `url` 필드 사용                                  |
| **Medium**   | `usage` 필수               | `LlmGenerateResponse.usage`를 선택적(`?`)으로 변경                                                         |
| **Medium**   | 툴 결과 타입 제한          | `content: string \| Record<string, unknown>`으로 확장                                                      |
| **Medium**   | Legacy alias 구조 경고     | `Content`, `PartListUnion`에 WARNING 주석 추가                                                             |

### 추후 과제

| 심각도  | 이슈                      | 상태               |
| ------- | ------------------------- | ------------------ |
| **Low** | events/errors 테스트 부재 | M1.2에서 추가 예정 |

### 검증 결과

- **빌드**: ✅ 성공
- **테스트**: ✅ 20/20 통과 (1개 추가됨)

---

## 📝 2차 리뷰 피드백 반영 (2026-02-02 00:45)

### 이슈 검증 결과

| ID  | 심각도   | 이슈                        | 결과                                                                          |
| --- | -------- | --------------------------- | ----------------------------------------------------------------------------- |
| C-1 | Critical | 누락된 문서 참조            | ❌ False Positive: `event-mapping-matrix.md`, `migration-plan.md` 모두 존재함 |
| H-1 | High     | LlmImageSource 설계 불일치  | ✅ 설계문서 업데이트: base64는 `data`, url은 `url` 필드                       |
| H-2 | High     | MODEL_OVERLOADED 누락       | ✅ `errors.ts`에 추가                                                         |
| H-3 | High     | GeminiEventType 매핑        | ✅ 검증 완료: 18개 이벤트 정확히 매핑됨                                       |
| M-1 | Medium   | content_delta vs text_delta | ✅ `text_delta`로 통일                                                        |
| M-2 | Medium   | events/errors 테스트 부재   | 🔄 M1.2에서 추가 예정                                                         |
| M-3 | Medium   | LlmEmbedRequest 미정의      | ✅ TODO 주석 추가                                                             |
| L-1 | Low      | supportsThought 설계 반영   | 🔄 추후 설계문서 업데이트 예정                                                |

### 수정된 파일

- `errors.ts`: MODEL_OVERLOADED 에러 타입 추가
- `types.ts`: content_delta → text_delta, Embed TODO 추가
- `03-technical-design.md`: LlmImageSource, LlmToolResultContent 업데이트

### 검증 결과

- **빌드**: ✅ 성공
- **테스트**: ✅ 20/20 통과
