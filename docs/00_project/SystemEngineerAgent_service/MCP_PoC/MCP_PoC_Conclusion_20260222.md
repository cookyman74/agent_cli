# MCP PoC 종합 결론: RAG 도구 서버 (Hook → MCP 전환)

> **작업 기간**: 2026-02-22 (Phase 0~4, 1일 완료) **참조 설계서**:
> `mcp_rag_tool_server_todolist_20260222.md` **선행 PoC**:
> [Chat RAG PoC](../PoC/working_history/PoC_Conclusion_20260221.md) (Hook 기반,
> 2026-02-21)

---

## 1. PoC 목표 달성 여부

### 1.1 목표

기존 Hook(BeforeAgent) 기반 RAG 자동 주입의 **메타 질문 대응 불가 한계**를
해결하기 위해, MCP 도구 기반 능동 조회 방식으로 전환. **코어 코드 수정 없이**
MCP 서버 스크립트 + settings.json + system.md만으로 구현 가능 여부 검증.

### 1.2 해결 대상 문제

기존 Hook 방식은 pg*trgm 유사도 검색만 사용하므로, "어제 작업내용 요약해줘" 같은
**메타 질문**(과거 대화에 *대한\_ 질문)에서 유사도 매칭이 실패하여 빈 결과를
반환함. MCP 도구로 전환하면 모델이 질문 의도를 파악하여 **시간 기반
조회**(`get_recent_conversations`)를 능동적으로 선택할 수 있음.

### 1.3 결과: ✅ **달성**

| 목표 항목                             | 달성 | 증거                                                                           |
| ------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| 코어 코드 수정 없이 구현              | ✅   | `git diff HEAD -- packages/` → 0줄                                             |
| MCP 서버 3개 도구 등록 + 정상 기동    | ✅   | initialize → serverInfo: rag-history 1.0.0, tools/list → 3개                   |
| 시간 기반 대화 조회 (메타 질문 해결)  | ✅   | `get_recent_conversations(days=3)` → DB 결과 정상 반환                         |
| 키워드 유사도 검색                    | ✅   | `search_conversations(query="hook 수정")` → 정상 동작 (유사도 미달 시 빈 결과) |
| 장기기억 검색                         | ✅   | `search_memory(days=30)` → memory_items 최근 항목 반환                         |
| DB 장애 시 graceful degradation       | ✅   | 잘못된 DB URL → `isError: true` + 에러 메시지 반환, 서버 크래시 없음           |
| BeforeAgent 훅 제거 + AfterAgent 유지 | ✅   | settings.json에서 BeforeAgent 제거, AfterAgent 정상 보존                       |
| system.md 프롬프트 연동               | ✅   | 도구 활용 지시사항 + Operations Management 워크플로우 정의                     |

---

## 2. 아키텍처 변경

### 2.1 Before (Hook 방식)

```
User → CLI (packages/cli)
        ├─ BeforeAgent Hook → rag-before-agent.js → PostgreSQL (pg_trgm 고정)
        │                      └→ additionalContext 주입 (read-only)
        ├─ Core (packages/core) → LLM API
        └─ AfterAgent Hook  → rag-after-agent.js  → PostgreSQL (INSERT)
```

**한계**: 매 프롬프트마다 자동 실행, pg_trgm 유사도 고정, 메타 질문 대응 불가

### 2.2 After (MCP 도구 방식)

```
User → CLI (packages/cli)
        ├─ MCP Server (rag-history) ← 모델이 필요시에만 호출
        │   ├─ get_recent_conversations → PostgreSQL (시간 기반)
        │   ├─ search_conversations     → PostgreSQL (pg_trgm 유사도)
        │   └─ search_memory            → PostgreSQL (하이브리드)
        ├─ Core (packages/core) → LLM API (변경 없음)
        └─ AfterAgent Hook → rag-after-agent.js → PostgreSQL (INSERT, 변경 없음)
```

**핵심 변경점**:

| 항목      | Hook (Before)              | MCP (After)                                  |
| --------- | -------------------------- | -------------------------------------------- |
| 트리거    | 매 프롬프트마다 자동       | **모델이 필요시에만 호출**                   |
| 검색 전략 | pg_trgm 유사도 고정        | **모델이 도구/파라미터 선택**                |
| 메타 질문 | 유사도 매칭 실패 → 빈 결과 | `get_recent_conversations(days=N)` 직접 호출 |
| DB 부하   | 코드 질문에도 매번 쿼리    | 운영 질문일 때만 쿼리                        |
| 유연성    | 훅 코드 수정 필요          | **system.md 프롬프트 수정으로 행동 변경**    |

---

## 3. 구현 상세

### 3.1 MCP 서버 (`rag-server.js`, ~270줄)

| 구성 요소     | 설명                                                                   |
| ------------- | ---------------------------------------------------------------------- |
| 프레임워크    | `@modelcontextprotocol/sdk` McpServer + StdioServerTransport           |
| DB 연결       | 매 호출마다 `pg.Client` 생성/해제 (pooling 없음)                       |
| 타임아웃      | `connectionTimeoutMillis: 2000ms`, `statement_timeout: 3000ms`         |
| 에러 처리     | 도구 핸들러 try/catch → `{ isError: true, content: [{ text: JSON }] }` |
| 프로젝트 격리 | `deriveProjectId(cwd)` — SHA256 해시 기반                              |

### 3.2 도구 목록

| 도구                       | 용도               | 대상 테이블    | 검색 전략                                    |
| -------------------------- | ------------------ | -------------- | -------------------------------------------- |
| `get_recent_conversations` | 최근 N일 대화 조회 | `chat_history` | 시간 기반 (`created_at >= NOW() - interval`) |
| `search_conversations`     | 키워드/문장 검색   | `chat_history` | pg_trgm 유사도 (`prompt % $1`)               |
| `search_memory`            | 장기기억 검색      | `memory_items` | 하이브리드 (유사도 + 시간)                   |

### 3.3 설정 변경

**`.didim/settings.json`**:

- `mcpServers.rag` 추가 (command: node, args: `.didim/mcp/rag-server.js`,
  timeout: 10s)
- `hooks.BeforeAgent` 제거 (MCP 도구로 대체)
- `hooks.AfterAgent` 유지 (대화 저장은 Hook이 적합)

**`.didim/system.md`**:

- `<hook_context>` 참조 제거 → MCP 도구 활용 지시사항으로 교체
- Operations Management 워크플로우: RAG MCP 도구 → 데이터 조합 → 구조화 보고서
- "과거 작업/작업일지/운영 이력 질문 시 **반드시 도구를 먼저 호출**" 지시 명시

---

## 4. 자동화 검증 결과

### 4.1 MCP 프로토콜 검증

| 테스트 항목            | 결과    | 상세                                                         |
| ---------------------- | ------- | ------------------------------------------------------------ |
| 서버 기동 + initialize | ✅ PASS | protocolVersion: 2024-11-05, serverInfo: `rag-history 1.0.0` |
| tools/list             | ✅ PASS | 3개 도구 등록 확인 — inputSchema, description 정상           |

### 4.2 도구 레벨 DB 쿼리 검증

| 테스트 항목              | 파라미터                     | 결과    | 상세                                                           |
| ------------------------ | ---------------------------- | ------- | -------------------------------------------------------------- |
| get_recent_conversations | `days=3, limit=3`            | ✅ PASS | 대화 기록 정상 반환 (id, prompt, response, created_at)         |
| search_conversations     | `query="hook 수정", limit=3` | ✅ PASS | 유사도 미달 시 안내 메시지 반환 (정상 동작)                    |
| search_memory            | `days=30, limit=3`           | ✅ PASS | memory_items 최근 항목 반환 (memory_type, summary, confidence) |

### 4.3 에러 핸들링 검증

| 테스트 항목   | 조건                                                 | 결과    | 상세                                                              |
| ------------- | ---------------------------------------------------- | ------- | ----------------------------------------------------------------- |
| 잘못된 DB URL | `postgresql://invalid:wrong@localhost:9999/nonexist` | ✅ PASS | `isError: true`, `{"error":"timeout expired"}` — 서버 크래시 없음 |

### 4.4 사용자 대화형 검증 (미완료)

아래 시나리오는 `didim` CLI에서 `DIDIM_SYSTEM_MD=true` 환경으로 직접 검증 필요:

| #   | 시나리오                        | 기대 결과                                                     | 상태 |
| --- | ------------------------------- | ------------------------------------------------------------- | ---- |
| T1  | "어제 작업내용을 요약해줘"      | 모델이 `get_recent_conversations(days=1)` 호출 → DB 기반 요약 | ⬜   |
| T2  | "hookRegistry 관련 작업 찾아줘" | 모델이 `search_conversations(query="hookRegistry")` 호출      | ⬜   |
| T3  | "서버 관리 관련 기억 조회"      | 모델이 `search_memory(query="서버 관리")` 호출                | ⬜   |
| T4  | "지난주 작업일지를 만들어줘"    | 모델이 `get_recent_conversations(days=7)` 호출 → 기간별 정리  | ⬜   |
| T5  | "현재 파일 리스트를 보여줘"     | MCP 도구 미호출 → 기존 파일 도구 사용 (회귀 없음)             | ⬜   |
| T6  | AfterAgent 저장                 | T1~T5 대화가 DB에 정상 저장되는지 확인                        | ⬜   |

---

## 5. 성능 비교 (Hook vs MCP)

| 항목           | Hook (BeforeAgent)      | MCP 도구                                    |
| -------------- | ----------------------- | ------------------------------------------- |
| 호출 빈도      | 매 프롬프트마다         | 운영 질문일 때만 (모델 판단)                |
| 불필요 쿼리    | 코드 질문에도 DB 조회   | 0건 (코드 질문 시 MCP 미호출)               |
| 프로세스 수명  | 매 호출 spawn + 종료    | MCP 서버 상주 (세션 동안 지속)              |
| DB 연결 방식   | 매 호출 생성/해제       | 매 도구 호출 생성/해제 (동일)               |
| 쿼리 타임아웃  | `statement_timeout: 3s` | `statement_timeout: 3s` (동일)              |
| 전체 지연 영향 | 매 응답에 ~946ms 추가   | **운영 질문에만 DB 지연** (코드 질문은 0ms) |

---

## 6. 핵심 리스크 및 대응

| 리스크                      | 영향   | 대응                                                 | 상태           |
| --------------------------- | ------ | ---------------------------------------------------- | -------------- |
| MCP 서버 기동 실패          | High   | settings.json 경로 확인 + 에러 로그                  | ✅ 검증        |
| 모델이 도구를 호출하지 않음 | High   | system.md 지시 강화 + 도구 description 한국어 최적화 | ⬜ 사용자 검증 |
| DB 연결 실패 시 서버 크래시 | Medium | try/catch → isError 반환                             | ✅ 검증        |
| DB 쿼리 타임아웃            | Medium | `statement_timeout` + `connectionTimeoutMillis`      | ✅ 구현        |
| MCP 서버 메모리 누수        | Low    | 커넥션 매 호출 생성/해제, 장기 운영 모니터링         | ✅ 패턴 적용   |

---

## 7. 향후 개선 방향

| 개선 방향                       | 필요성  | 우선순위 | 비고                                |
| ------------------------------- | ------- | -------- | ----------------------------------- |
| 사용자 대화형 통합 검증 (T1~T6) | 🔴 필수 | P0       | `didim` CLI에서 실제 대화 테스트    |
| system.md 도구 호출 지시 튜닝   | 🟢 권장 | P1       | 모델이 도구 미호출 시 프롬프트 보강 |
| Connection pooling (pgBouncer)  | 🟢 권장 | P1       | 프로덕션 환경 성능 최적화           |
| pgvector 의미 검색              | 🟡 선택 | P2       | 동의어/의미 유사 쿼리 커버          |
| 도구 추가 (incident 검색 등)    | 🟡 선택 | P2       | 운영 도메인 특화 도구 확장          |
| memory_items 자동 생성          | 🟡 선택 | P3       | LLM 기반 장기기억 자동 추출         |

---

## 8. 산출물 목록

| 산출물              | 위치                                                       |
| ------------------- | ---------------------------------------------------------- |
| 설계서 (작업계획서) | `MCP_PoC/mcp_rag_tool_server_todolist_20260222.md`         |
| MCP 서버 코드       | `.didim/mcp/rag-server.js` (~270줄)                        |
| MCP 서버 의존성     | `.didim/mcp/package.json`                                  |
| 설정 파일           | `.didim/settings.json` (mcpServers 추가, BeforeAgent 제거) |
| 시스템 프롬프트     | `.didim/system.md` (MCP 도구 활용 지시)                    |
| Hook 백업           | `.didim/hooks/rag-before-agent.js` (비활성, 파일 보존)     |
| 종합 결과서         | `MCP_PoC/MCP_PoC_Conclusion_20260222.md` (본 문서)         |

---

## 9. 최종 판정

> **MCP RAG 도구 서버 PoC: ✅ 기술 검증 성공 (사용자 통합 검증 대기)**
>
> MCP 도구 기반 능동 조회 방식은 기존 Hook 방식의 메타 질문 한계를 해결하며,
> 코어 코드 0줄 수정으로 구현 가능함을 확인. MCP 서버 기동, 3개 도구 등록, DB
> 쿼리 정상 반환, 에러 핸들링 모두 자동화 검증 통과.
>
> **남은 과제**: `didim` CLI에서 `DIDIM_SYSTEM_MD=true` 환경으로 실제 대화
> 테스트(T1~T6)를 수행하여, 모델이 system.md 지시에 따라 MCP 도구를 능동적으로
> 호출하는지 확인 필요. 도구 미호출 시 system.md 프롬프트 튜닝으로 대응 가능.
