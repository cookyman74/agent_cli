# Phase 5: Search + Spool + Quality Gates

> TDD 기반: Red -> Green -> Refactor  
> 목표: payload_summary 기반 검색 정확성 + spool 동시성 + 최종 품질게이트

---

## 작업 개요

| 항목        | 내용                                                         |
| ----------- | ------------------------------------------------------------ |
| 목표        | `search_text` 추출기, FTS 조회, spool 동시성 제어, 통합 검증 |
| 영향 범위   | audit search extractor, PG/SQLite 검색, spool flush 로직     |
| 위험 수준   | 🟡 Medium                                                    |
| 성능 민감도 | 🟠 Medium                                                    |
| 완료 조건   | Top-K 정확성/지연/동시성 품질게이트 통과                     |

---

## 핵심 리스크

| 리스크                      | 영향 | 대응                                                | 상태 |
| --------------------------- | ---- | --------------------------------------------------- | ---- |
| payload_summary 기준 불일치 | 🟠   | 이벤트별 추출 규칙 테이블 기반 구현 + 스냅샷 테스트 | ⬜   |
| spool flush 경합/중복 처리  | 🟠   | 파일 분리 + atomic rename + 재시도 테스트           | ⬜   |
| 검색 성능 저하(p95 초과)    | 🟡   | 인덱스/쿼리 튜닝 + Top-K 기준 검증                  | ⬜   |

---

## 5.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase4 결과서 검토
- [ ] **[ANALYSIS]** payload 이벤트 샘플 수집
  - Session/Agent/Tool/Model/Notification/PreCompress
- [ ] **[ANALYSIS]** spool 경로/파일명 정책 구현 상태 점검
- [ ] **[SCOPE-CHECK]** QG 범위 확정
  - 정확성, 지연, 동시성, 회귀

---

## 5.2 RED Phase

- [ ] **[RED-001]** payload_summary 추출 테스트
  - 이벤트 타입별 포함/제외 필드 검증
- [ ] **[RED-002]** PostgreSQL/SQLite 검색 결과 일관성 테스트
  - 동일 질의에서 상위 결과 집합 비교
- [ ] **[RED-003]** spool 동시 append/flush 테스트
  - 병렬 프로세스 쓰기 + flush race 시 무결성 확인
- [ ] **[RED-004]** 품질게이트 테스트
  - 검색 p95, Top-5 재현율, 중복 삽입률

실패 확인:

```bash
npm test -w @didim365/agent-cli-core -- audit/search audit/spool --runInBand
```

---

## 5.3 GREEN Phase

- [ ] **[TASK-001]** `search_text` 추출기 구현
  - 파일: `packages/core/src/audit/search_text_extractor.ts`
- [ ] **[TASK-002]** FTS 조회 어댑터 구현
  - PG/SQLite 공통 인터페이스 + 구현 분리
- [ ] **[TASK-003]** spool 파일 처리 구현
  - `{session_id}-{pid}-{ts}.jsonl` 파일 생성
  - `*.processing` rename flush
- [ ] **[TASK-004]** 품질게이트 스크립트/테스트 추가
  - p95/재현율/중복률 측정

통과 확인:

```bash
npm test -w @didim365/agent-cli-core -- audit/search audit/spool quality-gates
```

---

## 5.4 REFACTOR Phase

### 5.4.1 구조 개선

- [ ] 추출 규칙 테이블을 선언형 맵으로 정리
- [ ] 검색 어댑터 인터페이스 단순화
- [ ] spool 상태 전이 로그 표준화

### 5.4.2 성능 개선

- [ ] 검색 인덱스 히트율/쿼리 플랜 점검
- [ ] SQLite FTS rebuild runbook 검증
- [ ] 대량 spool flush(batch size) 튜닝

검증:

```bash
npm test -w @didim365/agent-cli-core -- audit --runInBand
```

---

## 5.5 사후 작업 (Post-Work)

- [ ] **[TEST]** Core/CLI 전체 회귀 테스트

```bash
npm test -w @didim365/agent-cli-core
npm test -w @didim365/agent-cli
```

- [ ] **[LINT/TYPE]** lint + typecheck

```bash
npm run lint -w @didim365/agent-cli-core
npm run typecheck -w @didim365/agent-cli-core
npm run lint -w @didim365/agent-cli
npm run typecheck -w @didim365/agent-cli
```

- [ ] **[DOC]** 결과서 작성
  - `docs/00_project/이벤트로그관리_20260302/working_history/Phase5_search_spool_and_quality_gates_YYYYMMDD.md`

- [ ] **[COMMIT]** 커밋

```bash
git add .
git commit -m "[Phase5] search, spool concurrency, and quality gates"
```
