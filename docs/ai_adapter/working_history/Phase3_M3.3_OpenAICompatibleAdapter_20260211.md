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

## 8. 다음 단계

- M3.4.B (잔여): OpenAI-Compatible E2E 테스트 + 문서 상세화
- Phase 3 완료 후 → Phase 4 (통합/안정화)
