# M3.4.2 작업 결과서 — E2E 테스트 시나리오 (Gemini/Claude/OpenAI)

- **작업일**: 2026-02-10
- **브랜치**: `DID/v0.1`
- **상태**: ✅ 완료
- **이전 작업**:
  [Phase3_M3.4.A_CLI통합\_3Provider통합테스트\_20260210.md](./Phase3_M3.4.A_CLI통합_3Provider통합테스트_20260210.md)

---

## 📋 작업 개요

### 목표

M3.4.A CLI 통합(processLlmTurn) 완료 이후, 각 프로바이더별 CLI **전체 플로우**
(입력→API호출→응답표시→도구실행→에러처리)가 정상 동작하는지 E2E 테스트로
검증한다.

1. **Stage 1**: FakeContentGenerator 회귀 버그 수정 (Tidy First)
2. **Stage 2**: Golden response 파일 12개 생성
3. **Stage 3**: E2E 테스트 파일 작성 (12 tests)
4. **Stage 4**: 테스트 실행, 문제 발견 및 수정

### 작업 범위

- **대상**: 3.4.2.1 Gemini, 3.4.2.2 Claude, 3.4.2.3 OpenAI
- **제외**: 3.4.2.4 vLLM (M3.3 의존성)
- **시나리오**: basic, streaming, tool-call, error (4개 × 3 providers = 12
  tests)
- **기반**: TestRig + FakeContentGenerator + golden `.responses` 파일

---

## 🔴 사전 분석 — FakeContentGenerator 회귀 버그 발견

### 문제

M3.4.A에서 추가된 `client.ts` non-Gemini 감지 조건:

```typescript
isProviderIndependentGenerator(generator) &&
  generator.providerName !== 'gemini';
```

- `FakeContentGenerator`는 `llm*` 메서드 3개 모두 구현 →
  `isProviderIndependentGenerator` = `true`
- `providerName` 필드 미선언 → `undefined`
- `undefined !== 'gemini'` → `true`
- **→ 기존 Gemini E2E 테스트가 non-Gemini 경로(processLlmTurn)로 진입하는
  회귀!**

### 해결 (Stage 1 — Tidy First)

| 파일                                      | 변경 내용                                                            |
| ----------------------------------------- | -------------------------------------------------------------------- |
| `core/client.ts` (line 641)               | `generator.providerName != null &&` null 체크 추가                   |
| `core/fakeContentGenerator.ts` (line 63)  | `providerName?: string` 필드 추가                                    |
| `core/contentGenerator.ts` (line 252-262) | `LLM_PROVIDER` env 기반 `providerName` + `resolveProviderModel` 설정 |

---

## 🟢 Green Phase (구현)

### Stage 2: Golden Response 파일 (12개)

**Gemini** — `generateContentStream` 형식 (GenerateContentResponse[]):

| 파일                         | 시나리오                                                         |
| ---------------------------- | ---------------------------------------------------------------- |
| `gemini-basic.responses`     | 단일 텍스트 응답                                                 |
| `gemini-streaming.responses` | 멀티 청크 (3개 candidates)                                       |
| `gemini-tool-call.responses` | 2-turn: functionCall(`list_directory`, `dir_path`) + 결과 텍스트 |
| `gemini-error.responses`     | 에러 상황 텍스트 응답                                            |

**Claude/OpenAI** — `llmGenerateContentStream` 형식 (LlmEvent[]):

| 파일                                  | 시나리오                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------- |
| `{claude,openai}-basic.responses`     | TextDelta + Finished(end_turn)                                                              |
| `{claude,openai}-streaming.responses` | TextDelta × 4 + Finished(end_turn, usage)                                                   |
| `{claude,openai}-tool-call.responses` | TextDelta + ToolCallRequest(`list_directory`, `dir_path`) + Finished → TextDelta + Finished |
| `{claude,openai}-error.responses`     | Error(rate_limit, isRetryable=true)                                                         |

### Stage 3: E2E 테스트 파일

**파일**: `integration-tests/multi-provider.test.ts`

| Provider | Basic                 | Streaming      | Tool Call                  | Error                 |
| -------- | --------------------- | -------------- | -------------------------- | --------------------- |
| Gemini   | 텍스트 출력 검증      | 멀티 청크 연결 | list_directory 실행 + 결과 | 에러 텍스트 표시      |
| Claude   | `LLM_PROVIDER=claude` | 멀티 청크 연결 | list_directory 실행 + 결과 | non-zero exit (throw) |
| OpenAI   | `LLM_PROVIDER=openai` | 멀티 청크 연결 | list_directory 실행 + 결과 | non-zero exit (throw) |

**테스트 패턴**:

- Basic/Streaming: `rig.run()` → `validateModelOutput(result, expectedContent)`
- Tool Call: `rig.setup({ settings: { tools: { core: ['list_directory'] } } })`
  → `createFile` → `poll` → `run` → `expectToolCallSuccess`
- Error (Gemini): 정상 텍스트 응답으로 처리
- Error (Claude/OpenAI): `LlmEventType.Error` → `nonInteractiveCli`
  `throw event.error` → non-zero exit → try/catch 검증

---

## 🐛 이슈 및 해결

### 이슈 1: FakeContentGenerator 회귀 (Stage 1)

- **증상**: Gemini E2E 테스트가 `processLlmTurn` 경로 진입 →
  `generateContentStream` response를 `llmGenerateContentStream`으로 해석 시도 →
  crash
- **원인**: `isProviderIndependentGenerator` + `undefined !== 'gemini'` = `true`
- **해결**: `providerName != null` 가드 추가, `providerName` 필드 추가,
  `LLM_PROVIDER` env 기반 설정

### 이슈 2: list_directory 파라미터명 (Stage 4)

- **증상**:
  `Error executing tool list_directory: params must have required property 'dir_path'`
- **원인**: golden response에서 `"args": {"path": "."}` 사용 — 실제 tool
  schema는 `dir_path`
- **해결**: 3개 tool-call response 파일 모두 `"path"` → `"dir_path"` 수정

### 이슈 3: ESLint no-unnecessary-type-assertion (Stage 4)

- **증상**: `generator.providerName!` — null 체크 이후 불필요한 non-null
  assertion
- **원인**: `providerName != null` 가드 이후 TypeScript narrowing 적용됨
- **해결**: `providerName!` → `providerName` 수정

### 이슈 4: esbuild 번들 반영 누락 (Stage 4)

- **증상**: 번들에 null 체크 코드 미포함 → Gemini 테스트 여전히 실패
- **원인**: `npm run bundle`은 esbuild로 `.ts` 소스 직접 번들하지만, 첫 번들이
  변경 전 상태로 캐시됨
- **해결**: Stage 1 수정 후 재번들 (`npm run bundle`) 실행

---

## ✅ 검증 결과

### E2E 테스트 실행 결과

```
GEMINI_API_KEY=fake-key-for-test npm run test:e2e -- -- --test-name-pattern "Multi-Provider"

 ✓ Multi-Provider E2E: Gemini > should handle basic conversation         5662ms
 ✓ Multi-Provider E2E: Gemini > should handle streaming multi-chunk      3078ms
 ✓ Multi-Provider E2E: Gemini > should handle tool call flow             1711ms
 ✓ Multi-Provider E2E: Gemini > should handle error response gracefully  3122ms
 ✓ Multi-Provider E2E: Claude > should handle basic conversation         3073ms
 ✓ Multi-Provider E2E: Claude > should handle streaming multi-chunk      3025ms
 ✓ Multi-Provider E2E: Claude > should handle tool call flow             1719ms
 ✓ Multi-Provider E2E: Claude > should handle error gracefully           3036ms
 ✓ Multi-Provider E2E: OpenAI > should handle basic conversation         3194ms
 ✓ Multi-Provider E2E: OpenAI > should handle streaming multi-chunk      3165ms
 ✓ Multi-Provider E2E: OpenAI > should handle tool call flow             2101ms
 ✓ Multi-Provider E2E: OpenAI > should handle error gracefully           3212ms

Test Files  1 passed (28)
Tests       12 passed (105)
```

### Quality Gate

| 항목                  | 결과                                         |
| --------------------- | -------------------------------------------- |
| ESLint                | ✅ PASS (0 errors)                           |
| TypeCheck (변경 파일) | ✅ PASS (adapter.ts 에러는 M3.4.A 선행 이슈) |
| Core 단위 테스트      | ✅ 19 files / 386 passed (1 skipped)         |
| E2E 테스트            | ✅ 12 passed                                 |

---

## 변경 파일 상세

### 신규 파일

| 파일                                                          | 내용                                     |
| ------------------------------------------------------------- | ---------------------------------------- |
| `integration-tests/multi-provider.test.ts`                    | 12 E2E tests (3 providers × 4 scenarios) |
| `integration-tests/multi-provider/gemini-basic.responses`     | Gemini 기본 대화 golden                  |
| `integration-tests/multi-provider/gemini-streaming.responses` | Gemini 스트리밍 golden                   |
| `integration-tests/multi-provider/gemini-tool-call.responses` | Gemini 도구 호출 golden                  |
| `integration-tests/multi-provider/gemini-error.responses`     | Gemini 에러 golden                       |
| `integration-tests/multi-provider/claude-basic.responses`     | Claude 기본 대화 golden                  |
| `integration-tests/multi-provider/claude-streaming.responses` | Claude 스트리밍 golden                   |
| `integration-tests/multi-provider/claude-tool-call.responses` | Claude 도구 호출 golden                  |
| `integration-tests/multi-provider/claude-error.responses`     | Claude 에러 golden                       |
| `integration-tests/multi-provider/openai-basic.responses`     | OpenAI 기본 대화 golden                  |
| `integration-tests/multi-provider/openai-streaming.responses` | OpenAI 스트리밍 golden                   |
| `integration-tests/multi-provider/openai-tool-call.responses` | OpenAI 도구 호출 golden                  |
| `integration-tests/multi-provider/openai-error.responses`     | OpenAI 에러 golden                       |

### 수정 파일

| 파일                           | 변경 내용                                                          |
| ------------------------------ | ------------------------------------------------------------------ |
| `core/client.ts`               | `providerName != null` 가드 추가 (1줄) + ESLint fix (1줄)          |
| `core/fakeContentGenerator.ts` | `providerName?: string` 필드 추가 (1줄)                            |
| `core/contentGenerator.ts`     | fake 경로에서 `LLM_PROVIDER` 기반 providerName + model 설정 (10줄) |

---

## 설계 결정

### Gemini vs Non-Gemini 에러 처리 차이

- **Gemini**: error golden은 정상 텍스트 응답 (`"I encountered an issue..."`) —
  CLI exit 0
- **Claude/OpenAI**: error golden은 `LlmEventType.Error` 이벤트 —
  `nonInteractiveCli.ts`에서 `throw event.error` → exit non-zero
- **테스트**: Gemini는 `validateModelOutput`, Claude/OpenAI는 try/catch로
  non-zero exit 검증

### 이미지 입력 시나리오 제외

- non-interactive CLI의 `@path` 이미지 문법 지원 불확실
- 이미지 변환은 이미 converter 단위 테스트에서 검증됨
- 4개 핵심 시나리오에 집중, 이미지 E2E는 후속 작업으로 분류

### E2E 테스트 auth 전제 조건

- 모든 E2E 테스트는 `GEMINI_API_KEY` 환경변수 필요 (fake responses도 auth
  validation 먼저 통과)
- CI 환경에서는 secret으로 설정 필요

---

## 📝 다음 단계

- [ ] M3.4.3: 성능 회귀 테스트 (3-provider baseline)
- [ ] M3.4.4: 문서 업데이트 (vLLM은 placeholder)
- [ ] M3.4.5: 안정화 작업 (6개)
- [ ] M3.3: OpenAI-Compatible(vLLM/sLM) 어댑터
- [ ] M3.4.B: M3.3 의존 항목 (vLLM E2E + 문서 상세화)

---

## 📊 커밋 요약

| 순서 | 커밋 ID  | 타입 | 설명                                                    | 테스트     |
| ---- | -------- | ---- | ------------------------------------------------------- | ---------- |
| 1    | (미커밋) | fix  | FakeContentGenerator 회귀 수정 (providerName null 체크) | ✅         |
| 2    | (미커밋) | test | Multi-Provider E2E 테스트 12개 + golden responses 12개  | ✅ 12 PASS |

**총 커밋 수**: 미커밋 (사용자 요청 시 커밋 예정)

---

## ✅ 완료 기준 체크

- [x] Gemini E2E 테스트 4개 통과 (basic, streaming, tool-call, error)
- [x] Claude E2E 테스트 4개 통과 (basic, streaming, tool-call, error)
- [x] OpenAI E2E 테스트 4개 통과 (basic, streaming, tool-call, error)
- [x] ESLint 경고 0개
- [x] TypeCheck 통과 (변경 파일)
- [x] Core 단위 테스트 회귀 없음 (386 passed)
- [x] Todolist 업데이트 완료
- [ ] 커밋 완료

---

**최종 상태**: ✅ 완료 (커밋 대기)
