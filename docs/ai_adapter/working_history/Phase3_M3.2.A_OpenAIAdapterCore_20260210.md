# M3.2.A 작업 결과서 — OpenAI 어댑터 Core (부트스트랩 + 변환기 + 어댑터)

- **작업일**: 2026-02-10
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료

## 작업 목표

OpenAI SDK를 래핑하는 어댑터/변환기의 Core 부분(비스트림)을 TDD로 구현:

1. SDK 설치 및 부트스트랩 (`bootstrapOpenAiProvider`)
2. 요청/응답 변환기 (`OpenAiConverter`)
3. 어댑터 비스트림 동작 (`OpenAiAdapter.generateContent`)
4. 에러 분류 (`classifyError`)
5. 네임스페이스 export

## 사전 분석

### SDK 버전 차이

| 항목         | 설계서               | 실제                                                      |
| ------------ | -------------------- | --------------------------------------------------------- |
| SDK 버전     | `^4.70.0`            | `^6.18.0`                                                 |
| max_tokens   | `max_tokens`         | `max_completion_tokens` (deprecated `max_tokens`)         |
| tool_choice  | `auto\|none\|{name}` | `auto\|none\|required\|{type:'function',function:{name}}` |
| stream usage | N/A                  | `stream_options: { include_usage: true }`                 |

### 설계서 대비 구현 범위

| 설계서 요구 사항      | 구현 상태 | 비고                                                              |
| --------------------- | --------- | ----------------------------------------------------------------- |
| OpenAI SDK 연동       | ✅        | `openai@^6.18.0`                                                  |
| BaseAdapter 상속      | ✅        | generateContent, generateContentStream(스켈레톤)                  |
| 메시지 변환 (4 roles) | ✅        | system/user/assistant/tool                                        |
| 이미지 변환           | ✅        | base64→data URI, URL 직접 전달                                    |
| 도구 변환             | ✅        | function wrapping                                                 |
| JSON mode             | ✅        | responseFormat→response_format                                    |
| 에러 매핑             | ✅        | Claude 패턴과 동일 classifyError                                  |
| countTokens           | ✅        | `supportsTokenCount: false` → BaseAdapter UnsupportedFeatureError |
| 스트림 변환           | ⚠️        | 스켈레톤만 (M3.2.B 범위)                                          |

### Claude 어댑터 대비 차이점

| 항목             | Claude                                          | OpenAI                                    |
| ---------------- | ----------------------------------------------- | ----------------------------------------- |
| System 메시지    | 별도 `system` 파라미터 추출                     | messages 배열에 `role: 'system'`으로 포함 |
| Tool result 역할 | `user` role + tool_result 블록 (연속 role 병합) | `tool` role (직접 지원, 병합 불필요)      |
| 이미지 지원      | base64만 (URL 미지원)                           | base64→data URI + URL 직접 전달           |
| max_tokens       | 필수 파라미터 (default 8192)                    | 선택 파라미터 (`max_completion_tokens`)   |
| Thought/Thinking | 지원 (`supportsThought: true`)                  | 미지원 (`supportsThought: false`)         |
| Token counting   | SDK `countTokens()` 있음                        | SDK에 없음 (`supportsTokenCount: false`)  |
| response_format  | 미지원                                          | `json_object` 매핑                        |
| 529 overloaded   | 있음 (MODEL_OVERLOADED)                         | 없음                                      |

## 작업 순서 및 결과

| 순서 | 작업                             | 테스트 수 | 결과    |
| ---- | -------------------------------- | --------- | ------- |
| 1    | RED: bootstrap.test.ts           | 7         | 7 FAIL  |
| 2    | RED: converter.test.ts           | 40        | 40 FAIL |
| 3    | RED: adapter.test.ts             | 27        | 27 FAIL |
| 4    | GREEN: converter.ts              | 40        | 40 PASS |
| 5    | GREEN: adapter.ts + bootstrap.ts | 34        | 34 PASS |
| 6    | Fix: TypeCheck + ESLint          | 74        | 74 PASS |

## 변경 파일 상세

### 신규 파일

| 파일                                 | 역할                             | 라인 수 |
| ------------------------------------ | -------------------------------- | ------- |
| `providers/openai/converter.ts`      | 요청/응답/스트림 변환기          | ~290    |
| `providers/openai/adapter.ts`        | OpenAiAdapter (BaseAdapter 상속) | ~170    |
| `providers/openai/bootstrap.ts`      | 팩토리 등록 + has() 가드         | ~40     |
| `providers/openai/index.ts`          | 퍼블릭 export                    | ~15     |
| `providers/openai/converter.test.ts` | 변환기 TDD 테스트                | ~330    |
| `providers/openai/adapter.test.ts`   | 어댑터 TDD 테스트                | ~260    |
| `providers/openai/bootstrap.test.ts` | 부트스트랩 TDD 테스트            | ~90     |

### 수정 파일

| 파일                         | 변경 내용                                     |
| ---------------------------- | --------------------------------------------- |
| `providers/index.ts`         | `import * as OpenAi` 네임스페이스 export 추가 |
| `packages/core/package.json` | `"openai": "^6.18.0"` 의존성 추가             |

## 테스트 현황

### bootstrap.test.ts — 7 tests

| 테스트            | 검증 내용                        |
| ----------------- | -------------------------------- |
| register factory  | `has('openai')` false→true       |
| has() guard       | 중복 호출 안전성                 |
| createAdapter     | `providerName === 'openai'`      |
| singleton default | 인수 없이 호출 시 singleton 사용 |
| apiKey passing    | SDK에 apiKey 전달                |
| baseURL passing   | SDK에 baseURL 전달               |
| undefined apiKey  | 누락 시 안전 처리                |

### converter.test.ts — 40 tests

| 카테고리           | 테스트 수 | 검증 내용                                                                                                                                                                |
| ------------------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| toOpenAiRequest    | 7         | model, max_completion_tokens, temperature/topP/stop, tools, tool_choice, response_format, systemInstruction                                                              |
| toOpenAiMessages   | 12        | user/assistant/system/tool 4 role, tool_call, tool_result JSON serialize, base64→data URI, URL image, mixed content, thought skip, empty skip, assistant text+tool_calls |
| toOpenAiTools      | 2         | function wrapping, optional required                                                                                                                                     |
| toOpenAiToolChoice | 4         | auto/none/required/specific name                                                                                                                                         |
| fromOpenAiResponse | 6         | text, tool_calls, text+tool_calls, invalid JSON args, fallback model, cached_tokens                                                                                      |
| mapFinishReason    | 8         | stop/length/tool_calls/content_filter/function_call/null/undefined/unknown                                                                                               |
| createStreamState  | 1         | fresh state creation                                                                                                                                                     |

### adapter.test.ts — 27 tests

| 카테고리             | 테스트 수 | 검증 내용                                                                             |
| -------------------- | --------- | ------------------------------------------------------------------------------------- |
| capabilities         | 9         | 9개 capability 플래그 검증                                                            |
| generateContent      | 6         | SDK 호출, 응답 변환, validation (model/messages), classifyError, LlmError passthrough |
| countTokens          | 1         | UnsupportedFeatureError throw                                                         |
| error classification | 10        | 8 status codes, timeout heuristic, network fallback                                   |
| mapToProviderConfig  | 1         | construction 성공 확인                                                                |

## Quality Gate

| 항목          | 결과                     |
| ------------- | ------------------------ |
| TypeCheck     | ✅ PASS                  |
| ESLint        | ✅ PASS                  |
| OpenAI 테스트 | ✅ 3 files / 74 passed   |
| Provider 회귀 | ✅ 32 files / 631 passed |

**변화**: 기준선 29 files / 557 → 32 files / 631 (+3 files, +74 tests)

## 설계 결정

### max_completion_tokens vs max_tokens

- **결정**: `max_completion_tokens` 사용
- **근거**: OpenAI SDK v6.x에서 `max_tokens` 는 deprecated. 최신 SDK 규약 준수.

### supportsTokenCount: false

- **결정**: countTokens 미지원, BaseAdapter 기본 UnsupportedFeatureError 위임
- **근거**: OpenAI SDK에 내장 countTokens 없음. tiktoken 별도 의존성 추가는
  YAGNI.

### supportsThought: false

- **결정**: extended thinking 미지원
- **근거**: 표준 Chat Completions API에 thinking 블록 없음. o-series reasoning은
  별도 API.

### OpenAI 네이티브 role 활용

- **결정**: Claude와 달리 role 병합 로직 불필요
- **근거**: OpenAI API가 system/user/assistant/tool 4개 role을 네이티브로 지원.
  tool_result는 `role: 'tool'`로 직접 매핑.

### classifyError Claude 패턴 재사용

- **결정**: Claude adapter의 classifyError와 동일 구조 사용
- **근거**: HTTP status code 기반 분류 로직은 프로바이더 독립적. DI 유지 (duck
  typing).

## 향후 작업

- **M3.2.B**: 스트림 변환기 구현 (`convertStreamEvent`), 스트림 에러 처리 고도화
  - text_delta, tool_call delta, finish_reason, usage 추출
  - `stream_options: { include_usage: true }` 활용
