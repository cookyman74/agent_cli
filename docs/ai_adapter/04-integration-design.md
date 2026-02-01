# 04. DidimAIStudio 연동 설계

## 4.1 개요

### 4.1.1 목적

Gemini CLI의 Multi-LLM Provider Adapter 설계를 DidimAIStudio 솔루션과 연동하여 다음 목표를 달성합니다:

1.  **프로바이더 통합**: 두 시스템의 LLM 프로바이더 지원을 통합
2.  **설정 공유**: 모델 설정 및 API 키를 일관되게 관리
3.  **기능 재사용**: DidimAIStudio의 13+ 프로바이더 지원을 gemini-cli에서 활용
4.  **양방향 통신**: CLI ↔ 서버 간 원활한 데이터 교환

### 4.1.2 DidimAIStudio 솔루션 구조

> **소스코드 경로**: `/DidimAIStudio`
> **인프라 구성**: `/DidimAIStudio/infra/compose/docker-compose.base.yml`

DidimAIStudio는 마이크로서비스 아키텍처로 구성되어 있으며, Gemini CLI 연동에 핵심적인 서비스는 다음과 같습니다:

#### 핵심 서비스

| 서비스 | 포트 | 역할 | 소스 경로 |
|--------|------|------|-----------|
| **scenario-gateway** | 8008 | API 게이트웨이, API-Key 인증, 요청 라우팅 | `/services/scenario-gateway` |
| **agents** | 8003 | LLM 실행 엔진, 시나리오/워크플로우 처리 | `/services/agents` |

#### 관련 서비스

| 서비스 | 포트 | 역할 |
|--------|------|------|
| auth | 8000 | 사용자 인증/인가 |
| models | 8001 | 모델 프로파일 관리 |
| indexing | 8002 | 문서 인덱싱/RAG |
| cloud-storage | 8006 | 파일 스토리지 |
| mcp-tools | 8007 | MCP 도구 서버 |

### 4.1.3 시스템 비교

| 구분 | Gemini CLI | DidimAIStudio |
|------|------------|---------------------|
| **역할** | 클라이언트 CLI | 서버 마이크로서비스 |
| **언어** | TypeScript | Python |
| **프레임워크** | Node.js + Ink | FastAPI + LangGraph |
| **프로바이더** | Gemini (+ 어댑터 확장 예정) | 13+ (OpenAI, Claude, Gemini 등) |
| **스트리밍** | AsyncGenerator | SSE (Server-Sent Events) |
| **설정 저장** | 환경변수 + 로컬 파일 | Database + 환경변수 |
| **게이트웨이** | - | scenario-gateway (API-Key 인증) |

### 4.1.4 연동 범위

**In Scope (1차)**:
- 공통 타입 시스템 정의
- scenario-gateway를 통한 API 연동
- 메시지 형식 변환
- 프로바이더 설정 동기화
- 토큰 사용량 추적 통합

**Out of Scope (향후)**:
- 실시간 양방향 동기화
- 분산 트레이싱 통합
- 공유 메모리 시스템

## 4.2 연동 아키텍처

### 4.2.1 전체 구조

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User                                        │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
┌───────────────────────────────┐   ┌───────────────────────────────────┐
│         Gemini CLI            │   │     DidimAIStudio Web App         │
│       (Terminal Client)       │   │        (Browser Client)           │
└───────────────┬───────────────┘   └─────────────────┬─────────────────┘
                │                                     │
                │                                     │
                ▼                                     │
┌───────────────────────────────────────────────────────────────────────┐
│                         Integration Layer                              │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    DidimAIStudioAdapter                          │  │
│  │                    (gemini-cli 내부)                             │  │
│  │                                                                  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │  │
│  │  │   Request    │  │   Response   │  │   Stream     │           │  │
│  │  │  Converter   │  │  Converter   │  │  Adapter     │           │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────┬───────────────────────────────────┘
                                    │
                                    │ HTTP/SSE
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                 DidimAIStudio Solution (Microservices)                 │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │              scenario-gateway (Port 8008)                        │  │
│  │              API-Key 인증 게이트웨이                              │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │  │
│  │  │  /invoke     │  │ /invoke/sse  │  │/invoke/sse/  │           │  │
│  │  │  (REST)      │  │ (Streaming)  │  │  improved    │           │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │  │
│  │            ↓              ↓              ↓                       │  │
│  │  ┌─────────────────────────────────────────────────┐            │  │
│  │  │ - API-Key 검증 (ApiKeyAuthMiddleware)           │            │  │
│  │  │ - IP 검증, Rate Limiting                        │            │  │
│  │  │ - x-thread-id 헤더 처리 (새 Thread vs 기존)     │            │  │
│  │  │ - WebSocket Key (qa_id) 발급                    │            │  │
│  │  └─────────────────────────────────────────────────┘            │  │
│  └──────────────────────────────┬──────────────────────────────────┘  │
│                                 │ HTTP/SSE                             │
│                                 ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                  agents (Port 8003)                              │  │
│  │                  LLM 실행 엔진                                    │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │  │
│  │  │ /v1/invoke   │  │/v1/invoke/sse│  │/v1/websocket │           │  │
│  │  │              │  │ /improved    │  │   -keys      │           │  │
│  │  └──────────────┘  └──────────────┘  └──────────────┘           │  │
│  │                                    │                             │  │
│  │  ┌─────────────────────────────────▼───────────────────────────┐│  │
│  │  │                  LangGraph Runtime                           ││  │
│  │  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐    ││  │
│  │  │  │ OpenAI │ │ Claude │ │ Gemini │ │Bedrock │ │ vLLM   │... ││  │
│  │  │  └────────┘ └────────┘ └────────┘ └────────┘ └────────┘    ││  │
│  │  └─────────────────────────────────────────────────────────────┘│  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.2.2 서비스 간 통신 흐름

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    요청 흐름 (Request Flow)                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐                                                        │
│  │ Gemini CLI  │                                                        │
│  │ (Request)   │                                                        │
│  └──────┬──────┘                                                        │
│         │                                                               │
│         │ POST /api/v1/invoke/sse                                       │
│         │ Headers: Authorization: Bearer <API-KEY>                       │
│         │          x-thread-id: <thread-id> (optional)                  │
│         │ Body: { "chat": "사용자 메시지" }                              │
│         ▼                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │              scenario-gateway (:8008)                            │   │
│  │                                                                  │   │
│  │  1. API-Key 검증 (ApiKeyAuthMiddleware)                         │   │
│  │  2. passport_data 추출 (user_id, my_scenario_id)                │   │
│  │  3. x-thread-id 헤더 확인:                                       │   │
│  │     - 없음: 새 Thread + qa_id 생성 (POST /v1/websocket-keys)    │   │
│  │     - 있음: 기존 Thread에 qa_id 발급 (/v1/websocket-keys/with-thread-id) │
│  │  4. AgentsInvokeRequest 구성                                     │   │
│  └──────────────────────────────┬──────────────────────────────────┘   │
│                                 │                                       │
│         POST http://agents:8003/v1/invoke/sse                          │
│         Body: {                                                         │
│           "scenario_my_page_id": 123,                                  │
│           "user_id": "user-uuid",                                       │
│           "thread_id": "thread-uuid",                                   │
│           "qa_id": "qa-uuid",                                          │
│           "message": "사용자 메시지",                                   │
│           "attachments": null                                          │
│         }                                                               │
│                                 ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    agents (:8003)                                │   │
│  │                                                                  │   │
│  │  1. 시나리오 조회 (scenario_my_page_id)                         │   │
│  │  2. LangGraph 워크플로우 실행                                   │   │
│  │  3. SSE 스트리밍 응답 생성                                      │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2.3 연동 모드

#### 모드 A: Direct Provider (기본)

gemini-cli가 직접 LLM API를 호출합니다.

```
Gemini CLI ──► Provider Adapter ──► LLM API (OpenAI/Claude/Gemini)
```

**사용 시나리오**: 단독 CLI 사용, 빠른 응답 필요

**설정**:
```typescript
// 환경변수 또는 config에서 설정
LLM_PROVIDER=gemini  // gemini | claude | openai | vllm
GEMINI_API_KEY=...
```

> ⚠️ **Direct 모드 구현 상태**: 현재 `03-technical-design.md`의 GeminiAdapter, ClaudeAdapter, OpenAIAdapter 설계에 해당합니다. DidimAIStudioAdapter와는 별개의 코드 경로입니다.

#### 모드 B: Gateway Mode (DidimAIStudio 연동)

gemini-cli가 DidimAIStudio를 통해 LLM API를 호출합니다.

```
Gemini CLI ──► DidimAIStudioAdapter ──► scenario-gateway ──► agents ──► LLM API
```

**사용 시나리오**:
- DidimAIStudio의 고급 기능 활용 (에이전트 워크플로우, 메모리)
- 중앙 집중식 API 키 관리
- 사용량 추적 및 비용 관리

**설정**:
```typescript
// 환경변수 또는 config에서 설정
LLM_PROVIDER=didim
DIDIM_BASE_URL=http://localhost:8008
DIDIM_API_KEY=...
```

> ⚠️ **엔드포인트 선택 (M2 관련)**:
> - `/api/v1/invoke/sse`: 기본 SSE 스트리밍
> - `/api/v1/invoke/sse/improved`: LangGraph 세분화 SSE (권장)
> 
> 현재 어댑터는 **`/api/v1/invoke/sse/improved`를 사용**합니다.

### 4.2.4 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Request Flow                                    │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────┐    │
│  │ User Input  │────▶│ LlmGenerateReq  │────▶│ ScenarioSSERequestDTO│    │
│  │ (CLI)       │     │ (gemini-cli)    │     │ (scenario-gateway)  │    │
│  └─────────────┘     └─────────────────┘     └───────────┬─────────┘    │
│                                                          │              │
│                                                          ▼              │
│                                              ┌─────────────────────┐    │
│                                              │ AgentsInvokeRequest │    │
│                                              │ (agents service)    │    │
│                                              └───────────┬─────────┘    │
│                                                          │              │
│                                                          ▼              │
│                                              ┌─────────────────────┐    │
│                                              │ LangGraph Runtime   │    │
│                                              │ Processing          │    │
│                                              └─────────────────────┘    │
│                                                          │              │
├─────────────────────────────────────────────────────────────────────────┤
│                          Response Flow                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                          │              │
│                                                          ▼              │
│  ┌─────────────┐     ┌─────────────────┐     ┌─────────────────────┐    │
│  │ CLI Output  │◀────│ LlmStreamEvent  │◀────│ SSE Events          │    │
│  │ (Stream)    │     │ (gemini-cli)    │     │ (message_partial,   │    │
│  └─────────────┘     └─────────────────┘     │ message_complete,   │    │
│                                              │ done, error)        │    │
│                                              └─────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## 4.3 공통 타입 시스템

### 4.3.1 DidimAIStudio 실제 DTO 구조

> **소스 참조**: `/services/scenario-gateway/app/dto/agents_dto.py`

#### scenario-gateway 입력 DTO

```python
# ScenarioSSERequestDTO - Gemini CLI → scenario-gateway
class ScenarioSSERequestDTO(BaseModel):
    chat: str  # 채팅 메시지 (1-10000자)
```

#### agents 서비스 요청 DTO

```python
# AgentsInvokeRequest - scenario-gateway → agents
class AgentsInvokeRequest(BaseModel):
    scenario_my_page_id: int      # 시나리오 마이페이지 ID
    user_id: str                  # 사용자 ID
    thread_id: str                # 대화 흐름 구분 ID
    qa_id: str                    # 질문-응답 단위 ID
    message: str                  # 사용자 메시지 (1-50000자)
    attachments: Optional[List[str]]  # 첨부파일 URL 목록
```

#### agents 서비스 응답 DTO

```python
# AgentsInvokeResponse - agents → scenario-gateway
class AgentsInvokeResponse(BaseModel):
    qa_id: str                    # 질문-응답 단위 ID
    message: Optional[str]        # 텍스트 응답
    attachments: Optional[List[str]]  # 첨부파일 URL 목록
    status: Optional[str]         # success|error|processing|timeout
    error_code: Optional[str]     # 오류 코드
```

### 4.3.2 타입 매핑 테이블

#### 메시지 타입

| Gemini CLI | DidimAIStudio | 설명 |
|------------|---------------|------|
| `LlmMessage` | `BaseMessage` (LangChain) | 기본 메시지 |
| `LlmTextContent` | `message: str` | 텍스트 내용 |
| `LlmImageContent` | `attachments: List[str]` | 이미지 URL |
| `LlmToolCallContent` | `ToolCall` (LangGraph) | 도구 호출 |
| `LlmToolResultContent` | `ToolMessage` (LangGraph) | 도구 결과 |

#### 요청/응답 타입

| Gemini CLI | DidimAIStudio (scenario-gateway) | DidimAIStudio (agents) | 비고 |
|------------|----------------------------------|------------------------|------|
| `LlmGenerateRequest` | `ScenarioSSERequestDTO` | `AgentsInvokeRequest` | ⚠️ chat 필드만 전달됨 |
| `LlmGenerateResponse` | SSE `done` event | `AgentsInvokeResponse` | |
| `LlmStreamEvent` | SSE Events | SSE Events | |
| `LlmTokenUsage` | `token_summary` | `total_tokens` | |

> ⚠️ **제한사항**:
> - `LlmGenerateRequest`의 `messages[]`, `tools[]`, `systemInstruction`은 현재 gateway API로 전달 불가
> - Multi-turn 컨텍스트는 서버 측 thread 관리에 의존

#### SSE 이벤트 타입 매핑

| Gemini CLI `LlmStreamEvent.type` | DidimAIStudio SSE Event | 설명 | 비고 |
|----------------------------------|-------------------------|------|------|
| `content_delta` | `message`, `content` | 텍스트 청크 | |
| `content_delta` | `message_partial` | 토큰 스트리밍 | improved SSE |
| `content_delta` (metadata) | `message_metadata` | 실행 컨텍스트 | improved SSE |
| `content_delta` (metadata) | `process` | 노드 진행 상황 | improved SSE |
| `message_end` | `done` | 응답 완료 | threadId, qaId 포함 |
| `error` | `error` | 에러 발생 | |

> ⚠️ **tool_call_delta 미지원**: 현재 gateway API는 tool 정보를 입/출력하지 않으므로 `tool_call_delta` 이벤트는 발생하지 않습니다.

#### 완료 상태 매핑

| Gemini CLI `LlmStopReason` | DidimAIStudio SSE Event |
|---------------------------|-------------------------|
| `end_turn` | `done` event |
| `max_tokens` | `done` with truncation |
| `tool_use` | `process` (tool_start) |
| `content_filter` | `error` (CONTENT_FILTER) |
| `error` | `error` event |

### 4.3.3 공통 인터페이스 정의

#### TypeScript (gemini-cli)

```typescript
// packages/core/src/providers/didim/types.ts

/**
 * DidimAIStudio 연동을 위한 공통 타입
 * 실제 DidimAIStudio DTO 구조 기반
 */

// scenario-gateway 입력 (POST /api/v1/invoke/sse)
export interface ScenarioSSERequestDTO {
  chat: string;  // 채팅 메시지 (1-10000자)
}

// agents 서비스 요청 (내부 통신용, scenario-gateway → agents)
export interface AgentsInvokeRequest {
  scenario_my_page_id: number;    // 시나리오 마이페이지 ID
  user_id: string;                // 사용자 ID
  thread_id: string;              // 대화 흐름 구분 ID
  qa_id: string;                  // 질문-응답 단위 ID
  message: string;                // 사용자 메시지
  attachments?: string[] | null;  // 첨부파일 URL 목록
}

// agents 서비스 응답
export interface AgentsInvokeResponse {
  qa_id: string;
  message?: string | null;
  attachments?: string[] | null;
  status?: 'success' | 'error' | 'processing' | 'timeout';
  error_code?: string | null;
}

// WebSocket Key 생성 DTO
export interface WebSocketKeyCreateDTO {
  user_id: string;
  scenario_my_page_id?: number;
}

// WebSocket Key 응답 DTO
export interface WebSocketKeyResponseDTO {
  id: number;
  user_id: string;
  scenario_my_page_id?: number;
  thread_id: string;     // 스레드 ID
  qa_id: string;         // QA ID
  created_at: string;
  updated_at: string;
}

// SSE 이벤트 타입
export type DidimSSEEventType =
  | 'message'           // 기본 메시지 청크
  | 'content'           // 콘텐츠 청크
  | 'message_partial'   // 토큰 스트리밍 (improved)
  | 'message_complete'  // 메시지 완료 (improved)
  | 'message_metadata'  // 실행 컨텍스트 (improved)
  | 'process'           // 노드 진행 상황 (improved)
  | 'done'              // 응답 완료
  | 'error';            // 에러

// SSE 청크 데이터
export interface SSEChatChunk {
  chunk?: string;
  scenario_id?: string;
  thread_id?: string;
}

// SSE 완료 데이터
export interface SSEDoneData {
  message: string;
  scenario_id: string;
  thread_id: string;
  qa_id: string;
}

// SSE 에러 데이터
export interface SSEErrorData {
  error: string;
  error_code?: string;
}

// 채팅 응답 (비스트리밍)
export interface ChatResponse {
  response: string;
  scenario_id: string;
  thread_id: string;
  timestamp: string;
}
```

#### Python (DidimAIStudio) - 신규 연동 API용

```python
# services/agents/app/schemas/integration/gemini_cli.py

from pydantic import BaseModel
from typing import Optional, Union, List, Dict, Any
from enum import Enum

class LlmStopReason(str, Enum):
    END_TURN = "end_turn"
    MAX_TOKENS = "max_tokens"
    STOP_SEQUENCE = "stop_sequence"
    TOOL_USE = "tool_use"
    CONTENT_FILTER = "content_filter"
    ERROR = "error"

class LlmTextContent(BaseModel):
    type: str = "text"
    text: str

class LlmImageContent(BaseModel):
    type: str = "image"
    source: Dict[str, str]  # type, mediaType, data

class LlmToolCallContent(BaseModel):
    type: str = "tool_call"
    id: str
    name: str
    arguments: Dict[str, Any]

class LlmMessage(BaseModel):
    role: str  # user, assistant, system, tool
    content: List[Union[LlmTextContent, LlmImageContent, LlmToolCallContent]]
    name: Optional[str] = None
    tool_call_id: Optional[str] = None

class LlmGenerateRequest(BaseModel):
    """Gemini CLI 요청 형식"""
    model: str
    messages: List[LlmMessage]
    system_instruction: Optional[str] = None
    tools: Optional[List[Dict]] = None
    tool_choice: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    stop_sequences: Optional[List[str]] = None
    top_p: Optional[float] = None
    top_k: Optional[int] = None

class LlmTokenUsage(BaseModel):
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int
    cached_tokens: Optional[int] = None

class LlmGenerateResponse(BaseModel):
    """Gemini CLI 응답 형식"""
    id: str
    content: List[Union[LlmTextContent, LlmToolCallContent]]
    model: str
    stop_reason: LlmStopReason
    usage: LlmTokenUsage
    raw_response: Optional[Dict] = None
```

## 4.4 어댑터 구현

### 4.4.1 DidimAIStudio 실제 API 엔드포인트

> **소스 참조**:
> - `/services/scenario-gateway/app/api/v1/endpoints/scenario_api.py`
> - `/services/agents/app/api/v1/router.py`

#### scenario-gateway 엔드포인트 (Port 8008)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/v1/invoke` | 비스트리밍 채팅 요청 |
| POST | `/api/v1/invoke/sse` | SSE 스트리밍 채팅 |
| POST | `/api/v1/invoke/sse/improved` | LangGraph 호환 세분화 SSE |
| GET | `/health` | 헬스 체크 |
| GET | `/metrics` | Prometheus 메트릭 |

#### agents 엔드포인트 (Port 8003) - 내부 통신

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/v1/invoke` | 비스트리밍 실행 |
| POST | `/v1/invoke/sse` | SSE 스트리밍 실행 |
| POST | `/v1/invoke/sse/improved` | 세분화 SSE 스트리밍 |
| POST | `/v1/websocket-keys` | 새 Thread + qa_id 생성 |
| POST | `/v1/websocket-keys/with-thread-id` | 기존 Thread에 qa_id 발급 |
| POST | `/v1/chats` | 채팅 종료 (토큰 집계) |
| GET | `/v1/scenarios` | 시나리오 조회 |
| GET | `/v1/threads` | Thread 조회 |

### 4.4.2 DidimAIStudio 어댑터 (gemini-cli)

```typescript
// packages/core/src/providers/didim/adapter.ts

import { BaseAdapter, AdapterConfig } from '../baseAdapter';
import {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmStream,
  LlmStreamEvent,
  ProviderCapabilities,
} from '../types';
import {
  ScenarioSSERequestDTO,
  ChatResponse,
  SSEDoneData,
  SSEErrorData,
  DidimSSEEventType,
} from './types';
import { DidimTypeConverter } from './converter';

export interface DidimAdapterConfig extends AdapterConfig {
  baseUrl: string;           // scenario-gateway URL (예: http://localhost:8008)
  apiKey: string;            // API Key (Bearer 토큰)
  threadId?: string;         // 기존 대화 스레드 ID (선택적)
}

export class DidimAIStudioAdapter extends BaseAdapter {
  readonly providerName = 'didim-aistudio';
  /**
   * Capabilities - 실제 scenario-gateway API 지원 범위 기반
   * 
   * ⚠️ 제한사항:
   * - Tool/Attachment는 현재 ScenarioSSERequestDTO(chat만 수신)로 전달 불가
   * - Embedding/TokenCount는 사후 추정값만 제공 (사전 API 없음)
   * - System message는 시나리오 설정에 포함되어야 함 (요청 시 전달 불가)
   */
  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: false,       // ⚠️ 현재 gateway API로 tool 정보 전달 불가
    supportsImageInput: false,      // ⚠️ attachments는 gateway 내부에서만 처리
    supportsImageGeneration: false,
    supportsEmbedding: false,       // ⚠️ Didim API에 사전 embedding endpoint 없음
    supportsTokenCount: false,      // ⚠️ 사전 token count API 없음 (추정값만 가능)
    supportsSystemMessage: false,   // ⚠️ 시나리오 설정에 포함, 요청 시 전달 불가
    maxContextLength: 200_000,      // 시나리오에 설정된 모델에 따라 다름
    maxOutputTokens: 32_768,
  };

  private converter: DidimTypeConverter;
  private config: DidimAdapterConfig;
  private currentThreadId?: string;

  constructor(config: DidimAdapterConfig) {
    super(config);
    this.config = config;
    this.converter = new DidimTypeConverter();
    this.currentThreadId = config.threadId;
  }

  /**
   * ⚠️ 알려진 제한사항 (H3):
   * - ScenarioSSERequestDTO가 "chat" 필드만 받으므로, 마지막 사용자 메시지만 전송됨
   * - 시스템 메시지, 이전 대화 히스토리, 도구 컨텍스트는 전달되지 않음
   * - Multi-turn 품질은 DidimAIStudio 서버 측 thread 관리에 의존
   * 
   * TODO: 전용 API 확장 시 LlmGenerateRequest 전체를 전달하도록 개선
   */
  async generateContent(
    request: LlmGenerateRequest,
    options?: GenerateOptions
  ): Promise<LlmGenerateResponse> {
    // 마지막 사용자 메시지만 추출 (API 제약으로 인한 제한)
    const chatMessage = this.converter.extractLastUserMessage(request);

    const response = await fetch(`${this.config.baseUrl}/api/v1/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...(this.currentThreadId && { 'x-thread-id': this.currentThreadId }),
      },
      body: JSON.stringify({ chat: chatMessage }),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`Didim AI generation failed: ${response.statusText}`);
    }

    const data: ChatResponse = await response.json();

    // thread_id 저장 (다음 요청에 사용)
    this.currentThreadId = data.thread_id;

    return this.converter.toChatResponseToLlm(data, request.model);
  }

  async generateContentStream(
    request: LlmGenerateRequest,
    options?: GenerateOptions
  ): Promise<LlmStream> {
    this.validateRequest(request);
    return this.createSSEStream(request, options);
  }

  async countTokens(request: LlmGenerateRequest): Promise<LlmTokenCount> {
    // DidimAIStudio는 응답 시 토큰 정보 제공
    // 사전 카운트는 추정값 사용
    const text = this.converter.extractText(request);
    return { totalTokens: Math.ceil(text.length / 4) };
  }

  private async *createSSEStream(
    request: LlmGenerateRequest,
    options?: GenerateOptions
  ): LlmStream {
    const chatMessage = this.converter.extractLastUserMessage(request);

    const response = await fetch(`${this.config.baseUrl}/api/v1/invoke/sse/improved`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Accept': 'text/event-stream',
        ...(this.currentThreadId && { 'x-thread-id': this.currentThreadId }),
      },
      body: JSON.stringify({ chat: chatMessage }),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`SSE connection failed: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 완전한 SSE 이벤트 추출 (\n\n로 구분)
        while (buffer.includes('\n\n')) {
          const eventEnd = buffer.indexOf('\n\n');
          const completeEvent = buffer.substring(0, eventEnd);
          buffer = buffer.substring(eventEnd + 2);

          if (completeEvent.trim()) {
            const event = this.parseSSEEvent(completeEvent);
            if (event) {
              // thread_id 저장
              if (event.threadId) {
                this.currentThreadId = event.threadId;
              }
              yield this.converter.toStreamEvent(event);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * SSE 이벤트 파싱 (M1 개선)
   * - 다중 data: 라인 지원
   * - event: 없는 기본 이벤트 처리
   * - \r\n 및 \n 구분자 모두 처리
   */
  private parseSSEEvent(eventText: string): ParsedSSEEvent | null {
    // \r\n과 \n 모두 지원
    const lines = eventText.replace(/\r\n/g, '\n').split('\n');
    let eventType: string | null = null;
    const dataLines: string[] = [];
    let eventId: string | null = null;

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventType = line.substring(6).trim();
      } else if (line.startsWith('data:')) {
        // 다중 data: 라인 수집
        dataLines.push(line.substring(5).trim());
      } else if (line.startsWith('id:')) {
        eventId = line.substring(3).trim();
      }
    }

    // data 라인들을 줄바꿈으로 결합
    const data = dataLines.join('\n');

    // event: 없이 data:만 있는 SSE도 처리 (기본 이벤트)
    if (!data) return null;
    if (!eventType) eventType = 'message'; // 기본 이벤트 타입

    try {
      const parsed = JSON.parse(data);
      return { 
        eventType, 
        data: parsed, 
        eventId,
        // H1 수정: data에서 threadId 추출
        threadId: parsed.thread_id || parsed.threadId,
        qaId: parsed.qa_id || parsed.qaId,
      };
    } catch {
      return { eventType, data: { chunk: data }, eventId };
    }
  }
}

interface ParsedSSEEvent {
  eventType: string;
  data: any;
  eventId: string | null;
  threadId?: string;  // H1: data에서 추출된 threadId
  qaId?: string;      // data에서 추출된 qaId
}
```

### 4.4.3 타입 변환기 (gemini-cli)

```typescript
// packages/core/src/providers/didim/converter.ts

import {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmMessage,
  LlmStreamEvent,
  LlmStopReason,
  LlmTextContent,
  LlmTokenUsage,
} from '../types';
import {
  ChatResponse,
  SSEDoneData,
  SSEErrorData,
  DidimSSEEventType,
} from './types';

export class DidimTypeConverter {
  /**
   * 마지막 사용자 메시지 추출
   */
  extractLastUserMessage(request: LlmGenerateRequest): string {
    const userMessages = request.messages.filter(m => m.role === 'user');
    if (userMessages.length === 0) return '';

    const lastMessage = userMessages[userMessages.length - 1];
    const texts = lastMessage.content
      .filter((c): c is LlmTextContent => c.type === 'text')
      .map(c => c.text);

    return texts.join('\n');
  }

  /**
   * 전체 텍스트 추출 (토큰 카운트용)
   */
  extractText(request: LlmGenerateRequest): string {
    const texts: string[] = [];
    for (const message of request.messages) {
      for (const content of message.content) {
        if (content.type === 'text') {
          texts.push((content as LlmTextContent).text);
        }
      }
    }
    return texts.join('\n');
  }

  /**
   * 첨부 파일 URL 추출
   */
  extractAttachments(messages: LlmMessage[]): string[] {
    const attachments: string[] = [];
    for (const message of messages) {
      for (const content of message.content) {
        if (content.type === 'image' && content.source?.type === 'url') {
          attachments.push(content.source.data);
        }
      }
    }
    return attachments;
  }

  /**
   * ChatResponse → LlmGenerateResponse 변환
   */
  toChatResponseToLlm(response: ChatResponse, model: string): LlmGenerateResponse {
    return {
      id: response.thread_id,
      content: [{ type: 'text', text: response.response }],
      model,
      stopReason: 'end_turn' as LlmStopReason,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      },
    };
  }

  /**
   * SSE 이벤트 → LlmStreamEvent 변환
   */
  toStreamEvent(event: { eventType: string; data: any; eventId: string | null }): LlmStreamEvent {
    const { eventType, data } = event;

    switch (eventType) {
      case 'message':
      case 'content':
      case 'message_partial':
        // 텍스트 청크
        return {
          type: 'content_delta',
          delta: { text: data.chunk || data.message || '' },
        };

      case 'message_complete':
        // 도구 완료 또는 메시지 완료
        if (data.process_name) {
          return {
            type: 'tool_call_delta',
            delta: {
              toolCall: {
                type: 'tool_call',
                id: data.id || 'unknown',
                name: data.process_name,
                arguments: data.process_output || {},
              },
            },
          };
        }
        return {
          type: 'content_delta',
          delta: { text: data.message || '' },
        };

      case 'message_metadata':
        // 실행 컨텍스트 (improved SSE)
        return {
          type: 'content_delta',
          delta: {},
          metadata: {
            langgraphNode: data.langgraph_node,
            step: data.step,
            model: data.model,
          },
        };

      case 'process':
        // 노드 진행 상황
        return {
          type: 'content_delta',
          delta: {},
          metadata: {
            processName: data.process_name,
            processType: data.process_type,
          },
        };

      case 'done':
        // 응답 완료
        const doneData = data as SSEDoneData;
        return {
          type: 'message_end',
          usage: {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
          },
          threadId: doneData.thread_id,
          qaId: doneData.qa_id,
        };

      case 'error':
        // 에러
        const errorData = data as SSEErrorData;
        return {
          type: 'error',
          error: {
            type: errorData.error_code || 'unknown',
            message: errorData.error,
          },
        };

      default:
        return {
          type: 'content_delta',
          delta: {},
        };
    }
  }
}
```

### 4.4.4 기존 API 활용 방안 (DidimAIStudio)

> **핵심**: Gemini CLI는 scenario-gateway의 기존 API를 그대로 활용합니다.
> 별도의 `/gemini-cli` 전용 API를 만들지 않고, 기존 `/api/v1/invoke/sse` 엔드포인트를 사용합니다.

#### 기존 API 흐름 (scenario_api.py)

```python
# /services/scenario-gateway/app/api/v1/endpoints/scenario_api.py

# 현재 구조:
# POST /api/v1/invoke/sse
#   1. API-Key 인증 (ApiKeyAuthMiddleware)
#   2. passport_data에서 user_id, my_scenario_id 추출
#   3. x-thread-id 헤더 확인 → WebSocket Key 생성/조회
#   4. AgentsInvokeRequest 구성
#   5. agents 서비스 호출 (http://agents:8003/v1/invoke/sse)
#   6. SSE 스트리밍 응답 전달

@router.post("/invoke/sse")
async def scenario_request_sse(
    request_data: ScenarioSSERequestDTO,  # { "chat": "메시지" }
    request: Request,
    x_thread_id: str = Header(None, alias="x-thread-id"),
    x_dooray_info_key: str = Header(None, alias="x-dooray-info-key")
):
    # ... 기존 구현 활용
```

#### Gemini CLI 연동 시 추가 고려사항

1. **API-Key 발급**: Gemini CLI 사용자에게 DidimAIStudio API-Key 발급
2. **시나리오 매핑**: 사용자별 기본 시나리오 설정 또는 CLI에서 지정
3. **응답 포맷**: 기존 SSE 응답을 그대로 사용하되, gemini-cli에서 파싱

#### 옵션: Gemini CLI 전용 API (선택적 확장)

```python
# /services/scenario-gateway/app/api/v1/endpoints/gemini_cli_api.py (선택적)

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import AsyncGenerator
import json

from app.schemas.integration.gemini_cli import (
    LlmGenerateRequest,
    LlmGenerateResponse,
    LlmStreamEvent,
)
from app.service.integration.gemini_cli_service import GeminiCLIService
from app.core.auth import get_api_key_user

router = APIRouter(prefix="/api/v1/gemini-cli", tags=["gemini-cli"])

@router.post("/generate")
async def generate_content(
    request: LlmGenerateRequest,
    current_user = Depends(get_api_key_user),
    service: GeminiCLIService = Depends()
) -> LlmGenerateResponse:
    """
    Gemini CLI 호환 콘텐츠 생성 API (비스트리밍)
    LlmGenerateRequest 형식을 직접 받아 처리
    """
    return await service.generate(request, current_user)


@router.post("/generate/stream")
async def generate_content_stream(
    request: LlmGenerateRequest,
    current_user = Depends(get_api_key_user),
    service: GeminiCLIService = Depends()
) -> StreamingResponse:
    """
    Gemini CLI 호환 콘텐츠 생성 API (스트리밍)
    LlmStreamEvent 형식으로 응답
    """
    async def event_generator() -> AsyncGenerator[str, None]:
        async for event in service.generate_stream(request, current_user):
            yield f"data: {json.dumps(event.dict())}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
```

### 4.4.5 연동 서비스 (DidimAIStudio - 선택적 확장용)

```python
# /services/scenario-gateway/app/service/integration/gemini_cli_service.py

from typing import AsyncGenerator
import uuid
import httpx
import json

from app.schemas.integration.gemini_cli import (
    LlmGenerateRequest,
    LlmGenerateResponse,
    LlmStreamEvent,
    LlmTokenUsage,
    LlmTextContent,
    LlmStopReason,
)
from app.dto.agents_dto import AgentsInvokeRequest, AgentsInvokeResponse
from app.service.integration.gemini_cli_converter import GeminiCLIConverter

# 내부 agents 서비스 URL
AGENTS_URL_SSE = "http://agents:8003/v1/invoke/sse/improved"


class GeminiCLIService:
    def __init__(self, converter: GeminiCLIConverter):
        self.converter = converter

    async def generate(
        self,
        request: LlmGenerateRequest,
        user
    ) -> LlmGenerateResponse:
        """비스트리밍 콘텐츠 생성"""
        # 스트리밍으로 전체 응답 수집
        full_content = ""
        total_tokens = 0

        async for event in self.generate_stream(request, user):
            if event.type == "content_delta" and event.delta:
                full_content += event.delta.get("text", "")
            if event.usage:
                total_tokens = event.usage.total_tokens

        return LlmGenerateResponse(
            id=str(uuid.uuid4()),
            content=[LlmTextContent(type="text", text=full_content)],
            model=request.model,
            stop_reason=LlmStopReason.END_TURN,
            usage=LlmTokenUsage(
                prompt_tokens=0,
                completion_tokens=0,
                total_tokens=total_tokens
            )
        )

    async def generate_stream(
        self,
        request: LlmGenerateRequest,
        user
    ) -> AsyncGenerator[LlmStreamEvent, None]:
        """스트리밍 콘텐츠 생성"""
        # Gemini CLI 요청 → AgentsInvokeRequest 변환
        agents_request = self.converter.to_agents_request(request, user)

        # agents 서비스 스트리밍 호출
        async with httpx.AsyncClient(timeout=200.0) as client:
            async with client.stream(
                "POST",
                AGENTS_URL_SSE,
                json=agents_request.model_dump(),
                headers={"Content-Type": "application/json"}
            ) as response:
                response.raise_for_status()

                buffer = ""
                async for chunk in response.aiter_bytes():
                    buffer += chunk.decode('utf-8', errors='ignore')

                    while '\n\n' in buffer:
                        event_end = buffer.find('\n\n')
                        complete_event = buffer[:event_end]
                        buffer = buffer[event_end + 2:]

                        if complete_event.strip():
                            event = self._parse_sse_event(complete_event)
                            if event:
                                yield self.converter.to_stream_event(event)

    async def count_tokens(
        self,
        request: LlmGenerateRequest,
        user
    ) -> int:
        """토큰 수 계산"""
        text = self.converter.extract_text(request)
        return len(text) // 4

    def _parse_sse_event(self, event_text: str) -> dict | None:
        """SSE 이벤트 파싱"""
        lines = event_text.split('\n')
        event_type = None
        data = None

        for line in lines:
            if line.startswith('event: '):
                event_type = line[7:]
            elif line.startswith('data: '):
                try:
                    data = json.loads(line[6:])
                except json.JSONDecodeError:
                    data = {"chunk": line[6:]}

        if event_type and data:
            return {"event_type": event_type, "data": data}
        return None
```

### 4.4.6 변환기 (DidimAIStudio - 선택적 확장용)

```python
# /services/scenario-gateway/app/service/integration/gemini_cli_converter.py

from typing import List, Dict, Any, Optional
import uuid

from app.schemas.integration.gemini_cli import (
    LlmGenerateRequest,
    LlmMessage,
    LlmStreamEvent,
    LlmStopReason,
)
from app.dto.agents_dto import AgentsInvokeRequest


class GeminiCLIConverter:
    """Gemini CLI ↔ DidimAIStudio 형식 변환"""

    def to_agents_request(
        self,
        request: LlmGenerateRequest,
        user
    ) -> AgentsInvokeRequest:
        """LlmGenerateRequest → AgentsInvokeRequest"""
        # 마지막 사용자 메시지 추출
        last_message = self._extract_last_user_message(request.messages)

        # 첨부 파일 추출
        attachments = self._extract_attachments(request.messages)

        return AgentsInvokeRequest(
            scenario_my_page_id=user.default_scenario_id,
            user_id=str(user.id),
            thread_id=str(uuid.uuid4()),
            qa_id=str(uuid.uuid4()),
            message=last_message,
            attachments=attachments if attachments else None
        )

    def to_stream_event(self, event: dict) -> LlmStreamEvent:
        """SSE 이벤트 → LlmStreamEvent"""
        event_type = event.get("event_type")
        data = event.get("data", {})

        handlers = {
            "message": self._handle_message,
            "content": self._handle_message,
            "message_partial": self._handle_partial,
            "message_complete": self._handle_complete,
            "message_metadata": self._handle_metadata,
            "process": self._handle_process,
            "done": self._handle_done,
            "error": self._handle_error,
        }

        handler = handlers.get(event_type, self._handle_unknown)
        return handler(data)

    def extract_text(self, request: LlmGenerateRequest) -> str:
        """요청에서 전체 텍스트 추출"""
        texts = []
        for message in request.messages:
            for content in message.content:
                if content.type == "text":
                    texts.append(content.text)
        return "\n".join(texts)

    # === Private Methods ===

    def _extract_last_user_message(
        self,
        messages: List[LlmMessage]
    ) -> str:
        """마지막 사용자 메시지 추출"""
        user_messages = [m for m in messages if m.role == "user"]
        if not user_messages:
            return ""

        last = user_messages[-1]
        texts = [c.text for c in last.content if c.type == "text"]
        return "\n".join(texts)

    def _extract_attachments(
        self,
        messages: List[LlmMessage]
    ) -> List[str]:
        """이미지 URL 등 첨부 파일 추출"""
        attachments = []
        for message in messages:
            for content in message.content:
                if content.type == "image":
                    if content.source.get("type") == "url":
                        attachments.append(content.source["data"])
        return attachments

    def _handle_message(self, data: dict) -> LlmStreamEvent:
        """message/content 이벤트 처리"""
        chunk = data.get("chunk", data.get("message", ""))
        return LlmStreamEvent(
            type="content_delta",
            delta={"text": str(chunk)}
        )

    def _handle_partial(self, data: dict) -> LlmStreamEvent:
        """message_partial 이벤트 처리 (토큰 스트리밍)"""
        return LlmStreamEvent(
            type="content_delta",
            delta={"text": data.get("message", "")}
        )

    def _handle_complete(self, data: dict) -> LlmStreamEvent:
        """message_complete 이벤트 처리"""
        if data.get("process_name"):
            # 도구 완료
            return LlmStreamEvent(
                type="tool_call_delta",
                delta={
                    "toolCall": {
                        "type": "tool_call",
                        "id": str(uuid.uuid4()),
                        "name": data.get("process_name", "unknown"),
                        "arguments": {}
                    }
                }
            )
        return self._handle_message(data)

    def _handle_metadata(self, data: dict) -> LlmStreamEvent:
        """message_metadata 이벤트 처리"""
        return LlmStreamEvent(
            type="content_delta",
            delta={},
            metadata={
                "langgraph_node": data.get("langgraph_node"),
                "step": data.get("step"),
                "model": data.get("model")
            }
        )

    def _handle_process(self, data: dict) -> LlmStreamEvent:
        """process 이벤트 처리"""
        return LlmStreamEvent(
            type="content_delta",
            delta={},
            metadata={
                "process_name": data.get("process_name"),
                "process_type": data.get("process_type")
            }
        )

    def _handle_done(self, data: dict) -> LlmStreamEvent:
        """done 이벤트 처리"""
        return LlmStreamEvent(
            type="message_end",
            usage={
                "promptTokens": 0,
                "completionTokens": 0,
                "totalTokens": data.get("total_tokens", 0)
            },
            thread_id=data.get("thread_id"),
            qa_id=data.get("qa_id")
        )

    def _handle_error(self, data: dict) -> LlmStreamEvent:
        """error 이벤트 처리"""
        return LlmStreamEvent(
            type="error",
            error={
                "type": data.get("error_code", "unknown"),
                "message": data.get("error", "Unknown error")
            }
        )

    def _handle_unknown(self, data: dict) -> LlmStreamEvent:
        """알 수 없는 이벤트 처리"""
        return LlmStreamEvent(type="content_delta", delta={})
```

## 4.5 설정 및 인증

### 4.5.1 gemini-cli 설정

```typescript
// packages/core/src/providers/didim/config.ts

export interface DidimIntegrationConfig {
  enabled: boolean;
  baseUrl: string;        // scenario-gateway URL (예: http://localhost:8008)
  apiKey: string;         // DidimAIStudio API-Key (시나리오별 발급)
  threadId?: string;      // 기존 대화 스레드 ID (선택적)

  // 선택적 설정
  timeout?: number;
  retries?: number;

  // 모드 선택
  mode: 'direct' | 'gateway';  // direct: 직접 API, gateway: DidimAI 경유
}

// 환경 변수
// DIDIM_AI_ENABLED=true
// DIDIM_AI_BASE_URL=http://scenario-gateway:8008  # 또는 외부 URL
// DIDIM_AI_API_KEY=your-scenario-api-key         # 시나리오별 API-Key
// DIDIM_AI_MODE=gateway
```

### 4.5.2 settings.json 확장

```json
{
  "provider": {
    "default": "gemini",
    "gemini": { ... },
    "claude": { ... },

    "didim-aistudio": {
      "enabled": true,
      "baseUrl": "http://scenario-gateway:8008",
      "apiKey": "${DIDIM_AI_API_KEY}",
      "mode": "gateway"
    }
  }
}
```

### 4.5.3 API-Key 기반 인증

DidimAIStudio는 시나리오별 API-Key 인증을 사용합니다.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        API-Key 인증 흐름                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. API-Key 발급                                                        │
│     DidimAIStudio 웹 UI → 시나리오 설정 → API-Key 생성                  │
│                                                                          │
│  2. API-Key 구조 (JWT)                                                  │
│     {                                                                    │
│       "user_id": "user-uuid",                                           │
│       "api_key_metadata": {                                             │
│         "my_scenario_id": 123,                                          │
│         ...                                                             │
│       },                                                                │
│       ...                                                               │
│     }                                                                   │
│                                                                          │
│  3. 요청 시 헤더                                                        │
│     Authorization: Bearer <API-KEY>                                     │
│                                                                          │
│  4. 인증 처리 (scenario-gateway)                                        │
│     ApiKeyAuthMiddleware → passport_data 추출 → request.state 저장      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 4.5.4 DidimAIStudio 환경 변수 (참고)

```python
# /services/scenario-gateway/app/config/environment.py

class Settings(BaseSettings):
    # 서비스 설정
    app_name: str = "Scenario Gate Service"
    app_version: str = "1.0.0"
    host: str = "0.0.0.0"
    port: int = 8008

    # 환경
    app_env: str = "development"  # development, production
    debug: bool = True

    # CORS
    cors_allow_origins: List[str] = ["*"]
    cors_allow_credentials: bool = True
    cors_allow_methods: List[str] = ["*"]
    cors_allow_headers: List[str] = ["*"]

    # Redis
    redis_url: str = "redis://cache:6379/0"

    # 동기화 간격
    stategraph_sync_interval: int = 60
    ip_whitelist_sync_interval: int = 60
```

## 4.6 프로바이더 매핑

### 4.6.1 프로바이더 ID 매핑

```typescript
// packages/core/src/providers/didim/providerMapping.ts

/**
 * Gemini CLI 프로바이더 ID ↔ DidimAIStudio 프로바이더 ID 매핑
 */
export const PROVIDER_MAPPING = {
  // Gemini CLI → DidimAIStudio
  'gemini': 'google',
  'claude': 'anthropic',
  'openai': 'openai',
  'gpt': 'openai',

  // DidimAIStudio 전용
  'bedrock': 'bedrock',
  'azure': 'azure_openai',
  'mistral': 'mistral',
  'groq': 'groq',
  'naver': 'naver',
  'vllm': 'vllm',
  'together': 'together',
  'cohere': 'cohere',
  'fireworks': 'fireworks',
  'huggingface': 'huggingface',
};

/**
 * 모델 이름에서 프로바이더 추론
 */
export function detectProvider(modelName: string): string {
  const name = modelName.toLowerCase();

  if (name.includes('gpt-') || name.includes('o1-')) return 'openai';
  if (name.includes('claude')) return 'anthropic';
  if (name.includes('gemini')) return 'google';
  if (name.includes('mistral')) return 'mistral';
  if (name.includes('llama')) return 'meta';
  if (name.includes('command')) return 'cohere';

  return 'unknown';
}
```

### 4.6.2 토큰 필드 매핑 통합

```python
# app/service/chat/provider_manager.py (확장)

class ProviderManager:
    TOKEN_FIELD_MAPPING = {
        # 기존 매핑...

        # Gemini CLI 호환 매핑 추가
        "gemini_cli": {
            "input": "usage.promptTokens",
            "output": "usage.completionTokens",
            "total": "usage.totalTokens"
        }
    }

    def normalize_for_gemini_cli(self, usage: dict) -> dict:
        """DidimAI 토큰 사용량을 Gemini CLI 형식으로 변환"""
        return {
            "promptTokens": usage.get("input_tokens", 0),
            "completionTokens": usage.get("output_tokens", 0),
            "totalTokens": usage.get("total_tokens", 0),
        }
```

## 4.7 에러 처리

### 4.7.1 에러 코드 매핑

```typescript
// packages/core/src/providers/didim/errorMapping.ts

import { LlmError, LlmErrorType } from '../errors';

/**
 * DidimAIStudio 에러 코드 → Gemini CLI 에러 타입 매핑
 */
export const ERROR_CODE_MAPPING: Record<string, LlmErrorType> = {
  'AUTH_FAILED': LlmErrorType.AUTHENTICATION,
  'RATE_LIMITED': LlmErrorType.RATE_LIMIT,
  'MODEL_OVERLOADED': LlmErrorType.MODEL_OVERLOADED,
  'CONTEXT_TOO_LONG': LlmErrorType.CONTEXT_LENGTH_EXCEEDED,
  'CONTENT_FILTERED': LlmErrorType.CONTENT_FILTER,
  'TIMEOUT': LlmErrorType.TIMEOUT,
  'NETWORK_ERROR': LlmErrorType.NETWORK,
  'INVALID_REQUEST': LlmErrorType.INVALID_REQUEST,
};

export function mapDidimErrorToLlmError(
  errorCode: string,
  message: string
): LlmError {
  const errorType = ERROR_CODE_MAPPING[errorCode] || LlmErrorType.UNKNOWN;
  return new LlmError(errorType, message, 'didim-aistudio');
}
```

### 4.7.2 폴백 전략

```typescript
// packages/core/src/providers/didim/fallback.ts

export interface FallbackConfig {
  enabled: boolean;
  fallbackProvider: string;  // 'gemini' | 'claude' | 'openai'
  maxRetries: number;
  retryableErrors: LlmErrorType[];
}

export const DEFAULT_FALLBACK_CONFIG: FallbackConfig = {
  enabled: true,
  fallbackProvider: 'gemini',
  maxRetries: 2,
  retryableErrors: [
    LlmErrorType.RATE_LIMIT,
    LlmErrorType.MODEL_OVERLOADED,
    LlmErrorType.TIMEOUT,
    LlmErrorType.NETWORK,
  ],
};
```

## 4.8 테스트 전략

### 4.8.1 단위 테스트

```typescript
// packages/core/src/providers/didim/converter.test.ts

import { describe, it, expect } from 'vitest';
import { DidimTypeConverter } from './converter';

describe('DidimTypeConverter', () => {
  const converter = new DidimTypeConverter();

  describe('toLlmToDidimInput', () => {
    it('should convert text message correctly', () => {
      const request: LlmGenerateRequest = {
        model: 'gemini-2.5-pro',
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      };

      const result = converter.toLlmToDidimInput(request, {
        scenarioMyPageId: 1,
        userId: 'user-1',
        threadId: 'thread-1',
        qaId: 'qa-1',
      });

      expect(result.message).toBe('Hello');
      expect(result.scenario_my_page_id).toBe(1);
    });

    it('should extract attachments from image content', () => {
      const request: LlmGenerateRequest = {
        model: 'gemini-2.5-pro',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' },
              {
                type: 'image',
                source: { type: 'url', mediaType: 'image/png', data: 'https://example.com/image.png' },
              },
            ],
          },
        ],
      };

      const result = converter.toLlmToDidimInput(request, {
        scenarioMyPageId: 1,
        userId: 'user-1',
        threadId: 'thread-1',
        qaId: 'qa-1',
      });

      expect(result.attachments).toContain('https://example.com/image.png');
    });
  });

  describe('fromDidimOutputToStreamEvent', () => {
    it('should convert MESSAGE_PARTIAL to content_delta', () => {
      const output: DidimSSEOutput = {
        scenario_my_page_id: 1,
        user_id: 'user-1',
        thread_id: 'thread-1',
        qa_id: 'qa-1',
        status: 'MESSAGE_PARTIAL',
        content: 'Hello',
        delta: true,
      };

      const result = converter.fromDidimOutputToStreamEvent(output);

      expect(result.type).toBe('content_delta');
      expect(result.delta?.text).toBe('Hello');
    });

    it('should convert COMPLETE to message_end with usage', () => {
      const output: DidimSSEOutput = {
        scenario_my_page_id: 1,
        user_id: 'user-1',
        thread_id: 'thread-1',
        qa_id: 'qa-1',
        status: 'COMPLETE',
        total_tokens: 150,
      };

      const result = converter.fromDidimOutputToStreamEvent(output);

      expect(result.type).toBe('message_end');
      expect(result.usage?.totalTokens).toBe(150);
    });
  });
});
```

### 4.8.2 통합 테스트

```typescript
// packages/core/src/providers/didim/adapter.integration.test.ts

import { describe, it, expect, beforeAll } from 'vitest';
import { DidimAIStudioAdapter } from './adapter';

describe('DidimAIStudioAdapter Integration', () => {
  let adapter: DidimAIStudioAdapter;

  beforeAll(() => {
    // 테스트 환경 설정
    adapter = new DidimAIStudioAdapter({
      apiKey: process.env.DIDIM_AI_API_KEY || '',
      baseUrl: process.env.DIDIM_AI_BASE_URL || 'http://localhost:8000',
      scenarioMyPageId: 1,
      userId: 'test-user',
    });
  });

  it('should generate content via DidimAIStudio', async () => {
    const request: LlmGenerateRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Say hello' }],
        },
      ],
    };

    const response = await adapter.generateContent(request);

    expect(response.content).toBeDefined();
    expect(response.content.length).toBeGreaterThan(0);
  });

  it('should stream content via DidimAIStudio', async () => {
    const request: LlmGenerateRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Count from 1 to 5' }],
        },
      ],
    };

    const events: LlmStreamEvent[] = [];
    const stream = await adapter.generateContentStream(request);

    for await (const event of stream) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    expect(events.some(e => e.type === 'message_end')).toBe(true);
  });
});
```

## 4.9 구현 일정

> **참고**: DidimAIStudio 연동은 Phase 3 (프로바이더 확장) 이후에 진행됩니다.
> 전체 Multi-LLM 어댑터 리팩토링은 05-implementation-plan.md 참조

### Phase 1: 기반 작업 (3일)

| 작업 | 담당 | 일정 |
|------|------|------|
| DidimAIStudio API 분석 (scenario-gateway, agents) | gemini-cli | 0.5일 |
| 공통 타입 정의 (TypeScript) | gemini-cli | 1일 |
| 에러 매핑 정의 | gemini-cli | 0.5일 |
| API-Key 발급 및 테스트 환경 구성 | 공통 | 1일 |

### Phase 2: 어댑터 구현 (5일)

| 작업 | 담당 | 일정 |
|------|------|------|
| DidimAIStudioAdapter 구현 | gemini-cli | 2일 |
| DidimTypeConverter 구현 (SSE 파싱) | gemini-cli | 1.5일 |
| SSE 스트리밍 테스트 | gemini-cli | 0.5일 |
| 기존 API 호환성 검증 | 공통 | 1일 |

### Phase 3: 테스트 및 통합 (4일)

| 작업 | 담당 | 일정 |
|------|------|------|
| 단위 테스트 작성 | gemini-cli | 1일 |
| 통합 테스트 작성 (Docker 환경) | 공통 | 1일 |
| E2E 테스트 (scenario-gateway ↔ agents) | 공통 | 1일 |
| 문서화 및 예제 작성 | 공통 | 1일 |

### 선택적 확장: Gemini CLI 전용 API (1주)

| 작업 | 담당 | 일정 |
|------|------|------|
| `/api/v1/gemini-cli/*` 엔드포인트 추가 | DidimAIStudio | 2일 |
| GeminiCLIService 구현 | DidimAIStudio | 2일 |
| 통합 테스트 | 공통 | 1일 |

### 총 예상 기간: 2주 (기본) ~ 3주 (전용 API 포함)

## 4.10 향후 확장

### 4.10.1 단기 확장 (1-2개월)

1. **양방향 동기화**: 설정 변경 시 실시간 동기화
2. **분산 트레이싱**: OpenTelemetry 기반 통합 트레이싱
3. **공유 메모리**: 대화 히스토리 공유

### 4.10.2 장기 확장 (3-6개월)

1. **플러그인 시스템**: gemini-cli에서 DidimAI 에이전트 직접 호출
2. **워크플로우 연동**: LangGraph 워크플로우를 CLI에서 실행
3. **통합 대시보드**: 사용량, 비용, 성능 통합 모니터링

---

## 4.11 서버 측 문맥 관리 및 제약사항 (리뷰 피드백 C 반영)

### 4.11.1 문맥 관리 아키텍처 차이

Gemini CLI(기본 모드)와 DidimAIStudio 연동 모드는 대화 문맥(히스토리) 관리 방식이 근본적으로 다릅니다:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     문맥 관리 방식 비교                                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [기본 모드: 클라이언트 측 관리]                                          │
│  ┌─────────────┐    전체 히스토리 전송    ┌──────────────┐               │
│  │ Gemini CLI  │ ───────────────────────▶ │ LLM API      │               │
│  │ (히스토리   │                          │ (Stateless)  │               │
│  │  로컬 저장) │ ◀─────────────────────── │              │               │
│  └─────────────┘    응답                  └──────────────┘               │
│                                                                          │
│  [Gateway 모드: 서버 측 관리]                                            │
│  ┌─────────────┐   마지막 메시지만 전송   ┌──────────────┐               │
│  │ Gemini CLI  │ ───────────────────────▶ │ DidimAI      │               │
│  │ (로컬 사본) │   + thread_id 헤더       │ Studio       │               │
│  │             │                          │ (thread에    │               │
│  │             │ ◀─────────────────────── │  히스토리    │               │
│  └─────────────┘    응답 + thread_id      │  서버 저장)  │               │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.11.2 알려진 제약사항

> ⚠️ **중요**: 아래 제약사항들은 DidimAIStudio Gateway 모드 사용 시 적용됩니다.

| 제약사항 | 설명 | 영향 |
|----------|------|------|
| **단방향 동기화** | CLI 로컬 히스토리 조작(삭제/수정)이 서버 thread에 반영되지 않음 | 로컬에서 대화 삭제해도 서버는 이전 문맥 유지 |
| **히스토리 전송 불가** | `extractLastUserMessage()`로 마지막 메시지만 전송 | 시스템 메시지, 이전 대화가 직접 전달되지 않음 |
| **서버 의존적 문맥** | Multi-turn 품질은 DidimAIStudio의 thread 관리에 의존 | 서버 측 thread 만료/삭제 시 문맥 손실 가능 |
| **도구 컨텍스트 미전달** | `tools[]` 정보가 gateway API로 전달되지 않음 | 시나리오에 사전 정의된 도구만 사용 가능 |

### 4.11.3 UX 안내 메시지 설계 (권고사항 2 반영)

DidimAIStudio 연동 시 사용자에게 서버 측 문맥 관리 특성을 인지시키기 위한 UX 장치:

```typescript
// packages/cli/src/views/DidimModeIndicator.tsx

const DIDIM_MODE_NOTICES = {
  // 세션 시작 시 표시 (한 번만)
  sessionStart: `
    ℹ️  DidimAIStudio 모드로 연결되었습니다.
    • 대화 히스토리는 서버에서 관리됩니다.
    • 로컬에서 히스토리를 수정해도 서버에 반영되지 않습니다.
  `,
  
  // 새 thread 시작 시
  newThread: (threadId: string) => `
    🔗 새 대화 스레드가 시작되었습니다: ${threadId.substring(0, 8)}...
  `,
  
  // 기존 thread 연결 시
  resumeThread: (threadId: string) => `
    🔗 기존 대화를 이어갑니다: ${threadId.substring(0, 8)}...
    (서버에 저장된 대화 문맥이 적용됩니다)
  `,
  
  // 로컬 히스토리 삭제 시도 시 경고
  localDeleteWarning: `
    ⚠️  로컬 히스토리만 삭제됩니다.
    서버의 대화 기록은 유지되며, 다음 질문 시 이전 문맥이 적용될 수 있습니다.
  `,
};

// 사용 예시
function renderSessionStart(): React.ReactNode {
  const { provider } = useProviderContext();
  
  if (provider === 'didim') {
    return (
      <Box marginBottom={1}>
        <Text color="cyan">{DIDIM_MODE_NOTICES.sessionStart}</Text>
      </Box>
    );
  }
  return null;
}
```

### 4.11.4 향후 해결 방안 (Out of Scope)

아래 항목들은 현재 설계 범위 외이며, 향후 확장으로 고려됩니다:

1. **양방향 동기화 API**: CLI ↔ DidimAIStudio 간 히스토리 동기화 프로토콜
2. **Thread 관리 CLI 명령어**: `gemini thread list`, `gemini thread delete <id>`
3. **오프라인 모드 전환**: 서버 연결 불가 시 자동으로 기본 모드로 fallback

