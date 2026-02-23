# PoC 종합 결론: Chat RAG (대화 기반 맥락 검색)

> **작업 기간**: 2026-02-21 (Phase 0~3, 1일 완료) **참조 설계서**:
> `poc_chat_rag_plan.md`

---

## 1. PoC 목표 달성 여부

### 1.1 목표

Gemini CLI의 Hook 시스템(`BeforeAgent`/`AfterAgent`)만으로, **코어 코드 수정
없이** 대화 자동 저장 + pg_trgm 기반 유사 검색 + LLM 컨텍스트 주입 파이프라인
구현 가능 여부 검증.

### 1.2 결과: ✅ **달성**

| 목표 항목                 | 달성 | 증거                                         |
| ------------------------- | ---- | -------------------------------------------- |
| 코어 코드 수정 없이 구현  | ✅   | `git diff HEAD -- packages/` → 0줄           |
| 대화 자동 저장            | ✅   | SCENARIO-01: chat_history + 메타데이터 저장  |
| 유사 검색 + 컨텍스트 주입 | ✅   | SCENARIO-02: additionalContext 주입 확인     |
| 장기기억 우선 조회        | ✅   | SCENARIO-02-1: [장기기억] → [근거 대화] 순서 |
| 프로젝트 격리             | ✅   | SCENARIO-03: project_id 불일치 → 0건         |
| graceful degradation      | ✅   | SCENARIO-05,06: DB 장애/모듈 오류 → exit 0   |
| 피드백 반영 랭킹          | ✅   | SCENARIO-08: rejected → 순위 하락 확인       |
| Hook timeout 준수         | ✅   | PERF-01: p50 946ms (예산 5000ms의 19%)       |
| DoD 16항목                | ✅   | 16/16 PASS                                   |

---

## 2. 아키텍처 검증

```
User → CLI (packages/cli)
        ├─ BeforeAgent Hook → rag-before-agent.js → PostgreSQL (pg_trgm search)
        │                      └→ additionalContext 주입
        ├─ Core (packages/core) → LLM API (변경 없음)
        └─ AfterAgent Hook  → rag-after-agent.js  → PostgreSQL (INSERT)
```

**핵심 장점**:

- Hook 시스템의 stdin/stdout JSON 프로토콜로 완전 분리
- Node.js 스크립트 → npm 패키지(pg) 하나로 DB 연동
- 5초 timeout + kill 보호로 CLI 성능 무영향 보장

---

## 3. 검색 품질 관찰

### 3.1 pg_trgm 한국어 성능

| 특성             | 관찰                                        |
| ---------------- | ------------------------------------------- |
| 순수 한국어 매칭 | 유사도 0.19~0.40 — 양호                     |
| 영문/기호 혼합   | 유사도 0.10~0.17 — 메타데이터 태그가 희석   |
| threshold 적정값 | 0.1 (설계서 기본 0.12에서 하향 조정)        |
| false positive   | 0.1 threshold에서 관련 없는 문서 포함 없음  |
| false negative   | 0.12에서 "DB 커넥션" 검색 누락 → 0.1로 해소 |

### 3.2 한계점

1. **짧은 쿼리**: 2~3어절 한국어 쿼리는 trigram 생성량이 적어 유사도가 낮음
2. **동의어 미지원**: "장애" ≠ "에러" ≠ "오류" — trigram은 문자 수준 매칭이므로
   의미적 유사성 미반영
3. **메타데이터 오염**: `[service:...]` 태그가 유사도를 희석시킴. 현재 `prompt`
   필드에서 직접 비교하므로, 순수 질문 텍스트만 별도 컬럼으로 분리하면 개선 가능

---

## 4. 성능 관찰

| 측정 항목           | 결과   | 판정                           |
| ------------------- | ------ | ------------------------------ |
| BeforeAgent p50     | 946ms  | timeout 5s 대비 **19%** — 여유 |
| AfterAgent p50      | 429ms  | timeout 5s 대비 **9%** — 여유  |
| DB 쿼리 (GIN index) | 0.68ms | 100ms 기준 대비 **0.7%**       |
| FEEDBACK_TIMEOUT_MS | 500ms  | best-effort, 지연 시 포기      |

**병목 분석**: 전체 시간의 ~80%가 Node.js 기동 + pg 모듈 로드 + TCP 연결에
소비됨. 쿼리 자체는 1ms 미만. 프로덕션에서 connection pool(pgBouncer 등) 적용 시
50% 이상 단축 가능.

---

## 5. 향후 개선 방향

### Phase 4 필요성 판단

| 개선 방향              | 필요성  | 우선순위 | 비고                                         |
| ---------------------- | ------- | -------- | -------------------------------------------- |
| pgvector 의미 검색     | 🟡 선택 | P2       | 동의어/의미 유사 쿼리 커버 필요 시           |
| 순수 질문 텍스트 분리  | 🟢 권장 | P1       | 메타데이터 희석 해소, 스키마 변경만으로 가능 |
| Connection pooling     | 🟢 권장 | P1       | 프로덕션 환경 성능 최적화                    |
| 검색 결과 캐싱         | 🟡 선택 | P3       | 동일 세션 내 반복 검색 최적화                |
| memory_items 자동 생성 | 🟡 선택 | P2       | 현재 수동 INSERT → LLM 기반 자동 추출        |

### 프로덕션 전환 시 고려사항

1. **환경 변수 관리**: `RAG_DATABASE_URL`, `RAG_TENANT_ID`를 조직별 설정으로
   관리
2. **DB 마이그레이션**: `se_agent_management` 스키마 + pg_trgm 확장 자동 설치
   스크립트
3. **모니터링**: Hook stderr 로그 수집 → 에러율/지연 시간 대시보드
4. **데이터 정리**: TTL 기반 오래된 chat_history 아카이빙 (GDPR 등 규정 고려)
5. **멀티테넌시**: tenant_id 기반 RLS(Row Level Security) 적용 검토

---

## 6. PoC 산출물 목록

| 산출물           | 위치                                                           |
| ---------------- | -------------------------------------------------------------- |
| 설계서           | `poc_chat_rag_plan.md`                                         |
| DB 스키마        | 설계서 §4 + Phase 0 결과서                                     |
| AfterAgent Hook  | `.didim/hooks/rag-after-agent.js`                              |
| BeforeAgent Hook | `.didim/hooks/rag-before-agent.js`                             |
| 피드백 CLI       | `.didim/hooks/rag-feedback.js`                                 |
| Hook 설정        | `.didim/settings.json`                                         |
| Phase 0 결과서   | `working_history/PoC_Phase0_EnvironmentSetup_20260221.md`      |
| Phase 1 결과서   | `working_history/PoC_Phase1_AfterAgentHook_20260221.md`        |
| Phase 2 결과서   | `working_history/PoC_Phase2_BeforeAgentHook_20260221.md`       |
| Phase 3 결과서   | `working_history/PoC_Phase3_IntegrationValidation_20260221.md` |
| 종합 결론        | `working_history/PoC_Conclusion_20260221.md` (본 문서)         |

---

## 7. 최종 판정

> **Chat RAG PoC: ✅ 성공**
>
> Hook 시스템만으로 코어 코드 무수정 RAG 파이프라인 구현이 가능하며, pg_trgm
> 기반 한국어 검색은 PoC 수준에서 충분한 품질을 제공함. 프로덕션 전환 시 순수
> 질문 텍스트 분리 + connection pooling을 우선 적용하고, 의미 검색 필요 시
> pgvector 도입을 검토할 것을 권장함.
