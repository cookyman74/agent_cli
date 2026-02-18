# OpenClaw (오픈클로) 조사 보고서

> 작성일: 2026-02-18 목적: didim agent-cli 외부 명령 처리 기능 설계를 위한 참조
> 아키텍처 조사

---

## 1. 개요

OpenClaw은 오스트리아 개발자 **Peter Steinberger**가 만든 오픈소스 자율 AI
에이전트 플랫폼. 로컬 머신에서 실행되며, 메시징 플랫폼(WhatsApp, Telegram,
Slack, Discord 등)을 UI로 사용하여 사용자 대신 작업을 수행한다.

**핵심 포지셔닝**: 단순 챗봇이 아닌 "눈과 손이 있는 AI" — 웹 브라우징, 파일
읽기/쓰기, 셸 명령 실행을 자율적으로 수행.

- GitHub: 200K+ 스타, 35K+ 포크
- 라이선스: MIT
- 기술 스택: Node.js 22+
- 에이전트 런타임: Pi Agent Core (`@mariozechner/pi-agent-core`)

---

## 2. 역사적 타임라인

| 시기       | 이벤트                                                            |
| ---------- | ----------------------------------------------------------------- |
| 2025.11    | "WhatsApp Relay" 주말 프로젝트로 시작                             |
| 2026.01 초 | **Clawdbot**으로 공개, 1주일에 GitHub 스타 100K+ 돌파             |
| 2026.01.27 | Anthropic 상표권 항의 → **Moltbot**으로 개명                      |
| 2026.01.30 | **OpenClaw**으로 최종 변경                                        |
| 2026.02.14 | Steinberger가 OpenAI 합류 발표, 프로젝트는 오픈소스 재단으로 이관 |

---

## 3. 4계층 아키텍처

```
┌─────────────────────────────────────────────┐
│  Layer 1: Gateway (제어 평면)                │
│  - Node.js 22+ WebSocket 서버               │
│  - 127.0.0.1:18789 (루프백 전용)            │
│  - 메시지 라우팅, 상태 관리, 스킬 오케스트레이션 │
├─────────────────────────────────────────────┤
│  Layer 2: Channel Adapters (채널 통합)       │
│  - WhatsApp(Baileys), Telegram(grammY),     │
│    Discord(discord.js), Slack, iMessage 등   │
│  - 메시지 정규화 ⇄ 응답 역변환              │
├─────────────────────────────────────────────┤
│  Layer 3: LLM Provider 추상화              │
│  - Anthropic Claude (권장), OpenAI GPT,     │
│    Google Gemini, 로컬 모델(Ollama)         │
│  - 사용자 자체 API 키 사용                   │
├─────────────────────────────────────────────┤
│  Layer 4: Persistent Memory (영속 저장소)    │
│  - SQLite 벡터 DB + 임베딩                  │
│  - 하이브리드 검색 (벡터 + BM25)            │
│  - ~/.openclaw/ 로컬 저장                   │
└─────────────────────────────────────────────┘
```

---

## 4. 핵심 동작 원리

### 4.1 요청 처리 흐름

```
사용자 메시지 (WhatsApp 등)
  ↓ [<10ms] 접근 제어 & 허용 목록 확인
  ↓ [<50ms] 세션 로드
  ↓ [<100ms] 컨텍스트 조립 (시스템 프롬프트 + 메모리 + 스킬 정의)
  ↓ [200-500ms] LLM 모델 호출 (스트리밍)
  ↓ [50ms-3s] 도구 실행 (필요시, 샌드박스 내)
  ↓ 응답을 채널 네이티브 형식으로 변환 → 사용자에게 전달
  ↓ 세션 상태 영속화
```

### 4.2 Agent Runtime

구현체: `PiEmbeddedRunner` — Pi Agent Core 기반

**4단계 순환**: 세션 해결 → 컨텍스트 조립 → 모델 응답 스트리밍 → 상태 지속

시스템 프롬프트 계층:

```
Pi Agent Core (기본)
→ AGENTS.md (전역 제약)
→ SOUL.md (성격/톤)
→ TOOLS.md (사용자 정의)
→ 동적 스킬 주입
→ 메모리 검색
```

**핵심**: 모든 스킬이 프롬프트에 포함되지 않음 — 현재 턴과 관련된 스킬만 선택적
주입 (프롬프트 비대화 방지)

### 4.3 Gateway 상세

- **기술**: Node.js 22+ WebSocket 서버
- **바인딩**: `127.0.0.1:18789` (루프백 전용)
- **프로토콜**: JSON Schema 검증된 WebSocket 프레임
- **주요 책임**:
  - 채널 연결 조율 (WhatsApp/Telegram/Discord 등)
  - CLI, Web UI, 모바일 앱 클라이언트 관리
  - 세션 상태, 헬스 모니터링
- **설계 원칙**:
  - 호스트당 정확히 1개 Gateway
  - 이벤트 기반 아키텍처 (폴링 대신 구독)
  - 멱등성 키로 안전한 재시도 보장

### 4.4 채널 어댑터

각 플랫폼 어댑터가 처리하는 3가지 기능:

1. **API 연결**: 메시징 플랫폼의 공식 API와 통신
2. **메시지 정규화**: 플랫폼 독립적인 표준 내부 형식으로 변환
3. **응답 변환**: Gateway 응답을 플랫폼 특화 형식(리치 텍스트, 버튼, 미디어)으로
   재변환

지원 채널: WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Google Chat,
Microsoft Teams, BlueBubbles, Matrix, Zalo, WebChat

### 4.5 세션 유형

- **main**: 직접 메시지 (완전 권한)
- **dm:\<channel\>:\<id\>**: 채널 DM (제한적)
- **group:\<channel\>:\<id\>**: 그룹 채팅 (샌드박싱됨)

각 세션은 보안 경계이자 권한 컨테이너.

---

## 5. AgentSkills 시스템

### 5.1 스킬 범주

| 카테고리     | 예시                                         |
| ------------ | -------------------------------------------- |
| 개발자/기술  | 셸 명령 실행, GitHub 모니터링, 테스트/배포   |
| 생산성       | 이메일 분류, 캘린더 예약, Notion/Trello 연동 |
| 웹 자동화    | Playwright 브라우저 제어, 웹 스크래핑        |
| 스마트홈     | Home Assistant (조명, 온도, 보안)            |
| 커뮤니케이션 | 크로스플랫폼 메시징, 소셜 미디어 모니터링    |

### 5.2 ClawHub (스킬 레지스트리)

- 최소한의 스킬 저장소로 동적 기능 모델 구현
- 사용자 요청에 따라 스킬 자동 검색
- 커뮤니티 기여 스킬 발견
- 슬래시 명령(`/status`) 또는 자연어로 호출

### 5.3 스킬 발견 vs 주입

- 런타임 시 스킬 발견 가능
- 모든 스킬을 프롬프트에 주입하지 않음
- 현재 턴과 관련된 스킬만 선택적 주입 (프롬프트 비대화 방지)

---

## 6. 다중 에이전트 & Canvas

### 6.1 다중 에이전트 라우팅

채널/그룹을 독립된 에이전트 인스턴스에 매핑:

```json
{
  "agents": {
    "mapping": {
      "group:discord:123": {
        "workspace": "~/.openclaw/workspaces/discord-bot",
        "model": "anthropic/claude-sonnet-4-5",
        "systemPromptOverrides": {}
      },
      "dm:telegram:*": {
        "workspace": "~/.openclaw/workspaces/support-agent",
        "model": "openai/gpt-4o",
        "sandbox": { "mode": "always" }
      }
    }
  }
}
```

### 6.2 세션 간 통신

```
sessions_list     → 활성 세션 발견
sessions_send     → 메시지 전송 (무음 모드 옵션)
sessions_history  → 다른 세션 대화록 조회
sessions_spawn    → 프로그래밍 방식 위임
```

### 6.3 Canvas (A2UI)

- 별도 서버(포트 18793) — Gateway 크래시와 격리
- 에이전트가 A2UI 속성이 포함된 HTML 생성 → WebSocket으로 클라이언트 푸시
- 플랫폼 지원: macOS(WebKit), iOS(SwiftUI), Android(WebView), 웹 브라우저

---

## 7. 메모리 시스템

### 7.1 저장 구조

```
~/.openclaw/
├── openclaw.json        # 메인 설정 (JSON5)
├── sessions/            # 세션 JSON (이벤트 로그)
├── credentials/         # 채널 인증 (0600 권한)
├── memory/              # SQLite 벡터 DB + 임베딩
└── workspaces/          # 에이전트 작업공간
```

### 7.2 메모리 파일

- `MEMORY.md`: 장기 기억 (main 세션만)
- `memory/YYYY-MM-DD.md`: 일일 노트

### 7.3 하이브리드 검색

- 벡터 유사도 (의미론적)
- BM25 키워드 (정확 매칭)

### 7.4 임베딩 선택 우선순위

1. 로컬 모델 (`local.modelPath`)
2. OpenAI API
3. Gemini API
4. 비활성화

자동 재인덱싱: 파일 변경 감지 (1.5초 디바운스)

---

## 8. 보안 모델

### 8.1 보안 설계

| 영역          | 메커니즘                                                  |
| ------------- | --------------------------------------------------------- |
| 네트워크      | 기본 루프백(127.0.0.1) 전용, SSH/Tailscale로 원격 접근    |
| 인증          | v2026.1.29에서 `auth: none` 영구 제거, 토큰/비밀번호 필수 |
| 채널 접근     | 허용 목록, DM 페어링, 그룹 멘션 게이트                    |
| 도구 샌드박싱 | Docker 기반 세션별 격리 (main=호스트, DM/그룹=샌드박스)   |
| 프롬프트 주입 | 컨텍스트 격리, 메시지 출처 명시, 구조화된 도구 결과       |

### 8.2 도구 샌드박싱 상세

- **main 세션**: 호스트 접근 (오버헤드 없음)
- **DM 세션**: 기본 Docker 샌드박싱
- **그룹 세션**: 기본 샌드박싱
- 컨테이너 세분성: 세션별(강함) / 에이전트별 / 공유(효율적)
- 호스트 노출: 바인드 마운트로 조절
- 리소스 제한: CPU/메모리 제약

### 8.3 주요 보안 사건

| 사건              | 설명                                                       |
| ----------------- | ---------------------------------------------------------- |
| Shodan 노출       | 수백 인스턴스 `auth: none`으로 공개 → API 키, 봇 토큰 유출 |
| 악성 VS Code 확장 | "ClawdBot Agent" 확장이 ScreenConnect RAT 설치             |
| ClawHub 오염      | **335개 악성 스킬** (전체 ~12%) — 외부 코드 실행 유도      |
| 암호화폐 사기     | 이름 변경 시 $16M 규모 가짜 토큰 피해                      |
| Cisco 연구        | 사용자 인식 없는 데이터 유출 및 프롬프트 주입 시연         |

### 8.4 OpenClaw Scanner

Astrix Security 출시 오픈소스 탐지 도구:

- 조직 내 무단 OpenClaw 인스턴스 탐지
- EDR 데이터 기반 읽기 전용 스캔 (추가 에이전트 설치 불필요)
- Python 기반 포터블

---

## 9. 배포 옵션

| 옵션                  | 방식               | 특징                  |
| --------------------- | ------------------ | --------------------- |
| 로컬 설치             | `openclaw onboard` | 권장, TUI/Web UI 선택 |
| Docker                | 공식 이미지        | 컨테이너화, 확장성    |
| DigitalOcean          | 1-클릭 배포        | 보안 강화, 관리형     |
| Cloudflare Moltworker | Workers 샌드박스   | PoC, $5/월            |
| 전용 하드웨어         | Mac Mini 24/7      | "Moltbook" 트렌드     |

---

## 10. 비용 구조

OpenClaw 자체는 무료(MIT 라이선스). AI API 사용료만 발생:

| 사용량   | 월 비용 | 용도             |
| -------- | ------- | ---------------- |
| Light    | $10-30  | 기본 메시징      |
| Moderate | $30-70  | 이메일, 스케줄링 |
| Heavy    | $70-150 | 전체 자동화      |

---

## 11. didim agent-cli와의 비교

| 비교 항목           | OpenClaw                     | didim agent-cli                   |
| ------------------- | ---------------------------- | --------------------------------- |
| 실행 방식           | 백그라운드 데몬 (24/7)       | 인터랙티브 CLI                    |
| UI                  | 메시징 플랫폼 (WhatsApp 등)  | 터미널 (React/Ink)                |
| LLM 연동            | 모델 무관 (Provider 추상화)  | Multi-LLM Adapter (Provider 패턴) |
| 에이전트 프레임워크 | Pi Agent Core                | 자체 core 패키지                  |
| 확장성              | AgentSkills + ClawHub        | MCP 서버 + Tool 시스템            |
| 세션                | 다중 동시 세션 (채널별 격리) | 단일 세션                         |
| 메모리              | 영속 벡터 검색               | 파일 기반 세션 저장               |

**유사점**: Provider 추상화 레이어 패턴, 로컬 실행 우선, 모델 무관적 설계

**차이점**: OpenClaw = "항상 켜진 메시징 기반 자동화 플랫폼", didim = "터미널
기반 인터랙티브 코딩 에이전트"

---

## 참조 출처

- [OpenClaw Complete Guide 2026 - NxCode](https://www.nxcode.io/resources/news/openclaw-complete-guide-2026)
- [OpenClaw Architecture Deep Dive - Collabnix](https://collabnix.com/openclaw-architecture-deep-dive-how-it-works-under-the-hood/)
- [OpenClaw System Architecture - Paolo Perazzo](https://ppaolo.substack.com/p/openclaw-system-architecture-overview)
- [What is OpenClaw - DigitalOcean](https://www.digitalocean.com/resources/articles/what-is-openclaw)
- [OpenClaw Scanner - Help Net Security](https://www.helpnetsecurity.com/2026/02/12/openclaw-scanner-open-source-tool-detects-autonomous-ai-agents/)
- [OpenClaw Security - VentureBeat](https://venturebeat.com/security/openclaw-agentic-ai-security-risk-ciso-guide)
- [OpenClaw Security Nightmare - Cisco](https://blogs.cisco.com/ai/personal-ai-agents-like-openclaw-are-a-security-nightmare)
- [OpenClaw Creator Joins OpenAI - CNBC](https://www.cnbc.com/2026/02/15/openclaw-creator-peter-steinberger-joining-openai-altman-says.html)
