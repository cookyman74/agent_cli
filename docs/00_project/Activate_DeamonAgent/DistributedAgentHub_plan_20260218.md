# 분산 에이전트 허브(Distributed Agent Hub) 설계 제안서

> 작성일: 2026-02-18 목적: 다수의 서버/데스크톱에 설치된 agent-cli 인스턴스를
> 하나의 메신저 채널에서 중앙 관리하는 아키텍처 설계 관련:
> [OpenClaw_Research_plan_20260218.md](./OpenClaw_Research_plan_20260218.md),
> [ExternalCommandDelivery_plan_20260218.md](./ExternalCommandDelivery_plan_20260218.md)

---

## 1. 요구사항 분석

### 1.1 사용 시나리오

```
사용자 (메신저 채널)
  │
  ├─ "A 에이전트 봇아 gmail 내용에 있는 파일을 가져와 분석하여 보고해줘.
  │    그리고 메일 내용에 첨부파일을 데스크톱의 파일에 분류하여 저장해줘."
  │    → 개인 데스크톱의 Agent A
  │
  ├─ "B 에이전트 봇아 서버 상태를 10분마다 모니터링해서
  │    이상 증후가 보이면 보고해줘."
  │    → 운영 서버의 Agent B
  │
  └─ "C 에이전트 봇아 그룹웨어의 공지사항을 보고 보고해줘."
      → 회사 데스크톱의 Agent C
```

### 1.2 핵심 요구사항

| 구분                | 요구사항                     | 설명                                             |
| ------------------- | ---------------------------- | ------------------------------------------------ |
| **라우팅**          | 에이전트 이름 기반 명령 분배 | 자연어에서 대상 에이전트를 식별하여 라우팅       |
| **양방향 통신**     | 명령 전달 + 결과 보고        | 명령은 Hub→Agent, 보고는 Agent→Hub→메신저        |
| **예약 작업**       | 주기적/예약 실행             | "10분마다 모니터링" 같은 cron 스타일 작업        |
| **이기종 환경**     | 서버/데스크톱 혼합           | Windows 데스크톱, Linux 서버 등 이기종 환경      |
| **에이전트별 도구** | 환경 특화 기능               | Gmail, 서버 모니터링, 그룹웨어 등 각기 다른 도구 |
| **중앙 관리**       | 단일 진입점                  | 하나의 메신저 채널에서 모든 에이전트 제어        |
| **보고 집중**       | 결과 통합 표시               | 모든 에이전트의 보고가 하나의 채널로 수렴        |

---

## 2. 전체 아키텍처

### 2.1 Hub-Spoke 토폴로지

```
                    ┌─────────────────────────────────────────┐
                    │          Messenger Channel               │
                    │    (Telegram / Slack / Discord 등)       │
                    └──────────────┬──────────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────────┐
                    │         DIDIM Agent Hub                  │
                    │     (Cloud 또는 사내 서버)                │
                    │                                          │
                    │  ┌────────────────────────────────────┐  │
                    │  │  Channel Adapter (메신저 연동)       │  │
                    │  └────────────┬───────────────────────┘  │
                    │               │                          │
                    │  ┌────────────▼───────────────────────┐  │
                    │  │  Command Parser & Router            │  │
                    │  │  (에이전트 식별 + 명령 추출)          │  │
                    │  └────────────┬───────────────────────┘  │
                    │               │                          │
                    │  ┌────────────▼───────────────────────┐  │
                    │  │  Agent Registry                     │  │
                    │  │  (에이전트 등록/상태/능력 관리)        │  │
                    │  └────────────┬───────────────────────┘  │
                    │               │                          │
                    │  ┌────────────▼───────────────────────┐  │
                    │  │  Task Manager                       │  │
                    │  │  (작업 생성/추적/예약/보고 관리)       │  │
                    │  └────────────┬───────────────────────┘  │
                    │               │                          │
                    │  ┌────────────▼───────────────────────┐  │
                    │  │  Report Aggregator                  │  │
                    │  │  (에이전트 보고 수집 → 메신저 전달)    │  │
                    │  └───────────────────────────────────┘   │
                    └──────┬──────────┬──────────┬────────────┘
                           │          │          │
              ┌────────────▼┐  ┌──────▼───────┐  ┌▼────────────────┐
              │  Agent A     │  │  Agent B      │  │  Agent C         │
              │  (개인 데스크톱) │  │  (운영 서버)   │  │  (회사 데스크톱)    │
              │              │  │               │  │                  │
              │  ┌─────────┐ │  │  ┌──────────┐ │  │  ┌─────────────┐ │
              │  │agent-cli│ │  │  │agent-cli │ │  │  │agent-cli    │ │
              │  │+ Gmail  │ │  │  │+ Server  │ │  │  │+ Groupware  │ │
              │  │+ Files  │ │  │  │  Monitor │ │  │  │  Connector  │ │
              │  └─────────┘ │  │  └──────────┘ │  │  └─────────────┘ │
              └──────────────┘  └───────────────┘  └──────────────────┘
```

### 2.2 통신 흐름

```
[명령 전달 흐름]
사용자 메시지 → 메신저 API → Hub Channel Adapter
  → Command Parser (에이전트 식별 + 명령 추출)
  → Agent Registry (대상 에이전트 검증)
  → Task Manager (작업 생성)
  → Agent Node로 WebSocket 전달
  → Agent Node의 agent-cli가 실행
  → 결과를 Hub으로 WebSocket 전달

[보고 흐름]
Agent Node 작업 완료/이벤트 발생
  → Hub Report Aggregator로 전달
  → 메신저 형식으로 포맷팅
  → Channel Adapter → 메신저 API → 사용자
```

---

## 3. 컴포넌트 상세 설계

### 3.1 Agent Node (각 서버/데스크톱에 설치)

기존 agent-cli에 **Node Agent 데몬** 모듈을 추가.

```
packages/agent-node/                    ← 신규 패키지
├── src/
│   ├── daemon.ts                       ← 백그라운드 데몬 프로세스
│   ├── hubConnector.ts                 ← Hub 연결 관리 (WebSocket 클라이언트)
│   ├── registration.ts                 ← Hub에 자기 자신 등록
│   ├── taskExecutor.ts                 ← Hub에서 받은 작업 실행
│   ├── reportSender.ts                 ← 결과/이벤트를 Hub으로 전송
│   ├── scheduler.ts                    ← 로컬 예약 작업 (cron)
│   └── healthCheck.ts                  ← 헬스체크 응답
```

**Hub 연결 시 등록 정보**:

```typescript
interface AgentRegistration {
  // 식별
  agentId: string; // UUID, 최초 설치 시 생성
  agentName: string; // 사용자 지정 이름 ("A 에이전트 봇")
  aliases: string[]; // 호출 별칭 ["A", "에이전트A", "gmail봇"]

  // 환경
  environment: 'desktop' | 'server' | 'cloud';
  hostname: string;
  os: string; // "darwin", "linux", "win32"

  // 능력
  capabilities: AgentCapability[]; // 설치된 도구/스킬 목록
  model: string; // 사용 LLM 모델

  // 상태
  status: 'online' | 'busy' | 'offline';
  lastHeartbeat: string; // ISO 8601
  currentTasks: number;
  maxConcurrentTasks: number;
}

interface AgentCapability {
  name: string; // "gmail", "server_monitor", "groupware"
  description: string;
  tools: string[]; // 구체적 도구 목록
  tags: string[]; // 라우팅 힌트 태그
}
```

**기존 코드 활용**:

- `CoderAgentExecutor` 패턴 → `taskExecutor.ts`에서 재사용
  - `execute()` 메서드의 agentic loop (LLM 스트림 → tool call → 결과)
  - 이미 abort 처리, 이벤트 발행, 상태 관리가 구현됨
- `nonInteractiveCli.ts:282-512`의 agentic loop → 작업 실행 핵심 로직
- `GeminiClient.sendMessageStream()` → LLM 호출은 그대로

### 3.2 Agent Hub (중앙 서버)

기존 `packages/a2a-server`를 확장하여 Hub 기능 추가.

```
packages/hub/                           ← 신규 패키지 (또는 a2a-server 확장)
├── src/
│   ├── server.ts                       ← HTTP + WebSocket 서버
│   ├── channelAdapter/                 ← 메신저 연동 (Layer 2)
│   │   ├── types.ts
│   │   ├── telegram.ts
│   │   ├── slack.ts
│   │   └── webhook.ts
│   ├── commandParser.ts                ← 자연어 명령 파싱 (에이전트 식별)
│   ├── agentRegistry.ts                ← 에이전트 등록/검색/상태 관리
│   ├── taskManager.ts                  ← 작업 생성/추적/예약
│   ├── reportAggregator.ts             ← 보고 수집 및 메신저 전달
│   ├── auth/                           ← 인증/인가
│   │   ├── tokenAuth.ts
│   │   └── agentAuth.ts
│   └── storage/                        ← 영속 저장소
│       ├── agentStore.ts
│       └── taskStore.ts
```

---

## 4. 핵심 메커니즘 상세

### 4.1 명령 파싱 & 에이전트 라우팅

**2단계 파싱 전략**: 규칙 기반 + LLM 폴백

```
사용자 메시지: "A 에이전트 봇아 gmail 내용에 있는 파일을 가져와 분석하여 보고해줘"
                │
                ▼
        ┌─────────────────────────┐
        │  Stage 1: 규칙 기반 파싱  │
        │  패턴 매칭으로 에이전트 식별 │
        └─────────┬───────────────┘
                  │
    ┌─────────────▼─────────────────┐
    │  매칭 성공?                     │
    │  Yes → agentName + command 분리│
    │  No  → Stage 2로 이동          │
    └─────────────┬─────────────────┘
                  │ (매칭 실패 시)
        ┌─────────▼───────────────┐
        │  Stage 2: LLM 폴백 파싱  │
        │  Hub의 LLM이 의도 분석    │
        │  에이전트 능력 기반 라우팅  │
        └─────────────────────────┘
```

**Stage 1 — 규칙 기반 파싱**:

```typescript
interface ParsedCommand {
  targetAgent: string | null; // 식별된 에이전트 이름/별칭
  command: string; // 에이전트에 전달할 명령
  isScheduled: boolean; // 예약 작업 여부
  schedule?: ScheduleConfig; // cron 식 예약 설정
  confidence: number; // 파싱 신뢰도 (0-1)
}

// 파싱 규칙 예시
const PATTERNS = [
  // "X 에이전트 봇아 ..." / "X 봇아 ..."
  /^(?<agent>[A-Za-z가-힣]+)\s*(에이전트\s*)?봇아?\s+(?<command>.+)$/s,
  // "@X ..." (멘션 스타일)
  /^@(?<agent>[A-Za-z가-힣]+)\s+(?<command>.+)$/s,
  // "/agent X ..." (슬래시 명령 스타일)
  /^\/agent\s+(?<agent>[A-Za-z가-힣]+)\s+(?<command>.+)$/s,
];

// 예약 작업 감지
const SCHEDULE_PATTERNS = [
  { pattern: /(\d+)분\s*마다/, type: 'interval', unit: 'minutes' },
  { pattern: /(\d+)시간\s*마다/, type: 'interval', unit: 'hours' },
  { pattern: /매일\s*(\d+)시/, type: 'daily', unit: 'hours' },
  { pattern: /매주\s*([월화수목금토일])/, type: 'weekly' },
];
```

**Stage 2 — LLM 폴백 (에이전트 미식별 시)**:

```typescript
// Hub 자체 LLM에 라우팅 요청
const routingPrompt = `
다음 메시지를 분석하여 가장 적합한 에이전트를 선택하세요.

등록된 에이전트:
${registeredAgents
  .map(
    (a) =>
      `- ${a.agentName} (${a.aliases.join(', ')}): ${a.capabilities.map((c) => c.description).join(', ')}`,
  )
  .join('\n')}

사용자 메시지: "${userMessage}"

JSON 형식으로 응답:
{ "targetAgent": "에이전트이름", "command": "전달할 명령", "confidence": 0.0-1.0 }
`;
```

**라우팅 결정 흐름**:

```
파싱 결과
  │
  ├─ confidence >= 0.8 → 즉시 라우팅
  │
  ├─ 0.5 <= confidence < 0.8 → 사용자에게 확인
  │   "A 에이전트에게 전달할까요? [Y/N]"
  │
  ├─ confidence < 0.5 → 에이전트 목록 제시
  │   "어떤 에이전트에게 전달할까요?
  │    A: gmail/파일 관리  B: 서버 모니터링  C: 그룹웨어"
  │
  └─ 에이전트 미지정 + 단일 매칭 → 능력 기반 자동 라우팅
      "gmail" 키워드 → Agent A (gmail capability)
```

### 4.2 Hub ↔ Agent Node 통신 프로토콜

**WebSocket 기반 양방향 통신**:

```
Agent Node                          Hub
    │                                │
    │──── REGISTER ─────────────────►│  (연결 시 자동)
    │◄─── REGISTER_ACK ─────────────│
    │                                │
    │◄─── HEARTBEAT_PING ───────────│  (30초 간격)
    │──── HEARTBEAT_PONG ──────────►│
    │                                │
    │◄─── TASK_ASSIGN ──────────────│  (명령 전달)
    │──── TASK_ACK ─────────────────►│
    │──── TASK_PROGRESS ────────────►│  (중간 보고, 스트리밍)
    │──── TASK_COMPLETE ────────────►│  (완료 보고)
    │                                │
    │──── PROACTIVE_REPORT ─────────►│  (자발적 보고: 모니터링 알림 등)
    │                                │
    │◄─── TASK_CANCEL ──────────────│  (작업 취소)
    │──── TASK_CANCEL_ACK ──────────►│
```

**메시지 프로토콜 정의**:

```typescript
// --- 기본 메시지 구조 ---
interface HubMessage {
  type: HubMessageType;
  messageId: string; // UUID
  timestamp: string; // ISO 8601
  agentId: string;
}

enum HubMessageType {
  // 등록
  REGISTER = 'register',
  REGISTER_ACK = 'register_ack',

  // 헬스체크
  HEARTBEAT_PING = 'heartbeat_ping',
  HEARTBEAT_PONG = 'heartbeat_pong',

  // 작업
  TASK_ASSIGN = 'task_assign',
  TASK_ACK = 'task_ack',
  TASK_PROGRESS = 'task_progress',
  TASK_COMPLETE = 'task_complete',
  TASK_ERROR = 'task_error',
  TASK_CANCEL = 'task_cancel',
  TASK_CANCEL_ACK = 'task_cancel_ack',

  // 자발적 보고
  PROACTIVE_REPORT = 'proactive_report',

  // 예약 작업
  SCHEDULE_CREATE = 'schedule_create',
  SCHEDULE_ACK = 'schedule_ack',
  SCHEDULE_TRIGGER = 'schedule_trigger',
}

// --- 작업 할당 ---
interface TaskAssignMessage extends HubMessage {
  type: HubMessageType.TASK_ASSIGN;
  taskId: string;
  originChannel: string; // 메신저 채널 정보 (보고 시 사용)
  originUserId: string; // 명령한 사용자
  command: string; // 에이전트에게 전달할 자연어 명령
  schedule?: ScheduleConfig; // 예약 설정 (있으면 예약 작업)
  priority: 'low' | 'normal' | 'high' | 'urgent';
  timeout?: number; // 타임아웃 (ms)
}

// --- 작업 진행 보고 ---
interface TaskProgressMessage extends HubMessage {
  type: HubMessageType.TASK_PROGRESS;
  taskId: string;
  progress: number; // 0-100
  currentStep?: string; // "Gmail 메일 읽는 중..."
  streamDelta?: string; // 스트리밍 텍스트 델타
}

// --- 작업 완료 보고 ---
interface TaskCompleteMessage extends HubMessage {
  type: HubMessageType.TASK_COMPLETE;
  taskId: string;
  result: {
    summary: string; // 요약 (메신저에 바로 표시)
    detail?: string; // 상세 결과
    attachments?: Attachment[]; // 첨부 파일
    metrics?: {
      durationMs: number;
      tokensUsed: number;
      toolCallCount: number;
    };
  };
}

// --- 자발적 보고 (모니터링 알림 등) ---
interface ProactiveReportMessage extends HubMessage {
  type: HubMessageType.PROACTIVE_REPORT;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  sourceScheduleId?: string; // 예약 작업에서 발생한 보고
}

// --- 예약 작업 ---
interface ScheduleConfig {
  type: 'interval' | 'cron' | 'once';
  interval?: number; // ms (interval 타입)
  cron?: string; // cron 표현식 (cron 타입)
  executeAt?: string; // ISO 8601 (once 타입)
  expiresAt?: string; // 만료 시점
  maxExecutions?: number; // 최대 실행 횟수
}
```

### 4.3 에이전트 레지스트리

```typescript
class AgentRegistry {
  private agents: Map<string, RegisteredAgent> = new Map();

  // 에이전트 등록
  register(registration: AgentRegistration, ws: WebSocket): RegisteredAgent;

  // 이름/별칭으로 에이전트 검색
  findByName(nameOrAlias: string): RegisteredAgent | null;

  // 능력 기반 검색 (LLM 폴백 라우팅용)
  findByCapability(tags: string[]): RegisteredAgent[];

  // 상태 관리
  updateStatus(agentId: string, status: AgentStatus): void;
  markOffline(agentId: string): void;

  // 목록
  getOnlineAgents(): RegisteredAgent[];
  getAllAgents(): RegisteredAgent[];
}

interface RegisteredAgent {
  registration: AgentRegistration;
  connection: WebSocket;
  connectedAt: string;
  activeTasks: Map<string, TaskInfo>;
  scheduledTasks: Map<string, ScheduledTaskInfo>;
}
```

### 4.4 예약 작업 관리

**시나리오**: "B 에이전트 봇아 서버 상태를 10분마다 모니터링해서 이상 증후가
보이면 보고해줘."

```
사용자 메시지
  ↓
Command Parser: schedule 감지 (interval: 10분)
  ↓
Hub Task Manager: ScheduledTask 생성
  ↓
Agent Node로 SCHEDULE_CREATE 전송
  ↓
Agent Node 로컬 스케줄러가 cron job 등록
  ↓
10분마다:
  ├─ Agent Node가 작업 실행 (서버 상태 확인)
  ├─ 정상 → 로그만 기록 (보고 안함)
  └─ 이상 감지 → Hub으로 PROACTIVE_REPORT 전송
       ↓
     Hub Report Aggregator
       ↓
     메신저 채널로 알림:
     "⚠️ [B 에이전트] 서버 이상 감지
      CPU 사용률 95%, 디스크 사용률 92%
      ..."
```

**예약 관리의 2중 구조**:

| 위치                       | 역할                                               | 이유                                              |
| -------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| **Hub** (TaskManager)      | 예약 작업 메타데이터 관리, 에이전트 재연결 시 복원 | Hub가 죽어도 에이전트는 자체 스케줄러로 계속 실행 |
| **Agent Node** (scheduler) | 실제 cron 실행, 로컬 타이머                        | 네트워크 끊겨도 예약 작업은 계속 실행             |

### 4.5 보고 집약 & 메신저 전달

```typescript
class ReportAggregator {
  // 작업 완료 보고 → 메신저 전달
  async handleTaskComplete(msg: TaskCompleteMessage): Promise<void> {
    const task = this.taskManager.getTask(msg.taskId);
    const agent = this.agentRegistry.get(msg.agentId);

    const formatted = this.formatReport({
      agentName: agent.registration.agentName,
      taskCommand: task.command,
      result: msg.result,
      duration: msg.result.metrics?.durationMs,
    });

    await this.channelAdapter.send(task.originChannel, formatted);
  }

  // 자발적 보고 (모니터링 알림 등) → 메신저 전달
  async handleProactiveReport(msg: ProactiveReportMessage): Promise<void> {
    const agent = this.agentRegistry.get(msg.agentId);
    const severityIcon = { info: 'ℹ️', warning: '⚠️', critical: '🚨' };

    const formatted = [
      `${severityIcon[msg.severity]} **[${agent.registration.agentName}]** ${msg.title}`,
      msg.body,
      msg.sourceScheduleId ? `_예약 작업 #${msg.sourceScheduleId}_` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // critical은 모든 관리자에게, 나머지는 해당 채널에만
    if (msg.severity === 'critical') {
      await this.channelAdapter.broadcast(formatted);
    } else {
      await this.channelAdapter.sendToDefault(formatted);
    }
  }

  // 보고 포맷팅
  private formatReport(params: ReportParams): string {
    return [
      `✅ **[${params.agentName}]** 작업 완료`,
      `> ${params.taskCommand}`,
      '',
      params.result.summary,
      '',
      params.duration
        ? `_소요 시간: ${(params.duration / 1000).toFixed(1)}초_`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
```

**메신저 표시 예시**:

```
✅ [A 에이전트 봇] 작업 완료
> gmail 내용에 있는 파일을 가져와 분석하여 보고해줘

Gmail에서 3개의 메일을 확인했습니다:
1. [프로젝트 보고서] 첨부: report_Q1.xlsx → ~/Desktop/업무/보고서/ 에 저장
2. [회의록] 첨부: meeting_0218.docx → ~/Desktop/업무/회의록/ 에 저장
3. [견적서] 첨부: estimate_v2.pdf → ~/Desktop/업무/견적/ 에 저장

분석 요약:
- Q1 매출 전년 대비 15% 증가
- 신규 프로젝트 3건 진행 중

_소요 시간: 23.4초_
```

```
⚠️ [B 에이전트 봇] 서버 이상 감지
CPU 사용률: 95.2% (임계값: 80%)
메모리 사용률: 78.3%
디스크 사용률: 92.1% (임계값: 85%)

권장 조치: /var/log 디렉토리 정리 필요 (12GB 점유)
_예약 작업: 10분 간격 모니터링_
```

---

## 5. 기존 코드 활용 전략

### 5.1 재사용 가능한 기존 컴포넌트

```
┌────────────────────────────────────────────────────────────────┐
│  기존 컴포넌트                    →  Hub/Agent Node 활용       │
├────────────────────────────────────────────────────────────────┤
│  CoderAgentExecutor.execute()    →  Agent Node taskExecutor   │
│  (a2a-server/agent/executor.ts)     agentic loop 재사용       │
│                                                                │
│  Task (a2a-server/agent/task.ts) →  작업 상태 머신 재사용       │
│  submitted→working→completed        + SCHEDULED 상태 추가      │
│                                                                │
│  nonInteractiveCli agentic loop  →  Agent Node 작업 실행 코어  │
│  (cli/nonInteractiveCli.ts:282)     while(true) 루프 그대로    │
│                                                                │
│  GeminiClient.sendMessageStream  →  Agent Node LLM 호출        │
│  (core/client.ts)                   변경 없이 그대로 사용       │
│                                                                │
│  A2A Protocol (a2a-js/sdk)       →  Hub의 외부 API 호환 유지    │
│  Agent Card, Task Store              기존 연동 계속 작동        │
│                                                                │
│  MessageBus + PolicyEngine       →  Agent Node 도구 실행 제어   │
│  (core/confirmation-bus)             자동 승인 모드 활용        │
│                                                                │
│  Hook System (11 hook events)    →  Hub↔Agent 라이프사이클 확장 │
│  (core/hooks)                       BeforeAgent/AfterAgent     │
│                                                                │
│  LlmEventStream (19 event types) →  통합 이벤트 형식 유지       │
│  (core/providers/events.ts)         프로바이더 무관 스트리밍     │
│                                                                │
│  CoreEventEmitter (backlog)      →  Agent Node 이벤트 버퍼링    │
│  (core/utils/events.ts)             네트워크 끊김 시 큐잉       │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 수정이 필요한 부분

| 컴포넌트                             | 수정 내용                                                 | 영향도 |
| ------------------------------------ | --------------------------------------------------------- | ------ |
| **Scheduler** (`core/scheduler`)     | 원격 도구 확인 모드 추가 (Hub 경유 사용자 확인)           | 중     |
| **Config** (`core/config`)           | 에이전트 노드 모드 설정 (hubUrl, agentName, capabilities) | 저     |
| **A2A Server** (`a2a-server/app.ts`) | Hub 엔드포인트 추가 (WebSocket, 에이전트 관리)            | 고     |
| **Hook System** (`core/hooks`)       | `BeforeRemoteTask` / `AfterRemoteTask` 훅 추가            | 저     |

### 5.3 변경 불필요한 부분

- `packages/cli/` — 기존 터미널 UI 완전 유지
- `packages/core/src/providers/` — LLM 어댑터 변경 없음
- `packages/core/src/tools/` — 도구 시스템 변경 없음
- `packages/core/src/core/client.ts` — sendMessageStream() 변경 없음

---

## 6. 시나리오별 End-to-End 흐름

### 6.1 시나리오 A: Gmail 파일 분석 (즉시 실행)

```
시간  │  사용자/메신저           Hub                          Agent A (데스크톱)
──────┼───────────────────────────────────────────────────────────────────────
T+0   │  "A 에이전트 봇아       ─────────────────────────────
      │   gmail 내용에 있는     │ Command Parser:
      │   파일을 가져와         │  agent="A", confidence=0.95
      │   분석하여 보고해줘"    │ Agent Registry:
      │                         │  A → online, ws connected
      │                         │ Task Manager:
      │                         │  taskId=T001 생성
      │                         ──────── TASK_ASSIGN ────────► 수신
      │                                                        │
T+1   │                                                        │ TASK_ACK 전송
      │                         ◄──────── TASK_ACK ────────────│
      │  "A 에이전트가          │                              │
      │   작업을 시작했습니다"  │                              │
      │                                                        │
T+2   │                                                        │ agent-cli 실행
      │                                                        │ → Gmail API 호출
      │                                                        │ → 메일 3건 확인
      │                         ◄──── TASK_PROGRESS(30%) ──────│
      │  "📧 메일 3건 확인 중..."│                             │
      │                                                        │
T+10  │                                                        │ → 첨부파일 다운로드
      │                                                        │ → 파일 분류 저장
      │                                                        │ → LLM 분석
      │                         ◄──── TASK_PROGRESS(80%) ──────│
      │                                                        │
T+23  │                                                        │ 완료
      │                         ◄──── TASK_COMPLETE ───────────│
      │  "✅ [A 에이전트 봇]     │
      │   작업 완료             │
      │   Gmail 3건 분석..."    │
```

### 6.2 시나리오 B: 서버 모니터링 (예약 작업)

```
시간   │  사용자/메신저            Hub                         Agent B (서버)
───────┼──────────────────────────────────────────────────────────────────────
T+0    │  "B 에이전트 봇아        ─────────────────────────────
       │   서버 상태를            │ Command Parser:
       │   10분마다 모니터링해서  │  agent="B", schedule 감지
       │   이상 증후가 보이면     │  interval: 600000ms
       │   보고해줘"             │ Task Manager:
       │                          │  scheduledTaskId=S001
       │                          ──── SCHEDULE_CREATE ─────► 수신
       │                                                       │
T+1    │                                                       │ 로컬 cron 등록
       │                          ◄──── SCHEDULE_ACK ──────────│
       │  "B 에이전트가 10분 간격  │
       │   모니터링을 시작합니다"  │
       │                                                       │
T+600  │                                                       │ [자동 실행 #1]
       │                                                       │ CPU: 45%, OK
       │                                                       │ (정상 → 보고 안함)
       │                                                       │
T+1200 │                                                       │ [자동 실행 #2]
       │                                                       │ CPU: 95% ⚠️
       │                          ◄── PROACTIVE_REPORT ────────│
       │  "⚠️ [B 에이전트 봇]     │   severity: warning
       │   서버 이상 감지         │
       │   CPU 95.2%..."         │
       │                                                       │
       │  "모니터링 중지"         ─── TASK_CANCEL ────────────► cron 해제
       │                          ◄── TASK_CANCEL_ACK ─────────│
       │  "모니터링이 중지되었습니다"│
```

### 6.3 시나리오: 에이전트 상태 조회 (Hub 직접 처리)

```
사용자: "에이전트 현황"

Hub 응답:
┌──────────────────────────────────────────┐
│  📊 에이전트 현황                          │
│                                          │
│  🟢 A 에이전트 봇 (개인 데스크톱)          │
│     상태: 대기 중 | 모델: gemini-2.5-flash│
│     도구: gmail, file_manager             │
│     활성 작업: 0건                         │
│                                          │
│  🟢 B 에이전트 봇 (운영 서버)              │
│     상태: 모니터링 중 | 모델: gemini-2.5-flash│
│     도구: server_monitor, shell           │
│     활성 작업: 1건 (서버 모니터링)          │
│                                          │
│  🔴 C 에이전트 봇 (회사 데스크톱)           │
│     상태: 오프라인 (마지막: 2시간 전)       │
│     도구: groupware_connector             │
│     활성 작업: 0건                         │
└──────────────────────────────────────────┘
```

---

## 7. 보안 설계

### 7.1 인증 체계

```
┌───────────────────────────────────────────────────────────┐
│                    3-Layer 인증                            │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  Layer 1: 메신저 → Hub                                    │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 메신저 플랫폼 자체 인증 (Telegram Bot Token 등)       │  │
│  │ + Hub 사용자 허용 목록 (userId whitelist)             │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  Layer 2: Hub → Agent Node                                │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ 상호 TLS 또는 사전 공유 토큰 (PSK)                    │  │
│  │ Agent Node 최초 등록 시 Hub에서 발급                   │  │
│  │ WebSocket 연결마다 토큰 검증                          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  Layer 3: Agent Node → 로컬 리소스                         │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ agent-cli 기존 정책 엔진 (PolicyEngine)               │  │
│  │ 원격 명령 = 제한된 도구만 허용 (화이트리스트)           │  │
│  │ 위험 도구(shell, file_write) = 사전 승인 필요          │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### 7.2 에이전트별 도구 정책

```typescript
// Agent Node 설정 예시
{
  "agentNode": {
    "hubUrl": "wss://hub.company.internal:18789",
    "agentName": "A 에이전트 봇",
    "authToken": "psk_xxxx...",

    // 원격 명령에서 사용 가능한 도구 화이트리스트
    "remoteToolPolicy": {
      "allowed": ["gmail_read", "gmail_search", "file_read", "file_write", "file_organize"],
      "denied": ["shell_exec", "web_fetch"],
      "requireApproval": ["file_delete"],

      // 도구별 제한
      "limits": {
        "file_write": {
          "allowedPaths": ["~/Desktop/업무/**"],
          "maxFileSize": "100MB"
        }
      }
    }
  }
}
```

### 7.3 네트워크 보안

| 구간              | 보안 수단                            |
| ----------------- | ------------------------------------ |
| 메신저 → Hub      | HTTPS (메신저 플랫폼 관리)           |
| Hub ← Agent Node  | WSS (TLS 암호화) + 토큰 인증         |
| Agent Node → 로컬 | 로컬 프로세스 (네트워크 불필요)      |
| Hub 외부 노출     | 기본 비활성, Tailscale/VPN 경유 권장 |

---

## 8. 장애 대응

### 8.1 네트워크 단절

```
Agent Node ─── 네트워크 끊김 ───✕── Hub
    │
    ├─ 예약 작업: 로컬 스케줄러가 계속 실행
    │   결과를 로컬 큐에 버퍼링
    │
    ├─ 자동 재연결: 지수 백오프 (1s → 2s → 4s → ... → 5min max)
    │
    └─ 재연결 성공 시:
        ├─ 버퍼링된 보고 일괄 전송
        ├─ 에이전트 상태 재등록
        └─ 미완료 작업 상태 동기화
```

### 8.2 Hub 장애

```
Hub ─── 장애 ───✕

Agent Nodes:
  ├─ 예약 작업은 계속 실행 (로컬 독립)
  ├─ 보고는 로컬 큐에 저장
  └─ 주기적으로 Hub 재연결 시도

복구 시:
  ├─ Agent Nodes 자동 재연결 + 재등록
  ├─ 버퍼링된 보고 전달
  └─ TaskStore에서 작업 상태 복원
```

### 8.3 Agent Node 장애

```
Agent Node ─── 장애 ───✕

Hub:
  ├─ heartbeat 실패 3회 → 상태를 'offline'으로 변경
  ├─ 해당 에이전트의 활성 작업 → 'stalled' 상태
  ├─ 메신저 알림: "⚠️ A 에이전트가 응답하지 않습니다"
  └─ 예약 작업: Hub에서 'paused' 상태로 전환

복구 시:
  ├─ Agent Node 재시작 → Hub에 재연결 + 재등록
  ├─ stalled 작업 → 재실행 또는 실패 처리 (설정에 따라)
  └─ paused 예약 작업 → 자동 재개
```

---

## 9. 패키지 구조 & 구현 범위

### 9.1 최종 패키지 구조

```
packages/
├── cli/                    ← 기존 유지 (터미널 UI)
├── core/                   ← 기존 유지 (최소 수정)
├── a2a-server/             ← 기존 유지 (A2A 프로토콜 호환)
│
├── hub/                    ← 신규: 중앙 허브 서버
│   ├── src/
│   │   ├── server.ts
│   │   ├── channelAdapter/
│   │   │   ├── types.ts
│   │   │   ├── telegram.ts
│   │   │   └── slack.ts
│   │   ├── commandParser.ts
│   │   ├── agentRegistry.ts
│   │   ├── taskManager.ts
│   │   ├── reportAggregator.ts
│   │   ├── auth/
│   │   └── storage/
│   └── package.json
│
├── agent-node/             ← 신규: 에이전트 노드 데몬
│   ├── src/
│   │   ├── daemon.ts
│   │   ├── hubConnector.ts
│   │   ├── registration.ts
│   │   ├── taskExecutor.ts
│   │   ├── reportSender.ts
│   │   ├── scheduler.ts
│   │   └── healthCheck.ts
│   └── package.json
│
└── shared/                 ← 신규: Hub-Node 공유 타입/프로토콜
    ├── src/
    │   ├── protocol.ts     ← HubMessage 타입 정의
    │   ├── types.ts        ← AgentRegistration, Capability 등
    │   └── constants.ts
    └── package.json
```

### 9.2 구현 단계

| 단계        | 목표                    | 산출물                                                                                       |
| ----------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| **Phase 1** | 최소 동작 프로토타입    | `shared` + `hub`(Webhook 채널만) + `agent-node`(단순 에이전트 1개), 명령→실행→보고 기본 흐름 |
| **Phase 2** | 메신저 연동 + 예약 작업 | Telegram/Slack 채널 어댑터, 예약 작업 (cron), 다중 에이전트 라우팅                           |
| **Phase 3** | 안정성 + 보안           | 3-Layer 인증, 도구 정책, 장애 복구 (재연결/버퍼링), 헬스 대시보드                            |
| **Phase 4** | 고도화                  | LLM 기반 자동 라우팅, 에이전트 간 협업, 커스텀 스킬 마켓플레이스                             |

---

## 10. 대안 비교

### 10.1 접근법 비교

| 접근법                      | 설명                                       | 장점                              | 단점                                       |
| --------------------------- | ------------------------------------------ | --------------------------------- | ------------------------------------------ |
| **A. Hub-Spoke (본 제안)**  | 중앙 Hub + 분산 Agent Node                 | 중앙 관리, 라우팅 용이, 보안 집중 | Hub = SPOF, Hub 운영 필요                  |
| **B. Mesh P2P**             | 에이전트끼리 직접 통신                     | Hub 불필요, 장애 내성             | 라우팅 복잡, 보안 분산, 메신저 연동 어려움 |
| **C. 메신저 Bot 직접 연결** | 각 에이전트가 개별 봇으로 메신저 직접 연결 | 구현 단순                         | 중앙 관리 불가, 에이전트 수만큼 봇 필요    |
| **D. 기존 A2A Server 확장** | a2a-server에 라우팅만 추가                 | 기존 코드 최대 활용               | WebSocket 미지원, 예약 작업 부재           |

**A (Hub-Spoke) 선택 이유**:

- 사용자 요구사항 "중앙에서 관리"에 가장 부합
- "하나의 메신저 채널"에서 모든 에이전트 제어에 최적
- Hub 이중화(Active-Standby)로 SPOF 해소 가능
- 기존 A2A Server 코드를 Hub 내부에 통합 가능

### 10.2 Hub SPOF 대응

```
┌──────────────┐     ┌──────────────┐
│  Hub Primary  │◄───►│  Hub Standby  │
│  (Active)     │     │  (Passive)    │
│               │     │               │
│  Redis/       │     │  Redis/       │
│  PostgreSQL   │◄───►│  PostgreSQL   │
│  (공유 저장소) │     │  (replicated) │
└──────────────┘     └──────────────┘
       ▲                    ▲
       │    Agent Nodes     │
       │    양쪽 모두 연결    │
       └────────┬───────────┘
                │
    ┌───────────┼───────────┐
    ▼           ▼           ▼
 Agent A     Agent B     Agent C
```

---

## 11. 기술 스택 요약

| 컴포넌트         | 기술                                  | 근거                                    |
| ---------------- | ------------------------------------- | --------------------------------------- |
| Hub 서버         | Node.js + Express + ws                | 기존 A2A Server와 동일 스택, 즉시 활용  |
| Hub ↔ Node 통신 | WebSocket (ws 라이브러리)             | 양방향 실시간, 가벼움, Node.js 네이티브 |
| 메신저 연동      | grammY (Telegram) / Slack Bolt        | 성숙한 라이브러리, TypeScript 지원      |
| 명령 파싱        | 정규식 + 기존 GeminiClient (LLM 폴백) | 빠른 1차 파싱 + 지능형 2차 라우팅       |
| 예약 작업        | node-cron (Agent Node 로컬)           | 가벼움, 네트워크 독립 실행              |
| 상태 저장        | SQLite (단일 Hub) / Redis (이중화 시) | 설치 무의존, 필요 시 Redis 업그레이드   |
| 인증             | PSK + JWT (Agent Node ↔ Hub)         | 단순하면서 안전, 토큰 만료 관리         |
| 작업 실행        | 기존 GeminiClient + Scheduler         | Core 패키지 변경 없이 재사용            |
