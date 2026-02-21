# Phase 4: pgvector 의미 기반 검색 전환 (선택)

> **참고 문서**:
>
> - [poc_chat_rag_plan.md](../poc_chat_rag_plan.md) — PoC 설계서 §11 Phase 2
> - [메인 계획서](./main_todo.md)
>
> **작업 분할 규칙**: 최대 2일 이내 완료 **분할 필요**: Y — 기능별 하위 Phase로
> 분할 (4A: 인프라, 4B: 임베딩 생성, 4C: 검색 전환)

---

## 📋 작업 개요

| 항목       | 내용                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| Phase      | Phase 4 (선택 — Phase 3 결과에 따라 진행 여부 결정)                                    |
| 목표       | pg_trgm 문자열 매칭을 pgvector 코사인 유사도 검색으로 전환하여 의미 기반 RAG 품질 향상 |
| 영향 범위  | `.didim/sql/init.sql` (마이그레이션), `.didim/hooks/rag-before-agent.js`               |
| 위험 수준  | 🟠 Medium (외부 API 의존, 스키마 변경, 임베딩 비용)                                    |
| 선행 Phase | Phase 3 (통합 검증 완료 + trigram 검색 품질 한계 확인)                                 |
| 예상 소요  | 2~3일 (하위 Phase 포함)                                                                |

### 핵심 목표

pg_trgm의 3-gram 기반 문자열 유사도에서 **벡터 임베딩 기반 의미 유사도
검색**으로 전환한다. 이를 통해 "에러율 급증"과 "서비스 장애"처럼 **문자열이
다르지만 의미가 유사한 질문**도 검색할 수 있다.

### 진행 판단 기준

Phase 3 완료 후 다음 조건 중 하나 이상 충족 시 진행:

- [ ] trigram 유사도가 0.1 미만인 의미적으로 관련 있는 질문 쌍이 3건 이상 발견됨
- [ ] 사용자 피드백에서 "관련 있는데 검색 안 됨" 사례가 확인됨
- [ ] 다국어/약어/유사어 검색 요구사항이 발생함

---

## 🚨 핵심 리스크

| 리스크                               | 영향      | 대응 방안                                                                                                                                                                                                                                                                                                                                                              | 상태 |
| ------------------------------------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| Gemini Embedding API 비용/할당량     | 🟠 Medium | 저장 시 1회 임베딩 생성 (검색 시에도 1회), 캐싱으로 중복 호출 방지                                                                                                                                                                                                                                                                                                     | ⬜   |
| pgvector 확장 미활성화               | 🟡 Low    | Docker 이미지 `pgvector/pgvector:pg16`에 사전 설치됨, `CREATE EXTENSION vector` 실행만 필요                                                                                                                                                                                                                                                                            | ⬜   |
| 임베딩 API 호출 시 Hook timeout 초과 | 🟠 Medium | Hook은 **동기 실행**(`docs/hooks/index.md:32`)이므로 비동기 불가. AfterAgent에서 Q&A 저장 후 **같은 hook 내에서** 임베딩 생성+저장 수행. timeout 예산: connect(200ms) + INSERT(100ms) + embedding API(~500ms) + UPDATE(100ms) ≈ 900ms (5초 이내). BeforeAgent는 검색 질문 1회 임베딩(~500ms) + 벡터 검색(~100ms). API 실패 시 embedding=NULL로 저장 → pg_trgm fallback | ⬜   |
| 기존 pg_trgm 검색 회귀               | 🟡 Low    | pgvector + pg_trgm 병행 운영 가능, 하이브리드 검색 고려                                                                                                                                                                                                                                                                                                                | ⬜   |
| 임베딩 차원 불일치                   | 🟡 Low    | Gemini Embedding 모델 출력 차원 사전 확인 (text-embedding-004: 768차원)                                                                                                                                                                                                                                                                                                | ⬜   |

---

## Phase 4A: 인프라 준비 (0.5일)

### 4A.1 사전 작업

- [ ] **[REVIEW]** Phase 3 결과 확인
  - trigram 검색 품질 한계 사례 수집
  - Phase 4 진행 판단 기준 충족 확인

- [ ] **[ANALYSIS]** pgvector 활성화 확인
  ```bash
  # Docker 이미지 pgvector/pgvector:pg16에 pgvector 사전 설치됨
  # CREATE EXTENSION만 실행하면 됨 (별도 설치 불필요)
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api \
    -c "CREATE EXTENSION IF NOT EXISTS vector;"
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api \
    -c "SELECT extversion FROM pg_extension WHERE extname = 'vector';"
  ```

### 4A.2 구현

#### TASK-4A-01: pgvector 설치 + 스키마 마이그레이션

- [ ] **[TASK-4A-01]** pgvector 확장 활성화 및 embedding 컬럼 추가
  - **별도 설치 불필요**: Docker 이미지 `pgvector/pgvector:pg16`에 사전 설치됨
  - 마이그레이션 SQL 작성: `.didim/sql/migrate_v2_pgvector.sql`

    ```sql
    -- pgvector 확장 활성화 (Docker 이미지에 사전 설치됨)
    CREATE EXTENSION IF NOT EXISTS vector;

    -- se_agent_management 스키마에서 작업
    SET search_path TO se_agent_management, public;

    -- chat_history에 embedding 컬럼 추가
    ALTER TABLE chat_history
      ADD COLUMN IF NOT EXISTS prompt_embedding vector(768);

    -- memory_items에 embedding 컬럼 추가
    ALTER TABLE memory_items
      ADD COLUMN IF NOT EXISTS summary_embedding vector(768);

    -- 벡터 인덱스 생성 (IVFFlat — 소규모 데이터에 적합)
    CREATE INDEX IF NOT EXISTS idx_chat_history_embedding
      ON chat_history USING ivfflat (prompt_embedding vector_cosine_ops)
      WITH (lists = 10);

    CREATE INDEX IF NOT EXISTS idx_memory_items_embedding
      ON memory_items USING ivfflat (summary_embedding vector_cosine_ops)
      WITH (lists = 10);
    ```

  - 실행:
    `PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api < .didim/sql/migrate_v2_pgvector.sql`
  - 예상 소요: 20분

#### TASK-4A-02: Gemini Embedding API 접근 확인

- [ ] **[TASK-4A-02]** 임베딩 API 동작 테스트
  ```bash
  # GEMINI_API_KEY 환경변수 필요
  curl "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=$GEMINI_API_KEY" \
    -H 'Content-Type: application/json' \
    -d '{"model":"models/text-embedding-004","content":{"parts":[{"text":"에러율 분석"}]}}'
  ```
  - **확인 사항**: 응답의 `embedding.values` 길이 = 768
  - 예상 소요: 10분

### 4A.3 검증

- [ ] **[VERIFY-4A]** 인프라 준비 확인

  ```bash
  # pgvector 동작 확인
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api \
    -c "SELECT '[1,2,3]'::vector(3);"

  # 컬럼 추가 확인 (se_agent_management 스키마)
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api \
    -c "SET search_path TO se_agent_management; \d chat_history"
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api \
    -c "SET search_path TO se_agent_management; \d memory_items"
  ```

---

## Phase 4B: 임베딩 생성 연동 (1일)

### 4B.1 사전 작업

- [ ] **[REVIEW]** Phase 4A 완료 확인
  - pgvector 설치 + 스키마 마이그레이션 완료
  - Embedding API 접근 가능

### 4B.2 구현

#### TASK-4B-01: 임베딩 생성 유틸리티

- [ ] **[TASK-4B-01]** 공용 임베딩 생성 모듈 작성
  - 파일: `.didim/hooks/embedding.js`
  - 핵심 로직:
    1. `GEMINI_API_KEY` 환경변수에서 API 키 획득
    2. Gemini Embedding API (`text-embedding-004`) 호출
    3. 768차원 벡터 반환
    4. API 실패 시 `null` 반환 (graceful degradation)
  - timeout: 2000ms (Hook timeout 예산 내)
  - 예상 소요: 30분

#### TASK-4B-02: rag-after-agent.js 임베딩 저장 추가

- [ ] **[TASK-4B-02]** AfterAgent에 임베딩 생성 + 저장 로직 추가
  - `rag-after-agent.js` 수정:
    1. Q&A INSERT 후 `prompt`에 대한 임베딩 생성
    2. `UPDATE chat_history SET prompt_embedding = $1 WHERE id = $2`
    3. memory candidate가 있으면 `summary`에 대한 임베딩도 생성
    4. `UPDATE memory_items SET summary_embedding = $1 WHERE ...`
  - **중요**: 임베딩 생성 실패 시 레코드 자체는 정상 저장 (embedding만 NULL)
  - 예상 소요: 45분

#### TASK-4B-03: 기존 데이터 백필(backfill) 스크립트

- [ ] **[TASK-4B-03]** 기존 chat_history/memory_items에 임베딩 추가
  - 파일: `.didim/hooks/backfill-embeddings.js`
  - 로직:
    1. `prompt_embedding IS NULL`인 chat_history 레코드 조회
    2. 각 prompt에 대해 임베딩 생성
    3. UPDATE로 저장
    4. rate limiting: 100ms 간격으로 API 호출
  - 실행: `node .didim/hooks/backfill-embeddings.js`
  - 예상 소요: 30분

### 4B.3 검증

- [ ] **[VERIFY-4B-01]** 새 대화 저장 시 임베딩 생성 확인

  ```bash
  didim
  > 테스트 질문

  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api \
    -c "SET search_path TO se_agent_management; SELECT id, LEFT(prompt, 30),
                         CASE WHEN prompt_embedding IS NOT NULL THEN 'YES' ELSE 'NO' END AS has_embedding
                  FROM chat_history ORDER BY id DESC LIMIT 3;"
  ```

- [ ] **[VERIFY-4B-02]** 백필 실행 후 기존 데이터 임베딩 확인
  ```bash
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api \
    -c "SET search_path TO se_agent_management; SELECT COUNT(*) AS total,
                         COUNT(prompt_embedding) AS with_embedding
                  FROM chat_history;"
  ```

---

## Phase 4C: 검색 전환 (0.5~1일)

### 4C.1 사전 작업

- [ ] **[REVIEW]** Phase 4B 완료 확인
  - 새 대화 저장 시 임베딩 자동 생성
  - 기존 데이터 백필 완료

### 4C.2 구현

#### TASK-4C-01: rag-before-agent.js 벡터 검색 전환

- [ ] **[TASK-4C-01]** BeforeAgent 검색 쿼리를 벡터 유사도 기반으로 변경
  - `rag-before-agent.js` 수정:
    1. 검색 질문에 대한 임베딩 생성 (실시간)
    2. 코사인 유사도 기반 검색 쿼리:

    ```sql
    -- memory_items 벡터 검색
    SELECT id, memory_type, summary, confidence,
           1 - (summary_embedding <=> $1::vector) AS sim
    FROM memory_items
    WHERE tenant_id = $2
      AND project_id = $3
      AND summary_embedding IS NOT NULL
      AND 1 - (summary_embedding <=> $1::vector) > 0.5
    ORDER BY sim DESC, confidence DESC
    LIMIT $4;

    -- chat_history 벡터 검색
    SELECT id, service_name, environment, prompt, response,
           1 - (prompt_embedding <=> $1::vector) AS sim
    FROM chat_history
    WHERE tenant_id = $2
      AND project_id = $3
      AND session_id != $4
      AND prompt_embedding IS NOT NULL
      AND 1 - (prompt_embedding <=> $1::vector) > 0.5
    ORDER BY sim DESC
    LIMIT $5;
    ```

  - **임베딩 실패 시 fallback**: pg_trgm 검색으로 자동 전환
  - 예상 소요: 45분

#### TASK-4C-02: 하이브리드 검색 모드 (선택)

- [ ] **[TASK-4C-02]** pgvector + pg_trgm 결합 검색
  - 환경변수 `RAG_SEARCH_MODE`:
    - `vector` (기본): pgvector 코사인 유사도만 사용
    - `trigram`: pg_trgm만 사용 (기존 방식)
    - `hybrid`: 양쪽 검색 결과를 RRF(Reciprocal Rank Fusion)로 병합
  - 하이브리드 검색 시:
    1. pgvector 검색 → rank 부여
    2. pg_trgm 검색 → rank 부여
    3. RRF 점수 = Σ 1/(k + rank_i), k = 60
    4. RRF 점수 기준 상위 N건 선택
  - 예상 소요: 1시간 (선택 사항)

### 4C.3 검증

- [ ] **[VERIFY-4C-01]** 의미 기반 검색 품질 비교

  ```bash
  # 문자열 유사하지만 의미가 다른 케이스
  # "에러율 급증" vs "서비스 장애" → trigram: 낮음, vector: 높음 기대

  # 직접 stdin 주입으로 비교
  echo '{"prompt":"서비스 장애 대응 방법","session_id":"test","cwd":"'$(pwd)'"}' | \
    node .didim/hooks/rag-before-agent.js
  ```

- [ ] **[VERIFY-4C-02]** 임베딩 생성 실패 시 fallback 확인

  ```bash
  # GEMINI_API_KEY 미설정 상태에서 실행
  unset GEMINI_API_KEY
  echo '{"prompt":"테스트","session_id":"test","cwd":"'$(pwd)'"}' | \
    node .didim/hooks/rag-before-agent.js
  # pg_trgm fallback으로 정상 동작해야 함
  ```

- [ ] **[VERIFY-4C-03]** 검색 성능 비교

  ```sql
  SET search_path TO se_agent_management, public;

  -- pgvector 검색 실행 계획
  EXPLAIN ANALYZE
  SELECT id, 1 - (prompt_embedding <=> '[...]'::vector) AS sim
  FROM chat_history
  WHERE prompt_embedding IS NOT NULL
  ORDER BY prompt_embedding <=> '[...]'::vector
  LIMIT 3;

  -- pg_trgm 검색 실행 계획 (비교용)
  EXPLAIN ANALYZE
  SELECT id, similarity(prompt, '에러율 분석') AS sim
  FROM chat_history
  WHERE prompt % '에러율 분석'
  ORDER BY sim DESC LIMIT 3;
  ```

---

## 사후 작업 (Post-Work)

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/PoC_Phase4_PgvectorSearch_{작업일자}.md`
  - 내용:
    - pgvector 설치/설정 방법
    - 임베딩 모델 (text-embedding-004) 차원/성능
    - trigram vs vector vs hybrid 검색 품질 비교
    - 임베딩 API 비용/성능 관찰
    - 권장 검색 모드 결론

- [ ] **[DOC]** main_todo.md 완료 상태 업데이트

---

## 📊 산출물 매트릭스

| 산출물                                    | 4A  | 4B  | 4C  | 유형                  |
| ----------------------------------------- | --- | --- | --- | --------------------- |
| `.didim/sql/migrate_v2_pgvector.sql`      | ✅  |     |     | DB 마이그레이션       |
| `.didim/hooks/embedding.js`               |     | ✅  |     | 유틸리티 모듈         |
| `.didim/hooks/backfill-embeddings.js`     |     | ✅  |     | 마이그레이션 스크립트 |
| `.didim/hooks/rag-after-agent.js` (수정)  |     | ✅  |     | 스크립트 수정         |
| `.didim/hooks/rag-before-agent.js` (수정) |     |     | ✅  | 스크립트 수정         |
| 작업 결과서                               |     |     | ✅  | 문서                  |

---

## ⚠️ 주의사항

1. **API 키 필수**: `GEMINI_API_KEY` 환경변수가 설정되어야 임베딩 생성 가능.
   미설정 시 임베딩 없이 pg_trgm fallback 동작.
2. **임베딩 비용**: text-embedding-004는 호출당 비용 발생. 대량 백필 시 비용
   사전 확인.
3. **벡터 차원 고정**: 768차원은 text-embedding-004 기준. 모델 변경 시 스키마
   마이그레이션 필요.
4. **pgvector 사전 설치**: Docker 이미지 `pgvector/pgvector:pg16`에 포함되어
   있어 별도 설치 없이 `CREATE EXTENSION vector;`만 실행하면 된다.
5. **IVFFlat 인덱스 특성**: 데이터 100건 미만에서는 인덱스 효과 미미. 데이터
   증가 시 `lists` 파라미터 조정 필요 (√N 기준).
6. **Hook 동기 실행 모델**: Hook은 동기 실행이며 (`docs/hooks/index.md:32`),
   hook 완료까지 CLI가 대기한다. 비동기 임베딩 생성은 불가. timeout 예산:
   BeforeAgent에서 임베딩 생성(~500ms) + 벡터 검색(~100ms) + DB 연결(~200ms) =
   ~800ms. 5초 timeout 대비 안전하나 네트워크 지연 고려.
7. **rollback 전략**: 문제 발생 시 `RAG_SEARCH_MODE=trigram`으로 즉시 pg_trgm
   복원 가능.

---

**작성일**: 2026-02-21 **작성자**: AI Assistant **상태**: ⬜ 미착수 (Phase 3
결과에 따라 진행 여부 결정)
