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

| 파일                                                     | 액션     | 변경량       |
| -------------------------------------------------------- | -------- | ------------ |
| `packages/core/src/core/baseLlmClient.ts`                | **수정** | +120줄 +리뷰 |
| `packages/core/src/core/baseLlmClient.test.ts`           | **수정** | +160줄 +리뷰 |
| `packages/core/src/core/baseLlmClient_new_types.test.ts` | **수정** | 리뷰 #2 반영 |
| `packages/core/src/services/sessionSummaryUtils.ts`      | **수정** | 리뷰 #3 반영 |
| `packages/core/src/services/sessionSummaryUtils.test.ts` | **수정** | 리뷰 #3 반영 |

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

## 4. 테스트 실행 결과 (초기)

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

## 6. 리뷰 반영 (5건)

### 리뷰 #1 [HIGH] — non-Gemini 경로 모델 설정값(temperature/topP/maxOutputTokens) 유실

**검증 결과**: 확인됨 — `_callLlmGenerateContent()`가 `LlmGenerateRequest`에
`model`과 `messages`만 설정하고 `generateContentConfig`의 temperature/topP/
maxOutputTokens를 적용하지 않음.

**수정 내용**:

- `_generateWithRetryLlm()` 시그니처에
  `generateContentConfig?: GenerateContentConfig` 파라미터 추가
- `_generateWithRetry()` → `_generateWithRetryLlm()` 호출 시
  `currentGenerateContentConfig` 전달
- `_callLlmGenerateContent()` 내부에서 bracket notation으로 `temperature`,
  `topP`, `topK`, `maxOutputTokens`(→`maxTokens`), `stopSequences` 적용

**테스트**: B10 — `temperature: 0.7, topP: 0.9, maxOutputTokens: 2048` 설정 후
`LlmGenerateRequest`에 반영 검증

### 리뷰 #2 [HIGH] — tool_call/tool_result ID 손실로 tool 컨텍스트 깨짐

**검증 결과**: 확인됨 — `convertLlmMessagesToContents()`에서:

- `tool_call` → `functionCall: { name, args }` (id 누락)
- `tool_result` → `functionResponse: { name, response }` (id 누락)

→ 다시 `convertContentsToLlmMessages()` 경유 시 `functionCall.id`가
`crypto.randomUUID()`으로 대체되고, `functionResponse.id`가 빈 문자열이 됨.

**수정 내용**:

- `convertLlmMessagesToContents()` case `'tool_call'`:
  `functionCall.id: content.id` 추가
- `convertLlmMessagesToContents()` case `'tool_result'`:
  `functionResponse.id: content.toolCallId` 추가
- `baseLlmClient_new_types.test.ts` 3개 테스트 기대값에 `id` 필드 추가 (기존
  Gemini 경로에서도 ID 보존 보장)

**테스트**: B11 — `call-abc-123` ID가 tool_call → functionCall →
convertContentsToLlmMessages → tool_call 라운드트립에서 보존 검증

### 리뷰 #3 [MEDIUM] — non-Gemini 세션 요약 강제 비활성화

**검증 결과**: 확인됨 — `sessionSummaryUtils.ts:56-67`의 skip 주석:
"BaseLlmClient uses legacy Gemini generateContent() which non-Gemini providers
do not support" → Phase 2에서 `llm*` 경로 추가로 이 전제가 더 이상 유효하지
않음.

**수정 내용**:

- `sessionSummaryUtils.ts`: non-Gemini skip 블록 제거, 주석으로 Phase 2 llm\*
  경로 지원 설명 추가
- `sessionSummaryUtils.test.ts`: "should skip summary generation for non-Gemini
  provider" → "should generate summary for non-Gemini provider via llm\* path"로
  변경, `BaseLlmClient`와 `mockGenerateSummary` 호출 검증

### 리뷰 #4 [MEDIUM] — availability 기반 retry attempt 값 미반영

**검증 결과**: 확인됨 — `_generateWithRetryLlm()` line 572:
`maxAttempts: maxAttempts ?? DEFAULT_MAX_ATTEMPTS` — Gemini 경로의
`availabilityMaxAttempts ?? maxAttempts ?? DEFAULT_MAX_ATTEMPTS`와 불일치.

**수정 내용**:

- `_generateWithRetryLlm()` 시그니처에 `availabilityMaxAttempts?: number`
  파라미터 추가
- `retryWithBackoff` 호출 시
  `maxAttempts: availabilityMaxAttempts ?? maxAttempts ?? DEFAULT_MAX_ATTEMPTS`로
  변경
- `_generateWithRetry()` → `_generateWithRetryLlm()` 호출 시
  `availabilityMaxAttempts` 전달

**테스트**: B12 — availability service가 `attempts: 2` 반환 시
`retryWithBackoff`에 `maxAttempts: 2` 전달 검증

### 리뷰 #5 [LOW] — malformed JSON telemetry 모델명 오기록

**검증 결과**: 확인됨 — `generateJson()` line 293:
`const { model } = getResolvedConfig(modelConfigKey)` → Gemini 해석 모델명 사용.
non-Gemini일 때 `resolveProviderModel()` 적용 전 모델명이 telemetry에 기록됨.

**수정 내용**:

- `generateJson()` 내에서 `isNonGemini` 분기 추가
- non-Gemini일 때 `resolveProviderModel(model, providerName)` 결과를
  `telemetryModel`로 사용
- `cleanJsonResponse(text, telemetryModel)` — `shouldRetryOnContent` 및 최종
  파싱 모두에 적용

**테스트**: B13 — malformed JSON 응답 시 `MalformedJsonResponseEvent.model`이
`'claude-haiku'` (provider model)인지 검증

---

## 7. 리뷰 반영 후 테스트 결과

```
baseLlmClient.test.ts: 43 tests PASS (기존 29 + Phase2 10 + 리뷰 4)
baseLlmClient_new_types.test.ts: 9 tests PASS (기대값 id 필드 업데이트)
sessionSummaryUtils.test.ts: 11 tests PASS (non-Gemini skip → generate 전환)
agents/ 전체: 214 tests PASS (회귀 없음)
typecheck: 0 errors
lint: 0 errors
```

---

## 8. Phase 3 전달사항

### 재사용 가능 유틸리티

- `_normalizeSystemInstruction()`: Part/Part[]/Content → string 정규화
- `_convertLlmResponseToGeminiResponse()`: 응답 변환

### 주의사항

- `_convertLlmResponseToGeminiResponse()`는 최소 구조만 생성 (text,
  functionCall, thought). image/tool_result는 응답에서 불필요하여 skip.
- `_generateWithRetryLlm()`는 availability context (getAvailabilityContext,
  onPersistent429)를 사용하지 않음 — non-Gemini 프로바이더는 Gemini availability
  서비스 대상이 아님. 단, `availabilityMaxAttempts`는 Gemini 경로와 동일하게
  반영됨.
- `fixToolResultRoles()` 적용 시 `toolCallId`가 빈 문자열이면 role 변환이 skip됨
  (isValidToolResult 조건). 리뷰 #2 수정으로 ID 보존되어 이 문제 발생 가능성
  감소.
- non-Gemini 세션 요약 생성 활성화 (리뷰 #3) — `sessionSummaryUtils.ts` skip
  제거됨.
