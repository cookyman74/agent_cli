# PoC: Hook 기반 채팅 이력 PostgreSQL 저장 + RAG — 단계별 작업 계획서 (Main)

> **작업 성격**: PoC (Proof of Concept) — 코어 코드 수정 0줄, Hook 스크립트 +
> 설정 만으로 구현
>
> **별도 관리 사유**: 본 Hook 기능은 프로젝트 기본 기능이 아닌 **SE Workflow
> 검증용 확장**이므로, `.didim/hooks/` 디렉토리에서 독립 관리한다. 메인 프로젝트
> 빌드/테스트 파이프라인에 포함되지 않는다.
>
> **참고 문서**:
>
> - [poc_chat_rag_plan.md](../poc_chat_rag_plan.md) — PoC 설계서 (아키텍처,
>   스키마, 스크립트, 검증 시나리오)
> - [se_workflow.md](../../se_workflow.md) — SE Workflow 전체 설계
>
> **작업 분할 규칙 (필수)**:
>
> - 각 작업 단계(Phase)는 **최대 2일 이내** 완료 가능한 범위로 정의
> - 2일 초과 예상 시 **하위 Phase로 분할** 후 진행
> - 각 Phase는 독립적으로 **구현 + 검증 + 결과서**를 완료해야 함

---

## 📋 작업 개요

| 항목        | 내용                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------- |
| 프로젝트    | SE Workflow PoC — Hook 기반 채팅 이력 PostgreSQL 저장 + RAG 응답                         |
| 영향 범위   | `.didim/hooks/` (프로젝트 외부), PostgreSQL DB (`didim_api.se_agent_management`)         |
| 위험 수준   | 🟢 Low (코어 코드 무변경, Hook 스크립트 독립 실행)                                       |
| 성능 민감도 | 🟡 Medium (Hook timeout 5초 이내 처리 필수)                                              |
| 참고 설계서 | [poc_chat_rag_plan.md](../poc_chat_rag_plan.md)                                          |
| 관리 방식   | 메인 프로젝트와 **별도 관리** — `.didim/hooks/`는 gitignore 대상, 필요 시 별도 repo 분리 |
| DB 인프라   | Docker `didimaistudio_mainproxy-db-1` (`pgvector/pgvector:pg16`) — 기존 컨테이너 활용    |
| DB/스키마   | `didim_api` (기존 공유 DB) / `se_agent_management` (신규 전용 스키마)                    |
| 접속 URL    | `postgresql://postgres:password12@localhost:5432/didim_api`                              |

---

## 🧩 작업 단계 분할 계획 (2일 규칙)

| Phase ID | 목표/범위                                      | 예상 소요(일) | 분할 필요 여부 | 선행 Phase | 산출물(상세 문서)                               |
| -------- | ---------------------------------------------- | ------------- | -------------- | ---------- | ----------------------------------------------- |
| P0       | Docker DB 확인 + 스키마 생성 + 프로젝트 초기화 | 0.5           | N              | -          | [Phase0](./phase0_environment_setup.md) ✅      |
| P1       | AfterAgent Hook — Q&A 저장                     | 1             | N              | P0         | [Phase1](./phase1_after_agent_hook.md) ✅       |
| P2       | BeforeAgent Hook — RAG 검색 + 컨텍스트 주입    | 1~1.5         | N              | P1         | [Phase2](./phase2_before_agent_hook.md) ✅      |
| P3       | 통합 검증 + 최적화 + 문서화                    | 0.5~1         | N              | P2         | [Phase3](./phase3_integration_validation.md) ✅ |
| P4       | pgvector 의미 기반 검색 전환 (선택)            | 2~3           | Y (기능별)     | **P3**     | [Phase4](./phase4_pgvector_semantic_search.md)  |

### 분할 기준 가이드

1. 각 Phase는 독립적으로 동작 검증이 가능한 단위로 분할한다.
2. P0+P1만 완료해도 **Q&A 저장 기능이 동작**한다.
3. P0+P1+P2 완료 시 **기본 RAG 기능이 완전히 동작**한다 (MVP).
4. P3은 전체 시나리오 검증 및 엣지 케이스 확인.
5. P4는 검색 품질 향상을 위한 선택 확장 — PoC 결과에 따라 진행 여부 결정.

---

## 🚨 핵심 리스크 요약

| 리스크                                         | 영향      | 대응 방안                                                                                             | Phase |
| ---------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------- | ----- |
| 공유 DB에서 tenant 미설정 시 데이터 혼입       | 🔴 High   | `tenant_id` 컬럼 + 비로컬 DB에서 `RAG_TENANT_ID` 미설정 시 **fail-closed** (`return {}`)              | P1,P2 |
| 공유 DB 스키마/테이블 이름 충돌                | 🟠 Medium | 전용 스키마 `se_agent_management` 격리, Hook에서 `search_path` 필수 설정                              | P0    |
| Docker 컨테이너 미기동 시 DB 접속 불가         | 🟠 Medium | `docker ps` 확인 → `docker start didimaistudio_mainproxy-db-1`                                        | P0    |
| `similarity()` 함수만 사용 시 full scan        | 🔴 High   | `WHERE prompt % $1` (GIN 인덱스 친화 pre-filter) 필수 — `similarity() > N`은 full scan + timeout 위험 | P2    |
| Stable 채널에서 hook 미활성화                  | 🔴 High   | `hooksConfig.enabled: true` 명시 필수 (`docs/hooks/index.md:12-20`)                                   | P1    |
| Hook timeout (5초) 초과                        | 🟠 Medium | `connectionTimeoutMillis`/`query_timeout` 분리, `%` 연산자 인덱스 활용, 필요 시 pgbouncer             | P2    |
| 한국어 검색 품질 한계 (trigram)                | 🟡 Low    | pg_trgm 3-gram 기반 부분 매칭 사용, Phase 4에서 임베딩 전환 가능                                      | P2    |
| Hook 실행 모델: 동기 실행 + 매 호출 별도 spawn | 🟠 Medium | 프로세스 내 커넥션 풀링 효과 없음 → pgbouncer 외부 풀러 권장                                          | P1,P2 |
| Untrusted 폴더에서 hook 미실행                 | 🔴 High   | 폴더 신뢰 승인 절차를 P0에서 확인 필수 (`hookRunner.ts:61-76`)                                        | P0    |
| DB 장애 시 CLI 비정상 종료                     | 🟠 Medium | 모든 스크립트에 `main().catch()` + `try/catch` → exit 0 + 빈 JSON 보장                                | P1,P2 |
| 프롬프트 인젝션 (RAG 텍스트가 LLM 지시문 오인) | 🟡 Medium | `<hook_context>` 태그 + `<`/`>` 이스케이프 (CLI 내장) + 역할 구분자 명시                              | P2    |
| 프로젝트 간 데이터 교차 참조                   | 🔴 High   | `tenant_id + project_id`로 이중 격리, `session_id`로 현재 세션 제외                                   | P1,P2 |
| `.didim/hooks/` git 관리 범위                  | 🟡 Low    | `.gitignore`에 포함되어 있을 수 있음 → 별도 repo 또는 수동 배포 방식 결정 필요                        | P0    |

---

## 📊 산출물 매트릭스

| 산출물                              | P0  | P1  | P2  | P3  | P4  | 유형        |
| ----------------------------------- | --- | --- | --- | --- | --- | ----------- |
| `.didim/sql/init.sql`               | ✅  |     |     |     | ✅  | DB 스키마   |
| `.didim/hooks/package.json`         | ✅  |     |     |     |     | 설정        |
| `.didim/hooks/rag-after-agent.js`   |     | ✅  |     |     |     | 스크립트    |
| `.didim/hooks/rag-before-agent.js`  |     |     | ✅  |     |     | 스크립트    |
| `.didim/hooks/rag-feedback.js`      |     |     | ✅  |     |     | 스크립트    |
| `.didim/settings.json` (hooks 섹션) |     | ✅  | ✅  |     |     | 설정        |
| 통합 검증 결과서                    |     |     |     | ✅  |     | 문서        |
| 각 Phase 작업 결과서                | ✅  | ✅  | ✅  | ✅  | ✅  | 문서        |
| **배포 산출물 (PoC 성공 후, 선택)** |     |     |     |     |     |             |
| `examples/hooks/*.js` + `sql/`      |     |     |     | 📌  |     | 배포 예시   |
| `examples/install.sh`               |     |     |     | 📌  |     | 설치 자동화 |
| `examples/settings.example.json`    |     |     |     | 📌  |     | 설정 템플릿 |
| `examples/README.md`                |     |     |     | 📌  |     | 설치 가이드 |

> 📌 = PoC 성공 후 선택 산출물 (P3 완료 판정 후 배포 방안 확정 시 작성)

---

## 📅 예상 일정

| Phase     | 예상 소요 | 시작일 | 완료일 | 비고                                         |
| --------- | --------- | ------ | ------ | -------------------------------------------- |
| Phase 0   | 0.5일     | -      | -      | Docker DB 확인, 스키마 생성, 프로젝트 초기화 |
| Phase 1   | 1일       | -      | -      | AfterAgent 저장 Hook 구현 + 검증             |
| Phase 2   | 1~1.5일   | -      | -      | BeforeAgent RAG Hook 구현 + 검증             |
| Phase 3   | 0.5~1일   | -      | -      | 전체 시나리오 8건 통합 검증 + DoD 16항목     |
| Phase 4   | 2~3일     | -      | -      | (선택) pgvector 의미 검색 전환               |
| **Total** | **3~4일** | -      | -      | P0~P3 MVP 완료 기준, P4 제외                 |

---

## 📊 Phase 완료 조건

| Phase   | 기간(<=2일) | 구현 | 검증 | 결과서 | 상태 |
| ------- | ----------- | ---- | ---- | ------ | ---- |
| Phase 0 | ✅          | ✅   | ✅   | ✅     | ✅   |
| Phase 1 | ✅          | ✅   | ✅   | ✅     | ✅   |
| Phase 2 | ✅          | ✅   | ✅   | ✅     | ✅   |
| Phase 3 | ✅          | ✅   | ✅   | ✅     | ✅   |
| Phase 4 | ⬜          | ⬜   | ⬜   | ⬜     | ⬜   |

---

## 🔄 구현 순서 및 최소 가치 단위

```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → (선택) Phase 4
   │         │          │          │                │
   │         │          │          ├─ 전체 시나리오 검증 완료
   │         │          │          └─ (선택) 배포 산출물 작성 ─→ examples/ + install.sh
   │         │          └─ 🎯 MVP: RAG 검색 + 컨텍스트 주입 동작
   │         └─ Q&A 자동 저장 동작 (RAG 없이 단독 가치)
   └─ DB + 프로젝트 구조 준비
```

**최소 가치 단위**: Phase 0 + Phase 1 완료 시 **모든 대화가 PostgreSQL에 자동
저장**된다. Phase 2 추가 완료 시 **과거 대화 기반 RAG 응답**이 동작한다. Phase 3
검증 통과 후 **배포 방안을 확정**하여 다른 개발자에게 공유한다.

---

## 🔧 별도 관리 가이드

### Hook 프로젝트 구조

본 PoC의 산출물은 메인 프로젝트(`gemini-cli`)와 분리 관리된다:

```
.didim/
├─ settings.json              # hook 등록 (프로젝트별 설정)
├─ hooks/
│  ├─ package.json            # hook 전용 의존성 (pg)
│  ├─ node_modules/           # npm install 결과
│  ├─ rag-before-agent.js     # RAG 검색 Hook
│  └─ rag-after-agent.js      # Q&A 저장 Hook
└─ sql/
   └─ init.sql                # DB 스키마
```

### 배포/공유 방안 (PoC 성공 후 선택)

> **전제**: `.didim/hooks/`는 `.gitignore` 대상이며 `package.json`의 `files`
> 필드 (`["bundle/", "README.md"]`)에도 포함되지 않으므로, npm 배포 패키지에는
> **Hook 관련 코드가 일절 포함되지 않는다**. PoC 성공 후 아래 방안 중 하나를
> 선택하여 배포한다.

| 방안                                    | 장점                                                       | 단점                                    | 권장 상황           | 설치 난이도 |
| --------------------------------------- | ---------------------------------------------------------- | --------------------------------------- | ------------------- | ----------- |
| **A. 별도 npm 패키지**                  | 독립 버전 관리, `npm install` 한 줄 설치, 의존성 자동 관리 | npm registry 운영 필요, 별도 CI/CD 구성 | 프로덕션 배포       | ⭐ 쉬움     |
| **B. 별도 Git repo**                    | 독립 버전 관리, 다른 프로젝트에도 적용 가능                | repo 관리 부담, 수동 clone + install    | 장기 운영 시        | 보통        |
| **C. setup 스크립트 + examples/**       | npm 패키지 설치 후 `npx didim-hooks-setup`으로 간편 설정   | 별도 스크립트 유지                      | **PoC 공유 (권장)** | ⭐ 쉬움     |
| **D. 프로젝트 내 `examples/` 디렉토리** | 문서/예시로 함께 배포, git 추적 가능                       | 수동 복사 필요, .gitignore 충돌 가능    | 개발자 참고용       | 보통        |
| **E. 수동 복사**                        | 가장 단순, 즉시 적용                                       | 버전 추적 불가, 업데이트 수동           | 개인 실험 시        | 쉬움        |

#### 권장 전략

- **PoC 단계**: 방안 **C** (setup 스크립트) — 최소 노력으로 다른 개발자에게 공유
  가능
- **프로덕션 전환 시**: 방안 **A** (별도 npm 패키지)로 전환 —
  `@didim365/agent-hooks-rag`

#### 방안 C 구현 개요 (PoC 권장)

```
examples/
├─ hooks/
│  ├─ rag-before-agent.js     # BeforeAgent Hook 예시
│  ├─ rag-after-agent.js      # AfterAgent Hook 예시
│  └─ rag-feedback.js         # 피드백 기록 예시
├─ sql/
│  └─ init.sql                # DB 스키마
├─ settings.example.json      # hook 설정 예시
├─ install.sh                 # 설치 스크립트
└─ README.md                  # 설치/설정 가이드
```

**`install.sh` 핵심 동작**:

1. `.didim/hooks/` 디렉토리 생성
2. `examples/hooks/*.js` → `.didim/hooks/` 복사
3. `.didim/hooks/package.json` 생성 + `npm install` (pg 의존성)
4. `.didim/sql/init.sql` 복사
5. `.didim/settings.json`에 hook 설정 병합 (기존 설정 보존)
6. DB 초기화 안내 메시지 출력

> **⚠️ 참고**: 이 배포 방안은 PoC 검증 완료(P3) 후에 구체화한다. P0~P3 작업
> 중에는 로컬 수동 설치로 진행한다.

---

## ⚠️ 주의사항

1. **코어 코드 수정 금지**: 모든 기능은 Hook 스크립트 + 설정만으로 구현한다.
2. **Hook 실행 모델**: 동기 실행 (`docs/hooks/index.md:32`), 매 호출마다 별도
   child process spawn — 프로세스 내 상태 유지 불가.
3. **hooksConfig 필수**: Stable 채널에서는 `hooksConfig.enabled: true` 명시
   필요.
4. **Graceful degradation**: DB 장애/스크립트 오류 시 CLI 정상 동작 보장 (exit
   0 + 빈 JSON).
5. **폴더 신뢰**: 프로젝트 레벨 hook은 trusted folder에서만 실행됨 — 최초 실행
   시 승인 필요.
6. **데이터 격리**: `tenant_id + project_id`로 이중 격리, `session_id`로 현재
   세션 제외. 비로컬 DB에서 `RAG_TENANT_ID` 미설정 시 fail-closed.
7. **설정 디렉토리**: `.didim`이 기본 (`storage.ts:20-38`), `.gemini`는 legacy
   fallback.
8. **인용 경로**: hook command에서 `.didim/hooks/` 경로를 `\"...\"` 로 감싸 공백
   포함 환경 대응.
9. **DB 인프라**: Docker 컨테이너 `didimaistudio_mainproxy-db-1`
   (`pgvector/pgvector:pg16`) 사용. 기존 공유 DB `didim_api` 내 전용 스키마
   `se_agent_management`에서 작업.
10. **search_path 필수**: 모든 Hook 스크립트에서 DB 연결 후 반드시
    `SET search_path TO se_agent_management, public;` 실행.
11. **접속 URL**: `RAG_DATABASE_URL` 기본값은
    `postgresql://postgres:password12@localhost:5432/didim_api`. Python용
    `postgresql+asyncpg://` 접두사가 아닌 Node.js `pg` 모듈용 `postgresql://`
    형식 사용.
12. **pgvector 사전 설치**: Docker 이미지에 pgvector 포함 — Phase 4에서 별도
    설치 불필요, `CREATE EXTENSION vector;`만 실행.

---

## ✅ 최종 체크리스트

### PoC 완료 조건 (DoD) — 설계서 §15 기준

- [x] 모든 일반 대화(슬래시 커맨드 제외)가 PostgreSQL에 자동 저장됨
- [x] `tenant_id + project_id`로 사용자/프로젝트 간 데이터 격리됨
- [x] 운영 메타데이터(`service_name/environment/incident_type/ticket_id`)가 누락
      없이 저장됨
- [x] 과거 유사 대화가 있을 때 LLM 응답에 해당 맥락이 반영됨
- [x] `memory_items`가 생성/강화(upsert)되고 `chat_history`와 source linkage가
      유지됨
- [x] BeforeAgent에서 `[장기기억]` 우선, `[근거 대화]` 보조 주입 순서가 유지됨
- [x] 현재 세션 대화는 RAG 결과에서 제외됨
- [x] DB 장애 및 스크립트 오류 시에도 CLI 정상 동작 (graceful degradation)
- [x] 비로컬 DB에서 `RAG_TENANT_ID` 미설정 시 저장/조회 모두 fail-closed 동작
- [x] `prompt_response === "[no response text]"` 레코드는 저장되지 않음
- [x] `used(memory)`/`selected(history)` 자동 기록 + `accepted/edited/rejected`
      수동 기록 경로가 동작함
- [x] 피드백 점수(positive/negative)가 RAG 정렬에 반영됨
- [x] Hook timeout 내 처리 완료 (p95 < 3초)
- [x] 코어 코드 수정 0줄 — Hook + 설정만으로 구현
- [x] 폴더 신뢰 승인 후 `/hooks` 명령으로 활성화 확인

### 문서화

- [x] 각 Phase별 작업 결과서 작성 완료
- [x] 통합 검증 결과서 작성 (Phase 3)
- [x] PoC 결론 및 향후 방향 문서화

---

## 🔗 관련 문서

- [poc_chat_rag_plan.md](../poc_chat_rag_plan.md) — PoC 설계서 (아키텍처,
  스키마, 스크립트, 검증 시나리오)
- [se_workflow.md](../../se_workflow.md) — SE Workflow 전체 설계
- [Phase 0: 환경 구축](./phase0_environment_setup.md)
- [Phase 1: AfterAgent Hook](./phase1_after_agent_hook.md)
- [Phase 2: BeforeAgent Hook](./phase2_before_agent_hook.md)
- [Phase 3: 통합 검증](./phase3_integration_validation.md)
- [Phase 4: pgvector 검색](./phase4_pgvector_semantic_search.md)

---

**작성일**: 2026-02-21 **작성자**: AI Assistant **상태**: Phase 0~3 ✅ 완료 (PoC
성공)
