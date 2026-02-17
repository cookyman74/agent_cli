# OpenAI 모델 레지스트리 업데이트 + 시스템 프롬프트 브랜딩 수정

> **작업일**: 2026-02-17 **브랜치**: `v0.2.0/se_manager_agent` **범위**: OpenAI
> 최신 모델 반영 + "Gemini CLI" → "Didim Agent CLI" 브랜딩 전환 (3소스 +
> 3테스트)

---

## 1. 배경 및 목적

### 1.1 OpenAI 모델 레지스트리 업데이트

현재 레지스트리의 OpenAI 기본 모델이 `gpt-4.1`로 설정되어 있으나, 2025년 12월
`gpt-5.2`가 출시되어 최신 모델 반영이 필요.

**2026년 2월 기준 OpenAI 주요 모델:**

| 모델        | 출시    | Context | Max Output | 비고               |
| ----------- | ------- | ------- | ---------- | ------------------ |
| **gpt-5.2** | 2025.12 | 400K    | 128K       | 현재 최신 flagship |
| gpt-5-mini  | 2025.10 | -       | -          | 소형 GPT-5         |
| gpt-4.1     | 2025.04 | 1M      | 32K        | 이전 기본값        |
| o3          | 2025.04 | 200K    | 100K       | reasoning          |
| o4-mini     | 2025.04 | -       | -          | fast reasoning     |

### 1.2 시스템 프롬프트 브랜딩 문제

`/model`로 OpenAI gpt-4.1 선택 후 "너는 어떤 모델이야?" 질문 시, AI가 "Gemini
CLI 에이전트"로 응답하는 문제 발생.

**근본 원인 분석:**

- `environmentContext.ts:68`에 `"This is the Gemini CLI"`가 하드코딩
- 이 텍스트가 모든 프로바이더의 초기 채팅 히스토리에 주입
- OpenAI 모델이 실제로 응답하더라도 컨텍스트로 인해 "Gemini CLI"로 자기 식별

**모델 라우팅 검증 결과:**

- `useAuth.ts`에서 `OPENAI_API_KEY` 감지 시 `ENABLE_MULTI_PROVIDER=true` +
  `LLM_PROVIDER=openai` 자동 설정
- `contentGenerator.ts:299` multi-provider 분기 → OpenAI 어댑터로 정상 라우팅
- **라우팅 문제 아님** — 순수 브랜딩 문제

---

## 2. 변경 상세

### Part A: OpenAI 모델 레지스트리 업데이트

#### `packages/core/src/config/providerModels.ts`

| 항목          | Before                  | After                   |
| ------------- | ----------------------- | ----------------------- |
| **기본 모델** | `gpt-4.1`               | `gpt-5.2`               |
| **프리셋**    | `Recommended (gpt-4.1)` | `Recommended (gpt-5.2)` |

**모델 목록 변경:**

| 모델           | 변경                                                        |
| -------------- | ----------------------------------------------------------- |
| `gpt-5.2`      | **추가** — Flagship reasoning model, 400K context (default) |
| `gpt-5-mini`   | **추가** — Compact GPT-5, fast and efficient                |
| `gpt-4.1`      | 유지 (Best 1M context non-reasoning model)                  |
| `gpt-4.1-mini` | 유지                                                        |
| `gpt-4.1-nano` | **제거** (superseded by gpt-5-mini, custom으로 사용 가능)   |
| `gpt-4o`       | **제거** (superseded by gpt-5 series, custom으로 사용 가능) |
| `o3`           | 유지                                                        |
| `o4-mini`      | 유지                                                        |

> `allowCustomModels: true`이므로 제거된 모델도 직접 입력하면 사용 가능. `gpt-*`
> prefix 매칭으로 `gpt-5.2-pro`, `gpt-5.3-codex` 등도 자동 허용.

#### `packages/core/src/providers/openai/adapter.ts`

| 항목               | Before  | After                      |
| ------------------ | ------- | -------------------------- |
| `maxContextLength` | 128,000 | **400,000** (GPT-5.2 기준) |
| `maxOutputTokens`  | 16,384  | **128,000** (GPT-5.2 기준) |

#### `packages/core/src/config/providerModels.test.ts`

| 변경             | 내용                      |
| ---------------- | ------------------------- |
| 기본 모델 기댓값 | `'gpt-4.1'` → `'gpt-5.2'` |

### Part B: 시스템 프롬프트 "Gemini CLI" → "Didim Agent CLI" 브랜딩 수정

#### 소스 파일 (3개)

| 파일                                               | 변경 내용                                                               |
| -------------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/core/src/utils/environmentContext.ts:68` | `"This is the Gemini CLI"` → `"This is the Didim Agent CLI"`            |
| `packages/core/src/agents/cli-help-agent.ts`       | "Gemini CLI" → "Didim Agent CLI" (7개소, `replace_all`)                 |
| `packages/core/src/services/gitService.ts:67`      | git config `name = Gemini CLI` → `name = Didim Agent CLI`, `email` 변경 |

#### 테스트 파일 (3개)

| 파일                                                 | 변경 내용                                                               |
| ---------------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/core/src/core/client.test.ts:370`          | `toContain('This is the Gemini CLI')` → `'This is the Didim Agent CLI'` |
| `packages/core/src/agents/cli-help-agent.test.ts:25` | `toContain('Gemini CLI')` → `'Didim Agent CLI'`                         |
| `packages/core/src/services/gitService.test.ts:201`  | git config 기댓값 동기화                                                |

---

## 3. 변경하지 않은 것

| 항목                                | 이유                                                |
| ----------------------------------- | --------------------------------------------------- |
| `prompts.ts:206` (preamble)         | 이미 provider-agnostic ("CLI agent")으로 작성됨     |
| `featureFlag.ts`                    | `ENABLE_MULTI_PROVIDER`는 auth 흐름에서 정상 설정됨 |
| `providerSelector.ts`               | 라우팅 로직 정상 동작 확인                          |
| `GEMINI_SYSTEM_MD` 환경변수         | 코어에서 아직 전환 안 됨 (별도 작업)                |
| `web-search.test.ts`의 "Gemini CLI" | 테스트 데이터(모의 웹 검색 결과), 브랜딩 대상 아님  |

---

## 4. 검증 결과

```
✓ providerModels.test.ts        — 33 passed
✓ adapter.test.ts               — 30 passed
✓ environmentContext.test.ts     — 6 passed
✓ cli-help-agent.test.ts        — 6 passed
✓ gitService.test.ts            — 18 passed
✓ client.test.ts                — 84 passed (1 skipped)
✓ typecheck (tsc --noEmit)      — clean
```

---

## 5. 전체 변경 파일 목록 (9개)

| #   | 파일                                              | 유형              |
| --- | ------------------------------------------------- | ----------------- |
| 1   | `packages/core/src/config/providerModels.ts`      | 모델 레지스트리   |
| 2   | `packages/core/src/config/providerModels.test.ts` | 테스트            |
| 3   | `packages/core/src/providers/openai/adapter.ts`   | Capabilities      |
| 4   | `packages/core/src/utils/environmentContext.ts`   | 환경 컨텍스트     |
| 5   | `packages/core/src/agents/cli-help-agent.ts`      | CLI Help 에이전트 |
| 6   | `packages/core/src/services/gitService.ts`        | Git 서비스        |
| 7   | `packages/core/src/core/client.test.ts`           | 테스트            |
| 8   | `packages/core/src/agents/cli-help-agent.test.ts` | 테스트            |
| 9   | `packages/core/src/services/gitService.test.ts`   | 테스트            |

---

## 6. 참고: 모델 라우팅 아키텍처 분석

### Provider 선택 흐름 (정상 동작 확인)

```
[Startup] gemini.tsx
  ↓ selectedProvider = 'openai' (settings.security.auth.selectedProvider)
  ↓ ENABLE_MULTI_PROVIDER = 'true'
  ↓ LLM_PROVIDER = 'openai'
  ↓ OPENAI_API_KEY 복원 (keychain)

[Content Generator] contentGenerator.ts:299
  ↓ isMultiProviderEnabled() = true ✓
  ↓ selectProvider() → LLM_PROVIDER='openai' → ProviderType.OpenAI ✓
  ↓ ProviderFactory.create('openai', {apiKey}) → OpenAiAdapter ✓
  ↓ resolveProviderModel('gpt-4.1', 'openai') → 'gpt-4.1' ✓

[Request] client.ts:processTurn()
  ↓ isProviderIndependentGenerator(generator) = true
  ↓ providerName = 'openai'
  ↓ processLlmTurn() → OpenAI API 호출 ✓
```

### UI ↔ Runtime Provider 감지 로직 비교

| 계층        | 함수                      | 우선순위                                                     |
| ----------- | ------------------------- | ------------------------------------------------------------ |
| **UI**      | `resolveActiveProvider()` | selectedProvider → LLM_PROVIDER → API키 감지 → gemini        |
| **Runtime** | `selectProvider()`        | LLM_PROVIDER → authType → GEMINI_API_KEY → gemini            |
| **Startup** | `gemini.tsx`              | selectedProvider → LLM_PROVIDER + ENABLE_MULTI_PROVIDER 설정 |

Startup에서 `ENABLE_MULTI_PROVIDER`와 `LLM_PROVIDER`를 설정하므로 Runtime의
`selectProvider()`가 정상 동작함.
