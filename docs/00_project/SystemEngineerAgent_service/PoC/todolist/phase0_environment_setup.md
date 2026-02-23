# Phase 0: 환경 구축 + DB 스키마 + 프로젝트 초기화

> **참고 문서**:
>
> - [poc_chat_rag_plan.md](../poc_chat_rag_plan.md) — PoC 설계서
> - [메인 계획서](./main_todo.md)
>
> **작업 분할 규칙**: 최대 2일 이내 완료

---

## 📋 작업 개요

| 항목       | 내용                                                                           |
| ---------- | ------------------------------------------------------------------------------ |
| Phase      | Phase 0 (선행 필수)                                                            |
| 목표       | 기존 Docker DB에 스키마 생성, pg_trgm 확장 설치, Hook 프로젝트 초기화          |
| 영향 범위  | Docker 컨테이너 `didimaistudio_mainproxy-db-1`, `.didim/hooks/`, `.didim/sql/` |
| 위험 수준  | 🟢 Low (기존 DB 내 별도 스키마 생성, 코드 변경 없음)                           |
| 선행 Phase | 없음                                                                           |
| 예상 소요  | 0.5일                                                                          |

### 핵심 목표

Phase 1~2에서 Hook 스크립트를 즉시 개발할 수 있도록 **DB 스키마 + 프로젝트
구조 + 폴더 신뢰**를 준비한다.

### DB 인프라 현황

| 항목         | 내용                                                        |
| ------------ | ----------------------------------------------------------- |
| 컨테이너     | `didimaistudio_mainproxy-db-1`                              |
| 이미지       | `pgvector/pgvector:pg16` (pgvector 확장 **사전 설치됨**)    |
| 포트         | `0.0.0.0:5432 → 5432`                                       |
| 데이터베이스 | `didim_api` (기존 — 다른 서비스와 공유)                     |
| 스키마       | `se_agent_management` (**신규 생성** — PoC 전용 격리)       |
| 접속 정보    | `postgresql://postgres:password12@localhost:5432/didim_api` |
| Node.js 접속 | `pg.Client` + `search_path = se_agent_management, public`   |

> **⚠️ 공유 DB 주의**: `didim_api`는 다른 서비스가 함께 사용하는 DB이다. 테이블
> 이름 충돌 및 데이터 교차 오염 방지를 위해 **전용 스키마
> `se_agent_management`**를 생성하여 격리한다.

---

## 🚨 핵심 리스크

| 리스크                                  | 영향      | 대응 방안                                                               | 상태 |
| --------------------------------------- | --------- | ----------------------------------------------------------------------- | ---- |
| Docker 컨테이너 미기동                  | 🔴 High   | `docker ps` 확인 후 `docker start didimaistudio_mainproxy-db-1`         | ⬜   |
| 기존 DB 스키마/테이블 이름 충돌         | 🟠 Medium | 전용 스키마 `se_agent_management` 사용으로 완전 격리                    | ⬜   |
| pg_trgm 확장 미설치                     | 🟡 Low    | `pgvector/pgvector:pg16` 이미지에 pg_trgm 포함 확인, `CREATE EXTENSION` | ⬜   |
| `.didim/` 디렉토리 .gitignore 포함 여부 | 🟡 Low    | .gitignore 확인 후 PoC 산출물 관리 방안 결정                            | ⬜   |
| 폴더 신뢰 미승인 시 hook 미실행         | 🔴 High   | CLI 최초 실행 시 승인 프롬프트 확인                                     | ⬜   |

---

## DB 접속 약어

> 이하 작업계획서 전반에서 `psql` 명령은 다음 접속 정보를 사용한다.
>
> ```bash
> # 환경변수 설정 (세션 1회)
> export PGPASSWORD=password12
>
> # psql 접속 (이하 동일)
> psql -U postgres -h localhost -d didim_api
>
> # 스키마 지정 쿼리 실행 시
> psql -U postgres -h localhost -d didim_api \
>   -c "SET search_path TO se_agent_management; <SQL>"
> ```
>
> 또는 Hook 스크립트에서 사용하는 접속 URL:
>
> ```
> RAG_DATABASE_URL=postgresql://postgres:password12@localhost:5432/didim_api
> ```

---

## 0.1 사전 작업 (Pre-Work)

- [x] **[CONTEXT]** 작업 목적 확인
  - PoC 설계서 검토: [poc_chat_rag_plan.md](../poc_chat_rag_plan.md) §4 기술
    스택, §5 DB 스키마
  - Hook 시스템 이해: `hookRunner.ts` spawn 모델, `hookEventHandler.ts`
    createBaseInput

- [x] **[ANALYSIS]** 현재 환경 확인
  - Docker 컨테이너 기동 상태: `docker ps | grep didimaistudio_mainproxy-db-1`
  - `.didim/` 디렉토리 존재 여부 및 `.gitignore` 상태
  - `didim` CLI 실행 가능 여부

---

## 0.2 구현 단계

### TASK-001: Docker 컨테이너 확인 + 스키마 생성

- [x] **[TASK-001]** Docker DB 컨테이너 확인 및 스키마 생성
  - 컨테이너 기동 확인:
    ```bash
    docker ps | grep didimaistudio_mainproxy-db-1
    # STATUS: Up ... 확인
    ```
  - 미기동 시 시작:
    ```bash
    docker start didimaistudio_mainproxy-db-1
    ```
  - DB 연결 확인:
    ```bash
    export PGPASSWORD=password12
    psql -U postgres -h localhost -d didim_api -c "SELECT version();"
    # PostgreSQL 16.x 확인
    ```
  - **스키마 생성**:
    ```bash
    psql -U postgres -h localhost -d didim_api \
      -c "CREATE SCHEMA IF NOT EXISTS se_agent_management;"
    ```
  - 스키마 확인:
    ```bash
    psql -U postgres -h localhost -d didim_api -c "\dn se_agent_management"
    ```
  - 예상 소요: 5분

### TASK-002: DB 테이블 생성

- [x] **[TASK-002]** `init.sql` 작성 및 실행
  - 파일: `.didim/sql/init.sql`
  - 내용 (설계서 §5 참조):

    ```sql
    -- PoC: SE Agent Management 스키마 초기화
    -- 대상 DB: didim_api (공유 DB)
    -- 대상 스키마: se_agent_management (전용 격리)

    -- 스키마 생성 (멱등)
    CREATE SCHEMA IF NOT EXISTS se_agent_management;
    SET search_path TO se_agent_management, public;

    -- 확장 설치 (trigram 유사도 검색용 — public 스키마에 설치)
    CREATE EXTENSION IF NOT EXISTS pg_trgm;

    -- Phase 1: trigram 기반 유사도 검색 + 운영 메타데이터 저장
    CREATE TABLE IF NOT EXISTS chat_history (
        id             BIGSERIAL PRIMARY KEY,
        tenant_id      TEXT NOT NULL,       -- 사용자/환경 격리 (공유 DB 교차 오염 방지)
        project_id     TEXT NOT NULL,       -- cwd SHA-256 해시 (프로젝트 격리)
        session_id     TEXT NOT NULL,
        service_name   TEXT,                -- 운영 메타데이터: 서비스명
        environment    TEXT CHECK (environment IN ('prod', 'stg', 'dev', 'qa', 'unknown')),
        incident_type  TEXT,                -- 장애유형 (latency/error-rate/deploy-failure 등)
        ticket_id      TEXT,                -- 티켓 ID (INC-12345 등)
        prompt         TEXT NOT NULL,
        response       TEXT NOT NULL,
        created_at     TIMESTAMPTZ DEFAULT NOW()
    );

    -- 품질 피드백 이벤트 저장 (RAG 선정/채택/수정/거부)
    CREATE TABLE IF NOT EXISTS chat_history_feedback (
        id               BIGSERIAL PRIMARY KEY,
        chat_history_id  BIGINT NOT NULL REFERENCES chat_history(id) ON DELETE CASCADE,
        tenant_id        TEXT NOT NULL,
        project_id       TEXT NOT NULL,
        session_id       TEXT NOT NULL,
        feedback_type    TEXT NOT NULL CHECK (
          feedback_type IN ('selected', 'accepted', 'edited', 'rejected')
        ),
        note             TEXT,
        created_at       TIMESTAMPTZ DEFAULT NOW()
    );

    -- 장기기억 레이어: 핵심 요약/사실/운영 규칙/선호 저장
    CREATE TABLE IF NOT EXISTS memory_items (
        id                  BIGSERIAL PRIMARY KEY,
        tenant_id           TEXT NOT NULL,
        project_id          TEXT NOT NULL,
        service_name        TEXT,
        environment         TEXT CHECK (environment IN ('prod', 'stg', 'dev', 'qa', 'unknown')),
        memory_key          TEXT NOT NULL, -- 중복 방지용 정규화 키
        memory_type         TEXT NOT NULL CHECK (
          memory_type IN ('fact', 'preference', 'runbook', 'incident_postmortem')
        ),
        summary             TEXT NOT NULL, -- LLM에 바로 주입할 짧은 핵심 문장
        detail_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
        source_history_ids  BIGINT[] NOT NULL DEFAULT '{}',
        confidence          REAL NOT NULL DEFAULT 0.6 CHECK (confidence >= 0 AND confidence <= 1),
        importance          SMALLINT NOT NULL DEFAULT 3 CHECK (importance >= 1 AND importance <= 5),
        reinforcement_count INTEGER NOT NULL DEFAULT 1,
        last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at          TIMESTAMPTZ, -- 단기성 메모리 TTL
        created_at          TIMESTAMPTZ DEFAULT NOW(),
        updated_at          TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE (tenant_id, project_id, memory_key)
    );

    CREATE TABLE IF NOT EXISTS memory_feedback (
        id              BIGSERIAL PRIMARY KEY,
        memory_item_id  BIGINT NOT NULL REFERENCES memory_items(id) ON DELETE CASCADE,
        tenant_id       TEXT NOT NULL,
        project_id      TEXT NOT NULL,
        feedback_type   TEXT NOT NULL CHECK (feedback_type IN ('used', 'accepted', 'edited', 'rejected')),
        note            TEXT,
        created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    -- 격리/검색/정렬 인덱스
    CREATE INDEX IF NOT EXISTS idx_chat_history_tenant_project_created
      ON chat_history(tenant_id, project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_history_tenant_project_session
      ON chat_history(tenant_id, project_id, session_id);
    CREATE INDEX IF NOT EXISTS idx_chat_history_tenant_ticket
      ON chat_history(tenant_id, ticket_id) WHERE ticket_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_chat_history_prompt_trgm ON chat_history
        USING GIN(prompt gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_chat_feedback_history_created
      ON chat_history_feedback(chat_history_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_feedback_tenant_project_created
      ON chat_history_feedback(tenant_id, project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_items_scope_recent
      ON memory_items(tenant_id, project_id, service_name, environment, last_seen_at DESC);
    CREATE INDEX IF NOT EXISTS idx_memory_items_summary_trgm
      ON memory_items USING GIN(summary gin_trgm_ops);
    CREATE INDEX IF NOT EXISTS idx_memory_feedback_item_created
      ON memory_feedback(memory_item_id, created_at DESC);
    ```

  - 실행:
    ```bash
    psql -U postgres -h localhost -d didim_api < .didim/sql/init.sql
    ```
  - **참고**: `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`
    사용으로 재실행 시 안전 (멱등)
  - 예상 소요: 10분

### TASK-003: Hook 프로젝트 초기화

- [x] **[TASK-003]** `.didim/hooks/` 디렉토리 + package.json 생성
  - 디렉토리 생성: `mkdir -p .didim/hooks .didim/sql`
  - 파일: `.didim/hooks/package.json`

    ```json
    {
      "name": "didim-rag-hooks",
      "version": "0.1.0",
      "type": "module",
      "private": true,
      "description": "PoC: Hook 기반 채팅 이력 PostgreSQL 저장 + RAG",
      "dependencies": {
        "pg": "^8.13.0"
      }
    }
    ```

  - 의존성 설치: `cd .didim/hooks && npm install`
  - 예상 소요: 5분

### TASK-004: 폴더 신뢰 승인 확인

- [ ] **[TASK-004]** CLI 실행 + 폴더 신뢰 승인 ← ⏳ 사용자 직접 수행 필요
  - 프로젝트 디렉토리에서 `didim` CLI 실행
  - "Trust this folder?" 프롬프트 승인
  - 승인 후 확인: CLI 내에서 `/hooks` 명령 (hook 목록 표시 확인)
  - 근거: `hookRunner.ts:61-76` — untrusted 폴더에서 project source hook 차단
  - 예상 소요: 5분

### TASK-005: .gitignore 확인 및 관리 방안 결정

- [x] **[TASK-005]** `.didim/` 디렉토리 git 관리 상태 확인
  - 확인: `git check-ignore .didim/hooks/rag-after-agent.js`
  - `.gitignore`에 포함된 경우:
    - 옵션 A: PoC 산출물을 `examples/se-rag-hooks/`에 복사본 보관
    - 옵션 B: `.gitignore`에서 `.didim/hooks/*.js` 예외 추가
    - 옵션 C: 별도 repo로 분리 (장기 운영 시)
  - 결정 사항 기록
  - 예상 소요: 10분

---

## 0.3 검증

- [x] **[VERIFY-DB]** DB 연결 + pg_trgm 동작 확인

  ```bash
  psql -U postgres -h localhost -d didim_api \
    -c "SET search_path TO se_agent_management; SELECT similarity('에러율 분석', '에러율');"
  # 결과: 0.xx (0보다 큰 값이면 정상)
  ```

- [x] **[VERIFY-SCHEMA]** 스키마 + 테이블 생성 확인

  ```bash
  # 스키마 확인
  psql -U postgres -h localhost -d didim_api -c "\dn se_agent_management"

  # 테이블 4개 확인
  psql -U postgres -h localhost -d didim_api \
    -c "SET search_path TO se_agent_management; \dt"

  # 인덱스 10개 확인
  psql -U postgres -h localhost -d didim_api \
    -c "SET search_path TO se_agent_management; \di"
  ```

- [x] **[VERIFY-ISOLATION]** 기존 public 스키마 영향 없음 확인

  ```bash
  # public 스키마에 chat_history 테이블이 없음을 확인
  psql -U postgres -h localhost -d didim_api \
    -c "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'chat_history';"
  # 결과: 0 rows (public에 생성되지 않았음)
  ```

- [x] **[VERIFY-HOOKS]** npm 의존성 설치 확인

  ```bash
  ls .didim/hooks/node_modules/pg/
  ```

- [ ] **[VERIFY-TRUST]** 폴더 신뢰 상태 확인 ← ⏳ TASK-004 완료 후 수행
  ```bash
  didim
  # CLI 내에서 /hooks 명령 실행
  ```

---

## 0.4 사후 작업 (Post-Work)

- [x] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/PoC_Phase0_EnvironmentSetup_20260221.md`
  - 내용: 환경 정보, Docker 컨테이너 상태, 스키마 생성 결과, 결정 사항 (git 관리
    방안)

- [ ] **[NEXT]** Phase 1 착수 전 확인
  - DB 연결 정상 (Docker 컨테이너 Up)
  - `se_agent_management` 스키마 + 테이블 4개 + 인덱스 10개 존재
  - `.didim/hooks/node_modules/pg` 존재
  - 폴더 신뢰 승인 완료

---

## ⚠️ 주의사항

1. **공유 DB 격리**: `didim_api`는 다른 서비스와 공유하는 DB이다. 반드시
   `se_agent_management` 스키마 내에서만 작업하고, `public` 스키마에 테이블을
   생성하지 않는다.
2. **search_path 필수**: Hook 스크립트에서 DB 연결 후 반드시
   `SET search_path TO se_agent_management, public;`을 실행하거나, 연결 URL에
   `?options=-c search_path=se_agent_management,public`을 추가한다.
3. **Docker 컨테이너**: `didimaistudio_mainproxy-db-1` 컨테이너가 기동 중이어야
   한다. 미기동 시 `docker start didimaistudio_mainproxy-db-1`로 시작.
4. **pgvector 사전 설치**: Docker 이미지 `pgvector/pgvector:pg16`에 pgvector
   확장이 이미 포함되어 있다. Phase 4에서 별도 설치 없이
   `CREATE EXTENSION vector;`만 실행하면 된다.
5. **환경 변수**: `RAG_DATABASE_URL` 기본값은
   `postgresql://postgres:password12@localhost:5432/didim_api` — 커스텀 DB 주소
   사용 시 환경 변수로 오버라이드.
6. **접속 URL 형식**: Python용 `postgresql+asyncpg://...` 접두사가 아닌, Node.js
   `pg` 모듈용 `postgresql://...` 형식을 사용한다.
7. **멱등 스크립트**: init.sql은 `IF NOT EXISTS`를 사용하여 재실행 시 안전하다.

---

**작성일**: 2026-02-21 **작성자**: AI Assistant **상태**: 🟡 거의 완료 (TASK-004
폴더 신뢰만 잔여)
