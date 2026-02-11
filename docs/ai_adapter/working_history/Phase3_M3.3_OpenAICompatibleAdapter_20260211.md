# M3.3: OpenAI-Compatible(vLLM/sLM) 어댑터 구현 작업 결과서

- **작업일**: 2026-02-11
- **브랜치**: `DID/v0.1`
- **상태**: ✅ Complete

---

## 1. 작업 범위

M3.3 전체 — OpenAI 호환 API 서버(vLLM, TGI, LM Studio, Ollama) 지원 어댑터 구현.

| 섹션                | 항목 수 | 완료   | 연기  | 비고                                   |
| ------------------- | ------- | ------ | ----- | -------------------------------------- |
| 3.3.0 사전 준비     | 1       | 1      | 0     | Bootstrap 등록                         |
| 3.3.1 Adapter 구현  | 6       | 6      | 0     | 상속 + capabilities + testConnection   |
| 3.3.2 템플릿 훅     | 4       | 2      | 2     | Llama3/Mistral 서버 사이드 처리로 연기 |
| 3.3.3 호환성 테스트 | 4       | 4      | 0     | vLLM/TGI/LM Studio/Ollama 시나리오     |
| **합계**            | **15**  | **13** | **2** |                                        |

---

## 2. 핵심 설계 결정

### 2.1 Tidy First 불필요

`OpenAiAdapter`의 `converter`(private)와 `classifyError`(private)는 상속된
메서드(`generateContent`, `generateContentStream`) 내부에서 사용되므로,
서브클래스가 직접 접근할 필요 없음. `client`는 이미 `protected`. → 구조적 변경
커밋 없이 바로 동작 변경 진행.

### 2.2 상속 전략

```
BaseAdapter (abstract)
  └── OpenAiAdapter (converter + classifyError + generate*)
        └── OpenAiCompatibleAdapter (providerName + capabilities + testConnection)
```

- `OpenAiAdapter`의 전체 로직(변환, 스트리밍, 에러 분류) 재사용
- 오버라이드: `providerName`, `capabilities`, `testConnection()`만 추가

### 2.3 Custom Headers 아키텍처

`AdapterConfig`/`ProviderSelection` 인터페이스 수정 없이, bootstrap factory
내부에서 `LLM_CUSTOM_HEADERS`(JSON), `LLM_API_KEY_HEADER` 환경변수를 직접 읽어
OpenAI SDK `defaultHeaders`로 주입.

### 2.4 보수적 Capabilities

로컬 모델은 imageInput/toolCalls를 지원하지 않을 수 있으므로 보수적 기본값 설정.
`config['capabilities']`로 partial override 지원.

```typescript
const DEFAULTS: LlmProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsImageInput: false, // 보수적
  supportsTokenCount: false, // 로컬 서버 미지원
  supportsThought: false, // 로컬 서버 미지원
  maxContextLength: 32_768, // 보수적
  maxOutputTokens: 4_096, // 보수적
};
```

### 2.5 PromptBuilder 최소 구현

vLLM/TGI/Ollama는 `/v1/chat/completions` 엔드포인트에서 서버 사이드 chat
template 처리. `PromptBuilder` 인터페이스 + `ChatMLPromptBuilder`만 구현,
Llama3/Mistral template은 연기.

---

## 3. 신규 파일

| #   | 파일                                                          | 유형     | 테스트 수 |
| --- | ------------------------------------------------------------- | -------- | --------- |
| 1   | `providers/openai-compatible/bootstrap.ts`                    | 프로덕션 | —         |
| 2   | `providers/openai-compatible/bootstrap.test.ts`               | 테스트   | 10        |
| 3   | `providers/openai-compatible/adapter.ts`                      | 프로덕션 | —         |
| 4   | `providers/openai-compatible/adapter.test.ts`                 | 테스트   | 15        |
| 5   | `providers/openai-compatible/index.ts`                        | 프로덕션 | —         |
| 6   | `providers/openai-compatible/promptBuilder.ts`                | 프로덕션 | —         |
| 7   | `providers/openai-compatible/promptBuilder.test.ts`           | 테스트   | 5         |
| 8   | `providers/openai-compatible/__tests__/compatibility.test.ts` | 테스트   | 12        |

## 4. 수정 파일

| #   | 파일                                                    | 변경 내용                                                |
| --- | ------------------------------------------------------- | -------------------------------------------------------- |
| 1   | `providers/index.ts`                                    | `OpenAiCompatible` 네임스페이스 export 추가              |
| 2   | `core/contentGenerator.ts`                              | `bootstrapOpenAiCompatibleProvider()` import + 호출 추가 |
| 3   | `providers/__tests__/multiProvider.integration.test.ts` | 4번째 provider `openai-compatible` 추가 (11 tests)       |

---

## 5. 테스트 결과

### 5.1 신규 테스트 (42 tests)

```
✓ bootstrap.test.ts          (10 tests)  — 등록, 중복 방지, SDK 옵션, custom headers
✓ adapter.test.ts            (15 tests)  — 구조, capabilities, generate, stream, testConnection
✓ promptBuilder.test.ts       (5 tests)  — ChatML 포맷 (single/multi/empty)
✓ compatibility.test.ts      (12 tests)  — vLLM(4) + TGI(3) + LM Studio(2) + Ollama(3)
```

### 5.2 통합 테스트 (11 tests)

```
✓ multiProvider.integration.test.ts  (11 tests)  — 4-provider switching + concurrent
```

### 5.3 회귀 테스트

| 범위                      | 결과          |
| ------------------------- | ------------- |
| OpenAI 기존 (106 tests)   | ✅ All passed |
| Core 전체 (386+1 tests)   | ✅ All passed |
| Providers 통합 (53 tests) | ✅ All passed |
| Lint                      | ✅ Clean      |
| Typecheck                 | ✅ Clean      |

---

## 6. 연기 항목

| ID      | 항목                 | 사유                                                |
| ------- | -------------------- | --------------------------------------------------- |
| 3.3.2.2 | Llama3 ChatTemplate  | 서버 사이드에서 `/v1/chat/completions` 시 자동 적용 |
| 3.3.2.3 | Mistral ChatTemplate | 서버 사이드에서 `/v1/chat/completions` 시 자동 적용 |

향후 raw `/v1/completions` 지원 시 구현 필요.

---

## 7. 이슈 및 해결

### 7.1 apiKey 빈 문자열

OpenAI SDK가 빈 apiKey를 거부할 수 있으므로, 로컬 서버용으로 `'not-needed'`
placeholder 사용.

### 7.2 ESLint array-type / object-shorthand

`Array<LlmEvent>` → `LlmEvent[]`, `async function*` →
`async *[Symbol.asyncIterator]()` 수정.

---

## 8. 리뷰 반영 (2026-02-11)

### 8.1 높음: LLM_API_KEY_HEADER 중복 Authorization 방지

**문제**: `LLM_API_KEY_HEADER` 설정 시 커스텀 헤더에 API key를 넣으면서도,
`apiKey`를 그대로 SDK에 전달하여 `Authorization: Bearer` 헤더가 중복 주입됨.

**1차 수정**: `useCustomAuthHeader` 플래그 도입. 커스텀 auth 헤더 사용 시 SDK
`apiKey`를 `'not-needed'`로 설정하여 기본 Authorization 헤더 억제.

**2차 수정 (8.6)**: `apiKey: 'not-needed'`만으로는
`Authorization: Bearer not-needed` 헤더가 여전히 생성됨 확인. OpenAI SDK
`buildHeaders`(`client.mjs:462-484`)는 `authHeaders` → `defaultHeaders` 순서로
병합하며, `headers.mjs:57-59`에서 `null` 값은 해당 헤더를 삭제함.
`defaultHeaders`에 `Authorization: null`을 추가하여 `Authorization` 헤더를
완전히 제거.

**테스트 추가**: `should suppress default apiKey when LLM_API_KEY_HEADER is set`
(검증: `apiKey: 'not-needed'` + `defaultHeaders.Authorization: null`)

### 8.2 중간: signal 미전달 (오인 — 수정 불필요)

**검증 결과**: OpenAI SDK `create(body, options?: RequestOptions)`는 2번째
인자에 `{ signal: AbortSignal }` 전달을 지원함. 우리 코드는 이미
`create(params, { signal })` 로 전달 중이며, `OpenAiClient` 인터페이스도
`options?` 파라미터를 포함. `OpenAiCompatibleAdapter`는 `OpenAiAdapter`를
상속하므로 동일 경로로 signal 전달됨.

**결론**: 추가 수정 불필요.

### 8.3 중간: default model gpt-4o → 'default' 변경

**문제**: `DEFAULT_PROVIDER_MODELS[OpenAICompatible]`이 `'gpt-4o'`여서, 로컬
서버에 `gpt-4o`를 요청하면 모델 미존재 에러 발생.

**수정**: `'gpt-4o'` → `'default'`로 변경. 로컬 서버는 `model: 'default'` 시
로드된 첫 번째 모델을 사용하거나 모델명을 무시함. `LLM_MODEL` env var가 있으면
항상 우선 사용되므로, `'default'`는 최후 폴백으로만 동작.

### 8.4 낮음: baseUrl 누락 시 생성자 가드

**문제**: `ProviderFactory.create('openai-compatible', {})` 호출 시 baseUrl 없이
생성되어 의도치 않게 기본 OpenAI 엔드포인트로 향할 수 있음.

**수정**: `OpenAiCompatibleAdapter` 생성자에 `baseUrl` 필수 검증 추가. 누락 시
명확한 에러 메시지와 함께 throw.

**테스트 추가**: `should throw when baseUrl is missing`

### 8.5 1차 리뷰 반영 후 테스트 결과

| 범위                         | 결과          |
| ---------------------------- | ------------- |
| openai-compatible (44 tests) | ✅ All passed |
| Providers 전체 (811 tests)   | ✅ All passed |
| Lint                         | ✅ Clean      |
| Build                        | ✅ Success    |

### 8.6 2차 리뷰: Authorization 헤더 완전 제거

**문제**: 1차 수정에서 `apiKey: 'not-needed'`를 SDK에 전달했으나, SDK 내부에서
`Authorization: Bearer not-needed` 헤더가 여전히 생성됨.
`new OpenAI({ apiKey: 'not-needed' }).authHeaders({})` 결과:
`{ Authorization: 'Bearer not-needed' }` → 일부 서버에서 인증 충돌 가능.

**원인 분석**: OpenAI SDK `buildHeaders`(`client.mjs:462-484`)는 다음 순서로
병합:
`idempotency → base → authHeaders → defaultHeaders → bodyHeaders → options.headers`.
`authHeaders`는 `apiKey`로부터 `Authorization: Bearer <key>`를 자동 생성.

**해결**: SDK의 `headers.mjs:57-59`에서 `null` 값은 해당 키를 삭제하는 메커니즘
발견. `defaultHeaders`에 `Authorization: null`을 설정하면, 먼저 병합된
`authHeaders`의 `Authorization`이 삭제됨.

**수정 내용** (`bootstrap.ts`):

```typescript
const sdkHeaders: Record<string, string | null> = { ...defaultHeaders };
if (useCustomAuthHeader) {
  sdkHeaders['Authorization'] = null;
}
```

**테스트 업데이트**: `Authorization: null` 포함 검증 추가.

### 8.7 2차 리뷰 반영 후 테스트 결과

| 범위                         | 결과          |
| ---------------------------- | ------------- |
| openai-compatible (44 tests) | ✅ All passed |
| Providers 전체 (811 tests)   | ✅ All passed |
| Lint                         | ✅ Clean      |
| Typecheck                    | ✅ Clean      |
| Build                        | ✅ Success    |

---

## 9. 다음 단계

- M3.4.B (잔여): OpenAI-Compatible E2E 테스트 + 문서 상세화
- Phase 3 완료 후 → Phase 4 (통합/안정화)
