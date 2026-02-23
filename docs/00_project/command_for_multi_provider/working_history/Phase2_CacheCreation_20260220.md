# Phase 2 작업 결과서 — cacheCreation 토큰 파이프라인 전 구간 수정

- **작업일**: 2026-02-20
- **브랜치**: `v0.2.0/stats_multi_provider`
- **상태**: ✅ 완료
- **참조 계획서**:
  `docs/00_project/command_for_multi_provider/phase_plan/phase2_cache_creation_pipeline.md`
- **선행 Phase**: Phase 1 (프로바이더 인식 기반 + UI 그룹핑)

## 작업 목표

`LlmTokenUsage.cacheCreationTokens` → `GenAIUsageDetails` → `ModelMetrics` → UI
전 구간 파이프라인을 완성하여, Claude 등 cacheCreation 토큰을 사용하는
프로바이더의 캐시 생성 비용이 `/stats` UI에 정상 표시되도록 한다.

추가로 리뷰에서 발견된 OTEL 카운터·logRecord·StreamStats 경로의 cache_creation
누락을 수정하여, UI 외 전 출력 경로에서도 일관되게 cache_creation 토큰이
기록되도록 한다.

## 작업 순서 및 결과

| 순서 | TASK     | 작업 내용                                                            | 테스트 결과    |
| ---- | -------- | -------------------------------------------------------------------- | -------------- |
| 1    | RED-1~3  | telemetryBridge cacheCreation 정방향/역방향/기본값 테스트 3개        | 3 FAIL (예상)  |
| 2    | RED-4    | uiTelemetry processApiResponse cacheCreation 집계 테스트 3개         | 3 FAIL (예상)  |
| 3    | RED-5    | SessionContext areModelMetricsEqual cacheCreation 행위 테스트 1개    | 1 FAIL (예상)  |
| 4    | RED-6    | ModelStatsDisplay Cache Creation 조건부 행 테스트 2개                | 1 FAIL (예상)  |
| 5    | TASK-001 | GenAIUsageDetails + TelemetryUsageMetadata + ApiResponseEvent 생성자 | ✅ 컴파일 통과 |
| 6    | TASK-003 | telemetryBridge 정방향/역방향 cacheCreation 매핑                     | 16/16 PASS     |
| 7    | TASK-004 | ModelMetrics.tokens.cacheCreation 타입 + 초기값 + 집계               | 38/38 PASS     |
| 8    | TASK-005 | areModelMetricsEqual cacheCreation 비교 추가                         | 6/6 PASS       |
| 9    | TASK-006 | ModelStatsDisplay hasCacheCreation + 조건부 행                       | 9/9 PASS       |
| 10   | FIX      | 필수 필드 하류 갱신 (20+ 테스트 파일 cacheCreation: 0 추가)          | ✅ 전체 통과   |
| 11   | FIX      | useToolScheduler/ModelDialog 테스트 수정 (core rebuild 연쇄)         | 23+30 PASS     |
| 12   | POST     | typecheck + lint + 전체 테스트 (core 5700 + cli 4785)                | ✅             |

### 리뷰 이슈 수정 (코드레벨 리뷰 → TDD)

| 순서 | TASK   | 작업 내용                                                             | 테스트 결과   |
| ---- | ------ | --------------------------------------------------------------------- | ------------- |
| 13   | RED-R1 | logApiResponse cache_creation OTEL 카운터 기록 테스트                 | 1 FAIL (예상) |
| 14   | RED-R2 | logProviderApiResponse cache_creation OTEL 카운터 기록 테스트         | 1 FAIL (예상) |
| 15   | RED-R3 | toLogRecord cache_creation_token_count 속성 포함 테스트               | 1 FAIL (예상) |
| 16   | RED-R4 | convertToStreamStats cache_creation 집계 테스트                       | 1 FAIL (예상) |
| 17   | FIX-R1 | metrics.ts TOKEN_USAGE type union에 `'cache_creation'` 추가 (2곳)     | 40/40 PASS    |
| 18   | FIX-R2 | loggers.ts tokenUsageData에 cache_creation 항목 추가 (2함수)          | 40/40 PASS    |
| 19   | FIX-R3 | types.ts toLogRecord attributes에 cache_creation_token_count 추가     | 40/40 PASS    |
| 20   | FIX-R4 | output/types.ts StreamStats + stream-json-formatter.ts 집계 로직 추가 | 21/21 PASS    |
| 21   | FIX-D  | stream-json-formatter.test.ts StreamStats 리터럴 하류 갱신 (8곳)      | 21/21 PASS    |
| 22   | FIX-D  | nonInteractiveCli.test.ts.snap 스냅샷 갱신 (3곳)                      | 43/43 PASS    |
| 23   | POST   | typecheck + lint + 전체 테스트 (core 5702 + cli 4785)                 | ✅            |

**리뷰 이슈 상세**:

| #   | 심각도 | 이슈                                          | 판정          | 수정                                              |
| --- | ------ | --------------------------------------------- | ------------- | ------------------------------------------------- |
| R-1 | HIGH   | OTEL 토큰 카운터 cache_creation 누락          | **CONFIRMED** | metrics.ts type union + loggers.ts tokenUsageData |
| R-2 | HIGH   | toLogRecord cache_creation_token_count 미기록 | **CONFIRMED** | types.ts toLogRecord attributes 추가              |
| R-3 | MEDIUM | StreamStats cache_creation 없음               | **CONFIRMED** | output/types.ts + stream-json-formatter.ts        |
| R-4 | MEDIUM | 기본 StatsDisplay 미표시                      | **NOT A BUG** | Phase 2 scope 외 (00_main_plan.md P2 컬럼 공란)   |
| R-5 | LOW    | 회귀 방어 테스트 부족                         | **CONFIRMED** | R-1~R-3 수정과 동시 해결 (RED-R1~R4)              |

## 변경 파일 상세

### 소스 파일 (9개)

#### A. UI 파이프라인 (5개 — 메인 커밋 `9771fcdab`)

#### `packages/core/src/telemetry/types.ts`

- **`GenAIUsageDetails`** (수정): `cache_creation_token_count: number` 필수 필드
  추가 (after `cached_content_token_count`)
- **`TelemetryUsageMetadata`** (수정): `cacheCreationTokenCount?: number` 옵셔널
  필드 추가 (after `cachedContentTokenCount`)
- **`ApiResponseEvent` 생성자** (수정):
  `cache_creation_token_count: usage_data?.cacheCreationTokenCount ?? 0` 매핑
  추가
- **`toLogRecord()`** (수정): attributes에
  `cache_creation_token_count: this.usage.cache_creation_token_count` 추가 (리뷰
  이슈 R-2 수정 — `571a4d937`)

#### `packages/core/src/providers/telemetryBridge.ts`

- **`llmTokenUsageToGenAIUsage()`** (수정): 정방향 매핑
  `cache_creation_token_count: usage.cacheCreationTokens ?? 0` 추가
- **`genAIUsageToLlmTokenUsage()`** (수정): 역방향 매핑
  `cacheCreationTokens: genAI.cache_creation_token_count` 추가

#### `packages/core/src/telemetry/uiTelemetry.ts`

- **`ModelMetrics.tokens`** (수정): `cacheCreation: number` 타입 추가
- **`createInitialModelMetrics()`** (수정): `cacheCreation: 0` 초기값 추가
- **`processApiResponse()`** (수정):
  `modelMetrics.tokens.cacheCreation += event.usage.cache_creation_token_count ?? 0`
  집계 로직 추가

#### `packages/cli/src/ui/contexts/SessionContext.tsx`

- **`areModelMetricsEqual()`** (수정):
  `a.tokens.cacheCreation !== b.tokens.cacheCreation ||` 비교 조건 추가

#### `packages/cli/src/ui/components/ModelStatsDisplay.tsx`

- **`hasCacheCreation`** (신규 계산):
  `activeModels.some(([, metrics]) => metrics.tokens.cacheCreation > 0)`
- **Cache Creation 행** (신규): `hasCacheCreation` 조건부 렌더링 — Cache Reads와
  Thoughts 행 사이에 위치

#### B. OTEL·logRecord·StreamStats 경로 (4개 — 리뷰 수정 커밋 `571a4d937`)

#### `packages/core/src/telemetry/metrics.ts`

- **TOKEN_USAGE type union** (수정, 2곳): `'cache_creation'` 추가
  (`'input' | 'output' | 'thought' | 'cache' | 'cache_creation' | 'tool'`)
- COUNTER_DEFINITIONS 내 attributes 타입 + `recordTokenUsageMetrics` 파라미터
  타입 양쪽 동기화

#### `packages/core/src/telemetry/loggers.ts`

- **`logApiResponse()`** tokenUsageData (수정):
  `{ count: event.usage.cache_creation_token_count, type: 'cache_creation' as const }`
  추가
- **`logProviderApiResponse()`** tokenUsageData (수정): 동일 항목 추가

#### `packages/core/src/output/types.ts`

- **`StreamStats`** (수정): `cache_creation: number` 필드 추가 (cached와 input
  사이)

#### `packages/core/src/output/stream-json-formatter.ts`

- **`convertToStreamStats()`** (수정): `let cacheCreation = 0` 선언 + 루프 내
  `cacheCreation += modelMetrics.tokens.cacheCreation` 집계 +
  `cache_creation: cacheCreation` 반환

### 테스트 파일 (6개 신규/갱신 + 하류 갱신)

#### A. 메인 커밋 테스트 (`9771fcdab`)

| 파일                         | 변경                                               | 신규 테스트 |
| ---------------------------- | -------------------------------------------------- | ----------- |
| `telemetryBridge.test.ts`    | RED-1~3 cacheCreation 매핑 테스트                  | 3개         |
| `uiTelemetry.test.ts`        | RED-4 processApiResponse cacheCreation 집계 테스트 | 3개         |
| `SessionContext.test.tsx`    | RED-5 areModelMetricsEqual 행위 기반 테스트        | 1개         |
| `ModelStatsDisplay.test.tsx` | RED-6 Cache Creation 조건부 행 테스트              | 2개         |

#### B. 리뷰 수정 테스트 (`571a4d937`)

| 파일                             | 변경                                                      | 신규 테스트 |
| -------------------------------- | --------------------------------------------------------- | ----------- |
| `loggers.test.ts`                | RED-R1~R3 OTEL 카운터 + toLogRecord cache_creation 테스트 | +52줄       |
| `stream-json-formatter.test.ts`  | RED-R4 convertToStreamStats cache_creation 테스트         | +30줄       |
| `nonInteractiveCli.test.ts.snap` | StreamStats cache_creation 필드 반영 스냅샷 갱신 (3곳)    | 갱신        |

### 하류 필수 필드 갱신 (cacheCreation: 0 / cache_creation_token_count: 0 추가)

`GenAIUsageDetails.cache_creation_token_count`를 필수 필드로 추가했기 때문에, 이
인터페이스를 리터럴로 생성하는 모든 하류 파일에 `cache_creation_token_count: 0`
또는 `cacheCreation: 0`을 추가:

| 파일                             | 갱신 위치 수  |
| -------------------------------- | ------------- |
| `json-formatter.test.ts`         | 2             |
| `stream-json-formatter.test.ts`  | 4             |
| `telemetryBridge.test.ts`        | 기존 데이터   |
| `uiTelemetry.test.ts`            | createMetrics |
| `ModelStatsDisplay.test.tsx`     | 9             |
| `SessionSummaryDisplay.test.tsx` | 1             |
| `StatsDisplay.test.tsx`          | 14            |
| `SessionContext.test.tsx`        | 기존 데이터   |
| `computeStats.test.ts`           | 기존 데이터   |

### 부수 수정 파일 (2개 — core rebuild 연쇄)

| 파일                       | 원인                                                | 수정 내용                                      |
| -------------------------- | --------------------------------------------------- | ---------------------------------------------- |
| `useToolScheduler.test.ts` | `getWorkingDir` 메서드 추가 + request 스프레드 변경 | mockConfig에 메서드 추가, `.toBe` → `.toEqual` |
| `ModelDialog.test.tsx`     | providerModels.ts OpenAI 기본 모델 변경             | `gpt-4.1` → `gpt-5.2` 갱신                     |

## DoD 검증

### 메인 파이프라인 (UI 경로)

| #   | 항목                                                                  | 상태 |
| --- | --------------------------------------------------------------------- | ---- |
| 1   | `GenAIUsageDetails.cache_creation_token_count` 필드 존재 (필수)       | ✅   |
| 2   | `TelemetryUsageMetadata.cacheCreationTokenCount` 필드 존재 (옵셔널)   | ✅   |
| 3   | `llmTokenUsageToGenAIUsage()` cacheCreation 정방향 매핑 동작          | ✅   |
| 4   | `genAIUsageToLlmTokenUsage()` cacheCreation 역방향 매핑 동작          | ✅   |
| 5   | `ModelMetrics.tokens.cacheCreation` 값 정상 집계                      | ✅   |
| 6   | `areModelMetricsEqual()`에 cacheCreation 포함 (행위 기반 테스트 검증) | ✅   |
| 7   | `ModelStatsDisplay`에 조건부 Cache Creation 행 표시 (값 > 0일 때만)   | ✅   |
| 8   | Gemini/OpenAI 등 cacheCreation 미지원 프로바이더는 0 → UI 행 미표시   | ✅   |

### OTEL·logRecord·StreamStats 경로 (리뷰 수정)

| #   | 항목                                                                       | 상태 |
| --- | -------------------------------------------------------------------------- | ---- |
| 9   | OTEL TOKEN_USAGE 카운터에 `cache_creation` type 기록 (metrics.ts)          | ✅   |
| 10  | `logApiResponse()` tokenUsageData에 cache_creation 포함 (loggers.ts)       | ✅   |
| 11  | `logProviderApiResponse()` tokenUsageData에 cache_creation 포함            | ✅   |
| 12  | `toLogRecord()` attributes에 `cache_creation_token_count` 포함 (types.ts)  | ✅   |
| 13  | `StreamStats` 인터페이스에 `cache_creation` 필드 존재 (output/types.ts)    | ✅   |
| 14  | `convertToStreamStats()`에서 cacheCreation 정상 집계 (formatter.ts)        | ✅   |
| 15  | `toSemanticLogRecord()`는 미수정 (gen_ai.usage.\* 표준 속성만 — 설계 의도) | ✅   |

## 기능 검증 (테스트 기반)

| #   | 검증 항목                                           | 검증 방법                                               | 결과 |
| --- | --------------------------------------------------- | ------------------------------------------------------- | ---- |
| 1   | Claude cacheCreation 값 → UI Cache Creation 행      | ModelStatsDisplay 테스트: cacheCreation > 0 → 행 렌더   | ✅   |
| 2   | Gemini/OpenAI cacheCreation=0 → Cache Creation 숨김 | ModelStatsDisplay 테스트: cacheCreation=0 → 행 미렌더   | ✅   |
| 3   | telemetryBridge 정방향/역방향 일관성                | round-trip 테스트: LlmTokenUsage ↔ GenAIUsageDetails   | ✅   |
| 4   | OTEL 카운터에 cache_creation 메트릭 기록            | loggers.test.ts: recordTokenUsageMetrics 호출 검증      | ✅   |
| 5   | Provider 경로에서도 cache_creation 카운터 기록      | loggers.test.ts: logProviderApiResponse 테스트          | ✅   |
| 6   | logRecord에 cache_creation_token_count 속성 포함    | loggers.test.ts: mockLogger.emit attributes 검증        | ✅   |
| 7   | StreamStats에 cache_creation 집계 반영              | stream-json-formatter.test.ts: result.cache_creation=25 | ✅   |
| 8   | --stream-json 출력에 cache_creation 포함            | nonInteractiveCli 스냅샷 테스트 3개 갱신 통과           | ✅   |

## 핵심 리스크 해결 결과

| 리스크                                                | 해결 방법                                                |
| ----------------------------------------------------- | -------------------------------------------------------- |
| GenAIUsageDetails 필드 순서/호환                      | 기존 필드 미변경, `cached_content_token_count` 뒤에 추가 |
| areModelMetricsEqual cacheCreation 누락 → 무한 리렌더 | Phase 2에서 `cacheCreation` 비교 동시 추가               |
| cacheCreation=0 불필요 UI 행                          | `hasCacheCreation` 조건부 렌더링으로 기존 UX 유지        |
| [v1.4 #5] 필수 필드 하류 컴파일 에러                  | ApiResponseEvent 생성자 + 20+ 테스트 파일 동시 갱신      |
| [v1.4 #4] 비공개 함수 직접 테스트                     | 행위 기반 테스트: SessionContext renderCount 패턴        |
| OTEL·logRecord·StreamStats cache_creation 누락        | 리뷰 수정: metrics/loggers/types/output 4개 파일 보완    |
| StreamStats 인터페이스 변경 → CLI 스냅샷 불일치       | nonInteractiveCli 스냅샷 3개 갱신                        |

## Lessons Learned

- **필수 필드 하류 갱신 범위**: `GenAIUsageDetails`에 필수 필드 추가 시 core +
  cli 양쪽의 20+ 테스트 파일이 컴파일 에러. core 빌드 → cli typecheck 순서로
  영향 범위를 확인하고, sub-agent 병렬 처리로 효율적 갱신
- **Core rebuild 연쇄 효과**: core 소스 변경 후
  `npm run build -w @didim365/agent-cli-core` 필수. 빌드 결과물(dist/)이
  갱신되면서 이전 커밋의 core 변경사항(getWorkingDir, request 스프레드, 모델명
  변경)도 함께 반영되어 기존 통과하던 CLI 테스트가 실패할 수 있음
- **행위 기반 테스트 패턴**: `areModelMetricsEqual()`은 비공개 함수 —
  SessionContext에서 `uiTelemetryService.emit('update')` 후 renderCount 증가
  여부로 간접 검증. 설정 복잡하지만 리팩터링 내성 높음
- **TDD RED 정확도**: 8개 RED 테스트 모두 예상대로 실패. 특히 RED-5(renderCount
  2 vs expected 3)와 RED-6('Cache Creation' not in output)은 정확한 실패 원인
  확인 후 GREEN 진행
- **UI 외 경로 누락 패턴**: cacheCreation 파이프라인을 UI
  (uiTelemetry→ModelStatsDisplay)만 대상으로 설계하면 OTEL 카운터(metrics.ts),
  logRecord(types.ts), 스트림 JSON(stream-json-formatter.ts) 경로가 누락됨. 신규
  필드 추가 시 모든 출력 경로를 체크리스트로 관리 필요
- **StreamStats 인터페이스 변경 연쇄**: `StreamStats`에 필드 추가 시
  `convertToStreamStats()`, 테스트 리터럴, CLI 스냅샷(nonInteractiveCli)까지
  연쇄 갱신 필요. `toEqual` 사용 테스트는 partial match가 아니므로 모든 필드
  명시 필수
- **TS index signature 캐스팅**: `StreamStats as Record<string, unknown>` 캐스팅
  시 TS2352 에러 발생 — StreamStats에 index signature 없으므로 직접 프로퍼티
  접근(`result.cache_creation`) 사용

## 커밋 요약

| 커밋 해시   | 메시지                                                                                           | 파일 수 | 변경       |
| ----------- | ------------------------------------------------------------------------------------------------ | ------- | ---------- |
| `9771fcdab` | `feat(telemetry): cacheCreation 토큰 파이프라인 전 구간 완성 (Phase 2)`                          | 14      | +383       |
| `e7cb4960e` | `fix(test): useToolScheduler·ModelDialog 테스트 수정`                                            | 2       | +9 / -8    |
| `6c5639b45` | `docs(telemetry): Phase 2 cacheCreation 작업 결과서 및 계획서 상태 갱신`                         | 3       | +211 / -41 |
| `571a4d937` | `fix(telemetry): Phase 2 리뷰 이슈 수정 — OTEL·logRecord·StreamStats에 cache_creation 누락 반영` | 8       | +106 / -5  |

## 검증 결과

```
typecheck:  ✅ tsc --noEmit 통과
lint:       ✅ eslint 통과
core test:  ✅ 284 files, 5702 passed, 0 failed
cli test:   ✅ 351 files, 4785 passed, 0 failed
```
