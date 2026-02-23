# Phase 1: AfterAgent Hook — Q&A 저장

> **참고 문서**:
>
> - [poc_chat_rag_plan.md](../poc_chat_rag_plan.md) — PoC 설계서 §6.2
>   rag-after-agent.js
> - [메인 계획서](./main_todo.md)
>
> **작업 분할 규칙**: 최대 2일 이내 완료

---

## 📋 작업 개요

| 항목       | 내용                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| Phase      | Phase 1                                                                       |
| 목표       | AfterAgent Hook으로 Q&A + 운영 메타데이터 + 장기기억을 PostgreSQL에 자동 저장 |
| 영향 범위  | `.didim/hooks/rag-after-agent.js`, `.didim/settings.json`                     |
| 위험 수준  | 🟢 Low (DB INSERT만 수행, 외부 영향 없음)                                     |
| 선행 Phase | Phase 0 (DB + 프로젝트 초기화)                                                |
| 예상 소요  | 1일                                                                           |

### 핵심 목표

모든 일반 대화(슬래시 커맨드 제외)의 Q&A 쌍 + 운영 메타데이터를 PostgreSQL에
저장하고, 장기기억(memory_items)을 자동 추출/upsert한다. Phase 2의 RAG 검색을
위한 **데이터 축적 기반**을 구축한다.

---

## 🚨 핵심 리스크

| 리스크                                   | 영향    | 대응 방안                                                             | 상태 |
| ---------------------------------------- | ------- | --------------------------------------------------------------------- | ---- |
| DB 장애 시 CLI 비정상 종료               | 🔴 High | `try/catch` + `main().catch()` → exit 0 + 빈 JSON                     | ⬜   |
| 공유 DB에서 tenant 미설정 시 데이터 혼입 | 🔴 High | 비로컬 DB에서 `RAG_TENANT_ID` 미설정 시 **fail-closed** (`return {}`) | ⬜   |
| Hook spawn 별도 프로세스 → 풀링 무효     | 🟡 Low  | `pg.Client` 단일 연결 사용 (PoC), 필요 시 pgbouncer                   | ⬜   |
| 슬래시 커맨드 저장 시 노이즈             | 🟡 Low  | `prompt.trim().startsWith('/')` 필터링                                | ⬜   |
| placeholder 응답 저장 시 노이즈          | 🟡 Low  | `prompt_response === "[no response text]"` 저장 스킵                  | ⬜   |
| 대량 텍스트 저장 시 DB 부하              | 🟡 Low  | `MAX_STORE_LENGTH = 10000` 자 제한                                    | ⬜   |

---

## 1.1 사전 작업 (Pre-Work)

- [x] **[REVIEW]** Phase 0 완료 확인
  - Docker 컨테이너: `docker ps | grep didimaistudio_mainproxy-db-1` (Up 상태)
  - DB 연결:
    `PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api -c "SELECT 1;"`
  - 스키마+테이블:
    `PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api -c "SET search_path TO se_agent_management; \dt"`
  - npm: `.didim/hooks/node_modules/pg` 존재

- [x] **[CONTEXT]** AfterAgent Hook 입출력 스펙 확인
  - **입력 (stdin JSON)**:
    ```json
    {
      "session_id": "...",
      "cwd": "/path/to/project",
      "hook_event_name": "AfterAgent",
      "timestamp": "2026-02-21T...",
      "prompt": "사용자 질문",
      "prompt_response": "LLM 최종 응답"
    }
    ```
    근거: `hookEventHandler.ts:383-398` — `createBaseInput()`
  - **출력 (stdout JSON)**: `{}` (빈 JSON — 응답 수정 없음)
  - **종료 코드**: 항상 0 (비정상 시에도 CLI 정상 진행 보장)

---

## 1.2 구현 단계

### TASK-001: rag-after-agent.js 기본 구현

- [x] **[TASK-001]** AfterAgent Hook 스크립트 작성
  - 파일: `.didim/hooks/rag-after-agent.js`
  - 핵심 로직:
    1. stdin에서 hook input JSON 수신
    2. `prompt`, `prompt_response`, `session_id`, `cwd` 추출
    3. **tenant_id 결정**: `RAG_TENANT_ID` 환경변수 또는 로컬 DB 시
       `'local-default'`
       - 비로컬 DB에서 `RAG_TENANT_ID` 미설정 시 **fail-closed** (빈 JSON 반환)
    4. `cwd` → `realpath()` → SHA-256 → `project_id` 파생
    5. **DB 연결 + search_path 설정**:
       `SET search_path TO se_agent_management, public;`
    6. **운영 메타데이터 추출**: 프롬프트 태그 파싱 (`[service:...]`,
       `[env:...]`, `[incident:...]`) 또는
       `RAG_DEFAULT_SERVICE_NAME`/`RAG_DEFAULT_ENVIRONMENT` 환경변수 사용
    7. PostgreSQL INSERT (`tenant_id`, `project_id`, `session_id`,
       `service_name`, `environment`, `incident_type`, `ticket_id`, `prompt`,
       `response`) — 트랜잭션 사용
    8. **장기기억 추출**: 응답에서 memory candidate 생성 → `memory_items` UPSERT
       (중복 시 `reinforcement_count` 증가, `confidence` 보강)
    9. stdout → `{}` 반환
  - 설계서 참조: [poc_chat_rag_plan.md](../poc_chat_rag_plan.md) §6.2
  - 예상 소요: 45분

### TASK-002: 필터링 로직 구현

- [x] **[TASK-002]** 저장 대상 필터링
  - 빈 응답 스킵: `!prompt || !prompt_response || !cwd` → 빈 JSON 반환
  - placeholder 응답 스킵: `prompt_response === "[no response text]"` → 빈 JSON
    반환
  - 슬래시 커맨드 스킵: `prompt.trim().startsWith('/')` → 빈 JSON 반환
  - 텍스트 길이 제한: `Array.from(prompt).slice(0, MAX_STORE_LENGTH).join('')`
    (다국어 문자 수 기준)
  - `MAX_STORE_LENGTH = 10000` (문자 수)
  - 예상 소요: 15분

### TASK-003: 에러 핸들링 구현

- [x] **[TASK-003]** Graceful degradation 보장
  - `try/catch` in main:
    - DB 연결 실패 → `stderr` 경고 + `stdout {}` + exit 0
    - INSERT 실패 → 동일 처리
  - `main().catch()` 최상위 핸들러:
    - JSON 파싱 실패, 모듈 로드 실패 등 예상 외 오류
    - `stderr` Fatal 로그 + `stdout {}` + exit 0
  - `finally` 블록에서 `client.end()` 보장
  - 예상 소요: 15분

### TASK-004: settings.json Hook 등록

- [x] **[TASK-004]** AfterAgent Hook 설정 추가
  - 파일: `.didim/settings.json`
  - 내용:
    ```json
    {
      "hooksConfig": {
        "enabled": true
      },
      "hooks": {
        "AfterAgent": [
          {
            "hooks": [
              {
                "type": "command",
                "name": "rag-after-agent",
                "command": "node \"./.didim/hooks/rag-after-agent.js\"",
                "description": "Q&A + 운영 메타데이터 저장 + memory upsert",
                "timeout": 5000
              }
            ]
          }
        ]
      }
    }
    ```
  - **`hooksConfig.enabled: true` 필수**: Stable 채널에서는 명시적 활성화 필요
    (근거: `docs/hooks/index.md:12-20`)
  - **인용 경로**: `"node \"./.didim/hooks/...\""`로 공백 포함 경로 대응 (설계서
    §7 참조)
  - 주의: 기존 `.didim/settings.json`이 있으면 `hooksConfig` + `hooks` 섹션
    추가/병합
  - 예상 소요: 5분

---

## 1.3 검증

### 검증 1: 저장 확인

- [x] **[VERIFY-SAVE]** 일반 대화 저장 확인

  ```bash
  # CLI 실행 후 일반 대화 수행
  didim
  > [service:payments-api][env:prod] 서비스 A의 에러율이 5%를 초과했다. 원인을 분석해줘.

  # DB 확인
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api \
    -c "SET search_path TO se_agent_management; SELECT id, tenant_id, project_id, session_id, service_name, environment, LEFT(prompt, 50), created_at FROM chat_history;"
  ```
  - 기대: 1건 저장, `tenant_id` = `'local-default'` (로컬 DB), `project_id` =
    realpath(cwd) SHA-256
  - `service_name` = `'payments-api'`, `environment` = `'prod'` 확인

### 검증 2: 슬래시 커맨드 필터링

- [x] **[VERIFY-FILTER]** 슬래시 커맨드 미저장 확인

  ```bash
  didim
  > /stats
  > /model

  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api \
    -c "SET search_path TO se_agent_management; SELECT COUNT(*) FROM chat_history WHERE prompt LIKE '/%';"
  ```
  - 기대: 0건

### 검증 3: DB 장애 내성

- [x] **[VERIFY-RESILIENCE]** DB 미기동 시 CLI 정상 동작

  ```bash
  # Docker 컨테이너 중지
  docker stop didimaistudio_mainproxy-db-1

  # CLI 실행 후 대화 — CLI가 정상 응답하는지 확인
  didim
  > 테스트 질문

  # stderr에 "[rag-after-agent] DB error:" 경고 확인
  # CLI 응답은 정상 (저장만 누락)

  # 컨테이너 재시작
  docker start didimaistudio_mainproxy-db-1
  ```

### 검증 4: project_id 격리

- [x] **[VERIFY-ISOLATION]** 다른 디렉토리에서 실행 시 project_id 다름 확인

  ```bash
  # 디렉토리 A에서 대화
  cd /tmp/project-a && didim
  > 테스트 A

  # 디렉토리 B에서 대화
  cd /tmp/project-b && didim
  > 테스트 B

  # DB 확인: project_id가 다름
  PGPASSWORD=password12 psql -U postgres -h localhost -d didim_api \
    -c "SET search_path TO se_agent_management; SELECT project_id, LEFT(prompt, 20) FROM chat_history;"
  ```

---

## 1.4 사후 작업 (Post-Work)

- [x] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/PoC_Phase1_AfterAgentHook_20260221.md`
  - 내용: 구현 내용, 검증 결과, 이슈 및 해결

- [x] **[NEXT]** Phase 2 착수 전 확인
  - DB에 최소 3건 이상 대화 저장됨 (Phase 2 RAG 테스트 데이터)
  - 슬래시 커맨드 미저장 확인
  - DB 장애 시 CLI 정상 동작 확인

---

## ⚠️ 주의사항

1. **Hook 실행 순서**: AfterAgent는 LLM 응답 생성 **후** 동기 실행. 응답 지연에
   영향 없음.
2. **`prompt_response` 타입**: 문자열 (최종 완성 응답). 마크다운 포함 가능.
3. **`client.end()` 필수**: `finally` 블록에서 반드시 호출 — 미호출 시 프로세스
   hang.
4. **환경 변수**: `RAG_DATABASE_URL` 미설정 시 기본값
   `postgresql://postgres:password12@localhost:5432/didim_api` 사용.
5. **search_path 필수**: DB 연결 후
   `SET search_path TO se_agent_management, public;` 실행 필수 — 미설정 시
   `public` 스키마에 INSERT 시도하여 오류 발생.
6. **`RAG_TENANT_ID`**: 로컬 DB에서는 생략 가능 (`'local-default'` 자동 사용).
   비로컬 DB에서는 **필수** — 미설정 시 저장/조회 모두 fail-closed.
7. **트랜잭션**: chat_history INSERT + memory_items UPSERT는 단일 트랜잭션 내
   실행. 실패 시 ROLLBACK으로 부분 저장 방지.

---

**작성일**: 2026-02-21 **작성자**: AI Assistant **상태**: ✅ 완료
