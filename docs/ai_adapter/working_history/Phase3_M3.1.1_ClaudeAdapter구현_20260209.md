# M3.1.1 작업 결과서 — ClaudeAdapter 구현

- **작업일**: 2026-02-09
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료

## 작업 목표

ClaudeAdapter의 핵심 메서드를 구현하여 Anthropic SDK를 통한 생성/스트리밍/토큰
카운팅을 가능하게 한다:

1. ClaudeConverter — 메시지/응답 양방향 변환
2. generateContent() — 비스트리밍 생성
3. generateContentStream() — 스트리밍 생성
4. countTokens() — 토큰 카운팅
5. Capabilities 업데이트
6. mapToProviderConfig() 구현

## 작업 순서 및 결과

| 순서 | Sub-task         | 작업 내용                                                 | 테스트 결과      |
| ---- | ---------------- | --------------------------------------------------------- | ---------------- |
| 1    | 3.1.1.1-2 (기존) | Skeleton adapter (M3.1.0에서 완료)                        | N/A              |
| 2    | RED              | converter.test.ts (40 tests) + adapter.test.ts (20 tests) | 15 FAIL / 5 PASS |
| 3    | GREEN            | converter.ts + adapter.ts 구현                            | 60/60 PASS       |
| 4    | REFACTOR         | ESLint array-type 규칙 수정                               | PASS             |

## 변경 파일 상세

### 신규 파일

#### `providers/claude/converter.ts` — ClaudeConverter

양방향 변환 클래스. GeminiConverter 패턴을 따름.

**Request 변환 (Llm → Anthropic)**:

- `toClaudeRequest(request)`: LlmGenerateRequest → MessageCreateParams 형태의
  Record
- `toClaudeMessages(messages)`: system 메시지 분리 + role 매핑
  - `system` role → 별도 `system` 파라미터로 추출
  - `assistant` → `assistant`, `user`/`tool` → `user`
- `toClaudeContent(contents)`: LlmContent → Anthropic ContentBlockParam
  - text → `{ type: 'text', text }` (동일)
  - tool_call → `{ type: 'tool_use', id, name, input }`
  - tool_result → `{ type: 'tool_result', tool_use_id, content, is_error? }`
    (object content → JSON.stringify, isError → is_error)
  - image (base64) →
    `{ type: 'image', source: { type: 'base64', media_type, data } }`
  - image (URL) → `{ type: 'text', text: '[Unsupported: ...]' }` 경고
  - thought → skip (Anthropic에 돌려보내지 않음)
- `toCountTokensRequest(request)`: countTokens 전용 — generation 파라미터 제외
- `toClaudeTools(tools)`: `input_schema` 형태로 변환
- `toClaudeToolChoice(choice)`: auto→auto, none→none, required→any,
  {name}→{type:'tool', name}

**Response 변환 (Anthropic → Llm)**:

- `fromClaudeResponse(response, model)`: Message → LlmGenerateResponse
- `fromClaudeContentBlocks(blocks)`: ContentBlock → LlmContent
  - text → LlmTextContent
  - tool_use → LlmToolCallContent
  - thinking → LlmThoughtContent
- `mapStopReason(reason)`: end_turn, max_tokens, stop_sequence, tool_use 직접
  매핑 (Gemini와 달리 값이 동일)
- `extractUsage(response)`: input_tokens → promptTokens, output_tokens →
  completionTokens

**Stream 변환**:

- `ClaudeStreamState` 인터페이스: `{ inputTokens, currentToolCalls }` (index
  기반)
- `createStreamState()`: 외부 상태 생성 (동시 스트림 안전)
- `convertStreamEvent(event, state)`: RawMessageStreamEvent → LlmEvent[]
  - `message_start` → 상태에 input_tokens 캡처
  - `content_block_start` (tool_use) → 상태에 tool call 시작
  - `content_block_delta`:
    - `text_delta` → TextDelta 즉시 발행
    - `thinking_delta` → ThoughtDelta 즉시 발행
    - `input_json_delta` → 상태에 누적
  - `content_block_stop` → 누적된 tool call을 ToolCallRequest로 발행
  - `message_delta` → Finished (stop_reason + usage)
  - `message_stop` → MessageEnd

#### `providers/claude/converter.test.ts` — 48 tests

| 카테고리               | 테스트 수 | 검증 내용                                                                                       |
| ---------------------- | --------- | ----------------------------------------------------------------------------------------------- |
| toClaudeRequest        | 6         | 기본 변환, system, 파라미터, tools, toolChoice, default max_tokens                              |
| toClaudeMessages       | 4         | user/assistant/system/tool role 매핑                                                            |
| toClaudeContent        | 5         | text, tool_call, tool_result, image, thought                                                    |
| toClaudeTools          | 2         | 변환, 빈 배열                                                                                   |
| toClaudeToolChoice     | 4         | auto, none, required→any, specific                                                              |
| fromClaudeResponse     | 5         | text, tool_use, thinking, rawResponse, empty                                                    |
| mapStopReason          | 6         | 6가지 매핑 (it.each)                                                                            |
| convertStreamEvent     | 9         | text_delta, thinking_delta, tool accumulation, **parallel tool calls**, finished, messageEnd 등 |
| toCountTokensRequest   | 3         | generation 파라미터 제외, system 포함, tools/tool_choice 포함                                   |
| tool_result edge cases | 3         | isError 전달, isError 미설정, object content stringify                                          |
| URL image handling     | 1         | URL 이미지 → 경고 텍스트 블록                                                                   |

#### `providers/claude/adapter.test.ts` — 21 tests

| 카테고리              | 테스트 수 | 검증 내용                                                    |
| --------------------- | --------- | ------------------------------------------------------------ |
| class structure       | 3         | providerName, capabilities, config validation                |
| generateContent       | 6         | SDK 호출, validation, system, tools, tool_use, error         |
| generateContentStream | 6         | text events, tool streaming, stream:true, errors, validation |
| capabilities          | 1         | 전체 capability 검증                                         |
| config validation     | 2         | apiKey 있음/없음                                             |
| countTokens           | 3         | SDK delegation, **generation 파라미터 미포함 검증**          |

### 수정 파일

#### `providers/claude/adapter.ts` — Skeleton → Full Implementation

**변경 전 (skeleton)**:

- 모든 메서드: `throw new Error('not yet implemented')`
- capabilities: 대부분 `false`

**변경 후**:

- `constructor`: `ClaudeConverter` 인스턴스 생성
- `generateContent()`: validateRequest → toClaudeRequest → create →
  fromClaudeResponse
- `generateContentStream()`: validateRequest → toClaudeRequest →
  create(stream:true) → convertStreamEvent loop
- `countTokens()`: toCountTokensRequest → countTokens 호출, 없으면
  UnsupportedFeatureError
- `mapToProviderConfig()`: temperature, max_tokens, top_p, top_k, stop_sequences
  매핑
- Capabilities: streaming, toolCalls, imageInput, tokenCount, systemMessage,
  thought 모두 `true`

#### `providers/claude/index.ts` — Export 추가

- `ClaudeConverter`, `ClaudeStreamState` export 추가

## Quality Gate

| 항목          | 결과                       |
| ------------- | -------------------------- |
| TypeCheck     | ✅ PASS                    |
| ESLint        | ✅ PASS                    |
| Claude 테스트 | ✅ 4 files / 72 passed     |
| Provider 회귀 | ✅ 29 files / 515 passed   |
| Core 전체     | ✅ 266 files / 4951 passed |

**변화**: 기준선 263 files / 4885 → +3 files, +66 tests

## 설계 결정

### ClaudeConverter 상태 관리 — 외부 상태 패턴

- **결정**: `ClaudeStreamState` 인터페이스를 외부에서 관리
- **근거**: GeminiConverter는 stateless (Gemini 스트림은 chunk 단위로 완결).
  Claude 스트림은 tool call JSON이 여러 delta에 걸쳐 분산되므로 상태 관리 필요.
  converter 내부 상태를 쓰면 동시 스트림 시 충돌 → 외부 상태 패턴 채택.

### Record<string, unknown> vs SDK 타입

- **결정**: converter에서 Anthropic SDK 타입 대신 `Record<string, unknown>` 사용
- **근거**: ClaudeClient 인터페이스가 이미 `Record<string, unknown>`을 사용. SDK
  타입 import 없이도 테스트 가능. GeminiConverter는 SDK 타입을 직접 사용하나,
  Claude converter는 DI 인터페이스와의 일관성 우선.

### Capabilities 전면 활성화

- **결정**: M3.1.1에서 streaming, toolCalls, imageInput, tokenCount, thought
  모두 `true`로 설정
- **근거**: converter에서 tool_call, tool_result, image(base64), thinking 변환을
  모두 구현하고 테스트 통과. M3.1.0 리뷰에서 "구현과 capability 불일치" 이슈가
  있었으므로 구현 완료 즉시 활성화.

### default max_tokens = 8192

- **결정**: `max_tokens` 미지정 시 8192 기본값
- **근거**: Claude API는 `max_tokens` 필수 파라미터. adapter의
  `maxOutputTokens: 8192`와 일치. 모델별 최대값은 다를 수 있으나 안전한 기본값.

## 리뷰 반영 (2026-02-09)

### 리뷰 이슈 및 수정 결과

| #   | 심각도 | 이슈                                                                                                | 수정 내용                                                                                              |
| --- | ------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | 중간   | countTokens()가 toClaudeRequest() 재사용 — MessageCountTokensParams에 없는 generation 파라미터 포함 | `toCountTokensRequest()` 신규 메서드 추가. model, messages, system, tools, tool_choice만 포함          |
| 2   | 중간   | Stream tool call이 index 무시 — 단일 currentToolCall로 병렬 tool call 시 데이터 손상                | `ClaudeStreamState.currentToolCall` → `currentToolCalls: Record<number, ...>` index 기반 추적으로 변경 |
| 3   | 낮음   | tool_result 변환에서 isError 누락 + object content 직접 전달                                        | `isError: true`일 때 `is_error` 필드 추가, object content는 `JSON.stringify()` 처리                    |
| 4   | 낮음   | supportsImageInput: true이나 URL 이미지 무시(silent drop)                                           | URL 이미지 시 경고 텍스트 블록 발행: `[Unsupported: URL image cannot be sent to Claude API: {url}]`    |

### 추가된 테스트

| 파일              | 추가 테스트 수 | 검증 내용                                                                 |
| ----------------- | -------------- | ------------------------------------------------------------------------- |
| converter.test.ts | 7              | toCountTokensRequest(3), parallel tool calls(1), isError(2), URL image(1) |
| adapter.test.ts   | 1              | countTokens에 generation 파라미터 미포함 검증                             |

### 리뷰 후 Quality Gate

| 항목          | 결과                       |
| ------------- | -------------------------- |
| TypeCheck     | ✅ PASS                    |
| ESLint        | ✅ PASS                    |
| Claude 테스트 | ✅ 4 files / 81 passed     |
| Provider 회귀 | ✅ 29 files / 524 passed   |
| Core 전체     | ✅ 266 files / 4960 passed |

**변화**: 리뷰 전 72 tests → 81 tests (+9), Core 4951 → 4960 (+9)

## 향후 작업

- M3.1.2: Claude 메시지 변환 고도화 (에지 케이스, 복합 콘텐츠)
- M3.1.3: Claude 스트림 변환 고도화 (에러 스트림, 부분 실패, 재시도)
- M3.1.4: Claude 에러 매핑 (APIError → LlmError 계층 변환)

## 커밋

- `9f538e0d7` feat(providers): M3.1.1 — ClaudeAdapter 구현 (converter +
  generate + stream + countTokens)
- `d99be5859` fix(providers): M3.1.1 리뷰 반영 — countTokens 파라미터 분리, 병렬
  tool call, isError/URL 이미지 처리
