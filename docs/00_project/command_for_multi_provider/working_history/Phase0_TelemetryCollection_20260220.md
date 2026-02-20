# Phase 0 작업 결과서 — Non-Gemini 텔레메트리 수집 경로 구축

- **작업일**: 2026-02-20
- **브랜치**: `v0.2.0/stats_multi_provider`
- **상태**: ✅ 완료 (리뷰 반영 포함)
- **참조 계획서**:
  `docs/00_project/command_for_multi_provider/phase_plan/phase0_telemetry_collection.md`

## 작업 목표

Non-Gemini 프로바이더(Claude, OpenAI, openai-compatible)의 API 호출에 대한
텔레메트리 수집 경로를 구축한다. 기존
`llmLoggingStreamWrapper`/`llmGenerateContent`는 `debugLogger.debug()`만
호출하여 `/stats` 통계에 반영되지 않았음.

## 작업 순서 및 결과

| 순서 | TASK         | 작업 내용                                                     | 테스트 결과    |
| ---- | ------------ | ------------------------------------------------------------- | -------------- |
| 1    | RED-1~5      | loggingContentGenerator 텔레메트리 테스트 6개                 | 6 FAIL (예상)  |
| 2    | RED-6        | logProviderApiResponse/Error 테스트 3개                       | 3 FAIL (예상)  |
| 3    | RED-7        | UiEvent 확장 + provider 추출 테스트 2개                       | 2 FAIL (예상)  |
| 4    | TASK-001     | logProviderApiResponse/logProviderApiError 함수 신설          | 39/39 PASS     |
| 5    | TASK-002     | ModelMetrics.provider + processApiResponse provider 추출      | 21/21 PASS     |
| 6    | TASK-003~005 | \_logLlmApiResponse/\_logLlmApiError + stream/non-stream 연결 | 17/17 PASS     |
| 7    | REFACTOR     | 미사용 import 제거, error 추출 중복 제거                      | 77/77 PASS     |
| 8    | POST         | typecheck + lint + 전체 테스트 (5677 passed)                  | ✅             |
| 9    | REVIEW       | 리뷰 이슈 6건 검증 + 수정 (테스트 5개 추가)                   | 5682/5682 PASS |

## 변경 파일 상세

### 소스 파일 (3개)

#### `packages/core/src/core/loggingContentGenerator.ts`

- **`_logLlmApiResponse()`** (신규): `createProviderApiResponseEvent` →
  `logProviderApiResponse` 호출
- **`_logLlmApiError()`** (신규): `createProviderApiErrorEvent` →
  `logProviderApiError` 호출
- **`llmGenerateContent()`** (수정): try/catch에서
  `_logLlmApiResponse`/`_logLlmApiError` 호출 추가
- **`llmLoggingStreamWrapper()`** (수정):
  - `MessageEnd` 또는 `Finished` 이벤트에서 usage 수집 (Claude: Finished,
    OpenAI: MessageEnd)
  - `Error` 이벤트 감지 시 `_logLlmApiError` 호출
  - 정상 완료 시 `_logLlmApiResponse` 호출
  - 네트워크 예외(throw) 시 `_logLlmApiError` 호출 + rethrow
  - AbortError(사용자 취소) 시 에러 텔레메트리 생략
  - Error 이벤트 yield 후 throw 시 이중 기록 방지 (`hasError` 가드)
- **`llmGenerateContentStream()`** (수정): `startTime`을 외부에서 캡처하여
  wrapper에 전달 (generator body 진입 시점 문제 해결)

#### `packages/core/src/telemetry/loggers.ts`

- **`logProviderApiResponse()`** (신규): UI
  텔레메트리(`uiTelemetryService.addEvent`) + lightweight OTEL counter
  (`recordApiResponseMetrics`/`recordTokenUsageMetrics`). Clearcut/OTEL
  logRecord 경로 의도적 생략 (ProviderApiResponseEvent에 `toLogRecord()` 미구현)
- **`logProviderApiError()`** (신규): UI 텔레메트리 + OTEL counter
  (`recordApiErrorMetrics`/`recordApiResponseMetrics`)

#### `packages/core/src/telemetry/uiTelemetry.ts`

- **`UiEvent` 유니온** (수정):
  `ProviderApiResponseEvent`/`ProviderApiErrorEvent` 추가
- **`ModelMetrics.provider`** (신규 필드): `provider?: string` — 프로바이더
  식별자
- **`processApiResponse()`** (수정): `ProviderApiResponseEvent.provider` duck
  typing 추출, 레거시 이벤트는 `'gemini'` 기본값
- **`processApiError()`** (수정): 동일한 provider 추출 로직 추가

### 테스트 파일 (4개)

| 파일                                 | 변경                                                       | 신규 테스트     |
| ------------------------------------ | ---------------------------------------------------------- | --------------- |
| `loggingContentGenerator.test.ts`    | mock 추가 + import 추가 + RED-1~5 + REVIEW-1,2,4           | 9개             |
| `loggers.test.ts`                    | import 추가 + RED-6 describe 블록                          | 3개             |
| `uiTelemetry.test.ts`                | import 추가 + RED-7 + REVIEW-6 + 기존 4개 `toEqual` 갱신   | 4개             |
| `contentGenerator_new_types.test.ts` | mock에 `logProviderApiResponse`/`logProviderApiError` 추가 | 0개 (기존 보호) |

## DoD 검증

| #   | 항목                                                                    | 상태             |
| --- | ----------------------------------------------------------------------- | ---------------- |
| 1   | `llmLoggingStreamWrapper`에서 스트림 완료 시 텔레메트리 이벤트 생성     | ✅               |
| 2   | `llmGenerateContent`에서 비스트림 응답 시 텔레메트리 이벤트 생성        | ✅               |
| 3   | Error 이벤트 yield 시 에러 텔레메트리 생성                              | ✅               |
| 4   | `UiEvent`가 `ProviderApiResponseEvent`/`ProviderApiErrorEvent`를 수용함 | ✅ (유니온 확장) |
| 5   | 기존 Gemini 텔레메트리 경로가 정상 동작함 (regression 없음)             | ✅               |
| 6   | `logProviderApiResponse`는 UI 전용 + lightweight OTEL counter만 사용    | ✅               |
| 7   | `ModelMetrics.provider` 필드가 추가되고 provider 값이 설정됨            | ✅               |

## 리뷰 이슈 검증 및 수정 결과

| #   | 심각도 | 이슈                                            | 판정             | 수정 내용                                                      |
| --- | ------ | ----------------------------------------------- | ---------------- | -------------------------------------------------------------- |
| 1   | HIGH   | Claude stream usage = 0 (Finished에 usage 위치) | **CONFIRMED**    | `Finished` 이벤트에서도 usage 수집                             |
| 2   | HIGH   | AbortError가 API 에러로 기록됨                  | **CONFIRMED**    | catch에서 `error.name === 'AbortError'` 가드                   |
| 3   | MEDIUM | UiEvent 유니온에 Provider 이벤트 타입 미포함    | **CONFIRMED**    | `ProviderApiResponseEvent`/`ProviderApiErrorEvent` 유니온 추가 |
| 4   | MEDIUM | Error yield 후 throw 시 이중 에러 기록          | **CONFIRMED**    | catch에서 `hasError` 가드 추가                                 |
| 5   | MEDIUM | 모델 키 충돌 위험 (provider 간 동일 모델명)     | **ACKNOWLEDGED** | Phase 1에서 `{provider}::{model}` 복합 키 적용 예정            |
| 6   | LOW    | processApiError provider 추출 테스트 누락       | **CONFIRMED**    | `uiTelemetry.test.ts`에 2개 테스트 추가                        |

### Issue #5 — 알려진 제한사항 (Phase 1 해결 예정)

`uiTelemetry.ts`의 `processApiResponse()`/`processApiError()`는 `event.model`을
키로 사용하여 `ModelMetrics`를 관리한다. 서로 다른 프로바이더가 동일한
모델명(예: custom deployment)을 사용하는 경우 통계가 병합될 수 있음. Phase 1에서
`{provider}::{model}` 복합 키로 전환 예정.

## Lessons Learned

- **Generator startTime 캡처 위치**: async generator body는 `for await` 시작
  시점에 실행됨. `startTime = Date.now()`을 generator 내부에 두면 fake timer
  테스트에서 `advanceTimersByTime()` 이후에 캡처되어 duration=0이 됨. 외부
  함수에서 캡처하여 인자로 전달해야 함
- **기존 테스트 provider 필드 영향**: `ModelMetrics.provider` 필드 추가 시 기존
  `toEqual` 단언이 실패 → `provider: 'gemini'` 추가 필요
- **Mock 연쇄 영향**: `logProviderApiResponse`/`logProviderApiError` 신설 시
  `loggers.js`를 mock하는 모든 테스트 파일에서 해당 export 추가 필요
- **프로바이더별 usage 이벤트 위치 차이**: Claude는 `Finished`에, OpenAI는
  `MessageEnd`에 usage 데이터를 포함 → 양쪽 모두에서 수집 필요
- **AbortError 텔레메트리 분리**: 사용자 취소(AbortError)는 API 실패가 아니므로
  에러 통계에서 제외해야 함
- **이중 기록 방지 패턴**: 스트림 이벤트(yield)와 예외(throw) 양쪽에서 에러를
  기록할 수 있는 경우, 상태 플래그(`hasError`)로 중복 방지

## 검증 결과

```
typecheck:  ✅ tsc --noEmit 통과
lint:       ✅ eslint 통과
tests:      ✅ 284 files, 5682 passed, 0 failed, 24 skipped
```
