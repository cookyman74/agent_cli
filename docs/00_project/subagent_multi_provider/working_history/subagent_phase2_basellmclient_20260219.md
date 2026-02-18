# Phase 2 작업 결과서: BaseLlmClient 유틸리티 호출 경로

**작업일**: 2026-02-19 **브랜치**: `v0.2.0/se_manager_agent` **Phase**: Phase 2
— Category B (BaseLlmClient)

---

## 1. 작업 요약

### 목적

`BaseLlmClient._generateWithRetry()`가 항상 레거시
`contentGenerator.generateContent()` (Gemini API)를 호출하여 non-Gemini
프로바이더에서 11개 유틸리티 호출자(loopDetectionService,
chatCompressionService, sessionSummaryService 등)가 실패하는 문제 해결.

### 핵심 구현

- `_generateWithRetry()` 진입 시 프로바이더 감지 → non-Gemini일 때
  `_generateWithRetryLlm()` 경로 분기
- `_callLlmGenerateContent()`: Content[] → LlmMessage[] 변환 +
  fixToolResultRoles + llmGenerateContent() 호출
- `_convertLlmResponseToGeminiResponse()`: LlmGenerateResponse →
  GenerateContentResponse 변환 (getResponseText() 호환)
- `_normalizeSystemInstruction()`: string | Part | Part[] | Content → string
  정규화

### 파급 효과

- **호출자 코드 변경: 0건** — 11개 서비스(loopDetectionService,
  chatCompressionService, sessionSummaryService, nextSpeakerChecker,
  editCorrector, llm-edit-fixer 등)가 자동으로 multi-provider 지원

---

## 2. 변경 파일

| 파일                                           | 액션     | 변경량 |
| ---------------------------------------------- | -------- | ------ |
| `packages/core/src/core/baseLlmClient.ts`      | **수정** | +120줄 |
| `packages/core/src/core/baseLlmClient.test.ts` | **수정** | +160줄 |

---

## 3. 구현 상세

### 3.1 baseLlmClient.ts 변경

#### import 추가

```typescript
import { isProviderIndependentGenerator } from './contentGenerator.js';
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
} from '../providers/types.js';
import { convertContentsToLlmMessages } from '../providers/gemini/typeConversion.js';
import { fixToolResultRoles } from './llmMessageUtils.js';
import { resolveProviderModel } from '../providers/providerSelector.js';
```

#### \_generateWithRetry() 분기 로직

```typescript
const providerName = this.contentGenerator.providerName;
const isNonGemini = providerName != null && providerName !== 'gemini';

if (isNonGemini && isProviderIndependentGenerator(this.contentGenerator)) {
  return this._generateWithRetryLlm(
    options,
    shouldRetryOnContent,
    errorContext,
    currentModel,
    providerName,
  );
}
// ... 기존 Gemini 경로 유지
```

#### 모델 해석 체인 [4차 #1]

```
modelConfigKey.model (config alias, e.g. 'loop-detection')
  → applyModelSelection() → getResolvedConfig() → resolved.model (e.g. 'gemini-2.5-flash')
    → resolveProviderModel(resolved.model, providerName) → provider model
```

#### 신규 private 메서드

1. **`_generateWithRetryLlm()`**: retryWithBackoff + \_callLlmGenerateContent
   래퍼
2. **`_callLlmGenerateContent()`**: Content[] → LlmMessage[] →
   fixToolResultRoles → LlmGenerateRequest 구성 → llmGenerateContent() 호출 →
   \_convertLlmResponseToGeminiResponse()
3. **`_normalizeSystemInstruction()`**: 다양한 systemInstruction 형식을
   string으로 정규화
4. **`_convertLlmResponseToGeminiResponse()`**: LlmGenerateResponse →
   GenerateContentResponse 변환

### 3.2 테스트 추가 (10 tests)

| 테스트                         | 검증 항목                                                  |
| ------------------------------ | ---------------------------------------------------------- |
| B1: non-Gemini generateJson    | llmGenerateContent 호출, legacy 미호출                     |
| B2: non-Gemini generateContent | llmGenerateContent 호출, getResponseText 호환              |
| B3: Gemini 회귀                | 기존 legacy generateContent 경로 유지                      |
| B4: 변환 호환성                | candidates[0].content.parts[0].text 구조 검증              |
| B5: systemInstruction          | string 형태로 request에 전달                               |
| B6: retry                      | non-Gemini 경로에서도 retry 정상 동작                      |
| B7: responseFormat             | generateJson 시 responseFormat: 'json' 전달                |
| B8: fixToolResultRoles         | tool_result role 교정 (user → tool)                        |
| B9a: 모델 해석                 | config alias → resolvedConfig.model → resolveProviderModel |
| B9b: 모델 pass-through         | 사용자 오버라이드 모델 그대로 전달                         |

---

## 4. 테스트 실행 결과

```
baseLlmClient.test.ts: 39 tests PASS (기존 29 + 신규 10)
baseLlmClient_new_types.test.ts: 9 tests PASS
agents/ 전체: 214 tests PASS (회귀 없음)
typecheck: 0 errors
lint: 0 errors
```

---

## 5. 완료 조건 달성 여부

| 검증 항목                                          | 상태      |
| -------------------------------------------------- | --------- |
| RED: BaseLlmClient non-Gemini 테스트 작성          | ✅        |
| GREEN: BaseLlmClient llm\* 분기 구현 + 테스트 통과 | ✅        |
| REFACTOR: Phase 2 구조 개선                        | ✅        |
| Phase 2 커밋 완료                                  | ⬜ (대기) |
| 완료 조건 체크표시 + 작업 결과서 작성              | ✅        |

---

## 6. Phase 3 전달사항

### 재사용 가능 유틸리티

- `_normalizeSystemInstruction()`: Part/Part[]/Content → string 정규화
- `_convertLlmResponseToGeminiResponse()`: 응답 변환

### 주의사항

- `_convertLlmResponseToGeminiResponse()`는 최소 구조만 생성 (text,
  functionCall, thought). image/tool_result는 응답에서 불필요하여 skip.
- `_generateWithRetryLlm()`는 availability context (getAvailabilityContext,
  onPersistent429)를 사용하지 않음 — non-Gemini 프로바이더는 Gemini availability
  서비스 대상이 아님.
- `fixToolResultRoles()` 적용 시 `toolCallId`가 빈 문자열이면 role 변환이 skip됨
  (isValidToolResult 조건).
