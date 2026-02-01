# GeminiEventType → LlmStreamEvent 매핑 매트릭스

> 문서 버전: 1.0 | 작성일: 2026-02-01

---

## 📋 이벤트 매핑 테이블

| # | GeminiEventType | LlmStreamEventType | 공통/특화 | 비고 |
|---|-----------------|-------------------|----------|------|
| 1 | `Content` | `TextDelta` | 공통 | 텍스트 스트리밍 |
| 2 | `ToolCallRequest` | `ToolCallRequest` | 공통 | 도구 호출 요청 |
| 3 | `ToolCallResponse` | `ToolCallResponse` | 공통 | 도구 호출 응답 |
| 4 | `ToolCallConfirmation` | `ToolCallConfirmation` | 공통 | 도구 실행 확인 |
| 5 | `UserCancelled` | `UserCancelled` | 공통 | 사용자 취소 |
| 6 | `Error` | `Error` | 공통 | 에러 발생 |
| 7 | `ChatCompressed` | `ChatCompressed` | **Gemini 특화** | 채팅 압축 |
| 8 | `Thought` | `ThoughtDelta` | 공통 | 사고 과정 (Claude도 지원) |
| 9 | `MaxSessionTurns` | `MaxSessionTurns` | 공통 | 세션 제한 |
| 10 | `Finished` | `Finished` | 공통 | 응답 완료 |
| 11 | `LoopDetected` | `LoopDetected` | 공통 | 루프 감지 |
| 12 | `Citation` | `Citation` | 공통 | 인용 정보 |
| 13 | `Retry` | `Retry` | 공통 | 재시도 신호 |
| 14 | `ContextWindowWillOverflow` | `ContextWindowOverflow` | 공통 | 컨텍스트 오버플로우 |
| 15 | `InvalidStream` | `InvalidStream` | 공통 | 무효 스트림 |
| 16 | `ModelInfo` | `ModelInfo` | 공통 | 모델 정보 |
| 17 | `AgentExecutionStopped` | `AgentStopped` | 공통 | 에이전트 중지 |
| 18 | `AgentExecutionBlocked` | `AgentBlocked` | 공통 | 에이전트 차단 |

---

## 🎯 프로바이더별 이벤트 지원

| 이벤트 | Gemini | Claude | OpenAI | vLLM |
|--------|--------|--------|--------|------|
| TextDelta | ✅ | ✅ | ✅ | ✅ |
| ToolCallRequest | ✅ | ✅ | ✅ | ⚠️ |
| ToolCallResponse | ✅ | ✅ | ✅ | ⚠️ |
| Error | ✅ | ✅ | ✅ | ✅ |
| ThoughtDelta | ✅ | ✅ | ❌ | ❌ |
| ChatCompressed | ✅ | ❌ | ❌ | ❌ |
| Finished | ✅ | ✅ | ✅ | ✅ |
| Citation | ✅ | ❌ | ❌ | ❌ |
| Usage | ✅ | ✅ | ✅ | ⚠️ |

**범례**: ✅ 지원 | ⚠️ 부분 지원 | ❌ 미지원

---

## 📝 이벤트 페이로드 매핑

### TextDelta (Content)

```typescript
// Gemini
{ type: GeminiEventType.Content, value: string, traceId?: string }

// 공통
{ type: LlmStreamEventType.TextDelta, text: string, traceId?: string }
```

### ToolCallRequest

```typescript
// Gemini
{
  type: GeminiEventType.ToolCallRequest,
  value: {
    callId: string,
    name: string,
    args: Record<string, unknown>,
    isClientInitiated: boolean,
    prompt_id: string,
    traceId?: string
  }
}

// 공통
{
  type: LlmStreamEventType.ToolCallRequest,
  callId: string,
  name: string,
  args: Record<string, unknown>,
  traceId?: string
}
```

### Finished

```typescript
// Gemini
{
  type: GeminiEventType.Finished,
  value: {
    reason: FinishReason | undefined,
    usageMetadata: GenerateContentResponseUsageMetadata | undefined
  }
}

// 공통
{
  type: LlmStreamEventType.Finished,
  finishReason?: LlmFinishReason,
  usage?: LlmUsage
}
```

---

## 🔄 변환 함수 설계

```typescript
// providers/gemini/eventMapper.ts
export class GeminiEventMapper {
  toLlmEvent(event: ServerGeminiStreamEvent): LlmStreamEvent {
    switch (event.type) {
      case GeminiEventType.Content:
        return { type: LlmStreamEventType.TextDelta, text: event.value, traceId: event.traceId };
      case GeminiEventType.ToolCallRequest:
        return { type: LlmStreamEventType.ToolCallRequest, ...event.value };
      case GeminiEventType.Thought:
        return { type: LlmStreamEventType.ThoughtDelta, thought: event.value, traceId: event.traceId };
      // ... 18개 모두 매핑
    }
  }

  toGeminiEvent(event: LlmStreamEvent): ServerGeminiStreamEvent {
    // 역방향 매핑 (UI 호환성 유지)
  }
}
```

---

## ⚠️ 특이 사항

1. **ChatCompressed**: Gemini 전용 - 다른 프로바이더에서는 무시
2. **Citation**: Gemini 전용 - Claude/OpenAI는 별도 인용 방식
3. **ThoughtDelta**: Claude의 `thinking` 모드와 호환 가능
4. **Usage**: 프로바이더별 토큰 계산 방식 차이 있음
