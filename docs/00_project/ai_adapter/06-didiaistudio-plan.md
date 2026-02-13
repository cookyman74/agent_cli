# 06. DidimAIStudio 에이전트 시나리오 연동 계획

> 📅 **작성일**: 2026-02-10 🔗 **관련 문서**:
> [05-implementation-plan.md](./05-implementation-plan.md) (M3.3),
> [04-integration-design.md](./04-integration-design.md) 📋 **참조 API**:
> [agent_service_openapi.json](./agent_service_openapi.json) 📄 **참조 문서**:
> [DidimAIStudio 외부 서비스 플로우 연결 방식](./didimStudi-AISTUDIO%20외부%20서비스%20플로우%20연결%20방식-100226-093925.pdf)

---

## 1. 개요

### 1.1 배경

기존 `05-implementation-plan.md`의 **M3.3 (OpenAI-Compatible 어댑터 템플릿)** 은
vLLM/sLM과의 연동을 고려한 범용 어댑터 개발 작업이다. 본 문서는 M3.3을 확장하여
**DidimAIStudio 솔루션의 에이전트 시나리오 서비스**와의 연동 기능을 추가
정의한다.

### 1.2 목적

1. **시나리오 조회**: Gemini CLI의 `/model` 명령어에서 DidimAIStudio 에이전트
   서비스의 시나리오 목록을 조회
2. **시나리오 선택**: 사용자가 원하는 에이전트 시나리오를 선택하여 대화 세션에
   적용
3. **SSE 실시간 스트리밍**: 선택된 시나리오를 통해 LLM 서비스를 SSE 방식으로
   실시간 연동

### 1.3 범위

```
┌────────────────────────────────────────────────────────────────────┐
│                 DidimAIStudio 에이전트 시나리오 연동                  │
├────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  M4.1: 에이전트 시나리오 조회 API 클라이언트 (2일)                   │
│  ├── 시나리오 목록 조회 (GET /v1/scenarios/data)                    │
│  ├── 마이페이지 시나리오 조회 (GET /v1/scenarios/my)                │
│  └── 에이전트 데이터 조회 (GET /v1/agents/data, /v1/agents/my)     │
│                                                                      │
│  M4.2: /model 명령어 확장 — 시나리오 브라우저 UI (3일)              │
│  ├── 시나리오 목록 표시 (이름, 설명, 카테고리)                      │
│  ├── 인터랙티브 선택 UI (Ink 기반)                                  │
│  └── 선택된 시나리오 상태 관리                                       │
│                                                                      │
│  M4.3: SSE 스트리밍 어댑터 구현 (3일)                               │
│  ├── DidimAIStudioAdapter 확장 (시나리오 기반 요청)                 │
│  ├── scenario-gateway SSE 연동 (/api/v1/invoke/sse/improved)       │
│  └── SSE 이벤트 → LlmStreamEvent 변환                              │
│                                                                      │
│  M4.4: 통합 테스트 및 안정화 (2일)                                  │
│  ├── 시나리오 조회/선택 E2E 테스트                                   │
│  └── SSE 스트리밍 안정성 테스트                                      │
│                                                                      │
└────────────────────────────────────────────────────────────────────┘
```

---

## 2. DidimAIStudio 에이전트 서비스 API 분석

### 2.1 핵심 엔드포인트

> **API 버전**: v0.2.1 (OpenAPI 3.1.0) **기준 문서**:
> `agent_service_openapi.json`

#### 시나리오 관련 API

| 메서드 | 경로                               | 설명                           | 용도                          |
| ------ | ---------------------------------- | ------------------------------ | ----------------------------- |
| GET    | `/v1/scenarios/data`               | 시나리오 원본 데이터 목록 조회 | 전체 시나리오 카탈로그        |
| GET    | `/v1/scenarios/data/{scenario_id}` | 특정 시나리오 상세 조회        | 시나리오 상세 정보            |
| GET    | `/v1/scenarios/my`                 | 마이페이지 시나리오 목록       | **사용자별 시나리오 목록** ⭐ |
| GET    | `/v1/scenarios/my/{my_page_id}`    | 마이페이지 시나리오 상세       | 선택된 시나리오 정보          |

#### 에이전트 관련 API

| 메서드 | 경로                         | 설명                      | 용도                             |
| ------ | ---------------------------- | ------------------------- | -------------------------------- |
| GET    | `/v1/agents/data`            | 에이전트 원본 데이터 목록 | 에이전트 카탈로그                |
| GET    | `/v1/agents/my`              | 마이페이지 에이전트 목록  | **사용자별 에이전트 목록** ⭐    |
| GET    | `/v1/agents/my/{my_page_id}` | 마이페이지 에이전트 상세  | 에이전트 시나리오 연결 정보 포함 |

#### 노드/엣지 관련 API (시나리오 워크플로우 구조)

| 메서드 | 경로                    | 설명                      |
| ------ | ----------------------- | ------------------------- |
| GET    | `/v1/nodes`             | 노드 목록 조회            |
| GET    | `/v1/nodes/scenario/my` | 마이페이지 기반 노드 목록 |
| GET    | `/v1/edges`             | 엣지 목록 조회            |

#### 실행 API (scenario-gateway 경유)

| 메서드 | 경로                          | 설명                             |
| ------ | ----------------------------- | -------------------------------- |
| POST   | `/api/v1/invoke/sse`          | SSE 스트리밍 실행                |
| POST   | `/api/v1/invoke/sse/improved` | LangGraph 세분화 SSE 스트리밍 ⭐ |

### 2.2 핵심 데이터 모델

#### ScenarioDataResponse (시나리오 원본)

```typescript
interface ScenarioDataResponse {
  id: number;
  user_id: string;
  category: ScenarioCategoryEnum; // "general" | "rag" | "multi_agent" 등
  name: string; // 공식 이름
  description: string; // 공식 설명
  definition_name: string; // 함수명
  user_scenario_title?: string; // 사용자 지정 제목
  user_scenario_description?: string; // 사용자 지정 설명
  is_system: boolean; // 시스템 제공 여부
  is_public: boolean; // 공개 여부
  created_at: string;
  updated_at: string;
}
```

#### MyPageScenarioResponse (사용자 마이페이지 시나리오)

```typescript
interface MyPageScenarioResponse {
  id: number; // 마이페이지 항목 ID
  user_id: string;
  scenario_data_id: number; // 원본 시나리오 ID
  user_my_scenario_title?: string; // 사용자 별칭
  user_my_scenario_description?: string; // 사용자 메모
  is_favorite: boolean; // 즐겨찾기 여부
  created_at: string;
  updated_at: string;
}
```

#### AgentDataResponse (에이전트)

```typescript
interface AgentDataResponse {
  id: number;
  user_id: string;
  model_my_page_id?: number; // 연결된 모델
  persona_my_page_id?: number; // 연결된 페르소나
  tool_my_page_id?: number; // 연결된 도구
  fallback_model_my_page_id?: number;
  category: AgentCategoryEnum;
  name: string;
  description: string;
  is_system: boolean;
  is_public: boolean;
  // ...
}
```

#### MyPageAgentResponseWithScenarios (에이전트 + 시나리오 연결)

```typescript
interface MyPageAgentResponseWithScenarios {
  id: number;
  user_id: string;
  agent_data_id: number;
  user_my_agent_title?: string;
  user_my_agent_description?: string;
  is_favorite: boolean;
  scenarios: MyPageScenarioResponse[]; // ⭐ 연결된 시나리오 목록
  // ...
}
```

### 2.3 페이지네이션 구조

모든 목록 API는 동일한 페이지네이션 응답 구조를 사용한다:

```typescript
interface PaginatedResponseDTO<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  pages: number; // 전체 페이지 수
}
```

---

## 3. 상세 구현 계획

### M4.1: 에이전트 시나리오 조회 API 클라이언트 (2일)

**목표**: DidimAIStudio 에이전트 서비스 API와 통신하는 클라이언트 모듈 구현

#### 작업 항목

- [ ] DidimAIStudio API 클라이언트 클래스 구현
  - 인증 헤더 처리 (Bearer API-Key)
  - 페이지네이션 지원
  - 에러 핸들링 (404, 403, 409, 500)
- [ ] 시나리오 조회 메서드 구현
  - `listScenarios(filters?)`: 시나리오 목록 조회 (GET /v1/scenarios/data)
  - `listMyScenarios(userId, filters?)`: 마이페이지 시나리오 조회 (GET
    /v1/scenarios/my)
  - `getScenario(scenarioId)`: 시나리오 상세 조회
- [ ] 에이전트 조회 메서드 구현
  - `listMyAgents(userId, filters?)`: 마이페이지 에이전트 조회 (GET
    /v1/agents/my)
  - `getMyAgent(myPageId)`: 에이전트 상세 + 시나리오 연결 정보
- [ ] 응답 타입 정의 (TypeScript 인터페이스)

#### 산출물

```
packages/core/src/providers/didim/
├── apiClient.ts          # DidimAIStudio REST API 클라이언트  [NEW]
├── apiTypes.ts           # API 응답 타입 정의               [NEW]
└── adapter.ts            # 기존 어댑터 (apiClient 연동)     [MODIFY]
```

#### 핵심 인터페이스

```typescript
// packages/core/src/providers/didim/apiClient.ts

export class DidimApiClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
  ) {}

  /**
   * 사용자의 마이페이지 시나리오 목록 조회
   * GET /v1/scenarios/my?user_id={userId}&size={size}&page={page}
   */
  async listMyScenarios(
    userId: string,
    options?: { page?: number; size?: number; isFavorite?: boolean },
  ): Promise<PaginatedResponseDTO<MyPageScenarioResponse>>;

  /**
   * 사용자의 마이페이지 에이전트 목록 조회 (시나리오 연결 정보 포함)
   * GET /v1/agents/my?user_id={userId}&size={size}&page={page}
   */
  async listMyAgents(
    userId: string,
    options?: { page?: number; size?: number },
  ): Promise<PaginatedResponseDTO<MyPageAgentResponseWithScenarios>>;

  /**
   * 시나리오 원본 데이터 조회 (카테고리, 이름, 설명 등)
   * GET /v1/scenarios/data/{scenarioId}
   */
  async getScenarioData(scenarioId: number): Promise<ScenarioDataResponse>;
}
```

---

### M4.2: /model 명령어 확장 — 시나리오 브라우저 UI (3일)

**목표**: `/model` 명령어에서 DidimAIStudio 시나리오를 조회/선택할 수 있는
인터랙티브 UI 구현

#### 작업 항목

- [ ] `/model` 명령어 핸들러 확장
  - `LLM_PROVIDER=didim` 일 때 시나리오 선택 모드 활성화
  - 기존 모델 선택 기능과 공존
- [ ] 시나리오 목록 표시 React/Ink 컴포넌트 구현
  - 시나리오 이름, 설명, 카테고리 표시
  - 즐겨찾기(⭐) 우선 표시
  - 페이지네이션 (위/아래 방향키)
- [ ] 시나리오 선택 및 상태 관리
  - 선택된 시나리오 ID를 세션 상태에 저장
  - `scenario_my_page_id`를 SSE 요청에 전달
- [ ] 에이전트 → 시나리오 계층 탐색 지원
  - 에이전트 목록 → 하위 시나리오 선택 플로우

#### UX 플로우

```
┌──────────────────────────────────────────────────────────┐
│  Gemini CLI                                                │
│                                                            │
│  > /model                                                  │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  🤖 DidimAIStudio 에이전트 시나리오 선택              │  │
│  │                                                        │  │
│  │  ──── 내 에이전트 ────                                 │  │
│  │  ⭐ [1] 코드 리뷰 어시스턴트                           │  │
│  │       "PR 코드 리뷰 및 개선사항 제안"                  │  │
│  │  ⭐ [2] 문서 작성 도우미                                │  │
│  │       "기술 문서 및 API 문서 자동 생성"                │  │
│  │     [3] 데이터 분석 에이전트                            │  │
│  │       "CSV/JSON 데이터 분석 및 시각화"                 │  │
│  │                                                        │  │
│  │  ──── 시나리오 ────                                    │  │
│  │     [4] RAG 기반 질의응답  [rag]                       │  │
│  │     [5] 멀티턴 대화      [general]                     │  │
│  │     [6] 코드 생성        [general]                     │  │
│  │                                                        │  │
│  │  [↑↓] 이동  [Enter] 선택  [q] 취소                    │  │
│  │  Page 1/3                                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                            │
│  ✅ 선택됨: "코드 리뷰 어시스턴트" (scenario_my_page_id: 42)│
│  이제 이 시나리오를 통해 대화합니다.                        │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

#### 산출물

```
packages/cli/src/commands/
├── modelCommand.ts                 # /model 명령어 확장      [MODIFY]
└── components/
    └── ScenarioSelector.tsx        # 시나리오 선택 UI         [NEW]

packages/core/src/providers/didim/
└── scenarioManager.ts              # 시나리오 상태 관리       [NEW]
```

---

### M4.3: SSE 스트리밍 어댑터 구현 (3일)

**목표**: 선택된 시나리오 기반의 SSE 실시간 스트리밍 연동

#### 작업 항목

- [ ] DidimAIStudioAdapter 확장
  - `scenario_my_page_id` 기반 요청 구성
  - scenario-gateway 인증 (Bearer API-Key)
  - `x-thread-id` 헤더를 통한 대화 컨텍스트 유지
- [ ] SSE 스트리밍 구현 (`/api/v1/invoke/sse/improved`)
  - SSE 이벤트 파싱 (event: / data: / id:)
  - 다중 data 라인 지원
  - 연결 끊김 시 재연결 로직
- [ ] SSE 이벤트 → LlmStreamEvent 변환
  - `message_partial` → `content_delta` (토큰 스트리밍)
  - `message_complete` → `content_delta` (최종 메시지)
  - `message_metadata` → `content_delta` (메타데이터)
  - `process` → `content_delta` (노드 진행 상황)
  - `done` → `message_end` (완료, threadId/qaId 포함)
  - `error` → `error` (에러 핸들링)
- [ ] Thread 관리
  - 첫 요청 시 새 thread 생성 (x-thread-id 미전송)
  - 후속 요청 시 기존 thread 재사용 (x-thread-id 전송)
  - thread_id 응답 저장 및 세션 관리

#### 통신 흐름

```
┌──────────────────────────────────────────────────────────────────────┐
│                     SSE 스트리밍 연동 흐름                             │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  Gemini CLI                    scenario-gateway          agents       │
│  (DidimAIStudioAdapter)        (:8008)                   (:8003)      │
│                                                                       │
│  ① POST /api/v1/invoke/sse/improved                                  │
│     Headers:                                                          │
│       Authorization: Bearer <API-KEY>                                │
│       x-thread-id: <thread-id> (optional)                            │
│       Content-Type: application/json                                 │
│       Accept: text/event-stream                                      │
│     Body: { "chat": "<사용자 메시지>" }                              │
│                    ──────────────►                                     │
│                                                                       │
│                    ② API-Key 검증                                     │
│                    ③ passport_data 추출                               │
│                    ④ Thread/QA-ID 생성                                │
│                    ⑤ AgentsInvokeRequest 구성                         │
│                                     ──────────────►                   │
│                                                                       │
│                                     ⑥ LangGraph 실행                 │
│                                     ⑦ SSE 이벤트 생성                │
│                                                                       │
│                    ◄───────────── SSE 스트림 ──────────               │
│  ◄─────────────────                                                   │
│                                                                       │
│  ⑧ SSE 이벤트 수신 및 변환:                                          │
│     event: message_partial                                            │
│     data: {"chunk": "응답 텍스트..."}                                │
│        → LlmStreamEvent { type: "content_delta", ... }               │
│                                                                       │
│     event: done                                                       │
│     data: {"message":"...", "thread_id":"...", "qa_id":"..."}        │
│        → LlmStreamEvent { type: "message_end", ... }                │
│                                                                       │
│  ⑨ thread_id 저장 (다음 요청에 재사용)                               │
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

#### 산출물

```
packages/core/src/providers/didim/
├── adapter.ts            # SSE 스트리밍 로직 확장           [MODIFY]
├── converter.ts          # SSE → LlmStreamEvent 변환 확장   [MODIFY]
├── sseParser.ts          # SSE 이벤트 파서 분리             [NEW]
└── types.ts              # SSE 이벤트 타입 확장             [MODIFY]
```

---

### M4.4: 통합 테스트 및 안정화 (2일)

#### 작업 항목

- [ ] API 클라이언트 단위 테스트
  - 시나리오 목록 조회 (페이지네이션, 필터링)
  - 에러 핸들링 (인증 실패, 네트워크 오류)
- [ ] SSE 파서 단위 테스트
  - 다양한 SSE 이벤트 형식 파싱
  - 불완전 이벤트, 다중 data 라인
- [ ] 통합 테스트
  - /model 명령어 → 시나리오 조회 → 선택 → SSE 대화 E2E 플로우
  - Thread 관리 (새 스레드, 기존 스레드)
- [ ] 엣지 케이스 처리
  - 빈 시나리오 목록
  - SSE 연결 타임아웃
  - 중간 연결 끊김 및 복구

---

## 4. 설정 및 인증

### 4.1 환경변수

```bash
# DidimAIStudio 연동 설정
LLM_PROVIDER=didim                              # 프로바이더 선택
DIDIM_BASE_URL=http://localhost:8008             # scenario-gateway URL
DIDIM_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx            # API Key (Bearer 토큰)
DIDIM_USER_ID=user-uuid                          # 사용자 ID
DIDIM_AGENT_API_URL=http://localhost:8003        # agents 서비스 URL (시나리오 조회용)
```

### 4.2 인증 흐름

```
┌──────────────────────────────────────────────────────────────────┐
│  시나리오 조회: agents 서비스 직접 호출                            │
│    GET http://{DIDIM_AGENT_API_URL}/v1/scenarios/my              │
│    → 별도 인증 필요 여부는 배포 환경에 따라 결정                  │
│                                                                    │
│  SSE 실행: scenario-gateway 경유                                  │
│    POST http://{DIDIM_BASE_URL}/api/v1/invoke/sse/improved       │
│    → Authorization: Bearer {DIDIM_API_KEY}                       │
│    → x-thread-id: {saved_thread_id} (optional)                   │
└──────────────────────────────────────────────────────────────────┘
```

> [!IMPORTANT] 시나리오 조회 API(`/v1/scenarios/my`, `/v1/agents/my`)와 실행
> API(`/api/v1/invoke/sse`)는 **서로 다른 서비스 엔드포인트**를 사용한다. 조회는
> agents 서비스(8003)에, 실행은 scenario-gateway(8008)를 경유한다. 배포 환경에
> 따라 인증 방식이 다를 수 있으므로 설정을 분리한다.

---

## 5. 핵심 제약사항 및 설계 결정

### 5.1 알려진 제약사항

| #   | 제약사항                           | 영향                                 | 대응                                                      |
| --- | ---------------------------------- | ------------------------------------ | --------------------------------------------------------- |
| C1  | gateway API는 `chat` 필드만 수신   | 시스템 프롬프트, 도구 정보 전달 불가 | 서버 측 시나리오 설정에 의존                              |
| C2  | Multi-turn 컨텍스트는 서버 관리    | CLI 측 히스토리 전달 불가            | `x-thread-id`를 통한 서버 측 컨텍스트 유지                |
| C3  | Tool call 이벤트 미지원            | `tool_call_delta` 스트림 이벤트 없음 | `supportsToolCalls: false` 설정                           |
| C4  | 시나리오 조회와 실행이 별도 서비스 | 인증/네트워크 설정 분리 필요         | 환경변수 분리 (`DIDIM_AGENT_API_URL` vs `DIDIM_BASE_URL`) |

### 5.2 설계 결정

| #   | 결정                                 | 근거                                                        |
| --- | ------------------------------------ | ----------------------------------------------------------- |
| D1  | `/model` 명령어 확장 (신규 명령어 X) | 기존 UX 패턴 유지, 프로바이더 전환과 자연스럽게 통합        |
| D2  | `scenario_my_page_id` 기반 실행      | API-Key에 바인딩된 시나리오 ID 사용 (gateway passport_data) |
| D3  | improved SSE 엔드포인트 사용         | LangGraph 세분화 이벤트 제공, 노드 진행 상황 가시성         |
| D4  | 마이페이지 API 우선 사용             | 사용자 컨텍스트 기반 필터링, 즐겨찾기 정렬 지원             |

---

## 6. 의존성 및 사전 조건

### 6.1 기술 의존성

| 의존성                          | 상태      | 비고                      |
| ------------------------------- | --------- | ------------------------- |
| M3.0 (Gemini 내부 리팩토링)     | ✅ 완료   | ProviderFactory 인프라    |
| M3.1 (Claude 어댑터)            | 🔄 진행중 | 어댑터 패턴 검증          |
| M3.3 (OpenAI-Compatible 템플릿) | 📋 계획   | baseUrl/headers 지원 기반 |
| `04-integration-design.md`      | ✅ 완료   | DidimAIStudio 연동 설계   |

### 6.2 인프라 사전 조건

- [ ] DidimAIStudio agents 서비스 접근 가능 (시나리오 조회용)
- [ ] DidimAIStudio scenario-gateway 접근 가능 (SSE 실행용)
- [ ] API Key 발급 및 시나리오 설정 완료
- [ ] 테스트용 시나리오 최소 1개 이상 등록

---

## 7. 리스크 관리

| ID  | 리스크                         | 확률 | 영향 | 대응                                |
| --- | ------------------------------ | ---- | ---- | ----------------------------------- |
| R1  | agents 서비스 인증 방식 불명확 | 중간 | 높음 | 배포 환경 확인 후 인증 레이어 추가  |
| R2  | SSE 이벤트 형식 변경           | 낮음 | 중간 | converter 추상화로 변경 영향 최소화 |
| R3  | 대량 시나리오 목록 성능        | 낮음 | 낮음 | 페이지네이션 + 캐싱 적용            |
| R4  | 네트워크 불안정 (SSE 끊김)     | 중간 | 중간 | 재연결 로직 + 사용자 알림           |

---

## 8. 검증 계획

### 8.1 자동 테스트

```bash
# API 클라이언트 단위 테스트
npm test -w @google/gemini-cli-core -- src/providers/didim/apiClient.test.ts

# SSE 파서 단위 테스트
npm test -w @google/gemini-cli-core -- src/providers/didim/sseParser.test.ts

# 시나리오 매니저 단위 테스트
npm test -w @google/gemini-cli-core -- src/providers/didim/scenarioManager.test.ts
```

### 8.2 수동 검증

1. **시나리오 조회 확인**
   - `LLM_PROVIDER=didim` 설정 후 Gemini CLI 실행
   - `/model` 입력 시 DidimAIStudio 시나리오 목록 표시 확인
   - 시나리오 이름, 설명, 카테고리가 올바르게 표시되는지 확인

2. **시나리오 선택 및 대화**
   - 목록에서 시나리오 선택 후 대화 시작
   - SSE 스트리밍으로 실시간 응답 수신 확인
   - 멀티턴 대화 시 thread_id 유지 확인

3. **에러 핸들링**
   - 잘못된 API Key로 인증 실패 처리 확인
   - 네트워크 끊김 시 적절한 에러 메시지 표시 확인

---

## 9. 일정 요약

| 마일스톤 | 작업                | 예상 기간 | 의존성           |
| -------- | ------------------- | --------- | ---------------- |
| M4.1     | API 클라이언트 구현 | 2일       | M3.3 완료        |
| M4.2     | /model UI 확장      | 3일       | M4.1 완료        |
| M4.3     | SSE 어댑터 구현     | 3일       | M4.1 완료        |
| M4.4     | 통합 테스트         | 2일       | M4.2 + M4.3 완료 |
| **합계** |                     | **10일**  |                  |

> [!NOTE] M4.2와 M4.3은 M4.1 완료 후 **병렬 진행** 가능하므로, 실제 소요 기간은
> 약 **7일**로 단축 가능.
