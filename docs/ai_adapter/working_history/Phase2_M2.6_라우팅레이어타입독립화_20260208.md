# Phase 2: M2.6 라우팅 레이어 타입 독립화 작업 결과서

> 📅 **작업일**: 2026-02-08 📚 **Phase**: Phase 2 - M2.6 🎯 **목표**: 라우팅
> 레이어의 `@google/genai` 의존성 제거 — RoutingContext와 전략 구현체의
> provider-independent 타입 전환 🔗 **이전 작업**:
> [Phase2*M2.5*유틸리티레이어리팩토링\_20260208.md](./Phase2_M2.5_유틸리티레이어리팩토링_20260208.md)
> 🔗 **관련 문서**:
> [phase2_core_refactoring_todolist.md](../todolist/phase2_core_refactoring_todolist.md) -
> M2.6

---

## 📋 작업 요약

### 접근 전략

**인라인 타입 전환**: M2.5의 "병행 추가 + @deprecated" 패턴과 달리, M2.6에서는
RoutingContext 인터페이스를 직접 변경하는 방식을 채택. 이유: todolist 검증
기준이 "routingStrategy.ts에서 @google/genai import 제거"를 명시적으로 요구.

**변환 브릿지 패턴**: 호출 지점(client.ts, local-executor.ts)에서 Gemini SDK
타입을 LlmMessage/LlmContent로 변환하는 유틸리티 함수를 새로 생성. 라우팅 레이어
내부는 완전히 provider-independent하게 유지.

**작업 순서**: 유틸리티 함수 TDD → RoutingContext 타입 전환(2.6.1) → 전략 구현체
마이그레이션(2.6.2) → 호출 지점 + 테스트 전환(2.6.3)

### 핵심 발견 사항 (사전작업)

- `baseLlmClient.generateJson()`이 이미
  `LlmGenerateJsonOptions`(`messages: LlmMessage[]` 형식)를 지원
- `Type.OBJECT`/`Type.STRING`/`Type.INTEGER` 등 `@google/genai`의 Type enum 값은
  단순 문자열 리터럴(`'OBJECT'`, `'STRING'`, `'INTEGER'`)로 대체 가능
- 라우팅 전략 중 `compositeStrategy`, `defaultStrategy`, `overrideStrategy`,
  `fallbackStrategy`는 `@google/genai`를 직접 import하지 않아 코드 변경 불필요
  (테스트 mock만 업데이트)

---

## ✅ 변경 사항

### 신규 파일

| 파일                                     | 설명                                           |
| ---------------------------------------- | ---------------------------------------------- |
| `src/utils/geminiTypeConversion.ts`      | Gemini SDK → LlmMessage/LlmContent 변환 브릿지 |
| `src/utils/geminiTypeConversion.test.ts` | 변환 함수 테스트 (15개)                        |

### 2.6.1 RoutingContext 타입 전환 ✅

| 항목                                               | 상태 | 비고                                                    |
| -------------------------------------------------- | :--: | ------------------------------------------------------- |
| `routingStrategy.ts` — `@google/genai` import 제거 |  ✅  | `Content`, `PartListUnion` → `LlmMessage`, `LlmContent` |
| `history: Content[]` → `history: LlmMessage[]`     |  ✅  | 직접 타입 전환                                          |
| `request: PartListUnion` → `request: LlmContent[]` |  ✅  | 직접 타입 전환                                          |

### 2.6.2 라우팅 전략 구현체 마이그레이션 ✅

| 항목                                                    | 상태 | 비고                                                                              |
| ------------------------------------------------------- | :--: | --------------------------------------------------------------------------------- |
| `classifierStrategy.ts` — `@google/genai` 제거          |  ✅  | `createUserContent`, `Type` import 제거                                           |
| `classifierStrategy.ts` — `messages` 형식 전환          |  ✅  | `contents` → `messages` (LlmGenerateJsonOptions)                                  |
| `classifierStrategy.ts` — 필터 로직 전환                |  ✅  | `isFunctionCall`/`isFunctionResponse` → `isToolCallMessage`/`isToolResultMessage` |
| `numericalClassifierStrategy.ts` — `@google/genai` 제거 |  ✅  | `Type` import 제거, `extractText` 활용                                            |
| `numericalClassifierStrategy.ts` — `messages` 형식 전환 |  ✅  | `contents` → `messages` (LlmGenerateJsonOptions)                                  |
| `compositeStrategy.ts` — 코드 변경 불필요               |  ✅  | RoutingContext 타입 자동 전파                                                     |
| `defaultStrategy.ts` — 코드 변경 불필요                 |  ✅  | RoutingContext 타입 자동 전파                                                     |
| `fallbackStrategy.ts` — 코드 변경 불필요                |  ✅  | RoutingContext 타입 자동 전파                                                     |
| `overrideStrategy.ts` — 코드 변경 불필요                |  ✅  | RoutingContext 타입 자동 전파                                                     |

### 2.6.3 호출 지점 마이그레이션 ✅

| 항목                                         | 상태 | 비고                                                                    |
| -------------------------------------------- | :--: | ----------------------------------------------------------------------- |
| `client.ts` — 변환 브릿지 적용               |  ✅  | `convertContentsToLlmMessages()`, `convertPartListUnionToLlmContents()` |
| `local-executor.ts` — 변환 브릿지 적용       |  ✅  | 동일 변환 함수 적용                                                     |
| `modelRouterService.test.ts` — mock 업데이트 |  ✅  | `request` 형식을 LlmContent[] 포맷으로 전환                             |

### Refactor ✅

| 항목                                        | 상태 | 비고                                                                                      |
| ------------------------------------------- | :--: | ----------------------------------------------------------------------------------------- |
| `messageInspectors.ts` — `@deprecated` 추가 |  ✅  | `isFunctionCall` → `isToolCallMessage`, `isFunctionResponse` → `isToolResultMessage` 안내 |
| `llmUtils.ts` — 메시지 레벨 inspector 추가  |  ✅  | `isToolCallMessage()`, `isToolResultMessage()` (M2.5의 content-level guard를 보완)        |

---

## 🧪 테스트 현황

### 신규 테스트

| 파일                           | 테스트 수 | 내용                                                                                              |
| ------------------------------ | :-------: | ------------------------------------------------------------------------------------------------- |
| `geminiTypeConversion.test.ts` |    15     | `convertContentToLlmMessage`, `convertContentsToLlmMessages`, `convertPartListUnionToLlmContents` |
| `llmUtils.test.ts` (추가분)    |     6     | `isToolCallMessage`, `isToolResultMessage`                                                        |

### 수정된 테스트 파일

| 파일                                  | 변경 내용                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `classifierStrategy.test.ts`          | `Content[]` → `LlmMessage[]`, `GenerateJsonOptions` → `LlmGenerateJsonOptions`, `contents` → `messages` 접근 |
| `numericalClassifierStrategy.test.ts` | `Content` import → `LlmMessage`, mock 데이터 LlmMessage/LlmContent 형식 전환                                 |
| `modelRouterService.test.ts`          | `request` mock을 LlmContent[] 형식으로 전환                                                                  |

### 전체 테스트 결과

```
 Test Files  260 passed (260)
      Tests  4824 passed | 24 skipped (4848)
 TypeCheck   All workspaces passed
 Lint        0 errors, 0 warnings
```

---

## 📁 변경 파일 목록

### 구현 파일 (7개)

| 파일                                                    | 변경 유형                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------- |
| `src/routing/routingStrategy.ts`                        | Modified — 타입 전환                                       |
| `src/routing/strategies/classifierStrategy.ts`          | Modified — `@google/genai` 제거, `messages` 형식 전환      |
| `src/routing/strategies/numericalClassifierStrategy.ts` | Modified — `@google/genai` 제거, `messages` 형식 전환      |
| `src/core/client.ts`                                    | Modified — 변환 브릿지 적용                                |
| `src/agents/local-executor.ts`                          | Modified — 변환 브릿지 적용                                |
| `src/utils/geminiTypeConversion.ts`                     | **New** — Gemini SDK → LlmMessage/LlmContent 변환          |
| `src/utils/llmUtils.ts`                                 | Modified — `isToolCallMessage`, `isToolResultMessage` 추가 |

### 리팩토링 파일 (1개)

| 파일                             | 변경 유형                          |
| -------------------------------- | ---------------------------------- |
| `src/utils/messageInspectors.ts` | Modified — `@deprecated` 주석 추가 |

### 테스트 파일 (4개)

| 파일                                                         | 변경 유형                                    |
| ------------------------------------------------------------ | -------------------------------------------- |
| `src/utils/geminiTypeConversion.test.ts`                     | **New** — 변환 함수 테스트                   |
| `src/utils/llmUtils.test.ts`                                 | Modified — 메시지 레벨 inspector 테스트 추가 |
| `src/routing/strategies/classifierStrategy.test.ts`          | Modified — LlmMessage 형식 전환              |
| `src/routing/strategies/numericalClassifierStrategy.test.ts` | Modified — LlmMessage 형식 전환              |
| `src/routing/modelRouterService.test.ts`                     | Modified — mock 데이터 전환                  |

---

## 🔑 검증 기준 충족 확인

| 검증 기준                                            | 결과 |
| ---------------------------------------------------- | :--: |
| `routingStrategy.ts`에서 `@google/genai` import 제거 |  ✅  |
| 모든 라우팅 전략 구현체 타입 전환 완료               |  ✅  |
| 기존 라우팅 테스트 100% 통과 (85개)                  |  ✅  |
| 전체 테스트 스위트 통과 (4824개)                     |  ✅  |
| TypeScript 타입체크 통과                             |  ✅  |
| ESLint 통과                                          |  ✅  |

---

## 📝 설계 결정 사항

### 인라인 전환 vs 병행 추가

M2.5에서는 기존 함수를 유지하고 `@deprecated`를 붙이는 병행 추가 패턴을
사용했지만, M2.6에서는 `RoutingContext` 인터페이스를 직접 전환. 이유:

1. todolist 검증 기준이 명시적으로 `@google/genai` import 제거를 요구
2. `RoutingContext`는 내부 인터페이스로 외부 API 아님
3. 호출 지점이 2곳(client.ts, local-executor.ts)으로 제한적

### 변환 브릿지 분리

`geminiTypeConversion.ts`를 독립 유틸리티로 생성 (GeminiConverter 클래스 확장 안
함). 이유:

1. 호출 지점(client.ts, local-executor.ts)은 core 모듈 → provider-specific
   클래스 의존 회피
2. 변환은 일시적 브릿지 → 향후 호출 지점 자체가 LlmMessage 기반으로 전환되면
   제거 예정

### Type enum 문자열 리터럴 대체

`@google/genai`의 `Type.OBJECT` = `'OBJECT'` 등이 단순 문자열임을 확인 후
리터럴로 대체. JSON Schema 형식의 RESPONSE_SCHEMA가 Gemini API에 직접 전달되므로
값은 동일.

---

## 🔗 후속 작업

- `messageInspectors.ts`의 `isFunctionCall`/`isFunctionResponse`는
  `loopDetectionService.ts`, `geminiChat.ts`, `editCorrector.ts`,
  `nextSpeakerChecker.ts`에서 아직 사용 중 → M2.7 이후 마이그레이션 대상
- `geminiTypeConversion.ts` 변환 브릿지는 호출 지점(client.ts,
  local-executor.ts)이 LlmMessage 기반으로 전환되면 제거 예정
