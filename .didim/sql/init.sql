-- PoC: SE Agent Management 스키마 초기화
-- 대상 DB: didim_api (공유 DB)
-- 대상 스키마: se_agent_management (전용 격리)
-- 실행: PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api < .didim/sql/init.sql

-- 스키마 생성 (멱등)
CREATE SCHEMA IF NOT EXISTS se_agent_management;
SET search_path TO se_agent_management, public;

-- 확장 설치 (trigram 유사도 검색용 — se_agent_management 스키마에 설치)
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
