# Phase S: OpenAI 런타임 오류 핫픽스

- 작업일: 2026-03-08
- 상태: ✅ 완료
- 목적: OpenAI provider에서 `gpt-5.4-pro`, `gpt-5.3-codex` 선택 시 발생한 런타임
  404 오류를 원인 분석 후 수정

## 1. 보고된 증상

사용자 보고 기준 오류:

```text
✕ [API Error: 404 This is not a chat model and thus not supported in the v1/chat/completions endpoint. Did you mean to use v1/completions?]
```

발생 모델:

- `gpt-5.4-pro`
- `gpt-5.3-codex`

추가 맥락:

- `gpt-5.3-codex`는 수정 전에는 정상 사용되었다는 사용자 피드백이 있었음
- 현재 OpenAI adapter는 전 구간에서 `v1/chat/completions`만 사용 중임

## 2. 원인 분석 결과

이번 장애는 단일 원인이 아니라 두 개의 문제가 겹친 케이스로 정리됨.

### 원인 A. `gpt-5.4-pro`는 현재 adapter 구현과 호환되지 않음

- 현재 `packages/core/src/providers/openai/adapter.ts`는
  `client.chat.completions.create(...)`만 사용함
- `gpt-5.4-pro`는 현재 CLI의 OpenAI adapter가 지원하는 Chat Completions 경로와
  맞지 않음
- 따라서 모델을 레지스트리에 노출한 상태 자체가 잘못된 UX였음

결론:

- `gpt-5.4-pro`는 현 시점에서 OpenAI manual 모델 목록에서 제거하는 것이 맞음
- 향후 별도 Responses API 지원 구현 전까지는 선택 불가가 안전함

### 원인 B. startup 복원 시 stale provider/env 누수가 가능했음

핵심 문제:

- `packages/cli/src/gemini.tsx`의 `restoreNonGeminiEnvVars()`가 저장된
  provider를 복원할 때 `LLM_PROVIDER`를 덮어쓰지 않았음
- 따라서 이전 세션 또는 shell 환경에 남아 있던
  `LLM_PROVIDER=openai-compatible`가 유지될 수 있었음
- 이 경우 UI/설정은 OpenAI처럼 보여도 실제 요청 라우팅은 openai-compatible
  서버로 갈 수 있음
- 그 경로에서 `gpt-5.3-codex` 요청이 로컬 서버/게이트웨이의
  `v1/chat/completions`로 나가면 본 404가 재현될 수 있음

보조 원인:

- OpenAI SDK는 `OPENAI_BASE_URL` 환경변수를 자동으로 읽음
- 프로젝트가 이를 명시적으로 차단하지 않으면 shell에 남은 값이 OpenAI provider
  경로를 오염시킬 수 있음

결론:

- `gpt-5.3-codex`의 문제는 모델 자체보다 runtime 라우팅 오염 가능성이 더 컸음

## 3. 수정 사항

### Core

#### 3-1. OpenAI SDK 기본 엔드포인트 고정

- 파일: `packages/core/src/providers/openai/bootstrap.ts`
- 변경:
  - `baseURL: config.baseUrl ?? 'https://api.openai.com/v1'`

효과:

- shell에 `OPENAI_BASE_URL`가 남아 있어도, 명시적 override가 없는 한 공식 OpenAI
  API로 고정됨

#### 3-2. `gpt-5.4-pro` 사전 차단

- 파일: `packages/core/src/providers/openai/adapter.ts`
- 변경:
  - `RESPONSES_ONLY_OPENAI_MODELS = new Set(['gpt-5.4-pro'])`
  - `generateContent()`, `generateContentStream()` 진입 시
    `validateModelCompatibility()` 호출
  - Chat Completions 기반 구현에서 지원 불가 모델은
    `LlmErrorType.UNSUPPORTED_FEATURE`로 즉시 실패

효과:

- OpenAI API 호출 전 로컬에서 명확한 에러로 차단
- “지원되지 않는 모델을 선택해 놓고 404를 받는” UX 제거

#### 3-3. OpenAI manual 목록 정리

- 파일: `packages/core/src/config/providerModels.ts`
- 변경:
  - OpenAI manual 목록에서 `gpt-5.4-pro` 제거
  - `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.2`, `gpt-5-mini`, `gpt-4.1`,
    `gpt-4.1-mini`, `o3`, `o4-mini` 유지

효과:

- UI가 현재 adapter capability와 일치함

### CLI

#### 3-4. provider 전환 시 OpenAI SDK 관련 env 정리

- 파일: `packages/cli/src/ui/utils/resolveActiveProvider.ts`
- 변경:
  - 정리 대상 env에 아래 항목 추가
    - `OPENAI_BASE_URL`
    - `OPENAI_ORG_ID`
    - `OPENAI_PROJECT_ID`

효과:

- provider 전환 시 stale OpenAI SDK env가 다음 세션에 누수되는 위험 완화

#### 3-5. startup 복원 시 `LLM_PROVIDER` 강제 동기화

- 파일: `packages/cli/src/gemini.tsx`
- 변경:
  - `restoreNonGeminiEnvVars()`가 `process.env['LLM_PROVIDER'] = provider`로
    항상 동기화
  - `provider !== 'openai-compatible'`일 때 아래 stale sLM env 제거
    - `LLM_BASE_URL`
    - `LLM_API_KEY`
    - `LLM_API_KEY_HEADER`
    - `LLM_CUSTOM_HEADERS`

효과:

- 저장된 provider가 OpenAI인데 런타임은 openai-compatible로 남는 오염 경로 차단
- `gpt-5.3-codex`가 잘못된 gateway/local server로 전송되는 문제 방지

### 문서

다음 문서에서 `gpt-5.4-pro` 노출을 제거하거나 제한 사유를 명시함:

- `docs/cli/model.md`
- `docs/providers.md`
- `docs/index.md`
- `docs/get-started/authentication.md`

## 4. 테스트 및 검증

### Core 테스트

실행:

```bash
../../node_modules/.bin/vitest run src/providers/openai/adapter.test.ts src/providers/openai/bootstrap.test.ts
../../node_modules/.bin/vitest run src/config/providerModels.test.ts
```

결과:

- `src/providers/openai/adapter.test.ts`: 36 passed
- `src/providers/openai/bootstrap.test.ts`: 8 passed
- `src/config/providerModels.test.ts`: 36 passed

### CLI 테스트

실행:

```bash
../../node_modules/.bin/vitest run src/ui/utils/resolveActiveProvider.test.ts src/ui/components/ModelDialog.test.tsx
../../node_modules/.bin/vitest run src/restoreNonGeminiEnvVars.test.ts
```

결과:

- `src/ui/utils/resolveActiveProvider.test.ts`: 28 passed
- `src/ui/components/ModelDialog.test.tsx`: 30 passed
- `src/restoreNonGeminiEnvVars.test.ts`: 12 passed

비고:

- `ModelDialog.test.tsx`에는 기존부터 존재하던 React `act(...)` warning이
  출력되지만 테스트 실패는 아님

### 빌드

실행:

```bash
npm run build
```

대상:

- `packages/core`
- `packages/cli`

결과:

- 두 패키지 모두 build 성공
- `dist` 반영 완료

## 5. 리뷰 포인트

다른 리뷰어가 특히 확인해야 할 항목:

1. `restoreNonGeminiEnvVars()`가 startup 복원 경로에서 항상 호출되는지
2. `LLM_PROVIDER` 우선순위가 다른 startup/auth 경로와 충돌하지 않는지
3. `gpt-5.4-pro`를 manual 목록에서 제거한 정책이 제품 요구사항과 맞는지
4. 향후 Responses API 지원 시 `gpt-5.4-pro`를 어떤 provider/adapter 전략으로
   다시 노출할지

## 6. 남은 리스크 및 후속 과제

### 남은 리스크

1. 이미 실행 중인 프로세스에는 env 정리 로직이 즉시 반영되지 않음
2. 사용자가 외부 shell에서 강제로 `LLM_PROVIDER`, `LLM_BASE_URL`,
   `OPENAI_BASE_URL`를 다시 주입하면 동일 계열 문제가 재발할 수 있음
3. 현재 OpenAI adapter는 여전히 Chat Completions 전용 구현이므로 Responses API
   계열 모델은 구조적으로 미지원

### 후속 과제

1. `/about` 또는 debug 로그에서 실제 runtime provider/baseURL을 더 명확히
   표시하는 진단 기능 추가 검토
2. OpenAI Responses API 전용 adapter 또는 unified adapter 설계 검토
3. startup 시 saved provider와 runtime env가 충돌할 때 경고 메시지를 표면화하는
   개선 검토

## 7. 최종 결론

- `gpt-5.4-pro` 오류는 모델-API 호환성 문제였고, 현 adapter 범위에서는 선택
  불가가 정답
- `gpt-5.3-codex` 오류는 stale provider/env에 의해 실제 요청이 다른 endpoint로
  라우팅될 가능성이 핵심 원인이었음
- 이번 핫픽스는 “OpenAI provider를 OpenAI답게 고정”하고, “UI에 노출하는 모델을
  실제 capability와 일치”시키는 방향으로 정리됨
