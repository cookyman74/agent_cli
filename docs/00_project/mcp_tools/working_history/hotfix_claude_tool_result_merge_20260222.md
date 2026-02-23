# Hotfix 작업 결과서 — Claude tool_result 병합 오류 수정

## 작업 요약

- **목적**: Gemini → Claude 프로바이더 전환 시 Anthropic API 400 에러 해소
- **에러 메시지**:
  `messages.2.content.0: unexpected tool_use_id found in tool_result blocks: Each tool_result block must have a corresponding tool_use block in the previous message.`
- **근본 원인**: `toClaudeMessages()`에서 `tool_result` 블록이 일반 user text와
  무조건 병합되어 `tool_use`와의 인접성 요구사항 위반
- **변경 파일**:

| 파일                                                   | 액션 | 변경량                                    |
| ------------------------------------------------------ | ---- | ----------------------------------------- |
| `packages/core/src/providers/claude/converter.ts`      | 수정 | +13줄 (병합 조건 강화)                    |
| `packages/core/src/providers/claude/converter.test.ts` | 수정 | +55줄/-10줄 (기존 테스트 수정 + 신규 2개) |

## 원인 분석

### 문제 발생 흐름

Gemini에서 tool 사용 후 Claude로 프로바이더를 전환하면, 대화 이력이 LlmMessage
포맷으로 변환된 뒤 `toClaudeMessages()`를 거쳐 Anthropic API 포맷으로
재변환된다.

```
Gemini 대화 이력 (LlmMessage 변환 후):
  [user("질문")] → [assistant(tool_use id=xxx)] → [tool(tool_result id=xxx)] → [user("다음 질문")]

toClaudeMessages() 변환:
  1. tool role → user role 매핑 (Anthropic은 user/assistant만 지원)
  2. 연속 동일 role 병합 (Anthropic API 요구사항)

버그 시나리오:
  [assistant(tool_use)] → [tool→user(tool_result)] → [user("다음 질문")]
  병합 후:
  [assistant(tool_use)] → [user(tool_result + "다음 질문")]  ← 이것은 OK

  그러나:
  [user("이전 질문")] → [tool→user(tool_result)]
  병합 후:
  [user("이전 질문" + tool_result)]  ← tool_use가 직전 assistant에 없으므로 400 에러
```

### Anthropic API 요구사항

> Each `tool_result` block must have a corresponding `tool_use` block in **the
> previous message**.

`tool_result`는 반드시 `tool_use`를 포함한 assistant 메시지 **바로 다음**
메시지에 위치해야 한다. 일반 user text와 병합되면 이 인접성이 깨진다.

## 구현 세부

### 수정 로직 (`converter.ts:112-130`)

**Before** (버그):

```typescript
// 같은 role이면 무조건 병합
const last = claudeMessages[claudeMessages.length - 1];
if (last && last['role'] === role) {
  const existing = last['content'] as Array<Record<string, unknown>>;
  existing.push(...content);
}
```

**After** (수정):

```typescript
// tool_result 포함 여부가 동일할 때만 병합
const last = claudeMessages[claudeMessages.length - 1];
const hasToolResult = content.some((c) => c['type'] === 'tool_result');
const lastHasToolResult =
  last &&
  (last['content'] as Array<Record<string, unknown>>).some(
    (c) => c['type'] === 'tool_result',
  );

if (last && last['role'] === role && hasToolResult === lastHasToolResult) {
  // 둘 다 tool_result이거나, 둘 다 tool_result가 아닐 때만 병합
  existing.push(...content);
} else {
  claudeMessages.push({ role, content });
}
```

### 병합 규칙 변경

| 케이스                            | Before   | After    | 이유                                |
| --------------------------------- | -------- | -------- | ----------------------------------- |
| `[user(text)] + [user(text)]`     | 병합     | 병합     | 연속 user text — 정상               |
| `[tool(result)] + [tool(result)]` | 병합     | 병합     | 연속 tool_result — 정상             |
| `[user(text)] + [tool(result)]`   | **병합** | **분리** | tool_result가 tool_use에서 분리됨   |
| `[tool(result)] + [user(text)]`   | **병합** | **분리** | tool_result와 무관한 text 혼합 방지 |

### 테스트 변경

| 테스트                                                                                 | 변경 내용                                                                                                          |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `should NOT merge user text with following tool_result`                                | 기존 `should merge user followed by tool` 수정 — 2개 메시지 분리 검증으로 변경                                     |
| `should keep tool_result separate from following user text (provider switch scenario)` | **신규** — Gemini→Claude 전환 5-message 시나리오 (user→assistant(tool_use)→tool(tool_result)→assistant(text)→user) |

## 검증 결과

| 검증 항목                    | 결과                                               |
| ---------------------------- | -------------------------------------------------- |
| Claude converter 단위 테스트 | ✅ 67 PASS                                         |
| Core 빌드                    | ✅ PASS                                            |
| 영향 범위                    | Claude converter 1개 함수만 변경, 코어 로직 무변경 |

## 영향 범위

- **수정 범위**: `ClaudeConverter.toClaudeMessages()` 병합 조건만 변경
- **기존 동작 호환**: 동일 타입 간 병합(user+user, tool+tool)은 그대로 유지
- **OpenAI adapter**: 영향 없음 (별도 변환 로직)
- **Gemini adapter**: 영향 없음 (네이티브 API 사용)
