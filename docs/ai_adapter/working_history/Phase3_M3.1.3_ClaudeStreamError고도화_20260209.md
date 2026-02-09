# M3.1.3 작업 결과서 — Claude 스트림 에러 처리 고도화

- **작업일**: 2026-02-09
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료

## 작업 목표

M3.1.1에서 구현한 ClaudeAdapter 스트림의 에러 처리를 고도화하고, Converter의
stop_reason 매핑과 스트림 cache token 지원을 확장한다:

1. Stream 에러 시 throw 대신 LlmErrorEvent yield
2. Anthropic SDK 에러 분류 (classifyError 메서드)
3. 새로운 stop_reason 매핑 (pause_turn, refusal)
4. Stream Finished 이벤트에 cache token 포함

## 사전 분석

### todolist 대비 현황

| todolist ID | 항목                    | M3.1.1 구현 여부                          |
| ----------- | ----------------------- | ----------------------------------------- |
| 3.1.3.1     | Stream error → LlmEvent | ⚠️ throw 패턴 (handleError returns never) |
| 3.1.3.2     | Error 타입 분류         | ❌ 미구현 (classifyError 없음)            |
| 3.1.3.3     | stop_reason 추가 매핑   | ⚠️ 4개만 매핑 (pause_turn/refusal 미포함) |
| 3.1.3.4     | Stream cache tokens     | ❌ Finished event에 cache 미포함          |

**결론**: 핵심 스트림 인프라는 M3.1.1 완료. M3.1.3은 에러 안전성 + 데이터 완전성
고도화.

### SDK 타입 검증 결과

| 항목                  | SDK 확인 내용                                                              |
| --------------------- | -------------------------------------------------------------------------- |
| StopReason            | `end_turn, max_tokens, stop_sequence, tool_use, pause_turn, refusal`       |
| APIError.status       | HTTP status code (401, 429, 500+, 529 등)                                  |
| RawMessageStreamEvent | error 타입 없음 — transport 계층에서 처리                                  |
| message_delta usage   | `output_tokens, cache_read_input_tokens, cache_creation_input_tokens` 포함 |

### 아키텍처 결정

**Stream 에러 yield vs throw**:

- **이전**: `handleError(error)` 호출 → `BaseAdapter.handleError` returns
  `never` (항상 throw)
- **문제**: AsyncGenerator에서 throw 시 `for await...of` 루프가 예외 전파 →
  스트림 소비자가 try/catch 필수
- **해결**: `classifyError(error)` → `createErrorEvent()` yield → 스트림
  소비자가 이벤트로 에러 수신
- **근거**: `StreamAssembler`는 `LlmErrorEvent`를 expect. yield 패턴이 스트림
  프로토콜에 부합.

## 작업 순서 및 결과

| 순서 | Sub-task | 작업 내용                                   | 테스트 결과       |
| ---- | -------- | ------------------------------------------- | ----------------- |
| 1    | RED      | converter.test.ts (+3) adapter.test.ts (+8) | 10 FAIL / 82 PASS |
| 2    | GREEN    | converter.ts 2항목 + adapter.ts 2항목       | 92/92 PASS        |

## 변경 파일 상세

### 수정 파일

#### `providers/claude/converter.ts`

**1. mapStopReason 확장**:

- `pause_turn` → `end_turn` (정상 종료와 동일 취급)
- `refusal` → `content_filter` (안전 필터와 동일 취급)

**2. Stream Finished event cache tokens**:

- `message_delta` 이벤트 처리 시 `usage` 객체에서 cache 토큰 추출
- `cache_read_input_tokens` → `cachedTokens`
- `cache_creation_input_tokens` → `cacheCreationTokens`

#### `providers/claude/adapter.ts`

**3. classifyError 메서드 추가**:

- HTTP status code 기반 분류:
  - 401/403 → `AUTHENTICATION` (non-retryable)
  - 429 → `RATE_LIMIT` (retryable)
  - 529 → `MODEL_OVERLOADED` (retryable)
  - 500+ → `SERVER_ERROR` (retryable)
- Message 휴리스틱 (status 없을 때):
  - `/timeout/i` → `TIMEOUT` (retryable)
  - 기타 → `NETWORK` (retryable)
- DI 유지: Anthropic SDK 타입 직접 import 하지 않음

**4. generateContentStream yield 패턴 변경**:

- 이전: `catch (error) { handleErr(error); }` → 항상 throw
- 이후: `catch (error) { yield createErrorEvent(classify(error), ...); }` →
  이벤트 yield

#### `providers/claude/converter.test.ts` — 62 → 65 tests (+3)

| 카테고리            | 테스트 수             | 검증 내용                                         |
| ------------------- | --------------------- | ------------------------------------------------- |
| mapStopReason 확장  | 2 (기존 it.each 확장) | pause_turn→end_turn, refusal→content_filter       |
| stream cache tokens | 1                     | Finished event에 cachedTokens/cacheCreationTokens |
| (기존 테스트)       | 62                    | M3.1.2 포함 테스트 유지                           |

#### `providers/claude/adapter.test.ts` — 19 → 27 tests (+8)

| 카테고리              | 테스트 수 | 검증 내용                                      |
| --------------------- | --------- | ---------------------------------------------- |
| stream error yield    | 2 (수정)  | creation/iteration error → LlmErrorEvent yield |
| classifyError 401     | 1         | AuthenticationError, non-retryable             |
| classifyError 429     | 1         | RateLimitError, retryable                      |
| classifyError 500+    | 1         | ServerError, retryable                         |
| classifyError 529     | 1         | ModelOverloaded, retryable                     |
| classifyError timeout | 1         | TimeoutError (message heuristic)               |
| classifyError network | 1         | NetworkError (no status, no keyword)           |
| (기존 테스트)         | 19        | M3.1.1 테스트 유지                             |

## Quality Gate

| 항목          | 결과                       |
| ------------- | -------------------------- |
| TypeCheck     | ✅ PASS                    |
| ESLint        | ✅ PASS                    |
| Claude 테스트 | ✅ 4 files / 104 passed    |
| Provider 회귀 | ✅ 29 files / 547 passed   |
| Core 전체     | ✅ 265 files / 4981 passed |

**변화**: 기준선 4974 → +7 tests (converter 3 + adapter 8 - 기존 수정 4 = 7
순증)

## 설계 결정

### classifyError — status code 기반 분류

- **결정**: HTTP status code 우선, 없으면 message 휴리스틱
- **근거**: Anthropic SDK의 `APIError` 계층은 `status` 필드를 가짐. SDK 타입을
  직접 import하지 않고 duck typing으로 접근하여 DI 패턴 유지.

### pause_turn → end_turn

- **결정**: `pause_turn`을 `end_turn`과 동일하게 매핑
- **근거**: `pause_turn`은 Anthropic의 computer use 등에서 일시 중단을 의미.
  현재 CLI에서는 정상 종료와 동일 취급이 적절.

### refusal → content_filter

- **결정**: `refusal`을 `content_filter`로 매핑
- **근거**: `refusal`은 모델이 요청을 거부한 경우로, 콘텐츠 필터와 의미적 유사.
  `LlmStopReason`에 별도 `refusal` 값 추가 대신 기존 값 재활용.

### Stream yield vs throw

- **결정**: catch 블록에서 `createErrorEvent()` yield
- **근거**: `BaseAdapter.handleError()` returns `never` (항상 throw)는 동기
  API(`generateContent`)에 적합하지만, 스트림에서는 소비자가 `for await...of`로
  이벤트를 수신하므로 yield가 프로토콜에 부합. `StreamAssembler`가
  `LlmErrorEvent`를 처리하도록 설계되어 있음.

## 리뷰 반영

### 리뷰 이슈 및 수정 결과

| #   | 심각도 | 이슈                                                              | 수정 내용                                                                 |
| --- | ------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | 중간   | classifyError에 400/422→INVALID_REQUEST, 404→MODEL_NOT_FOUND 누락 | 400/422→INVALID_REQUEST (non-retryable), 404→ModelNotFoundError 분기 추가 |
| 2   | 중간   | generateContent가 handleError(UNKNOWN) 사용 — 스트림과 비대칭     | `this.handleError(error)` → `throw this.classifyError(error)` 로 변경     |
| 3   | 낮음   | classifyError가 LlmError 직접 생성 — subclass 미활용              | Auth/RateLimit/ModelNotFound/Network/TimeoutError subclass 사용           |
| 4   | 낮음   | stream creation error 테스트에서 error.type 검증 누락             | `expect(errorEvent.error.type).toBe(LlmErrorType.TIMEOUT)` 추가           |

### 리뷰 후 Quality Gate

| 항목          | 결과                       |
| ------------- | -------------------------- |
| TypeCheck     | ✅ PASS                    |
| ESLint        | ✅ PASS                    |
| Claude 테스트 | ✅ 4 files / 112 passed    |
| Provider 회귀 | ✅ 29 files / 555 passed   |
| Core 전체     | ✅ 265 files / 4989 passed |

**변화**: 리뷰 전 104 tests → 112 tests (+8), Core 4981 → 4989 (+8)

## 향후 작업

- 향후: stream retry 로직 (retryable error 시 자동 재시도)

## 커밋

- `5c5601c7d` feat(providers): M3.1.3 — Claude 스트림 에러 처리 고도화
- `f47d5dc03` fix(providers): M3.1.3 리뷰 반영 — classifyError 400/404 분기,
  subclass 활용, generateContent 에러 분류
