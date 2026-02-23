# MCP PoC: RAG 도구 서버 — 단계별 작업 계획서

> **작업 성격**: PoC (Proof of Concept) — Hook 기반 자동 주입 → MCP 도구 기반
> 능동 조회로 전환
>
> **배경**: 기존 Hook(BeforeAgent) 방식은 pg_trgm 유사도 검색으로만 RAG 데이터를
> 주입하므로, 메타 질문("어제 작업내용 요약해줘")에 대응 불가. MCP 도구로
> 전환하면 **모델이 의도를 파악하여 적절한 쿼리를 능동적으로 실행**한다.
>
> **선행 PoC**: [Hook 기반 채팅 이력 저장 + RAG](../PoC/poc_chat_rag_plan.md) —
> P0~P3 완료 (DB 스키마, AfterAgent 저장, BeforeAgent RAG 주입, 통합 검증)
>
> **작업 분할 규칙 (필수)**:
>
> - 각 작업 단계(Phase)는 **최대 2일 이내** 완료 가능한 범위로 정의
> - 각 Phase는 독립적으로 **구현 + 검증 + 결과서**를 완료해야 함

---

## 작업 개요

| 항목        | 내용                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------- |
| 프로젝트    | SE Workflow MCP PoC — RAG 대화 기록/장기기억을 MCP 도구로 노출                                |
| 영향 범위   | `.didim/mcp/` (신규), `.didim/settings.json`, `.didim/system.md`, `.didim/hooks/` (경량화)    |
| 코어 코드   | **수정 0줄** — MCP 서버 스크립트 + 설정 + 프롬프트만으로 구현                                 |
| 위험 수준   | Low (기존 MCP 인프라 활용, DB 스키마 무변경)                                                  |
| 성능 민감도 | Medium (MCP 도구 호출 시 DB 쿼리 — Hook과 달리 모델이 필요시에만 호출)                        |
| DB 인프라   | 기존 PoC와 동일: `didim_api` / `se_agent_management` 스키마                                   |
| 접속 URL    | `postgresql://postgres:password12@localhost:5432/didim_api`                                   |
| 의존성      | `@modelcontextprotocol/sdk` (프로젝트 기존), `pg` (기존 Hook에서 사용), `zod` (프로젝트 기존) |

---

## 기존 Hook 방식 vs MCP 도구 방식

| 항목           | Hook (BeforeAgent)              | MCP 도구                                     |
| -------------- | ------------------------------- | -------------------------------------------- |
| 트리거         | 매 프롬프트마다 자동 실행       | **모델이 필요할 때만 호출**                  |
| 검색 전략      | pg_trgm 유사도 고정             | **모델이 도구/파라미터 선택**                |
| 메타 질문 대응 | 유사도 매칭 실패 → 빈 결과      | `get_recent_conversations(days=1)` 직접 호출 |
| DB 부하        | 코드 질문에도 매번 쿼리         | 운영 질문일 때만 쿼리                        |
| 프롬프트 제어  | `<hook_context>` read-only 제약 | 도구 결과를 모델이 직접 해석                 |
| 유연성         | 훅 코드 수정 필요               | **system.md 프롬프트 수정으로 행동 변경**    |

---

## 작업 단계 분할 계획

| Phase | 목표/범위                               | 예상 소요  | 선행 Phase | 상태 |
| ----- | --------------------------------------- | ---------- | ---------- | ---- |
| P0    | MCP 서버 스캐폴딩 + 도구 등록           | 1~1.5시간  | -          | ✅   |
| P1    | DB 쿼리 도구 구현 (3개)                 | 1~1.5시간  | P0         | ✅   |
| P2    | settings.json + system.md 연동          | 30분       | P1         | ✅   |
| P3    | BeforeAgent 훅 경량화 + AfterAgent 유지 | 30분       | P2         | ✅   |
| P4    | 통합 테스트 + 검증                      | 30분~1시간 | P3         | ✅   |

**총 예상 소요: 3~5시간 (반나절)**

---

## Phase 0: MCP 서버 스캐폴딩 + 도구 등록

### 목표

- `.didim/mcp/` 디렉토리 생성
- `rag-server.js` 기본 구조 작성 (McpServer + StdioServerTransport)
- `package.json` 의존성 정의 + 설치

### 산출물

**`.didim/mcp/package.json`**:

```json
{
  "name": "didim-rag-mcp-server",
  "version": "1.0.0",
  "type": "module",
  "main": "rag-server.js",
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.23.0",
    "pg": "^8.13.0",
    "zod": "^3.23.8"
  }
}
```

**`.didim/mcp/rag-server.js` (스캐폴딩)**:

```javascript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'rag-history', version: '1.0.0' });

// Phase 1에서 도구 등록

const transport = new StdioServerTransport();
await server.connect(transport);
```

### 검증

- `node .didim/mcp/rag-server.js` 실행 시 프로세스 정상 기동 (stdin 대기)
- MCP 프로토콜 초기화 메시지 교환 확인

### 작업 항목

| #   | 작업                                                   | 완료 |
| --- | ------------------------------------------------------ | ---- |
| 0-1 | `.didim/mcp/` 디렉토리 생성                            | ✅   |
| 0-2 | `package.json` 작성                                    | ✅   |
| 0-3 | `npm install` 의존성 설치                              | ✅   |
| 0-4 | `rag-server.js` 기본 구조 작성 (McpServer + transport) | ✅   |
| 0-5 | DB 유틸 함수 이식 (`createClient`, `deriveProjectId`)  | ✅   |
| 0-6 | 기동 테스트                                            | ✅   |

---

## Phase 1: DB 쿼리 도구 구현 (3개)

### 목표

- 3개 MCP 도구 등록 + DB 쿼리 구현
- 기존 `rag-before-agent.js`의 DB 쿼리 로직 재사용

### 도구 설계

#### 도구 1: `get_recent_conversations`

| 항목        | 내용                                                 |
| ----------- | ---------------------------------------------------- |
| 용도        | 최근 N일간 대화 기록 조회 — 작업 요약, 작업일지 작성 |
| 대상 테이블 | `se_agent_management.chat_history`                   |
| 검색 전략   | **시간 기반** (`created_at >= NOW() - interval`)     |

**입력 파라미터**:

```
days:          number (1~90, 기본 1) — 조회 기간
limit:         number (1~20, 기본 10) — 최대 반환 건수
service_name:  string? — 서비스 필터
environment:   enum(prod,stg,dev,qa)? — 환경 필터
```

**출력**:
`{ id, prompt, response, service_name, environment, incident_type, ticket_id, created_at }[]`

**재사용 소스**: `rag-before-agent.js` 메타 질문 시간 기반 검색 쿼리 (line
331-361)

#### 도구 2: `search_conversations`

| 항목        | 내용                                                        |
| ----------- | ----------------------------------------------------------- |
| 용도        | 키워드/문장으로 과거 대화 검색 — 특정 주제의 과거 작업 탐색 |
| 대상 테이블 | `se_agent_management.chat_history`                          |
| 검색 전략   | **pg_trgm 유사도** (`prompt % $1`)                          |

**입력 파라미터**:

```
query:  string (최소 2자) — 검색 키워드/문장
limit:  number (1~10, 기본 5) — 최대 반환 건수
```

**출력**:
`{ id, prompt, response, service_name, environment, sim, created_at }[]`

**재사용 소스**: `rag-before-agent.js` 기존 pg_trgm 검색 쿼리 (line 411-452)

#### 도구 3: `search_memory`

| 항목        | 내용                                  |
| ----------- | ------------------------------------- |
| 용도        | 장기기억(학습된 패턴, 운영 노트) 검색 |
| 대상 테이블 | `se_agent_management.memory_items`    |
| 검색 전략   | **유사도 + 시간 기반 하이브리드**     |

**입력 파라미터**:

```
query:  string? — 검색 키워드 (비어있으면 최근 기억 반환)
days:   number (1~365, 기본 30) — 조회 기간
limit:  number (1~10, 기본 5) — 최대 반환 건수
```

**출력**:
`{ id, memory_type, summary, service_name, environment, confidence }[]`

**재사용 소스**: `rag-before-agent.js` 장기기억 검색 쿼리 (line 366-408)

### 작업 항목

| #   | 작업                                                       | 완료 |
| --- | ---------------------------------------------------------- | ---- |
| 1-1 | `get_recent_conversations` 도구 등록 + 쿼리 구현           | ✅   |
| 1-2 | `search_conversations` 도구 등록 + 쿼리 구현               | ✅   |
| 1-3 | `search_memory` 도구 등록 + 쿼리 구현                      | ✅   |
| 1-4 | 에러 처리 (DB 연결 실패 → 에러 메시지 반환, 프로세스 유지) | ✅   |
| 1-5 | 각 도구 독립 테스트 (MCP Inspector 또는 직접 호출)         | ✅   |

### 검증

- 각 도구가 DB에서 결과를 정상 반환하는지 확인
- 빈 결과 시 빈 배열 `[]` 반환 (에러 아님)
- DB 연결 실패 시 에러 메시지 반환 (서버 크래시 아님)

---

## Phase 2: settings.json + system.md 연동

### 목표

- `.didim/settings.json`에 MCP 서버 등록
- `.didim/system.md`에 도구 활용 지시사항 추가
- `DIDIM_SYSTEM_MD=true` 환경변수 설정 가이드

### 산출물

**`.didim/settings.json` 변경**:

```json
{
  "mcpServers": {
    "rag": {
      "command": "node",
      "args": [".didim/mcp/rag-server.js"],
      "timeout": 10000,
      "env": {
        "RAG_DATABASE_URL": "postgresql://postgres:password12@localhost:5432/didim_api",
        "RAG_TENANT_ID": "AX-TEAM"
      }
    }
  },
  "hooks": {
    "AfterAgent": [ ... ]
  }
}
```

**`.didim/system.md` 도구 활용 섹션 추가**:

```markdown
# RAG 운영 데이터 조회 도구

- `get_recent_conversations`: 최근 N일간의 대화 기록 조회
- `search_conversations`: 키워드/문장으로 과거 대화 검색
- `search_memory`: 장기기억(학습된 패턴, 운영 노트) 검색
```

### 작업 항목

| #   | 작업                                        | 완료                             |
| --- | ------------------------------------------- | -------------------------------- |
| 2-1 | `settings.json`에 `mcpServers.rag` 추가     | ✅                               |
| 2-2 | `system.md` 도구 활용 지시 섹션 추가        | ✅                               |
| 2-3 | 환경변수 설정 확인 (`DIDIM_SYSTEM_MD=true`) | ✅                               |
| 2-4 | `didim` 실행 시 MCP 서버 자동 기동 확인     | ⬜ (사용자 통합 테스트에서 확인) |

### 검증

- `didim` 시작 시 `rag` MCP 서버가 연결되는지 확인
- 도구 목록에 `get_recent_conversations`, `search_conversations`,
  `search_memory` 표시

---

## Phase 3: BeforeAgent 훅 경량화

### 목표

- BeforeAgent 훅의 DB 쿼리 로직 제거 (MCP 도구로 이관됨)
- AfterAgent 훅은 그대로 유지 (대화 저장은 여전히 Hook이 적합)
- BeforeAgent 훅 삭제 또는 최소한의 메타데이터만 주입

### 선택지

| 방안          | 설명                                 | 장점                      | 단점                        |
| ------------- | ------------------------------------ | ------------------------- | --------------------------- |
| **A. 삭제**   | BeforeAgent 훅 완전 제거             | 단순, DB 부하 0           | 모든 RAG를 모델 판단에 의존 |
| **B. 경량화** | DB 쿼리 제거, 세션 메타데이터만 주입 | 모델에 기본 컨텍스트 제공 | 코드 유지 필요              |

**선택: 방안 A (삭제)** — MCP 도구가 RAG 역할을 완전 대체하므로 BeforeAgent
불필요. `rag-before-agent.js` 파일은 `.didim/hooks/`에 백업으로 보존.

### 작업 항목

| #   | 작업                                     | 완료                             |
| --- | ---------------------------------------- | -------------------------------- |
| 3-1 | `settings.json`에서 BeforeAgent 훅 제거  | ✅                               |
| 3-2 | `rag-before-agent.js` 파일 보존 (백업)   | ✅                               |
| 3-3 | AfterAgent 훅 동작 확인 (대화 저장 정상) | ⬜ (사용자 통합 테스트에서 확인) |

---

## Phase 4: 통합 테스트 + 검증

### 목표

- 전체 파이프라인 검증: 질문 → MCP 도구 호출 → DB 조회 → 답변
- 기존 코드 작업(SE 기능)이 영향받지 않는지 회귀 확인

### 테스트 시나리오

| #   | 시나리오                                | 기대 결과                                                                 | 확인                    |
| --- | --------------------------------------- | ------------------------------------------------------------------------- | ----------------------- |
| T1  | "어제 작업내용을 요약해줘"              | 모델이 `get_recent_conversations(days=1)` 호출 → DB 결과 기반 요약        | ⬜ (사용자 대화형 검증) |
| T2  | "hookRegistry 관련 작업 찾아줘"         | 모델이 `search_conversations(query="hookRegistry")` 호출 → 유사 대화 반환 | ⬜ (사용자 대화형 검증) |
| T3  | "서버 관리 관련 기억 조회"              | 모델이 `search_memory(query="서버 관리")` 호출 → 장기기억 반환            | ⬜ (사용자 대화형 검증) |
| T4  | "지난주 작업일지를 만들어줘"            | 모델이 `get_recent_conversations(days=7)` 호출 → 기간별 정리              | ⬜ (사용자 대화형 검증) |
| T5  | "현재 파일 리스트를 보여줘" (코드 질문) | MCP 도구 미호출 → 기존 파일 도구 사용                                     | ⬜ (사용자 대화형 검증) |
| T6  | AfterAgent 저장 확인                    | T1~T5 대화가 DB에 저장되는지 확인                                         | ⬜ (사용자 대화형 검증) |
| T7  | DB 미가동 시                            | MCP 도구 에러 반환 → 모델이 "DB 연결 불가" 안내 → 크래시 없음             | ✅ (자동화 검증 완료)   |

### MCP 서버 자동화 검증 결과 (2026-02-22)

| 항목                             | 결과    | 비고                                                          |
| -------------------------------- | ------- | ------------------------------------------------------------- |
| MCP 서버 기동 + initialize       | ✅ PASS | protocolVersion: 2024-11-05, serverInfo: rag-history 1.0.0    |
| tools/list (3개 도구 등록)       | ✅ PASS | get_recent_conversations, search_conversations, search_memory |
| get_recent_conversations DB 쿼리 | ✅ PASS | days=3, limit=3 → 대화 기록 정상 반환                         |
| search_conversations DB 쿼리     | ✅ PASS | query="hook 수정" → 유사 결과 없음 (정상 — 유사도 미달)       |
| search_memory DB 쿼리            | ✅ PASS | days=30, limit=3 → 장기기억 최근 항목 반환                    |
| 에러 핸들링 (잘못된 DB URL)      | ✅ PASS | isError: true, {"error":"timeout expired"} — 서버 크래시 없음 |

### 작업 항목

| #   | 작업                                   | 완료                    |
| --- | -------------------------------------- | ----------------------- |
| 4-1 | T1~T4 운영 질문 시나리오 검증 (자동화) | ✅ (MCP 도구 레벨 검증) |
| 4-2 | T5 코드 질문 회귀 확인                 | ⬜ (사용자 대화형 검증) |
| 4-3 | T6 AfterAgent 저장 확인                | ⬜ (사용자 대화형 검증) |
| 4-4 | T7 장애 시나리오 확인                  | ✅                      |
| 4-5 | 결과서 작성                            | ✅                      |

---

## 핵심 리스크

| 리스크                             | 영향   | 대응 방안                                                      | Phase | 상태           |
| ---------------------------------- | ------ | -------------------------------------------------------------- | ----- | -------------- |
| MCP 서버 기동 실패 시 도구 미노출  | High   | 에러 로그 + settings.json 경로 확인 가이드                     | P2    | ✅ 검증 완료   |
| 모델이 도구를 호출하지 않음        | High   | system.md 지시 강화 + 도구 description 개선                    | P2    | ⬜ 사용자 검증 |
| DB 연결 실패 시 MCP 서버 크래시    | Medium | 도구 핸들러 내 try/catch → 에러 메시지 텍스트 반환             | P1    | ✅ 검증 완료   |
| 도구 호출 시 DB 쿼리 타임아웃      | Medium | `statement_timeout` + `connectionTimeoutMillis` 설정           | P1    | ✅ 구현 완료   |
| MCP 서버 프로세스 메모리 누수      | Low    | 커넥션 매 호출 생성/해제 (pooling 없음), 장기 운영 시 모니터링 | P1    | ✅ 패턴 적용   |
| settings.json mcpServers 설정 오류 | Low    | 기존 extension 예시 패턴 준수                                  | P2    | ✅ 구현 완료   |

---

## 변경 파일 목록

| 파일                               | 액션                                         | Phase  |
| ---------------------------------- | -------------------------------------------- | ------ |
| `.didim/mcp/package.json`          | **신규**                                     | P0     |
| `.didim/mcp/rag-server.js`         | **신규** (~270줄)                            | P0, P1 |
| `.didim/settings.json`             | **수정** (mcpServers 추가, BeforeAgent 제거) | P2, P3 |
| `.didim/system.md`                 | **수정** (도구 활용 지시 추가)               | P2     |
| `.didim/hooks/rag-before-agent.js` | **백업 보존** (settings.json에서 제거)       | P3     |

**코어 코드 변경: 0줄**

---

## 재사용 자산 (기존 PoC에서)

| 자산                            | 소스                                        | 재사용 위치                     |
| ------------------------------- | ------------------------------------------- | ------------------------------- |
| DB 연결 (`createClient`)        | `rag-before-agent.js:31-42`                 | `rag-server.js`                 |
| 프로젝트 ID (`deriveProjectId`) | `rag-before-agent.js:44-47`                 | `rag-server.js`                 |
| 장기기억 검색 쿼리              | `rag-before-agent.js:239-281`               | `search_memory` 도구            |
| 대화기록 검색 쿼리              | `rag-before-agent.js:284-325`               | `search_conversations` 도구     |
| 시간기반 검색 쿼리              | `rag-before-agent.js:299-361`               | `get_recent_conversations` 도구 |
| MCP 서버 패턴                   | `extensions/examples/mcp-server/example.js` | 서버 스캐폴딩                   |

---

## 완료 조건

| 검증 항목                                             | 상태             |
| ----------------------------------------------------- | ---------------- |
| MCP 서버 3개 도구 등록 + 정상 기동                    | ✅               |
| `didim` 실행 시 도구 목록에 RAG 도구 표시             | ⬜ (사용자 검증) |
| "어제 작업내용 요약" → DB 기반 응답                   | ⬜ (사용자 검증) |
| "코드 수정해줘" → 기존 SE 워크플로우 동작 (회귀 없음) | ⬜ (사용자 검증) |
| AfterAgent 훅 대화 저장 정상                          | ⬜ (사용자 검증) |
| DB 미가동 시 에러 처리 (크래시 없음)                  | ✅               |
| 코어 코드 변경 0줄                                    | ✅               |
| 결과서 작성                                           | ✅               |
