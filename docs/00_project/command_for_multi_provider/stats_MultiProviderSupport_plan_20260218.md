# /stats 명령어 멀티 프로바이더 대응 수정방안

> 작성일: 2026-02-18

## 1. 현황 분석

### 1.1 Stats 명령어 구조

```
/stats [session|model|tools]
```

| 서브커맨드       | 뷰 컴포넌트             | 표시 내용                                   |
| ---------------- | ----------------------- | ------------------------------------------- |
| `session` (기본) | `StatsDisplay.tsx`      | 세션 요약, 성능, 모델별 사용량 테이블, 쿼타 |
| `model`          | `ModelStatsDisplay.tsx` | 모델별 상세 (API 호출/에러/지연, 토큰 상세) |
| `tools`          | `ToolStatsDisplay.tsx`  | 도구별 호출 통계                            |

### 1.2 데이터 파이프라인

```
LlmEvent(스트림) → telemetryBridge → UiTelemetryService → SessionMetrics → UI 컴포넌트
```

- **`UiTelemetryService`** (`packages/core/src/telemetry/uiTelemetry.ts`)
  - `SessionMetrics.models`: `Record<string, ModelMetrics>` — 모델명 문자열 키
  - `ModelMetrics.api`: `{ totalRequests, totalErrors, totalLatencyMs }`
  - `ModelMetrics.tokens`:
    `{ input, prompt, candidates, total, cached, thoughts, tool }`
  - **이미 프로바이더 무관 구조** — 모델명만으로 메트릭 집계

### 1.3 Gemini 종속 코드 (수정 대상)

| 파일                    | 위치      | 문제                                 | 상세                                |
| ----------------------- | --------- | ------------------------------------ | ----------------------------------- |
| `StatsDisplay.tsx`      | Line 27   | `VALID_GEMINI_MODELS` import         | Gemini 모델 목록으로 쿼타 행 필터링 |
| `StatsDisplay.tsx`      | Line 107  | `VALID_GEMINI_MODELS.has(b.modelId)` | 쿼타 전용 모델을 Gemini 모델만 허용 |
| `StatsDisplay.tsx`      | 쿼타 섹션 | `refreshUserQuota()`                 | Gemini 전용 쿼타 API 호출           |
| `StatsDisplay.tsx`      | 쿼타 표시 | `remainingFraction`, `resetTime`     | Gemini 쿼타 형식에 종속             |
| `ModelStatsDisplay.tsx` | 전체      | 프로바이더 그룹 없음                 | 모든 모델이 플랫 리스트로 표시      |

### 1.4 프로바이더별 차이점

| 항목                | Gemini               | Claude                | OpenAI           |
| ------------------- | -------------------- | --------------------- | ---------------- |
| 쿼타 API            | `refreshUserQuota()` | 없음 (헤더 기반)      | 없음 (헤더 기반) |
| cachedTokens        | O                    | O                     | O                |
| cacheCreationTokens | X                    | O                     | X                |
| thoughtTokens       | O (주로)             | O (extended thinking) | O (reasoning)    |
| toolTokens          | O                    | X                     | X                |
| 요금 체계           | RPM/RPD/TPM          | RPM/TPM (헤더)        | RPM/TPM (헤더)   |

---

## 2. 수정 범위

### 2.1 수정 파일 목록

| 파일                                                   | 수정 유형 | 영향도 |
| ------------------------------------------------------ | --------- | ------ |
| `packages/core/src/telemetry/uiTelemetry.ts`           | 확장      | 중     |
| `packages/cli/src/ui/components/StatsDisplay.tsx`      | 리팩터    | 고     |
| `packages/cli/src/ui/components/ModelStatsDisplay.tsx` | 확장      | 중     |
| `packages/cli/src/ui/commands/statsCommand.ts`         | 소폭 수정 | 저     |
| `packages/core/src/providers/providerTypes.ts`         | 타입 추가 | 저     |

### 2.2 수정하지 않는 파일

- `UiTelemetryService.processApiResponse()` — 이미 프로바이더 무관
- `telemetryBridge` — LlmEvent → telemetry 변환 로직은 그대로 유지
- `ToolStatsDisplay.tsx` — 도구 통계는 프로바이더 무관

---

## 3. 수정 상세

### 3.1 텔레메트리 레이어 확장

#### 3.1.1 ModelMetrics에 provider 필드 추가

**파일**: `packages/core/src/telemetry/uiTelemetry.ts`

```typescript
// Before
export interface ModelMetrics {
  api: { totalRequests: number; totalErrors: number; totalLatencyMs: number };
  tokens: {
    input: number;
    prompt: number;
    candidates: number;
    total: number;
    cached: number;
    thoughts: number;
    tool: number;
  };
}

// After
export interface ModelMetrics {
  provider: string; // 'gemini' | 'claude' | 'openai' | string
  api: { totalRequests: number; totalErrors: number; totalLatencyMs: number };
  tokens: {
    input: number;
    prompt: number;
    candidates: number;
    total: number;
    cached: number;
    cacheCreation: number; // 신규: Claude cache_creation_input_tokens
    thoughts: number;
    tool: number;
  };
}
```

#### 3.1.2 provider 정보 전달 경로

```
ContentGenerator.providerName → LlmEvent metadata → telemetryBridge → processApiResponse() → ModelMetrics.provider
```

- `processApiResponse()`에서 모델명으로부터 프로바이더를 추론하는 유틸리티 함수
  추가
- 또는 `LlmTokenUsage`에 이미 존재하는 데이터와 함께 `providerName` 전달

```typescript
// 모델명 → 프로바이더 추론 유틸리티
function inferProvider(modelName: string): string {
  if (
    modelName.startsWith('gemini-') ||
    ['auto', 'pro', 'flash', 'flash-lite'].includes(modelName)
  )
    return 'gemini';
  if (modelName.startsWith('claude-')) return 'claude';
  if (
    modelName.startsWith('gpt-') ||
    modelName.startsWith('o1') ||
    modelName.startsWith('o3') ||
    modelName.startsWith('o4')
  )
    return 'openai';
  return 'unknown';
}
```

#### 3.1.3 SessionMetrics에 프로바이더별 집계 추가

```typescript
export interface SessionMetrics {
  models: Record<string, ModelMetrics>;
  // 신규: 프로바이더별 요약
  providerSummary: Record<string, ProviderSummary>;
  tools: { ... };
  files: { ... };
}

export interface ProviderSummary {
  totalRequests: number;
  totalErrors: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  modelCount: number;
}
```

---

### 3.2 StatsDisplay.tsx 리팩터 (Session 뷰)

#### 3.2.1 VALID_GEMINI_MODELS 의존 제거

```typescript
// Before (line 27)
import { VALID_GEMINI_MODELS } from '../../geminiModels.js';

// After — 제거
// 쿼타 행 필터는 프로바이더별 쿼타 시스템으로 대체
```

#### 3.2.2 모델 사용량 테이블에 프로바이더 컬럼 추가

**현재**:

```
Model         | Requests | Input | Output | Total
gemini-2.5-pro|    12    | 50K   | 3K     | 53K
```

**변경 후**:

```
Provider | Model            | Requests | Input | Output | Cached | Total
─────────┼──────────────────┼──────────┼───────┼────────┼────────┼──────
Gemini   | gemini-2.5-pro   |    12    | 50K   | 3K     | 10K    | 53K
         | gemini-2.5-flash |     5    | 20K   | 1K     |  5K    | 21K
─────────┼──────────────────┼──────────┼───────┼────────┼────────┼──────
Claude   | claude-sonnet-4  |     8    | 30K   | 2K     |  8K    | 32K
─────────┼──────────────────┼──────────┼───────┼────────┼────────┼──────
OpenAI   | gpt-5.2          |     3    | 15K   | 1K     |   -    | 16K
```

- 프로바이더별 그룹핑 (동일 프로바이더는 첫 행에만 표시)
- 프로바이더별 소계 행 추가 (선택적)

#### 3.2.3 쿼타 표시 프로바이더 분기

```typescript
// Before — Gemini 전용
const quota = await config.refreshUserQuota();

// After — 프로바이더별 쿼타 표시
// Phase 1: 현재 활성 프로바이더의 쿼타만 표시
// Phase 2: 모든 사용된 프로바이더의 쿼타 표시

// Gemini: 기존 refreshUserQuota() 유지
// Claude: rate-limit 헤더 기반 표시 (x-ratelimit-limit-requests 등)
// OpenAI: rate-limit 헤더 기반 표시 (x-ratelimit-remaining-requests 등)
```

**쿼타 표시 통합 인터페이스**:

```typescript
interface ProviderQuota {
  provider: string;
  quotaType: 'api' | 'header'; // Gemini=api, Claude/OpenAI=header
  limits?: {
    requestsPerMinute?: number;
    tokensPerMinute?: number;
    requestsPerDay?: number;
  };
  remaining?: {
    requests?: number;
    tokens?: number;
    resetTime?: Date;
  };
}
```

---

### 3.3 ModelStatsDisplay.tsx 확장 (Model 뷰)

#### 3.3.1 프로바이더 그룹핑

```
══════════════════════════════════════
  Model Stats — Gemini
══════════════════════════════════════
         │ gemini-2.5-pro │ gemini-2.5-flash
─────────┼────────────────┼──────────────────
API      │                │
 Requests│      12        │        5
 Errors  │       0        │        0
 Avg Lat │     1.2s       │      0.8s
─────────┼────────────────┼──────────────────
Tokens   │                │
 Total   │     53K        │       21K
 ...     │                │

══════════════════════════════════════
  Model Stats — Claude
══════════════════════════════════════
         │ claude-sonnet-4
─────────┼─────────────────
 ...     │
```

#### 3.3.2 프로바이더별 고유 토큰 행 표시

| 토큰 행        | Gemini | Claude | OpenAI |
| -------------- | ------ | ------ | ------ |
| Cache Reads    | 조건부 | 조건부 | 조건부 |
| Cache Creation | 숨김   | 조건부 | 숨김   |
| Thoughts       | 조건부 | 조건부 | 조건부 |
| Tool Use       | 조건부 | 숨김   | 숨김   |

- `cacheCreation > 0`인 경우에만 Cache Creation 행 표시 (Claude 전용)
- 기존 조건부 표시 로직 유지: `thoughts > 0`일 때만 Thoughts 행 등

---

### 3.4 statsCommand.ts 소폭 수정

```typescript
// 현재 session 뷰에서 quota 조회 시 프로바이더 확인 추가
// config.refreshUserQuota()를 현재 프로바이더에 따라 분기

// 옵션적: --provider 필터 플래그 추가
// /stats session --provider claude  → Claude 모델만 표시
```

---

## 4. 구현 우선순위

### Phase 1: 프로바이더 인식 기반 구축 (필수)

| 순서 | 작업                                     | 파일                            |
| ---- | ---------------------------------------- | ------------------------------- |
| 1    | `ModelMetrics.provider` 필드 추가        | `uiTelemetry.ts`                |
| 2    | `inferProvider()` 유틸리티 구현          | `uiTelemetry.ts` 또는 별도 유틸 |
| 3    | `processApiResponse()`에서 provider 설정 | `uiTelemetry.ts`                |
| 4    | `VALID_GEMINI_MODELS` 의존 제거          | `StatsDisplay.tsx`              |
| 5    | 모델 테이블에 Provider 컬럼 추가         | `StatsDisplay.tsx`              |
| 6    | 프로바이더별 그룹핑 적용                 | `ModelStatsDisplay.tsx`         |

### Phase 2: 토큰 상세 확장 (권장)

| 순서 | 작업                                     | 파일                                 |
| ---- | ---------------------------------------- | ------------------------------------ |
| 7    | `cacheCreation` 토큰 필드 추가           | `uiTelemetry.ts`                     |
| 8    | `telemetryBridge`에서 cacheCreation 전달 | `telemetryBridge.ts`                 |
| 9    | 프로바이더별 조건부 토큰 행 표시         | `ModelStatsDisplay.tsx`              |
| 10   | `ProviderSummary` 집계 추가              | `uiTelemetry.ts`, `StatsDisplay.tsx` |

### Phase 3: 쿼타 통합 (선택)

| 순서 | 작업                               | 파일               |
| ---- | ---------------------------------- | ------------------ |
| 11   | `ProviderQuota` 인터페이스 정의    | `providerTypes.ts` |
| 12   | Claude/OpenAI rate-limit 헤더 수집 | 각 adapter         |
| 13   | 쿼타 표시를 프로바이더별 분기      | `StatsDisplay.tsx` |

### Phase 4: 부가 기능 (선택)

| 순서 | 작업                                 | 파일               |
| ---- | ------------------------------------ | ------------------ |
| 14   | `/stats --provider` 필터 플래그      | `statsCommand.ts`  |
| 15   | 비용 추정 표시 (프로바이더별 가격표) | 신규 파일          |
| 16   | 프로바이더별 소계 행                 | `StatsDisplay.tsx` |

---

## 5. 비용 추정 기능 (참고)

> Phase 4의 선택 기능으로, 프로바이더별 토큰 단가를 기반으로 세션 비용을 추정
> 표시

```typescript
interface ProviderPricing {
  provider: string;
  models: Record<
    string,
    {
      inputPerMToken: number; // USD per 1M input tokens
      outputPerMToken: number; // USD per 1M output tokens
      cachedPerMToken?: number; // USD per 1M cached tokens
    }
  >;
}
```

- 가격 정보는 정적 테이블로 관리 (주기적 업데이트 필요)
- 표시 형식: `Estimated Cost: $0.12 (Gemini $0.05 + Claude $0.07)`

---

## 6. 호환성 고려사항

| 항목                              | 대응 방안                                              |
| --------------------------------- | ------------------------------------------------------ |
| `provider` 필드 미설정 시         | `inferProvider()` 폴백으로 모델명 기반 추론            |
| 단일 프로바이더(Gemini만) 사용 시 | 기존과 동일한 UX 유지 (프로바이더 그룹 헤더 생략 가능) |
| 쿼타 API 없는 프로바이더          | "쿼타 정보 없음" 표시 또는 해당 섹션 숨김              |
| `cacheCreation` 미지원 프로바이더 | 0으로 초기화, 조건부 행 표시로 자동 숨김               |
| 기존 테스트 호환                  | `provider` 필드에 기본값 `'unknown'` 설정              |

---

## 7. 결론

현재 `/stats` 명령어의 텔레메트리 파이프라인(`UiTelemetryService`,
`SessionMetrics`)은 **이미 프로바이더 무관 구조**로 설계되어 있어 데이터 수집
레이어의 변경은 최소한이다. 주요 수정은 **UI 레이어**(StatsDisplay,
ModelStatsDisplay)에 집중되며, 핵심은:

1. `VALID_GEMINI_MODELS` 의존 제거
2. `ModelMetrics.provider` 필드 추가 및 프로바이더별 그룹핑
3. 프로바이더별 고유 토큰 항목(cacheCreation 등) 조건부 표시

Phase 1만 완료해도 멀티 프로바이더 환경에서 의미 있는 통계 표시가 가능하며,
Phase 2~4는 점진적으로 추가할 수 있다.
