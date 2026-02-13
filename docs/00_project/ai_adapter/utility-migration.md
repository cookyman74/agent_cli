# 유틸리티/테스트 마이그레이션 계획

> 📅 **작성일**: 2026-02-06  
> 📚 **Phase**: Phase 1 - M1.4  
> 🎯 **목표**: 유틸리티 레이어 및 테스트 마이그레이션 상세 계획 수립

---

## 📊 분석 요약

| 항목                 | 수량  | 비고                              |
| -------------------- | :---: | --------------------------------- |
| 유틸리티 파일        |  3개  | `@google/genai` 의존성 있음       |
| 영향받는 테스트 파일 | 30+개 | Gemini 타입 직접 사용             |
| 주요 의존 타입       |  6개  | Part, PartUnion, PartListUnion 등 |

---

## 🔍 1. 유틸리티 파일 분석

### 1.1 tokenCalculation.ts

**파일**: `packages/core/src/utils/tokenCalculation.ts`

**의존성**:

```typescript
import type { PartListUnion, Part } from '@google/genai';
import type { ContentGenerator } from '../core/contentGenerator.js';
```

**핵심 함수**: | 함수 | 사용 타입 | 마이그레이션 복잡도 |
|------|----------|:-------------------:| | `estimateTokenCountSync(parts)` |
`Part[]` | ⭐⭐ 중간 | | `calculateRequestTokenCount(request, ...)` |
`PartListUnion` | ⭐⭐⭐ 높음 |

**마이그레이션 전략**:

- `Part[]` → `LlmPart[]` (providers/types.ts)
- `PartListUnion` → `LlmContent` 변환 유틸리티 추가

---

### 1.2 partUtils.ts

**파일**: `packages/core/src/utils/partUtils.ts`

**의존성**:

```typescript
import type {
  GenerateContentResponse,
  PartListUnion,
  Part,
  PartUnion,
} from '@google/genai';
```

**핵심 함수**: | 함수 | 사용 타입 | 마이그레이션 복잡도 |
|------|----------|:-------------------:| | `partToString(value, options)` |
`PartListUnion` | ⭐⭐ 중간 | | `getResponseText(response)` |
`GenerateContentResponse` | ⭐⭐⭐ 높음 | | `flatMapTextParts(parts, transform)`
| `PartListUnion`, `PartUnion[]` | ⭐⭐ 중간 | |
`appendToLastTextPart(prompt, text, sep)` | `PartUnion[]` | ⭐⭐ 중간 |

**마이그레이션 전략**:

- `GenerateContentResponse` 접근 → `LlmResponse` 래퍼 사용
- `PartUnion` → `LlmPart | string` 유니온으로 대체

---

### 1.3 generateContentResponseUtilities.ts

**파일**: `packages/core/src/utils/generateContentResponseUtilities.ts`

**의존성**:

```typescript
import type {
  GenerateContentResponse,
  Part,
  FunctionCall,
  PartListUnion,
} from '@google/genai';
```

**핵심 함수**: | 함수 | 사용 타입 | 마이그레이션 복잡도 |
|------|----------|:-------------------:| | `convertToFunctionResponse(...)` |
`Part`, `PartListUnion` | ⭐⭐⭐ 높음 | | `getFunctionCalls(response)` |
`GenerateContentResponse`, `FunctionCall` | ⭐⭐⭐ 높음 | |
`getStructuredResponse(response)` | `GenerateContentResponse` | ⭐⭐ 중간 | |
`getCitations(resp)` | `GenerateContentResponse` | ⭐ 낮음 |

**마이그레이션 전략**:

- `FunctionCall` → `LlmToolCall` 매핑 필요
- 응답 처리 유틸리티를 providers 레이어로 이동 고려

---

## 📋 2. 테스트 파일 분석

### 2.1 Gemini 전용 테스트 파일 목록 (30+개)

**Core 영역** (16개):

- `core/baseLlmClient.test.ts`
- `core/client.test.ts`
- `core/contentGenerator.test.ts`
- `core/coreToolScheduler.test.ts`
- `core/fakeContentGenerator.test.ts`
- `core/geminiChat.test.ts`
- `core/geminiChat_network_retry.test.ts`
- `core/logger.test.ts`
- `core/loggingContentGenerator.test.ts`
- `core/recordingContentGenerator.test.ts`
- `core/turn.test.ts`

**Utils 영역** (4개):

- `utils/partUtils.test.ts`
- `utils/generateContentResponseUtilities.test.ts`
- `utils/apiConversionUtils.test.ts`
- `utils/nextSpeakerChecker.test.ts`

**Services 영역** (4개):

- `services/chatCompressionService.test.ts`
- `services/loopDetectionService.test.ts`
- `services/sessionSummaryService.test.ts`

**기타** (6+개):

- `hooks/hookTranslator.test.ts`
- `hooks/types.test.ts`
- `policy/policy-engine.test.ts`
- `routing/strategies/*.test.ts`
- `agents/*.test.ts`

### 2.2 테스트 수정 범위 추정

| 범위                 | 파일 수 | 예상 공수  |
| -------------------- | :-----: | :--------: |
| 타입 import 변경만   | 10~15개 |   ⭐ 1일   |
| 모킹/픽스처 수정     | 10~12개 |  ⭐⭐ 2일  |
| 테스트 로직 리팩터링 |  5~8개  | ⭐⭐⭐ 2일 |

---

## 🎯 3. 마이그레이션 우선순위

### Phase 2에서 처리 (높은 우선순위)

| 우선순위 | 대상                                  | 이유                       |
| :------: | ------------------------------------- | -------------------------- |
|    1     | `tokenCalculation.ts`                 | 독립적, 영향 범위 작음     |
|    2     | `partUtils.ts`                        | 널리 사용됨, 기반 유틸리티 |
|    3     | `generateContentResponseUtilities.ts` | 복잡하지만 중요            |

### Phase 3에서 처리 (낮은 우선순위)

- 테스트 파일 마이그레이션
- 모킹 인프라 정비

---

## 🔧 4. 프로바이더 독립 유틸 설계

### 4.1 신규 유틸리티 파일 구조

```
packages/core/src/providers/utils/
├── contentUtils.ts     # LlmContent 유틸리티
├── partUtils.ts        # LlmPart 유틸리티 (기존 래핑)
└── tokenUtils.ts       # 토큰 계산 유틸리티
```

### 4.2 핵심 변환 함수

```typescript
// providers/utils/contentUtils.ts

/** Gemini Part[] → LlmPart[] 변환 */
export function toLlmParts(parts: Part[]): LlmPart[];

/** LlmPart[] → Gemini Part[] 변환 */
export function toGeminiParts(parts: LlmPart[]): Part[];

/** LlmContent 텍스트 추출 */
export function extractText(content: LlmContent): string;
```

---

## 📅 5. 마이그레이션 일정

| 단계 | 작업                   | 예상 기간 |  Phase  |
| :--: | ---------------------- | :-------: | :-----: |
|  1   | 유틸리티 분석 완료     |   0.5일   | P1 M1.4 |
|  2   | 테스트 분석 완료       |   0.5일   | P1 M1.4 |
|  3   | 마이그레이션 문서화    |   0.5일   | P1 M1.4 |
|  4   | providers/utils 생성   |    1일    |   P2    |
|  5   | 유틸리티 파일 리팩터링 |    2일    |   P2    |
|  6   | 테스트 마이그레이션    |    3일    |   P3    |

**총 예상**: ~1.5일 (P1 M1.4) + 3일 (P2) + 3일 (P3)

---

## ✅ 검증 기준

- [ ] 모든 유틸리티 함수의 Gemini 의존성 식별
- [ ] 프로바이더 독립 유틸리티 설계 완료
- [ ] 테스트 마이그레이션 우선순위 정의
- [ ] Phase 2/3 작업 범위 명확화

---

## 📝 참고사항

### 기존 타입 매핑

| @google/genai             | providers/types.ts  |
| ------------------------- | ------------------- |
| `Part`                    | `LlmPart`           |
| `PartUnion`               | `LlmPart \| string` |
| `PartListUnion`           | `LlmContent`        |
| `GenerateContentResponse` | `LlmResponse`       |
| `FunctionCall`            | `LlmToolCall`       |
| `Content`                 | `LlmMessage`        |

### 주의사항

1. **순환 의존성 방지**: providers → utils 방향 의존만 허용
2. **점진적 마이그레이션**: 기존 API 유지하면서 새 API 추가
3. **테스트 우선**: 마이그레이션 전 테스트 커버리지 확보
