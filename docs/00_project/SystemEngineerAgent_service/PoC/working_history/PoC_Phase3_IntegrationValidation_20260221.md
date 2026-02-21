# Phase 3: 통합 검증 + 최적화 결과서

> **작업일**: 2026-02-21 **참조 설계서**: `poc_chat_rag_plan.md` §12 검증
> 시나리오, §15 성공 기준 **참조 계획서**:
> `todolist/phase3_integration_validation.md`

---

## 1. 작업 요약

Phase 1(AfterAgent Hook) + Phase 2(BeforeAgent Hook) 통합 파이프라인의 정상
동작을 8개 검증 시나리오와 2개 성능 테스트로 확인하고, similarity threshold
최적화를 적용함.

| 항목           | 결과                                       |
| -------------- | ------------------------------------------ |
| 검증 시나리오  | 8/8 PASS                                   |
| 성능 테스트    | 2/2 PASS                                   |
| 최적화 적용    | OPT-01 적용 (0.12→0.1), OPT-02 변경 불필요 |
| 코어 코드 수정 | **0줄**                                    |

---

## 2. 사전 작업

### 2.1 테스트 데이터 준비

Phase 1+2에서 축적된 7건(chat_history) + Phase 3에서 추가 2건 = 총 **12건**:

| id  | prompt (요약)        | service        | env  | 특이사항             |
| --- | -------------------- | -------------- | ---- | -------------------- |
| 11  | 에러율 분석          | payments-api   | prod | rejected 피드백 1건  |
| 12  | 인증 오류 분석       | auth-svc       | dev  | -                    |
| 13  | 인증 오류 분석       | auth-svc       | dev  | -                    |
| 14  | 에러율 분석          | payments-api   | prod | -                    |
| 15  | INC-4567 API Gateway | api-gateway    | prod | ticket_id 포함       |
| 16  | DB 커넥션 풀 고갈    | payments-api   | prod | -                    |
| 17  | CHG-1234 Prometheus  | monitoring-svc | stg  | SCENARIO-01에서 생성 |

memory_items: 6건 (fact×3, incident_postmortem×2, runbook×1)

### 2.2 rag-feedback.js 생성

설계서 §6.3 기반 수동 피드백 CLI 도구 신규 생성.

- 위치: `.didim/hooks/rag-feedback.js`
- 기능:
  `--target memory|history --id <N> --type accepted|edited|rejected [--note "..."]`
- Phase 1/2 교훈 적용: 동적 pg import, schema-qualified SQL, 에러 분류

---

## 3. 검증 시나리오 실행 결과

### SCENARIO-01: Q&A 저장 + 운영 메타데이터 ✅

```
stdin: {"prompt":"[service:monitoring-svc][env:stg] CHG-1234 ...","session_id":"m-test-001","cwd":"..."}
→ DB 저장 확인: service_name=monitoring-svc, environment=stg, ticket_id=CHG-1234
```

### SCENARIO-02: RAG 검색 + 컨텍스트 주입 ✅

```
stdin: {"prompt":"에러율 분석 방법","session_id":"sc02-test","cwd":"..."}
→ 3건 history 검색 반환
→ chat_history_feedback에 selected 피드백 기록 확인
```

### SCENARIO-02-1: 장기기억(memory) 우선 주입 ✅

```
→ additionalContext에 [장기기억] 블록이 [근거 대화] 블록보다 선행
→ memory_feedback에 used 피드백 기록 확인
```

### SCENARIO-03: 프로젝트 격리 ✅

```
cwd=/tmp/isolation-project-b → project_id 불일치 → 검색 0건 → {}
```

### SCENARIO-04: 현재 세션 제외 ✅

```
session_id=m-test-001과 동일 세션 → 해당 세션 chat_history 미포함 확인
```

### SCENARIO-05: DB 장애 시 graceful degradation ✅

```
RAG_DATABASE_URL=postgresql://localhost:59999/nonexistent
→ exit 0 + stdout {} + stderr "[rag-before-agent] DB error: ..."
→ exit 0 + stdout {} + stderr "[rag-after-agent] DB error: ..."
```

### SCENARIO-06: 모듈 오류 시 정상 동작 ✅

```
node_modules 임시 제거 → exit 0 + stdout {}
→ stderr: "[rag-before-agent] DB error: Cannot find package 'pg'"
→ node_modules 복원 후 정상 동작 확인
```

### SCENARIO-07: placeholder 응답 저장 방지 ✅

```
prompt_response="[no response text]" → DB 저장 0건
```

### SCENARIO-08: 품질 피드백 기반 랭킹 보정 ✅

```
1. rag-feedback.js로 history_id=11에 rejected 피드백 등록
2. RAG 검색 실행 → 동일 similarity(0.4)에서:
   - history_id=14 (negative=0) → 1위
   - history_id=11 (negative=1) → 2위
3. ORDER BY ... negative_score ASC 정렬 동작 확인
```

---

## 4. 성능 검증 결과

### PERF-01: Hook timeout 예산 확인 ✅

5회 반복 측정 (단위: ms):

| Hook        | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | **중앙값** | 기준     | 예산 소비율 |
| ----------- | ----- | ----- | ----- | ----- | ----- | ---------- | -------- | ----------- |
| BeforeAgent | 956   | 960   | 939   | 946   | 944   | **946**    | < 3000ms | **19%**     |
| AfterAgent  | 429   | 420   | 437   | 428   | 434   | **429**    | < 2000ms | **9%**      |

### PERF-02: GIN 인덱스 사용 확인 ✅

```sql
-- GIN 인덱스 존재 확인
idx_chat_history_prompt_trgm  : USING gin (prompt gin_trgm_ops)
idx_memory_items_summary_trgm : USING gin (summary gin_trgm_ops)

-- 강제 인덱스 사용 시 (enable_seqscan=off)
→ Bitmap Index Scan on idx_chat_history_prompt_trgm
→ Execution Time: 0.683ms (기준 < 100ms)
```

소량 데이터(12건)에서 optimizer가 Seq Scan을 선택하지만, GIN 인덱스가 올바르게
생성되어 데이터 증가 시 자동 활용됨.

---

## 5. 최적화 적용

### OPT-01: similarity 임계값 조정 ✅ → 0.12 → 0.1

**분석 결과**:

| 쿼리               | 정답 sim | 차선 sim | threshold 0.12 | threshold 0.1 |
| ------------------ | -------- | -------- | -------------- | ------------- |
| "에러율 분석"      | 0.194    | 0.081    | ✅ 통과        | ✅ 통과       |
| "DB 커넥션"        | 0.108    | 0.026    | ❌ 미달        | ✅ 통과       |
| "API Gateway 장애" | 0.174    | 0.085    | ✅ 통과        | ✅ 통과       |

한국어 환경에서 메타데이터 태그(`[service:...]`, `[env:...]`)가 유사도를
희석시키는 특성상 0.12 → **0.1**으로 소폭 하향하여 커버리지 개선.

적용 후 "DB 커넥션 풀 고갈 대응 방법" 검색 시 history_id=16 + memory_id=11,13,7
정상 반환 확인.

### OPT-02: timeout 설정 → 변경 불필요

| 파라미터            | 현재값 | 실측 p50            | 판정 |
| ------------------- | ------ | ------------------- | ---- |
| CONNECT_TIMEOUT_MS  | 1500ms | ~50ms (로컬)        | 적정 |
| QUERY_TIMEOUT_MS    | 1500ms | ~100ms (로컬)       | 적정 |
| FEEDBACK_TIMEOUT_MS | 500ms  | ~50ms (로컬)        | 적정 |
| Hook timeout (설정) | 5000ms | 946ms (BeforeAgent) | 적정 |

---

## 6. DoD 체크리스트

| #   | 성공 기준                                            | 검증 시나리오 | 상태 |
| --- | ---------------------------------------------------- | ------------- | ---- |
| 1   | 모든 일반 대화가 PostgreSQL에 자동 저장됨            | SCENARIO-01   | ✅   |
| 2   | `tenant_id + project_id`로 데이터 격리됨             | SCENARIO-03   | ✅   |
| 3   | 운영 메타데이터 누락 없이 저장됨                     | SCENARIO-01   | ✅   |
| 4   | 과거 유사 대화 시 LLM 응답에 맥락 반영됨             | SCENARIO-02   | ✅   |
| 5   | `memory_items`가 생성/강화되고 source linkage 유지   | SCENARIO-02-1 | ✅   |
| 6   | `[장기기억]` 우선, `[근거 대화]` 보조 주입 순서 유지 | SCENARIO-02-1 | ✅   |
| 7   | 현재 세션 대화는 RAG 결과에서 제외됨                 | SCENARIO-04   | ✅   |
| 8   | DB 장애 시 CLI 정상 동작 (graceful degradation)      | SCENARIO-05   | ✅   |
| 9   | 비로컬 DB에서 `RAG_TENANT_ID` 미설정 시 fail-closed  | Phase 2 코드  | ✅   |
| 10  | `[no response text]` 레코드 미저장                   | SCENARIO-07   | ✅   |
| 11  | 자동/수동 피드백 기록 경로 동작                      | SCENARIO-08   | ✅   |
| 12  | 피드백 점수가 RAG 정렬에 반영됨                      | SCENARIO-08   | ✅   |
| 13  | Hook timeout 내 처리 (p95 < 3초)                     | PERF-01       | ✅   |
| 14  | 코어 코드 수정 0줄                                   | git diff 확인 | ✅   |
| 15  | 폴더 신뢰 승인 후 `/hooks` 활성화 확인               | Phase 0 완료  | ✅   |
| 16  | 스크립트 자체 오류 시 정상 동작                      | SCENARIO-06   | ✅   |

**16/16 PASS** — 모든 성공 기준 충족

---

## 7. 변경 파일 요약

| 파일                               | 변경 내용                               |
| ---------------------------------- | --------------------------------------- |
| `.didim/hooks/rag-before-agent.js` | OPT-01: SIMILARITY_THRESHOLD 0.12 → 0.1 |
| `.didim/hooks/rag-feedback.js`     | 신규 생성: 수동 피드백 CLI 도구         |

---

## 8. 핵심 관찰

1. **한국어 trigram 한계**: 메타데이터 태그 포함 시 유사도가 0.1~0.2 수준으로
   낮음. 순수 한국어 텍스트 간 비교는 비교적 양호하나, 영문/기호 혼합 시 희석
   현상 존재.
2. **성능 충분**: Hook timeout 5초 대비 BeforeAgent 19%, AfterAgent 9% 소비.
   원격 DB(네트워크 지연 +100~200ms) 환경에서도 50% 이내로 예상.
3. **graceful degradation 완전**: DB 장애, 모듈 오류 모두 exit 0 + 빈 JSON 반환.
   CLI 사용자 경험 무영향.
