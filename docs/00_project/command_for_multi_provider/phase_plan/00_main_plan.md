# /stats 멀티 프로바이더 대응 — 단계별 작업 계획서 (Main)

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) - TDD 방법론
> - [stats_MultiProviderSupport_plan_20260218.md](../stats_MultiProviderSupport_plan_20260218.md) -
>   원본 수정방안 **버전**: v1.5 (리뷰 반영) **작성일**: 2026-02-18 **최종
>   수정일**: 2026-02-20
>
> **작업 분할 규칙 (필수)**:
>
> - 각 작업 단계(Phase)는 **최대 2일 이내** 완료 가능한 범위로 정의
> - 2일 초과 예상 시 **하위 Phase로 분할** 후 진행
> - 각 Phase는 독립적으로 **Red/Green/Refactor + 검증 + 결과서**를 완료해야 함

---

## 📋 작업 개요

| 항목        | 내용                                                                                                                                                       |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 프로젝트    | `/stats` 명령어 멀티 프로바이더 대응 수정                                                                                                                  |
| 영향 범위   | `packages/core/src/core/loggingContentGenerator.ts`, `packages/core/src/telemetry/*`, `packages/cli/src/ui/components/*`, `packages/cli/src/ui/contexts/*` |
| 위험 수준   | 🟠 High (텔레메트리 파이프라인 + UI 동시 변경)                                                                                                             |
| 성능 민감도 | 🟢 Low (텔레메트리 이벤트 처리, 실시간 대용량 아님)                                                                                                        |
| 참고 PRD    | [stats_MultiProviderSupport_plan_20260218.md](../stats_MultiProviderSupport_plan_20260218.md)                                                              |
| 작업 브랜치 | `v0.2.0/stats_multi_provider`                                                                                                                              |

---

## 🧩 작업 단계 분할 계획 (2일 규칙)

| Phase ID | 목표/범위                                                                | 예상 소요(일) | 분할 필요 여부 | 선행 Phase    | 산출물(상세 문서)                             |
| -------- | ------------------------------------------------------------------------ | ------------- | -------------- | ------------- | --------------------------------------------- |
| P0       | Non-Gemini 텔레메트리 수집 경로 구축                                     | 1.5~2         | N              | -             | [Phase0](./phase0_telemetry_collection.md)    |
| P1       | 프로바이더 인식 기반 + UI 그룹핑                                         | 1.5~2         | N              | P0            | [Phase1](./phase1_provider_recognition.md)    |
| P2       | cacheCreation 토큰 파이프라인 전 구간                                    | 1~1.5         | N              | P1            | [Phase2](./phase2_cache_creation_pipeline.md) |
| P3       | 쿼타 통합 (`.withResponse()` 헤더 추출 + ProviderQuotaService 주입 선행) | 2             | N              | P2            | [Phase3](./phase3_quota_integration.md)       |
| P4       | 부가 기능 (선택)                                                         | 1~2           | Y (기능별)     | **P1 (최소)** | [Phase4](./phase4_optional_features.md)       |

### 분할 기준 가이드

1. 기능적으로 독립 배포/검증 가능한 단위로 자른다.
2. 테스트 작성/구현/리팩터링/문서화가 2일 안에 끝나도록 범위를 축소한다.
3. Phase 0+1만 완료해도 Non-Gemini 프로바이더의 통계가 정상 표시된다.
4. Phase 3은 adapter 레이어 변경이 선행 — Claude/OpenAI 스트리밍은
   `.withResponse()` 기반 헤더 추출을 전제로 별도 Phase로 분리.
5. Phase 4는 기능별로 독립 구현 가능하며 모두 선택 사항.

---

## 🚨 핵심 리스크 요약

> **v1.1 리뷰 반영**: 이슈 #1 (JSON 계약), #2 (Phase 3 데이터 경로), #3
> (텔레메트리 인터페이스), #5 (레거시 폴백), #6 (quota-only 행) 추가 **v1.2 리뷰
> 반영**: 이슈 #1 (plain key 충돌→복합 키 재도입), #2 (processApiError
> provider), #3 (ProviderQuotaService 미존재), #4 (스트리밍 rate-limit 경로), #5
> (버킷 노이즈), #6 (P4 선행조건), #7 (비공개 함수 테스트), #8
> (openai-compatible 범위), #9 (관측 가능성 감소) 추가 **v1.3 리뷰 반영**: 이슈
> #1 (durationMs→duration_ms 필드명), #2 (MessageEnd→ProviderQuotaService
> 브릿지), #3 (providerName 미존재), #4 (getSessionMetrics→getMetrics API명), #5
> (폴백 정책 용어 구분), #6 (파일 매트릭스 누락), #7 (CommandContext 인스턴스
> 주입), #8 (LlmGenerateResponse rateLimits), #9 (OTEL counter 시제) 적용 **v1.4
> 리뷰 반영**: 이슈 #1 (ProviderQuota 테스트 스키마 충돌), #2
> (LlmGenerateResponse 타입 약화), #3 (Phase 0/1 provider 필드 소유 경계), #4
> (Phase 2 비공개 함수 직접 테스트 회귀), #5 (GenAIUsageDetails 필수 필드 하류
> 갱신 누락), #6 (Phase 3 커밋 파일 누락) 적용 **v1.5 리뷰 반영**: 이슈 #1
> (Non-Gemini llm 경로 텔레메트리 공백), #2 (Claude/OpenAI 스트리밍 헤더 추출은
> `.withResponse()` 필수), #3 (`CommandContext.services` 주입 순서 선행), #4
> (모델 키 충돌/동등성 비교에 provider 필드 필수) 적용

| 리스크                                                     | 영향        | 대응 방안                                                                                                                                                                                                                              | 상태 |
| ---------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Non-Gemini 텔레메트리 단절 (Phase 0 미완 시 전체 무의미)   | 🔴 High     | Phase 0을 최우선 진행, 단독 검증 후 다음 Phase 착수                                                                                                                                                                                    | ✅   |
| **[#1-v1.2] Plain model key 충돌**                         | 🔴 Critical | ~~v1.1: 복합 키 폐기~~ → **v1.2: `{provider}::{model}` 복합 키 재도입**. `openai-compatible`의 `freeformInput: true`로 동일 모델명 충돌 확인. `::` 구분자는 JSON-safe. 영속화된 레거시 키(`::` 미포함)는 `gemini` 기본값으로 안전 파싱 | ⬜   |
| **[#2-v1.2] processApiError provider 미설정**              | 🟠 Medium   | `processApiError()`에도 `processApiResponse()`와 동일한 provider 추출 + 복합 키 로직 적용                                                                                                                                              | ✅   |
| **[#3] ProviderApiResponseEvent에 toLogRecord 없음**       | 🔴 High     | **3경로 통합 폐기** → UI 전용 경로 + lightweight OTEL counter만 사용                                                                                                                                                                   | ✅   |
| **[#3-v1.2] providerQuotaService 미존재**                  | 🔴 High     | `CommandContext`에 없음. **ProviderQuotaService 신규 설계**: 인터페이스, lifecycle(세션 singleton), CommandContext 연결 필요                                                                                                           | ⬜   |
| **[#4-v1.2] 스트리밍 rate-limit 전달 경로 없음**           | 🔴 High     | `LlmMessageEndEvent`에 `rateLimits?` 필드 추가 (방안 A). **Claude/OpenAI adapter는 `.withResponse()`로 `rawResponse.headers`를 확보**한 뒤 MessageEnd에 포함                                                                           | ⬜   |
| **[#5] 런타임 provider 추론 폐기**                         | 🟠 Medium   | **런타임 폴백 폐기**: 모델명으로부터 provider를 추론하지 않음 → Phase 0에서 event에 명시적 provider 포함. 영속화된 레거시 키(`::` 미포함) 파싱은 `gemini` 기본값으로 안전 처리 (별개 개념). Phase 0+1 atomic 배포                      | ✅   |
| **[#5-v1.2] VALID_GEMINI_MODELS 버킷 노이즈**              | 🟠 Medium   | `PROVIDER_MODEL_REGISTRY.gemini.models`를 대체 allowlist로 사용. 등록된 모델만 quota-only 행 표시                                                                                                                                      | ⬜   |
| **[#6] VALID_GEMINI_MODELS 제거 시 quota-only 행 소실**    | 🟠 Medium   | `PROVIDER_MODEL_REGISTRY` allowlist + 쿼타 버킷 매칭으로 보존                                                                                                                                                                          | ⬜   |
| **[#7-v1.2] 비공개 함수 직접 테스트**                      | 🟡 Low      | `createInitialModelMetrics`/`areModelMetricsEqual` 비공개 → 행위 기반 테스트(`addEvent` + `getMetrics`)                                                                                                                                | ⬜   |
| **[#8-v1.2] openai-compatible 범위**                       | 🟠 Medium   | `OpenAiAdapter` 상속으로 rate-limit 처리 자동 상속. 커스텀 서버 헤더 미반환 시 optional 처리                                                                                                                                           | ⬜   |
| **[#9-v1.2] 관측 가능성 감소**                             | 🟡 Low      | Non-Gemini Clearcut/OTEL logRecord 미생성은 의도적 제약. Phase 0에 Known Limitation 섹션 명시                                                                                                                                          | ✅   |
| **[#2] Phase 3 데이터 경로 비어있음**                      | 🔴 High     | **전체 경로 한번에 구현**: adapter → LlmMessageEndEvent → ProviderQuotaService → statsCommand → HistoryItemStats → StatsDisplay                                                                                                        | ⬜   |
| UiEvent union 확장 시 기존 Gemini 경로 regression          | 🟠 Medium   | duck typing + 기존 테스트 전체 실행                                                                                                                                                                                                    | ✅   |
| adapter 헤더 수집 (Phase 3) SDK 구현 의존성                | 🟡 Medium   | **코드 검증 결과 확정 사항**: `messages.create(..., {stream:true})`/`chat.completions.create(..., {stream:true})` 반환은 AsyncIterable이므로 헤더 접근 불가. `.withResponse()` 체인으로 전환 후 진행                                   | ⬜   |
| `areModelMetricsEqual()` 필드 누락 시 UI 무한 리렌더       | 🟡 Medium   | Phase 1에서 provider, Phase 2에서 cacheCreation 동시 추가                                                                                                                                                                              | ✅   |
| **[#1-v1.3] event.durationMs vs event.duration_ms 필드명** | 🔴 Critical | `ProviderApiResponseEvent`/`ProviderApiErrorEvent` 인스턴스 프로퍼티는 `duration_ms` (snake_case). 생성자 파라미터는 `durationMs` (camelCase). 코드 작성 시 인스턴스 프로퍼티 `event.duration_ms` 사용 필수                            | ✅   |
| **[#2-v1.3] MessageEnd→ProviderQuotaService 브릿지 누락**  | 🟠 High     | adapter가 rateLimits를 yield해도 소비자 없으면 ProviderQuotaService 미갱신. TASK-003A로 LoggingContentGenerator에 브릿지 구현                                                                                                          | ⬜   |
| **[#3-v1.3] statsCommand providerName 미존재**             | 🟠 High     | `statsCommand.ts`에 `providerName` 변수 없음 — Gemini 쿼타는 항상 fetch, Non-Gemini는 ProviderQuotaService로 분리                                                                                                                      | ⬜   |
| **[#4-v1.3] getSessionMetrics() → getMetrics() API명**     | 🟠 High     | 실제 API는 `getMetrics()` — 문서 전체에서 `getSessionMetrics()` 사용 부분 수정                                                                                                                                                         | ✅   |
| **[#7-v1.3] CommandContext 인스턴스 주입 누락**            | 🟠 Medium   | slashCommandProcessor.ts의 commandContext useMemo에 providerQuotaService 실제 인스턴스 주입 필요                                                                                                                                       | ⬜   |
| **[#1-v1.5] Non-Gemini llm 텔레메트리 누락**               | 🔴 High     | 현재 `loggingContentGenerator.llmGenerateContent/llmLoggingStreamWrapper`는 duration 디버그 로그만 기록. Phase 0에서 `createProviderApiResponseEvent`/`createProviderApiErrorEvent` + UI 이벤트 경로를 명시적으로 추가                 | ✅   |
| **[#2-v1.5] CommandContext 서비스 스키마 선행 변경 필요**  | 🟠 High     | `commands/types.ts`의 `CommandContext.services`가 `{config,settings,git,logger}`만 보유. Phase 3 착수 전 `providerQuotaService` 타입/인스턴스 주입을 먼저 반영                                                                         | ⬜   |
| **[#3-v1.5] 모델 키 충돌 및 비교 기준 불일치**             | 🟠 Medium   | 현재 `uiTelemetryService`/`SessionContext`는 model 이름 단일 키 및 provider 미비교. Phase 1에서 `{provider}::{model}` 키 + `ModelMetrics.provider` + `areModelMetricsEqual` provider 비교를 묶어서 atomic 반영                         | ⬜   |
| **[#1-v1.4] ProviderQuota 테스트 스키마 충돌**             | 🟠 High     | RED-2/3 테스트가 중첩 `limits/remaining` 스키마 → flat 스키마(`requestsLimit` 등)로 통일. TASK-003 구현과 일관                                                                                                                         | ✅   |
| **[#2-v1.4] LlmGenerateResponse 타입 약화**                | 🟠 High     | TASK-000 예시가 `id?: string, stopReason?: string`로 기존 필수/enum 타입을 약화 → `id: string, stopReason: LlmStopReason` 유지. `rateLimits?`만 추가                                                                                   | ✅   |
| **[#3-v1.4] Phase 0/1 provider 필드 소유 경계**            | 🟠 Medium   | `ModelMetrics.provider`는 Phase 0 TASK-006에서 추가. Phase 1 TASK-001은 검증만 수행                                                                                                                                                    | ✅   |
| **[#5-v1.4] GenAIUsageDetails 필수 필드 하류 갱신**        | 🟠 Medium   | Phase 2 TASK-001에서 `ApiResponseEvent` 생성자 + 테스트 데이터 동시 갱신 → ✅ 20+ 파일 갱신 완료                                                                                                                                       | ✅   |

---

## 📊 수정 파일 전체 매트릭스

| 파일                                                    | P0  | P1  | P2  | P3  | P4  | 수정 유형                                                         |
| ------------------------------------------------------- | --- | --- | --- | --- | --- | ----------------------------------------------------------------- |
| `packages/core/src/core/loggingContentGenerator.ts`     | ✅  |     |     | ✅  |     | 확장 (P0: Non-Gemini llm 텔레메트리 이벤트, P3: TASK-003A 브릿지) |
| `packages/core/src/telemetry/loggers.ts`                | ✅  |     |     |     |     | 신규 함수                                                         |
| `packages/core/src/telemetry/uiTelemetry.ts`            | ✅  | ✅  | ✅  |     |     | 확장                                                              |
| `packages/core/src/telemetry/types.ts`                  |     |     | ✅  |     |     | 확장                                                              |
| `packages/core/src/providers/telemetryBridge.ts`        |     |     | ✅  |     |     | 수정                                                              |
| `packages/cli/src/ui/components/StatsDisplay.tsx`       |     | ✅  |     | ✅  | ✅  | 리팩터                                                            |
| `packages/cli/src/ui/components/ModelStatsDisplay.tsx`  |     | ✅  | ✅  |     | ✅  | 확장                                                              |
| `packages/cli/src/ui/contexts/SessionContext.tsx`       |     | ✅  | ✅  |     |     | 수정                                                              |
| `packages/cli/src/ui/types.ts`                          |     |     |     | ✅  |     | 수정                                                              |
| `packages/cli/src/ui/components/HistoryItemDisplay.tsx` |     |     |     | ✅  |     | 수정                                                              |
| `packages/cli/src/ui/commands/statsCommand.ts`          |     |     |     | ✅  | ✅  | 소폭 수정                                                         |
| `packages/cli/src/ui/commands/types.ts`                 |     |     |     | ✅  |     | 수정 (CommandContext.services 확장)                               |
| `packages/core/src/providers/claude/adapter.ts`         |     |     |     | ✅  |     | 수정 (`.withResponse()` 기반 헤더 추출 + rateLimits 전달)         |
| `packages/core/src/providers/openai/adapter.ts`         |     |     |     | ✅  |     | 수정 (`.withResponse()` 기반 헤더 추출 + rateLimits 전달)         |
| `packages/core/src/providers/events.ts`                 |     |     |     | ✅  |     | 확장 (RateLimitInfo, LlmMessageEndEvent)                          |
| `packages/core/src/providers/types.ts`                  |     |     |     | ✅  |     | 확장 (LlmGenerateResponse.rateLimits)                             |
| `packages/core/src/telemetry/providerQuotaService.ts`   |     |     |     | ✅  |     | **신규**                                                          |
| `packages/cli/src/ui/hooks/slashCommandProcessor.ts`    |     |     |     | ✅  |     | 수정 (CommandContext 주입)                                        |
| `packages/core/src/index.ts`                            |     |     |     | ✅  |     | export 추가                                                       |

---

## 📅 예상 일정

| Phase     | 예상 소요   | 시작일     | 완료일     | 비고                                                                                |
| --------- | ----------- | ---------- | ---------- | ----------------------------------------------------------------------------------- |
| Phase 0   | 1.5~2일     | 2026-02-18 | 2026-02-20 | ✅ 완료 (리뷰 반영 포함)                                                            |
| Phase 1   | 1.5~2일     | 2026-02-20 | 2026-02-20 | P0 완료 후 즉시 착수                                                                |
| Phase 2   | 1~1.5일     | 2026-02-20 | 2026-02-20 | ✅ 완료 (cacheCreation 파이프라인 전 구간)                                          |
| Phase 3   | 2일         | -          | -          | `.withResponse()` 헤더 추출 + CommandContext/providerQuotaService 주입 선행 후 착수 |
| Phase 4   | 1~2일       | -          | -          | 선택 사항, 기능별 독립 구현 (**Phase 1만으로 착수 가능**)                           |
| **Total** | **7~9.5일** | -          | -          | P0+P1 (3~4일) 완료 시 기본 기능 동작                                                |

---

## 📊 Phase 완료 조건

| Phase   | 기간(<=2일) | 🔴 Red | 🟢 Green | 🔵 Refactor | 결과서 | 커밋 | 상태 |
| ------- | ----------- | ------ | -------- | ----------- | ------ | ---- | ---- |
| Phase 0 | ✅          | ✅     | ✅       | ✅          | ✅     | ✅   | ✅   |
| Phase 1 | ✅          | ✅     | ✅       | ✅          | ✅     | ✅   | ✅   |
| Phase 2 | ✅          | ✅     | ✅       | ✅          | ✅     | ✅   | ✅   |
| Phase 3 | ⬜          | ⬜     | ⬜       | ⬜          | ⬜     | ⬜   | ⬜   |
| Phase 4 | ⬜          | ⬜     | ⬜       | ⬜          | ⬜     | ⬜   | ⬜   |

---

## 🔄 구현 순서 및 최소 가치 단위

```
Phase 0 → Phase 1 → Phase 2 → (선택) Phase 3 → Phase 4
   │         │          │
   │         │          └─ cacheCreation 토큰 가시화 완료
   │         └─ 🎯 MVP: Non-Gemini 통계 표시, 프로바이더 그룹핑
   └─ 텔레메트리 수집 경로 확보 (이것만으로는 UI 변경 없음)
```

**최소 가치 단위**: Phase 0 + Phase 1 완료 시 Non-Gemini 프로바이더의 모든
통계가 `/stats`에 정상 표시됨.

---

## ⚠️ Known Limitations (v1.2)

> **[#9-v1.2] 관측 가능성 감소**: Non-Gemini 프로바이더에 대해 Clearcut
> logRecord / OTEL logRecord 경로가 생략됨.
>
> - **이유**: `ProviderApiResponseEvent`가 `toLogRecord()` /
>   `toSemanticLogRecord()` 미구현
> - **영향**: Non-Gemini API 호출의 Clearcut 로그 미생성, OTEL 구조화 logRecord
>   미전송
> - **안전 항목**: UI 통계(`/stats`)는 정상 동작 (uiTelemetryService 경로 사용),
>   OTEL counter metric은 Phase 0 `logProviderApiResponse` 구현 시 기록 예정
> - **향후**: Phase 0 완료 후 필요 시 별도 Phase로 `ProviderApiResponseEvent`
>   logRecord 구현 또는 provider-agnostic event 도입

---

## ✅ 최종 체크리스트

### TDD 사이클 완료

- [ ] 모든 Phase의 Red → Green → Refactor 사이클 완료
- [ ] 모든 Phase가 **2일 이내 범위**로 계획/실행됨
- [ ] 전체 테스트 통과 (`npm run test`)
- [ ] 타입체크 통과 (`npm run typecheck`)
- [ ] 린터 경고 0개 (`npm run lint`)

### 문서화

- [ ] 각 Phase별 작업 결과서 작성 완료
- [ ] 변경 로그 업데이트

### 최종 커밋 및 PR

- [ ] 모든 변경사항 커밋 완료
- [ ] PR 생성 및 코드 리뷰 요청
- [ ] CI/CD 파이프라인 통과

---

## 🔗 관련 문서

- [stats_MultiProviderSupport_plan_20260218.md](../stats_MultiProviderSupport_plan_20260218.md) -
  원본 수정방안 (v3)
- [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) - TDD 방법론 가이드
- [Phase 0: 텔레메트리 수집](./phase0_telemetry_collection.md)
- [Phase 1: 프로바이더 인식](./phase1_provider_recognition.md)
- [Phase 2: cacheCreation 파이프라인](./phase2_cache_creation_pipeline.md)
- [Phase 3: 쿼타 통합](./phase3_quota_integration.md)
- [Phase 4: 부가 기능](./phase4_optional_features.md)

---

**작성일**: 2026-02-18 **최종 수정일**: 2026-02-20 **작성자**: AI Assistant
**상태**: ⬜ 작성 중
