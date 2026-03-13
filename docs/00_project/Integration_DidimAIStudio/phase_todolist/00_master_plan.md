# DidimAIStudio 연동 — 전체 작업계획서

> **프로젝트**: DidimAIStudio 프로바이더 어댑터 구현 및 CLI 연동 **작업
> 브랜치**: `DID/v0.3` **작업 방법론**: TDD (Red → Green → Refactor) + Tidy
> First **작성일**: 2026-03-13 **참고 문서**:
>
> - [DidimAIStudio 연동 가이드](../../../../docs/temp_howto_develop_integration_didimaistudio.md)
> - [99_TDD_plan.md](../../multi_provider_model_select/template/99_TDD_plan.md)
>   — TDD 방법론
> - [Multi-Provider 설계 문서](../../multi_provider_model_select/multi_provider_model_select_design.md)

---

## 1. 프로젝트 개요

### 1.1 목표

DidimAIStudio를 Didim Agent CLI의 프로바이더로 완전 연동한다. 현재
코드베이스에는 Didim 프로바이더의 **타입 정의, 모델 레지스트리, 프로바이더 감지,
UI 플레이스홀더** 까지만 구현되어 있다. 실제 API 통신, SSE 스트리밍, Auth 흐름을
구현하여 "DidimAIStudio Coming Soon" 상태에서 **실제 사용 가능** 상태로
전환한다.

### 1.2 DidimAIStudio API 핵심 계약

| 항목           | 내용                                                              |
| -------------- | ----------------------------------------------------------------- |
| 일반 응답      | `POST https://{domain}/scenario-gateway/v1/invoke`                |
| SSE 응답       | `POST https://{domain}/scenario-gateway/v1/invoke/sse`            |
| SSE (improved) | `POST https://{domain}/scenario-gateway/v1/invoke/sse/improved`   |
| 인증           | `Authorization: Bearer {jwt_token}`                               |
| 대화 연속성    | `x-thread-id: {thread_id}` 헤더                                   |
| 요청 본문      | `{ "chat": "사용자 메시지", "thread_id": "optional" }`            |
| 응답 본문      | `{ "response": "assistant reply", "thread_id": "thread_123" }`    |
| 모델 선택      | 불가 — 서버 시나리오가 모델 제어 (`modelSelectionDisabled: true`) |
| 도구 호출      | 미지원 — 시나리오 기반 동작                                       |

### 1.3 현재 구현 상태 (AS-IS)

| 구분                                  | 상태                                     | 파일                              |
| ------------------------------------- | ---------------------------------------- | --------------------------------- |
| `ProviderType.Didim` enum             | ✅ 존재                                  | `providerTypes.ts:22`             |
| PROVIDER_MODEL_REGISTRY didim 엔트리  | ✅ 존재 (`modelSelectionDisabled: true`) | `providerModels.ts:173`           |
| `DIDIM_API_KEY` 환경변수 매핑         | ✅ 존재                                  | `providerSelector.ts:50`          |
| `resolveActiveProvider()` didim 감지  | ✅ 존재                                  | `resolveActiveProvider.ts:43`     |
| Auth UI (DidimStudioComingSoonDialog) | ✅ 플레이스홀더                          | `DidimStudioComingSoonDialog.tsx` |
| ModelDialog didim 비활성 안내         | ✅ 동작                                  | `ModelDialog.tsx:214`             |
| `providers/didim/` 어댑터 디렉토리    | ❌ 없음                                  | —                                 |
| DidimAdapter (BaseAdapter 구현)       | ❌ 없음                                  | —                                 |
| DidimConverter (API 변환)             | ❌ 없음                                  | —                                 |
| bootstrapDidimProvider                | ❌ 없음                                  | —                                 |
| contentGenerator 등록                 | ❌ 없음                                  | —                                 |
| Auth flow 실제 연동                   | ❌ Coming Soon 상태                      | —                                 |
| Didim 전용 설정 (domain, streamMode)  | ❌ 없음                                  | —                                 |

### 1.4 핵심 설계 결정

| #   | 결정                                                 | 설계 근거                                                           |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | 자체 HTTP 클라이언트 (fetch 기반)                    | DidimAIStudio는 SDK 없음, REST API 직접 호출                        |
| 2   | SSE 두 모드 동시 지원 (`sse` / `improved`)           | 서버 배포 버전에 따라 다름, 사용자 선택                             |
| 3   | `thread_id` 어댑터 내부 관리                         | 대화 연속성을 프로바이더 레벨에서 투명하게 처리                     |
| 4   | `modelSelectionDisabled` 유지                        | 시나리오 기반이므로 모델 선택 UI 비활성 그대로                      |
| 5   | JWT → `DIDIM_API_KEY` env 저장                       | 기존 프로바이더와 동일한 API key 저장 패턴                          |
| 6   | 도메인 정규화 (프로토콜/경로 제거)                   | 사용자 입력 오류 방지, 고정 경로 `/scenario-gateway/v1/invoke` 사용 |
| 7   | 도구 호출 미지원 (`capabilities.toolCalling: false`) | 시나리오가 도구를 제어, 클라이언트 측 도구 불필요                   |

### 1.5 참고 문서

| 문서                                                                                          | 설명                                         |
| --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [DidimAIStudio 연동 가이드](../../../../docs/temp_howto_develop_integration_didimaistudio.md) | API 계약, SSE 이벤트, 설정 모델, 코드 예제   |
| [BaseAdapter](../../../packages/core/src/providers/baseAdapter.ts)                            | 프로바이더 어댑터 추상 클래스                |
| [ClaudeAdapter 구현](../../../packages/core/src/providers/claude/)                            | 참고 패턴 (bootstrap/adapter/converter 구조) |
| [OpenAI Adapter 구현](../../../packages/core/src/providers/openai/)                           | 참고 패턴 (SSE 스트리밍 처리)                |
| [providerMetadata.ts](../../../packages/cli/src/ui/auth/providerMetadata.ts)                  | Auth UI 메타데이터                           |

---

## 2. 변경 범위 요약

### 2.1 수정 파일 목록

| #   | 파일                                                       | 변경      | 분류 | Phase |
| --- | ---------------------------------------------------------- | --------- | ---- | ----- |
| 1   | `packages/core/src/providers/didim/converter.ts`           | **신규**  | Core | 1     |
| 2   | `packages/core/src/providers/didim/converter.test.ts`      | **신규**  | Core | 1     |
| 3   | `packages/core/src/providers/didim/adapter.ts`             | **신규**  | Core | 2     |
| 4   | `packages/core/src/providers/didim/adapter.test.ts`        | **신규**  | Core | 2     |
| 5   | `packages/core/src/providers/didim/bootstrap.ts`           | **신규**  | Core | 2     |
| 6   | `packages/core/src/providers/didim/bootstrap.test.ts`      | **신규**  | Core | 2     |
| 7   | `packages/core/src/providers/didim/index.ts`               | **신규**  | Core | 2     |
| 8   | `packages/core/src/providers/index.ts`                     | 수정      | Core | 2     |
| 9   | `packages/core/src/core/contentGenerator.ts`               | 수정      | Core | 2     |
| 10  | `packages/cli/src/ui/auth/DidimStudioAuthDialog.tsx`       | **신규**  | CLI  | 3     |
| 11  | `packages/cli/src/ui/auth/DidimStudioComingSoonDialog.tsx` | 수정/대체 | CLI  | 3     |
| 12  | `packages/cli/src/ui/auth/providerMetadata.ts`             | 수정      | CLI  | 3     |
| 13  | `packages/cli/src/ui/auth/DidimStudioAuthDialog.test.tsx`  | **신규**  | CLI  | 3     |
| 14  | `docs/providers.md`                                        | 수정      | Docs | 4     |
| 15  | `docs/get-started/authentication.md`                       | 수정      | Docs | 4     |

### 2.2 의존 관계

```
Phase 1 (Core — Converter: 순수 변환 함수)
  └─▶ Phase 2 (Core — Adapter + Bootstrap + ContentGenerator 등록)
        └─▶ Phase 3 (CLI — Auth UI + Settings 확장)
              └─▶ Phase 4 (Quality Gates + 문서 + E2E 검증)
```

> 각 Phase는 이전 Phase 완료를 전제로 한다.

---

## 3. Phase별 작업 요약

### Phase 1: Core — DidimConverter (순수 변환 함수)

> **상세 계획서**:
> [Phase1_core_didim_converter.md](./Phase1_core_didim_converter.md)

| 항목        | 내용                                                    |
| ----------- | ------------------------------------------------------- |
| 범위        | `packages/core/src/providers/didim/converter.ts` (신규) |
| 위험 수준   | 🟢 Low — 순수 함수, 외부 의존 없음                      |
| 성능 민감도 | 🟢 Low — 정적 변환 로직                                 |

**주요 산출물:**

- `normalizeDidimDomain()` — 서버 주소 정규화 (프로토콜/경로 제거)
- `getDidimEndpoint()` — 엔드포인트 URL 생성 (일반/sse/improved)
- `buildDidimHeaders()` — 인증 헤더 + x-thread-id 생성
- `buildDidimRequestBody()` — `{ chat, thread_id }` 요청 바디 생성
- `parseDidimResponse()` — 응답 파싱 (response, thread_id 추출)
- `parseDidimSseEvent()` — SSE 이벤트 파싱 (sse/improved 두 모드)
- `convertDidimResponseToLlm()` — Didim 응답 → `LlmGenerateResponse` 변환
- `convertDidimSseToLlmEvents()` — SSE 이벤트 → `LlmEvent[]` 변환

**TDD 사이클:**

| 단계            | 내용                                                | 상태 |
| --------------- | --------------------------------------------------- | ---- |
| 1.1 사전 작업   | API 계약 확인 + 기존 프로바이더 converter 패턴 분석 | ⬜   |
| 1.2 RED         | `converter.test.ts` — URL/헤더/바디/파싱 테스트     | ⬜   |
| 1.3 GREEN       | `converter.ts` 순수 함수 구현                       | ⬜   |
| 1.4 RED (2차)   | SSE 이벤트 파싱 테스트 (sse + improved 두 모드)     | ⬜   |
| 1.5 GREEN (2차) | SSE 파싱 + LlmEvent 변환 구현                       | ⬜   |
| 1.6 REFACTOR    | 코드 구조 개선, 타입 정의 분리                      | ⬜   |
| 1.7 사후 작업   | 타입체크 + 린트 + 결과서 + 커밋                     | ⬜   |

---

### Phase 2: Core — DidimAdapter + Bootstrap + ContentGenerator 등록

> **상세 계획서**:
> [Phase2_core_didim_adapter.md](./Phase2_core_didim_adapter.md)

| 항목        | 내용                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| 범위        | `adapter.ts`, `bootstrap.ts`, `index.ts` (신규) + `contentGenerator.ts`, `providers/index.ts` (수정) |
| 위험 수준   | 🟡 Medium — BaseAdapter 구현 + contentGenerator 수정                                                 |
| 성능 민감도 | 🟡 Medium — 네트워크 I/O, SSE 스트리밍 처리                                                          |

**주요 산출물:**

- `DidimAdapter` — BaseAdapter 구현 (generateContent + generateContentStream)
- `DidimHttpClient` — fetch 기반 HTTP 클라이언트 인터페이스 (DI 지원)
- SSE ReadableStream 파서 — POST SSE 방식 처리
- `thread_id` 자동 관리 — 응답에서 추출, 다음 요청에 자동 첨부
- `bootstrapDidimProvider()` — ProviderRegistry 등록
- `contentGenerator.ts` 연동 — bootstrap 호출 추가

**TDD 사이클:**

| 단계               | 내용                                                                    | 상태 |
| ------------------ | ----------------------------------------------------------------------- | ---- |
| 2.1 사전 작업      | Phase 1 결과서 검토 + BaseAdapter/ClaudeAdapter 패턴 분석               | ⬜   |
| 2.2 RED (Part A)   | `adapter.test.ts` — generateContent 테스트 (정상/에러/401/timeout)      | ⬜   |
| 2.3 GREEN (Part A) | DidimAdapter 비스트리밍 구현                                            | ⬜   |
| 2.4 RED (Part B)   | `adapter.test.ts` — generateContentStream 테스트 (sse/improved 두 모드) | ⬜   |
| 2.5 GREEN (Part B) | SSE 스트리밍 구현 (ReadableStream 파서)                                 | ⬜   |
| 2.6 RED (Part C)   | `bootstrap.test.ts` — 등록 + factory 테스트                             | ⬜   |
| 2.7 GREEN (Part C) | bootstrap + index.ts + contentGenerator 연동                            | ⬜   |
| 2.8 REFACTOR       | 에러 분류 통일, thread_id 관리 최적화                                   | ⬜   |
| 2.9 사후 작업      | 빌드 + 타입체크 + 린트 + Phase 1 회귀 확인 + 결과서 + 커밋              | ⬜   |

---

### Phase 3: CLI — Auth UI + Settings 확장

> **상세 계획서**:
> [Phase3_cli_auth_and_settings.md](./Phase3_cli_auth_and_settings.md)

| 항목        | 내용                                                 |
| ----------- | ---------------------------------------------------- |
| 범위        | Auth UI 대체 + Didim 전용 설정 추가                  |
| 위험 수준   | 🟡 Medium — UI 변경, 기존 ComingSoon 다이얼로그 대체 |
| 성능 민감도 | 🟢 Low — UI/설정 로직                                |

**주요 산출물:**

- `DidimStudioAuthDialog.tsx` — JWT 토큰 + 서버 도메인 입력 UI
- 기존 `DidimStudioComingSoonDialog.tsx` → 실제 Auth 다이얼로그로 대체
- `providerMetadata.ts` 업데이트 — `envVarName: 'DIDIM_API_KEY'` 등
- Didim 전용 설정 항목 — `didimStreamMode: 'sse' | 'improved'`,
  `didimServerAddress`
- 설정 정규화 — Didim 모드에서 비활성 항목 자동 초기화

**TDD 사이클:**

| 단계               | 내용                                                         | 상태 |
| ------------------ | ------------------------------------------------------------ | ---- |
| 3.1 사전 작업      | Phase 2 결과서 검토 + 기존 Auth UI 패턴 분석                 | ⬜   |
| 3.2 RED (Part A)   | `DidimStudioAuthDialog.test.tsx` — 입력/저장/유효성 테스트   | ⬜   |
| 3.3 GREEN (Part A) | Auth 다이얼로그 구현 + providerMetadata 수정                 | ⬜   |
| 3.4 RED (Part B)   | Didim 전용 설정 + 정규화 테스트                              | ⬜   |
| 3.5 GREEN (Part B) | 설정 스키마 확장 + 정규화 로직 구현                          | ⬜   |
| 3.6 REFACTOR       | ComingSoon 다이얼로그 제거/교체, 불필요 코드 정리            | ⬜   |
| 3.7 사후 작업      | 빌드 + 타입체크 + 린트 + Phase 1~2 회귀 확인 + 결과서 + 커밋 | ⬜   |

---

### Phase 4: Quality Gates + 문서 + E2E 검증

> **상세 계획서**:
> [Phase4_quality_gates_and_e2e.md](./Phase4_quality_gates_and_e2e.md)

| 항목      | 내용                                          |
| --------- | --------------------------------------------- |
| 범위      | Phase 1~3 전체 변경 사항 검증 + 문서 업데이트 |
| 위험 수준 | 🟡 Medium                                     |

**Quality Gates:**

| Gate | 내용                                                          | 상태 |
| ---- | ------------------------------------------------------------- | ---- |
| QG1  | Typecheck + Lint (Core + CLI)                                 | ⬜   |
| QG2  | 단위 테스트 전수 통과 (Core 294+ files, CLI 전체)             | ⬜   |
| QG3  | Core → CLI 연동 빌드 검증 (`npm run build && npm run bundle`) | ⬜   |
| QG4  | 수동 E2E 시나리오 검증 (12개)                                 | ⬜   |

**E2E 시나리오:**

| #   | 시나리오                                    | 검증 내용                               |
| --- | ------------------------------------------- | --------------------------------------- |
| 1   | `DIDIM_API_KEY` 설정 → 프로바이더 자동 감지 | didim으로 활성화                        |
| 2   | `LLM_PROVIDER=didim` 명시 설정              | didim 선택                              |
| 3   | `/auth login` → DidimAIStudio 선택          | Auth 다이얼로그 표시 (Coming Soon 아님) |
| 4   | JWT 토큰 + 도메인 입력 후 저장              | 설정 영속화                             |
| 5   | `/model` → Didim 비활성 안내 표시           | modelSelectionDisabled 메시지           |
| 6   | 일반 채팅 요청 → 응답 수신                  | `POST /invoke` 정상 동작                |
| 7   | SSE 스트리밍 채팅 (sse 모드)                | 실시간 텍스트 스트리밍                  |
| 8   | SSE 스트리밍 채팅 (improved 모드)           | improved 이벤트 처리                    |
| 9   | 대화 연속성 (thread_id 유지)                | 다중 턴 대화                            |
| 10  | 401 에러 → 인증 오류 메시지                 | JWT 만료 안내                           |
| 11  | 프로바이더 전환 (Didim → Gemini)            | thread_id 초기화, env 정리              |
| 12  | 프로바이더 전환 (Gemini → Didim)            | Didim 설정 복원                         |

**문서 업데이트:**

- `docs/providers.md` — Didim 프로바이더 상세 추가
- `docs/get-started/authentication.md` — Didim 인증 섹션 추가
- `docs/index.md` — 프로바이더 매트릭스 Didim 상태 업데이트

---

## 4. 리스크 매트릭스

| #   | 리스크                                           | 영향      | Phase | 대응 방안                                           |
| --- | ------------------------------------------------ | --------- | ----- | --------------------------------------------------- |
| R1  | DidimAIStudio API 계약 변경 (chat→message 등)    | 🟠 Medium | 1     | Converter에 집중하여 변경 시 한 곳만 수정           |
| R2  | JWT 토큰 만료 시 사용자 혼란                     | 🟡 Medium | 2     | 401 에러에 명확한 만료 안내 메시지                  |
| R3  | SSE improved 모드 서버 미배포 시 호환성          | 🟡 Medium | 2     | fallback 로직 + 사용자 선택 옵션                    |
| R4  | 도메인 정규화 실패 (비표준 URL 입력)             | 🟡 Medium | 1     | 엣지 케이스 테스트 (이중 프로토콜, 경로 포함 등)    |
| R5  | contentGenerator.ts 수정 시 기존 프로바이더 회귀 | 🟠 Medium | 2     | bootstrap 추가만 수행, 기존 로직 불변 + 회귀 테스트 |
| R6  | Auth UI 대체 시 기존 ComingSoon 로직 깨짐        | 🟡 Medium | 3     | 점진적 교체, 기존 import 경로 유지                  |
| R7  | thread_id 누적으로 메모리 누수                   | 🟢 Low    | 2     | 프로바이더 전환/새 채팅 시 명시적 초기화            |
| R8  | 도구 호출 요청 시 오류                           | 🟢 Low    | 2     | `capabilities.toolCalling: false` 명시              |

---

## 5. 커밋 전략

Tidy First 원칙에 따라 **구조적 변경**과 **동작 변경**을 분리하여 커밋한다.

| Phase | 커밋 | 유형 | 메시지                                                                     |
| ----- | ---- | ---- | -------------------------------------------------------------------------- |
| 1     | 1차  | 구조 | `feat(providers): add DidimConverter — URL/header/body/SSE pure functions` |
| 2     | 1차  | 구조 | `feat(providers): add DidimAdapter skeleton + bootstrap registration`      |
| 2     | 2차  | 동작 | `feat(providers): implement DidimAdapter generateContent + SSE streaming`  |
| 2     | 3차  | 동작 | `feat(core): register bootstrapDidimProvider in contentGenerator`          |
| 3     | 1차  | 구조 | `feat(cli): add DidimStudioAuthDialog — JWT + domain input UI`             |
| 3     | 2차  | 동작 | `feat(cli): replace ComingSoon with actual Didim auth flow + settings`     |
| 4     | 1차  | 검증 | `test: Phase 4 quality gates — Didim integration + doc updates`            |

---

## 6. 진행 상황 추적

### Phase별 진행 상태

| Phase | 범위                     | PRE | RED | GREEN | REFACTOR | POST | 결과서 | 커밋 | 상태    |
| ----- | ------------------------ | --- | --- | ----- | -------- | ---- | ------ | ---- | ------- |
| 1     | Core Converter           | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜ 대기 |
| 2     | Core Adapter + Bootstrap | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜ 대기 |
| 3     | CLI Auth + Settings      | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | ⬜ 대기 |
| 4     | Quality Gates + E2E      | ⬜  | —   | —     | —        | ⬜   | ⬜     | ⬜   | ⬜ 대기 |

### 최종 완료 조건

| #   | 항목                                                    | 상태 |
| --- | ------------------------------------------------------- | ---- |
| 1   | Phase 1~3 모든 TDD 사이클 (Red → Green → Refactor) 완료 | ⬜   |
| 2   | 전체 테스트 통과 (`npm test`)                           | ⬜   |
| 3   | Typecheck 에러 0개                                      | ⬜   |
| 4   | Lint 경고 0개                                           | ⬜   |
| 5   | 빌드 + 번들 성공 (`npm run build && npm run bundle`)    | ⬜   |
| 6   | E2E 시나리오 12개 수동 검증 통과                        | ⬜   |
| 7   | Phase 1~4 각 작업 결과서 작성 완료                      | ⬜   |
| 8   | 모든 변경사항 커밋 완료 (7개 커밋)                      | ⬜   |

---

## 7. 작업 규칙

### 7.1 TDD 사이클

1. **RED**: 실패하는 테스트를 먼저 작성한다
2. **GREEN**: 테스트를 통과하는 최소한의 코드를 구현한다
3. **REFACTOR**: 동작을 유지하면서 코드 구조를 개선한다

### 7.2 Tidy First

- 구조적 변경(파일 생성, 리팩토링)과 동작 변경(기능 추가)을 **별도 커밋**으로
  분리
- 구조적 변경을 먼저 수행한 후 동작 변경을 진행

### 7.3 Phase 간 전환

- 이전 Phase의 **모든 완료 조건**이 충족된 후에만 다음 Phase 시작
- Phase 시작 시 이전 Phase의 **작업 결과서**를 반드시 검토
- Phase 2 이후는 이전 Phase의 **회귀 테스트** 통과 확인 필수

### 7.4 작업 결과서

- 각 Phase 완료 시 `../working_history/Phase{N}_{제목}_{작업일자}.md` 작성
- 내용: 작업 요약, 변경 파일, 테스트 결과, 발견 이슈, 다음 Phase 인수 사항

### 7.5 DidimAIStudio 전용 규칙

- **도메인 정규화 필수**: 사용자 입력에서 프로토콜/경로를 제거하고 루트 도메인만
  사용
- **thread_id 생명주기**: 새 채팅 시작, 프로바이더 전환, 설정 변경 시 반드시
  초기화
- **SDK 없음**: fetch API 직접 사용, DI를 위한 HTTP 클라이언트 인터페이스 정의
- **도구 호출 미지원**: `capabilities.toolCalling: false` 명시, 도구 요청 시
  graceful 처리

---

## 8. 예상 일정

| Phase     | 예상 소요 | 비고                            |
| --------- | --------- | ------------------------------- |
| Phase 1   | 1일       | 순수 함수, 낮은 복잡도          |
| Phase 2   | 2일       | SSE 스트리밍 + 에러 처리가 핵심 |
| Phase 3   | 1일       | UI 변경, 기존 패턴 재사용       |
| Phase 4   | 1일       | 검증 + 문서                     |
| **Total** | **5일**   | —                               |

---

**상태**: ⬜ Phase 1 시작 대기
