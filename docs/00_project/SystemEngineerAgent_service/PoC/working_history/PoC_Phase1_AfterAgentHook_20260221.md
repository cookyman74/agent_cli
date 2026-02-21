# Phase 1 작업 결과서: AfterAgent Hook — Q&A 저장

> **작업일**: 2026-02-21 **Phase**: Phase 1 — AfterAgent Hook **브랜치**:
> `v0.2.0/se_manager_agent` **상태**: ✅ 완료

---

## 1. 작업 범위

| 항목   | 내용                                                                 |
| ------ | -------------------------------------------------------------------- |
| 목표   | AfterAgent Hook으로 Q&A + 운영 메타데이터 + 장기기억 PostgreSQL 저장 |
| 산출물 | `.didim/hooks/rag-after-agent.js`, `.didim/settings.json`            |
| 설계서 | poc_chat_rag_plan.md §6.2                                            |
| DB     | `didim_api.se_agent_management` (Phase 0에서 생성)                   |

---

## 2. 구현 내용

### TASK-001: rag-after-agent.js 기본 구현

- 설계서 §6.2 코드를 기반으로 작성
- **설계서 대비 변경점**:
  - `DB_URL` 기본값: `postgresql://localhost:5432/se_rag` →
    `postgresql://localhost:5432/didim_api` (비밀번호 제거, 환경변수로 전달)
  - 모든 SQL에 `se_agent_management.` 스키마 한정 사용 (search_path 의존 제거)
  - chat_history INSERT와 memory UPSERT를 트랜잭션에서 분리 (memory는
    best-effort)
  - `isLocalDatabase()` Docker 호스트명 지원 확장
  - `QUERY_TIMEOUT_MS` 2500→1500 (hook 5s 예산 내 수용)
  - `SET statement_timeout` 추가 (서버 측 쿼리 타임아웃)
  - `safeInt()` 헬퍼로 NaN 전파 방어
  - `stripMarkdownPrefix()` + 짧은 라인 스킵으로 summary 품질 향상
  - Memory key hash에 summary 전체 사용 (120자 truncation 제거)
  - ON CONFLICT 시 더 긴 summary 유지 (`CASE WHEN length(...)`)
  - `deriveProjectId`/`createClient`를 try 블록 안으로 이동
- 핵심 로직:
  1. stdin JSON 수신 → prompt/prompt_response/session_id/cwd 추출
  2. tenant_id 결정 (로컬 DB: `local-default`, 비로컬: `RAG_TENANT_ID` 필수)
  3. cwd → realpath → SHA-256 → project_id
  4. 운영 메타데이터 태그 파싱 (`[service:...]`, `[env:...]`, `[incident:...]`)
  5. chat_history INSERT (autocommit) + memory_items UPSERT (best-effort)
  6. stdout `{}` 반환

### TASK-002: 필터링 로직

- `!prompt || !prompt_response || !cwd` → 빈 JSON
- `prompt_response === '[no response text]'` → 빈 JSON
- `prompt.trim().startsWith('/')` → 빈 JSON (슬래시 커맨드)
- `MAX_STORE_LENGTH = 10000` (다국어 문자 수 기준)

### TASK-003: 에러 핸들링

- `try/catch` in main: DB 장애 → stderr 경고 + `{}` 반환
- `main().catch()`: 최상위 Fatal 핸들러 → stderr + `{}` + exit 0
- `finally`: `client.end()` 보장

### TASK-004: settings.json

- `hooksConfig.enabled: true` 명시
- AfterAgent hook 등록 (timeout: 5000ms)
- 인용 경로: `"node \"./.didim/hooks/rag-after-agent.js\""`

---

## 3. 검증 결과

검증은 stdin 파이프로 직접 실행 (CLI 없이 단독 테스트).

| 검증 항목                   | 결과    | 상세                                                    |
| --------------------------- | ------- | ------------------------------------------------------- |
| VERIFY-SAVE (일반 대화)     | ✅ Pass | 1건 저장, tenant_id=local-default, service=payments-api |
| Memory UPSERT               | ✅ Pass | fact 타입, confidence=0.65, source_history_ids={1}      |
| VERIFY-FILTER (슬래시)      | ✅ Pass | `/stats` 미저장, 0건                                    |
| placeholder 필터링          | ✅ Pass | `[no response text]` 미저장                             |
| VERIFY-RESILIENCE (DB 장애) | ✅ Pass | 잘못된 DB URL → stderr 경고 + exit 0 + `{}`             |
| VERIFY-ISOLATION (project)  | ✅ Pass | 3개 디렉토리 → 각각 다른 project_id 해시                |
| 빈 입력 필터링              | ✅ Pass | 빈 prompt 미저장                                        |
| Memory reinforcement        | ✅ Pass | count 1→2, confidence 0.65→0.70, ids {1}→{4,1}          |
| fail-closed (비로컬 tenant) | ✅ Pass | RAG_TENANT_ID 미설정 → 저장 거부 + stderr 경고          |

### DB 상태 (검증 후)

```
chat_history: 4건 (테스트 데이터)
memory_items: 1건 (reinforcement_count=2)
```

---

## 4. 이슈 및 해결

### 1차 코드 리뷰 반영 (5건)

| #   | 심각도 | 이슈                                                                            | 수정 내용                                                                           | 상태 |
| --- | ------ | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---- |
| 1   | HIGH   | chat_history INSERT + memory UPSERT가 단일 트랜잭션 → memory 실패 시 Q&A도 롤백 | BEGIN/COMMIT 제거, chat_history는 autocommit, memory는 별도 try/catch (best-effort) | ✅   |
| 2   | HIGH   | 설계서에 `se_rag` DB 참조 5건 잔존 → Phase 간 검증 불일치                       | `poc_chat_rag_plan.md`의 5건을 `didim_api` + `se_agent_management`로 수정           | ✅   |
| 3   | MEDIUM | `SET search_path` + 비한정 테이블명 → 스키마 오염 위험                          | search_path 제거, 모든 SQL에 `se_agent_management.` 스키마 한정 사용                | ✅   |
| 4   | MEDIUM | settings.json 전체 대체 → 기존 설정 손실 가능                                   | 설계서 §7에 병합 주의사항 추가, 본 프로젝트는 신규 생성이므로 손실 없음             | ✅   |
| 5   | LOW    | 로컬 판별 로직이 Docker 환경에서 false fail-closed                              | `isLocalDatabase()`에 `0.0.0.0`, `host.docker.internal`, `.local` 추가              | ✅   |

### 2차 코드 리뷰 반영 (HIGH 2건 + MEDIUM 6건)

| #   | 심각도 | 이슈                                                                  | 수정 내용                                                                  | 상태 |
| --- | ------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---- |
| H-1 | HIGH   | 타임아웃 예산 초과 (connect 1500 + query 2500×2 = 6500 > hook 5000ms) | `QUERY_TIMEOUT_MS` 2500→1500 (예산: 1500+1500×2=4500 < 5000)               | ✅   |
| H-2 | HIGH   | 환경변수 `NaN` 전파 → `MEMORY_MIN_SUMMARY_LEN` 검증 무력화            | `safeInt()` 헬퍼 추가 (`Number.isFinite` + `Math.trunc` + fallback)        | ✅   |
| M-1 | MEDIUM | Memory key 120자 truncation → 다른 memory가 동일 key로 충돌           | truncation 제거, `normalizeText(summary)` 전체를 hash input에 포함         | ✅   |
| M-2 | MEDIUM | `firstLine` 추출이 마크다운 헤더/코드블록을 캡처                      | `stripMarkdownPrefix()` 추가 + 짧은 라인 스킵 (≥ `MEMORY_MIN_SUMMARY_LEN`) | ✅   |
| M-3 | MEDIUM | `ON CONFLICT` 시 summary 무조건 덮어쓰기 → 상세 summary 손실          | `CASE WHEN length(EXCLUDED) > length(existing)` → 더 긴 summary 유지       | ✅   |
| M-4 | MEDIUM | `createClient()`/`deriveProjectId()` 가 try 밖 → 에러 분류 부정확     | `let client` + try 블록 안으로 이동, `if (client)` 가드 추가               | ✅   |
| M-5 | MEDIUM | `query_timeout` 클라이언트 측만 → 서버 쿼리 무기한 실행 가능          | `SET statement_timeout = '1500'` 추가 (서버 측 제한)                       | ✅   |
| M-6 | MEDIUM | DB 비밀번호 `password12` 소스 코드 하드코딩                           | 기본값에서 비밀번호 제거 → `RAG_DATABASE_URL` 환경변수로만 전달            | ✅   |

### 2차 리뷰 재검증

| 검증 항목            | 결과    | 상세                                                                   |
| -------------------- | ------- | ---------------------------------------------------------------------- |
| VERIFY-SAVE          | ✅ Pass | 1건 저장, service=payments-api, env=prod                               |
| Memory UPSERT        | ✅ Pass | fact, confidence=0.65                                                  |
| VERIFY-FILTER        | ✅ Pass | `/stats` 미저장                                                        |
| VERIFY-RESILIENCE    | ✅ Pass | 잘못된 DB → stderr + `{}` + exit 0                                     |
| Memory reinforcement | ✅ Pass | count 1→2, confidence 0.65→0.70                                        |
| fail-closed          | ✅ Pass | 비로컬 DB + tenant 미설정 → 거부                                       |
| M-4 invalid cwd      | ✅ Pass | 존재하지 않는 경로 → "DB error: ENOENT" (not Fatal)                    |
| M-2 markdown strip   | ✅ Pass | `## 분석 결과` 스킵 → 본문 라인 summary 저장                           |
| M-1 key collision    | ✅ Pass | 120자 prefix 동일 + suffix 상이 → 다른 key 생성                        |
| H-2 NaN 방어         | ✅ Pass | `RAG_MEMORY_MIN_SUMMARY_LEN=abc` → fallback 20 적용, 짧은 summary 거부 |

---

## 5. 산출물

| 파일                              | 상태                                      |
| --------------------------------- | ----------------------------------------- |
| `.didim/hooks/rag-after-agent.js` | ✅ 생성+수정                              |
| `.didim/settings.json`            | ✅ 생성                                   |
| `poc_chat_rag_plan.md`            | ✅ 수정 (se_rag→didim_api, 병합 주의사항) |
| Phase 1 todolist 상태 업데이트    | ✅ 완료                                   |
| 본 작업 결과서                    | ✅ 작성+갱신                              |

---

## 6. Phase 2 착수 전 확인

- [x] DB에 4건 대화 저장됨 (Phase 2 RAG 테스트 데이터 충분)
- [x] 슬래시 커맨드 미저장 확인
- [x] DB 장애 시 CLI 정상 동작 확인 (graceful degradation)
- [x] Memory upsert + reinforcement 정상 동작

---

**작성일**: 2026-02-21 **작성자**: AI Assistant
