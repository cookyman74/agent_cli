# Phase 4 작업 결과서: 토큰 계산 경로

**작업일**: 2026-02-19 **브랜치**: `hotfix/v0.2.5` **Phase**: Phase 4 — Category
D (tokenCalculation)

---

## 1. 작업 요약

### 목적

`tokenCalculation.ts`의 `calculateRequestTokenCount()`가 항상 레거시
`contentGenerator.countTokens()` (Gemini SDK)를 호출하여 non-Gemini
프로바이더에서 미디어(이미지) 포함 입력 시 토큰 API 호출이 실패하고 로컬
추정치로 폴백되는 문제 해결.

### 핵심 구현

- `hasMedia` 분기 내부에 프로바이더 감지 → non-Gemini일 때 `llmCountTokens()`
  경로 분기
- `convertPartListUnionToLlmContents()` — Gemini `Part[]` → `LlmContent[]` 변환
- `LlmGenerateRequest` 구성 후 `llmCountTokens()` 호출
- 실패 시 기존 `estimateTokenCountSync()` 폴백 유지

### 파급 효과

- **호출자 코드 변경: 0건** — `calculateRequestTokenCount()` 호출자(client.ts
  등)가 자동으로 non-Gemini 토큰 계산 지원
- **텍스트만인 경우 영향 없음** — `hasMedia` 분기 밖이므로 기존 로컬 추정치 사용

---

## 2. 변경 파일

| 파일                             | 액션     | 변경량 |
| -------------------------------- | -------- | ------ |
| `utils/tokenCalculation.ts`      | **수정** | +15줄  |
| `utils/tokenCalculation.test.ts` | **수정** | +95줄  |

---

## 3. 구현 상세

### 3.1 tokenCalculation.ts 변경

#### import 추가

```typescript
import { isProviderIndependentGenerator } from '../core/contentGenerator.js';
import type { LlmGenerateRequest } from '../providers/types.js';
import { convertPartListUnionToLlmContents } from '../providers/gemini/typeConversion.js';
```

#### hasMedia 분기 내부 non-Gemini 경로

```typescript
if (hasMedia) {
  const providerName = contentGenerator.providerName;
  const isNonGemini = providerName != null && providerName !== 'gemini';

  // Non-Gemini: use llmCountTokens (provider-independent path)
  if (isNonGemini && isProviderIndependentGenerator(contentGenerator)) {
    try {
      const llmContents = convertPartListUnionToLlmContents(parts);
      const request: LlmGenerateRequest = {
        model,
        messages: [{ role: 'user', content: llmContents }],
      };
      const response = await contentGenerator.llmCountTokens(request);
      return response.totalTokens ?? 0;
    } catch (error) {
      debugLogger.debug('llmCountTokens failed:', error);
      return estimateTokenCountSync(parts);
    }
  }

  // Gemini: use legacy countTokens (기존 경로 유지)
  // ...
}
```

### 3.2 테스트 추가 (5 tests)

| 테스트                  | 검증 항목                                               |
| ----------------------- | ------------------------------------------------------- |
| D1: non-Gemini + media  | llmCountTokens 호출, legacy countTokens 미호출          |
| D2: non-Gemini + text   | 로컬 추정치, API 미호출                                 |
| D3: Gemini 회귀         | 기존 legacy countTokens 유지                            |
| D4: llmCountTokens 실패 | fallback → estimateTokenCountSync                       |
| D5: 요청 구조           | LlmGenerateRequest 구조 검증 (model, messages, content) |

---

## 4. 테스트 실행 결과

```
tokenCalculation.test.ts: 24 passed (기존 19 + 신규 5)
typecheck: 0 errors
lint: 0 errors
```

---

## 5. 완료 조건 달성 여부

| 검증 항목                                            | 상태 |
| ---------------------------------------------------- | ---- |
| RED: tokenCalculation non-Gemini 테스트              | ✅   |
| GREEN: tokenCalculation llmCountTokens 분기 + 테스트 | ✅   |
| REFACTOR: Phase 4 구조 개선                          | ✅   |
| Phase 4 커밋 완료                                    | ✅   |
| 완료 조건 체크표시 + 작업 결과서 작성                | ✅   |

---

## 6. Phase 5 전달사항

### 주의사항

- `isProviderIndependentGenerator()` type guard가 `llmCountTokens` 존재를
  보장하므로 non-null assertion (`!`) 불필요 — ESLint
  `no-unnecessary-type-assertion` 규칙 준수
- `convertPartListUnionToLlmContents()` — Gemini `Part` 중 `inlineData` →
  `LlmImageContent` 변환. `fileData` (GCS URI)는 현재 미지원 → 해당 타입은 JSON
  heuristic 폴백으로 처리됨
- non-Gemini + llm\* 없는 경우 → Gemini legacy path로 fallthrough → catch 폴백 →
  로컬 추정치 (기존 동작 유지)
