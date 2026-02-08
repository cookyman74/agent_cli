# Phase 2: M2.5 유틸리티 레이어 리팩토링 작업 결과서

> 📅 **작업일**: 2026-02-08 📚 **Phase**: Phase 2 - M2.5 🎯 **목표**: 유틸리티
> 함수들의 프로바이더 독립화 — LlmContent 기반 provider-independent 함수 추가 🔗
> **이전 작업**:
> [Phase2_M2.4_ModelConfigService호환레이어\_20260208.md](./Phase2_M2.4_ModelConfigService호환레이어_20260208.md)
> 🔗 **관련 문서**:
> [phase2_core_refactoring_todolist.md](../todolist/phase2_core_refactoring_todolist.md) -
> M2.5

---

## 📋 작업 요약

### 접근 전략

**점진적 마이그레이션**: 기존 Gemini SDK 의존 함수를 수정하지 않고, 새로운
provider-independent 함수를 병행 추가. 기존 함수에는 `@deprecated` 주석을
추가하여 향후 마이그레이션을 유도.

**작업 순서**: 2.5.3 (llmUtils — 의존 없음) → 2.5.1 (tokenCalculation) → 2.5.2
(partUtils). 공통 type guard를 먼저 만들어 후속 파일에서 재사용.

**타입 매핑**: 설계서의 "LlmPart"는 실제 코드베이스에서 `LlmContent` 유니온 타입
(5개 variant)으로 구현되어 있으므로, 이를 기준으로 작업.

### 2.5.3 llmUtils.ts 생성 ✅

| 항목                               | 상태 | 비고                          |
| ---------------------------------- | :--: | ----------------------------- |
| `isTextContent()` type guard       |  ✅  | `c.type === 'text'`           |
| `isImageContent()` type guard      |  ✅  | `c.type === 'image'`          |
| `isToolCallContent()` type guard   |  ✅  | `c.type === 'tool_call'`      |
| `isToolResultContent()` type guard |  ✅  | `c.type === 'tool_result'`    |
| `isThoughtContent()` type guard    |  ✅  | `c.type === 'thought'`        |
| `extractText(contents)` 헬퍼       |  ✅  | text content만 필터링 후 join |
| `createTextContent(text)` 팩토리   |  ✅  | `{ type: 'text', text }` 생성 |

**테스트**: 12개 (llmUtils.test.ts)

### 2.5.1 tokenCalculation.ts 리팩토링 ✅

| 항목                                                 | 상태 | 비고                                              |
| ---------------------------------------------------- | :--: | ------------------------------------------------- |
| `estimateLlmTokenCount(contents)` 추가               |  ✅  | LlmContent[] 기반 provider-independent 토큰 추정  |
| `estimateTextTokens(text)` 내부 헬퍼 추출            |  ✅  | ASCII/CJK 문자별 가중치 + 대용량 텍스트 근사      |
| `estimateTokenCountSync` → `estimateTextTokens` 위임 |  ✅  | 기존 함수의 텍스트 추정 로직 중복 제거 (Refactor) |
| `estimateTokenCountSync` `@deprecated` 추가          |  ✅  | → `estimateLlmTokenCount` 사용 안내               |
| `calculateRequestTokenCount` `@deprecated` 추가      |  ✅  | Gemini SDK-specific 명시                          |

**테스트**: 19개 (tokenCalculation.test.ts — 기존 10 + 신규 9)

### 2.5.2 partUtils.ts 리팩토링 ✅

| 항목                                               | 상태 | 비고                                        |
| -------------------------------------------------- | :--: | ------------------------------------------- |
| `contentToString(content, options?)` 추가          |  ✅  | LlmContent/LlmContent[] → string 변환       |
| `getMessageText(message)` 추가                     |  ✅  | LlmMessage에서 텍스트 추출 (thought 제외)   |
| `flatMapLlmTextContents(contents, transform)` 추가 |  ✅  | LlmContent[] async flat-map (텍스트만 변환) |
| `appendToLastLlmTextContent(contents, text)` 추가  |  ✅  | LlmContent[] 마지막 텍스트에 append         |
| `partToString` `@deprecated` 추가                  |  ✅  | → `contentToString` 사용 안내               |
| `getResponseText` `@deprecated` 추가               |  ✅  | → `getMessageText` 사용 안내                |
| `flatMapTextParts` `@deprecated` 추가              |  ✅  | → `flatMapLlmTextContents` 사용 안내        |
| `appendToLastTextPart` `@deprecated` 추가          |  ✅  | → `appendToLastLlmTextContent` 사용 안내    |

**테스트**: 55개 (partUtils.test.ts — 기존 27 + 신규 28)

---

## 📊 검증 결과

| 검증 항목           |       결과        | 비고                                          |
| ------------------- | :---------------: | --------------------------------------------- |
| 전체 테스트         | ✅ 4803/4803 pass | 기존 4717 + 신규 86 (M2.5: 49, 이전 누적: 37) |
| TypeScript 컴파일   |      ✅ 클린      | tsc --noEmit 0 errors                         |
| ESLint              |      ✅ 통과      | pre-commit hook 통과                          |
| 기존 기능 100% 동작 |        ✅         | 기존 테스트 전체 통과                         |
| M2.5 대상 테스트    |   ✅ 86/86 pass   | llmUtils 12 + tokenCalc 19 + partUtils 55     |

---

## 📁 파일 목록

### 신규 생성

| 파일                     | 용도                                    | LOC |
| ------------------------ | --------------------------------------- | --- |
| `utils/llmUtils.ts`      | Provider-independent type guards + 헬퍼 | ~72 |
| `utils/llmUtils.test.ts` | llmUtils TDD 테스트 (12개)              | ~88 |

### 수정

| 파일                             | 변경 내용                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `utils/tokenCalculation.ts`      | +estimateLlmTokenCount, +estimateTextTokens, 기존 함수 @deprecated                                              |
| `utils/tokenCalculation.test.ts` | +estimateLlmTokenCount 테스트 9개 추가                                                                          |
| `utils/partUtils.ts`             | +contentToString, +getMessageText, +flatMapLlmTextContents, +appendToLastLlmTextContent, 기존 4함수 @deprecated |
| `utils/partUtils.test.ts`        | +provider-independent 함수 테스트 28개 추가                                                                     |

---

## 🔑 핵심 설계 결정

### 1. 점진적 마이그레이션 (병행 추가 + @deprecated)

**문제**: partUtils.ts는 12+ 파일에서 사용 중. 시그니처 변경 시 대규모 연쇄 수정
필요.

**결정**: 기존 함수를 수정하지 않고, 새 provider-independent 함수를 병행 추가.
기존 함수에 `@deprecated` JSDoc을 추가하여 IDE에서 경고 표시.

**장점**:

- 기존 코드 무변경 → 회귀 위험 0
- 호출자가 자연스럽게 마이그레이션 가능
- 양쪽 함수 모두 동일 파일에 있어 참조 용이

### 2. type discriminator 기반 type guard

**문제**: Gemini SDK의 `Part` 타입은 property-existence 체크(`'text' in part`),
LlmContent는 discriminated union(`content.type === 'text'`).

**결정**: LlmContent의 `type` 필드를 사용하는 type guard 5개를 llmUtils.ts에
정의. 이를 tokenCalculation.ts와 partUtils.ts에서 import하여 사용.

### 3. estimateTextTokens 헬퍼 추출 (Refactor)

**문제**: `estimateTokenCountSync`와 `estimateLlmTokenCount`에서 텍스트 토큰
추정 로직이 중복.

**결정**: 공통 로직을 `estimateTextTokens(text: string): number`로 추출.
`estimateTokenCountSync`를 이 헬퍼에 위임하도록 리팩토링.

### 4. LlmPart → LlmContent 타입 매핑

**문제**: todolist에서 "LlmPart" 타입을 참조하지만, 실제 코드베이스에는
`LlmPart` 타입이 존재하지 않음.

**결정**: `LlmContent` 유니온 타입 (LlmTextContent | LlmImageContent |
LlmToolCallContent | LlmToolResultContent | LlmThoughtContent)을 "LlmPart"로
간주하고 작업. todolist의 시그니처 변경 대신 신규 함수 추가 방식 채택.

---

## ⚠️ 다음 마일스톤 이월 사항

### M2.6으로 이월

| 항목                                                  | 우선순위 | 비고                                  |
| ----------------------------------------------------- | -------- | ------------------------------------- |
| loggingContentGenerator ProviderApiResponseEvent 전환 | 중간     | M2.2에서 이월 → 이벤트 경로 전환 필요 |
| client.ts GeminiEventType 참조 정리                   | 중간     | M2.2에서 이월                         |
| turn.ts 이벤트 생성점 전환                            | 중간     | M2.2에서 이월                         |
| 2.4.2 ModelRouterService 연동                         | 높음     | M2.4에서 이월                         |

---

## 📌 커밋 정보

| 커밋 | 해시      | 설명                                                                            |
| ---- | --------- | ------------------------------------------------------------------------------- |
| feat | fcb444e46 | feat(providers): M2.5 유틸리티 레이어 리팩토링 — provider-independent 함수 추가 |

---

## ✅ 체크리스트

- [x] 본작업 완료: 2.5.1 + 2.5.2 + 2.5.3
- [x] TDD 사이클 완료: Red → Green → Refactor
- [x] 테스트: 49개 신규 (llmUtils 12 + tokenCalc 9 + partUtils 28), 전체 4803개
      통과
- [x] TypeScript 컴파일: 클린
- [x] ESLint: 통과 (pre-commit hook)
- [x] @deprecated: 기존 6개 함수에 추가
- [x] 중복 제거: estimateTokenCountSync → estimateTextTokens 위임
- [x] 커밋: fcb444e46 (feat)
- [x] 작업 결과서 작성
