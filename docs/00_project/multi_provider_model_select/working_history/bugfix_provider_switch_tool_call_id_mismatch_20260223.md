# Bugfix: Provider Switching 시 tool_call_id 불일치 오류 수정

**작업일자**: 2026-02-23 **작업자**: Claude Opus 4.6 **브랜치**:
hooks/se_manager **상태**: ✅ 완료

---

## 1. 문제 개요

### 1.1 증상

`hooks/se_manager` 브랜치를 `DID/v0.2`에 머지한 후, 이전에 해결했던 OpenAI API
400 오류가 재발:

```
✕ [API Error: 400 Invalid parameter: 'tool_call_id' of 'b598b96c-d535-4e2b-a5d2-34b67acddca9' not found in 'tool_calls' of previous message.]
```

### 1.2 재현 절차

1. `/auth login`으로 **Gemini** 프로바이더 선택 후 대화 (도구 사용 포함)
2. `/auth login`으로 **OpenAI** (또는 sLM) 프로바이더로 전환
3. "이전에 요청한 내용을 알려줘" 등 이전 대화 참조 요청
4. **400 에러 발생**

### 1.3 핵심 단서

사용자 제보: "최초 사용후 /auth login으로 gemini를 사용하고서 바로 다시 /auth
login으로 openai를 사용하여 '이전에 요청한 내용을 알려줘'라고 했을때 발생" →
**Provider switching** 시나리오에서 **Gemini history**가 원인

---

## 2. 근본 원인 분석

### 2.1 Gemini functionCall.id의 비대칭성

Gemini SDK의 `FunctionCall.id`와 `FunctionResponse.id`는 **optional 필드**
(`node_modules/@google/genai/dist/genai.d.ts`):

```typescript
interface FunctionCall {
  id?: string; // line 2716 — Gemini API가 설정하지 않을 수 있음
  name?: string;
  args?: Record<string, unknown>;
}

interface FunctionResponse {
  id?: string; // line 2792
  name?: string;
  response?: object;
}
```

### 2.2 ID 생성 경로 불일치

**Gemini native path** (`turn.ts:281`):

```typescript
const callId = fnCall.id ?? crypto.randomUUID(); // UUID-A 생성
```

- `callId`(UUID-A)는 `functionResponse.id`에 저장됨
- 그러나 Gemini SDK가 관리하는 history의 `functionCall.id`는 **undefined
  그대로** 유지

**Provider switching path** (`typeConversion.ts:54`):

```typescript
// convertPartToLlmContent
id: part.functionCall.id ?? crypto.randomUUID(); // UUID-B 생성 (새 UUID!)
```

```typescript
// convertPartToLlmContent (line 63)
toolCallId: part.functionResponse.id ?? ''; // UUID-A 사용 (기존 ID)
```

### 2.3 결과

| 항목                        | 값        |
| --------------------------- | --------- |
| `functionCall.id` (history) | undefined |
| `functionResponse.id`       | UUID-A    |
| 변환 후 `tool_call.id`      | UUID-B    |
| 변환 후 `tool_call_id`      | UUID-A    |
| **UUID-B ≠ UUID-A**         | **400!**  |

```
History (Gemini):
  model: { functionCall: { id: undefined, name: 'list_directory' } }
  user:  { functionResponse: { id: 'uuid-A', name: 'list_directory' } }

→ convertPartToLlmContent:
  assistant: { tool_call: { id: 'uuid-B' ← 새로 생성! } }
  tool:      { tool_result: { toolCallId: 'uuid-A' } }

→ OpenAI API: "tool_call_id 'uuid-A' not found in tool_calls"
```

---

## 3. 해결 방안

### 3.1 설계 원칙

- **전처리 방식**: `convertContentsToLlmMessages()` 호출 전에 history의 ID를
  조정
- **비침습적**: `typeConversion.ts`나 `turn.ts`를 수정하지 않음 (기존 Gemini
  동작 보존)
- **비변이**: 원본 history를 mutate하지 않음 (`structuredClone` 사용)
- **위치 기반 매칭**: Gemini가 functionCall/functionResponse 순서를 보장하므로
  index 기반 매칭

### 3.2 구현: `reconcileFunctionCallIds()`

**파일**: `packages/core/src/providers/gemini/requestBuilder.ts`

```typescript
/**
 * Reconcile functionCall/functionResponse IDs in Gemini history.
 *
 * When the Gemini native path handles tool calls, Turn.handlePendingFunctionCall
 * generates a callId via crypto.randomUUID() and stores it in the
 * functionResponse.id. However, the Gemini SDK does NOT write this back to
 * the functionCall.id in history (it remains undefined).
 *
 * On provider switch (Gemini → OpenAI), convertPartToLlmContent generates a
 * NEW random UUID for the undefined functionCall.id, causing a mismatch with
 * the functionResponse.id. OpenAI API then rejects the request with:
 *   "tool_call_id not found in tool_calls of previous message"
 *
 * This function pre-processes the history by matching functionCall/functionResponse
 * pairs by position (index) and name, copying the functionResponse.id to the
 * functionCall.id when it's missing.
 *
 * @returns A new Content[] with reconciled IDs (does NOT mutate the original)
 */
export function reconcileFunctionCallIds(history: Content[]): Content[] {
  const cloned: Content[] = structuredClone(history);

  for (let i = 0; i < cloned.length; i++) {
    const content = cloned[i];
    if (content.role !== 'model' || !content.parts) continue;

    // Collect functionCall parts that need ID reconciliation
    const functionCalls = content.parts
      .map((part, idx) => ({ part, idx }))
      .filter(
        (entry) => entry.part.functionCall && !entry.part.functionCall.id,
      );

    if (functionCalls.length === 0) continue;

    // Find the next user Content with functionResponse parts
    const nextContent = cloned[i + 1];
    if (!nextContent || nextContent.role !== 'user' || !nextContent.parts) {
      continue;
    }

    const functionResponses = nextContent.parts.filter(
      (part) => part.functionResponse,
    );

    // Match by position (index order) — Gemini maintains call/response order
    for (let j = 0; j < functionCalls.length; j++) {
      const fc = functionCalls[j].part.functionCall!;
      const fr = functionResponses[j]?.functionResponse;

      if (fr?.id) {
        // Copy functionResponse.id to functionCall.id
        fc.id = fr.id;
      } else {
        // Both undefined — generate a consistent ID for the pair
        const newId = randomUUID();
        fc.id = newId;
        if (fr) {
          fr.id = newId;
        }
      }
    }
  }

  return cloned;
}
```

### 3.3 호출 위치

**파일**: `packages/core/src/providers/gemini/requestBuilder.ts` —
`buildLlmRequestFromGeminiState()`

```typescript
export function buildLlmRequestFromGeminiState(
  opts: BuildLlmRequestOptions,
): LlmGenerateRequest {
  // ★ Reconcile functionCall/functionResponse IDs before conversion.
  const reconciledHistory = reconcileFunctionCallIds(opts.history);

  // Convert history Content[] → LlmMessage[]
  const historyMessages = convertContentsToLlmMessages(reconciledHistory);
  // ...
}
```

---

## 4. TDD 과정

### 4.1 RED: 테스트 작성 (5개)

**파일**: `packages/core/src/providers/gemini/requestBuilder.test.ts`

```typescript
describe('functionCall/functionResponse ID reconciliation', () => {
  // 1. Primary scenario: functionCall.id=undefined, functionResponse.id=set
  it(
    'should reconcile when functionCall.id is undefined but functionResponse.id is set',
  );

  // 2. Both undefined — generate consistent ID
  it(
    'should reconcile when both functionCall.id and functionResponse.id are undefined',
  );

  // 3. Multiple parallel tool calls
  it('should reconcile multiple tool calls with missing IDs');

  // 4. Already consistent — no change
  it('should not modify history when functionCall.id is already set');

  // 5. Original history not mutated
  it('should not mutate the original history array');
});
```

**RED 결과**: 3 failed, 23 passed (26 total)

### 4.2 GREEN: 구현 (v1)

- `reconcileFunctionCallIds()` 함수 추가
- `buildLlmRequestFromGeminiState()`에서 호출

**GREEN 결과**: 26 passed (26 total)

### 4.3 회귀 테스트

```bash
npm test -w @didim365/agent-cli-core
# ✅ 288 files, 5765 tests passed

npm run typecheck -w @didim365/agent-cli-core
# ✅ 성공
```

---

## 5. 코드 리뷰 이슈 수정

### 5.1 리뷰 결과 요약

| #   | 심각도 | 이슈                                        | 상태      |
| --- | ------ | ------------------------------------------- | --------- |
| 1   | HIGH   | 혼합 케이스(일부 ID 있음)에서 인덱스 오매칭 | ✅ 수정됨 |
| 2   | MEDIUM | 이름 검증 누락 (문서와 코드 불일치)         | ✅ 수정됨 |
| 3   | MEDIUM | i+1 고정으로 비인접 응답 누락               | ✅ 수정됨 |
| 4   | LOW    | 불필요한 structuredClone 비용               | ✅ 수정됨 |

### 5.2 이슈별 수정 내역

#### 이슈 #1 [HIGH]: 혼합 케이스 인덱스 오매칭

**문제**: `functionCalls` 배열이 ID 없는 call만 필터링하므로, 필터된 배열의
인덱스와 `functionResponses` 전체 배열의 인덱스가 어긋남.

```
예시: model parts = [call(id='id-a', name='tool_a'), call(id=undefined, name='tool_b')]
      user parts  = [resp(id='id-a', name='tool_a'), resp(id='id-b', name='tool_b')]

v1 필터 후: functionCalls = [call(name='tool_b')]  (인덱스 0)
            functionResponses = [resp('id-a'), resp('id-b')]  (전체)

j=0: call(tool_b) ← resp[0] = resp(id='id-a') → tool_b.id = 'id-a' ← ❌ 오매칭!
```

**수정**: `allCalls` = 전체 functionCall 배열 → `fc.id`가 있으면 `continue`
(skip)

```typescript
// v1 (버그)
const functionCalls = content.parts.filter(
  (entry) => entry.part.functionCall && !entry.part.functionCall.id,
);
// → 필터된 인덱스 기준으로 매칭 → 오매칭

// v2 (수정)
const allCalls = content.parts.filter((p) => p.functionCall);
for (let j = 0; j < allCalls.length; j++) {
  const fc = allCalls[j].functionCall!;
  if (fc.id) continue; // 이미 ID 있으면 건너뜀
  // allResponses[j]로 매칭 → 전체 인덱스 기준 올바른 매칭
}
```

#### 이슈 #2 [MEDIUM]: 이름 검증 누락

**문제**: JSDoc은 "position + name 매칭"이라고 설명하지만 코드는 순수 위치
매칭만 수행. 응답 순서가 뒤바뀐 경우 잘못된 ID가 복사됨.

**수정**: positional match 후 name 검증, 불일치 시 name-based fallback

```typescript
// 1. Positional match first
let fr = allResponses[j]?.functionResponse;

// 2. Name validation: if positional match has wrong name, use name-based lookup
if (fr && fc.name && fr.name && fr.name !== fc.name) {
  fr =
    allResponses.find((p) => p.functionResponse?.name === fc.name)
      ?.functionResponse ?? undefined;
} else if (!fr && fc.name) {
  // Position out of range — try name-based lookup
  fr =
    allResponses.find((p) => p.functionResponse?.name === fc.name)
      ?.functionResponse ?? undefined;
}
```

#### 이슈 #3 [MEDIUM]: i+1 고정으로 비인접 응답 누락

**문제**: `cloned[i + 1]`만 검사하므로 중간에 다른 Content가 끼면 reconciliation
실패.

**수정**: `i+1`부터 forward scan, 다음 model Content까지 탐색 (turn boundary
보호)

```typescript
// v1 (고정)
const nextContent = cloned[i + 1];

// v2 (forward scan)
let responseContent: Content | undefined;
for (let k = i + 1; k < cloned.length; k++) {
  if (cloned[k].role === 'model') break; // Turn boundary — stop
  if (
    cloned[k].role === 'user' &&
    cloned[k].parts?.some((p) => p.functionResponse)
  ) {
    responseContent = cloned[k];
    break;
  }
}
```

#### 이슈 #4 [LOW]: 불필요한 structuredClone

**문제**: 모든 functionCall에 ID가 이미 있어도 매번 deep clone 수행.

**수정**: Quick check pass 추가. reconciliation 불필요 시 원본 참조 반환.

```typescript
// Quick check: skip clone if no reconciliation needed
let needsReconciliation = false;
for (const content of history) {
  if (content.role !== 'model' || !content.parts) continue;
  if (content.parts.some((p) => p.functionCall && !p.functionCall.id)) {
    needsReconciliation = true;
    break;
  }
}
if (!needsReconciliation) return history; // Same reference — no clone
```

### 5.3 추가된 테스트 (4개)

| 테스트                                                                       | 검증 대상                       |
| ---------------------------------------------------------------------------- | ------------------------------- |
| `should correctly match when first functionCall has ID and second does not`  | 이슈 #1 — 혼합 케이스 회귀 방지 |
| `should use name-based matching when response order differs from call order` | 이슈 #2 — name fallback 동작    |
| `should find functionResponse even when not immediately after functionCall`  | 이슈 #3 — forward scan 동작     |
| `should return same reference when no reconciliation is needed`              | 이슈 #4 — early return 최적화   |

### 5.4 테스트 결과

```bash
npm test -w @didim365/agent-cli-core -- src/providers/gemini/requestBuilder.test.ts
# ✅ 30 tests passed (기존 21 + 초기 5 + 리뷰 4)

npm test -w @didim365/agent-cli-core
# ✅ 288 files, 5771 tests passed

npm run typecheck -w @didim365/agent-cli-core
# ✅ 성공
```

---

## 6. 2차 코드 리뷰 이슈 수정

### 6.1 리뷰 결과 요약

| #   | 심각도 | 이슈                                      | 상태      |
| --- | ------ | ----------------------------------------- | --------- |
| 1   | HIGH   | 동일 이름 혼합 케이스에서 중복 ID 배정    | ✅ 수정됨 |
| 2   | LOW    | name fallback에서 response 소모 추적 없음 | ✅ 수정됨 |

### 6.2 이슈 #1 [HIGH]: 동일 tool 이름 혼합 케이스 중복 ID

**문제**: call 2개가 동일 이름(`tool_x`)이고, call[0]은 `id-a` 보유, call[1]은
ID 없음. response 순서가 `[id-b, id-a]`일 때:

```
allCalls     = [call(id='id-a', name='tool_x'), call(id=undefined, name='tool_x')]
allResponses = [resp(id='id-b', name='tool_x'), resp(id='id-a', name='tool_x')]

v2 코드:
  j=0: fc.id='id-a' → skip
  j=1: fc.id=undefined → positional: allResponses[1] = resp(id='id-a')
       name 일치('tool_x') → fc.id = 'id-a'  ← ❌ call[0]과 중복!

결과: tool_call IDs = ['id-a', 'id-a']
      tool_call_ids = ['id-b', 'id-a']
      → 'id-b' 매칭 불가 → OpenAI 400
```

**근본 원인**: 기존 ID가 있는 call이 이미 "점유"한 response를 다른 call이
재사용. response 소모(used) 추적이 없었음.

**수정**: 2-pass 알고리즘으로 전면 교체

```typescript
// Pass 1: claim responses for calls that already have IDs
const usedResponseIndices = new Set<number>();
for (let j = 0; j < allCalls.length; j++) {
  const fc = allCalls[j].functionCall!;
  if (!fc.id) continue;
  const idx = allResponses.findIndex(
    (p) => p.functionResponse?.id === fc.id,
  );
  if (idx >= 0) usedResponseIndices.add(idx);
}

// Pass 2: reconcile calls without IDs (only unused responses)
for (let j = 0; j < allCalls.length; j++) {
  const fc = allCalls[j].functionCall!;
  if (fc.id) continue;

  // 1. Positional match (if not used)
  if (!usedResponseIndices.has(j) && /* name validation */) { ... }

  // 2. Name fallback: first UNUSED response with matching name
  for (let r = 0; r < allResponses.length; r++) {
    if (usedResponseIndices.has(r)) continue;
    // ...
  }

  usedResponseIndices.add(frIdx);  // Mark as consumed
}
```

**검증**: 위 시나리오에서 Pass 1이 `resp(id='id-a')` (index 1)을 claim → Pass
2에서 call[1]은 unused인 `resp(id='id-b')` (index 0)만 매칭 가능 →
`fc.id = 'id-b'` ✅

### 6.3 이슈 #2 [LOW]: response 소모 추적

**문제**: `find()`가 매번 첫 매칭만 반환하여, 동일 이름 call 다수가 같은
response로 매핑될 가능성.

**수정**: `usedResponseIndices` Set으로 소모된 response를 추적. name
fallback에서도 used 체크 후 탐색.

```typescript
// Name-based fallback: find first UNUSED response
for (let r = 0; r < allResponses.length; r++) {
  if (usedResponseIndices.has(r)) continue;  // ← skip consumed
  if (candidate?.name === fc.name) { ... break; }
}
```

### 6.4 추가된 테스트 (2개)

| 테스트                                                                           | 검증 대상                                        |
| -------------------------------------------------------------------------------- | ------------------------------------------------ |
| `should not produce duplicate tool_call IDs when same-name calls have mixed IDs` | 이슈 #1 — 동일 이름·혼합 ID·response 순서 뒤바뀜 |
| `should not map multiple calls to the same response when names are identical`    | 이슈 #2 — used 추적으로 1:1 매핑 보장            |

### 6.5 테스트 결과

```bash
npm test -w @didim365/agent-cli-core -- src/providers/gemini/requestBuilder.test.ts
# ✅ 32 tests passed (기존 21 + 초기 5 + 1차 리뷰 4 + 2차 리뷰 2)

npm run typecheck -w @didim365/agent-cli-core
# ✅ 성공
```

---

## 7. 변경 파일 목록

| 파일                                                        | 변경 내용                                                        | 규모   |
| ----------------------------------------------------------- | ---------------------------------------------------------------- | ------ |
| `packages/core/src/providers/gemini/requestBuilder.ts`      | `reconcileFunctionCallIds()` v3: 2-pass used 추적 알고리즘       | +80줄  |
| `packages/core/src/providers/gemini/requestBuilder.test.ts` | ID reconciliation 테스트 11개 (초기 5 + 1차 리뷰 4 + 2차 리뷰 2) | +270줄 |

---

## 8. 테스트 결과

| 테스트                   | 결과                                   |
| ------------------------ | -------------------------------------- |
| `requestBuilder.test.ts` | ✅ 32 tests passed (기존 21 + 신규 11) |
| Core 전체                | ✅ 288 files passed                    |
| TypeScript 타입체크      | ✅ 성공                                |

---

## 9. 조사 과정에서 배제된 가설

| 가설                                                 | 결론    | 근거                                                       |
| ---------------------------------------------------- | ------- | ---------------------------------------------------------- |
| hooks (beforeAgent/afterAgent)가 tool_call 중복 발생 | ❌ 아님 | `hasFiredBeforeAgent` 가드, `pendingToolCalls` 가드로 보호 |
| extractCuratedHistory가 ID를 누락                    | ❌ 아님 | functionCall-only Content도 `isValidContent` 통과          |
| chatCompressionService가 ID 손실                     | ❌ 아님 | 필드 보존 확인                                             |
| manual iteration vs yield\* 차이                     | ❌ 아님 | 의미적으로 동일                                            |
| promptId enrichment가 callId 덮어쓰기                | ❌ 아님 | spread 연산자로 보존                                       |
| merge conflict가 코드 파손                           | ❌ 아님 | diff 확인, 기능 코드 무변경                                |

---

## 10. 핵심 교훈 (Lessons Learned)

1. **Gemini SDK functionCall.id는 undefined일 수 있다**: Gemini API가 `id`를
   설정하지 않으면 SDK history에 `undefined`로 남음. Turn handler가 생성한
   UUID는 `functionResponse.id`에만 저장됨.

2. **Provider switching은 별도 테스트 시나리오**: 단일 프로바이더 테스트로는
   발견 불가. Gemini history를 비-Gemini 프로바이더로 변환하는 경로를 독립적으로
   검증해야 함.

3. **ID 조정은 변환 전 전처리로**: `typeConversion.ts`의
   `convertPartToLlmContent()`를 수정하면 Gemini-only 경로에도 영향. 변환 전에
   history를 정규화하는 전처리 방식이 안전함.

4. **structuredClone으로 비변이 보장**: Gemini SDK가 내부적으로 history를
   참조하므로 원본 변경은 위험. `structuredClone`으로 복사본에서만 조정.

5. **필터된 배열 인덱스 ≠ 원본 배열 인덱스**: 부분 필터 후 인덱스 기반 매칭 시
   혼합 케이스(일부만 ID 누락)에서 오매칭 발생. 전체 배열 순회 + skip 패턴이
   안전.

6. **1:1 매핑에는 "소모(used)" 추적이 필수**: 동일 이름의 call/response가 있을
   때 `find()` 첫 매칭만으로는 중복 배정 발생. 기존 ID가 있는 call이 점유한
   response를 먼저 제외하는 2-pass 알고리즘이 필요.
