# M3.0.4 작업 결과서 — 변환 브릿지 정리

- **작업일**: 2026-02-09
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료

## 작업 목표

`geminiTypeConversion.ts` 브릿지를 `providers/gemini/` 정식 위치로 이동하고,
dead code (`messageInspectors.ts`)를 제거하여 Gemini 전용 변환 유틸의 소유권을
명확화한다.

## 작업 순서 및 결과

| 순서 | Sub-task | 작업 내용                                                         | 테스트 결과 |
| ---- | -------- | ----------------------------------------------------------------- | ----------- |
| 1    | 3.0.4.1  | 브릿지 사용처 분석 (6개 사이트, 5개 exported 함수)                | N/A (분석)  |
| 2    | 3.0.4.2  | `providers/gemini/typeConversion.ts` 생성 + 6개 import 경로 전환  | 29/29 PASS  |
| 3    | 3.0.4.3  | `utils/geminiTypeConversion.ts` → @deprecated re-export shim 전환 | 29/29 PASS  |
| 4    | 3.0.4.3  | `messageInspectors.ts` dead code 삭제                             | 4854 PASS   |

## 변경 파일 상세

### 3.0.4.1: 사용처 분석

6개 사용처 확인, 2가지 패턴으로 분류:

**변환 함수** (2곳 — 모델 라우팅):

| 파일                       | 함수                                                                | 입력 소스                         |
| -------------------------- | ------------------------------------------------------------------- | --------------------------------- |
| `core/client.ts`           | `convertContentsToLlmMessages`, `convertPartListUnionToLlmContents` | `chat.getHistory(true)` Content[] |
| `agents/local-executor.ts` | `convertContentsToLlmMessages`, `convertPartListUnionToLlmContents` | `chat.getHistory(true)` Content[] |

**검사 함수** (4곳 — Content 타입 가드):

| 파일                               | 함수                                                     | 용도                     |
| ---------------------------------- | -------------------------------------------------------- | ------------------------ |
| `providers/gemini/chat.ts`         | `isContentToolResultMessage`                             | 녹음 시 tool result 스킵 |
| `services/loopDetectionService.ts` | `isContentToolCallMessage`, `isContentToolResultMessage` | 히스토리 정리/루프 감지  |
| `utils/nextSpeakerChecker.ts`      | `isContentToolResultMessage`                             | 다음 발화자 결정         |
| `utils/editCorrector.ts`           | `isContentToolCallMessage`, `isContentToolResultMessage` | 편집 타임스탬프 추출     |

모든 함수가 Gemini SDK 타입(`Content`, `Part`, `PartListUnion`)을 입력으로
받으므로 `providers/gemini/`가 정식 소속 위치.

### 3.0.4.2: 파일 이동 + Import 전환

**신규 파일**: `providers/gemini/typeConversion.ts`

- `utils/geminiTypeConversion.ts` 전체 내용을 이동
- import 경로 조정: `../providers/types.js` → `../types.js`, `./llmUtils.js` →
  `../../utils/llmUtils.js`

**Import 전환** (6개 사용처):

| 파일                               | Before                                | After                                   |
| ---------------------------------- | ------------------------------------- | --------------------------------------- |
| `agents/local-executor.ts`         | `../utils/geminiTypeConversion.js`    | `../providers/gemini/typeConversion.js` |
| `providers/gemini/chat.ts`         | `../../utils/geminiTypeConversion.js` | `./typeConversion.js`                   |
| `core/client.ts`                   | `../utils/geminiTypeConversion.js`    | `../providers/gemini/typeConversion.js` |
| `services/loopDetectionService.ts` | `../utils/geminiTypeConversion.js`    | `../providers/gemini/typeConversion.js` |
| `utils/nextSpeakerChecker.ts`      | `./geminiTypeConversion.js`           | `../providers/gemini/typeConversion.js` |
| `utils/editCorrector.ts`           | `../utils/geminiTypeConversion.js`    | `../providers/gemini/typeConversion.js` |

**테스트 파일**: `utils/geminiTypeConversion.test.ts` import도
`../providers/gemini/typeConversion.js`로 전환

**providers/gemini/index.ts**: 5개 함수 re-export 추가

### 3.0.4.3: @deprecated re-export + dead code 삭제

**`utils/geminiTypeConversion.ts`** → @deprecated re-export shim:

```typescript
/**
 * @deprecated Import from '../providers/gemini/typeConversion.js' instead.
 * This re-export shim exists for backward compatibility and will be removed
 * after all internal consumers migrate to the canonical path.
 */
export {
  convertContentToLlmMessage,
  convertContentsToLlmMessages,
  convertPartListUnionToLlmContents,
  isContentToolCallMessage,
  isContentToolResultMessage,
} from '../providers/gemini/typeConversion.js';
```

**`utils/messageInspectors.ts`** — 삭제:

- 0개 import 확인 (grep으로 전수 검색)
- 2개 deprecated 함수(`isFunctionCall`, `isFunctionResponse`)
- M3.0.2에서 모든 사용처가 `geminiTypeConversion.ts`로 이미 마이그레이션 완료
- 테스트 파일 미존재

## Quality Gate

| 항목       | 결과                       |
| ---------- | -------------------------- |
| TypeCheck  | ✅ PASS                    |
| ESLint     | ✅ PASS                    |
| Core Tests | ✅ 260 files / 4854 passed |

## 설계 결정

### 이동 vs 인라인 vs 제거

- **결정**: `utils/` → `providers/gemini/` 이동 + @deprecated re-export
- **근거**:
  - 모든 함수가 Gemini SDK 타입을 입력으로 받으므로 providers/gemini/가 정식
    소속
  - chat history가 `Content[]`인 동안은 변환 함수가 필수 — 제거 불가
  - 인라인은 코드 중복 증가 — 단일 소스 유지가 바람직
  - @deprecated re-export로 점진적 마이그레이션 경로 확보

### messageInspectors.ts 삭제 근거

- M3.0.2에서 4개 사용처 모두 `geminiTypeConversion.ts`의 안전한 대체 함수로 전환
  완료
- grep 전수 검색: `from.*messageInspectors` → 0 matches
- core/index.ts에서 export하지 않음 → 외부 소비자 없음

## 향후 작업

- `utils/geminiTypeConversion.ts` re-export shim 제거: 모든 소비자가 정식 경로로
  이동 완료 시 (현재는 테스트 파일만 re-export 경유)
- chat history `Content[]` → `LlmMessage[]` 전환 시 변환 함수 자체 불필요화
  (Phase 3 후반부)
- 검사 함수(`isContentToolCallMessage` 등)는 Gemini 프로바이더 내부 유틸로 유지

## 커밋

- (커밋 예정)
