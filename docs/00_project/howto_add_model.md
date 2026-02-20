# 모델 추가 가이드

Didim Agent CLI에 새로운 LLM 모델을 추가하는 절차를 설명합니다.

> 프로바이더별로 수정 범위가 다릅니다. Gemini는 내부 시스템(alias, token limit,
> compression, thinking config 등)과 깊이 연동되어 수정 파일이 많고,
> Claude/OpenAI는 레지스트리 등록만으로 충분합니다.

---

## 목차

1. [수정 대상 파일 요약](#1-수정-대상-파일-요약)
2. [Gemini 모델 추가](#2-gemini-모델-추가)
3. [Claude 모델 추가](#3-claude-모델-추가)
4. [OpenAI 모델 추가](#4-openai-모델-추가)
5. [검증 절차](#5-검증-절차)
6. [문서 업데이트](#6-문서-업데이트)
7. [실제 사례: Gemini 3.1 Pro 추가](#7-실제-사례-gemini-31-pro-추가)

---

## 1. 수정 대상 파일 요약

### Gemini 모델 (최대 7개 파일 + golden 파일)

| #   | 파일 경로                                              | 역할                            | 필수     |
| --- | ------------------------------------------------------ | ------------------------------- | -------- |
| 1   | `packages/core/src/config/models.ts`                   | 모델 상수, 유효 목록, 유틸 함수 | **필수** |
| 2   | `packages/core/src/config/providerModels.ts`           | `/model` UI 레지스트리 (SSOT)   | **필수** |
| 3   | `packages/core/src/config/defaultModelConfigs.ts`      | thinking/generation 파라미터    | **필수** |
| 4   | `packages/core/src/core/tokenLimits.ts`                | 토큰 입력 한도 매핑             | **필수** |
| 5   | `packages/core/src/services/chatCompressionService.ts` | 대화 압축 모델 매핑             | **필수** |
| 6   | `packages/cli/src/ui/components/ModelDialog.tsx`       | preview 모델 필터링             | 조건부   |
| 7   | `packages/core/src/services/test-data/*.golden.json`   | config 해석 결과 스냅샷         | **필수** |

### Claude / OpenAI 모델 (1개 파일)

| #   | 파일 경로                                    | 역할                          | 필수     |
| --- | -------------------------------------------- | ----------------------------- | -------- |
| 1   | `packages/core/src/config/providerModels.ts` | `/model` UI 레지스트리 (SSOT) | **필수** |

> Claude/OpenAI 모델은 `providerModels.ts` 한 곳만 수정하면 됩니다. 프로바이더
> 어댑터가 모델 ID를 그대로 SDK에 전달하므로 별도 상수나 config가 불필요합니다.

---

## 2. Gemini 모델 추가

### 2-1. 모델 상수 등록

**파일**: `packages/core/src/config/models.ts`

#### (a) 상수 선언

파일 상단에 모델 ID 상수를 추가합니다:

```typescript
// 기존
export const PREVIEW_GEMINI_MODEL = 'gemini-3-pro-preview';

// 추가
export const PREVIEW_GEMINI_31_MODEL = 'gemini-3.1-pro-preview';
```

**네이밍 규칙**:

- GA 모델: `DEFAULT_GEMINI_*` (예: `DEFAULT_GEMINI_MODEL`)
- Preview 모델: `PREVIEW_GEMINI_*` (예: `PREVIEW_GEMINI_31_MODEL`)
- Flash 변형: `*_FLASH_MODEL` (예: `PREVIEW_GEMINI_FLASH_MODEL`)

#### (b) VALID_GEMINI_MODELS에 추가

```typescript
export const VALID_GEMINI_MODELS = new Set([
  PREVIEW_GEMINI_31_MODEL, // ← 추가
  PREVIEW_GEMINI_MODEL,
  // ...
]);
```

#### (c) 유틸 함수 업데이트

모델 특성에 따라 아래 함수들을 검토합니다:

| 함수                                   | 수정 조건                             | 설명                            |
| -------------------------------------- | ------------------------------------- | ------------------------------- |
| `isPreviewModel()`                     | Preview 모델인 경우                   | `model === NEW_CONST` 조건 추가 |
| `supportsMultimodalFunctionResponse()` | Gemini 3+ 모델인 경우                 | `startsWith` 패턴 확인          |
| `resolveModel()`                       | auto 프리셋을 추가하는 경우           | switch case 추가                |
| `resolveClassifierModel()`             | auto에서 pro/flash 분기가 필요한 경우 | 분기 추가                       |
| `getDisplayString()`                   | auto 프리셋 표시명이 필요한 경우      | switch case 추가                |
| `isAutoModel()`                        | auto 프리셋을 추가하는 경우           | 조건 추가                       |

**예시** — `isPreviewModel()`:

```typescript
export function isPreviewModel(model: string): boolean {
  return (
    model === PREVIEW_GEMINI_31_MODEL || // ← 추가
    model === PREVIEW_GEMINI_MODEL ||
    model === PREVIEW_GEMINI_FLASH_MODEL ||
    model === PREVIEW_GEMINI_MODEL_AUTO
  );
}
```

**예시** — `supportsMultimodalFunctionResponse()`:

```typescript
// gemini-3- 와 gemini-3. 두 패턴 모두 매칭 (3-pro, 3.1-pro)
export function supportsMultimodalFunctionResponse(model: string): boolean {
  return model.startsWith('gemini-3-') || model.startsWith('gemini-3.');
}
```

### 2-2. 프로바이더 레지스트리 등록

**파일**: `packages/core/src/config/providerModels.ts`

`PROVIDER_MODEL_REGISTRY.gemini.models` 배열에 모델을 추가합니다:

```typescript
models: [
  {
    id: 'gemini-3.1-pro-preview',
    description: 'Most capable, complex problem-solving (1M context)',
    category: 'general',
  },
  { id: 'gemini-3-pro-preview', category: 'general' },
  // ...
],
```

**필드 설명**:

| 필드          | 필수 | 설명                                     |
| ------------- | ---- | ---------------------------------------- |
| `id`          | O    | API 모델 ID (정확히 일치해야 함)         |
| `description` | -    | `/model` → Manual 화면에 표시되는 설명   |
| `displayName` | -    | UI 표시명 (생략 시 `id` 사용)            |
| `category`    | -    | `'general'` \| `'lite'` \| `'reasoning'` |
| `isDefault`   | -    | `true`면 프로바이더 기본 모델            |

**배열 순서**: 최신 모델을 위에 배치합니다 (UI 표시 순서 = 배열 순서).

**auto 프리셋 추가 시**: `presets` 배열에도 항목을 추가합니다:

```typescript
presets: [
  {
    value: 'auto-gemini-3.1',
    title: 'Auto (Gemini 3.1)',
    description: 'Let Didim CLI decide the best model: ...',
  },
  // ...
],
```

### 2-3. 모델 생성 파라미터 설정

**파일**: `packages/core/src/config/defaultModelConfigs.ts`

`aliases` 객체에 모델 config를 추가합니다:

```typescript
'gemini-3.1-pro-preview': {
  extends: 'chat-base-3',    // Gemini 3 계열 base config
  modelConfig: {
    model: 'gemini-3.1-pro-preview',
  },
},
```

**base config 선택 기준**:

| base config     | 적용 대상       | thinking 설정                       |
| --------------- | --------------- | ----------------------------------- |
| `chat-base-3`   | Gemini 3.x 계열 | `thinkingLevel: ThinkingLevel.HIGH` |
| `chat-base-2.5` | Gemini 2.5 계열 | `thinkingBudget: 8192`              |
| `chat-base`     | 공통 base       | thinking 미설정                     |

**compression config 추가** (같은 파일 하단):

```typescript
'chat-compression-3.1-pro': {
  modelConfig: {
    model: 'gemini-3.1-pro-preview',
  },
},
```

### 2-4. 토큰 한도 매핑

**파일**: `packages/core/src/core/tokenLimits.ts`

import에 상수를 추가하고, switch case에 매핑합니다:

```typescript
import {
  PREVIEW_GEMINI_31_MODEL, // ← 추가
  // ...
} from '../config/models.js';

export function tokenLimit(model: Model): TokenCount {
  switch (model) {
    case PREVIEW_GEMINI_31_MODEL: // ← 추가
    case PREVIEW_GEMINI_MODEL:
      // ...
      return 1_048_576; // 1M tokens
    default:
      return DEFAULT_TOKEN_LIMIT;
  }
}
```

### 2-5. 대화 압축 서비스 매핑

**파일**: `packages/core/src/services/chatCompressionService.ts`

import에 상수를 추가하고, `modelStringToModelConfigAlias()` 함수에 매핑합니다:

```typescript
import {
  PREVIEW_GEMINI_31_MODEL, // ← 추가
  // ...
} from '../config/models.js';

export function modelStringToModelConfigAlias(model: string): string {
  switch (model) {
    case PREVIEW_GEMINI_31_MODEL: // ← 추가
      return 'chat-compression-3.1-pro'; // 2-3에서 추가한 alias
    case PREVIEW_GEMINI_MODEL:
      return 'chat-compression-3-pro';
    // ...
  }
}
```

### 2-6. ModelDialog preview 필터 (Preview 모델만 해당)

**파일**: `packages/cli/src/ui/components/ModelDialog.tsx`

Preview 모델은 `shouldShowPreviewModels` 플래그에 의해 필터링됩니다. import와
필터 조건에 새 상수를 추가합니다:

```typescript
import {
  PREVIEW_GEMINI_31_MODEL, // ← 추가
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  // ...
} from '@didim365/agent-cli-core';

// manualOptions 필터링 (line ~118)
models = models.filter(
  (m) =>
    m.id !== PREVIEW_GEMINI_31_MODEL && // ← 추가
    m.id !== PREVIEW_GEMINI_MODEL &&
    m.id !== PREVIEW_GEMINI_FLASH_MODEL,
);
```

> GA 모델은 이 필터가 적용되지 않으므로 수정 불필요합니다.

### 2-7. Golden 파일 재생성

`defaultModelConfigs.ts`를 수정하면 golden snapshot이 불일치합니다:

```bash
# golden 파일 재생성
UPDATE_GOLDENS=true npm test -w @didim365/agent-cli-core -- \
  src/services/modelConfig.golden.test

# 재생성 확인
npm test -w @didim365/agent-cli-core -- \
  src/services/modelConfig.golden.test
```

---

## 3. Claude 모델 추가

**수정 파일 1개**: `packages/core/src/config/providerModels.ts`

`PROVIDER_MODEL_REGISTRY.claude.models` 배열에 추가합니다:

```typescript
claude: {
  providerKey: 'claude',
  presets: [
    {
      value: 'claude-opus-4-6',
      title: 'Recommended (claude-opus-4-6)',
      description: 'Most intelligent model for building agents and coding',
    },
  ],
  models: [
    {
      id: 'claude-new-model-id',          // ← 추가
      description: '모델 설명',
    },
    {
      id: 'claude-opus-4-6',
      description: 'Most intelligent, agents & coding',
      isDefault: true,
    },
    // ...
  ],
},
```

**기본 모델 변경 시**: 기존 `isDefault: true`를 제거하고 새 모델에 부여합니다.

**presets 변경 시**: `presets[0].value`와 `title`을 업데이트합니다.

---

## 4. OpenAI 모델 추가

**수정 파일 1개**: `packages/core/src/config/providerModels.ts`

`PROVIDER_MODEL_REGISTRY.openai.models` 배열에 추가합니다:

```typescript
openai: {
  providerKey: 'openai',
  presets: [
    {
      value: 'gpt-5.2',
      title: 'Recommended (gpt-5.2)',
      description: 'Flagship reasoning model with 400K context',
    },
  ],
  models: [
    {
      id: 'new-openai-model',             // ← 추가
      description: '모델 설명',
      category: 'general',                // 또는 'reasoning'
    },
    {
      id: 'gpt-5.2',
      description: 'Flagship reasoning model, 400K context',
      isDefault: true,
    },
    // ...
  ],
},
```

> **OpenAI-compatible (sLM)**: 레지스트리 수정 불필요.
> `freeformInput: true`이므로 사용자가 어떤 모델명이든 직접 입력 가능합니다.

---

## 5. 검증 절차

### 5-1. Core 빌드 (CLI가 dist를 참조하므로 필수)

```bash
npm run build -w @didim365/agent-cli-core
```

### 5-2. 타입체크

```bash
npm run typecheck
```

### 5-3. 단위 테스트

```bash
# 모델 관련 테스트
npm test -w @didim365/agent-cli-core -- src/config/models.test
npm test -w @didim365/agent-cli-core -- src/config/providerModels.test
npm test -w @didim365/agent-cli-core -- src/providers/providerSelector.test
npm test -w @didim365/agent-cli-core -- src/services/chatCompressionService.test
npm test -w @didim365/agent-cli-core -- src/services/modelConfig.golden.test

# 전체 core 테스트 (회귀 확인)
npm test -w @didim365/agent-cli-core
```

### 5-4. 린트

```bash
npm run lint
```

### 5-5. 실행 확인

```bash
# 모델 지정 실행
didim -m gemini-3.1-pro-preview

# /model 다이얼로그에서 확인
didim
> /model
```

---

## 6. 문서 업데이트

모델 추가 후 아래 문서의 모델 목록도 업데이트합니다:

| 문서                   | 위치                          | 내용                     |
| ---------------------- | ----------------------------- | ------------------------ |
| `docs/index.md`        | 지원 프로바이더 테이블        | 모델명 목록              |
| `docs/providers.md`    | Model Resolution Rules 테이블 | 기본 모델, `/model` 목록 |
| `docs/short_manual.md` | 실행 섹션 예시                | `didim -m` 예시          |
| `README.md`            | 지원 프로바이더 테이블        | 모델명 목록              |

---

## 7. 실제 사례: Gemini 3.1 Pro 추가

2026-02-20 `gemini-3.1-pro-preview` 추가 시 수정한 파일과 변경 내용입니다.

### 변경 파일 목록

| #   | 파일                                          | 변경 내용                                                                                                                                                            |
| --- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `core/src/config/models.ts`                   | `PREVIEW_GEMINI_31_MODEL` 상수 추가, `VALID_GEMINI_MODELS` 추가, `isPreviewModel()` 조건 추가, `supportsMultimodalFunctionResponse()` 패턴 추가 (`gemini-3.` prefix) |
| 2   | `core/src/config/providerModels.ts`           | `gemini.models[]` 최상단에 `gemini-3.1-pro-preview` 항목 추가                                                                                                        |
| 3   | `core/src/config/defaultModelConfigs.ts`      | `gemini-3.1-pro-preview` alias (extends `chat-base-3`) + `chat-compression-3.1-pro` alias 추가                                                                       |
| 4   | `core/src/core/tokenLimits.ts`                | import 추가 + switch case에 `PREVIEW_GEMINI_31_MODEL` → 1M tokens 매핑                                                                                               |
| 5   | `core/src/services/chatCompressionService.ts` | import 추가 + `modelStringToModelConfigAlias()` switch case 추가                                                                                                     |
| 6   | `cli/src/ui/components/ModelDialog.tsx`       | import 추가 + preview 필터에 `PREVIEW_GEMINI_31_MODEL` 조건 추가                                                                                                     |
| 7   | `core/src/services/test-data/*.golden.json`   | `UPDATE_GOLDENS=true` 로 재생성                                                                                                                                      |

### 수정하지 않은 항목 (근거)

| 항목                       | 이유                                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| `resolveModel()`           | auto 프리셋 미추가 (flash 변형 없어 auto 분기 불필요)                    |
| `resolveClassifierModel()` | auto 분기 없으므로 classifier 라우팅 불필요                              |
| `getDisplayString()`       | auto 프리셋 미추가                                                       |
| `isAutoModel()`            | auto 프리셋 미추가                                                       |
| `providerSelector.ts`      | `isGeminiSpecificModel()`이 `startsWith('gemini-')` 패턴이므로 자동 매칭 |

---

## 체크리스트

```
[ ] 1. 모델 ID 확인 (공식 API 문서에서 정확한 문자열 확인)
[ ] 2. models.ts — 상수 + VALID 목록 + 유틸 함수
[ ] 3. providerModels.ts — 레지스트리 등록
[ ] 4. defaultModelConfigs.ts — 모델 config + compression config
[ ] 5. tokenLimits.ts — 토큰 한도 매핑
[ ] 6. chatCompressionService.ts — 압축 모델 매핑
[ ] 7. ModelDialog.tsx — preview 필터 (preview 모델만)
[ ] 8. golden 파일 재생성
[ ] 9. core 빌드 → 타입체크 → 테스트 → 린트
[ ] 10. 문서 업데이트
```
