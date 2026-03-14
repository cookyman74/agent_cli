# Phase 2 작업 결과서: Core DidimAdapter + Bootstrap + ContentGenerator 등록

> **작업일**: 2026-03-14 **작업자**: Claude Opus 4.6 **브랜치**:
> v0.3.5/add_DidimAIStudio **상태**: ✅ Complete (R1+R2+R3 리뷰 반영)

---

## 작업 요약

DidimAIStudio API와 통신하는 DidimAdapter를 BaseAdapter 패턴으로 구현하고,
ProviderRegistry에 factory를 등록하여 contentGenerator에서 Didim provider를
선택할 수 있도록 했다. Phase 1의 순수 변환 함수를 활용하여 비스트리밍(invoke) +
SSE 스트리밍(sse/improved 두 모드) 모두 지원한다.

## 변경 파일

| 파일                                                       | 변경 | 설명                                                      |
| ---------------------------------------------------------- | ---- | --------------------------------------------------------- |
| `packages/core/src/providers/didim/adapter.ts`             | 신규 | DidimAdapter 클래스 (BaseAdapter 상속)                    |
| `packages/core/src/providers/didim/adapter.test.ts`        | 신규 | 47개 테스트 (12 describe 블록)                            |
| `packages/core/src/providers/didim/bootstrap.ts`           | 신규 | bootstrapDidimProvider factory 등록 + streamMode 검증     |
| `packages/core/src/providers/didim/bootstrap.test.ts`      | 신규 | 14개 테스트 (4 describe 블록)                             |
| `packages/core/src/providers/didim/index.ts`               | 신규 | 모듈 export (adapter, bootstrap, converter)               |
| `packages/core/src/providers/index.ts`                     | 수정 | Didim namespace export 추가                               |
| `packages/core/src/core/contentGenerator.ts`               | 수정 | bootstrapDidimProvider 호출 + Didim config wiring 추가    |
| `packages/core/src/providers/providerConfig.ts`            | 수정 | DidimProviderConfig에 serverAddress, streamMode 필드 추가 |
| `packages/core/src/providers/providerConfigIntegration.ts` | 수정 | Didim resolveProviderEnvVars에 serverAddress 추가         |

## 구현 아키텍처

### DidimAdapter

```
BaseAdapter
  └─ DidimAdapter
       ├─ providerName: 'didim'
       ├─ capabilities: { supportsStreaming: true, 나머지 all false/0 }
       ├─ generateContent(): POST /invoke → parseDidimResponse → convertDidimResponseToLlm
       ├─ generateContentStream(): POST /invoke/sse[/improved] → SSE ReadableStream → parseDidimSseEvent → convertDidimSseToLlmEvents → yield
       ├─ countTokens(): BaseAdapter default → UnsupportedFeatureError
       ├─ buildEndpointUrl(): getDidimEndpoint wrapper → ValidationError on config error
       └─ thread_id: 자동 저장/전송 (cross-call state)
```

### SSE 파서 구현

- `fetch + response.body.getReader()` 패턴
- `TextDecoder`로 바이트 → 문자열 변환, 종료 시 flush
- `event:` / `data:` 라인 파싱, 빈 줄로 이벤트 경계 감지
- CRLF (`\r\n`) 호환 — trailing `\r` 자동 제거
- 스트림 종료 시 remaining buffer flush (trailing blank line 없는 경우 대응)
- `parseDidimSseEvent()` → `convertDidimSseToLlmEvents()` → yield
- improved 모드 `final_message` 중복 방지: delta 발행 후 final_message skip
- 에러 발생 시 `createErrorEvent()` yield (throw 대신)
- `GenerateOptions.signal` → fetch AbortSignal 전달 (취소/타임아웃 지원)

### Config 전달 경로

```
contentGenerator.ts
  → selectProvider() → { type: ProviderType.Didim, apiKey }
  → adapterConfig에 serverAddress/streamMode 추가 (env 기반)
  → factory.create('didim', adapterConfig)
  → bootstrapDidimProvider (streamMode 유효성 검증) → DidimAdapter constructor
```

## 테스트 결과

```
adapter.test.ts:  51 passed
bootstrap.test.ts: 14 passed
converter.test.ts: 76 passed (Phase 1 회귀)
──────────────────────────
Didim 전체: 141 passed
providerConfig*.test.ts: 42 passed (회귀)
providerSelector.test.ts: 71 passed (회귀)
providers 전체: 1080 passed (회귀)
typecheck:  PASS
lint:       PASS
```

## 테스트 커버리지

### adapter.test.ts (47 tests)

| describe                              | tests | 검증 내용                                                                                                                        |
| ------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| construction and capabilities         | 2     | providerName, LlmProviderCapabilities 10개 필드 전수                                                                             |
| generateContent                       | 5     | POST URL, response 변환, Auth 헤더, thread_id, chat body                                                                         |
| generateContent error handling        | 3     | 401, 500, network error                                                                                                          |
| generateContent I/O failure paths     | 3     | null body, JSON parse fail, fetch abort                                                                                          |
| generateContentStream (sse mode)      | 3     | TextDelta payload, Finished→MessageEnd 순서, thread_id 저장                                                                      |
| generateContentStream (improved mode) | 2     | message_partial, metadata skip                                                                                                   |
| generateContentStream error handling  | 4     | SSE error event, fetch failure, non-OK, null body                                                                                |
| classifyHttpError typed errors        | 6     | 401→AuthenticationError, 403→AuthenticationError, 429→RateLimitError, 408→TimeoutError, 500→SERVER_ERROR(retryable), 418→UNKNOWN |
| improved mode completion              | 3     | message→TextDelta, complete→Finished+MessageEnd 순서, thread_id 재사용                                                           |
| SSE multi-line data parsing           | 2     | data: 라인 join 검증, 3줄 연속 data: 처리                                                                                        |
| extractChatText edge cases            | 4     | 마지막 user 선택, user 없음→빈 문자열, 이미지만→빈 문자열, 복합 parts 전체 text 결합                                             |
| serverAddress validation (R2)         | 3     | 빈 주소→ValidationError(non-streaming), 빈 주소→Error event(streaming), 공백→ValidationError                                     |
| improved mode dedup (R2)              | 2     | delta 후 final_message 억제, delta 없으면 final_message 허용                                                                     |
| SSE CRLF handling (R2)                | 2     | CRLF→정상 파싱, trailing blank line 없이 종료→flush                                                                              |
| GenerateOptions signal (R2)           | 2     | generateContent signal 전달, generateContentStream signal 전달                                                                   |
| countTokens                           | 1     | UnsupportedFeatureError                                                                                                          |

### bootstrap.test.ts (14 tests)

| describe                           | tests | 검증 내용                                                                                           |
| ---------------------------------- | ----- | --------------------------------------------------------------------------------------------------- |
| bootstrapDidimProvider             | 3     | 등록, factory → adapter, idempotent                                                                 |
| Didim config wiring                | 3     | serverAddress, streamMode, env fallback                                                             |
| wiring verification (URL/endpoint) | 3     | serverAddress→URL 포함, sse→/invoke/sse, improved→/invoke/sse/improved                              |
| streamMode validation (R2)         | 5     | 잘못된 값→ValidationError, 에러 메시지 포함, sse 허용, improved 허용, env 잘못된 값→ValidationError |

## 주요 설계 결정

1. **fetch DI 패턴**: SDK 없이 raw fetch 사용, constructor injection으로 테스트
   용이
2. **SSE 자체 파서**: `EventSource`가 아닌 `POST + ReadableStream` 방식
   (DidimAIStudio 요구사항)
3. **에러 분류**: ClaudeAdapter/OpenAiAdapter 패턴 따름 (classifyHttpError)
4. **stream 에러 yield**: throw 대신 `createErrorEvent()` yield (스트림 프로토콜
   준수)
5. **Config 전달**: 계획서 방법 B 채택 → R2에서 providerConfig.ts에 typed 필드
   추가로 일관성 개선
6. **thread_id 상태**: adapter 인스턴스 내부 관리, generateContent와
   generateContentStream 모두 공유

## Phase 1 대비 변경사항

- Phase 1 converter.ts 변경 없음 (순수 함수 레이어 유지)
- Phase 1 converter.test.ts 변경 없음 (76 tests 그대로 통과)

## R1 리뷰 반영 (2026-03-14)

### 구현 수정

- **SSE multi-line data 파서 버그 수정**: `currentData` 단일 문자열 →
  `dataLines[]` 배열 + `join('\n')` (SSE 스펙 준수)

### 테스트 확장 (+15 tests)

- **1팀 #1**: bootstrap wiring 검증 — serverAddress→URL, streamMode→endpoint
  path (/sse vs /sse/improved) 실제 fetch URL 검증 (+3)
- **1팀 #3**: classifyHttpError 타입 검증 — instanceof, type, statusCode,
  isRetryable 전수 검증 (+6)
- **1팀 #4**: improved mode completion 시나리오 — message event, complete 순서,
  thread_id 재사용 (+3)
- **1팀 #5**: multi-line data: SSE 프레임 파싱 검증 (+2)
- **1팀 #6**: extractChatText 엣지 케이스 — 마지막 user 우선, 빈 결과, 이미지
  전용, 복합 parts (+4)

## R2 리뷰 반영 (2026-03-14)

### 구현 수정 (7건)

| 이슈   | 심각도 | 수정 내용                                                                                                                                                                        | 파일                                            |
| ------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1팀 #1 | High   | serverAddress 누락 시 raw Error → classified `ValidationError` + buildEndpointUrl() wrapper. non-streaming은 try 내부 호출, streaming은 generator try 내부에서 Error event yield | adapter.ts                                      |
| 1팀 #2 | High   | improved 모드 `final_message` 중복 출력 방지. `hasDeltaEmitted` 플래그로 delta 발행 후 final_message 자동 억제                                                                   | adapter.ts                                      |
| 1팀 #3 | Medium | SSE 파서 CRLF 호환 (`\r` 제거), TextDecoder 종료 flush, 스트림 종료 시 remaining buffer/dataLines flush                                                                          | adapter.ts                                      |
| 1팀 #4 | Medium | `GenerateOptions.signal` → fetch `signal` 전달. generateContent/generateContentStream 모두 AbortSignal 지원                                                                      | adapter.ts                                      |
| 1팀 #5 | Medium | `DidimProviderConfig`에 `serverAddress`/`streamMode` typed 필드 추가. `resolveProviderEnvVars`에 `DIDIM_SERVER_ADDRESS` 추가                                                     | providerConfig.ts, providerConfigIntegration.ts |
| 1팀 #6 | Medium | `extractChatText()`: "첫 번째 text part만" → "모든 text parts를 `\n`으로 결합". 복합 프롬프트 의미 손실 방지                                                                     | adapter.ts                                      |
| 1팀 #7 | Low    | bootstrap에서 streamMode 런타임 검증 — 유효값('sse', 'improved') 외 → `ValidationError` 즉시 throw                                                                               | bootstrap.ts                                    |

### 테스트 확장 (+14 tests, 총 137)

- **1팀 #1**: serverAddress 빈 값 → ValidationError (non-streaming +1, streaming
  +1, 공백 +1)
- **1팀 #2**: final_message 중복 억제 (delta 후 skip +1, delta 없으면 허용 +1)
- **1팀 #3**: CRLF 파싱 (+1), trailing blank line 없이 종료→flush (+1)
- **1팀 #4**: AbortSignal 전달 검증 (generateContent +1, generateContentStream
  +1)
- **1팀 #7**: streamMode 검증 (invalid→ValidationError +2, 유효값 허용 +2, env
  invalid +1)

### 2팀 제안 반영

- **설정 일관성**: `DidimProviderConfig`에 `serverAddress`/`streamMode` typed
  필드 추가 → 아키텍처 부채 해소 (1팀 #5와 통합 반영)
- **countTokens 리스크**: Phase 3 인수 사항에 명시적 문서화 유지 (failing test
  방식은 CI 호환성 고려하여 보류)

## R3 리뷰 반영 (2026-03-14)

### 구현 수정 (6건)

| 이슈   | 심각도 | 수정 내용                                                                                                                                                                                                    | 파일                         |
| ------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- |
| 1팀 #1 | High   | `resolveProviderEnvVars` Didim case: `baseUrl` 대신 `serverAddress`/`streamMode` 반환. 반환 타입에 typed 필드 추가                                                                                           | providerConfigIntegration.ts |
| 1팀 #2 | High   | `PROVIDER_ENV_VARS[Didim]`에 `DIDIM_SERVER_ADDRESS` 추가 → 시작 시점 환경변수 검증. `ProviderSelection`에 `serverAddress`/`streamMode` 필드 추가. `selectProvider()`에서 Didim 선택 시 해당 필드 populate    | providerSelector.ts          |
| 1팀 #3 | Medium | aggressive dedup 제거 — `hasDeltaEmitted` 플래그 및 `final_message` 억제 로직 삭제. 서버가 delta 후 refined final response 전송 가능하므로 모든 이벤트를 pass-through                                        | adapter.ts                   |
| 1팀 #4 | Medium | SSE 필드 파싱: `event: `/`data: ` (공백 필수) → `event:`/`data:` (SSE spec §9.2.4 준수, 콜론 뒤 단일 공백 선택적 제거). 메인 루프 + flush 영역 모두 수정                                                     | adapter.ts                   |
| 1팀 #5 | Medium | threadId stale capture 수정: `const threadId = this.threadId` (생성 시 캡처) → `const getThreadId = () => this.threadId` (소비 시 lazy read). generator 내부에서 `getThreadId()` 호출하여 최신 threadId 사용 | adapter.ts                   |
| 1팀 #6 | Low    | `contentGenerator.ts`에서 `process.env` 직접 참조 → `selection.serverAddress`/`selection.streamMode` 사용으로 변경. typed config flow 일관성 확보                                                            | contentGenerator.ts          |

### 테스트 변경 (+4 tests, 총 141)

- **1팀 #3**: dedup 테스트 → pass-through 테스트로 변경 (final_message가 delta
  후에도 발행됨을 검증)
- **1팀 #4**: SSE 필드 콜론 뒤 공백 없는 `data:` 파싱 (+1), `event:` 파싱 (+1),
  mixed space/no-space (+1)
- **1팀 #5**: threadId lazy read — generateContent 후 generateContentStream에서
  최신 threadId 사용 검증 (+1)
- **회귀**: providerConfigIntegration.test.ts — Didim 환경변수 테스트에
  DIDIM_SERVER_ADDRESS 추가 (PROVIDER_ENV_VARS 변경 반영)

### 전체 파이프라인 수정 요약

```
환경변수 (DIDIM_SERVER_ADDRESS, DIDIM_STREAM_MODE, DIDIM_API_KEY)
  → PROVIDER_ENV_VARS 검증 (providerSelector.ts)
  → selectProvider() → ProviderSelection { serverAddress, streamMode }
  → contentGenerator.ts → selection.serverAddress / selection.streamMode (process.env 제거)
  → AdapterConfig → bootstrap → DidimAdapter constructor
```

## 리스크 및 Phase 3 인수 사항

### countTokens UnsupportedFeatureError 전파

- BaseAdapter 기본 구현 사용 (throw UnsupportedFeatureError)
- 호출 체인에서 catch 필요 여부는 Phase 3에서 검증
- **리스크**: countTokens 호출 시 상위 레이어가 예외를 catch하지 않으면 프로세스
  중단 가능

### ContentGenerator 통합 테스트

- Phase 2는 단위 테스트 범위. E2E 통합은 Phase 3에서 검증
- `contentGenerator.ts`의 Didim 분기 로직(L306-326)은 기존 프로바이더 패턴 동일
- bootstrap 등록 + factory create 경로는 bootstrap.test.ts wiring 검증으로 커버

### contentGenerator.ts 최소 수정

- `bootstrapDidimProvider()` 호출 1줄 + Didim config wiring 4줄 추가
- 기존 프로바이더 코드 경로 변경 없음
