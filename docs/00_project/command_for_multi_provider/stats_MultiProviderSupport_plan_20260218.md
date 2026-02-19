# /stats 명령어 멀티 프로바이더 대응 수정방안

> 작성일: 2026-02-18 수정일: 2026-02-18 (리뷰 반영 v3)

## 0. 리뷰 반영 요약

### v2 리뷰 반영 (1차)

| #   | 심각도 | 이슈                                     | 검증 결과                                                                                                           | 반영 내용                                                 |
| --- | ------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1   | HIGH   | Non-Gemini 통계 미수집                   | **확인됨** — `llmLoggingStreamWrapper`가 `logApiResponse`/`logApiError` 미호출                                      | Phase 0 (선행작업) 신설                                   |
| 2   | HIGH   | provider 전달 경로 불일치                | **확인됨** — `ApiResponseEvent`에 provider 필드 없음, `ProviderApiResponseEvent` 존재하나 UiTelemetryService 미연결 | Phase 0에서 UiEvent 타입 확장                             |
| 3   | HIGH   | cacheCreation 파이프라인 단절            | **확인됨** — `TelemetryUsageMetadata`, `GenAIUsageDetails`, `telemetryBridge` 모두 누락                             | Phase 2에서 전 구간 수정 명시                             |
| 4   | MEDIUM | 문서 내부 충돌 (수정 안 함 vs 수정 필요) | **확인됨** — §2.2와 §4 Phase 2 모순                                                                                 | §2 전면 재작성                                            |
| 5   | MEDIUM | Claude/OpenAI quota 구현 불가            | **확인됨** — adapter가 헤더 미노출                                                                                  | Phase 3 선행조건 명시                                     |
| 6   | MEDIUM | inferProvider 프로바이더 누락            | **확인됨** — `openai-compatible`, `didim` 미대응                                                                    | `inferProvider` 제거 → 명시적 provider 전달 방식으로 변경 |
| 7   | MEDIUM | 모델 키 충돌 (freeform)                  | **확인됨** — `Record<string, ModelMetrics>` 단일 키                                                                 | 복합 키 `{provider}:{model}` 도입                         |
| 8   | MEDIUM | SessionContext equality 누락             | **확인됨** — `areModelMetricsEqual()` 고정 필드 비교                                                                | Phase 1 필수 수정 항목 추가                               |
| 9   | LOW    | ProviderQuota export 경로 미정           | **확인됨** — `providerTypes.ts` core index 미노출, `HistoryItemStats.quotas` 타입 불일치                            | Phase 3 수정 범위에 반영                                  |

### v3 리뷰 반영 (2차)

| #    | 심각도 | 이슈                                                                                | 검증 결과                                                                                                                                                         | 반영 내용                                                              |
| ---- | ------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| v3-2 | HIGH   | Error 이벤트가 yield되므로 catch 미도달 → 에러 텔레메트리 누락                      | **확인됨** — adapter는 `catch` 내에서 `yield createErrorEvent()` (throw 아님). 스트림 루프를 정상 통과하므로 `catch` 블록 미도달                                  | §3.0.1 스트림 루프 내 Error 이벤트 감지 시 `_logLlmApiError` 호출 추가 |
| v3-3 | HIGH   | usage 없는 정상 응답의 요청 집계 누락                                               | **확인됨** — `if (!isError && lastUsage)` 조건이면 usage 미포함 정상 응답은 카운트 자체가 누락됨                                                                  | §3.0.1 조건을 `if (!isError)`로 변경, usage 없으면 빈 usage 사용       |
| v3-4 | MEDIUM | `_logLlmApiResponse`가 `uiTelemetryService.addEvent` 직접 호출 → OTEL/Clearcut 우회 | **확인됨** — `logApiResponse()`는 uiTelemetry + ClearcutLogger + OTEL 3개 경로 처리. `ProviderApiResponseEvent`에 `toLogRecord`/`toSemanticLogRecord` 메서드 없음 | §3.0.2 `logProviderApiResponse()` 신규 함수로 전 경로 통합             |
| v3-5 | MEDIUM | 복합 키 구분자 `:` 가 freeform 모델명과 충돌 가능                                   | **확인됨** — `openai-compatible`은 `freeformInput: true`. 모델명에 `:` 포함 가능 (예: `org:model-v1`)                                                             | §3.1.2 구분자를 `\x00` (NULL)로 변경 + 표시용 변환 규칙 명시           |
| v3-6 | MEDIUM | `providerQuotas` 타입 추가해도 렌더 경로 미전달                                     | **확인됨** — `HistoryItemDisplay.tsx:122`에서 `quotas`만 전달, `StatsDisplayProps`에 `providerQuotas` 없음                                                        | §3.3 렌더 경로 전체 수정 범위 명시                                     |

---

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
[Gemini 경로]
  generateContentStream() → loggingStreamWrapper() → logApiResponse() → uiTelemetryService.addEvent() → SessionMetrics

[Non-Gemini 경로] ⚠️ 현재 단절
  llmGenerateContentStream() → llmLoggingStreamWrapper() → debugLogger만 호출 → ❌ logApiResponse 미호출
```

**핵심 문제**: Non-Gemini 경로의
`LoggingContentGenerator.llmLoggingStreamWrapper()` (line 473)는
`debugLogger.debug()`만 호출하고 `logApiResponse()`/`logApiError()`를 호출하지
않는다. UI 통계 적재는 `loggers.ts:255` (`logApiResponse`) →
`uiTelemetryService.addEvent()` 경로를 통해서만 이루어지므로, **Non-Gemini
프로바이더의 /stats가 비어 보이는 근본 원인**이다.

- **`UiTelemetryService`** (`packages/core/src/telemetry/uiTelemetry.ts`)
  - `UiEvent` 타입: `ApiResponseEvent & { 'event.name': ... }` —
    `ProviderApiResponseEvent` 미포함
  - `processApiResponse()` (line 164): `ApiResponseEvent` 기반 → provider 필드
    접근 불가
  - `SessionMetrics.models`: `Record<string, ModelMetrics>` — 모델명 단일 키
    (충돌 위험)
  - `ModelMetrics.tokens`: `cacheCreation` 필드 없음

### 1.3 Gemini 종속 코드 (수정 대상)

| 파일                    | 위치      | 문제                                 | 상세                                |
| ----------------------- | --------- | ------------------------------------ | ----------------------------------- |
| `StatsDisplay.tsx`      | Line 27   | `VALID_GEMINI_MODELS` import         | Gemini 모델 목록으로 쿼타 행 필터링 |
| `StatsDisplay.tsx`      | Line 107  | `VALID_GEMINI_MODELS.has(b.modelId)` | 쿼타 전용 모델을 Gemini 모델만 허용 |
| `StatsDisplay.tsx`      | 쿼타 섹션 | `refreshUserQuota()`                 | Gemini 전용 쿼타 API 호출           |
| `StatsDisplay.tsx`      | 쿼타 표시 | `remainingFraction`, `resetTime`     | Gemini 쿼타 형식에 종속             |
| `ModelStatsDisplay.tsx` | 전체      | 프로바이더 그룹 없음                 | 모든 모델이 플랫 리스트로 표시      |

### 1.4 텔레메트리 파이프라인 단절 지점

| 레이어      | 파일                             | 문제                                                      |
| ----------- | -------------------------------- | --------------------------------------------------------- |
| 로깅        | `loggingContentGenerator.ts:473` | `llmLoggingStreamWrapper`가 `logApiResponse` 미호출       |
| 이벤트 타입 | `telemetry/types.ts:605`         | `ApiResponseEvent`에 `provider` 필드 없음                 |
| UI 이벤트   | `uiTelemetry.ts:22`              | `UiEvent`가 `ProviderApiResponseEvent` 미포함             |
| 사용량 변환 | `telemetry/types.ts:19`          | `TelemetryUsageMetadata`에 `cacheCreationTokenCount` 없음 |
| 사용량 집계 | `telemetry/types.ts:569`         | `GenAIUsageDetails`에 `cache_creation_token_count` 없음   |
| 브릿지 매핑 | `telemetryBridge.ts:30`          | `llmTokenUsageToGenAIUsage()`에 `cacheCreation` 매핑 없음 |

### 1.5 프로바이더별 차이점

| 항목                | Gemini               | Claude                | OpenAI             | OpenAI-Compatible        | Didim         |
| ------------------- | -------------------- | --------------------- | ------------------ | ------------------------ | ------------- |
| 쿼타 API            | `refreshUserQuota()` | 없음 (헤더 기반)      | 없음 (헤더 기반)   | 없음                     | 없음          |
| cachedTokens        | O                    | O                     | O                  | 가변                     | 가변          |
| cacheCreationTokens | X                    | O                     | X                  | X                        | X             |
| thoughtTokens       | O (주로)             | O (extended thinking) | O (reasoning)      | 가변                     | 가변          |
| toolTokens          | O                    | X                     | X                  | X                        | X             |
| 요금 체계           | RPM/RPD/TPM          | RPM/TPM (헤더)        | RPM/TPM (헤더)     | 불명                     | 불명          |
| 모델명 패턴         | `gemini-*`           | `claude-*`            | `gpt-*`, `o[1-4]*` | **자유 입력** (freeform) | 시나리오 기반 |

### 1.6 기존 ProviderApiResponseEvent 활용 가능성

`telemetryBridge.ts`에 이미 `ProviderApiResponseEvent` 클래스가 존재한다 (line
77):

- `provider: string` 필드 포함
- `usage: GenAIUsageDetails` (변환 후)
- `'event.name' = 'api_response'` — 이벤트 이름은 `ApiResponseEvent`와 동일

**결론**: 신규 이벤트 타입 생성 불필요. `UiEvent` 타입을 확장하여
`ProviderApiResponseEvent`를 수용하면 된다.

---

## 2. 수정 범위

### 2.1 수정 파일 목록

| 파일                                      | Phase | 수정 유형     | 영향도 | 수정 내용                                                  |
| ----------------------------------------- | ----- | ------------- | ------ | ---------------------------------------------------------- |
| `core/loggingContentGenerator.ts`         | 0     | **수정**      | 고     | `llmLoggingStreamWrapper`에 텔레메트리 로깅 추가           |
| `core/telemetry/uiTelemetry.ts`           | 0,1   | **확장**      | 고     | `UiEvent` 타입 확장, `ModelMetrics.provider` 추가, 복합 키 |
| `core/telemetry/types.ts`                 | 2     | **확장**      | 중     | `GenAIUsageDetails.cache_creation_token_count` 추가        |
| `core/providers/telemetryBridge.ts`       | 2     | **수정**      | 중     | `cacheCreation` 매핑 추가                                  |
| `cli/ui/components/StatsDisplay.tsx`      | 1     | **리팩터**    | 고     | VALID_GEMINI_MODELS 제거, 프로바이더 그룹핑                |
| `cli/ui/components/ModelStatsDisplay.tsx` | 1,2   | **확장**      | 중     | 프로바이더 그룹핑, cacheCreation 행                        |
| `cli/ui/contexts/SessionContext.tsx`      | 1     | **수정**      | 중     | `areModelMetricsEqual()` 확장                              |
| `cli/ui/commands/statsCommand.ts`         | 3     | **소폭 수정** | 저     | 쿼타 프로바이더 분기                                       |
| `cli/ui/types.ts`                         | 3     | **수정**      | 저     | `HistoryItemStats.quotas` 타입 확장                        |
| `core/providers/claude/adapter.ts`        | 3     | **수정**      | 중     | rate-limit 헤더 수집                                       |
| `core/providers/openai/adapter.ts`        | 3     | **수정**      | 중     | rate-limit 헤더 수집                                       |

### 2.2 수정하지 않는 파일

- `ToolStatsDisplay.tsx` — 도구 통계는 프로바이더 무관
- `telemetry/loggers.ts` — `logApiResponse()`/`logApiError()` 시그니처 변경 없음
  (UiEvent spread 호환)

---

## 3. 수정 상세

### 3.0 Phase 0: Non-Gemini 텔레메트리 수집 경로 구축 (선행 필수)

> **목적**: Non-Gemini 프로바이더의 API 호출이 `/stats`에 반영되도록 텔레메트리
> 로깅 추가 **없으면**: Phase 1~4의 모든 UI 변경이 무의미 (데이터가 비어있음)

#### 3.0.1 LoggingContentGenerator.llmLoggingStreamWrapper 텔레메트리 추가

**파일**: `packages/core/src/core/loggingContentGenerator.ts`

**현재** (line 473-494):

```typescript
private async *llmLoggingStreamWrapper(
  stream: LlmEventStream, model: string, userPromptId: string,
): LlmEventStream {
  const startTime = Date.now();
  try {
    for await (const event of stream) {
      yield event;
    }
    debugLogger.debug(`[LLM] generateContentStream completed`);
  } catch (error) {
    debugLogger.debug(`[LLM] generateContentStream error`);
    throw error;
  }
}
```

**변경 후**:

> **v3 수정 포인트 (이슈 v3-2, v3-3)**:
>
> - adapter는 에러 시 throw하지 않고 `yield createErrorEvent()`로 Error 이벤트를
>   발행한다 (`openai/adapter.ts:162-168`, `claude/adapter.ts:154-161`). 따라서
>   `catch` 블록은 네트워크 레벨 예외에만 도달하고, adapter 에러는 `for await`
>   루프 내에서 정상 이벤트로 수신된다.
> - usage가 없는 정상 응답도 API 호출 자체는 발생했으므로 요청 카운트에 포함해야
>   한다.

```typescript
private async *llmLoggingStreamWrapper(
  stream: LlmEventStream, model: string, userPromptId: string,
): LlmEventStream {
  const startTime = Date.now();
  let lastUsage: LlmTokenUsage | undefined;
  let errorEvent: LlmEvent | undefined;
  try {
    for await (const event of stream) {
      // MessageEnd 이벤트에서 usage 수집
      if (event.type === LlmEventType.MessageEnd && event.usage) {
        lastUsage = event.usage;
      }
      // Error 이벤트 감지 (adapter는 throw 대신 yield하므로 여기서 캡처)
      if (event.type === LlmEventType.Error) {
        errorEvent = event;
      }
      yield event;
    }
    const durationMs = Date.now() - startTime;
    if (errorEvent) {
      // adapter가 yield한 Error 이벤트 → 에러 텔레메트리 기록
      this._logLlmApiError(model, durationMs, userPromptId, errorEvent);
    } else {
      // 정상 응답 — usage 없어도 요청 카운트 기록 (빈 usage 사용)
      const usage = lastUsage ?? {
        promptTokens: 0, completionTokens: 0, totalTokens: 0,
      };
      this._logLlmApiResponse(model, durationMs, userPromptId, usage);
    }
  } catch (error) {
    // 네트워크 레벨 예외 (adapter yield 이전에 발생하는 예외)
    const durationMs = Date.now() - startTime;
    this._logLlmApiError(model, durationMs, userPromptId, error);
    throw error;
  }
}
```

#### 3.0.2 텔레메트리 로깅 함수

> **v3 수정 포인트 (이슈 v3-4)**: v2에서 `uiTelemetryService.addEvent()`를 직접
> 호출하면 기존 `logApiResponse()` 경로의 ClearcutLogger와 OTEL log/metrics가
> 우회된다. `ProviderApiResponseEvent`에는
> `toLogRecord()`/`toSemanticLogRecord()` 메서드가 없어 기존
> `logApiResponse(config, event)` 호출이 불가하므로, Non-Gemini 전용
> `logProviderApiResponse()` 함수를 `loggers.ts`에 신설한다.

**방법 A (권장): `loggers.ts`에 `logProviderApiResponse()` 신설**

**파일**: `packages/core/src/telemetry/loggers.ts`

```typescript
import type {
  ProviderApiResponseEvent,
  ProviderApiErrorEvent,
} from '../providers/telemetryBridge.js';

/**
 * Non-Gemini 프로바이더용 API 응답 텔레메트리 로깅.
 * 기존 logApiResponse()와 동일한 3개 경로를 모두 처리한다:
 * 1. uiTelemetryService (UI 통계)
 * 2. ClearcutLogger (로그 수집)
 * 3. OTEL log + metrics (관측성)
 */
export function logProviderApiResponse(
  config: Config,
  event: ProviderApiResponseEvent,
): void {
  // 1) UI 통계
  const uiEvent = {
    ...event,
    'event.name': EVENT_API_RESPONSE,
  } as UiEvent;
  uiTelemetryService.addEvent(uiEvent);

  // 2) Clearcut — toLogBody()는 ProviderApiResponseEvent에 이미 구현됨
  ClearcutLogger.getInstance(config)?.logProviderApiResponseEvent?.(event);

  // 3) OTEL log + metrics
  bufferTelemetryEvent(() => {
    recordApiResponseMetrics(config, event.duration_ms, {
      model: event.model,
      status_code: event.status_code,
      genAiAttributes: {
        'gen_ai.system': event.provider,
        'gen_ai.request.model': event.model,
      },
    });

    const tokenUsageData = [
      { count: event.usage.input_token_count, type: 'input' as const },
      { count: event.usage.output_token_count, type: 'output' as const },
      { count: event.usage.cached_content_token_count, type: 'cache' as const },
    ];
    for (const { count, type } of tokenUsageData) {
      if (count > 0) {
        recordTokenUsageMetrics(config, count, {
          model: event.model,
          type,
        });
      }
    }
  });
}

/**
 * Non-Gemini 프로바이더용 API 에러 텔레메트리 로깅.
 */
export function logProviderApiError(
  config: Config,
  event: ProviderApiErrorEvent,
): void {
  const uiEvent = {
    ...event,
    'event.name': EVENT_API_ERROR,
  } as UiEvent;
  uiTelemetryService.addEvent(uiEvent);

  bufferTelemetryEvent(() => {
    recordApiErrorMetrics(config, event.duration_ms, {
      model: event.model,
      status_code: event.status_code,
      error_type: event.error_type,
    });
  });
}
```

**LoggingContentGenerator 내 호출 메서드**:

```typescript
private _logLlmApiResponse(
  model: string, durationMs: number, promptId: string, usage: LlmTokenUsage,
): void {
  const event = createProviderApiResponseEvent({
    model, durationMs, promptId, usage,
    provider: this.wrapped.providerName ?? 'unknown',
  });
  logProviderApiResponse(this.config, event);
}

private _logLlmApiError(
  model: string, durationMs: number, promptId: string, error: unknown,
): void {
  const errorMessage = error instanceof Error ? error.message
    : typeof error === 'object' && error !== null && 'error' in error
      ? String((error as Record<string, unknown>).error)
      : String(error);
  const event = createProviderApiErrorEvent({
    model, durationMs, promptId,
    error: errorMessage,
    provider: this.wrapped.providerName ?? 'unknown',
  });
  logProviderApiError(this.config, event);
}
```

#### 3.0.3 UiEvent 타입 확장

**파일**: `packages/core/src/telemetry/uiTelemetry.ts`

```typescript
// Before
export type UiEvent =
  | (ApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE })
  | (ApiErrorEvent & { 'event.name': typeof EVENT_API_ERROR })
  | (ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL });

// After — ProviderApiResponseEvent / ProviderApiErrorEvent 추가
import type {
  ProviderApiResponseEvent,
  ProviderApiErrorEvent,
} from '../providers/telemetryBridge.js';

export type UiEvent =
  | (ApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE })
  | (ProviderApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE })
  | (ApiErrorEvent & { 'event.name': typeof EVENT_API_ERROR })
  | (ProviderApiErrorEvent & { 'event.name': typeof EVENT_API_ERROR })
  | (ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL });
```

#### 3.0.4 processApiResponse provider 추출

```typescript
private processApiResponse(event: ApiResponseEvent | ProviderApiResponseEvent) {
  // provider 필드가 있으면 사용, 없으면 'gemini' (레거시 Gemini 경로)
  const provider = 'provider' in event ? (event as ProviderApiResponseEvent).provider : 'gemini';
  const compositeKey = buildCompositeKey(provider, event.model);
  const modelMetrics = this.getOrCreateModelMetrics(compositeKey);
  modelMetrics.provider = provider;

  // ... 기존 토큰 집계 로직 동일
}
```

#### 3.0.5 llmGenerateContent (비스트림) 텔레메트리 추가

**파일**: `packages/core/src/core/loggingContentGenerator.ts`

현재 `llmGenerateContent()` (line 423-449)도 `debugLogger`만 사용. 비스트림
호출(BaseLlmClient 경유)도 동일하게 텔레메트리 로깅 추가 필요:

```typescript
async llmGenerateContent(
  request: LlmGenerateRequest, userPromptId: string, options?: GenerateOptions,
): Promise<LlmGenerateResponse> {
  // ... existing code ...
  const startTime = Date.now();
  try {
    const response = await this.wrapped.llmGenerateContent(request, userPromptId, options);
    const durationMs = Date.now() - startTime;
    if (response.usage) {
      this._logLlmApiResponse(request.model, durationMs, userPromptId, response.usage);
    }
    return response;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    this._logLlmApiError(request.model, durationMs, userPromptId, error);
    throw error;
  }
}
```

---

### 3.1 Phase 1: 프로바이더 인식 기반 구축

#### 3.1.1 ModelMetrics에 provider 필드 추가

**파일**: `packages/core/src/telemetry/uiTelemetry.ts`

```typescript
// After
export interface ModelMetrics {
  provider: string; // ProviderType enum 값 또는 'unknown'
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
```

`createInitialModelMetrics()` 에도 `provider: 'unknown'` 기본값 추가.

#### 3.1.2 SessionMetrics 복합 키 전환

**변경 전**: `models: Record<string, ModelMetrics>` — 키: `"gemini-2.5-pro"`
(모델명 단독) **변경 후**: `models: Record<string, ModelMetrics>` — 키:
`"gemini\0gemini-2.5-pro"` (provider + NULL 구분자 + model)

> **이유 (이슈 #7)**: openai-compatible 프로바이더에서 freeform 모델명 입력 시
> 동일 모델명이 다른 프로바이더에 존재할 수 있음. 예: openai-compatible 에서
> `gpt-4.1` 모델명 사용 시 openai 프로바이더와 키 충돌.

> **v3 수정 (이슈 v3-5)**: 구분자로 `:` 사용 시 freeform 모델명에 `:` 포함 가능
> (예: `org:custom-model-v1`). `\x00` (NULL)은 모델명에 등장할 수 없으므로
> 안전하다.

```typescript
// 복합 키 생성/파싱 유틸리티
const COMPOSITE_KEY_SEPARATOR = '\0';

function buildCompositeKey(provider: string, model: string): string {
  return `${provider}${COMPOSITE_KEY_SEPARATOR}${model}`;
}

function parseCompositeKey(key: string): { provider: string; model: string } {
  const idx = key.indexOf(COMPOSITE_KEY_SEPARATOR);
  if (idx === -1) return { provider: 'gemini', model: key }; // 레거시 호환
  return { provider: key.slice(0, idx), model: key.slice(idx + 1) };
}
```

```typescript
private getOrCreateModelMetrics(compositeKey: string): ModelMetrics {
  if (!this.#metrics.models[compositeKey]) {
    this.#metrics.models[compositeKey] = createInitialModelMetrics();
  }
  return this.#metrics.models[compositeKey];
}
```

**디버깅/로깅 표시 시**: `parseCompositeKey()` 후 `${provider}/${model}`
형식으로 변환하여 가독성 확보.

#### 3.1.3 provider 결정 방식: 명시적 전달 (inferProvider 미사용)

> **이유 (이슈 #6)**: 모델명 기반 추론은 `openai-compatible` (freeform), `didim`
> 등 비표준 프로바이더에서 오분류 위험이 크다.

**방식**: `ProviderApiResponseEvent.provider` 필드를 통해 명시적으로 전달.

- Non-Gemini: Phase 0에서 추가한 `_logLlmApiResponse()`가
  `this.wrapped.providerName` 전달
- Gemini (레거시): `processApiResponse()`에서 `'provider' in event` 체크 →
  없으면 `'gemini'` 기본값

`inferProvider()` 유틸리티는 **제거**한다. 모든 provider 정보는
`ContentGenerator.providerName`에서 시작하여 이벤트를 통해 전달된다.

#### 3.1.4 StatsDisplay.tsx 리팩터

**VALID_GEMINI_MODELS 의존 제거**:

```typescript
// 삭제
import { VALID_GEMINI_MODELS } from '../../geminiModels.js';

// 쿼타 행 필터: Gemini 프로바이더의 모델만 표시 (compositeKey 기반)
const geminiModels = Object.entries(models)
  .filter(([, m]) => m.provider === 'gemini')
  .map(([key]) => parseCompositeKey(key).model);
```

**모델 테이블에 프로바이더 그룹핑**:

```
Provider | Model            | Requests | Input | Output | Cached | Total
─────────┼──────────────────┼──────────┼───────┼────────┼────────┼──────
Gemini   | gemini-2.5-pro   |    12    | 50K   | 3K     | 10K    | 53K
         | gemini-2.5-flash |     5    | 20K   | 1K     |  5K    | 21K
─────────┼──────────────────┼──────────┼───────┼────────┼────────┼──────
Claude   | claude-sonnet-4  |     8    | 30K   | 2K     |  8K    | 32K
```

- 프로바이더별 그룹핑 (`ModelMetrics.provider` 기반)
- 단일 프로바이더만 사용한 경우: Provider 컬럼 생략 (기존 UX 유지)

#### 3.1.5 ModelStatsDisplay.tsx 프로바이더 그룹핑

프로바이더별 섹션으로 분리:

```
══════════════════════════════════════
  Model Stats — Gemini
══════════════════════════════════════
         │ gemini-2.5-pro │ gemini-2.5-flash
─────────┼────────────────┼──────────────────
API      │                │
 ...

══════════════════════════════════════
  Model Stats — Claude
══════════════════════════════════════
         │ claude-sonnet-4
─────────┼─────────────────
 ...
```

#### 3.1.6 SessionContext.tsx areModelMetricsEqual 확장

> **이슈 #8 대응**: provider 필드 추가 시 동등성 비교에도 반영 필수

**파일**: `packages/cli/src/ui/contexts/SessionContext.tsx`

```typescript
function areModelMetricsEqual(a: ModelMetrics, b: ModelMetrics): boolean {
  // 신규: provider 비교
  if (a.provider !== b.provider) return false;

  if (
    a.api.totalRequests !== b.api.totalRequests ||
    a.api.totalErrors !== b.api.totalErrors ||
    a.api.totalLatencyMs !== b.api.totalLatencyMs
  )
    return false;

  if (
    a.tokens.input !== b.tokens.input ||
    a.tokens.prompt !== b.tokens.prompt ||
    a.tokens.candidates !== b.tokens.candidates ||
    a.tokens.total !== b.tokens.total ||
    a.tokens.cached !== b.tokens.cached ||
    a.tokens.thoughts !== b.tokens.thoughts ||
    a.tokens.tool !== b.tokens.tool
    // Phase 2에서 cacheCreation 추가 시 여기도 추가
  )
    return false;

  return true;
}
```

---

### 3.2 Phase 2: cacheCreation 토큰 파이프라인 전 구간 수정

> **이슈 #3 대응**: LlmTokenUsage → TelemetryUsageMetadata → GenAIUsageDetails →
> telemetryBridge → ModelMetrics 전 구간에서 cacheCreation 누락

#### 3.2.1 GenAIUsageDetails 확장

**파일**: `packages/core/src/telemetry/types.ts`

```typescript
// Before (line 569)
export interface GenAIUsageDetails {
  input_token_count: number;
  output_token_count: number;
  cached_content_token_count: number;
  thoughts_token_count: number;
  tool_token_count: number;
  total_token_count: number;
}

// After
export interface GenAIUsageDetails {
  input_token_count: number;
  output_token_count: number;
  cached_content_token_count: number;
  cache_creation_token_count: number; // 신규
  thoughts_token_count: number;
  tool_token_count: number;
  total_token_count: number;
}
```

#### 3.2.2 TelemetryUsageMetadata 확장

**파일**: `packages/core/src/telemetry/types.ts`

```typescript
// Before (line 19)
export interface TelemetryUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  totalTokenCount?: number;
}

// After
export interface TelemetryUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  cachedContentTokenCount?: number;
  cacheCreationTokenCount?: number; // 신규
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  totalTokenCount?: number;
}
```

#### 3.2.3 telemetryBridge 매핑 확장

**파일**: `packages/core/src/providers/telemetryBridge.ts`

```typescript
// Before (line 29-36)
export function llmTokenUsageToGenAIUsage(
  usage: LlmTokenUsage,
): GenAIUsageDetails {
  return {
    input_token_count: usage.promptTokens,
    output_token_count: usage.completionTokens,
    total_token_count: usage.totalTokens,
    cached_content_token_count: usage.cachedTokens ?? 0,
    thoughts_token_count: usage.thoughtTokens ?? 0,
    tool_token_count: usage.toolTokens ?? 0,
  };
}

// After
export function llmTokenUsageToGenAIUsage(
  usage: LlmTokenUsage,
): GenAIUsageDetails {
  return {
    input_token_count: usage.promptTokens,
    output_token_count: usage.completionTokens,
    total_token_count: usage.totalTokens,
    cached_content_token_count: usage.cachedTokens ?? 0,
    cache_creation_token_count: usage.cacheCreationTokens ?? 0, // 신규
    thoughts_token_count: usage.thoughtTokens ?? 0,
    tool_token_count: usage.toolTokens ?? 0,
  };
}
```

역방향 변환 `genAIUsageToLlmTokenUsage()`도 동일하게 수정.

#### 3.2.4 ModelMetrics.tokens.cacheCreation 추가

**파일**: `packages/core/src/telemetry/uiTelemetry.ts`

```typescript
export interface ModelMetrics {
  provider: string;
  api: { ... };
  tokens: {
    input: number;
    prompt: number;
    candidates: number;
    total: number;
    cached: number;
    cacheCreation: number;  // 신규
    thoughts: number;
    tool: number;
  };
}
```

`processApiResponse()`:

```typescript
modelMetrics.tokens.cacheCreation +=
  event.usage.cache_creation_token_count ?? 0;
```

`createInitialModelMetrics()`:

```typescript
cacheCreation: 0,
```

#### 3.2.5 SessionContext equality 갱신

`areModelMetricsEqual()`에 `a.tokens.cacheCreation !== b.tokens.cacheCreation`
추가.

#### 3.2.6 ModelStatsDisplay.tsx cacheCreation 행 추가

```typescript
// 기존 조건부 표시 패턴과 동일
{hasCacheCreation && (
  <Row label="Cache Creation">
    {models.map(m => formatTokenCount(m.tokens.cacheCreation))}
  </Row>
)}
```

- `hasCacheCreation`: 모든 모델의 `cacheCreation > 0` 여부 확인
- 프로바이더 무관 — 값이 있는 경우에만 표시 (Claude 외 프로바이더가 향후 지원
  시에도 자동 동작)

---

### 3.3 Phase 3: 쿼타 통합

> **이슈 #5 대응**: adapter가 응답 헤더를 보존/노출하지 않으므로 UI만 수정해서는
> 구현 불가. adapter 레이어 변경이 반드시 선행되어야 한다.

#### 3.3.1 선행 조건: adapter 헤더 수집

**파일**: `packages/core/src/providers/claude/adapter.ts`, `openai/adapter.ts`

현재 adapter의 `generateContent()` / `generateContentStream()`은 SDK 응답에서
rate-limit 헤더를 추출하지 않는다.

**필요 변경**:

```typescript
// Claude adapter — Anthropic SDK response에서 헤더 추출
const response = await this.client.messages.create(params, { signal });
// response.headers 접근 가능 여부 확인 필요 (Anthropic SDK 구현 의존)

// OpenAI adapter — OpenAI SDK response에서 헤더 추출
const response = await this.client.chat.completions.create(params, { signal });
// response.headers 또는 response._response?.headers 접근
```

rate-limit 헤더 종류:

- **Claude**: `anthropic-ratelimit-requests-limit`,
  `anthropic-ratelimit-requests-remaining`, `anthropic-ratelimit-requests-reset`
- **OpenAI**: `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`,
  `x-ratelimit-reset-requests`

#### 3.3.2 쿼타 정보 저장 경로

수집된 헤더를 텔레메트리 또는 별도 서비스에 저장:

- 방법 A: `LlmGenerateResponse`에 `rateLimits?: RateLimitInfo` 필드 추가 →
  텔레메트리 이벤트 경유
- 방법 B: adapter 내부에서 별도 `ProviderQuotaService`에 직접 저장

#### 3.3.3 ProviderQuota 타입 정의

> **이슈 #9 대응**: `providerTypes.ts`는 `core/index.ts`에서 export되지 않음.
> CLI가 사용할 수 있도록 export 경로 추가 필요.

**방법**: `packages/core/src/index.ts`에 `providerTypes.ts` export 추가 또는
`telemetry/types.ts`에 정의하여 기존 export 경로 활용.

```typescript
export interface ProviderQuota {
  provider: string;
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

#### 3.3.4 HistoryItemStats 타입 확장

> **이슈 #9 대응**: 현재 `HistoryItemStats.quotas`는 `RetrieveUserQuotaResponse`
> 타입.

**파일**: `packages/cli/src/ui/types.ts`

```typescript
// Before
export type HistoryItemStats = HistoryItemBase & {
  type: 'stats';
  duration: string;
  quotas?: RetrieveUserQuotaResponse;
};

// After
export type HistoryItemStats = HistoryItemBase & {
  type: 'stats';
  duration: string;
  quotas?: RetrieveUserQuotaResponse; // Gemini (기존 호환)
  providerQuotas?: Record<string, ProviderQuota>; // 멀티 프로바이더 (신규)
};
```

#### 3.3.5 statsCommand.ts 쿼타 분기

```typescript
// Gemini: 기존 refreshUserQuota() 유지
if (providerName === 'gemini' || !providerName) {
  statsItem.quotas = await config.refreshUserQuota();
}
// Non-Gemini: ProviderQuotaService에서 조회
statsItem.providerQuotas = providerQuotaService.getAll();
```

#### 3.3.6 providerQuotas 렌더 경로 완성

> **이슈 v3-6 대응**: `HistoryItemStats`에 `providerQuotas`를 추가하더라도, 현재
> 렌더 체인은 `quotas`만 전달하므로 화면에 표시되지 않는다.
> `HistoryItemDisplay.tsx:122` → `StatsDisplay` 전체 경로를 함께 수정해야 한다.

**렌더 경로 (현재)**:

```
statsCommand → HistoryItemStats.quotas
            → HistoryItemDisplay.tsx → <StatsDisplay quotas={quotas} />
            → StatsDisplay.tsx (quotas prop만 수신)
```

**렌더 경로 (수정 후)**:

```
statsCommand → HistoryItemStats.quotas          (Gemini, 기존)
             → HistoryItemStats.providerQuotas   (Non-Gemini, 신규)
             → HistoryItemDisplay.tsx → <StatsDisplay quotas={quotas} providerQuotas={providerQuotas} />
             → StatsDisplay.tsx (두 prop 모두 수신, 프로바이더별 렌더링)
```

**(1) `StatsDisplayProps` 확장** —
`packages/cli/src/ui/components/StatsDisplay.tsx`

```typescript
// Before
interface StatsDisplayProps {
  duration: string;
  title?: string;
  quotas?: RetrieveUserQuotaResponse;
}

// After
interface StatsDisplayProps {
  duration: string;
  title?: string;
  quotas?: RetrieveUserQuotaResponse; // Gemini (기존)
  providerQuotas?: Record<string, ProviderQuota>; // 멀티 프로바이더 (신규)
}
```

**(2) `HistoryItemDisplay.tsx` prop 전달** —
`packages/cli/src/ui/components/HistoryItemDisplay.tsx`

```typescript
// Before (line 122)
<StatsDisplay duration={item.duration} quotas={item.quotas} />

// After
<StatsDisplay
  duration={item.duration}
  quotas={item.quotas}
  providerQuotas={item.providerQuotas}
/>
```

**(3) `StatsDisplay` 내부 렌더링 분기**

```typescript
// StatsDisplay 내부
{quotas && <GeminiQuotaSection quotas={quotas} />}
{providerQuotas && Object.keys(providerQuotas).length > 0 && (
  <ProviderQuotaSection providerQuotas={providerQuotas} />
)}
```

---

### 3.4 Phase 4: 부가 기능 (선택)

| 순서 | 작업                                 | 파일               |
| ---- | ------------------------------------ | ------------------ |
| 14   | `/stats --provider` 필터 플래그      | `statsCommand.ts`  |
| 15   | 비용 추정 표시 (프로바이더별 가격표) | 신규 파일          |
| 16   | 프로바이더별 소계 행                 | `StatsDisplay.tsx` |
| 17   | `ProviderSummary` 집계               | `uiTelemetry.ts`   |

---

## 4. 구현 우선순위 (수정 후)

### Phase 0: Non-Gemini 텔레메트리 수집 (선행 필수)

| 순서 | 작업                                                 | 파일                         | 비고                               |
| ---- | ---------------------------------------------------- | ---------------------------- | ---------------------------------- |
| 0-1  | `llmLoggingStreamWrapper`에 `logApiResponse` 추가    | `loggingContentGenerator.ts` | LlmEvent.MessageEnd에서 usage 수집 |
| 0-2  | `llmGenerateContent`에 텔레메트리 추가               | `loggingContentGenerator.ts` | 비스트림 경로                      |
| 0-3  | `_logLlmApiResponse` / `_logLlmApiError` 메서드 신설 | `loggingContentGenerator.ts` | `ProviderApiResponseEvent` 활용    |
| 0-4  | `UiEvent` 타입에 `ProviderApiResponseEvent` 추가     | `uiTelemetry.ts`             | union 확장                         |
| 0-5  | `processApiResponse()`에서 provider 추출 + 복합 키   | `uiTelemetry.ts`             | duck typing으로 provider 필드 감지 |

### Phase 1: 프로바이더 인식 기반 (필수)

| 순서 | 작업                               | 파일                    | 비고                      |
| ---- | ---------------------------------- | ----------------------- | ------------------------- |
| 1-1  | `ModelMetrics.provider` 필드 추가  | `uiTelemetry.ts`        | 기본값 `'unknown'`        |
| 1-2  | `createInitialModelMetrics()` 갱신 | `uiTelemetry.ts`        |                           |
| 1-3  | `VALID_GEMINI_MODELS` 의존 제거    | `StatsDisplay.tsx`      | provider 기반 필터로 대체 |
| 1-4  | 모델 테이블에 Provider 그룹핑 적용 | `StatsDisplay.tsx`      | 단일 프로바이더 시 생략   |
| 1-5  | 프로바이더별 그룹핑 적용           | `ModelStatsDisplay.tsx` | 섹션 분리                 |
| 1-6  | `areModelMetricsEqual()` 확장      | `SessionContext.tsx`    | provider 필드 비교 추가   |

### Phase 2: cacheCreation 토큰 전 구간 (권장)

| 순서 | 작업                                                  | 파일                    | 비고        |
| ---- | ----------------------------------------------------- | ----------------------- | ----------- |
| 2-1  | `GenAIUsageDetails.cache_creation_token_count` 추가   | `telemetry/types.ts`    |             |
| 2-2  | `TelemetryUsageMetadata.cacheCreationTokenCount` 추가 | `telemetry/types.ts`    |             |
| 2-3  | `llmTokenUsageToGenAIUsage` cacheCreation 매핑        | `telemetryBridge.ts`    | 역방향도    |
| 2-4  | `ModelMetrics.tokens.cacheCreation` 추가              | `uiTelemetry.ts`        |             |
| 2-5  | `processApiResponse()`에 cacheCreation 집계           | `uiTelemetry.ts`        |             |
| 2-6  | `areModelMetricsEqual()`에 cacheCreation 추가         | `SessionContext.tsx`    |             |
| 2-7  | cacheCreation 조건부 행 표시                          | `ModelStatsDisplay.tsx` | 값>0일 때만 |

### Phase 3: 쿼타 통합 (선택 — adapter 변경 필수)

| 순서 | 작업                                          | 파일                             | 비고                                         |
| ---- | --------------------------------------------- | -------------------------------- | -------------------------------------------- |
| 3-1  | Claude adapter 헤더 수집                      | `claude/adapter.ts`              | **선행 조건**                                |
| 3-2  | OpenAI adapter 헤더 수집                      | `openai/adapter.ts`              | **선행 조건**                                |
| 3-3  | `ProviderQuota` 인터페이스 정의 + core export | `telemetry/types.ts`, `index.ts` |                                              |
| 3-4  | `HistoryItemStats` 타입 확장                  | `cli/ui/types.ts`                | `providerQuotas` 필드                        |
| 3-5  | `StatsDisplayProps` 확장 + 렌더링 분기        | `StatsDisplay.tsx`               | `providerQuotas` prop 추가, Gemini/기타 분기 |
| 3-6  | `HistoryItemDisplay.tsx` prop 전달            | `HistoryItemDisplay.tsx`         | `providerQuotas`를 `StatsDisplay`에 전달     |
| 3-7  | `statsCommand.ts` 쿼타 조회 분기              | `statsCommand.ts`                |                                              |

### Phase 4: 부가 기능 (선택)

| 순서 | 작업                                 | 파일               |
| ---- | ------------------------------------ | ------------------ |
| 4-1  | `/stats --provider` 필터 플래그      | `statsCommand.ts`  |
| 4-2  | 비용 추정 표시 (프로바이더별 가격표) | 신규 파일          |
| 4-3  | 프로바이더별 소계 행                 | `StatsDisplay.tsx` |
| 4-4  | `ProviderSummary` 집계               | `uiTelemetry.ts`   |

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

| 항목                                     | 대응 방안                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| Gemini 레거시 경로 (`ApiResponseEvent`)  | `processApiResponse()`에서 `'provider' in event` duck typing → `'gemini'` 기본값 |
| 복합 키 레거시 호환                      | `parseCompositeKey()`에서 `\0` 없는 키 → `{ provider: 'gemini', model: key }`    |
| 단일 프로바이더(Gemini만) 사용 시        | 기존과 동일한 UX 유지 (Provider 컬럼 생략)                                       |
| 쿼타 API 없는 프로바이더                 | 쿼타 섹션 숨김 (Phase 3 미적용 시 Gemini만 표시)                                 |
| `cacheCreation` 미지원 프로바이더        | 0으로 초기화, 조건부 행 표시로 자동 숨김                                         |
| `openai-compatible` / `didim` 프로바이더 | 명시적 `providerName` 전달로 정확한 분류 (inferProvider 미사용)                  |
| freeform 모델명 충돌                     | 복합 키 `{provider}\0{model}`로 분리 (NULL 구분자)                               |
| `areModelMetricsEqual()` 갱신            | Phase 1에서 `provider`, Phase 2에서 `cacheCreation` 추가                         |
| `ProviderQuota` export 경로              | `telemetry/types.ts`에 정의하여 기존 export 경로 활용                            |
| `HistoryItemStats.quotas` 타입           | 기존 필드 유지 + `providerQuotas` 병행 (하위 호환)                               |
| 기존 테스트 호환                         | `provider` 기본값 `'unknown'`, 복합 키 `parseCompositeKey` 폴백                  |

---

## 7. 결론

**v1 대비 핵심 변경점**:

1. **Phase 0 신설** — Non-Gemini 텔레메트리 수집 경로가 완전히 단절되어 있어, UI
   변경 이전에 `LoggingContentGenerator.llmLoggingStreamWrapper()`에
   `logApiResponse`/`logApiError` 호출을 추가해야 한다. 이것이 없으면 Phase
   1~4의 모든 변경이 무의미하다.

2. **inferProvider() 제거** — 모델명 기반 추론은 openai-compatible(freeform),
   didim 등에서 오분류 위험이 크다. `ContentGenerator.providerName`을
   `ProviderApiResponseEvent`를 통해 명시적으로 전달하는 방식으로 변경.

3. **복합 키 도입** — `Record<string, ModelMetrics>` 키를 `{provider}:{model}`
   형식으로 변경하여 freeform 프로바이더의 모델명 충돌 방지.

4. **cacheCreation 전 구간 수정** — `LlmTokenUsage` → `GenAIUsageDetails` →
   `telemetryBridge` → `ModelMetrics` 전체 파이프라인에서 `cacheCreation` 매핑이
   누락되어 있어 UI에 행만 추가하면 항상 0이 된다. Phase 2에서 전 구간을 함께
   수정한다.

5. **Phase 3 선행조건 명시** — Claude/OpenAI 쿼타 통합은 adapter가 응답 헤더를
   보존/노출하지 않아 UI 수정만으로 구현 불가. adapter 레이어 변경이 반드시
   선행되어야 한다.

**구현 순서**: Phase 0 → Phase 1 → Phase 2 → (선택) Phase 3 → Phase 4 Phase 0 +
Phase 1만 완료해도 Non-Gemini 프로바이더의 통계가 정상 표시되며, Phase 2까지
완료하면 Claude의 cacheCreation 토큰까지 가시화된다.
