# Phase 1: Event Contract + Storage Foundation

> TDD 기반: Red -> Green -> Refactor  
> 참고: [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md),
> [01_todolist_performance_template.md](../../ai_adapter/template/01_todolist_performance_template.md),
> [agent_event_audit_log_design_20260302.md](../agent_event_audit_log_design_20260302.md)

---

## 작업 개요

| 항목        | 내용                                                             |
| ----------- | ---------------------------------------------------------------- |
| 목표        | 감사 이벤트 계약/스키마/저장소 기초 구현                         |
| 영향 범위   | Core audit 모듈 신규 + SQL 스키마 + 단위테스트                   |
| 위험 수준   | 🟠 High                                                          |
| 성능 민감도 | 🟡 Medium (삽입 경로/멱등 키 계산)                               |
| 완료 조건   | PG/SQLite 스키마, idempotency 유틸, 기본 insert/read 테스트 통과 |

---

## 핵심 리스크

| 리스크                                      | 영향 | 대응                        | 상태 |
| ------------------------------------------- | ---- | --------------------------- | ---- |
| `event_id`/`idempotency_key` 중복 처리 누락 | 🔴   | UNIQUE + UPSERT 정책 테스트 | ⬜   |
| SQLite FK/CHECK 미적용                      | 🟠   | DDL + PRAGMA 검증 테스트    | ⬜   |
| `event_time_ms`/`event_time_iso` 불일치     | 🟡   | 단일 `nowMs` 파생 유틸      | ⬜   |

---

## 1.1 사전 작업 (Pre-Work)

- [ ] **[CONTEXT]** 설계서 v1.2 핵심 제약 재확인
  - Provider matrix, final-chunk 정책, storage 정합성 규칙
- [ ] **[ANALYSIS]** 현재 Hook/스토리지 관련 코드 분석
  - `packages/core/src/hooks/*`
  - 기존 DB/SQLite 유틸 위치 확인
- [ ] **[SCOPE-CHECK]** 2일 범위 확인
  - 산출물: 이벤트 타입/모델, 스키마, 저장소 인터페이스, 기본 테스트
- [ ] **[BACKUP]** 기존 관련 SQL/스토리지 파일 백업(필요시)

---

## 1.2 RED Phase

- [ ] **[RED-001]** 이벤트 계약 테스트
  - 필수 필드 누락 시 검증 실패
  - `event_time_ms`와 `event_time_iso` 동일 원천 파생 검증
- [ ] **[RED-002]** 멱등 키 테스트
  - 동일 canonical 입력 -> 동일 키
  - key 순서 다른 객체 -> 동일 키(`stableStringify`)
- [ ] **[RED-003]** PostgreSQL 스키마 제약 테스트
  - actor/status/severity CHECK 위반 시 실패
  - `idempotency_key` 중복 삽입 거부
- [ ] **[RED-004]** SQLite FK/DDL 테스트
  - `PRAGMA foreign_keys=ON` 활성 상태에서 CASCADE 동작 확인

실패 확인 명령:

```bash
npm test -w @didim365/agent-cli-core -- audit --runInBand
```

---

## 1.3 GREEN Phase

- [ ] **[TASK-001]** 이벤트 모델/검증 유틸 구현
  - 파일: `packages/core/src/audit/event-model.ts` (신규)
- [ ] **[TASK-002]** `stableStringify` + `idempotency_key` 생성기 구현
  - 파일: `packages/core/src/audit/idempotency.ts` (신규)
- [ ] **[TASK-003]** PG/SQLite DDL 추가
  - 파일: `packages/core/src/audit/sql/postgres.sql` (신규)
  - 파일: `packages/core/src/audit/sql/sqlite.sql` (신규)
- [ ] **[TASK-004]** 저장소 인터페이스 + 기본 구현
  - 파일: `packages/core/src/audit/repository.ts` (신규)

통과 확인:

```bash
npm test -w @didim365/agent-cli-core -- audit/event-model audit/idempotency audit/repository
```

---

## 1.4 REFACTOR Phase

### 1.4.1 구조 개선

- [ ] 이벤트 타입 enum/상수 분리
- [ ] SQL 상수/마이그레이션 유틸 분리
- [ ] 테스트 픽스처 공통화

### 1.4.2 성능/안정성 개선

- [ ] `stableStringify` 대상 크기 제한(8KB+) 적용
- [ ] 대량 insert(1k events) 기준 기본 처리시간 측정
- [ ] SQLite 트랜잭션 batch insert 경로 점검

검증:

```bash
npm test -w @didim365/agent-cli-core -- audit --runInBand
```

---

## 1.5 사후 작업 (Post-Work)

- [ ] **[TEST]** core 관련 전체 테스트 재실행

```bash
npm test -w @didim365/agent-cli-core
```

- [ ] **[LINT/TYPE]** 린트/타입체크

```bash
npm run lint -w @didim365/agent-cli-core
npm run typecheck -w @didim365/agent-cli-core
```

- [ ] **[DOC]** 결과서 작성
  - `docs/00_project/이벤트로그관리_20260302/working_history/Phase1_event_contract_and_storage_foundation_YYYYMMDD.md`
- [ ] **[COMMIT]** 커밋

```bash
git add .
git commit -m "[Phase1] event contract + storage foundation"
```
