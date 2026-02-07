# Phase 2: M2.1 ContentGenerator 인터페이스 재정의 작업 결과서

> 📅 **작업일**: 2026-02-07 📚 **Phase**: Phase 2 - M2.1 🎯 **목표**: 핵심
> 경로에서 `@google/genai` 타입 분리 🔄 **리뷰 반영**: 2026-02-07 (코드 기반
> 리뷰 및 수정) 🔄 **2차 리뷰 반영**: 2026-02-07 (생성자 의존성 제한사항 문서화
> 및 TODO 추가)

---

## 📋 작업 요약

### 완료된 작업 (2.1.1) ✅

| 항목                                      | 상태 | 비고                                     |
| ----------------------------------------- | :--: | ---------------------------------------- |
| 현재 ContentGenerator 시그니처 분석       |  ✅  | @google/genai 타입 직접 사용 확인        |
| providers/types.ts ContentGenerator 확인  |  ✅  | 프로바이더 독립적 인터페이스 이미 정의됨 |
| GeminiContentGenerator로 rename           |  ✅  | 레거시 호환성 유지                       |
| ContentGenerator 레거시 별칭 유지         |  ✅  | 기존 코드 호환성 100%                    |
| createContentGenerator 반환 타입 업데이트 |  ✅  | GeminiContentGenerator 반환              |

### 부분 완료 (2.1.2) ⏸️

| 항목                 | 상태 | 비고                           |
| -------------------- | :--: | ------------------------------ |
| 팩토리 로직 분석     |  ✅  | Gemini 전용 확인               |
| ProviderFactory 분석 |  ✅  | BaseAdapter 반환               |
| ProviderFactory 연동 |  ⏸️  | M2.2에서 GeminiAdapter 구현 후 |
| 기능 플래그 분기     |  ⏸️  | M2.2 이후                      |

### 완료된 작업 (2.1.3) ✅

| 항목                                      | 상태 | 비고                                 |
| ----------------------------------------- | :--: | ------------------------------------ |
| 현재 baseLlmClient.ts 분석                |  ✅  | @google/genai 타입 의존성 확인       |
| LlmGenerateJsonOptions 인터페이스 정의    |  ✅  | LlmMessage[] 기반                    |
| LlmGenerateContentOptions 인터페이스 정의 |  ✅  | LlmMessage[] 기반                    |
| 레거시 별칭 @deprecated 표시              |  ✅  | 기존 코드 호환성 100%                |
| **메서드 로직에 신규 타입 연결**          |  ✅  | 오버로딩 구현 및 변환 로직 적용 완료 |

---

## 🔍 리뷰 결과 (2026-02-07)

### 발견된 문제점 및 해결

| 문제                        | 원인                                                                                        | 해결                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| TypeScript 유니온 타입 에러 | `GenerateJsonOptions \| LlmGenerateJsonOptions`에서 `contents` 접근 시 타입 에러            | 테스트 파일에 타입 단언(`as GenerateJsonOptions`) 추가     |
| system role 처리 누락       | `convertLlmMessagesToContents`에서 system role이 그대로 전달됨 (Gemini는 user/model만 허용) | system role 메시지 필터링 추가                             |
| 테스트 커버리지 부족        | tool_call, tool_result, thought, system role 테스트 없음                                    | 5개 테스트 케이스 추가 (총 9개 → 14개 예정, 현재 9개 통과) |

### 수정된 파일

| 파일                                                     | 변경 내용                                           |
| -------------------------------------------------------- | --------------------------------------------------- |
| `core/baseLlmClient.ts`                                  | system role 필터링 추가, 주석 보강                  |
| `core/baseLlmClient_new_types.test.ts`                   | 미사용 import 제거, tool/thought/system 테스트 추가 |
| `routing/strategies/classifierStrategy.test.ts`          | 타입 단언 추가                                      |
| `routing/strategies/numericalClassifierStrategy.test.ts` | 타입 단언 추가                                      |
| `services/chatCompressionService.test.ts`                | 타입 단언 추가                                      |
| `services/loopDetectionService.test.ts`                  | 타입 단언 추가                                      |
| `providers/baseAdapter.test.ts`                          | override modifier 추가 (M2.2 관련)                  |
| `providers/streamAssembler.test.ts`                      | finishReason 타입 수정 (M2.2 관련)                  |

---

## 🔍 추가 리뷰 이슈 검증 (2026-02-07, 2차 검증 완료)

### 검증 요청된 이슈 3건

| 이슈                         | 검증 결과                       | 2차 검증  | 조치             |
| ---------------------------- | ------------------------------- | --------- | ---------------- |
| 신규 Llm 옵션 실사용 여부    | ✅ **확인됨**                   | ✅ 재확인 | 없음             |
| 주입 타입 Gemini 전용 의존성 | ✅ **확인됨 (의도된 제한사항)** | ✅ 재확인 | TODO 코멘트 추가 |
| 이중 API 표면 혼란           | ✅ **@deprecated로 완화**       | ✅ 재확인 | 없음             |

### 1. 신규 Llm 옵션 실사용 확인 ✅

**결론: 신규 타입이 Union 타입 + 타입 가드 + 변환 로직을 통해 실제 경로에서
사용됨**

**코드 근거:**

- `baseLlmClient.ts:164-225`: `convertLlmMessagesToContents()` 함수가
  `LlmMessage[]` → `Content[]` 변환
- `baseLlmClient.ts:232-234`: `isLlmGenerateJsonOptions()` 타입 가드로 분기
- `baseLlmClient.ts:241-245`: `isLlmGenerateContentOptions()` 타입 가드로 분기
- `baseLlmClient.ts:257-258`:
  `generateJson(options: GenerateJsonOptions | LlmGenerateJsonOptions)`
- `baseLlmClient.ts:370-371`:
  `generateContent(options: GenerateContentOptions | LlmGenerateContentOptions)`
- `baseLlmClient_new_types.test.ts`: 9개 테스트가 새 타입 경로 검증

### 2. 생성자 의존성: Gemini 전용 ContentGenerator ⚠️

**결론: 확인된 구조적 제한사항 → M2.3 GeminiAdapter 연동 시 해소**

**의존성 구조:**

```
baseLlmClient.ts:16  →  import { ContentGenerator } from './contentGenerator.js'
                         ↓
contentGenerator.ts:59 →  type ContentGenerator = GeminiContentGenerator
                         ↓
contentGenerator.ts:35 →  interface GeminiContentGenerator {
                            generateContent(request: GenerateContentParameters, ...)
                            ...  ← @google/genai 타입 직접 사용
                          }
```

**프로바이더 독립 ContentGenerator와의 차이:**

```
providers/types.ts:364 →  interface ContentGenerator {
                            generateContent(request: LlmGenerateRequest, ...)
                            ...  ← 프로바이더 독립 타입 사용
                          }
```

**현재 상태:**

- `BaseLlmClient` 생성자가 `core/contentGenerator.ts`의 Gemini 전용
  `ContentGenerator`에 묶여 있어 `providers/types.ts`의 프로바이더 독립
  `ContentGenerator`를 주입할 수 없는 구조
- 내부 메서드 `_generateWithRetry()`가 `GenerateContentParameters`(Gemini
  전용)로 API 호출 → 생성자 타입만 변경하면 내부 로직도 함께 수정 필요

**2차 리뷰 조치:**

- `baseLlmClient.ts:16-17`: TODO(M2.2) 코멘트 추가
- `baseLlmClient.ts:248-253`: 클래스 JSDoc에 의존성 제한사항 명시
- 해결 시점: M2.3 `GeminiAdapter` 구현 시 생성자가 프로바이더 독립 인터페이스를
  받도록 리팩토링

### 3. @deprecated 주석으로 이중 API 표면 완화 ✅

**결론: 모든 레거시 타입에 @deprecated 주석 존재 확인**

- `baseLlmClient.ts:36`: `@deprecated Use LlmGenerateJsonOptions for new code.`
- `baseLlmClient.ts:93`:
  `@deprecated Use LlmGenerateContentOptions for new code.`
- `contentGenerator.ts:32`:
  `@deprecated For new multi-provider code, use ContentGenerator from '../providers/types.js'`
- `contentGenerator.ts:56`:
  `@deprecated Use GeminiContentGenerator for Gemini-specific code`

**마이그레이션 전략:** 구형/신형 타입 공존(backward compatibility) → 점진적
마이그레이션 후 구형 제거

---

## ⚠️ 알려진 제한사항

| 이슈                             | 현재 상태                                                                                               | 해결 시점                     | 코드 위치                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------- |
| BaseLlmClient 생성자 Gemini 의존 | `core/contentGenerator.ts`의 `ContentGenerator` 주입 → `providers/types.ts`의 독립 인터페이스 주입 불가 | **M2.3** (GeminiAdapter 구현) | `baseLlmClient.ts:16, 252` |
| 내부 API 호출 Gemini 전용        | `_generateWithRetry()`가 `GenerateContentParameters`로 직접 호출                                        | **M2.3** (어댑터 캡슐화)      | `baseLlmClient.ts:464-469` |
| 이중 옵션 정의                   | 구형(`GenerateJsonOptions`)/신형(`LlmGenerateJsonOptions`) 타입 공존                                    | 전체 마이그레이션 후          | `baseLlmClient.ts:38, 68`  |
| system role 메시지 병합 미구현   | system role은 필터링만 됨 (systemInstruction과 병합 안됨)                                               | 필요 시                       | `baseLlmClient.ts:168`     |

**생성자 의존성 해소 경로:**

```
M2.1.3 (현재) → M2.3 GeminiAdapter 구현 → BaseLlmClient 생성자 리팩토링
  ✅ 메서드 레벨 타입 전환      어댑터가 Gemini 전용 로직 캡슐화     생성자가 providers/types.ts의
  ✅ 변환 로직 구현               → 프로바이더 독립 인터페이스 반환      ContentGenerator 수용
  ✅ @deprecated 표시
  ⚠️ 생성자는 여전히 Gemini 전용
```

---

## 📁 파일 변경 사항

### 수정 파일

| 파일                                   | 변경 내용                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `core/contentGenerator.ts`             | `GeminiContentGenerator` 인터페이스 생성, `ContentGenerator` 별칭                   |
| `core/baseLlmClient.ts`                | `LlmGenerate*Options` 추가, `convertLlmMessagesToContents` 구현, system role 필터링 |
| `core/baseLlmClient_new_types.test.ts` | 9개 테스트 (tool, thought, system 테스트 추가)                                      |
| `routing/strategies/*.test.ts`         | 타입 단언 추가 (2개 파일)                                                           |
| `services/*.test.ts`                   | 타입 단언 추가 (2개 파일)                                                           |

---

## ✅ 테스트 결과

```
baseLlmClient 관련 테스트:
Test Files  2 passed (2)
     Tests  38 passed (38)

신규 타입 테스트 (baseLlmClient_new_types.test.ts):
- generateJson (New Type) - 1 test
- generateContent (New Type) - 1 test
- Image Handling - 2 tests
- Tool Handling - 3 tests
- Thought Handling - 1 test
- System Role Handling - 1 test
```

TypeScript 컴파일: ✅ 에러 없음

---

## 🏗️ 구현된 변환 로직

### convertLlmMessagesToContents 함수

```typescript
function convertLlmMessagesToContents(messages: LlmMessage[]): Content[] {
  return messages
    .filter((msg) => msg.role !== 'system') // System messages filtered
    .map((msg) => {
      const parts = msg.content.map((content) => {
        // text, image (base64/url), tool_call, tool_result, thought 처리
      });

      // Role 매핑: assistant → model, tool → user, user → user
      const role =
        msg.role === 'assistant'
          ? 'model'
          : msg.role === 'tool'
            ? 'user'
            : 'user';

      return { role, parts };
    });
}
```

### 지원되는 콘텐츠 타입

| LlmContent Type | Gemini Part Type                         |
| --------------- | ---------------------------------------- |
| text            | { text: string }                         |
| image (base64)  | { inlineData: { mimeType, data } }       |
| image (url)     | { fileData: { mimeType, fileUri } }      |
| tool_call       | { functionCall: { name, args } }         |
| tool_result     | { functionResponse: { name, response } } |
| thought         | { text: "[Thought] ..." }                |

---

## 📝 다음 작업

### M2.1 잔여 작업

- 2.1.4 Retry 로직 리팩토링
- 2.1.5 Hook 시스템 타입 전환
- 2.1.6 ContentGenerator 래퍼/파생 클래스 마이그레이션

### M2.2 이어서 진행

- EventMapper 구현 완료 확인
- StreamEvent → LlmStreamEvent 전환
- GeminiAdapter 구현

### Open Questions

- **BaseLlmClient 리팩토링 전략 (M2.3)**: 생성자에 `providers/types.ts`의
  `ContentGenerator`를 주입하려면, 내부 `_generateWithRetry()`의 Gemini 전용 API
  호출도 함께 추상화해야 함. 두 가지 접근:
  1. `BaseLlmClient` 자체를 어댑터 패턴으로 재설계 (프로바이더 독립)
  2. `BaseLlmClient`를 Gemini 전용으로 유지하고, 새로운 프로바이더 독립
     클라이언트를 별도 생성

---

## 🔖 커밋 정보

**커밋 메시지:**

```
refactor(core): implement provider-independent types in BaseLlmClient

- Add LlmGenerateJsonOptions/LlmGenerateContentOptions interfaces
- Implement convertLlmMessagesToContents utility with full content type support
- Add system role filtering (system messages should use systemInstruction)
- Update generateJson/generateContent to support new types via overloading
- Mark legacy options as @deprecated
- Add comprehensive tests for tool_call, tool_result, thought, system role
- Fix union type access issues in test files with type assertions
- All 38 baseLlmClient tests pass
- TypeScript compilation: 0 errors

Review fixes:
- Fix system role handling (was passing invalid role to Gemini API)
- Add type assertions to test files accessing .contents property
- Fix unrelated M2.2 test issues (override modifier, finishReason type)
```

---

## 📊 변경 통계

| 항목            | 수치                                             |
| --------------- | ------------------------------------------------ |
| 수정된 파일     | 8개                                              |
| 추가된 테스트   | 5개 (tool_call, tool_result x2, thought, system) |
| 총 테스트 통과  | 38개 (baseLlmClient 관련)                        |
| TypeScript 에러 | 0개                                              |
