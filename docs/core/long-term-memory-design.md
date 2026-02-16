# Long-Term Memory (PostgreSQL) Technical Design

## 1. 문제 정의

운영관리(SE) 업무에서는 과거 작업 이력(장애 대응, 변경 수행, 실패/재시도, 도구
실행 결과)을 재검색해 현재 작업 의사결정에 반영해야 한다.

현재 저장소의 기본 기능은 세션 재개에는 충분하지만, 중앙 검색 가능한 장기
메모리로 쓰기에는 제한이 있다.

- 기록 저장이 로컬 파일 중심
- 질의형 검색 API 부재
- 장기 보존/거버넌스 정책을 중앙에서 통제하기 어려움

## 2. 요구사항

### 기능 요구사항

1. 모든 세션/메시지/도구 실행 기록을 중앙 저장소(PostgreSQL)에 저장
2. 질의 시 과거 이력을 검색해 현재 턴 컨텍스트에 주입
3. 프로젝트/세션/기간/태그 단위 검색 및 감사 가능
4. 기존 로컬 세션 파일을 DB로 백필 가능

### 비기능 요구사항

1. 적재는 idempotent 해야 함
2. 검색 지연 p95 300ms 이내(일반 필터 조건)
3. DB 장애 시 CLI 본작업은 계속 진행(강건성 우선)
4. 민감정보 마스킹/삭제정책/접근통제 제공

## 3. 적용 전략

## 3.1 Phase A: Hook 기반(빠른 배포)

- `SessionEnd` 훅: `transcript_path` JSON를 파싱해 PostgreSQL upsert
- `BeforeAgent` 훅: 사용자 prompt + 메타데이터로 검색 후 `additionalContext`
  주입
- `AfterTool` 훅(옵션): `run_shell_command`, `web_fetch`, MCP 도구 결과를 별도
  이벤트로 저장

장점:

- 코어 대규모 변경 없이 빠르게 검증 가능

## 3.2 Phase B: Core 내장(정식)

- 코어 서비스로 적재/검색 로직 통합
- 설정/정책/관측성/테스트를 단일 경로로 표준화

## 4. 데이터 모델 (PostgreSQL + pgvector)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ltm_sessions (
  session_id        text PRIMARY KEY,
  project_hash      text NOT NULL,
  workspace_root    text,
  started_at        timestamptz NOT NULL,
  ended_at          timestamptz,
  summary           text,
  source            text NOT NULL DEFAULT 'gemini-cli',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ltm_messages (
  message_id        text PRIMARY KEY,
  session_id        text NOT NULL REFERENCES ltm_sessions(session_id) ON DELETE CASCADE,
  role              text NOT NULL, -- user|gemini|info|error|warning
  ts                timestamptz NOT NULL,
  content_text      text,
  content_json      jsonb NOT NULL,
  token_input       integer,
  token_output      integer,
  token_total       integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ltm_tool_calls (
  tool_call_id      text PRIMARY KEY,
  session_id        text NOT NULL REFERENCES ltm_sessions(session_id) ON DELETE CASCADE,
  message_id        text REFERENCES ltm_messages(message_id) ON DELETE SET NULL,
  tool_name         text NOT NULL,
  status            text NOT NULL, -- success|error|blocked
  args_json         jsonb,
  result_json       jsonb,
  ts                timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ltm_chunks (
  chunk_id          bigserial PRIMARY KEY,
  session_id        text NOT NULL REFERENCES ltm_sessions(session_id) ON DELETE CASCADE,
  message_id        text REFERENCES ltm_messages(message_id) ON DELETE SET NULL,
  chunk_text        text NOT NULL,
  embedding         vector(1536),
  metadata          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ts                timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ltm_sessions_project_started
  ON ltm_sessions(project_hash, started_at DESC);
CREATE INDEX idx_ltm_messages_session_ts
  ON ltm_messages(session_id, ts);
CREATE INDEX idx_ltm_tool_calls_session_ts
  ON ltm_tool_calls(session_id, ts);
CREATE INDEX idx_ltm_chunks_session_ts
  ON ltm_chunks(session_id, ts DESC);
CREATE INDEX idx_ltm_chunks_metadata_gin
  ON ltm_chunks USING gin (metadata);
-- pgvector index (HNSW/IVFFlat는 데이터량과 버전에 맞춰 선택)
```

## 5. 수집(Write Path) 설계

입력 소스:

- 세션 transcript: `ChatRecordingService` 출력 JSON
- activity log: `session-<id>.jsonl` (debug mode)
- hook payload: `BeforeTool/AfterTool/SessionEnd` 입력/출력

파이프라인:

1. Parse
2. PII redaction (정규식 + allowlist)
3. Normalize (session/message/tool event 스키마화)
4. Upsert
5. (옵션) chunking + embedding 생성

장애 대응:

- DB 쓰기 실패 시 `.didim/tmp/<project_hash>/ltm-spool/*.jsonl`에 적재
- 백그라운드 재전송 워커가 exponential backoff로 재시도

## 6. 검색(Read Path) 설계

트리거:

- `BeforeAgent`에서 실행 (요청마다 또는 정책 기반 샘플링)

절차:

1. 질의 정규화
2. metadata pre-filter (project_hash, recent window, tool/domain tag)
3. hybrid 검색

- keyword (tsvector/BM25 유사)
- vector (pgvector cosine/L2)

4. 재랭킹 + 중복 제거
5. 토큰 예산 내 요약
6. `additionalContext`로 삽입

주입 예시 포맷:

- “Relevant Past Incidents”
- “Previously Successful Commands”
- “Known Failure Patterns”

## 7. 보안 및 거버넌스

1. 저장 전 마스킹

- API key, token, password, cookie, authorization header

2. 접근 통제

- DB role 분리: writer / reader / admin
- 운영자 조회는 read-only role 사용

3. 보존 정책

- raw event: 30~90일
- summary/chunk: 180~365일
- 법/정책 요구 시 project별 예외 정책

4. 삭제권 대응

- session_id/project_hash 기준 hard delete + vacuum 운영 절차

## 8. 코드 변경 설계 (정식 통합 기준)

1. 설정

- `packages/cli/src/config/settingsSchema.ts`
  - `longTermMemory.enabled`
  - `longTermMemory.provider` (`postgres`)
  - `longTermMemory.connectionStringEnv`
  - `longTermMemory.retrieval.topK`
  - `longTermMemory.retrieval.maxContextTokens`
  - `longTermMemory.redaction.enabled`

2. 코어 서비스

- 신규:
  - `packages/core/src/services/historyStore.ts`
  - `packages/core/src/services/postgresHistoryStore.ts`
  - `packages/core/src/services/longTermMemoryService.ts`
- 연동:
  - `packages/core/src/hooks/hookEventHandler.ts` (Phase A/B 공통 진입점)
  - `packages/core/src/core/client.ts` (선택: core-native pre-agent retrieval)

3. 문서

- `docs/get-started/configuration.md` 설정 추가
- `docs/hooks/writing-hooks.md`에 LTM 예시 추가

## 9. 테스트 전략

1. 단위 테스트

- 스키마 매핑, redaction, ranking/scoring, context budget trimming

2. 통합 테스트

- PostgreSQL testcontainer 기반 ingest/retrieve 검증
- DB down 시 spool fallback 검증

3. 회귀 테스트

- LTM off일 때 기존 동작 불변성 확인
- 토큰 비용 증가 상한 검증

## 10. 운영 지표

필수 메트릭:

- `ltm_ingest_success_rate`
- `ltm_ingest_lag_seconds`
- `ltm_retrieval_latency_ms` (p50/p95/p99)
- `ltm_context_hit_rate`
- `ltm_spool_queue_depth`

알람 예시:

- ingest success < 99%
- retrieval p95 > 500ms (5m 지속)
- spool depth 급증

## 11. 마이그레이션 계획

1. DDL 적용 + 권한 세팅
2. 백필 도구로 기존 `chats/*.json` 적재
3. Hook 기반 read path on
4. 운영 안정화 후 core-native로 전환

## 12. 오픈 이슈

1. 임베딩 모델 표준(차원, 비용, 지연)
2. multi-tenant 분리 방식(project_hash vs tenant_id)
3. 요약 생성 위치(클라이언트/서버/비동기 배치)
4. compliance에 따른 지역/암호화 키 정책
