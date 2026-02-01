# Multi-LLM Provider Adapter - Migration Plan

> 문서 버전: 1.0 | 작성일: 2026-02-01

---

## 📊 의존성 분석 요약

### @google/genai 의존 파일 현황

| 카테고리 | 파일 수 | 핵심 파일 |
|----------|--------|----------|
| **core/** | 11 | `turn.ts`, `contentGenerator.ts`, `geminiChat.ts`, `client.ts`, `baseLlmClient.ts` |
| **services/** | 6 | `modelConfigService.ts`, `chatCompressionService.ts`, `loopDetectionService.ts` |
| **routing/** | 4 | `routingStrategy.ts`, `classifierStrategy.ts`, `numericalClassifierStrategy.ts` |
| **hooks/** | 6 | `hookTranslator.ts`, `hookEventHandler.ts`, `hookSystem.ts`, `types.ts` |
| **utils/** | 14 | `partUtils.ts`, `tokenCalculation.ts`, `apiConversionUtils.ts`, `retry.ts` |
| **tools/** | 8 | `tool-registry.ts`, `mcp-client.ts`, `read-file.ts` |
| **기타** | 14 | agents/, code_assist/, telemetry/, safety/, scheduler/ |
| **합계** | **63** | - |

---

## 🔴 Critical Path 파일 (핵심 경로)

### Tier 1: 최우선 리팩토링 대상

```
packages/core/src/core/
├── turn.ts                    # GeminiEventType 정의 (18개), ServerGeminiStreamEvent
├── contentGenerator.ts        # ContentGenerator 인터페이스, AuthType
├── geminiChat.ts              # 988라인, Gemini 전용 스트리밍 로직
├── baseLlmClient.ts           # Content, Part, GenerateContentConfig
└── client.ts                  # GeminiClient, 전체 세션 관리
```

### Tier 2: 연쇄 영향 파일

```
packages/core/src/services/
├── modelConfigService.ts      # GenerateContentConfig 직접 의존
├── chatCompressionService.ts  # Content, Part 사용
└── loopDetectionService.ts    # GeminiEventType 사용

packages/core/src/routing/
├── routingStrategy.ts         # Content, PartListUnion 직접 import (Critical)
└── strategies/*.ts            # RoutingContext 사용
```

### Tier 3: 유틸리티/도구

```
packages/core/src/utils/
├── partUtils.ts               # Part, PartListUnion, GenerateContentResponse
├── tokenCalculation.ts        # Part 타입
└── generateContentResponseUtilities.ts
```

---

## 📋 타입 의존성 상세

### @google/genai에서 import하는 주요 타입

| 타입 | 사용 파일 수 | 영향도 |
|------|-------------|--------|
| `GenerateContentResponse` | 20+ | 높음 |
| `GenerateContentParameters` | 15+ | 높음 |
| `Content` | 30+ | 매우 높음 |
| `Part` | 25+ | 매우 높음 |
| `PartListUnion` | 15+ | 높음 |
| `FunctionCall` | 10+ | 중간 |
| `FunctionDeclaration` | 8+ | 중간 |
| `FinishReason` | 5+ | 낮음 |
| `GenerateContentConfig` | 10+ | 높음 |
| `CountTokensResponse` | 5+ | 낮음 |

---

## 🎯 GeminiEventType 매핑 (18개)

```typescript
// turn.ts:52-71 에서 정의
export enum GeminiEventType {
  Content = 'content',                           // 텍스트 응답
  ToolCallRequest = 'tool_call_request',         // 도구 호출 요청
  ToolCallResponse = 'tool_call_response',       // 도구 호출 응답
  ToolCallConfirmation = 'tool_call_confirmation', // 도구 호출 확인
  UserCancelled = 'user_cancelled',              // 사용자 취소
  Error = 'error',                               // 에러
  ChatCompressed = 'chat_compressed',            // 채팅 압축 (Gemini 특화)
  Thought = 'thought',                           // 사고 과정
  MaxSessionTurns = 'max_session_turns',         // 최대 세션 턴
  Finished = 'finished',                         // 완료
  LoopDetected = 'loop_detected',                // 루프 감지
  Citation = 'citation',                         // 인용
  Retry = 'retry',                               // 재시도
  ContextWindowWillOverflow = 'context_window_will_overflow', // 컨텍스트 오버플로우
  InvalidStream = 'invalid_stream',              // 무효 스트림
  ModelInfo = 'model_info',                      // 모델 정보
  AgentExecutionStopped = 'agent_execution_stopped', // 에이전트 중지
  AgentExecutionBlocked = 'agent_execution_blocked', // 에이전트 차단
}
```

### 이벤트 사용처 분석

| 이벤트 | 주요 사용 파일 | 용도 |
|--------|---------------|------|
| Content | turn.ts, client.ts, hooks/ | 텍스트 스트리밍 |
| ToolCallRequest | turn.ts, loopDetectionService.ts | 도구 호출 |
| Error | turn.ts, client.ts | 에러 처리 |
| Finished | turn.ts | 응답 완료 |
| ModelInfo | client.ts | 모델 정보 표시 |

---

## 🔄 마이그레이션 전략

### Phase 1: Alias 도입 (하위 호환성 유지)

```typescript
// providers/legacyAliases.ts
export type Content = LlmMessage;
export type Part = LlmContent;
export type GenerateContentResponse = LlmGenerateResponse;
```

### Phase 2: 병행 운영

```typescript
// 기존 경로
import { Content } from '@google/genai';

// 신규 경로 (권장)
import { LlmMessage } from '../providers/types';

// Alias 경로 (전환 기간)
import { Content } from '../providers/legacyAliases';
```

### Phase 3: 점진적 제거

1. 핵심 파일 (Tier 1) 먼저 전환
2. 연쇄 영향 파일 (Tier 2) 전환
3. 유틸리티 (Tier 3) 전환
4. 테스트 파일 마이그레이션
5. legacyAliases.ts deprecated 표시

---

## 📝 마이그레이션 순서

| 순서 | 파일/모듈 | 작업 내용 | 예상 기간 |
|------|----------|----------|----------|
| 1 | `providers/types.ts` | LlmMessage, LlmContent 등 정의 | 1일 |
| 2 | `providers/events.ts` | LlmStreamEvent 정의 (18개 매핑) | 1일 |
| 3 | `providers/legacyAliases.ts` | 하위 호환 alias 생성 | 0.5일 |
| 4 | `core/turn.ts` | GeminiEventType → LlmStreamEvent 분리 | 2일 |
| 5 | `core/contentGenerator.ts` | ContentGenerator 인터페이스 분리 | 2일 |
| 6 | `routing/routingStrategy.ts` | RoutingContext 타입 독립화 | 1일 |
| 7 | `utils/*.ts` | 유틸리티 타입 전환 | 2일 |
| 8 | 테스트 파일 | Mock 객체 마이그레이션 | 3일 |

---

## ⚠️ 리스크 및 대응

| 리스크 | 확률 | 대응 방안 |
|--------|------|----------|
| 타입 호환성 깨짐 | 높음 | legacyAliases로 점진적 전환 |
| 테스트 실패 | 높음 | 각 단계마다 `npm run test` 실행 |
| 런타임 에러 | 중간 | 기능 플래그로 폴백 제공 |
| 성능 저하 | 낮음 | 벤치마크 테스트 |

---

## ✅ 완료 기준

- [ ] 모든 @google/genai import가 providers/ 경유
- [ ] GeminiEventType → LlmStreamEvent 매핑 완료
- [ ] 기존 테스트 100% 통과
- [ ] TypeScript 컴파일 에러 없음
