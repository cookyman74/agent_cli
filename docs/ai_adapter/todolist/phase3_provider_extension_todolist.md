# Phase 3: 프로바이더 확장 및 통합

> 기간: 4-6주 | 상태: ⏳ 대기 | 의존성: Phase 2 완료 **v0.8** - 리뷰 3건 반영
> (중복 등록 안전성, 런타임 wiring 테스트 타깃, --provider 옵션 명확화)

## System Prompt

Always follow TDD principles. For each provider adapter: write failing tests for
message conversion, stream handling, and error mapping first. Implement minimum
code to pass. Ensure cross-provider compatibility through integration tests.

---

# PHASE OVERVIEW

## 설계서 참조 (Design Document References)

| 설계서                                                                                | 관련 섹션                                                                            | 참조 목적                             |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------- |
| [03-technical-design.md](../03-technical-design.md)                                   | §3.3.4-3.3.6 Claude 어댑터/변환기, §3.3.7-3.3.8 OpenAI 어댑터/변환기, §3.4 vLLM 확장 | 각 프로바이더별 어댑터 구현 상세      |
| [04-integration-design.md](../04-integration-design.md)                               | §4.2 연동 아키텍처, §4.3 공통 타입 시스템                                            | DidimAIStudio 연동 시 프로바이더 통합 |
| [05-implementation-plan.md](../05-implementation-plan.md)                             | §5.4 Phase 3 상세, §5.5 테스트 및 검증                                               | 마일스톤별 상세 계획, 검증 기준       |
| [phase3_handoff.md](./phase3_handoff.md)                                              | 연기 항목 카탈로그, messageInspectors 상세, 잔여 의존성 현황                         | Phase 2 → 3 연기 항목 추적            |
| [EventType 전환 결과서](../working_history/phase2_tradeoff_EventType전환_20260208.md) | 16개 파일 전환, 핸드오프 Critical #1/#2 해소                                         | EventType 전환 완료 근거              |

## 목표

- 🆕 **Phase 2 연기 항목 해소**: Gemini 내부 리팩토링 (파일 이동, 텔레메트리,
  Agent 결합 해소)
- Claude 어댑터/변환기 구현
- OpenAI 어댑터/변환기 구현
- OpenAI-Compatible(vLLM/sLM) 어댑터 템플릿
- 통합 테스트 및 문서화

## ⚡ 실행 순서 변경 안내 (2026-02-10)

**원래 계획**: M3.0 → M3.1 → M3.2 → M3.3 → M3.4 → M3.5

**변경된 순서**: M3.0 ✅ → M3.1 ✅ → M3.2 ✅ → **M3.4.A (부분 선행)** → M3.3 →
M3.4.B (잔여) → M3.5

**변경 사유**:

- M3.4의 90%는 M3.3 없이 진행 가능 (Gemini/Claude/OpenAI 3개 프로바이더로 충분)
- 3-provider 통합 테스트를 조기에 수행하여 버그 조기 발견
- M3.3 작업 전에 integration contract 확보
- 성능 baseline 조기 확립하여 M3.3 영향도 측정 가능

**M3.4.A 선행 범위** (M3.3 독립):

- 3.4.1 전체 — 멀티 프로바이더 통합 테스트 (4개)
- 3.4.2 중 3개 — Gemini/Claude/OpenAI E2E 테스트 (vLLM 제외)
- 3.4.3 전체 — 성능 회귀 테스트 (3-provider baseline)
- 3.4.4 전체 — 문서 업데이트 (vLLM은 placeholder)
- 3.4.5 전체 — 안정화 작업 (6개)

**M3.4.B 잔여 범위** (M3.3 의존):

- 3.4.2.4 — vLLM E2E 테스트
- 3.4.4 — vLLM 문서 상세화 (placeholder → full docs)

## 전제 조건

- [x] Phase 2 모든 Milestone 완료 (M2.0~M2.6 + ETC)
- [x] GeminiAdapter 동등성 검증 완료
- [x] 기능 플래그 동작 확인
- [x] 🆕 EventType 전환 완료 (M2.연기 — GeminiEventType→LlmEventType, 16개 파일)
- [ ] Phase 3 핸드오프 문서 검토 완료

## Phase 2 연기 항목 추적 (핸드오프 기준)

| #    | 핸드오프 항목                             | Priority | 상태        | 해소 위치                    |
| ---- | ----------------------------------------- | -------- | ----------- | ---------------------------- |
| 1    | `client.ts` GeminiEventType 참조 정리     | Critical | ✅ 해소됨   | M2.연기 (EventType 전환)     |
| 2    | `turn.ts` 이벤트 생성점 전환              | Critical | ✅ 해소됨   | M2.연기 (EventType 전환)     |
| 3    | `chat.ts` → `providers/gemini/chat.ts`    | Critical | ✅ 해소됨   | M3.0.1 (`f56845dab`)         |
| 4    | `turn.ts` → `providers/gemini/turn.ts`    | Critical | ✅ 해소됨   | M3.0.1 (`f56845dab`)         |
| 5    | `messageInspectors` 마이그레이션 (4파일)  | High     | ✅ 해소됨   | M3.0.2                       |
| 6    | `loggingContentGenerator` 텔레메트리 변환 | High     | ✅ 해소됨   | M3.0.3 (`6a09c831d`)         |
| 7    | `telemetry/semantic.ts` Gemini 결합 해소  | High     | ✅ 해소됨   | M3.0.3 (`6a09c831d`)         |
| 8    | AuthType 처리 통합 (2.3.1.8)              | Medium   | ⬜ → M3.1+  | 신규 프로바이더 구현 시 함께 |
| 9    | 성능 검증 (응답 지연/메모리/스트리밍)     | Medium   | ⬜ → M3.4   | M3.4.3                       |
| 10   | E2E 테스트 통과 검증                      | Medium   | ✅ 해소됨   | M3.4.2 (12 tests PASS)       |
| 11   | `geminiTypeConversion.ts` 브릿지 정리     | Medium   | ✅ 해소됨   | M3.0.4                       |
| 12   | `telemetry/sdk.ts` 시그널 핸들러 누수     | Medium   | ✅ 해소됨   | M3.0.3 (`6a09c831d`)         |
| M2.7 | Agent/Telemetry 결합 해소                 | Watch    | ✅ 해소됨   | M3.0.3 (`6a09c831d`)         |
| 신규 | 런타임 실행 경로 연결 (ProviderFactory)   | High     | ✅ 해소됨   | M3.0.5                       |
| 신규 | root index.ts re-export 회귀 테스트       | Medium   | ✅ 해소됨   | M3.0.1.5 (`f56845dab`)       |
| 신규 | 프로바이더별 registry.register() 작업     | High     | ⬜ → M3.1~3 | M3.1.0.2/M3.2.0.2/M3.3.0.1   |
| 신규 | SDK 의존성 설치 (@anthropic-ai, openai)   | Low      | ⬜ → M3.1~2 | M3.1.0.1/M3.2.0.1            |

## 산출물

```
packages/core/src/providers/
├── gemini/
│   ├── chat.ts               # 🆕 geminiChat.ts 물리적 이동 (M3.0)
│   └── turn.ts               # 🆕 Gemini 특화 Turn 이동 (M3.0)
│
├── claude/
│   ├── adapter.ts
│   ├── converter.ts
│   ├── eventMapper.ts
│   └── types.ts
├── openai/
│   ├── adapter.ts
│   ├── converter.ts
│   ├── eventMapper.ts
│   └── types.ts
└── openai-compatible/
    ├── adapter.ts
    ├── converter.ts
    └── types.ts         # eventMapper 선택적 (OpenAI 호환)
```

---

# 3-STAGE WORK PROCESS (사전작업/본작업/사후작업)

각 Milestone 작업은 다음 3단계로 진행:

## 1️⃣ 사전작업 (Pre-work)

- [ ] 작업 개요 파악: 현재 Milestone 목표 및 세부 작업 확인
- [ ] 이전 작업 리뷰: Phase 2 완료 확인 및 작업 결과서 확인 (`working_history/`
      디렉토리)
- [ ] 이슈 파악: 이전 작업에서 전달된 이슈 및 Open Questions 확인
- [ ] 설계서 참조: 관련 설계 문서 검토 (03-technical-design.md,
      04-integration-design.md 등)

## 2️⃣ 본작업 (Main work) - TDD 사이클

- [ ] **Red**: 실패하는 테스트 작성
- [ ] **Green**: 최소한의 코드로 테스트 통과
- [ ] **Refactor**: 코드 개선 (테스트 통과 유지)
- [ ] 체크리스트 업데이트: 작업 완료 시 ✅ 표시

## 3️⃣ 사후작업 (Post-work)

- [ ] 체크리스트 최종 확인: 해당 Milestone 모든 항목 완료 확인
- [ ] 작업 결과서 작성: `working_history/Phase3_{Milestone}_{작업일자}.md`
- [ ] 커밋: 변경사항 커밋 및 커밋 ID 기록
- [ ] 이슈 전달: 다음 작업에 전달할 이슈 문서화

### 작업 결과서 템플릿

- 경로: `docs/ai_adapter/template/03_work_result_report_template.md`

---

# M3.0: 🆕 Phase 2 연기 항목 해소 — Gemini 내부 리팩토링 (3-5일)

> 📚 **참조**: [phase3_handoff.md](./phase3_handoff.md) (연기 항목 카탈로그),
> [Phase2 ETC 결과서](../working_history/Phase2_ETC_연기작업정리_20260208.md),
> [EventType 전환 결과서](../working_history/phase2_tradeoff_EventType전환_20260208.md)

## 목표

Phase 2에서 연기된 Gemini 내부 리팩토링 항목을 해소하여 신규 프로바이더 추가
기반 확보

## 배경

Phase 2 M2.0~M2.6에서 타입 시스템 독립화를 완료했으나, 파일 물리적
이동/텔레메트리 결합 해소/Agent 레이어 전환 등은 대규모 동작 변경을 수반하여
Phase 3으로 연기됨. M2.연기에서 EventType 전환(Critical #1, #2)은 이미 해소됨.

## 사전 결정 필요 사항 (Open Questions)

M3.0 착수 전 다음 Open Question의 잠정 결정 권장:

| OQ  | 질문                                       | 영향 범위     | 잠정 방안                                                        |
| --- | ------------------------------------------ | ------------- | ---------------------------------------------------------------- |
| Q5  | LocalAgentExecutor의 신규 인터페이스 형태? | 3.0.3.3       | AgentChat 추상 인터페이스 도입 (GeminiChat을 구현체로)           |
| Q6  | Telemetry usage 표준 스키마 정의?          | 3.0.3.4       | LlmTokenUsage (필수 3필드) 유지, SDK 타입은 변환                 |
| Q7  | CLI `--provider` 옵션 노출 여부?           | 3.0.5.5, M3.4 | 잠정: 환경변수(`LLM_PROVIDER`)로 충분. CLI 옵션은 M3.4 시점 결정 |

⚠️ 3.0.1~3.0.2, 3.0.4, 3.0.5는 Q5/Q6 무관하게 착수 가능. 3.0.3.3/3.0.3.4만 해당.
⚠️ Q7은 M3.0.5.5 우선순위 표의 1순위(명시적 provider 인자)가 내부 API 수준임을
전제. CLI 옵션 추가는 별도 결정.

## 작업 항목

### 3.0.1 Gemini 전용 파일 물리적 이동 (핸드오프 Critical #3, #4)

| ID      | 작업                                                   | 상태 | 테스트 파일                        | 비고                                                                                                                                    |
| ------- | ------------------------------------------------------ | ---- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 3.0.1.1 | `core/geminiChat.ts` → `providers/gemini/chat.ts` 이동 | ✅   | 기존 geminiChat.test.ts            | 999라인, re-export로 하위 호환. import 변경 대상 13개 파일                                                                              |
| 3.0.1.2 | `core/turn.ts` 전체 → `providers/gemini/turn.ts` 이동  | ✅   | 기존 turn.test.ts                  | 324라인, Turn 클래스 전체가 Gemini-specific (GeminiChat 생성자 의존). re-export로 하위 호환. import 변경 대상 10개 파일                 |
| 3.0.1.3 | 기존 import 경로 re-export 하위 호환성 유지            | ✅   | 기존 테스트 100% 통과              | M2.0 re-export 패턴 재활용                                                                                                              |
| 3.0.1.4 | core/index.ts export 정리                              | ✅   | `providers/gemini/exports.test.ts` | core/exports.test.ts는 미존재, gemini/ 내 파일 참조                                                                                     |
| 3.0.1.5 | root `index.ts` re-export 회귀 테스트 추가             | ✅   | `index.test.ts`                    | 7개 회귀 테스트 추가 완료. GeminiChat, StreamEventType, InvalidStreamError, Turn, CompressionStatus, LlmEventType, GeminiEventType 검증 |

**Tidy First 체크리스트**:

- [x] 모든 변경이 순수 구조적 (동작 변경 없음)
- [x] 각 이동마다 테스트 실행하여 회귀 확인
- [x] 커밋 메시지에 `[STRUCTURAL]` 태그

### 3.0.2 messageInspectors 마이그레이션 (핸드오프 High #5)

| ID      | 작업                                                                                            | 상태 | 테스트 파일                    | 비고                                                          |
| ------- | ----------------------------------------------------------------------------------------------- | ---- | ------------------------------ | ------------------------------------------------------------- |
| 3.0.2.1 | `loopDetectionService.ts` — `isFunctionCall/Response` → `isToolCallMessage/isToolResultMessage` | ✅   | `loopDetectionService.test.ts` | L408,416,437 convertContentToLlmMessage 브릿지 사용           |
| 3.0.2.2 | `geminiChat.ts` — `isFunctionResponse` 전환                                                     | ✅   | `geminiChat.test.ts`           | chat.ts 이동(3.0.1.1)과 연계, convertContentToLlmMessage 사용 |
| 3.0.2.3 | `utils/editCorrector.ts` — `isFunctionCall/Response` 전환                                       | ✅   | `editCorrector.test.ts`        | convertContentToLlmMessage 브릿지 사용                        |
| 3.0.2.4 | `utils/nextSpeakerChecker.ts` — `isFunctionResponse` 전환                                       | ✅   | `nextSpeakerChecker.test.ts`   | convertContentToLlmMessage 브릿지 사용                        |

**대체 함수** (M2.6에서 구현 완료):

- `isToolCallMessage(message: LlmMessage)` — `src/utils/llmUtils.ts:80`
- `isToolResultMessage(message: LlmMessage)` — `src/utils/llmUtils.ts:92`

⚠️ **주의**: 단순 함수 교체가 아님. 기존 함수는 `Content` 타입, 대체 함수는
`LlmMessage` 타입. 각 사용처에서 `Content` → `LlmMessage` 타입 전환이 선행되어야
함.

### 3.0.3 텔레메트리/Agent 레이어 독립화 (핸드오프 High #6, #7 + M2.7 + Medium #12)

| ID      | 작업                                                                        | 상태 | 테스트 파일                                        | 비고                                                                                      |
| ------- | --------------------------------------------------------------------------- | ---- | -------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 3.0.3.1 | `loggingContentGenerator.ts` — @google/genai import 제거                    | ✅   | `loggingContentGenerator.test.ts`                  | 11개 SDK 타입 import → 0. contentGenerator.ts re-export 경유 + telemetry 로컬 타입        |
| 3.0.3.2 | `telemetry/semantic.ts` — Part/Content/Candidate 타입 독립화                | ✅   | `semantic.test.ts`                                 | 6개 로컬 타입 + GeminiFinishReason const 객체. @google/genai 완전 제거                    |
| 3.0.3.3 | `LocalAgentExecutor` — GeminiChat 직접 결합 해소 (M2.7)                     | ✅   | `local-executor.test.ts`                           | Q5 잠정 방안 적용: AgentChatSession 인터페이스 + ChatSessionFactory 타입 도입             |
| 3.0.3.4 | `telemetry/types.ts` — `GenerateContentResponseUsageMetadata` 독립화 (M2.7) | ✅   | `telemetry/sdk.test.ts` (types 전용 테스트 미존재) | TelemetryUsageMetadata + TelemetryGenerateConfig 로컬 인터페이스. @google/genai 완전 제거 |
| 3.0.3.5 | `telemetry/sdk.ts` — SIGTERM/SIGINT 시그널 핸들러 누수 수정 (핸드오프 #12)  | ✅   | `telemetry/sdk.test.ts`                            | named handler + removeListener in shutdown. 신규 테스트 2건                               |

### 3.0.4 변환 브릿지 정리 (핸드오프 Medium #11)

| ID      | 작업                                                                 | 상태 | 테스트 파일                    | 비고                                                     |
| ------- | -------------------------------------------------------------------- | ---- | ------------------------------ | -------------------------------------------------------- |
| 3.0.4.1 | `geminiTypeConversion.ts` 브릿지 사용처 확인                         | ✅   | N/A (분석)                     | 6개 사이트, 5개 함수 — 모두 Gemini SDK 타입 입력         |
| 3.0.4.2 | `providers/gemini/typeConversion.ts`로 이동                          | ✅   | 관련 테스트 파일               | 6개 import 전환 + index.ts export 추가                   |
| 3.0.4.3 | `utils/geminiTypeConversion.ts` @deprecated + messageInspectors 삭제 | ✅   | `geminiTypeConversion.test.ts` | re-export shim 유지, messageInspectors.ts dead code 삭제 |

### 3.0.5 런타임 실행 경로 연결 (리뷰 #1 반영)

| ID      | 작업                                                                    | 상태 | 테스트 파일                                     | 비고                                                                                                |
| ------- | ----------------------------------------------------------------------- | ---- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 3.0.5.1 | `contentGenerator.ts` — `createContentGenerator()` 프로바이더 분기 추가 | ✅   | `contentGenerator.multiProvider.test.ts`        | 멀티 프로바이더 분기 + `wrapAdapterAsGenerator()` 추가                                              |
| 3.0.5.2 | `ProviderFactory` → 런타임 CLI 경로 통합                                | ✅   | `contentGenerator.multiProvider.test.ts`        | `ProviderFactory.create()` 호출이 contentGenerator에서 런타임 도달 확인 (시나리오 4, 5)             |
| 3.0.5.3 | `ENABLE_MULTI_PROVIDER` 플래그 분기 확장 및 검증                        | ✅   | `contentGenerator.multiProvider.test.ts`        | off→레거시(시나리오 1,2), on+Gemini→fall-through(시나리오 3,6,7), on+비Gemini→Factory(시나리오 4,5) |
| 3.0.5.4 | `ProviderRegistry`에 Gemini 어댑터 팩토리 등록 부트스트랩 구현          | ✅   | `bootstrap.test.ts` (7개)                       | `has()` 가드 패턴 채택. `bootstrapGeminiProvider()` in `providers/gemini/bootstrap.ts`              |
| 3.0.5.5 | 프로바이더 선택 우선순위 통합 및 회귀 테스트                            | ✅   | `contentGenerator.multiProvider.test.ts` (10개) | 7개 회귀 시나리오 전수 통과 + 3개 추가 (llm 위임, 레거시 throw, 부트스트랩 멱등)                    |

⚠️ **주의**: 이 작업 없이는 신규 프로바이더 어댑터(M3.1~M3.3)를 구현해도
런타임에서 도달 불가. `createContentGenerator()` (contentGenerator.ts:167-259,
GoogleGenAI 생성: L235)가 `new GoogleGenAI()` 하드코딩.
`ProviderFactory`/`ProviderSelector`는 테스트에서만 사용되며 런타임 경로 미연결.
`ENABLE_MULTI_PROVIDER` 플래그는 현재 `adapterBridge.ts`에서만 제어
(GeminiAdapter 래핑 여부)하며, contentGenerator의 프로바이더 선택에는 관여하지
않음.

**레지스트리 부트스트랩 설계** (3.0.5.4):

현재 `ProviderRegistry`는 인프라만 존재하고 런타임에서 `register()` 호출이 없음.
`factory.create('gemini', config)` 호출 시 `PROVIDER_NOT_FOUND` 에러 발생.

**중복 등록 안전성**: `registry.register()` 는 동일 이름 중복 시 예외를 던짐
(registry.ts:81, `has() && !force` 가드). 부트스트랩이 여러 번 호출될 수 있는
시나리오(HMR, 테스트 재초기화, Agent 재생성 등)에 대비해야 함.

구현 방안 (택 1):

1. **`has()` 가드 패턴** (권장): 부트스트랩에서 `if (!registry.has('gemini'))`
   체크 후 등록
2. **`force: true` 패턴**: `register('gemini', factory, { force: true })` — 항상
   덮어쓰기
3. **1회 초기화 보장**: 부트스트랩 함수에 `initialized` 플래그로 중복 호출 방지

초기화 위치 후보:

- `createContentGenerator()` 진입부 (런타임 경로 확실, 단 호출마다 실행)
- 앱 부트스트랩 (`packages/cli` 초기화 시점, 1회 보장)
- lazy init (첫 `factory.create()` 호출 시 자동 등록)

```
// 권장 패턴 (has() 가드)
function bootstrapProviders(registry: ProviderRegistry): void {
  if (!registry.has('gemini')) {
    registry.register('gemini', (config) => new GeminiAdapter(config, modelsApi));
  }
}
```

M3.1~M3.3에서도 각 프로바이더 등록 작업이 필수 (아래 각 마일스톤에 명시).
M3.1.0.2/M3.2.0.2/M3.3.0.1 모두 동일한 `has()` 가드 패턴 적용.

**프로바이더 선택 우선순위 계약** (3.0.5.5):

현재 2개 분리된 시스템이 상충:

- `contentGenerator.ts`: authType-only 분기 (L204-248), LLM_PROVIDER 미참조
- `providerSelector.ts`: LLM_PROVIDER > authType > env key 순서
- `getProviderFromConfig()`: explicit provider > authType > LLM_PROVIDER (또
  다른 순서)

통합 후 최종 우선순위:

| 순위 | 결정 소스                       | 예시                     | 비고                                                          |
| ---- | ------------------------------- | ------------------------ | ------------------------------------------------------------- |
| 1    | 명시적 provider 인자 (내부 API) | `providerName: 'claude'` | 프로그래밍 API 수준. CLI `--provider` 옵션은 미존재 — Q7 참조 |
| 2    | `LLM_PROVIDER` 환경변수         | `LLM_PROVIDER=openai`    | 환경 기반 선택                                                |
| 3    | `authType` (Gemini 한정)        | `AuthType.USE_VERTEX_AI` | Gemini 내부 경로 분기                                         |
| 4    | API Key 환경변수 존재 여부      | `GEMINI_API_KEY` 존재    | 자동 감지 폴백                                                |
| 5    | 기본값 (Gemini)                 | 모든 미설정 시           | 하위 호환                                                     |

> ⚠️ **Q7**: CLI `--provider` 옵션 추가 여부. 현재
> `packages/cli/src/config/config.ts`에 해당 옵션이 없음. 1순위는 내부
> `getProviderFromConfig()`의 프로그래밍 인자로만 존재. CLI 옵션 노출은
> M3.4(통합/문서) 시점에 결정 가능 — 환경변수(`LLM_PROVIDER`)만으로 충분할 수
> 있음.

회귀 테스트 시나리오:

| ENABLE_MULTI_PROVIDER | LLM_PROVIDER | authType      | 기대 결과 | 테스트                        |
| --------------------- | ------------ | ------------- | --------- | ----------------------------- |
| false                 | (미설정)     | USE_GEMINI    | Gemini    | ✅                            |
| false                 | claude       | USE_GEMINI    | Gemini    | ✅ (플래그 off → 레거시 경로) |
| true                  | (미설정)     | USE_GEMINI    | Gemini    | ✅                            |
| true                  | claude       | (미설정)      | Claude    | ✅                            |
| true                  | openai       | USE_VERTEX_AI | OpenAI    | ✅ (LLM_PROVIDER 우선)        |
| true                  | (미설정)     | USE_VERTEX_AI | Gemini    | ✅                            |
| true                  | (미설정)     | (미설정)      | Gemini    | ✅ (기본값 폴백)              |

**검증 기준**:

- [x] `core/geminiChat.ts` → `providers/gemini/chat.ts` 이동 완료
- [x] `core/turn.ts` Gemini 특화 분리 완료
- [x] root `index.ts` re-export 회귀 테스트 통과 (CLI import 호환성)
- [x] messageInspectors 4개 파일 마이그레이션 완료
- [x] 텔레메트리 레이어 @google/genai 독립화
- [x] LocalAgentExecutor GeminiChat 직접 결합 해소
- [x] `createContentGenerator()` → ProviderFactory 런타임 연결 완료
- [x] `ENABLE_MULTI_PROVIDER=true` 시 ProviderFactory 경로 도달 검증
- [x] `registry.register('gemini', ...)` 부트스트랩 동작 확인
- [x] 부트스트랩 중복 호출 시 예외 미발생 (has() 가드 또는 force 정책)
- [x] 프로바이더 선택 우선순위 7개 회귀 시나리오 전수 통과
- [x] 모든 기존 테스트 100% 통과
- [x] TypeScript 컴파일 에러 없음

---

# M3.1: Claude 어댑터/변환기 구현 (4-5일)

> 📚 **설계서 참조**:
> [03-technical-design.md §3.3.4 Claude 어댑터](../03-technical-design.md#334-claude-어댑터),
> [§3.3.5 Claude 타입 변환기](../03-technical-design.md#335-claude-타입-변환기-추가),
> [§3.3.6 Claude 어댑터 구현](../03-technical-design.md#336-claude-어댑터-추가),
> [05-implementation-plan.md §M3.1](../05-implementation-plan.md#m31-claude-어댑터변환기-구현-4-5일)

## 목표

Claude 메시지/툴/스트림 변환기 구현

## Claude 특화 고려사항

- System 메시지 분리 필요 (별도 파라미터)
- 이미지는 base64 필수 (URL 직접 지원 안함)
- 스트리밍 tool delta 합성 필요
- `content_block_delta` 이벤트 처리

## 작업 항목

### 3.1.0 사전 준비

| ID      | 작업                                  | 상태 | 테스트 파일         | 비고                                                        |
| ------- | ------------------------------------- | ---- | ------------------- | ----------------------------------------------------------- |
| 3.1.0.1 | `@anthropic-ai/sdk` 의존성 설치       | ✅   | N/A                 | `^0.74.0` — packages/core/package.json에 추가 완료 (M3.1.0) |
| 3.1.0.2 | ProviderRegistry에 Claude 팩토리 등록 | ✅   | `bootstrap.test.ts` | `bootstrapClaudeProvider()` + `has()` 가드 패턴 (M3.1.0)    |

### 3.1.1 ClaudeAdapter 구현

| ID      | 작업                           | 상태 | 테스트 파일       | 비고                                                    |
| ------- | ------------------------------ | ---- | ----------------- | ------------------------------------------------------- |
| 3.1.1.1 | `ClaudeAdapter` 클래스 생성    | ✅   | `adapter.test.ts` | ClaudeClient DI 인터페이스 포함 (M3.1.1)                |
| 3.1.1.2 | `BaseAdapter` 상속 구현        | ✅   | `adapter.test.ts` | validateRequest 상속, mapToProviderConfig 구현 (M3.1.1) |
| 3.1.1.3 | Anthropic SDK 연동             | ✅   | `adapter.test.ts` | ClaudeClient 인터페이스 통한 DI 패턴 (M3.1.1)           |
| 3.1.1.4 | `generate()` 메서드 구현       | ✅   | `adapter.test.ts` | generateContent + classifyError (M3.1.1+M3.1.3)         |
| 3.1.1.5 | `generateStream()` 메서드 구현 | ✅   | `adapter.test.ts` | generateContentStream + yield 패턴 (M3.1.1+M3.1.3)      |
| 3.1.1.6 | `getCapabilities()` 구현       | ✅   | `adapter.test.ts` | CLAUDE_CAPABILITIES const (M3.1.1)                      |
| 3.1.1.7 | 설정 검증 (API Key)            | ✅   | `adapter.test.ts` | BaseAdapter.validateRequest 위임 (M3.1.1)               |

**TDD 시나리오**:

```typescript
describe('ClaudeAdapter', () => {
  it('should implement BaseAdapter interface', () => {
    const adapter = new ClaudeAdapter({
      apiKey: 'test-key',
      model: 'claude-sonnet-4-20250514',
    });

    expect(adapter).toBeInstanceOf(BaseAdapter);
  });

  it('should separate system message in API call', async () => {
    const adapter = new ClaudeAdapter(config);
    const request: LlmGenerateRequest = {
      messages: [
        {
          role: LlmRole.System,
          content: [{ type: 'text', text: 'Be helpful' }],
        },
        { role: LlmRole.User, content: [{ type: 'text', text: 'Hi' }] },
      ],
    };

    // Mock Anthropic SDK
    const mockCreate = vi.spyOn(anthropic.messages, 'create');
    await adapter.generate(request);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        system: 'Be helpful',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
      }),
    );
  });
});
```

### 3.1.2 Claude 메시지 변환기

| ID      | 작업                             | 상태 | 테스트 파일         | 비고                                               |
| ------- | -------------------------------- | ---- | ------------------- | -------------------------------------------------- |
| 3.1.2.1 | `toClaudeMessage()` 변환 함수    | ✅   | `converter.test.ts` | toClaudeMessages + toClaudeContent (M3.1.1+M3.1.2) |
| 3.1.2.2 | System 메시지 분리 로직          | ✅   | `converter.test.ts` | system 추출 + 복수 system 병합 (M3.1.1)            |
| 3.1.2.3 | 이미지 URL → base64 변환         | ✅   | `converter.test.ts` | base64 지원, URL은 경고 텍스트 (M3.1.2)            |
| 3.1.2.4 | `toClaudeTool()` 변환 함수       | ✅   | `converter.test.ts` | toClaudeTools + toClaudeToolChoice (M3.1.1)        |
| 3.1.2.5 | `fromClaudeResponse()` 변환 함수 | ✅   | `converter.test.ts` | thinking/redacted_thinking 포함 (M3.1.1)           |

**TDD 시나리오**:

```typescript
describe('Claude Message Converter', () => {
  it('should extract system message separately', () => {
    const messages: LlmMessage[] = [
      {
        role: LlmRole.System,
        content: [{ type: 'text', text: 'System prompt' }],
      },
      { role: LlmRole.User, content: [{ type: 'text', text: 'User message' }] },
    ];

    const { systemPrompt, claudeMessages } = toClaudeMessages(messages);

    expect(systemPrompt).toBe('System prompt');
    expect(claudeMessages).toHaveLength(1);
    expect(claudeMessages[0].role).toBe('user');
  });

  it('should convert image URL to base64', async () => {
    const message: LlmMessage = {
      role: LlmRole.User,
      content: [
        {
          type: 'image',
          source: { type: 'url', url: 'https://example.com/image.png' },
        },
      ],
    };

    const claudeMessage = await toClaudeMessage(message);

    expect(claudeMessage.content[0].type).toBe('image');
    expect(claudeMessage.content[0].source.type).toBe('base64');
  });
});
```

### 3.1.3 Claude 스트림 변환기

| ID      | 작업                           | 상태 | 테스트 파일         | 비고                                                               |
| ------- | ------------------------------ | ---- | ------------------- | ------------------------------------------------------------------ |
| 3.1.3.1 | `fromClaudeStreamEvent()` 변환 | ✅   | `converter.test.ts` | convertStreamEvent + createStreamState (M3.1.1)                    |
| 3.1.3.2 | `content_block_start` 처리     | ✅   | `converter.test.ts` | tool_use 블록 시작 + index 기반 추적 (M3.1.1)                      |
| 3.1.3.3 | `content_block_delta` 처리     | ✅   | `converter.test.ts` | text_delta, thinking_delta, input_json_delta (M3.1.1)              |
| 3.1.3.4 | `content_block_stop` 처리      | ✅   | `converter.test.ts` | tool call JSON 파싱 + ToolCallRequest emit (M3.1.1)                |
| 3.1.3.5 | Tool delta 합성 로직           | ✅   | `converter.test.ts` | parallel tool calls via index-based Map (M3.1.1)                   |
| 3.1.3.6 | Usage 정보 추출                | ✅   | `converter.test.ts` | message_start input + message_delta output + cache tokens (M3.1.3) |

**TDD 시나리오**:

```typescript
describe('Claude Stream Converter', () => {
  it('should convert text delta events', async () => {
    const claudeEvents = [
      {
        type: 'content_block_start',
        content_block: { type: 'text', text: '' },
      },
      {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hello' },
      },
      { type: 'content_block_stop' },
    ];

    const events: LlmStreamEvent[] = [];
    for (const event of claudeEvents) {
      const converted = fromClaudeStreamEvent(event);
      if (converted) events.push(converted);
    }

    expect(events[0].type).toBe('text_delta');
    expect(events[0].text).toBe('Hello');
  });

  it('should assemble tool call deltas', async () => {
    const assembler = new StreamAssembler();
    // Claude tool delta events
    assembler.push(
      fromClaudeStreamEvent({
        type: 'content_block_start',
        content_block: { type: 'tool_use', id: 'tool_1', name: 'read_file' },
      }),
    );
    assembler.push(
      fromClaudeStreamEvent({
        type: 'content_block_delta',
        delta: { type: 'input_json_delta', partial_json: '{"path":' },
      }),
    );
    assembler.push(
      fromClaudeStreamEvent({
        type: 'content_block_delta',
        delta: { type: 'input_json_delta', partial_json: '"/tmp"}' },
      }),
    );

    const result = assembler.getMessage();
    expect(result.content[0].type).toBe('tool_call');
    expect(result.content[0].arguments).toEqual({ path: '/tmp' });
  });
});
```

### 3.1.4 Claude 에러 매핑

| ID      | 작업                    | 상태 | 테스트 파일       | 비고                                                          |
| ------- | ----------------------- | ---- | ----------------- | ------------------------------------------------------------- |
| 3.1.4.1 | Anthropic SDK 에러 분석 | ✅   | N/A (분석)        | M3.1.3에서 구현 완료 — classifyError duck typing 패턴         |
| 3.1.4.2 | Rate limit 에러 매핑    | ✅   | `adapter.test.ts` | M3.1.3에서 구현 — 429→RateLimitError (retryable)              |
| 3.1.4.3 | Auth 에러 매핑          | ✅   | `adapter.test.ts` | M3.1.3에서 구현 — 401/403→AuthenticationError (non-retryable) |
| 3.1.4.4 | Overloaded 에러 매핑    | ✅   | `adapter.test.ts` | M3.1.3에서 구현 — 529→MODEL_OVERLOADED (retryable)            |
| 3.1.4.5 | 에러 변환 유틸 함수     | ✅   | `adapter.test.ts` | M3.1.3에서 구현 — classifyError + LlmError passthrough        |

⚠️ **참고**: M3.1.4 전체 범위가 M3.1.3 (스트림 에러 고도화) 작업에서 선행
구현됨. 설계서 §3.3.6 대비 추가 구현: 400/422→INVALID_REQUEST,
404→ModelNotFoundError, 500+→SERVER_ERROR, timeout/network 휴리스틱, LlmError
passthrough.

**검증 기준**:

- [x] Claude 기본 대화 동작
- [x] Claude 스트리밍 동작
- [x] Claude 도구 호출 동작
- [x] Claude 이미지 입력 동작

---

# M3.2: OpenAI 어댑터/변환기 구현 (3-4일)

> 📚 **설계서 참조**:
> [03-technical-design.md §3.3.7 OpenAI 어댑터](../03-technical-design.md#337-openai-어댑터-구조-예시),
> [§3.3.8 OpenAI 타입 변환기](../03-technical-design.md#338-openai-타입-변환기-추가),
> [05-implementation-plan.md §M3.2](../05-implementation-plan.md#m32-openai-어댑터변환기-구현-3-4일)

## 목표

OpenAI 메시지/툴/스트림 변환기 구현

## OpenAI 특화 고려사항

- System 메시지 첫 번째로 위치
- JSON mode / response_format 지원
- function_call → tool_calls 전환

## 작업 항목

### 3.2.0 사전 준비

| ID      | 작업                                  | 상태 | 테스트 파일         | 비고                                                                    |
| ------- | ------------------------------------- | ---- | ------------------- | ----------------------------------------------------------------------- |
| 3.2.0.1 | `openai` SDK 의존성 설치              | ✅   | N/A                 | `openai@^6.18.0` 설치 (설계서 ^4.70.0보다 최신)                         |
| 3.2.0.2 | ProviderRegistry에 OpenAI 팩토리 등록 | ✅   | `bootstrap.test.ts` | `bootstrapOpenAiProvider()` — has() 가드, singleton 기본값, config 전달 |

### 3.2.1 OpenAiAdapter 구현

| ID      | 작업                           | 상태 | 테스트 파일       | 비고                                                              |
| ------- | ------------------------------ | ---- | ----------------- | ----------------------------------------------------------------- |
| 3.2.1.1 | `OpenAiAdapter` 클래스 생성    | ✅   | `adapter.test.ts` | DI 패턴: `OpenAiClient` 인터페이스                                |
| 3.2.1.2 | `BaseAdapter` 상속 구현        | ✅   | `adapter.test.ts` | validateRequest, mapToProviderConfig 구현                         |
| 3.2.1.3 | OpenAI SDK 연동                | ✅   | `adapter.test.ts` | `client.chat.completions.create()` 호출                           |
| 3.2.1.4 | `generateContent()` 구현       | ✅   | `adapter.test.ts` | 변환→호출→역변환 패턴, classifyError 에러 분류                    |
| 3.2.1.5 | `generateContentStream()` 구현 | ✅   | `adapter.test.ts` | M3.2.A: 스켈레톤, M3.2.B: 변환기 완성 + `supportsStreaming: true` |
| 3.2.1.6 | capabilities 선언              | ✅   | `adapter.test.ts` | `supportsTokenCount: false`, `supportsThought: false`             |

**TDD 시나리오**:

```typescript
describe('OpenAIAdapter', () => {
  it('should generate response using OpenAI SDK', async () => {
    const adapter = new OpenAIAdapter({
      apiKey: 'test-key',
      model: 'gpt-4o'
    });

    const request: LlmGenerateRequest = {
      messages: [{ role: LlmRole.User, content: [{ type: 'text', text: 'Hi' }] }]
    };

    const response = await adapter.generate(request);
    expect(response.message).toBeDefined();
  });

  it('should support JSON mode', async () => {
    const adapter = new OpenAIAdapter(config);
    const request: LlmGenerateRequest = {
      messages: [...],
      responseFormat: { type: 'json_object' }
    };

    const mockCreate = vi.spyOn(openai.chat.completions, 'create');
    await adapter.generate(request);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: { type: 'json_object' }
      })
    );
  });
});
```

### 3.2.2 OpenAI 메시지 변환기

| ID      | 작업                        | 상태 | 테스트 파일         | 비고                                                    |
| ------- | --------------------------- | ---- | ------------------- | ------------------------------------------------------- |
| 3.2.2.1 | `toOpenAiMessages()` 변환   | ✅   | `converter.test.ts` | 4 role (system/user/assistant/tool) + 혼합 content 처리 |
| 3.2.2.2 | System 메시지 순서 처리     | ✅   | `converter.test.ts` | systemInstruction → 첫 번째 system 메시지로 prepend     |
| 3.2.2.3 | 이미지 URL/base64 처리      | ✅   | `converter.test.ts` | URL 직접 전달, base64→data URI 변환                     |
| 3.2.2.4 | `toOpenAiTools()` 변환      | ✅   | `converter.test.ts` | `{ type: 'function', function: {...} }` 래핑            |
| 3.2.2.5 | `fromOpenAiResponse()` 변환 | ✅   | `converter.test.ts` | text, tool_calls, usage, cached_tokens 추출             |
| 3.2.2.6 | JSON mode 매핑              | ✅   | `converter.test.ts` | `responseFormat: 'json'` → `{ type: 'json_object' }`    |

**TDD 시나리오**:

```typescript
describe('OpenAI Message Converter', () => {
  it('should place system message first', () => {
    const messages: LlmMessage[] = [
      { role: LlmRole.User, content: [{ type: 'text', text: 'Hi' }] },
      { role: LlmRole.System, content: [{ type: 'text', text: 'Be helpful' }] },
    ];

    const openaiMessages = toOpenAIMessages(messages);

    expect(openaiMessages[0].role).toBe('system');
    expect(openaiMessages[1].role).toBe('user');
  });

  it('should convert image URL directly', () => {
    const message: LlmMessage = {
      role: LlmRole.User,
      content: [
        {
          type: 'image',
          source: { type: 'url', url: 'https://example.com/image.png' },
        },
      ],
    };

    const openaiMessage = toOpenAIMessage(message);

    expect(openaiMessage.content[0].type).toBe('image_url');
    expect(openaiMessage.content[0].image_url.url).toBe(
      'https://example.com/image.png',
    );
  });
});
```

### 3.2.3 OpenAI 스트림 변환기

| ID      | 작업                        | 상태 | 테스트 파일         | 비고                                                                                 |
| ------- | --------------------------- | ---- | ------------------- | ------------------------------------------------------------------------------------ |
| 3.2.3.1 | `convertStreamEvent()` 변환 | ✅   | `converter.test.ts` | text delta 5건 + tool call 8건 + finish 4건 + usage 4건 + 통합 2건 + 엣지 2건 = 25건 |
| 3.2.3.2 | 텍스트 델타 처리            | ✅   | `converter.test.ts` | T1-T5: delta.content 비empty → TextDelta, null/empty/role-only 필터링                |
| 3.2.3.3 | Tool call 델타 처리         | ✅   | `converter.test.ts` | T6-T13: index 기반 축적, 병렬 추적, finish_reason=tool_calls 시 일괄 발행            |
| 3.2.3.4 | Usage 정보 추출             | ✅   | `converter.test.ts` | T18-T21: usage-only 최종 청크 → MessageEnd, cached_tokens 추출                       |

### 3.2.4 OpenAI 에러 매핑

| ID      | 작업                 | 상태 | 테스트 파일       | 비고                                                                  |
| ------- | -------------------- | ---- | ----------------- | --------------------------------------------------------------------- |
| 3.2.4.1 | OpenAI SDK 에러 분석 | ✅   | N/A (분석)        | M3.2.A 사전작업에서 SDK d.ts 전수 분석 완료                           |
| 3.2.4.2 | Rate limit 에러 매핑 | ✅   | `adapter.test.ts` | 429→RateLimitError, Claude와 동일 패턴                                |
| 3.2.4.3 | Auth 에러 매핑       | ✅   | `adapter.test.ts` | 401/403→AuthenticationError                                           |
| 3.2.4.4 | 에러 변환 유틸 함수  | ✅   | `adapter.test.ts` | `classifyError()` — 8 status code + message heuristic + LlmError 보존 |

**검증 기준**:

- [x] OpenAI 기본 대화 동작
- [x] OpenAI 스트리밍 동작 (M3.2.B — `convertStreamEvent` 25건 + adapter
      streaming 3건)
- [x] OpenAI 도구 호출 동작
- [x] OpenAI JSON mode 동작

---

# M3.3: OpenAI-Compatible(vLLM/sLM) 어댑터 템플릿 (3일)

> 📚 **설계서 참조**:
> [03-technical-design.md §3.4 vLLM 및 OpenAI 호환 프로바이더 확장](../03-technical-design.md#34-vllm-및-기타-openai-호환-프로바이더-확장),
> [05-implementation-plan.md §M3.3](../05-implementation-plan.md#m33-openai-compatiblevllmslm-어댑터-템플릿-3일)

## 목표

vLLM, TGI, LM Studio 등 OpenAI 호환 API 지원

## 특화 고려사항

- Custom baseUrl 지원
- Custom headers 지원
- 다양한 API Key 헤더 지원
- 모델별 ChatTemplate 훅

## 작업 항목

### 3.3.0 사전 준비

| ID      | 작업                                             | 상태 | 테스트 파일        | 비고                                                                                                             |
| ------- | ------------------------------------------------ | ---- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 3.3.0.1 | ProviderRegistry에 OpenAI-Compatible 팩토리 등록 | ⬜   | `registry.test.ts` | 부트스트랩에 `register('openai-compatible', openaiCompatFactory)` 추가. `openai` SDK 재사용 (M3.2에서 설치 완료) |

### 3.3.1 OpenAICompatibleAdapter 구현

| ID      | 작업                             | 상태 | 테스트 파일                   |
| ------- | -------------------------------- | ---- | ----------------------------- |
| 3.3.1.1 | `OpenAICompatibleAdapter` 클래스 | ⬜   | `openaiCompatAdapter.test.ts` |
| 3.3.1.2 | `OpenAIAdapter` 상속             | ⬜   | `openaiCompatAdapter.test.ts` |
| 3.3.1.3 | `baseUrl` 설정 지원              | ⬜   | `openaiCompatAdapter.test.ts` |
| 3.3.1.4 | Custom headers 지원              | ⬜   | `openaiCompatAdapter.test.ts` |
| 3.3.1.5 | `apiKeyHeaderName` 지원          | ⬜   | `openaiCompatAdapter.test.ts` |
| 3.3.1.6 | 연결 테스트 메서드               | ⬜   | `openaiCompatAdapter.test.ts` |

**TDD 시나리오**:

```typescript
describe('OpenAICompatibleAdapter', () => {
  it('should use custom baseUrl', async () => {
    const adapter = new OpenAICompatibleAdapter({
      baseUrl: 'http://localhost:8000/v1',
      model: 'meta-llama/Llama-3.1-8B-Instruct',
    });

    const mockFetch = vi.spyOn(global, 'fetch');
    await adapter.generate(request);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('http://localhost:8000/v1'),
      expect.any(Object),
    );
  });

  it('should support custom API key header', async () => {
    const adapter = new OpenAICompatibleAdapter({
      baseUrl: 'http://localhost:8000/v1',
      apiKey: 'my-key',
      apiKeyHeaderName: 'X-Custom-Auth',
    });

    const mockFetch = vi.spyOn(global, 'fetch');
    await adapter.generate(request);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Custom-Auth': 'my-key',
        }),
      }),
    );
  });
});
```

### 3.3.2 모델별 템플릿 훅

| ID      | 작업                       | 상태 | 테스트 파일             |
| ------- | -------------------------- | ---- | ----------------------- |
| 3.3.2.1 | `PromptBuilder` 인터페이스 | ⬜   | `promptBuilder.test.ts` |
| 3.3.2.2 | Llama3 ChatTemplate        | ⬜   | `promptBuilder.test.ts` |
| 3.3.2.3 | Mistral ChatTemplate       | ⬜   | `promptBuilder.test.ts` |
| 3.3.2.4 | 범용 ChatML 템플릿         | ⬜   | `promptBuilder.test.ts` |

### 3.3.3 호환성 시나리오 테스트

| ID      | 작업                    | 상태 | 테스트 파일              |
| ------- | ----------------------- | ---- | ------------------------ |
| 3.3.3.1 | vLLM 호환성 테스트      | ⬜   | `vllmCompat.test.ts`     |
| 3.3.3.2 | TGI 호환성 테스트       | ⬜   | `tgiCompat.test.ts`      |
| 3.3.3.3 | LM Studio 호환성 테스트 | ⬜   | `lmstudioCompat.test.ts` |
| 3.3.3.4 | Ollama 호환성 테스트    | ⬜   | `ollamaCompat.test.ts`   |

**검증 기준**:

- [ ] vLLM 기본 대화 동작
- [ ] Custom baseUrl 동작
- [ ] Custom headers 동작

---

# M3.4: 통합 테스트/문서/안정화 — ⚡ 부분 선행

> 📚 **설계서 참조**:
> [04-integration-design.md §4.2 연동 아키텍처](../04-integration-design.md#42-연동-아키텍처)
> (통합 테스트 시나리오),
> [05-implementation-plan.md §5.5 테스트 및 검증](../05-implementation-plan.md#55-테스트-및-검증),
> [§M3.4](../05-implementation-plan.md#m34-통합-테스트문서안정화-5-7일)
>
> ⚡ **실행 순서**: M3.4.A (선행) → M3.3 → M3.4.B (잔여)
>
> **선행 범위**: Gemini/Claude/OpenAI (3 providers) 기반 통합 테스트 및 문서화
> **M3.3 의존 항목**: vLLM E2E 테스트, OpenAI-Compatible 문서 상세화

## 목표

멀티 프로바이더 통합 검증 및 문서화 (Phase: 3 providers → 4 providers)

---

## M3.4.A: 선행 가능 항목 (3-Provider Integration)

> **전제 조건**: M3.0 ✅, M3.1 ✅, M3.2 ✅
>
> **작업 기간**: 3-4일

## 작업 항목

### 3.4.1 멀티 프로바이더 통합 테스트

| ID      | 작업                        | 상태 | 테스트 파일                         | M3.3 의존 |
| ------- | --------------------------- | ---- | ----------------------------------- | --------- |
| 3.4.1.1 | 프로바이더 전환 테스트      | ✅   | `multiProvider.integration.test.ts` | ❌        |
| 3.4.1.2 | 동시 프로바이더 사용 테스트 | ✅   | `multiProvider.integration.test.ts` | ❌        |
| 3.4.1.3 | 설정 검증 통합 테스트       | ✅   | `providerConfigIntegration.test.ts` | ❌        |
| 3.4.1.4 | 에러 처리 통합 테스트       | ✅   | `errorHandling.integration.test.ts` | ❌        |

### 3.4.2 E2E 테스트 시나리오

| ID      | 작업                   | 상태 | 테스트 파일              | M3.3 의존   |
| ------- | ---------------------- | ---- | ------------------------ | ----------- |
| 3.4.2.1 | Gemini E2E 테스트      | ✅   | `multi-provider.test.ts` | ❌          |
| 3.4.2.2 | Claude E2E 테스트      | ✅   | `multi-provider.test.ts` | ❌          |
| 3.4.2.3 | OpenAI E2E 테스트      | ✅   | `multi-provider.test.ts` | ❌          |
| 3.4.2.4 | vLLM E2E 테스트 (선택) | ⬜   | E2E                      | ✅ → M3.4.B |

**E2E 테스트 매트릭스 (M3.4.A 선행 범위)**:

| 시나리오      | Gemini | Claude | OpenAI | vLLM (M3.4.B) |
| ------------- | ------ | ------ | ------ | ------------- |
| 기본 대화     | ✅     | ✅     | ✅     | ⏳ M3.3 후    |
| 스트리밍 대화 | ✅     | ✅     | ✅     | ⏳ M3.3 후    |
| 도구 호출     | ✅     | ✅     | ✅     | ⏳ M3.3 후    |
| 이미지 입력   | ⬜     | ⬜     | ⬜     | ⏳ M3.3 후    |
| 에러 처리     | ✅     | ✅     | ✅     | ⏳ M3.3 후    |

### 3.4.3 성능 회귀 테스트 (3-Provider Baseline)

| ID      | 작업                      | 상태 | 테스트 파일                               | M3.3 의존 |
| ------- | ------------------------- | ---- | ----------------------------------------- | --------- |
| 3.4.3.1 | 응답 지연 벤치마크        | ✅   | `providers/__tests__/performance.test.ts` | ❌        |
| 3.4.3.2 | 스트리밍 첫 토큰 벤치마크 | ✅   | `providers/__tests__/performance.test.ts` | ❌        |
| 3.4.3.3 | 메모리 사용량 프로파일링  | ✅   | `providers/__tests__/performance.test.ts` | ❌        |
| 3.4.3.4 | 번들 크기 분석            | ✅   | `providers/__tests__/bundleSize.test.ts`  | ❌        |

**성능 기준**:

- 응답 지연 증가 < 50ms
- 스트리밍 첫 토큰 지연 < 100ms
- 메모리 증가 < 10%
- 번들 크기 증가 < 500KB

### 3.4.4 문서 업데이트 (3-Provider + vLLM Placeholder)

| ID      | 작업                  | 상태 | 산출물                  | M3.3 의존 |
| ------- | --------------------- | ---- | ----------------------- | --------- |
| 3.4.4.1 | 사용자 가이드 작성    | ⬜   | `docs/providers.md`     | 🔶        |
| 3.4.4.2 | API 레퍼런스 업데이트 | ⬜   | `docs/api/`             | ❌        |
| 3.4.4.3 | 환경변수 문서화       | ⬜   | `docs/configuration.md` | 🔶        |
| 3.4.4.4 | 마이그레이션 가이드   | ⬜   | `docs/migration.md`     | ❌        |
| 3.4.4.5 | README 업데이트       | ⬜   | `README.md`             | 🔶        |

🔶 = 3 providers 완전 문서화 + vLLM placeholder 포함, M3.4.B에서 상세화

### 3.4.5 안정화 작업 (3-Provider Scope)

| ID      | 작업               | 상태 | M3.3 의존 | 비고                                                                                                                       |
| ------- | ------------------ | ---- | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| 3.4.5.1 | 버그 수정          | ⬜   | ❌        | 이슈 트래킹                                                                                                                |
| 3.4.5.2 | 에지 케이스 처리   | ⬜   | ❌        |                                                                                                                            |
| 3.4.5.3 | 에러 메시지 개선   | ⬜   | ❌        |                                                                                                                            |
| 3.4.5.4 | 로깅 개선          | ⬜   | ❌        |                                                                                                                            |
| 3.4.5.5 | 기능 플래그 정리   | ⬜   | ❌        |                                                                                                                            |
| 3.4.5.6 | 의존성 정합성 검증 | ⬜   | ❌        | package.json에 `@anthropic-ai/sdk`, `openai` 존재 확인, `npm ci` 클린 설치 성공, lockfile 동기화, esbuild 번들링 포함 확인 |

**M3.4.A 검증 기준** (선행 완료 조건):

- [ ] 멀티 프로바이더 통합 테스트 통과 (3.4.1.1~3.4.1.4)
- [x] Gemini/Claude/OpenAI E2E 테스트 통과 (3.4.2.1~3.4.2.3)
- [x] 성능 회귀 없음 (3-provider baseline 기준 내)
- [ ] 3-provider 문서 완성 (vLLM placeholder 포함)
- [ ] 의존성 검증 (`npm ci` 성공, esbuild bundle 포함 확인)

---

## M3.4.B: M3.3 의존 항목 (vLLM Integration)

> **전제 조건**: M3.3 완료 (OpenAI-Compatible adapter)
>
> **작업 기간**: 1-2일

### 3.4.2 E2E 테스트 시나리오 (vLLM Subset)

| ID      | 작업                   | 상태 | 테스트 파일 |
| ------- | ---------------------- | ---- | ----------- |
| 3.4.2.4 | vLLM E2E 테스트 (선택) | ⬜   | E2E         |

### 3.4.4 문서 업데이트 (vLLM 상세화)

| ID        | 작업                     | 상태 | 산출물                  |
| --------- | ------------------------ | ---- | ----------------------- |
| 3.4.4.1-B | vLLM 섹션 상세화         | ⬜   | `docs/providers.md`     |
| 3.4.4.3-B | LLM_BASE_URL 문서 상세화 | ⬜   | `docs/configuration.md` |
| 3.4.4.5-B | vLLM Quick Start 추가    | ⬜   | `README.md`             |

**M3.4.B 검증 기준** (전체 M3.4 완료 조건):

- [ ] vLLM E2E 테스트 통과 (또는 환경 의존 skip 처리)
- [ ] vLLM 문서 완성 (placeholder → full docs)
- [ ] 전체 M3.4 완료 (M3.4.A + M3.4.B)

---

# M3.5: 테스트 마이그레이션 (3-4일) [v0.2 신규]

> 📚 **설계서 참조**:
> [05-implementation-plan.md §5.5 테스트 및 검증](../05-implementation-plan.md#55-테스트-및-검증)
> (테스트 전략),
> [03-technical-design.md §3.1 타입 시스템](../03-technical-design.md#31-프로바이더-독립적-타입-시스템)
> (Mock 타입 전환 참조)

## 목표

Gemini 특화 테스트를 프로바이더 중립적 테스트로 전환

## 배경

Phase 2에서 리팩토링된 코드에 대응하여 기존 테스트도 함께 마이그레이션 필요

## 작업 항목

### 3.5.1 테스트 파일 분석

| ID      | 작업                                | 상태 | 산출물           |
| ------- | ----------------------------------- | ---- | ---------------- |
| 3.5.1.1 | Gemini 특화 테스트 파일 식별        | ⬜   | 테스트 파일 목록 |
| 3.5.1.2 | 테스트 내 @google/genai 의존성 분석 | ⬜   | 의존성 매트릭스  |
| 3.5.1.3 | Mock 객체 Gemini 특화 여부 분석     | ⬜   | Mock 분석 문서   |
| 3.5.1.4 | 테스트 수정 범위 산정               | ⬜   | 수정 범위 문서   |

**분석 대상 테스트 파일** (실제 존재 확인됨):

```
packages/core/src/
├── core/
│   ├── contentGenerator.test.ts    # GenerateContentParameters 의존
│   ├── turn.test.ts                # GeminiEventType 의존
│   ├── geminiChat.test.ts          # Gemini 응답/스트리밍 의존 🆕
│   ├── baseLlmClient.test.ts       # 🆕 baseLlmClient 의존
│   ├── loggingContentGenerator.test.ts   # 래퍼 클래스
│   ├── recordingContentGenerator.test.ts # 래퍼 클래스
│   └── fakeContentGenerator.test.ts      # Mock 구현
├── services/
│   └── modelConfigService.test.ts  # GenerateContentConfig 의존
├── routing/
│   ├── modelRouterService.test.ts  # 🆕 라우팅 레이어
│   └── strategies/*.test.ts        # 🆕 라우팅 전략
└── utils/
    ├── tokenCalculation.test.ts    # Part, Content 타입 의존
    └── partUtils.test.ts           # Part 타입 의존
```

⚠️ **주의**: `session.test.ts`는 존재하지 않음 (원본 계획서 오류 수정됨)

### 3.5.2 테스트 마이그레이션 전략

| ID      | 작업                      | 상태 | 테스트 파일                     |
| ------- | ------------------------- | ---- | ------------------------------- |
| 3.5.2.1 | 공통 Mock Factory 설계    | ⬜   | `testUtils/mockFactory.ts`      |
| 3.5.2.2 | 프로바이더 중립 Mock 구현 | ⬜   | `testUtils/mockFactory.test.ts` |
| 3.5.2.3 | 프로바이더별 Mock 어댑터  | ⬜   | `testUtils/mockAdapters.ts`     |
| 3.5.2.4 | 테스트 데이터 팩토리      | ⬜   | `testUtils/testDataFactory.ts`  |

**TDD 시나리오**:

```typescript
describe('MockFactory', () => {
  it('should create provider-agnostic mock message', () => {
    const mockMessage = MockFactory.createMessage({
      role: LlmRole.User,
      text: 'Hello',
    });

    expect(mockMessage.role).toBe(LlmRole.User);
    expect(mockMessage.content[0].type).toBe('text');
  });

  it('should create provider-specific response via adapter', () => {
    const genericResponse = MockFactory.createResponse({ text: 'Hi' });

    // Gemini용 변환
    const geminiResponse = MockAdapters.toGemini(genericResponse);
    expect(geminiResponse).toHaveProperty('candidates');

    // Claude용 변환
    const claudeResponse = MockAdapters.toClaude(genericResponse);
    expect(claudeResponse).toHaveProperty('content');
  });
});
```

### 3.5.3 테스트 파일 마이그레이션

| ID      | 작업                                        | 상태 | 우선순위 |
| ------- | ------------------------------------------- | ---- | -------- |
| 3.5.3.1 | `contentGenerator.test.ts` 마이그레이션     | ⬜   | 높음     |
| 3.5.3.2 | `turn.test.ts` 마이그레이션                 | ⬜   | 높음     |
| 3.5.3.3 | `geminiChat.test.ts` 마이그레이션           | ⬜   | 높음     |
| 3.5.3.4 | `baseLlmClient.test.ts` 마이그레이션        | ⬜   | 중간     |
| 3.5.3.5 | `modelConfigService.test.ts` 마이그레이션   | ⬜   | 중간     |
| 3.5.3.6 | `tokenCalculation.test.ts` 마이그레이션     | ⬜   | 낮음     |
| 3.5.3.7 | `partUtils.test.ts` 마이그레이션            | ⬜   | 낮음     |
| 3.5.3.8 | `routing/*.test.ts` 마이그레이션 (7개 파일) | ⬜   | 중간     |

**마이그레이션 패턴**:

```typescript
// Before: Gemini 특화 테스트
import type { GenerateContentResponse } from '@google/genai';

const mockResponse: GenerateContentResponse = {
  candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
};

// After: 프로바이더 중립 테스트
import { MockFactory } from '../../testUtils/mockFactory';

const mockResponse = MockFactory.createResponse({ text: 'Hello' });
// GeminiAdapter 테스트시 GeminiMockAdapter로 변환
```

### 3.5.4 크로스 프로바이더 테스트 수트

| ID      | 작업                     | 상태 | 테스트 파일                                 |
| ------- | ------------------------ | ---- | ------------------------------------------- |
| 3.5.4.1 | 공통 테스트 케이스 정의  | ⬜   | `providers/__tests__/common.ts`             |
| 3.5.4.2 | 파라미터화된 테스트 구현 | ⬜   | `providers/__tests__/crossProvider.test.ts` |
| 3.5.4.3 | 프로바이더별 테스트 실행 | ⬜   | CI/CD 설정                                  |

**TDD 시나리오**:

```typescript
describe.each([
  ['gemini', GeminiAdapter],
  ['claude', ClaudeAdapter],
  ['openai', OpenAIAdapter],
])('%s adapter', (name, AdapterClass) => {
  it('should convert user message correctly', () => {
    const adapter = new AdapterClass(testConfig);
    const message = MockFactory.createUserMessage('Hello');

    const converted = adapter.convertMessage(message);

    // 각 프로바이더별 검증
    expect(converted).toMatchProviderSchema(name);
  });

  it('should handle streaming events', async () => {
    const adapter = new AdapterClass(testConfig);
    const events: LlmStreamEvent[] = [];

    for await (const event of adapter.generateStream(request)) {
      events.push(event);
    }

    expect(events.some((e) => e.type === 'text_delta')).toBe(true);
  });
});
```

**검증 기준**:

- [ ] 모든 기존 테스트 마이그레이션 완료
- [ ] 공통 Mock Factory 동작 확인
- [ ] 크로스 프로바이더 테스트 통과
- [ ] 테스트 커버리지 유지 (≥80%)

---

# PHASE 3 COMPLETION CHECKLIST

## Phase 2 연기 항목 해소 (M3.0) [v0.4 추가]

- [x] `geminiChat.ts` → `providers/gemini/chat.ts` 물리적 이동 완료 (M3.0.1)
- [x] `turn.ts` Gemini 특화 로직 분리 완료 (M3.0.1)
- [x] root `index.ts` re-export 회귀 테스트 통과 (M3.0.1.5)
- [x] messageInspectors 4개 파일 마이그레이션 완료 (M3.0.2)
- [x] 텔레메트리 레이어 @google/genai 독립화 (M3.0.3)
- [x] LocalAgentExecutor GeminiChat 직접 결합 해소 (M3.0.3)
- [x] `geminiTypeConversion.ts` 브릿지 정리 완료 (M3.0.4)
- [x] `telemetry/sdk.ts` 시그널 핸들러 누수 수정 (M3.0.3)
- [ ] `createContentGenerator()` → ProviderFactory 런타임 연결 완료 (3.0.5)
- [ ] ProviderRegistry Gemini 팩토리 부트스트랩 동작 (3.0.5.4)
- [ ] 부트스트랩 중복 호출 안전성 검증 (3.0.5.4)
- [ ] 프로바이더 선택 우선순위 통합 및 7개 회귀 시나리오 통과 (3.0.5.5)

## Quality Gates

- [ ] 모든 단위 테스트 통과
- [ ] 모든 통합 테스트 통과
- [ ] 모든 E2E 테스트 통과
- [ ] TypeScript 컴파일 에러 없음
- [ ] ESLint 경고 없음

## 성능 검증

- [ ] 응답 지연 증가 < 50ms
- [ ] 스트리밍 첫 토큰 지연 < 100ms
- [ ] 메모리 사용량 증가 < 10%
- [ ] 번들 크기 증가 < 500KB

## 기능 검증

- [ ] Gemini 기존 기능 100% 동작
- [ ] Claude 핵심 기능 동작
- [ ] OpenAI 핵심 기능 동작
- [ ] OpenAI-Compatible 기본 동작

## 산출물 확인

- [ ] `packages/core/src/providers/gemini/chat.ts` 이동 완료 (M3.0)
- [ ] `packages/core/src/providers/gemini/turn.ts` 분리 완료 (M3.0)
- [ ] `packages/core/src/providers/claude/` 디렉토리 생성
- [ ] `packages/core/src/providers/openai/` 디렉토리 생성
- [ ] `packages/core/src/providers/openai-compatible/` 디렉토리 생성
- [ ] `@anthropic-ai/sdk`, `openai` 의존성 설치 및 lockfile 동기화
- [ ] ProviderRegistry에 4개 팩토리 등록 (gemini, claude, openai,
      openai-compatible)
- [ ] 사용자 문서 완성
- [ ] API 레퍼런스 완성

## 테스트 마이그레이션 검증 [v0.2 추가]

- [ ] 모든 기존 테스트 파일 마이그레이션 완료
- [ ] 공통 Mock Factory 구현 및 테스트 통과
- [ ] 프로바이더별 Mock 어댑터 동작 확인
- [ ] 크로스 프로바이더 테스트 수트 통과
- [ ] 테스트 커버리지 ≥80% 유지

---

# RELEASE PLAN

## 버전 출시 계획

| 버전         | 포함 내용                         | 시점              |
| ------------ | --------------------------------- | ----------------- |
| 0.28.0-alpha | GeminiAdapter + 타입 전환         | Phase 2 완료 후   |
| 0.28.0-beta  | Claude/OpenAI + OpenAI-Compatible | Phase 3 일부 완료 |
| 0.28.0       | 안정화/문서/테스트                | Phase 3 종료 후   |

## 기능 플래그 관리

```typescript
// 점진적 활성화
ENABLE_MULTI_PROVIDER=false  # 기본값: 기존 동작
ENABLE_MULTI_PROVIDER=true   # 신규 아키텍처 활성화
```

## 롤백 계획

1. 문제 발생 시 `ENABLE_MULTI_PROVIDER=false` 설정
2. 기존 Gemini 전용 경로로 즉시 폴백
3. 이슈 분석 및 수정 후 재배포

---

# DEPENDENCY MANAGEMENT

## 신규 의존성

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.0",
    "openai": "^4.70.0"
  }
}
```

## 번들 최적화

```typescript
// Dynamic import로 번들 크기 관리
const ClaudeAdapter = await import('./claude/adapter');
const OpenAIAdapter = await import('./openai/adapter');
```

---

# NOTES

## 프로바이더별 주의사항

### Claude

- System 메시지는 별도 파라미터로 전달
- 이미지 URL은 base64로 변환 필수
- tool delta 합성 필요

### OpenAI

- System 메시지는 첫 번째 위치
- JSON mode 지원
- 이미지 URL 직접 지원

### OpenAI-Compatible

- baseUrl 설정 필수
- 모델별 capability 차이 존재
- 일부 기능 미지원 가능

## TDD 원칙

1. 각 프로바이더별 변환 함수 테스트 우선
2. 스트리밍 합성 테스트 필수
3. 에러 매핑 테스트 필수

## 참고 문서

- [03-technical-design.md](../03-technical-design.md)
- [04-integration-design.md](../04-integration-design.md)
- [05-implementation-plan.md](../05-implementation-plan.md)

---

# CHANGE LOG

## v0.8 (리뷰 3건 반영)

- **이슈 #1 [Medium] — 중복 등록 안전성**:
  - M3.0.5.4 비고 보강: `registry.register()` 중복 호출 시 예외 발생
    (registry.ts:81) — `has()` 가드/force 정책/초기화 위치 3가지 방안 명시
  - 테스트 파일에 `contentGenerator.test.ts` 추가 (런타임 부트스트랩 검증)
  - 부트스트랩 코드 예시(`has()` 가드 권장 패턴) 추가
  - M3.1.0.2/M3.2.0.2/M3.3.0.1에 동일 가드 패턴 적용 주석 추가
  - 검증 기준/Completion Checklist에 "중복 호출 안전성" 항목 추가
- **이슈 #2 [Medium] — 런타임 wiring 테스트 타깃 보강**:
  - M3.0.5.2 테스트 파일: `providerConfigIntegration.test.ts` →
    `contentGenerator.test.ts`, `providerConfigIntegration.test.ts` (복수)
  - 비고에 "실제 런타임 분기점은 `createContentGenerator()` (L167)" 명시
  - M3.0.5.4 테스트 파일에 `contentGenerator.test.ts` 추가
- **이슈 #3 [Low] — `--provider` CLI 옵션 미존재 명확화**:
  - 우선순위 표 1순위: `--provider claude` → `providerName: 'claude'` (내부 API
    수준)
  - Q7 Open Question 신규: CLI `--provider` 옵션 노출 여부 (잠정: 환경변수로
    충분)
  - 비고에 "CLI `--provider` 옵션은 미존재 — Q7 참조" 추가

## v0.7 (리뷰 4건 반영)

- **이슈 #1 [High] — 레지스트리 등록 누락**:
  - M3.0.5.4 신규: ProviderRegistry Gemini 팩토리 부트스트랩 구현
  - M3.0.5.5 신규: 프로바이더 선택 우선순위 통합 (5단계 우선순위 표 + 7개 회귀
    시나리오)
  - M3.1.0.2 신규: `register('claude', ...)` 작업 추가
  - M3.2.0.2 신규: `register('openai', ...)` 작업 추가
  - M3.3.0.1 신규: `register('openai-compatible', ...)` 작업 추가
- **이슈 #2 [Medium] — root index.ts export 테스트 부재**:
  - M3.0.1.5 신규: root `index.ts` re-export 회귀 테스트 추가 (현재 placeholder)
  - 검증 기준 및 Completion Checklist에 CLI import 호환성 항목 추가
- **이슈 #3 [Medium] — 프로바이더 선택 우선순위 충돌**:
  - M3.0.5.5에 통합 우선순위 표(5단계) 및 회귀 테스트(7시나리오) 추가
  - 2개 분리 시스템(contentGenerator authType vs providerSelector LLM_PROVIDER)
    충돌 명시
- **이슈 #4 [Low] — 의존성 설치 작업 누락**:
  - M3.1.0.1 신규: `@anthropic-ai/sdk` 설치 작업
  - M3.2.0.1 신규: `openai` SDK 설치 작업
  - M3.4.5.6 신규: 의존성 정합성 검증 (lockfile, npm ci, 번들링)
  - 산출물 확인에 의존성/레지스트리 항목 추가

## v0.6 (코드 기반 검증 반영)

- **geminiChat.ts 라인 수**: 988 → 999라인 정정
- **turn.ts 분석 정정**: "공통 인터페이스 core 유지" → Turn 클래스 전체가
  Gemini-specific (324라인, GeminiChat 생성자 의존)
- **loopDetectionService.ts 라인 번호**: L444/452/473 → L408/416/437 정정
- **loggingContentGenerator import 수**: "8+" → "11개 SDK 타입" (L7-18 상세)
  정정
- **contentGenerator.ts 라인 범위**: "220~250" → "167-259 (GoogleGenAI 생성:
  L235)" 정정
- **LocalAgentExecutor 결합 상세**: L753 직접 생성자 호출 + 3개 메서드 하드코딩
  명시
- **ENABLE_MULTI_PROVIDER 제어 범위**: adapterBridge에서만 제어,
  contentGenerator 미연결 명시
- **import 변경 파일 수**: geminiChat 13개 + turn 10개 = 23개 파일 명시
- **핸드오프 문서 동기화**: phase3_handoff.md의 라인 번호/수치도 동일 정정

## v0.5 (리뷰 5건 반영)

- **이슈 #1 [High]**: M3.0.5 신규 — 런타임 실행 경로 연결 (contentGenerator.ts →
  ProviderFactory 연결 3개 작업)
- **이슈 #2 [High]**: phase3_handoff.md 마일스톤 순서 — 최신 계획서와의 매핑
  주석 및 H-1~H-5 라벨 추가
- **이슈 #3 [Medium]**: 테스트 파일명 3건 수정 — `localAgentExecutor.test.ts` →
  `local-executor.test.ts`, `telemetry/types.test.ts` → `telemetry/sdk.test.ts`,
  `exports.test.ts` → `providers/gemini/exports.test.ts`
- **이슈 #4 [Medium]**: 일정 산정 — Phase 3 기간 3-4주 → 4-6주, 전체 일정 8-10주
  → 9-12주 (M3.0 추가분 반영)
- **이슈 #5 [Medium]**: Q5/Q6 의존성 명시 — M3.0.3.3/3.0.3.4에 Open Question
  의존성 주석 추가, 사전 결정 필요 사항 테이블 추가
- **검증 기준 보강**: 런타임 연결 검증 2건 추가, Completion Checklist에 3.0.5
  추가

## v0.4 (Phase 2 연기 항목 반영)

- **M3.0 신규 추가**: Phase 2 연기 항목 해소 — Gemini 내부 리팩토링 (3-5일)
  - 3.0.1: geminiChat.ts/turn.ts 물리적 이동 (핸드오프 Critical #3, #4)
  - 3.0.2: messageInspectors 마이그레이션 4파일 (핸드오프 High #5)
  - 3.0.3: 텔레메트리/Agent 레이어 독립화 (핸드오프 High #6, #7 + M2.7 + Medium
    #12)
  - 3.0.4: 변환 브릿지 정리 (핸드오프 Medium #11)
- **전제 조건 갱신**: Phase 2 완료(✅), EventType 전환 완료(✅) 반영
- **핸드오프 추적 테이블 추가**: 12개 연기 항목 + M2.7의 해소 상태 및 배정 위치
  추적
- **설계서 참조 확대**: phase3_handoff.md, EventType 전환 결과서 추가
- **산출물 갱신**: providers/gemini/chat.ts, turn.ts 이동 반영
- **Completion Checklist 보강**: M3.0 해소 항목 7건 추가, 산출물에
  chat.ts/turn.ts 추가
- **배경**: Phase 2 핸드오프 Critical #1, #2는 M2.연기(EventType 전환)에서 이미
  해소됨. 나머지 10개 항목을 M3.0에 체계적으로 배정

## v0.3 (2차 리뷰 반영)

- **산출물 디렉토리 구조 수정**: `eventMapper.ts` 추가로 마스터 플랜과 일관성
  확보
- **테스트 파일 목록 정정**:
  - `session.test.ts` 제거 (존재하지 않는 파일)
  - `geminiChat.test.ts`, `baseLlmClient.test.ts` 추가 (실제 존재 파일)
  - `routing/*.test.ts` 7개 파일 추가
- **3.5.3 테스트 마이그레이션 작업 확대**: 6개 → 8개 항목

## v0.2 (소스코드 기반 리뷰 반영)

- **M3.5 신규 추가**: 테스트 마이그레이션 마일스톤 (3-4일)
  - 3.5.1: 테스트 파일 분석 (Gemini 특화 테스트 식별)
  - 3.5.2: 테스트 마이그레이션 전략 (Mock Factory, 어댑터)
  - 3.5.3: 테스트 파일 마이그레이션 (우선순위별)
  - 3.5.4: 크로스 프로바이더 테스트 수트
- **완료 체크리스트 보강**: 테스트 마이그레이션 검증 항목 추가
- **배경**: Phase 2 리팩토링에 따른 테스트 코드 동기화 필요성 반영

## v0.1 (초기 버전)

- M3.1: Claude 어댑터/변환기 구현 (4-5일)
- M3.2: OpenAI 어댑터/변환기 구현 (3-4일)
- M3.3: OpenAI-Compatible 어댑터 템플릿 (3일)
- M3.4: 통합 테스트/문서/안정화 (5-7일)
