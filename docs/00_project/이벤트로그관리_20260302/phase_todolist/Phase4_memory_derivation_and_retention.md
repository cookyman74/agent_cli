# Phase 4: Memory Derivation + Retention

> TDD 기반: Red -> Green -> Refactor  
> 목표: L1/L2/L3 파생 파이프라인과 보관정책 정합성 확보

---

## 작업 개요

| 항목        | 내용                                                      |
| ----------- | --------------------------------------------------------- |
| 목표        | derivation jobs, piggyback worker, orphan state 전이 구현 |
| 영향 범위   | `memory_derivation_jobs`, `memory_items`, retention flow  |
| 위험 수준   | 🟠 High                                                   |
| 성능 민감도 | 🟠 Medium                                                 |
| 완료 조건   | 파생 잡 재시도/예산/상태전이가 테스트로 보장              |

---

## 핵심 리스크

| 리스크                     | 영향 | 대응                                       | 상태 |
| -------------------------- | ---- | ------------------------------------------ | ---- |
| L1 삭제 후 L3 근거 상실    | 🟠   | orphan_candidate 상태 전이                 | ⬜   |
| 파생 워커 트리거 모호      | 🟠   | piggyback + SessionStart backlog 처리 명시 | ⬜   |
| 파생 처리로 Hook 지연 증가 | 🟠   | budget(150ms/500ms) 제한                   | ⬜   |

---

## 4.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase3 결과서 검토
- [ ] **[ANALYSIS]** 현재 Hook 호출 주기와 piggyback 가능 지점 확인
  - SessionStart/BeforeAgent/AfterTool 경로
- [ ] **[ANALYSIS]** 메모리 백엔드 선택 규칙 확인
  - 자동감지 제거, 명시 설정 기반
- [ ] **[SCOPE-CHECK]** 파생 워커 범위 확정
  - enqueue, processPending, retry/backoff, orphan 전이

---

## 4.2 RED Phase

- [ ] **[RED-001]** derivation job lifecycle 테스트
  - pending -> processing -> succeeded/failed/dead_letter
- [ ] **[RED-002]** budget 초과 시 이월 테스트
  - 처리 중단 후 다음 hook 호출에서 재개
- [ ] **[RED-003]** orphan state 전이 테스트
  - 마지막 link 삭제 시 `orphan_candidate`
- [ ] **[RED-004]** memory backend 선택 테스트
  - local-only 기본값 `agent_audit`

실패 확인:

```bash
npm test -w @didim365/agent-cli-core -- audit/memory --runInBand
```

---

## 4.3 GREEN Phase

- [ ] **[TASK-001]** derivation job service 구현
  - 파일: `packages/core/src/audit/memory/derivation-worker.ts`
- [ ] **[TASK-002]** piggyback 트리거 연결
  - Hook 이벤트 진입 시 `processPendingJobs(budgetMs)` 호출
- [ ] **[TASK-003]** orphan 전이 로직 구현
  - link 카운트 0 -> `orphan_candidate`
- [ ] **[TASK-004]** session_summaries 정리 정책 구현
  - 최근 N개 또는 최근 30일 유지

통과 확인:

```bash
npm test -w @didim365/agent-cli-core -- audit/memory derivation-worker retention
```

---

## 4.4 REFACTOR Phase

### 4.4.1 구조 개선

- [ ] 파생 워커/리포지토리 인터페이스 분리
- [ ] 재시도 정책(backoff, dead_letter 기준) 상수화
- [ ] 상태 전이 로깅 표준화

### 4.4.2 성능 개선

- [ ] 배치 조회 크기 튜닝(기본 20건)
- [ ] SessionStart backlog 처리 상한 검증
- [ ] 대기열 길이 증가 시 평균 지연 측정

검증:

```bash
npm test -w @didim365/agent-cli-core -- audit/memory --runInBand
```

---

## 4.5 사후 작업 (Post-Work)

- [ ] **[TEST]** core 회귀 테스트
- [ ] **[LINT/TYPE]** lint + typecheck
- [ ] **[DOC]** 결과서 작성
  - `docs/00_project/이벤트로그관리_20260302/working_history/Phase4_memory_derivation_and_retention_YYYYMMDD.md`
- [ ] **[COMMIT]** 커밋

```bash
git add .
git commit -m "[Phase4] memory derivation pipeline and orphan retention"
```
