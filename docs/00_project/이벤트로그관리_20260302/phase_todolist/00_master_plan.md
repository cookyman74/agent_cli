# Agent-CLI 이벤트 감사로그 v1.2 — 전체 작업계획서

> 프로젝트: Event Audit Log (Hook 기반 v1.2)
>
> 작업 브랜치: `FEAT/event-audit-log-v1_2`
>
> 방법론: TDD (Red -> Green -> Refactor) + Tidy First
>
> 기준 문서:
> [agent_event_audit_log_design_20260302.md](../agent_event_audit_log_design_20260302.md)
>
> 템플릿:
>
> - [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md)
> - [01_todolist_performance_template.md](../../ai_adapter/template/01_todolist_performance_template.md)

---

## 1. 프로젝트 개요

### 1.1 목표

v1.2 설계서를 기준으로 아래를 구현한다.

1. Provider 현실 제약(Gemini-only model hook) 반영
2. AfterModel 청크 폭증 방지(final-chunk gate)
3. strict env sanitization 환경에서 설정 누락 방지(`DIDIM_CLI_AUDIT_*`)
4. 저장소 정합성(FK/UNIQUE/CHECK/FTS) 보장
5. 3계층 메모리 파생과 보관 정책 충돌 해소(orphan state)
6. `/settings` 기반 운영 제어 가능 상태 확보

### 1.2 핵심 설계 결정

| #   | 결정                                                   | 설계 근거                           |
| --- | ------------------------------------------------------ | ----------------------------------- |
| 1   | `model.*` 이벤트는 v1에서 Gemini provider만 보장       | OpenAI/Claude adapter hook 미연동   |
| 2   | AfterModel은 final chunk만 저장                        | 청크당 hook fire로 이벤트 폭증 방지 |
| 3   | Hook env 표준 prefix를 `DIDIM_CLI_AUDIT_*`로 통일      | strict sanitization 통과            |
| 4   | SQLite는 `PRAGMA foreign_keys=ON` 강제                 | FK/CASCADE 실효성                   |
| 5   | local-only 경로는 항상 `<tenant_id>` 세그먼트 포함     | 공유환경 데이터 혼합 방지           |
| 6   | `memory_derivation_jobs.event_id`는 NOT NULL + CASCADE | `UNIQUE + SET NULL` 모순 제거       |
| 7   | `BeforeTool -> tool.validation.started`로 매핑         | 실행 전 검증 시점 정확화            |
| 8   | memory backend 자동감지 제거                           | local-only 원칙 및 오탐 방지        |

---

## 2. 변경 범위 요약

### 2.1 예상 변경 파일

| #   | 파일                                                                 | 변경                 | Phase   |
| --- | -------------------------------------------------------------------- | -------------------- | ------- |
| 1   | `packages/core/src/services/environmentSanitization.ts`              | 수정                 | 2       |
| 2   | `packages/core/src/hooks/hookRunner.ts`                              | 수정                 | 2       |
| 3   | `packages/cli/src/config/settingsSchema.ts`                          | 수정                 | 2       |
| 4   | `packages/core/src/providers/gemini/chat.ts`                         | 수정                 | 3       |
| 5   | `packages/core/src/providers/baseAdapter.ts` 또는 provider 공통 계층 | 선택(Phase 4/5 이후) | 3/후속  |
| 6   | `packages/core/src/hooks/*` (감사 이벤트 매퍼 신규)                  | 신규/수정            | 1, 3    |
| 7   | `packages/core/src/audit/*` (스토리지/스키마/리포지토리)             | 신규                 | 1, 4, 5 |
| 8   | `packages/core/src/audit/sql/*.sql`                                  | 신규                 | 1       |
| 9   | `packages/core/src/audit/search_text_extractor.ts`                   | 신규                 | 5       |
| 10  | `packages/core/src/audit/spool/*`                                    | 신규                 | 2, 5    |
| 11  | `packages/core/src/audit/*/*.test.ts`                                | 신규                 | 1~5     |
| 12  | `packages/cli/src/ui/components/SettingsDialog*`                     | 수정(필요시)         | 2       |

> 실제 파일명은 구현 단계에서 확정한다. 본 계획은 영향 범위 통제를 위한
> 가이드다.

### 2.2 Phase 의존 관계

```text
Phase 1 (이벤트 계약 + 저장소 기초)
  -> Phase 2 (설정/환경변수/경로/스풀)
  -> Phase 3 (Provider 모델 이벤트 + 청크 게이트)
  -> Phase 4 (메모리 파생/보관/orphan)
  -> Phase 5 (검색/스풀 동시성/품질게이트)
```

---

## 3. Phase별 작업 요약

| Phase | 제목                                | 범위                                                           | 위험        | 산출물                    |
| ----- | ----------------------------------- | -------------------------------------------------------------- | ----------- | ------------------------- |
| 1     | Event Contract + Storage Foundation | 이벤트 매핑, PG/SQLite DDL, idempotency 공통 유틸              | 🟠 High     | 저장소 기초 + 단위테스트  |
| 2     | Settings + Env Resolution           | `/settings` 키, env prefix 우선순위, sharedEnv 강제, 경로 규약 | 🟠 High     | 설정 해석기 + 검증 테스트 |
| 3     | Provider Model Event Gating         | Gemini final-chunk 게이트, provider matrix 반영                | 🔴 Critical | model 이벤트 안정화       |
| 4     | Memory Derivation + Retention       | derivation job, piggyback worker, orphan state                 | 🟠 High     | L2/L3 파이프라인          |
| 5     | Search + Spool + Quality Gates      | payload_summary 추출, FTS/스풀 동시성, 통합검증                | 🟡 Medium   | QG 리포트 + 결과서        |

### 상세 계획서

- [Phase1_event_contract_and_storage_foundation.md](./Phase1_event_contract_and_storage_foundation.md)
- [Phase2_settings_env_resolution.md](./Phase2_settings_env_resolution.md)
- [Phase3_model_event_gating.md](./Phase3_model_event_gating.md)
- [Phase4_memory_derivation_and_retention.md](./Phase4_memory_derivation_and_retention.md)
- [Phase5_search_spool_and_quality_gates.md](./Phase5_search_spool_and_quality_gates.md)

---

## 4. 리스크 매트릭스

| ID  | 리스크                          | 영향 | 대응 Phase | 대응 전략                           |
| --- | ------------------------------- | ---- | ---------- | ----------------------------------- |
| R1  | OpenAI/Claude model 이벤트 누락 | 🔴   | 3          | v1 범위 명확화 + Gemini-only 게이트 |
| R2  | AfterModel 청크 이벤트 폭증     | 🔴   | 3          | final chunk 기준 단일 이벤트 생성   |
| R3  | strict env에서 설정 누락        | 🔴   | 2          | `DIDIM_CLI_AUDIT_*` prefix 표준화   |
| R4  | derivation_jobs 정합성 붕괴     | 🔴   | 1,4        | NOT NULL+CASCADE+정리 순서 고정     |
| R5  | FK 미동작(SQLite)               | 🟠   | 1          | `PRAGMA foreign_keys=ON` 강제       |
| R6  | shared/local 경로 혼합          | 🟠   | 2          | 항상 `<tenant_id>` 세그먼트         |
| R7  | spool 동시 접근 충돌            | 🟠   | 5          | 파일 분리 + atomic rename flush     |
| R8  | payload_summary 구현자 편차     | 🟠   | 5          | 이벤트별 추출 표 + 테스트 픽스처    |
| R9  | 보관정책 vs 메모리 근거 충돌    | 🟠   | 4          | orphan_candidate 상태 전이          |
| R10 | `/settings` 반영 불일치         | 🟡   | 2,5        | 우선순위 테스트 + UI 반영 검증      |

---

## 5. 커밋 전략

| Phase | 커밋 유형        | 메시지 예시                                                                  |
| ----- | ---------------- | ---------------------------------------------------------------------------- |
| 1     | 구조 + 동작 분리 | `feat(core): add audit storage contract and schema foundation`               |
| 2     | 동작             | `feat(cli,core): add audit settings/env resolution with sharedEnv guard`     |
| 3     | 동작             | `fix(core): gate model.responded on final chunk for gemini streams`          |
| 4     | 동작             | `feat(core): add memory derivation jobs and orphan-state retention flow`     |
| 5     | 구조 + 검증      | `test(core): add search_text extraction and spool concurrency quality gates` |

---

## 6. 진행 상태 추적

| Phase | PRE | RED | GREEN | REFACTOR | POST | 결과서 | 커밋 | 상태 |
| ----- | --- | --- | ----- | -------- | ---- | ------ | ---- | ---- |
| 1     | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | 대기 |
| 2     | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | 대기 |
| 3     | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | 대기 |
| 4     | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | 대기 |
| 5     | ⬜  | ⬜  | ⬜    | ⬜       | ⬜   | ⬜     | ⬜   | 대기 |

---

## 7. 작업 규칙

1. 각 Phase는 최대 2일 이내 완료 범위로 유지한다.
2. 구조적 변경과 동작 변경을 같은 커밋에 섞지 않는다.
3. RED 실패 확인 전에 구현 코드 변경 금지.
4. GREEN은 최소 구현만, 최적화는 REFACTOR에서만 수행.
5. Phase 전환 전 결과서(working_history) 작성 및 인수사항 기록.

### 작업 결과서 경로

- `docs/00_project/이벤트로그관리_20260302/working_history/Phase1_*.md`
- `docs/00_project/이벤트로그관리_20260302/working_history/Phase2_*.md`
- `docs/00_project/이벤트로그관리_20260302/working_history/Phase3_*.md`
- `docs/00_project/이벤트로그관리_20260302/working_history/Phase4_*.md`
- `docs/00_project/이벤트로그관리_20260302/working_history/Phase5_*.md`
