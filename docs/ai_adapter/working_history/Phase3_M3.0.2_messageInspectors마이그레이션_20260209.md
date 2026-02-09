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
| pre-commit hooks | ⏳ 커밋 시 검증 예정                                        |

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

| 순서 | 커밋 ID | 타입       | 설명                                                           | 테스트         |
| ---- | ------- | ---------- | -------------------------------------------------------------- | -------------- |
| 1    | 미정    | STRUCTURAL | messageInspectors → llmUtils/geminiTypeConversion 전환 (4파일) | ✅ 4838 passed |

**총 커밋 수**: 1개 (예정)

---

## ✅ 완료 기준 체크

- [x] 모든 Core 테스트 통과 (4838/4838)
- [x] TypeCheck 통과 (전체 프로젝트)
- [x] Lint 경고 0개
- [x] 4개 소비자 파일 전환 완료
- [x] messageInspectors.ts 의존성 완전 제거 (소비자 0개)
- [x] Tidy First 원칙 준수 (동작 변경 없는 리팩토링)
- [ ] pre-commit hooks 통과 (커밋 시 검증)

---

## 📋 핸드오프 추적 업데이트

| #   | 핸드오프 항목                            | 상태      | 해소 위치 |
| --- | ---------------------------------------- | --------- | --------- |
| 5   | `messageInspectors` 마이그레이션 (4파일) | ✅ 해소됨 | M3.0.2    |

---

**최종 상태**: ⏳ 커밋 대기
