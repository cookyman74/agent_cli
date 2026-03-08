# Phase T: OpenAI Responses API 지원

- 날짜: 2026-03-08
- 목적: `gpt-5.3-codex`, `gpt-5.4-pro`가 요구하는 OpenAI Responses
  API(`/v1/responses`) 경로를 adapter에 구현하여 404 오류 해결

## 배경

Phase S에서 `gpt-5.3-codex` 선택 시 발생하던 404 오류를 진단한 결과, 원인은 해당
모델이 Chat Completions API(`/v1/chat/completions`)를 지원하지 않고 Responses
API(`/v1/responses`)만 지원하기 때문이었다.

```
✕ [API Error: 404 This is not a chat model and thus not supported in the v1/chat/completions endpoint.]
```

Context7을 통해 OpenAI 공식 문서 확인:

- "Support for the Chat Completions API is deprecated and will be removed in
  future releases of Codex."
- Responses API는 `input` (not `messages`), `developer` role (not `system`),
  `max_output_tokens` (not `max_completion_tokens`) 사용

## 변경 파일

### 신규 생성

| 파일                                                            | 설명                                                |
| --------------------------------------------------------------- | --------------------------------------------------- |
| `packages/core/src/providers/openai/responsesConverter.ts`      | Responses API 전용 변환기 (request/response/stream) |
| `packages/core/src/providers/openai/responsesConverter.test.ts` | 변환기 테스트 (16 tests)                            |

### 수정

| 파일                                                                            | 설명                                                            |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `packages/core/src/providers/openai/adapter.ts`                                 | 듀얼 API 라우팅 (`RESPONSES_API_MODELS` set 기반)               |
| `packages/core/src/providers/openai/adapter.test.ts`                            | Responses API 라우팅 테스트 추가 (11 tests)                     |
| `packages/core/src/providers/openai/bootstrap.test.ts`                          | mock에 `responses.create` 추가                                  |
| `packages/core/src/providers/openai-compatible/__tests__/compatibility.test.ts` | mock에 `responses.create` 추가                                  |
| `packages/core/src/providers/openai-compatible/adapter.test.ts`                 | mock에 `responses.create` 추가                                  |
| `packages/core/src/providers/openai-compatible/bootstrap.test.ts`               | mock에 `responses.create` 추가                                  |
| `packages/core/src/config/providerModels.ts`                                    | `gpt-5.4-pro` manual 목록 복원 (Responses API 지원으로)         |
| `packages/core/src/config/providerModels.test.ts`                               | `gpt-5.4-pro` 포함 확인 테스트 갱신                             |
| `packages/cli/src/ui/components/ModelDialog.test.tsx`                           | `gpt-5.4-pro` 표시 확인 테스트 갱신                             |
| `docs/providers.md`                                                             | OpenAI 모델 목록에 `gpt-5.4-pro` 추가                           |
| `docs/cli/model.md`                                                             | OpenAI manual 목록에 `gpt-5.4-pro` 추가, Phase S 제한 노트 제거 |
| `docs/index.md`                                                                 | OpenAI 모델 목록에 `gpt-5.4-pro` 추가                           |
| `docs/get-started/authentication.md`                                            | OpenAI 모델 목록에 `gpt-5.4-pro` 추가                           |

## 핵심 설계

### 듀얼 API 라우팅

```typescript
const RESPONSES_API_MODELS = new Set(['gpt-5.3-codex', 'gpt-5.4-pro']);

function isResponsesApiModel(model: string): boolean {
  return RESPONSES_API_MODELS.has(model);
}
```

- `generateContent()` / `generateContentStream()` 진입 시 모델 확인
- `RESPONSES_API_MODELS`에 포함 → `client.responses.create()` 경로
- 그 외 → `client.chat.completions.create()` 경로 (기존)

### Responses API 차이점

| 항목          | Chat Completions                                         | Responses API                                                |
| ------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| 엔드포인트    | `/v1/chat/completions`                                   | `/v1/responses`                                              |
| 입력 필드     | `messages`                                               | `input`                                                      |
| 시스템 role   | `system`                                                 | `developer`                                                  |
| 출력 토큰     | `max_completion_tokens`                                  | `max_output_tokens`                                          |
| 응답 구조     | `choices[].message`                                      | `output[]` (type: message/function_call)                     |
| 사용량        | `prompt_tokens/completion_tokens`                        | `input_tokens/output_tokens`                                 |
| 도구 정의     | `{ type: 'function', function: { name, ... } }` (nested) | `{ type: 'function', name, description, parameters }` (flat) |
| 도구 결과     | `{ role: "tool", tool_call_id }`                         | `{ type: "function_call_output", call_id }`                  |
| tool_choice   | `{ type: 'function', function: { name } }`               | `{ type: 'function', name }`                                 |
| 스트림 이벤트 | chunk.choices[].delta                                    | typed SSE (response.output_text.delta 등)                    |

### OpenAiResponsesConverter 클래스

- `toResponsesRequest()`: system→developer, messages→input,
  tool_result→function_call_output
- `fromResponsesResponse()`: output items 파싱, usage 매핑
- `createStreamState()` / `convertStreamEvent()`: SSE 이벤트 변환

## 테스트 결과

```
Core: 294 files, 5973 tests passed
CLI ModelDialog: 30 tests passed
Typecheck: clean
Lint: clean
```

## Phase S와의 차이

Phase S는 `gpt-5.4-pro`를 임시로 차단하고 `gpt-5.3-codex` 문제를 환경 오염으로
추정했지만, 실제 원인은 Responses API 미지원이었다. Phase T에서:

1. `RESPONSES_ONLY_OPENAI_MODELS` (차단 set) → `RESPONSES_API_MODELS` (라우팅
   set)으로 전환
2. `validateModelCompatibility()` 제거 (차단 불필요)
3. `gpt-5.4-pro` manual 목록 복원

## 알려진 제한

- `gpt-5.3-codex` 공식 가격 미확인 → `costEstimation.ts` 미반영
- Responses API의 고급 기능 (background mode, reasoning 등) 미구현
