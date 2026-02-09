# M3.0.2: messageInspectors 마이그레이션 작업 기록

**작업일**: 2026-02-09 **작업자**: AI Assistant **브랜치**: DID/v0.1 **이전
작업**:
[Phase3_M3.0.1_Gemini전용파일물리적이동\_20260209.md](./Phase3_M3.0.1_Gemini전용파일물리적이동_20260209.md)
**관련 문서**:
[phase3_provider_extension_todolist.md](../todolist/phase3_provider_extension_todolist.md) -
M3.0.2

---

## 📋 작업 개요

### 목표

- Phase 3 핸드오프 High #5: `messageInspectors` 4파일 마이그레이션
- `isFunctionCall`/`isFunctionResponse` (Content 기반) →
  `isToolCallMessage`/`isToolResultMessage` (LlmMessage 기반) 전환
- `convertContentToLlmMessage` 브릿지를 통한 타입 변환
- `messageInspectors.ts` 의존성 완전 제거 (소비자 0개 달성)

### 작업 범위

- **파일 수정**:
  - `utils/editCorrector.ts`: import 교체 + L116,125 함수 전환
  - `utils/nextSpeakerChecker.ts`: import 교체 + L74 함수 전환
  - `providers/gemini/chat.ts`: import 교체 + L314 함수 전환
  - `services/loopDetectionService.ts`: import 교체 + L408,416,437 함수 전환

### 전환 전략

기존 함수(`isFunctionCall`/`isFunctionResponse`)는 Gemini SDK `Content` 타입을
입력으로 받지만, 대체 함수(`isToolCallMessage`/`isToolResultMessage`)는
provider-independent `LlmMessage` 타입을 입력으로 받음.

**브릿지 패턴**: 각 호출 지점에서 `convertContentToLlmMessage()`
(geminiTypeConversion.ts:99)를 사용하여 Content → LlmMessage 변환 후 신규 함수
호출.

```typescript
// Before:
isFunctionCall(entry); // Content → boolean
isFunctionResponse(entry); // Content → boolean

// After:
isToolCallMessage(convertContentToLlmMessage(entry)); // Content → LlmMessage → boolean
isToolResultMessage(convertContentToLlmMessage(entry)); // Content → LlmMessage → boolean
```

### Tidy First 원칙

- ✅ 동작 변경 없음 (동일 의미론적 검사, 타입 변환 계층 추가)
- ✅ 각 파일마다 테스트 실행하여 회귀 확인
- ✅ 구조적 변경만 포함 (import 교체 + 함수 호출 교체)

---

## 🟢 구현 (Refactoring — 기존 테스트 보호 하에 리팩토링)

### 3.0.2.3: editCorrector.ts (독립적, 난이도 소)

1. Baseline: 40/40 PASS
2. import 교체:
   ```diff
   -import { isFunctionResponse, isFunctionCall } from '../utils/messageInspectors.js';
   +import { isToolCallMessage, isToolResultMessage } from '../utils/llmUtils.js';
   +import { convertContentToLlmMessage } from '../utils/geminiTypeConversion.js';
   ```
3. L116: `isFunctionCall(entry)` →
   `isToolCallMessage(convertContentToLlmMessage(entry))`
4. L125: `isFunctionResponse(entry)` →
   `isToolResultMessage(convertContentToLlmMessage(entry))`
5. 결과: 40/40 PASS

### 3.0.2.4: nextSpeakerChecker.ts (독립적, 난이도 소)

1. Baseline: 10/10 PASS
2. import 교체:
   ```diff
   -import { isFunctionResponse } from './messageInspectors.js';
   +import { isToolResultMessage } from './llmUtils.js';
   +import { convertContentToLlmMessage } from './geminiTypeConversion.js';
   ```
3. L74: `isFunctionResponse(lastComprehensiveMessage)` →
   `isToolResultMessage(convertContentToLlmMessage(lastComprehensiveMessage))`
4. 결과: 10/10 PASS

### 3.0.2.2: chat.ts (providers/gemini/chat.ts)

1. Baseline: 48/48 PASS
2. import 교체:
   ```diff
   -import { isFunctionResponse } from '../../utils/messageInspectors.js';
   +import { isToolResultMessage } from '../../utils/llmUtils.js';
   +import { convertContentToLlmMessage } from '../../utils/geminiTypeConversion.js';
   ```
3. L314: `!isFunctionResponse(userContent)` →
   `!isToolResultMessage(convertContentToLlmMessage(userContent))`
4. 결과: 48/48 PASS

### 3.0.2.1: loopDetectionService.ts (난이도 중)

1. Baseline: 52/52 PASS
2. import 교체:
   ```diff
   -import { isFunctionCall, isFunctionResponse } from '../utils/messageInspectors.js';
   +import { isToolCallMessage, isToolResultMessage } from '../utils/llmUtils.js';
   +import { convertContentToLlmMessage } from '../utils/geminiTypeConversion.js';
   ```
3. 3곳 전환:
   - L408 `trimRecentHistory`: `isFunctionCall(recentHistory[...])` →
     `isToolCallMessage(convertContentToLlmMessage(...))`
   - L416 `trimRecentHistory`: `isFunctionResponse(recentHistory[0])` →
     `isToolResultMessage(convertContentToLlmMessage(...))`
   - L437 `checkForLoopWithLLM`: `isFunctionCall(contents[0])` →
     `isToolCallMessage(convertContentToLlmMessage(...))`
4. 결과: 52/52 PASS

---

## ✅ 검증 결과

### Quality Gate

| 항목             | 결과                                                        |
| ---------------- | ----------------------------------------------------------- |
| TypeCheck        | ✅ PASS (전체 프로젝트 — core, cli, a2a-server, test-utils) |
| Lint             | ✅ PASS (0 errors)                                          |
| Core Tests       | ✅ 260 files / 4838 passed / 24 skipped / 0 failed          |
| pre-commit hooks | ✅ PASS (prettier, eslint)                                  |

### 개별 테스트 결과

| 테스트 파일                  | 결과     |
| ---------------------------- | -------- |
| editCorrector.test.ts        | ✅ 40/40 |
| nextSpeakerChecker.test.ts   | ✅ 10/10 |
| geminiChat.test.ts           | ✅ 48/48 |
| loopDetectionService.test.ts | ✅ 52/52 |

### messageInspectors.ts 의존성 현황

| 확인 항목                                   | 결과                                   |
| ------------------------------------------- | -------------------------------------- |
| `import.*messageInspectors` (프로덕션 코드) | ✅ 0건 (완전 제거)                     |
| `import.*messageInspectors` (테스트 코드)   | ✅ 0건                                 |
| `messageInspectors` 문자열 (전체 프로젝트)  | ✅ 0건                                 |
| `messageInspectors.ts` 파일                 | 존재 (dead code, M3.0.4에서 제거 예정) |

---

## 🐛 이슈 및 해결

이번 작업에서 발생한 이슈 없음. `convertContentToLlmMessage` 브릿지가 Content →
LlmMessage 변환을 정확히 수행하여 모든 테스트가 한 번에 통과.

### 설계 결정: 브릿지 vs 인라인 vs 파일 이동

| 방안                         | 장점                       | 단점                       | 채택 |
| ---------------------------- | -------------------------- | -------------------------- | ---- |
| convertContentToLlmMessage   | 기존 변환기 재활용, 일관성 | 변환 오버헤드 (미미)       | ✅   |
| 인라인 Content 검사          | 변환 불필요, 직관적        | messageInspectors 중복     | ❌   |
| messageInspectors→providers/ | 파일 이동으로 구조 개선    | 마이그레이션 목표와 불일치 | ❌   |

---

## 📝 다음 단계

- [ ] **M3.0.3**: 텔레메트리/Agent 레이어 독립화
  - loggingContentGenerator.ts @google/genai import 제거
  - telemetry/semantic.ts Part/Content/Candidate 타입 독립화
  - LocalAgentExecutor GeminiChat 직접 결합 해소
  - telemetry/types.ts GenerateContentResponseUsageMetadata 독립화
  - telemetry/sdk.ts 시그널 핸들러 누수 수정
- [ ] **M3.0.4**: geminiTypeConversion.ts 브릿지 정리 + messageInspectors.ts
      제거

---

## 📊 커밋 요약

| 순서 | 커밋 ID     | 타입       | 설명                                                           | 테스트         |
| ---- | ----------- | ---------- | -------------------------------------------------------------- | -------------- |
| 1    | `eabc8ec1c` | STRUCTURAL | messageInspectors → llmUtils/geminiTypeConversion 전환 (4파일) | ✅ 4838 passed |
| 2    | (리뷰반영)  | FIX        | Content-safe 래퍼 도입 — 의미론적 동치 보장 + 오버헤드 해소    | ✅ 4849 passed |

**총 커밋 수**: 2개

---

## ✅ 완료 기준 체크

- [x] 모든 Core 테스트 통과 (4838/4838)
- [x] TypeCheck 통과 (전체 프로젝트)
- [x] Lint 경고 0개
- [x] 4개 소비자 파일 전환 완료
- [x] messageInspectors.ts 의존성 완전 제거 (소비자 0개)
- [x] Tidy First 원칙 준수 (동작 변경 없는 리팩토링)
- [x] pre-commit hooks 통과

---

## 📋 핸드오프 추적 업데이트

| #   | 핸드오프 항목                            | 상태      | 해소 위치 |
| --- | ---------------------------------------- | --------- | --------- |
| 5   | `messageInspectors` 마이그레이션 (4파일) | ✅ 해소됨 | M3.0.2    |

---

## 🔄 리뷰 반영 (2차)

### 리뷰 지적 사항 (3건)

| #   | 심각도 | 이슈                                                                                          | 검증    | 조치    |
| --- | ------ | --------------------------------------------------------------------------------------------- | ------- | ------- |
| R-1 | 중간   | `convertContentToLlmMessage`이 변환 불가 파트(null) 누락 → 혼합 파트 메시지에서 의미론적 차이 | ✅ 확인 | ✅ 수정 |
| R-2 | 낮음   | `mapRole(undefined)` → `'user'` 기본값 → `isFunctionResponse` 경로 오탐                       | ✅ 확인 | ✅ 수정 |
| R-3 | 낮음   | 루프 내 동일 entry 반복 변환 + `crypto.randomUUID()` 오버헤드                                 | ✅ 확인 | ✅ 수정 |

### R-1: 파트 누락으로 인한 의미론적 차이 (중간)

**문제**: `convertPartToLlmContent()`이 `executableCode` 등 비인식 파트를 `null`
반환 → `convertContentToLlmMessage()`에서 필터링 →
`llmMessage.content.length < parts.length`. 혼합 메시지
`{role:'model', parts:[{functionCall:...}, {executableCode:...}]}` 에서:

- 기존(`isFunctionCall`): `parts.every(p => !!p.functionCall)` → `false`
  (executableCode에 functionCall 없음)
- 변경 후: executableCode 누락 → functionCall만 남아 `.every(isToolCallContent)`
  → `true` (오탐)

**수정**: `geminiTypeConversion.ts`에 Content-safe 래퍼 함수 추가. 파트 수
가드(`llmMessage.content.length !== parts.length → return false`)로 누락 감지.

### R-2: mapRole 기본값으로 인한 오탐 (낮음)

**문제**: `mapRole(undefined)` → `'user'` (기본 케이스).
`{role: undefined, parts:[{functionResponse:...}]}` 에서:

- 기존(`isFunctionResponse`): `content.role === 'user'` → `false` (undefined !==
  'user')
- 변경 후: `mapRole(undefined)` → 'user' → `isToolResultMessage` role 검사 통과
  → `true` (오탐)

**수정**: Content-safe 래퍼에서 직접 role 검사(`content.role !== 'user'` /
`content.role !== 'model'`). `mapRole` 우회.

### R-3: 반복 변환 오버헤드 (낮음)

**문제**: `editCorrector.ts`에서 per-part 루프 내부에서 매번
`convertContentToLlmMessage(entry)` 호출 → 파트당 2회, 각 호출마다
`crypto.randomUUID()` 실행.

**수정 (2단계)**:

1. Content-safe 래퍼 도입으로 각 소비자 코드가 단일 함수 호출
2. `editCorrector.ts`에서 entry-level 검사를 per-part 루프 밖으로 호이스팅:
   ```typescript
   const entryIsToolCall = isContentToolCallMessage(entry);
   const entryIsToolResult = isContentToolResultMessage(entry);
   ```
   변환 횟수: `2 × parts.length` → 최대 2회/entry

### 수정 구현: Content-safe 래퍼 함수

`geminiTypeConversion.ts` 끝에 2개 함수 추가:

```typescript
export function isContentToolCallMessage(content: Content): boolean {
  if (content.role !== 'model') return false; // R-2: 직접 role 검사
  const parts = content.parts;
  if (!parts || parts.length === 0) return false; // vacuous truth 방지
  const llmMessage = convertContentToLlmMessage(content);
  if (llmMessage.content.length !== parts.length) return false; // R-1: 파트 수 가드
  return llmMessage.content.every((c) => isToolCallContent(c));
}

export function isContentToolResultMessage(content: Content): boolean {
  if (content.role !== 'user') return false; // R-2: 직접 role 검사
  const parts = content.parts;
  if (!parts || parts.length === 0) return false;
  const llmMessage = convertContentToLlmMessage(content);
  if (llmMessage.content.length !== parts.length) return false; // R-1: 파트 수 가드
  return llmMessage.content.every((c) => isToolResultContent(c));
}
```

### 소비자 파일 업데이트 (4파일)

| 파일                      | 변경 사항                                                                                               | 테스트   |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | -------- |
| `editCorrector.ts`        | import → `isContentToolCallMessage`/`isContentToolResultMessage` (geminiTypeConversion) + 루프 호이스팅 | ✅ 40/40 |
| `nextSpeakerChecker.ts`   | import → `isContentToolResultMessage` (geminiTypeConversion)                                            | ✅ 10/10 |
| `chat.ts`                 | import → `isContentToolResultMessage` (geminiTypeConversion)                                            | ✅ 48/48 |
| `loopDetectionService.ts` | import → `isContentToolCallMessage`/`isContentToolResultMessage` (geminiTypeConversion)                 | ✅ 52/52 |

### 추가 테스트 (11건)

`geminiTypeConversion.test.ts`에 엣지 케이스 11건 추가:

**isContentToolCallMessage (6건)**:

- ✅ 순수 functionCall Content → `true`
- ✅ user role → `false`
- ✅ undefined role → `false`
- ✅ 빈 parts → `false`
- ✅ functionCall + 비변환 파트 혼합 → `false` (R-1 검증)
- ✅ functionCall + text 혼합 → `false`

**isContentToolResultMessage (5건)**:

- ✅ 순수 functionResponse Content → `true`
- ✅ model role → `false`
- ✅ undefined role → `false` (R-2 검증)
- ✅ 빈 parts → `false`
- ✅ functionResponse + 비변환 파트 혼합 → `false` (R-1 검증)

### 리뷰 반영 Quality Gate

| 항목                         | 결과                                               |
| ---------------------------- | -------------------------------------------------- |
| TypeCheck                    | ✅ PASS (전체 프로젝트)                            |
| Lint                         | ✅ PASS (0 errors)                                 |
| Core Tests                   | ✅ 260 files / 4849 passed / 24 skipped / 0 failed |
| geminiTypeConversion.test.ts | ✅ 29/29 (기존 18 + 신규 11)                       |

---

**작업 완료 시간**: 2026-02-09 14:15 **최종 상태**: ✅ 완료 (리뷰 반영 포함)
