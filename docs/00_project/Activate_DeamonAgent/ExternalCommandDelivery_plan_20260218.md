# didim agent-cli 외부 명령 전달 처리 수정 계획

> 작성일: 2026-02-18 목적: OpenClaw 참조 아키텍처를 기반으로 didim agent-cli에
> 외부 명령 전달 기능 추가를 위한 수정 범위 정의 관련:
> [OpenClaw_Research_plan_20260218.md](./OpenClaw_Research_plan_20260218.md)

---

## 1. 현재 아키텍처 진단

### 1.1 이미 갖춘 기반 (활용 가능)

| 컴포넌트               | 위치                                                 | 설명                                                                            |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------- |
| **A2A Server**         | `packages/a2a-server/`                               | Express 기반 HTTP 서버, A2A 프로토콜, Task CRUD, `/executeCommand` SSE 스트리밍 |
| **NonInteractive CLI** | `packages/cli/src/nonInteractiveCli.ts`              | 파이프/`--prompt` 모드, TEXT/JSON/STREAM_JSON 출력                              |
| **GeminiClient**       | `packages/core/src/core/client.ts`                   | `sendMessageStream()` AsyncGenerator — 모든 프로바이더 통합 스트리밍 API        |
| **Provider 추상화**    | `packages/core/src/providers/`                       | Gemini/Claude/OpenAI 통합 adapter 패턴                                          |
| **Tool Scheduler**     | `packages/core/src/scheduler/`                       | 도구 실행 오케스트레이션, 정책 검증, 병렬 실행                                  |
| **Session Recording**  | `packages/core/src/services/chatRecordingService.ts` | 대화 이력 저장/복원                                                             |
| **IDE Companion**      | `packages/vscode-ide-companion/`                     | MCP 기반 HTTP 서버, Bearer 토큰 인증                                            |

### 1.2 핵심 한계 (OpenClaw과의 차이)

```
현재 didim agent-cli          vs          OpenClaw
─────────────────────────────────────────────────────
인터랙티브 CLI (1회성)         ↔    백그라운드 데몬 (24/7 상주)
터미널 UI (React/Ink)         ↔    메시징 플랫폼 (WhatsApp, Slack 등)
단일 세션                      ↔    다중 동시 세션 (채널별 격리)
요청-응답 (동기적)             ↔    비동기 이벤트 + 프로액티브 실행
파일 기반 세션 저장            ↔    영속 메모리 + 벡터 검색
도구 = 개발자 도구             ↔    도구 = 생활/업무 자동화 스킬
```

---

## 2. 수정 필요 영역 (6개 레이어)

### Layer 1: Gateway 데몬 (신규)

**목적**: 항상 실행되는 중앙 제어 서버 — 모든 외부 메시지의 진입점

**현재 상태**: A2A Server(`packages/a2a-server`)가 Express HTTP 서버로 존재하나,
1회성 요청 처리에 최적화. 지속 연결(WebSocket), 다중 세션 관리, 채널 라우팅
부재.

**신규 패키지 구조**:

```
packages/gateway/                          ← 신규 패키지
├── src/
│   ├── server.ts                          ← WebSocket + HTTP 멀티플렉스 서버
│   ├── sessionManager.ts                  ← 채널별 세션 생성/관리/격리
│   ├── messageRouter.ts                   ← 인바운드 메시지 → 적절한 세션 라우팅
│   ├── responseFormatter.ts               ← 내부 LlmEvent → 채널별 형식 변환
│   └── daemon.ts                          ← 프로세스 데몬화 (systemd/launchd)
```

**A2A Server 재활용 방안**:

- `packages/a2a-server/src/agent/executor.ts`의 `CoderAgentExecutor` 패턴 활용
  - 이미 Task 생성/실행/취소, 이벤트 버스, abort 처리가 구현됨
  - `execute()` 메서드의 agentic loop (LLM 스트림 → tool call → 결과 전달)이
    그대로 재사용 가능
- `packages/a2a-server/src/http/app.ts`의 Express 라우팅을 Gateway 하위 레이어로
  통합

**신규 구현 필요**:

| 기능                 | 설명                                         | 복잡도 |
| -------------------- | -------------------------------------------- | ------ |
| WebSocket 서버       | 실시간 양방향 통신 (SSE만으로 부족)          | 중     |
| 세션 격리            | 채널/사용자별 독립된 GeminiClient 인스턴스   | 중     |
| 다중 에이전트 라우팅 | 채널→에이전트 매핑 (모델/도구/프롬프트 분리) | 고     |
| 프로세스 데몬화      | macOS launchd / Linux systemd 서비스 등록    | 저     |
| 헬스체크             | 자동 재시작, 상태 모니터링                   | 저     |

---

### Layer 2: Channel Adapters (신규)

**목적**: 외부 메시징 플랫폼과의 연동

**신규 디렉토리 구조**:

```
packages/gateway/src/channels/
├── types.ts                    ← 공통 채널 인터페이스
├── whatsapp/adapter.ts         ← Baileys 기반 WhatsApp 연동
├── telegram/adapter.ts         ← grammY 기반 Telegram 연동
├── slack/adapter.ts            ← Slack Bolt 기반 연동
├── discord/adapter.ts          ← discord.js 기반 연동
└── webhook/adapter.ts          ← 범용 HTTP Webhook 수신
```

**공통 채널 인터페이스 설계**:

```typescript
interface ChannelAdapter {
  readonly channelType: string;

  // 초기화 & 연결
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  // 메시지 정규화 (플랫폼 → 내부 형식)
  normalizeInbound(rawMessage: unknown): NormalizedMessage;

  // 응답 변환 (내부 형식 → 플랫폼)
  formatOutbound(response: AgentResponse): PlatformMessage;

  // 이벤트 구독
  onMessage(handler: (msg: NormalizedMessage) => void): void;
}

interface NormalizedMessage {
  channelType: string;
  channelId: string;
  userId: string;
  text: string;
  attachments?: Attachment[];
  metadata?: Record<string, unknown>;
}
```

**Core 변경 필요 사항**:

- `packages/core/src/core/client.ts`의 `sendMessageStream()`은 이미
  `PartListUnion`을 받으므로, `NormalizedMessage → PartListUnion` 변환만
  추가하면 됨
- NonInteractive CLI의 agentic loop 패턴(`nonInteractiveCli.ts:282-512`)을
  Gateway에서 재사용

---

### Layer 3: 세션 & 메모리 관리 확장 (기존 확장)

**현재 상태**:

- `ChatRecordingService`: 파일 기반 세션 저장/복원 존재
- `GeminiChat`: Content[] 히스토리 관리
- 세션 resume 기능 있음 (`resumeChat()`)

**부족한 부분 & 수정 사항**:

| 기능             | 현재           | 필요                               | 수정 위치                                          |
| ---------------- | -------------- | ---------------------------------- | -------------------------------------------------- |
| 교차 세션 메모리 | 없음           | 장기 기억 (사용자 선호, 과거 맥락) | `packages/core/src/services/memoryService.ts` 신규 |
| 벡터 검색        | 없음           | 의미론적 메모리 검색               | SQLite + 임베딩 레이어 신규                        |
| 세션 매핑        | 1:1 (CLI:세션) | N:1 (다중 채널:사용자)             | `sessionManager.ts` 신규                           |
| 메모리 주입      | 없음           | 프롬프트에 관련 메모리 자동 첨부   | `client.ts` 시스템 프롬프트 구성 수정              |

**Core 수정 포인트**:

- `packages/core/src/core/client.ts` `sendMessageStream()` — 매 턴 시작 전
  메모리 검색 결과를 시스템 컨텍스트에 주입하는 훅 포인트 추가
- `packages/core/src/core/prompts.ts` `getCoreSystemPrompt()` — 동적 메모리
  컨텍스트 삽입 슬롯 추가

---

### Layer 4: 인증 & 보안 레이어 (기존 확장)

**현재 상태**:

- IDE Companion: Bearer 토큰 + localhost 제한
- A2A Server: 인증 없음 (`securitySchemes: undefined`)

**수정 사항**:

| 영역               | 구현 내용                             | 우선순위 |
| ------------------ | ------------------------------------- | -------- |
| Gateway 인증       | 토큰/비밀번호 기반 (auth:none 금지)   | **필수** |
| 채널 접근 제어     | 사용자 허용 목록, DM 페어링           | **필수** |
| 도구 샌드박싱      | 채널별 권한 수준 (main=풀, 외부=제한) | **높음** |
| 네트워크 보안      | 기본 루프백, 명시적 외부 노출만       | **필수** |
| 프롬프트 주입 방어 | 외부 메시지와 시스템 명령 분리        | **높음** |

**수정 위치**:

- `packages/gateway/src/auth/` 신규 — 인증 미들웨어
- `packages/core/src/scheduler/scheduler.ts` — 채널별 도구 정책 분기 추가
- A2A Server의 `coderAgentCard.securitySchemes` 활성화

---

### Layer 5: 도구(Skill) 시스템 확장 (기존 확장)

**현재 상태**: 개발자 도구 중심 (file_read, shell, grep, glob, web_fetch 등)

**외부 명령 처리 시 필요한 확장**:

| 스킬 카테고리 | 예시                     | 구현 방향                |
| ------------- | ------------------------ | ------------------------ |
| 생산성        | 캘린더 예약, 이메일 분류 | MCP 서버 플러그인        |
| 웹 자동화     | 브라우저 제어, 스크래핑  | 기존 Playwright MCP 활용 |
| 스마트홈      | Home Assistant 연동      | MCP 서버 플러그인        |
| 알림          | 크로스플랫폼 메시지 전송 | Gateway 채널 역방향 활용 |

**수정 포인트**:

- `packages/core/src/tools/` — 도구 레지스트리에 동적 스킬 등록/해제 API 추가
- MCP 서버 기반 외부 스킬 로드 — 이미 MCP 인프라 존재 (`packages/core/src/mcp/`)

---

### Layer 6: 설정 & 배포 (기존 확장)

**신규 설정 파일 구조**:

```jsonc
// ~/.didim/gateway.json
{
  "gateway": {
    "port": 18789,
    "bind": "127.0.0.1",
    "auth": { "mode": "token", "token": "..." },
  },
  "channels": {
    "telegram": { "enabled": true, "token": "..." },
    "slack": { "enabled": true, "appToken": "..." },
    "webhook": { "enabled": true, "path": "/webhook" },
  },
  "agents": {
    "default": { "model": "gemini-2.5-flash", "tools": ["*"] },
    "slack-team": {
      "model": "claude-sonnet-4-5",
      "tools": ["shell", "file_*"],
    },
  },
  "memory": {
    "enabled": true,
    "embeddings": "local",
  },
}
```

---

## 3. 수정 범위 요약

### 3.1 파일별 영향도

```
신규 생성 (packages/gateway/)
├── Gateway 서버                          ← 핵심 신규
├── Channel Adapters (4-5개)              ← 핵심 신규
├── Session Manager                       ← 핵심 신규
├── Auth Middleware                        ← 신규
└── Memory Service                        ← 신규

기존 수정 (packages/core/)
├── client.ts          ← 메모리 주입 훅 추가 (저영향)
├── prompts.ts         ← 동적 메모리 슬롯 추가 (저영향)
├── scheduler.ts       ← 채널별 도구 정책 분기 (중영향)
├── config.ts          ← Gateway 설정 로딩 (중영향)
└── tools/             ← 동적 스킬 등록 API (저영향)

기존 수정 (packages/a2a-server/)
├── app.ts             ← Gateway 하위 레이어로 통합 (고영향)
├── executor.ts        ← 다중 세션 지원 확장 (중영향)
└── 인증 추가          ← securitySchemes 활성화 (저영향)

미변경
├── packages/cli/      ← 기존 터미널 UI 그대로 유지
└── packages/core/src/providers/  ← LLM 어댑터 변경 불필요
```

### 3.2 구현 우선순위 (단계별)

| 단계        | 목표                                             | 주요 작업                                                                   |
| ----------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| **Phase 1** | Gateway 데몬 + Webhook 채널 1개 + 토큰 인증      | Gateway 서버 기본 골격, Webhook 어댑터, 토큰 인증 미들웨어, A2A Server 통합 |
| **Phase 2** | 메시징 채널 1개 (Telegram/Slack) + 세션 관리     | 채널 어댑터 구현, 세션 매니저, 다중 동시 세션                               |
| **Phase 3** | 영속 메모리 + 벡터 검색 + 채널별 에이전트 라우팅 | MemoryService, SQLite + 임베딩, 다중 에이전트 라우팅                        |
| **Phase 4** | 추가 채널 + 스킬 마켓플레이스 + 샌드박싱         | WhatsApp/Discord, 동적 스킬 등록, Docker 샌드박스                           |

---

## 4. 핵심 판단 포인트

### 4.1 최소 수정으로 최대 효과를 내는 전략

1. **A2A Server를 Gateway로 진화시키는 것이 최선**
   - 이미 Express, Task 관리, Agent Executor, 이벤트 버스가 구현됨
   - `CoderAgentExecutor.execute()` 의 agentic loop이 외부 명령 처리의 핵심
     로직과 동일

2. **NonInteractive CLI의 agentic loop 공통 모듈 추출**
   - `nonInteractiveCli.ts:282-512`의 `while(true)` 루프가 외부 메시지 처리와
     동일한 패턴
   - LLM 스트림 소비 → 도구 호출 수집 → Scheduler 실행 → 응답 조립 → 다음 턴

3. **Core 패키지는 거의 변경 불필요**
   - `sendMessageStream()`이 이미 프로바이더 무관하게 동작
   - Gateway가 이를 호출하기만 하면 됨

4. **채널 어댑터는 완전히 독립적**
   - Core/CLI에 영향 없이 `packages/gateway/src/channels/`에서 개별 추가 가능

### 4.2 OpenClaw에서 배울 교훈

| 교훈                     | didim 적용                                    |
| ------------------------ | --------------------------------------------- |
| `auth: none` 보안 사고   | 인증 없는 모드를 처음부터 금지                |
| ClawHub 악성 스킬 (~12%) | 스킬 레지스트리 도입 시 코드 서명/검증 필수   |
| Shodan 노출              | 기본 루프백 바인딩, 외부 노출은 명시적 설정만 |
| 프롬프트 주입            | 외부 메시지에 메타데이터 태깅 (출처 명시)     |
| 호스트당 1 Gateway       | WhatsApp 같은 단일 기기 프로토콜 제약 고려    |

### 4.3 리스크 요소

| 리스크                  | 완화 전략                                    |
| ----------------------- | -------------------------------------------- |
| 보안 표면 확대          | Phase 1부터 인증/인가 필수, 단계별 채널 추가 |
| 메모리 누수 (24/7 데몬) | 세션 TTL, 주기적 GC, 헬스체크                |
| 도구 권한 남용          | 채널별 도구 화이트리스트, 샌드박스 기본      |
| 메시징 API 변경         | 어댑터 추상화로 영향 격리                    |
| 비용 폭증 (API 호출)    | 토큰 사용량 모니터링, 채널별 한도 설정       |
