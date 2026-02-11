# Phase3 M3.4.5 안정화 작업 결과서

- 작업일: 2026-02-11
- 범위: `### 3.4.5 안정화 작업 (3-Provider Scope)`
- 상태: 완료

---

## 1. 사전작업 (Pre-work)

### 1.1 작업 개요/기존 결과서 검토

- 참조:
  - `Phase3_M3.4.A_CLI통합_3Provider통합테스트_20260210.md`
  - `Phase3_M3.4.3_성능회귀테스트_20260211.md`
- 확인 내용:
  - non-Gemini 경로는 `processLlmTurn()` 분기 기반으로 동작
  - M3.4.5 체크리스트는 미완료 상태

### 1.2 이슈 파악

- 안정화 후보 이슈:
  - `providerName`은 non-Gemini인데 `llm*` 메서드가 없는 비정상 generator wiring
  - adapter stream이 Error event를 yield하기 전에 throw하는 경우 처리

---

## 2. 본작업 (Main work)

### 2.1 Red (테스트/검증)

- 통합 검증 실행:
  - `multiProvider.integration`, `providerConfigIntegration`,
    `errorHandling.integration`, `contentGenerator.multiProvider`, `client`
    테스트
  - typecheck 실행
- 결과:
  - 기능 회귀 없음, 안정화 포인트 2건 식별(아래 2.2 반영)

### 2.2 Green (코드 수정)

#### A) 버그/에지 케이스 가드 추가

- 파일: `packages/core/src/core/client.ts`
- 변경:
  - non-Gemini `providerName`인데 `llm*` 메서드가 없는 경우
    `LlmEventType.Error`로 명시적 실패 처리
  - 코드/메시지:
    - `code: PROVIDER_METHOD_MISMATCH`
    - 상세 에러 메시지 추가

#### B) 스트림 throw 안정화

- 파일: `packages/core/src/core/client.ts`
- 변경:
  - `llmGenerateContentStream()` for-await 구간을 try/catch로 감싸 throw를
    `LlmEventType.Error` 이벤트로 변환
  - 코드:
    - `code: LLM_STREAM_FAILURE`
  - 효과:
    - 예외 전파로 전체 turn이 비정상 종료되는 케이스 방지
    - model history 오염 방지(`isError=true` 경로)

#### C) 에러 메시지/로깅 개선

- 파일: `packages/core/src/core/client.ts`
- 변경:
  - debug mode에서 아래 상황 로깅:
    - non-Gemini provider path 선택
    - llm stream throw 감지
    - provider-method mismatch 감지

#### D) 테스트 보강

- 파일: `packages/core/src/core/client.test.ts`
- 추가 테스트:
  - non-Gemini provider + llm\* 미구현 시 `PROVIDER_METHOD_MISMATCH` 이벤트
  - llm stream throw 시 `LLM_STREAM_FAILURE` 이벤트로 변환

### 2.3 Refactor

- non-Gemini 판별 로직을 지역 변수(`isNonGeminiProvider`)로 정리
- provider model resolve 경로 명확화

---

## 3. 3.4.5.6 의존성 정합성 검증

### 3.1 패키지/락파일

- `packages/core/package.json`에 의존성 존재:
  - `@anthropic-ai/sdk`
  - `openai`
- `package-lock.json`에서 해시/버전 엔트리 확인

### 3.2 lockfile 검사

- 실행: `npm run check:lockfile`
- 결과: PASS

### 3.3 clean install 검사

- 실행: `npm ci --ignore-scripts`
- 결과: 성공 (엔진 경고는 있으나 설치 성공)

### 3.4 esbuild 번들 포함 확인

- `esbuild.config.js`에서 `openai`, `@anthropic-ai/sdk`를 external 처리하지
  않음을 확인
- `bundle/gemini.js`에서 SDK 코드 포함 문자열 확인

---

## 4. 사후작업 (Post-work)

### 4.1 체크리스트 업데이트

- 파일: `docs/ai_adapter/todolist/phase3_provider_extension_todolist.md`
- 반영:
  - `3.4.5.1 ~ 3.4.5.6` 모두 완료(`✅`)
  - M3.4.A 검증 기준 중 미체크 항목 2건 완료 처리:
    - 멀티 프로바이더 통합 테스트
    - 의존성 검증

### 4.2 변경 파일

- `packages/core/src/core/client.ts`
- `packages/core/src/core/client.test.ts`
- `docs/ai_adapter/todolist/phase3_provider_extension_todolist.md`
- `docs/ai_adapter/working_history/Phase3_M3.4.5_안정화작업_20260211.md`

### 4.3 검증 결과

- `npm test --workspace @google/gemini-cli-core -- src/core/client.test.ts` PASS
- `npm test --workspace @google/gemini-cli-core -- src/core/contentGenerator.multiProvider.test.ts src/providers/__tests__/multiProvider.integration.test.ts src/providers/__tests__/errorHandling.integration.test.ts`
  PASS
- `npm test --workspace @google/gemini-cli-core -- src/providers/gemini/featureFlag.test.ts`
  PASS
- `npm run typecheck --workspace @google/gemini-cli-core` PASS

---

## 5. 리뷰 반영 (2026-02-11)

### 5.1 중간: abort 신호 스트림 throw 시 UserCancelled 오분류

**문제**: `client.ts:919` catch 블록에서 abort에 의한 스트림 예외도
`LlmEventType.Error` + `code: 'LLM_STREAM_FAILURE'`로 먼저 yield한 뒤, line
936에서 `signal.aborted`를 확인함. 이로 인해 사용자 취소가 API 실패로 오분류되어
UI/로깅/메트릭에서 잘못 표시될 수 있음.

**원인**: catch 블록 진입 시 abort 여부 판별 없이 항상 Error 이벤트를 발행. 기존
프로젝트 패턴(`scheduler.ts:376`, `confirmation.ts:82`)은
`signal.aborted || error.name === 'AbortError'`를 먼저 체크함.

**수정** (`client.ts`):

- catch 블록 최상단에 abort 감지 로직 추가:
  ```typescript
  const isAbort =
    signal.aborted ||
    (error instanceof Error && error.name === 'AbortError');
  if (isAbort) {
    yield { type: LlmEventType.UserCancelled };
    return /* early return */;
  }
  ```
- abort가 아닌 경우에만 기존 `LLM_STREAM_FAILURE` Error 이벤트 발행

**부수 수정**:

- `client.ts:665`: 불필요한 `as string` 타입 단언 제거 (ESLint
  `no-unnecessary-type-assertion`)

### 5.2 낮음: abort 오분류 회귀 테스트 추가

**문제**: abort 시 UserCancelled 발행을 보장하는 테스트 부재.

**수정** (`client.test.ts`):

- `should yield UserCancelled (not Error) when abort signal triggers stream throw`
  — abort controller로 signal을 취소한 뒤 스트림이 throw → UserCancelled 확인,
  LLM_STREAM_FAILURE 미발행 확인
- `should yield UserCancelled when stream throws AbortError by name` —
  `error.name = 'AbortError'` 패턴으로 throw → UserCancelled 확인,
  LLM_STREAM_FAILURE 미발행 확인

### 5.3 리뷰 반영 후 테스트 결과

| 범위                                      | 결과                    |
| ----------------------------------------- | ----------------------- |
| client.test.ts (85 tests)                 | ✅ 84 passed, 1 skipped |
| contentGenerator.multiProvider (14 tests) | ✅ All passed           |
| errorHandling.integration (19 tests)      | ✅ All passed           |
| Lint                                      | ✅ Clean                |
| Typecheck                                 | ✅ Clean                |

---

## 6. 잔여 이슈

- 없음 (본 범위 기준).
- 참고: `npm ci` 시 `vite`의 Node 엔진 경고(`^20.19.0 || >=22.12.0`)가 출력되나
  설치는 성공했음.
