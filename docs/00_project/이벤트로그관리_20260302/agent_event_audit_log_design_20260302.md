# 에이전트 이벤트 감사로그 설계서 (v1.2, 코드 검증 반영)

> 작성일: 2026-03-02  
> 대상: `gemini-cli`

---

## 1. 목표

1. Hook 기반(v1)으로 감사로그를 빠르게 도입한다.
2. 코어가 실제 제공하는 신호만 사용해 거짓 정합성을 만들지 않는다.
3. fail-open(에이전트 실행 지속), best-effort 저장, 추후 v1.5/v2 확장 경로를
   명확히 한다.
4. 로컬/DB 공통 키워드 검색과 3계층 메모리를 운영 가능한 수준으로 정의한다.

---

## 2. 코드 기준 현실 제약 (검증 완료)

### 2.1 Hook 입력 공통 필드

`HookInput`에서 보장되는 필드는 아래 5개뿐이다.

- `session_id`
- `transcript_path`
- `cwd`
- `hook_event_name`
- `timestamp`

`turn_id`, `correlation_id`, `scheduler_id`, `prompt_id`는 v1 Hook 입력에 없다.

### 2.2 Provider별 Model Hook 지원 매트릭스 (중요)

| Provider | BeforeModel/AfterModel fire | 비고                                |
| -------- | --------------------------- | ----------------------------------- |
| Gemini   | 지원                        | `providers/gemini/chat.ts`에서 fire |
| OpenAI   | 미지원                      | adapter에 hookSystem 연결 없음      |
| Claude   | 미지원                      | adapter에 hookSystem 연결 없음      |

정책:

- v1에서 `model.*` 이벤트는 **Gemini provider에서만 보장**한다.
- OpenAI/Claude에서는 `model.*`를 best-effort가 아니라 **not available**로
  표기한다.
- v1.5 과제: BaseAdapter 계층 공통 fire 도입.

### 2.3 AfterModel 청크 단위 fire

Gemini 스트리밍에서 `AfterModel`은 청크마다 fire된다.

정책:

- raw 청크 이벤트를 기본 저장하지 않는다.
- `finishReason`이 감지된 최종 청크에서만 `model.responded`를 1건 생성한다.
- 최종 청크가 없으면 `model.responded`는 생성하지 않고
  `model.response.missing_finish_reason` 경고 이벤트를 1건 생성한다.

### 2.4 Hook 환경변수 sanitization

`hookRunner`는 `sanitizeEnvironment`를 사용한다.

- GitHub Actions/`SURFACE=Github`에서는 strict 모드.
- strict 모드에서는 `ALWAYS_ALLOWED` + `DIDIM_CLI_*` + `GEMINI_CLI_*`만 통과.
- `AGENT_AUDIT_*`는 strict 모드에서 제거될 수 있다.

정책:

- Hook 런타임용 env prefix는 `DIDIM_CLI_AUDIT_*`(권장),
  `GEMINI_CLI_AUDIT_*`(호환)로 표준화.
- `AGENT_AUDIT_*`는 비엄격 환경 호환 별칭으로만 유지한다.

---

## 3. 이벤트 모델

### 3.1 공통 필드

| 필드              | 타입           | 설명                                      |
| ----------------- | -------------- | ----------------------------------------- |
| `event_id`        | UUID/TEXT      | 이벤트 고유 ID                            |
| `schema_version`  | INT            | 초기 `1`                                  |
| `event_type`      | TEXT           | 표준 타입                                 |
| `event_time_ms`   | BIGINT/INTEGER | UTC epoch ms                              |
| `event_time_iso`  | TEXT           | UTC ISO-8601 (`Z`)                        |
| `ingested_at_ms`  | BIGINT/INTEGER | 저장 시각                                 |
| `tenant_id`       | TEXT           | 사용자/팀 구분                            |
| `project_id`      | TEXT           | `sha256(realpath(cwd))`                   |
| `session_id`      | TEXT           | 세션 구분                                 |
| `hook_event_name` | TEXT           | Hook 이름                                 |
| `actor`           | TEXT           | `user/assistant/system/tool/hook`         |
| `status`          | TEXT           | `started/success/error/cancelled/skipped` |
| `severity`        | TEXT           | `debug/info/warn/error`                   |
| `tool_name`       | TEXT?          | 도구 이벤트                               |
| `model_name`      | TEXT?          | 모델 이벤트                               |
| `duration_ms`     | INT?           | 가능할 때만                               |
| `error_code`      | TEXT?          | 오류 코드                                 |
| `error_message`   | TEXT?          | 축약 오류 메시지                          |
| `payload_json`    | JSONB/TEXT     | 원문 payload                              |
| `search_text`     | TEXT           | FTS용 정규화 텍스트                       |
| `idempotency_key` | TEXT           | unique 키                                 |

### 3.2 v1 제외 필드

- `turn_id`, `correlation_id`, `scheduler_id`, `prompt_id`는 v1 필수에서 제외.
- 컬럼을 두더라도 nullable 확장 필드로만 사용.

### 3.3 시간 필드 생성 규약

불일치 방지 규칙:

```text
nowMs = Date.now()
event_time_ms = nowMs
event_time_iso = new Date(nowMs).toISOString()
```

두 값은 반드시 동일 원천 `nowMs`에서 파생한다.

---

## 4. 식별자/스코프 규약

### 4.1 tenant_id

실효값 우선순위:

1. `DIDIM_CLI_AUDIT_TENANT_ID`
2. `GEMINI_CLI_AUDIT_TENANT_ID`
3. `AGENT_AUDIT_TENANT_ID` (legacy)
4. `auditLog.tenantId`
5. 미설정 시 `default-local`

### 4.2 공유 환경 강제

실효 `sharedEnv` 우선순위:

1. `DIDIM_CLI_AUDIT_SHARED_ENV`
2. `GEMINI_CLI_AUDIT_SHARED_ENV`
3. `AGENT_AUDIT_SHARED_ENV` (legacy)
4. `auditLog.sharedEnv`
5. 기본 `false`

규칙:

- `sharedEnv=true` and tenant 미설정 => 저장 차단(에이전트는 계속 실행)
- 차단 시 `system.error` with `reason=tenant_id_required` 로컬 로그 기록

### 4.3 project_id

- `project_id = sha256(realpath(cwd))`
- 기존 RAG 훅과 동일 규칙을 강제한다.

---

## 5. Hook -> 이벤트 매핑 (v1)

| Hook                           | 생성 이벤트                                                        | 설명                               |
| ------------------------------ | ------------------------------------------------------------------ | ---------------------------------- |
| `SessionStart`                 | `session.started`                                                  | payload.source 저장                |
| `SessionEnd`                   | `session.ended`                                                    | payload.reason 저장                |
| `BeforeAgent`                  | `agent.cycle.started`                                              | 루트 cycle 신호(내부 재귀 미포착)  |
| `AfterAgent`                   | `agent.cycle.completed` / `agent.cycle.failed`                     | cycle 종료                         |
| `BeforeModel`                  | `model.requested`                                                  | Gemini provider에서만              |
| `AfterModel`                   | `model.responded` / `model.failed`                                 | Gemini provider에서만, 최종 청크만 |
| `BeforeTool`                   | `tool.validation.started`                                          | 실행 전 검증/차단/수정 단계        |
| `AfterTool`                    | `tool.exec.succeeded` / `tool.exec.failed` / `tool.exec.cancelled` | 실행 결과                          |
| `Notification(ToolPermission)` | `tool.confirm.requested`                                           | 현행 NotificationType 기준         |
| `PreCompress`                  | `context.compression.started`                                      | 완료/실패 신호 없음                |

### 5.1 매핑 주의사항

1. `BeforeTool`는 실행 시작이 아니다. `tool.exec.started`로 매핑하지 않는다.
2. `context.compression.completed/failed`는 v1에서 생성 불가(관련 Hook 없음).
3. `agent.cycle.started`는 재귀 내부 턴 경계를 완전하게 제공하지 못한다.

### 5.2 actor/status 규약

- `session.*`, `context.compression.*` -> actor=`system`
- `agent.cycle.*`, `model.*` -> actor=`assistant`
- `tool.*` -> actor=`tool`

status:

- `*.started`, `*.requested` -> `started`
- `*.completed`, `*.responded`, `*.succeeded`, `session.ended` -> `success`
- `*.failed` -> `error`
- `*.cancelled` -> `cancelled`
- 정책적으로 미생성/건너뜀 -> `skipped`

---

## 6. 저장소 스키마

## 6.1 PostgreSQL

```sql
CREATE SCHEMA IF NOT EXISTS agent_audit;

CREATE TABLE IF NOT EXISTS agent_audit.audit_events (
  event_id             UUID PRIMARY KEY,
  schema_version       INT NOT NULL DEFAULT 1,
  event_type           TEXT NOT NULL,

  event_time_ms        BIGINT NOT NULL,
  event_time_iso       TEXT NOT NULL,
  ingested_at_ms       BIGINT NOT NULL,

  tenant_id            TEXT NOT NULL,
  project_id           TEXT NOT NULL,
  session_id           TEXT NOT NULL,
  hook_event_name      TEXT NOT NULL,

  actor                TEXT NOT NULL CHECK (actor IN ('user','assistant','system','tool','hook')),
  status               TEXT NOT NULL CHECK (status IN ('started','success','error','cancelled','skipped')),
  severity             TEXT NOT NULL CHECK (severity IN ('debug','info','warn','error')),

  model_name           TEXT,
  tool_name            TEXT,
  duration_ms          INT,

  error_code           TEXT,
  error_message        TEXT,
  payload_json         JSONB NOT NULL DEFAULT '{}'::jsonb,
  search_text          TEXT NOT NULL DEFAULT '',

  -- v2 확장 필드
  turn_id              TEXT,
  correlation_id       TEXT,
  scheduler_id         TEXT,
  prompt_id            TEXT,
  call_id              TEXT,

  idempotency_key      TEXT NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_audit_events_scope_time
  ON agent_audit.audit_events (tenant_id, project_id, event_time_ms DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_session_time
  ON agent_audit.audit_events (session_id, event_time_ms DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_type_time
  ON agent_audit.audit_events (event_type, event_time_ms DESC);

CREATE INDEX IF NOT EXISTS idx_audit_events_search_fts
  ON agent_audit.audit_events USING GIN (to_tsvector('simple', search_text));
```

### 6.1.1 메모리 테이블 (PostgreSQL)

```sql
CREATE TABLE IF NOT EXISTS agent_audit.session_summaries (
  summary_id            UUID PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  project_id            TEXT NOT NULL,
  session_id            TEXT NOT NULL,
  summary_version       INT NOT NULL,
  summary_text          TEXT NOT NULL,
  source_event_from_ms  BIGINT NOT NULL,
  source_event_to_ms    BIGINT NOT NULL,
  source_event_count    INT NOT NULL,
  token_estimate        INT,
  created_at_ms         BIGINT NOT NULL,
  UNIQUE (tenant_id, project_id, session_id, summary_version)
);

CREATE TABLE IF NOT EXISTS agent_audit.memory_items (
  memory_id             UUID PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  project_id            TEXT NOT NULL,
  memory_key            TEXT NOT NULL,
  memory_type           TEXT NOT NULL CHECK (memory_type IN ('fact','runbook','preference','constraint')),
  memory_state          TEXT NOT NULL CHECK (memory_state IN ('active','orphan_candidate','retired')) DEFAULT 'active',
  summary_text          TEXT NOT NULL,
  detail_json           JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence            REAL NOT NULL DEFAULT 0.6 CHECK (confidence >= 0 AND confidence <= 1),
  reinforcement_count   INT NOT NULL DEFAULT 1,
  last_seen_at_ms       BIGINT NOT NULL,
  expires_at_ms         BIGINT,
  created_at_ms         BIGINT NOT NULL,
  updated_at_ms         BIGINT NOT NULL,
  UNIQUE (tenant_id, project_id, memory_key)
);

CREATE TABLE IF NOT EXISTS agent_audit.memory_feedback (
  feedback_id           UUID PRIMARY KEY,
  memory_id             UUID NOT NULL REFERENCES agent_audit.memory_items(memory_id) ON DELETE CASCADE,
  tenant_id             TEXT NOT NULL,
  project_id            TEXT NOT NULL,
  session_id            TEXT NOT NULL,
  feedback_type         TEXT NOT NULL CHECK (feedback_type IN ('used','accepted','edited','rejected')),
  note                  TEXT,
  created_at_ms         BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_audit.memory_derivation_jobs (
  job_id                UUID PRIMARY KEY,
  event_id              UUID NOT NULL REFERENCES agent_audit.audit_events(event_id) ON DELETE CASCADE,
  tenant_id             TEXT NOT NULL,
  project_id            TEXT NOT NULL,
  session_id            TEXT NOT NULL,
  target_layer          TEXT NOT NULL CHECK (target_layer IN ('L2_summary','L3_memory')),
  status                TEXT NOT NULL CHECK (status IN ('pending','processing','succeeded','failed','dead_letter')),
  attempt_count         INT NOT NULL DEFAULT 0,
  last_error            TEXT,
  last_attempt_at_ms    BIGINT,
  completed_at_ms       BIGINT,
  created_at_ms         BIGINT NOT NULL,
  UNIQUE (event_id, target_layer)
);

CREATE TABLE IF NOT EXISTS agent_audit.memory_event_links (
  memory_id             UUID NOT NULL REFERENCES agent_audit.memory_items(memory_id) ON DELETE CASCADE,
  event_id              UUID NOT NULL REFERENCES agent_audit.audit_events(event_id) ON DELETE CASCADE,
  linked_at_ms          BIGINT NOT NULL,
  PRIMARY KEY (memory_id, event_id)
);
```

정합성 원칙:

- L1-L3 근거 관계의 단일 소스는 `memory_event_links`.
- `source_event_ids` 같은 중복 캐시 컬럼은 두지 않는다.

## 6.2 SQLite (local-only)

기본 경로 규약:

- 항상 tenant 세그먼트를 포함한다.
- 기본: `<project>/.didim/tmp/audit-local/<tenant_id>/audit_events.sqlite`
- 실효 우선순위: `DIDIM_CLI_AUDIT_LOCAL_PATH` -> `GEMINI_CLI_AUDIT_LOCAL_PATH`
  -> `AGENT_AUDIT_LOCAL_PATH` -> `auditLog.localPath` -> 기본 경로

공유 환경(`sharedEnv=true`)에서 tenant 미설정이면 파일 생성 금지.

연결 시작 시 필수:

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
```

테이블:

```sql
CREATE TABLE IF NOT EXISTS audit_events (
  row_id               INTEGER PRIMARY KEY,
  event_id             TEXT NOT NULL UNIQUE,
  schema_version       INTEGER NOT NULL DEFAULT 1,
  event_type           TEXT NOT NULL,

  event_time_ms        INTEGER NOT NULL,
  event_time_iso       TEXT NOT NULL,
  ingested_at_ms       INTEGER NOT NULL,

  tenant_id            TEXT NOT NULL,
  project_id           TEXT NOT NULL,
  session_id           TEXT NOT NULL,
  hook_event_name      TEXT NOT NULL,

  actor                TEXT NOT NULL CHECK (actor IN ('user','assistant','system','tool','hook')),
  status               TEXT NOT NULL CHECK (status IN ('started','success','error','cancelled','skipped')),
  severity             TEXT NOT NULL CHECK (severity IN ('debug','info','warn','error')),

  model_name           TEXT,
  tool_name            TEXT,
  duration_ms          INTEGER,

  error_code           TEXT,
  error_message        TEXT,
  payload_json         TEXT NOT NULL DEFAULT '{}',
  search_text          TEXT NOT NULL DEFAULT '',

  turn_id              TEXT,
  correlation_id       TEXT,
  scheduler_id         TEXT,
  prompt_id            TEXT,
  call_id              TEXT,

  idempotency_key      TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS session_summaries (
  summary_id            TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  project_id            TEXT NOT NULL,
  session_id            TEXT NOT NULL,
  summary_version       INTEGER NOT NULL,
  summary_text          TEXT NOT NULL,
  source_event_from_ms  INTEGER NOT NULL,
  source_event_to_ms    INTEGER NOT NULL,
  source_event_count    INTEGER NOT NULL,
  token_estimate        INTEGER,
  created_at_ms         INTEGER NOT NULL,
  UNIQUE (tenant_id, project_id, session_id, summary_version)
);

CREATE TABLE IF NOT EXISTS memory_items (
  memory_id             TEXT PRIMARY KEY,
  tenant_id             TEXT NOT NULL,
  project_id            TEXT NOT NULL,
  memory_key            TEXT NOT NULL,
  memory_type           TEXT NOT NULL CHECK (memory_type IN ('fact','runbook','preference','constraint')),
  memory_state          TEXT NOT NULL CHECK (memory_state IN ('active','orphan_candidate','retired')) DEFAULT 'active',
  summary_text          TEXT NOT NULL,
  detail_json           TEXT NOT NULL DEFAULT '{}',
  confidence            REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  reinforcement_count   INTEGER NOT NULL,
  last_seen_at_ms       INTEGER NOT NULL,
  expires_at_ms         INTEGER,
  created_at_ms         INTEGER NOT NULL,
  updated_at_ms         INTEGER NOT NULL,
  UNIQUE (tenant_id, project_id, memory_key)
);

CREATE TABLE IF NOT EXISTS memory_feedback (
  feedback_id           TEXT PRIMARY KEY,
  memory_id             TEXT NOT NULL,
  tenant_id             TEXT NOT NULL,
  project_id            TEXT NOT NULL,
  session_id            TEXT NOT NULL,
  feedback_type         TEXT NOT NULL CHECK (feedback_type IN ('used','accepted','edited','rejected')),
  note                  TEXT,
  created_at_ms         INTEGER NOT NULL,
  FOREIGN KEY(memory_id) REFERENCES memory_items(memory_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memory_derivation_jobs (
  job_id                TEXT PRIMARY KEY,
  event_id              TEXT NOT NULL,
  tenant_id             TEXT NOT NULL,
  project_id            TEXT NOT NULL,
  session_id            TEXT NOT NULL,
  target_layer          TEXT NOT NULL CHECK (target_layer IN ('L2_summary','L3_memory')),
  status                TEXT NOT NULL CHECK (status IN ('pending','processing','succeeded','failed','dead_letter')),
  attempt_count         INTEGER NOT NULL DEFAULT 0,
  last_error            TEXT,
  last_attempt_at_ms    INTEGER,
  completed_at_ms       INTEGER,
  created_at_ms         INTEGER NOT NULL,
  UNIQUE (event_id, target_layer),
  FOREIGN KEY(event_id) REFERENCES audit_events(event_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memory_event_links (
  memory_id             TEXT NOT NULL,
  event_id              TEXT NOT NULL,
  linked_at_ms          INTEGER NOT NULL,
  PRIMARY KEY (memory_id, event_id),
  FOREIGN KEY(memory_id) REFERENCES memory_items(memory_id) ON DELETE CASCADE,
  FOREIGN KEY(event_id) REFERENCES audit_events(event_id) ON DELETE CASCADE
);
```

FTS5:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS audit_events_fts USING fts5(
  search_text,
  content='audit_events',
  content_rowid='row_id'
);
```

트리거는 INSERT/DELETE/UPDATE(`search_text`) 동기화를 유지한다.

---

## 7. 멱등성 규약

### 7.1 키 생성

```text
canonical = {
  session_id,
  hook_event_name,
  event_type,
  tool_name,
  model_name,
  timestamp_iso,
  event_index,
  payload_hash
}
idempotency_key = sha256(stableStringify(canonical))
```

### 7.2 stableStringify 구현 규약

- 객체 키를 재귀적으로 사전순 정렬한다.
- 배열 순서는 유지한다.
- 숫자/불리언/문자열은 원형 보존한다.

### 7.3 payload_hash 비용 제한

- `payload_json` 원문이 8KB 초과면 전체 해시 대신 `payload_summary` 해시 사용.
- `payload_summary` 규칙은 §12.2 표를 따른다.

---

## 8. 저장 모드 / 환경변수 / spool

### 8.1 환경변수 명명 규약

Hook 런타임 표준 prefix:

- `DIDIM_CLI_AUDIT_*` (권장)
- `GEMINI_CLI_AUDIT_*` (호환)
- `AGENT_AUDIT_*` (legacy, strict 환경 비권장)

### 8.2 ON/OFF

실효값 우선순위:

1. `DIDIM_CLI_AUDIT_ENABLED`
2. `GEMINI_CLI_AUDIT_ENABLED`
3. `AGENT_AUDIT_ENABLED`
4. `auditLog.enabled`
5. default `true`

### 8.3 저장 모드

실효값 우선순위:

1. `DIDIM_CLI_AUDIT_STORAGE_MODE`
2. `GEMINI_CLI_AUDIT_STORAGE_MODE`
3. `AGENT_AUDIT_STORAGE_MODE`
4. `auditLog.storageMode`
5. default `auto`

`auto`:

- 실효 `dbUrl` 존재 -> `db`
- 없으면 `local-only`

### 8.4 dbUrl

우선순위:

1. `DIDIM_CLI_AUDIT_DB_URL`
2. `GEMINI_CLI_AUDIT_DB_URL`
3. `AGENT_AUDIT_DB_URL`
4. `auditLog.dbUrl`

### 8.5 spool 동시성 제어

- spool 파일은 프로세스별 분리: `{session_id}-{pid}-{ts}.jsonl`
- append는 단일 파일 핸들로 수행
- flush는 `*.jsonl` -> `*.processing` 원자적 rename 후 처리
- 실패 시 원복(`.processing` -> `.jsonl`)하여 재시도 가능 상태 유지

---

## 9. `/settings` 연동 규약

설정 키 루트: `auditLog`

필수 키:

- `auditLog.enabled`
- `auditLog.sharedEnv`
- `auditLog.tenantId`
- `auditLog.storageMode` (`auto|db|local-only`)
- `auditLog.localPath`
- `auditLog.localRetentionDays`
- `auditLog.localMaxSizeMb`
- `auditLog.spoolDir`
- `auditLog.keywordSearch.enabled`
- `auditLog.keywordSearch.topK`
- `auditLog.memory.enabled`
- `auditLog.memory.backend` (`none|agent_audit|se_agent_management`)
- `auditLog.contextInjection.enabled`
- `auditLog.contextInjection.budgetMs`
- `auditLog.redactionLevel` (`standard|strict`)

검증:

1. `sharedEnv=true` and `tenantId` empty -> 저장 거부
2. `storageMode=db` and `dbUrl` empty -> 경고 저장 허용(실행 시 local-only 강등)
3. `contextInjection.budgetMs`: `50..2000`
4. `keywordSearch.topK`: `1..100`
5. retention/size: 1 이상 정수

민감정보:

- `auditLog.dbUrl`은 `showInDialog:false` 권장
- 비밀은 env/secret manager 사용

---

## 10. 메모리 파이프라인 (L1/L2/L3)

### 10.1 구조

1. L1: `audit_events` immutable
2. L2: `session_summaries` rolling summary
3. L3: `memory_items` + `memory_event_links`

### 10.2 비동기 파생 워커 트리거 (v1 명확화)

v1 실행 모델:

1. Hook 동기 경로: L1 저장 + derivation job enqueue까지만 수행
2. 파생 실행: **다음 Hook 호출 시 piggyback**
3. SessionStart에서 backlog를 우선 소진(제한 시간 내)

예산:

- Hook 총 예산 1~3초 내에서
- 파생 워커 budget 기본 150ms (SessionStart는 500ms)
- budget 초과 시 남은 job은 다음 이벤트로 이월

### 10.3 메모리 orphan 처리

L1 보관 삭제로 link가 0이 될 때:

1. `memory_state=orphan_candidate` 전환
2. context injection 대상에서 제외
3. 재강화(link 재생성) 시 `active` 복귀
4. 일정 기간 경과 시 `retired` 또는 삭제

---

## 11. 메모리 백엔드 선택 규약

자동 감지 제거.

실효 우선순위:

1. `DIDIM_CLI_AUDIT_MEMORY_BACKEND`
2. `GEMINI_CLI_AUDIT_MEMORY_BACKEND`
3. `AGENT_AUDIT_MEMORY_BACKEND`
4. `auditLog.memory.backend`
5. default:
   - `local-only` 모드: `agent_audit`
   - `db` 모드: `agent_audit` (명시 전환 시만 `se_agent_management`)

---

## 12. 키워드 검색 설계

### 12.1 원칙

- FTS 대상은 `search_text`만 사용 (`payload_json::text` 금지)
- redaction 이후 텍스트만 인덱싱

### 12.2 payload_summary 추출 규칙 (명시)

| Hook/Event         | payload_summary에 포함                    | 제외                    |
| ------------------ | ----------------------------------------- | ----------------------- |
| `SessionStart/End` | `source`/`reason`                         | 전체 transcript         |
| `BeforeAgent`      | prompt 길이, 해시                         | prompt 원문             |
| `AfterAgent`       | 응답 길이, stop 상태, 오류 코드           | 전체 응답 원문          |
| `BeforeTool`       | `tool_name`, 파라미터 키 목록             | 파라미터 값 원문        |
| `AfterTool`        | `tool_name`, success/error, error_message | 대용량 tool output 원문 |
| `BeforeModel`      | provider/model, 요청 토큰 추정            | 프롬프트 원문           |
| `AfterModel`       | finishReason, usage 메타, 오류 코드       | 청크 원문 텍스트        |
| `Notification`     | notification_type, 요약 message           | details 원문            |
| `PreCompress`      | trigger                                   | 압축 대상 원문          |

### 12.3 AfterModel 최종 청크 판별 규약

Gemini:

- `llm_response.candidates[*].finishReason` 존재 -> final chunk
- final chunk에서만 `model.responded` 생성
- 그 외 청크는 내부 카운터만 증가(기본 저장 없음)

선택 옵션:

- `auditLog.modelChunkDebug=true`일 때만 `model.chunk.received` 저장
  허용(개발/디버그 전용)

---

## 13. 보안/개인정보

1. payload 최소 저장
2. 민감정보 redaction 후 저장
3. `search_text` 생성 시 태그/특수문자 정규화
4. sharedEnv에서 tenant 미설정 저장 금지

---

## 14. 운영/보관/정리

### 14.1 보관 정책

- 기본 30일
- `audit_events` prune 시 L3 orphan 절차(§10.3) 선행
- `session_summaries`는 최근 N개 버전 또는 최근 30일만 유지(기본 N=20)

### 14.2 SQLite 유지보수

- 이벤트 처리 시 저비용 `PRAGMA optimize`
- 별도 maintenance 명령은 v1.5 과제(현재 존재하지 않음)

### 14.3 FTS 재생성(runbook)

redaction/search 규칙 변경 시:

1. `search_text` 재계산 배치 실행
2. PostgreSQL: UPDATE 후 REINDEX (필요 시)
3. SQLite: FTS 테이블 rebuild (`rebuild` 명령)

### 14.4 파티셔닝 가이드(PostgreSQL)

- 파티션 키는 `event_time_ms BIGINT`
- 월 경계는 UTC epoch ms로 계산해 RANGE 파티션 생성

---

## 15. 한계와 v1.5/v2 과제

1. OpenAI/Claude model hook 미지원 -> v1.5 BaseAdapter 공통 훅 fire
2. `prompt_id` 부재로 재귀 cycle 경계 제한 -> HookInput 확장 과제
3. compression completed/failed 이벤트 부재 -> 새 Hook 도입 필요
4. `turn_id/correlation_id/scheduler_id`는 v2 코어 계측에서 정식화

---

## 16. 품질 게이트

1. v1 필수 필드 null 없음
2. 멱등 저장(중복 입력 1건)
3. Hook 처리 평균 < 200ms, p95 < 800ms
4. DB/SQLite 장애 시 에이전트 지속
5. redaction 테스트 통과
6. 모드 전환(`auto/db/local-only`) 정상
7. spool 동시성(병렬 hook append/flush) 무결성 통과
8. 검색 정확성 Top-5 재현율 80%+
9. 검색 지연 p95 < 150ms (프로젝트 스코프 Top-20)
10. `memory_state=active` 메모리는 최소 1개 L1 link 보유
11. `sharedEnv=true` + tenant 누락 시 저장 차단 100%
12. `/settings` 변경 후 실효값 반영 일관성
13. Gemini 스트리밍에서 `model.responded`는 요청당 최대 1건

---

## 17. 단계별 적용 계획

### Phase 1

- L1 저장 + 멱등 + spool
- provider 매트릭스 반영(`model.*` Gemini-only)
- AfterModel final-chunk 게이트 적용
- `/settings` `auditLog.*` 스키마 반영

### Phase 2

- SQLite FK/FTS/WAL 운영 안정화
- payload_summary 추출기 구현
- 키워드 검색 API 제공

### Phase 3

- piggyback 파생 워커 + orphan 상태 전이
- L2/L3 주입 정책 적용

### Phase 4 (v1.5)

- BaseAdapter 공통 BeforeModel/AfterModel
- maintenance 명령 추가
- prompt_id HookInput 확장

### Phase 5 (v2)

- turn/correlation/scheduler 정식 이벤트 모델

---

## 18. 결론

본 개정안은 실제 코드 제약(Provider별 훅 지원, 스트리밍 청크 동작, env
sanitization)을 설계에 직접 반영했다.  
v1은 과장 없는 감사 추적을 목표로 하고, v1.5/v2에서 누락 구간을 계획적으로
메운다.
