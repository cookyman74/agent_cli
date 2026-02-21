# Phase 3: 통합 검증 + 최적화 + 문서화

> **참고 문서**:
>
> - [poc_chat_rag_plan.md](../poc_chat_rag_plan.md) — PoC 설계서 §12 검증
>   시나리오, §15 성공 기준
> - [메인 계획서](./main_todo.md)
>
> **작업 분할 규칙**: 최대 2일 이내 완료

---

## 📋 작업 개요

| 항목       | 내용                                                                 |
| ---------- | -------------------------------------------------------------------- |
| Phase      | Phase 3                                                              |
| 목표       | Phase 1+2 통합 동작 검증, 엣지 케이스 확인, 성능 최적화, 최종 문서화 |
| 영향 범위  | `.didim/hooks/`, `.didim/settings.json`, PostgreSQL DB               |
| 위험 수준  | 🟢 Low (검증 + 문서 작업 중심, 코드 변경 최소)                       |
| 선행 Phase | Phase 2 (BeforeAgent Hook 완료 — 전체 RAG 파이프라인 동작 상태)      |
| 예상 소요  | 0.5~1일                                                              |

### 핵심 목표

PoC 설계서 §12의 **8개 검증 시나리오**를 실행하여 전체 파이프라인(저장 → 검색 →
주입)의 정상 동작을 확인하고, 성공 기준(§15) 충족 여부를 검증한다.

---

## 🚨 핵심 리스크

| 리스크                                   | 영향      | 대응 방안                                                            | 상태 |
| ---------------------------------------- | --------- | -------------------------------------------------------------------- | ---- |
| 통합 시 개별 검증되지 않은 상호작용 발생 | 🟠 Medium | 시나리오별 독립 검증 후 end-to-end 수행                              | ⬜   |
| 한국어 trigram 유사도 기대 이하          | 🟡 Low    | similarity 임계값 조정 (0.05~0.3 범위), Phase 4에서 임베딩 전환 검토 | ⬜   |
| 테스트 데이터 부족으로 검증 불완전       | 🟡 Low    | Phase 1 사전 데이터 축적 (최소 5건+), 다양한 패턴 포함               | ⬜   |

---

## 3.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 2 완료 확인
  - BeforeAgent Hook 동작 확인
  - RAG 검색 → additionalContext 주입 성공
  - `PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api -c "SET search_path TO se_agent_management; SELECT COUNT(*) FROM chat_history;"`
    → 최소 5건+

- [ ] **[CONTEXT]** 검증 시나리오 매트릭스 확인
  - PoC 설계서 §12: 시나리오 8개
  - PoC 설계서 §15: 성공 기준(DoD) 16개 항목

- [ ] **[PREP]** 테스트 데이터 사전 준비
  - 다양한 질문 패턴으로 3~5건 대화 수행 (서로 다른 주제)
  - 운영 메타데이터 태그 포함 대화 1건 이상
  - 최소 2개 세션에서 대화 수행 (세션 간 검색 테스트용)

---

## 3.2 검증 시나리오 실행

### SCENARIO-01: 저장 확인 (설계서 시나리오 1)

- [ ] **[SCENARIO-01]** Q&A 자동 저장 + 운영 메타데이터 확인

  ```bash
  didim
  > [service:payments-api][env:prod] 서비스 A의 에러율이 5%를 초과했다. 원인을 분석해줘.

  # DB 검증
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api -c "SET search_path TO se_agent_management; SELECT id, tenant_id, project_id, session_id, service_name, environment,
                         incident_type, ticket_id, LEFT(prompt, 50), created_at
                  FROM chat_history ORDER BY id DESC LIMIT 3;"
  ```
  - **기대 결과**:
    - chat_history에 1건 저장
    - `project_id` = realpath(cwd) SHA-256
    - `service_name` = 'payments-api', `environment` = 'prod'
    - `prompt`, `response` 모두 비어있지 않음

### SCENARIO-02: RAG 검색 + 컨텍스트 주입 확인 (설계서 시나리오 2)

- [ ] **[SCENARIO-02]** 과거 대화 기반 컨텍스트 반영 확인

  ```bash
  # 새 세션 시작 (이전 저장된 데이터 존재 상태)
  didim
  > 서비스 A에 대해 이전에 분석한 내용을 바탕으로 조치 방안을 제안해줘.

  # LLM 응답에 과거 분석 내용이 반영되는지 확인
  # chat_history_feedback에 selected 이벤트 기록 확인
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api -c "SET search_path TO se_agent_management; SELECT * FROM chat_history_feedback ORDER BY id DESC LIMIT 5;"
  ```
  - **기대 결과**:
    - LLM 응답이 과거 에러율 분석 내용을 참조
    - `chat_history_feedback`에 `selected` 타입 피드백 기록

### SCENARIO-02-1: 장기기억(memory) 재사용 확인 (설계서 시나리오 2-1)

- [ ] **[SCENARIO-02-1]** memory_items 우선 조회 확인

  ```bash
  # memory_items 존재 확인
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api -c "SET search_path TO se_agent_management; SELECT id, memory_type, LEFT(summary, 60), confidence
                  FROM memory_items ORDER BY id DESC LIMIT 5;"

  didim
  > 서비스 A 장애시 즉시 대응 순서만 간단히 다시 알려줘.

  # memory_feedback에 used 이벤트 기록 확인
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api -c "SET search_path TO se_agent_management; SELECT * FROM memory_feedback ORDER BY id DESC LIMIT 5;"
  ```
  - **기대 결과**:
    - additionalContext에 `[장기기억]` 블록이 `[근거 대화]`보다 먼저 포함
    - `memory_feedback`에 `used` 타입 피드백 기록

### SCENARIO-03: 프로젝트 격리 확인 (설계서 시나리오 3)

- [ ] **[SCENARIO-03]** 다른 프로젝트의 대화 미검색 확인

  ```bash
  # 프로젝트 A (원래 프로젝트) project_id 확인
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api -c "SET search_path TO se_agent_management; SELECT DISTINCT project_id FROM chat_history;"

  # 프로젝트 B 준비: hook 스크립트 + settings 복사 (hook이 실제 실행되어야 격리 검증 유효)
  # ⚠️ 단순 mkdir만 하면 hook 미실행 → "격리 성공"으로 오인(false positive) 위험
  mkdir -p /tmp/project-b/.didim/hooks
  cp .didim/hooks/*.js /tmp/project-b/.didim/hooks/
  cp .didim/hooks/package.json /tmp/project-b/.didim/hooks/
  cp .didim/settings.json /tmp/project-b/.didim/settings.json
  cd /tmp/project-b/.didim/hooks && npm install
  cd /tmp/project-b

  # 폴더 신뢰 승인 후 실행
  didim
  > 서비스 A의 에러율 분석해줘.

  # stderr에 "[rag-before-agent]" 로그가 출력되는지 확인 (hook이 실제 실행됨)
  # → RAG 컨텍스트 없이 응답 (project_id 불일치로 검색 0건)
  ```
  - **기대 결과**: hook이 실제 실행되지만 `project_id` 불일치로 검색 0건 → RAG
    미주입
  - **false positive 방지**: stderr에 hook 실행 로그가 반드시 있어야 검증 유효

### SCENARIO-04: 현재 세션 제외 확인 (설계서 시나리오 4)

- [ ] **[SCENARIO-04]** 같은 세션 대화 미검색 확인
  ```bash
  didim
  > 서비스 A 에러율 원인 분석
  # (응답 대기)
  > 서비스 A 에러율 관련 추가 분석
  # 두 번째 질문의 RAG에 첫 번째 질문이 포함되지 않아야 함
  ```
  - **기대 결과**: `session_id != 조건`으로 현재 세션 대화 제외

### SCENARIO-05: DB 장애 시 정상 동작 (설계서 시나리오 5)

- [ ] **[SCENARIO-05]** PostgreSQL 미기동 시 CLI 정상 동작 확인

  ```bash
  # Docker 컨테이너 중지
  docker stop didimaistudio_mainproxy-db-1

  # CLI 실행 후 대화
  didim
  > 아무 질문

  # 확인 사항:
  # 1. CLI 응답 정상 (RAG 없이)
  # 2. stderr에 "[rag-before-agent] DB error:" 경고
  # 3. stderr에 "[rag-after-agent] DB error:" 경고
  # 4. exit code 0 (정상 종료)

  # Docker 컨테이너 재시작
  docker start didimaistudio_mainproxy-db-1
  ```
  - **기대 결과**: CLI 정상 응답, stderr 경고만 표시, 저장/검색 모두 누락
    (graceful degradation)

### SCENARIO-06: 스크립트 자체 오류 시 정상 동작 (설계서 시나리오 6)

- [ ] **[SCENARIO-06]** 모듈 오류 시 CLI 정상 동작 확인

  ```bash
  # pg 모듈 임시 제거
  mv .didim/hooks/node_modules .didim/hooks/node_modules_bak

  didim
  > 아무 질문

  # 확인 사항:
  # 1. CLI 응답 정상
  # 2. stderr에 Fatal 로그
  # 3. exit code 0

  # 모듈 복원
  mv .didim/hooks/node_modules_bak .didim/hooks/node_modules
  ```
  - **기대 결과**: CLI 정상 동작, `main().catch()` 핸들러가 Fatal 로그 출력 + 빈
    JSON 반환

### SCENARIO-07: placeholder 응답 저장 방지 (설계서 시나리오 7)

- [ ] **[SCENARIO-07]** 빈/무의미 응답 저장 스킵 확인

  ```bash
  # 직접 stdin 주입으로 테스트
  echo '{"prompt":"테스트","prompt_response":"[no response text]","session_id":"s1","cwd":"/tmp/test"}' | \
    node .didim/hooks/rag-after-agent.js

  # DB 확인: "[no response text]" 레코드 없어야 함
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api -c "SET search_path TO se_agent_management; SELECT COUNT(*) FROM chat_history WHERE response = '[no response text]';"
  ```
  - **기대 결과**: 0건 (저장 스킵)

### SCENARIO-08: 품질 피드백 기반 랭킹 보정 (설계서 시나리오 8)

- [ ] **[SCENARIO-08]** 피드백 점수 반영 확인

  ```bash
  # 수동 피드백 입력
  export RAG_TENANT_ID="local-default"
  export RAG_PROJECT_ID="$(node -e 'const c=require("crypto");const fs=require("fs");const p=fs.realpathSync(".");console.log(c.createHash("sha256").update(p).digest("hex"));')"

  # accepted 피드백 등록
  node .didim/hooks/rag-feedback.js --target history --id <history_id> --type accepted --note "실운영 채택"

  # DB 확인
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api -c "SET search_path TO se_agent_management; SELECT * FROM chat_history_feedback WHERE feedback_type = 'accepted';"
  ```
  - **기대 결과**: 피드백이 기록되고, RAG 검색 시 `positive_score DESC` 정렬에
    반영

---

## 3.3 성능 검증

### PERF-01: Hook timeout 예산 확인

- [ ] **[PERF-01]** 전체 Hook 실행 시간 측정

  ```bash
  # BeforeAgent Hook 실행 시간
  time echo '{"prompt":"에러율 분석 방법","session_id":"perf-test","cwd":"'$(pwd)'"}' | \
    node .didim/hooks/rag-before-agent.js
  # real < 3s (timeout 5s 대비 60% 이내)

  # AfterAgent Hook 실행 시간
  time echo '{"prompt":"에러율 분석","prompt_response":"분석 결과입니다.","session_id":"perf-test","cwd":"'$(pwd)'"}' | \
    node .didim/hooks/rag-after-agent.js
  # real < 2s
  ```
  - **기대 결과**: BeforeAgent < 3초, AfterAgent < 2초 (p95 기준)

### PERF-02: 대량 데이터 검색 성능

- [ ] **[PERF-02]** 데이터 증가 시 검색 속도 확인

  ```sql
  SET search_path TO se_agent_management, public;

  -- 현재 데이터 수 확인
  SELECT COUNT(*) FROM chat_history;

  -- trigram 인덱스 사용 확인
  EXPLAIN ANALYZE
  SELECT prompt, similarity(prompt, '에러율 분석') AS sim
  FROM chat_history
  WHERE prompt % '에러율 분석'
  ORDER BY sim DESC LIMIT 3;
  ```
  - **기대 결과**: GIN 인덱스 활용 확인, 50건 기준 < 100ms

---

## 3.4 최적화 (필요 시)

- [ ] **[OPT-01]** similarity 임계값 조정
  - 한국어 환경에서 trigram 유사도 분포 확인
  - 기본값 0.1에서 시작, 필요 시 0.05~0.3 범위 조정

  ```sql
  SET search_path TO se_agent_management, public;
  -- 현재 유사도 분포 확인
  SELECT prompt, similarity(prompt, '에러율 분석') AS sim
  FROM chat_history
  ORDER BY sim DESC;
  ```

- [ ] **[OPT-02]** connectionTimeoutMillis / query_timeout 조정
  - 기본값: connect 1500ms, query 2500ms
  - timeout 5초 예산 내에서 최적값 확인

---

## 3.5 성공 기준(DoD) 체크리스트

PoC 설계서 §15의 성공 기준을 기반으로 검증:

| #   | 성공 기준                                            | 검증 시나리오    | 상태 |
| --- | ---------------------------------------------------- | ---------------- | ---- |
| 1   | 모든 일반 대화가 PostgreSQL에 자동 저장됨            | SCENARIO-01      | ⬜   |
| 2   | `tenant_id + project_id`로 데이터 격리됨             | SCENARIO-03      | ⬜   |
| 3   | 운영 메타데이터 누락 없이 저장됨                     | SCENARIO-01      | ⬜   |
| 4   | 과거 유사 대화 시 LLM 응답에 맥락 반영됨             | SCENARIO-02      | ⬜   |
| 5   | `memory_items`가 생성/강화되고 source linkage 유지   | SCENARIO-02-1    | ⬜   |
| 6   | `[장기기억]` 우선, `[근거 대화]` 보조 주입 순서 유지 | SCENARIO-02-1    | ⬜   |
| 7   | 현재 세션 대화는 RAG 결과에서 제외됨                 | SCENARIO-04      | ⬜   |
| 8   | DB 장애 시 CLI 정상 동작 (graceful degradation)      | SCENARIO-05      | ⬜   |
| 9   | 비로컬 DB에서 `RAG_TENANT_ID` 미설정 시 fail-closed  | (환경별 검증)    | ⬜   |
| 10  | `[no response text]` 레코드 미저장                   | SCENARIO-07      | ⬜   |
| 11  | 자동/수동 피드백 기록 경로 동작                      | SCENARIO-08      | ⬜   |
| 12  | 피드백 점수가 RAG 정렬에 반영됨                      | SCENARIO-08      | ⬜   |
| 13  | Hook timeout 내 처리 (p95 < 3초)                     | PERF-01          | ⬜   |
| 14  | 코어 코드 수정 0줄                                   | (전체 확인)      | ⬜   |
| 15  | 폴더 신뢰 승인 후 `/hooks` 활성화 확인               | Phase 0에서 완료 | ⬜   |
| 16  | 스크립트 자체 오류 시 정상 동작                      | SCENARIO-06      | ⬜   |

---

## 3.6 사후 작업 (Post-Work)

- [ ] **[DOC]** 통합 검증 결과서 작성
  - 파일: `../working_history/PoC_Phase3_IntegrationValidation_{작업일자}.md`
  - 내용:
    - 시나리오별 검증 결과 (PASS/FAIL + 증거 스크린샷/로그)
    - 성능 측정 결과 (각 Hook 실행 시간)
    - 최적화 적용 내용 (임계값 조정 등)
    - DoD 체크리스트 최종 상태

- [ ] **[DOC]** PoC 종합 결론 작성
  - 파일: `../working_history/PoC_Conclusion_{작업일자}.md`
  - 내용:
    - PoC 목표 달성 여부
    - 검색 품질 관찰 (한국어 trigram 한계점)
    - 성능 관찰 (Hook timeout 예산 소비율)
    - 향후 개선 방향 (Phase 4 필요성 판단)
    - 프로덕션 전환 시 고려사항

- [ ] **[NEXT]** Phase 4 진행 여부 결정
  - trigram 검색 품질이 충분한가?
  - 의미 기반 검색(pgvector)이 필요한 시나리오가 확인되었는가?
  - 비용/복잡도 대비 개선 효과 예상

---

## ⚠️ 주의사항

1. **검증 순서**: SCENARIO-01 → 02 → 02-1 → 03~08 순서 권장 (데이터 의존성).
2. **DB 장애 테스트 후 복원**: SCENARIO-05 실행 후 반드시
   `docker start didimaistudio_mainproxy-db-1`으로 컨테이너 재시작. ⚠️ 이
   컨테이너는 다른 서비스도 사용하므로 장시간 중지 금지.
3. **모듈 제거 테스트 후 복원**: SCENARIO-06 실행 후 반드시 `node_modules` 복원.
4. **성능 측정 반복**: 1회 측정이 아닌 3~5회 반복 후 중앙값 사용.
5. **테스트 데이터 격리**: 검증용 데이터는 별도 세션/프로젝트에서 생성하여 기존
   데이터와 구분.

---

**작성일**: 2026-02-21 **작성자**: AI Assistant **상태**: ⬜ 미착수
