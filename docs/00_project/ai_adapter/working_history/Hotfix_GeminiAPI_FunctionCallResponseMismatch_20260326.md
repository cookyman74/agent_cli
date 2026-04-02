# Hotfix: Gemini API functionCall/functionResponse 불일치 수정

- 작업일: 2026-03-26
- 범위: `packages/core/src/providers/gemini/chat.ts` — `isValidContent()` 함수
- 상태: 완료

---

## 1. 사전작업 (Pre-work)

### 1.1 증상

- Gemini 프로바이더로 정상 사용 중 간헐적으로 API 400 에러 발생
- 에러 메시지:
  ```
  API Error: Please ensure that the number of function response parts
  is equal to the number of function call parts of the function call turn.
  ```
- 앱 종료 후 재시작(세션 초기화) 시 정상 복구
- 특정 tool이나 프로바이더 전환과 무관한 간헐적 발생

### 1.2 원인 분석

**근본 원인**: `extractCuratedHistory()` → `isValidContent()`의 content 유효성
판정 결함

Gemini 모델이 간헐적으로 빈 텍스트 파트(`{ text: '' }`)를 `functionCall` 파트와
함께 반환:

```typescript
// model 응답 예시 (간헐적)
{
  role: 'model',
  parts: [
    { text: '' },                                    // ← 빈 텍스트
    { functionCall: { name: 'read_file', args: {...} } }
  ]
}
```

**문제 흐름**:

1. `isValidContent()`: `text: ''` 파트 감지 → content 전체를 **무효** 판정
2. `extractCuratedHistory()`: 해당 model turn 제거, 대응하는 user
   `functionResponse` turn은 유지
3. curated history 상태:
   ```
   user: { text: "질문" }
   // model: { functionCall: ... }  ← 제거됨
   user: { functionResponse: ... }  ← 고아 상태로 유지
   model: { text: "응답" }
   ```
4. 다음 API 호출 시 Gemini가 `functionCall` 없는 `functionResponse` 감지 → **400
   에러**

**재시작 시 복구되는 이유**: 세션 종료로 `this.history` 배열이 초기화되어 오염된
히스토리가 제거됨

### 1.3 영향 범위

- `chat.ts:sendMessageStream()` → `this.getHistory(true)` (curated) 경로
- `client.ts:processLlmTurn()` → `chat.getHistory(true)` 경로
- Gemini 네이티브 경로 + non-Gemini 프로바이더 경로 모두 해당 (curated history
  공유)

---

## 2. 본작업 (Main work)

### 2.1 Red (검증)

- 기존 테스트 확인:
  - `geminiChat.test.ts`: "should succeed if a tool call is followed by an empty
    part" (line 254) → 스트림 처리 성공 여부만 검증, curated history 정합성은
    미검증
- 에러 시나리오 분석:
  - model이 `[{ text: '' }, { functionCall: {...} }]` 반환 시
  - `isValidContent()` → `false` (line 135의 빈 텍스트 조건)
  - `extractCuratedHistory()` → model turn 제거, user functionResponse 잔류
  - 후속 API 호출 → functionCall/functionResponse 개수 불일치 → 400 에러

### 2.2 Green (코드 수정)

**수정 파일**: `packages/core/src/providers/gemini/chat.ts`

**수정 내용**: `isValidContent()` 함수에 functionCall 우선 검사 추가

```typescript
// BEFORE
function isValidContent(content: Content): boolean {
  if (content.parts === undefined || content.parts.length === 0) {
    return false;
  }
  for (const part of content.parts) {
    if (part === undefined || Object.keys(part).length === 0) {
      return false;
    }
    if (!part.thought && part.text !== undefined && part.text === '') {
      return false;
    }
  }
  return true;
}

// AFTER
function isValidContent(content: Content): boolean {
  if (content.parts === undefined || content.parts.length === 0) {
    return false;
  }
  // Content with functionCall parts is always valid — the model can issue
  // tool calls with or without accompanying text. Dropping such content
  // from curated history orphans the corresponding user functionResponse
  // turn, causing Gemini API 400: "number of function response parts must
  // equal the number of function call parts".
  if (content.parts.some((p) => p.functionCall)) {
    return true;
  }
  for (const part of content.parts) {
    if (part === undefined || Object.keys(part).length === 0) {
      return false;
    }
    if (!part.thought && part.text !== undefined && part.text === '') {
      return false;
    }
  }
  return true;
}
```

**수정 근거**:

- `functionCall` 파트가 있는 model 응답은 tool 호출 의도가 명확 → 빈 텍스트
  여부와 무관하게 유효
- model turn이 curated history에서 제거되지 않으므로 `functionResponse`와 항상
  1:1 매칭 유지
- `baseLlmClient.ts`의 `convertContentsToLlmMessages()` 등 다른 변환 경로에서도
  functionCall/functionResponse 대칭이 보장됨

### 2.3 Refactor

- 해당 없음 (최소 변경 원칙)

---

## 3. 사후작업 (Post-work)

### 3.1 검증

- `geminiChat.test.ts`: 48 passed (48)
- `client.test.ts`: 96 passed, 1 skipped (97)
- 기존 테스트 전체 통과, 회귀 없음

### 3.2 잔여 리스크

- `isValidContent()`가 `false`를 반환하는 다른 조건(빈 parts, undefined part,
  empty object part)에서도 functionCall이 포함된 경우는 이제 조기 return으로
  보호됨
- `extractCuratedHistory()`의 근본 설계(무효 model turn 제거 시 대응하는 user
  turn 미처리)는 functionCall 외의 시나리오에서 여전히 잠재적 위험 존재 → 추후
  모니터링

### 3.3 커밋 정보

- 타입: `fix(providers)`
- 스코프: Gemini curated history — functionCall content 유효성 판정
