# DidimAIStudio 연동 및 원격 명령 타당성 검토 보고서 (최종 제안)

## 1. 사용자가 요청한 운영 시나리오 분석

사용자가 정의한 **"멀티 디바이스 원격 제어"** 시나리오는 다음과 같습니다.

### [시나리오]

1.  **설치**: A데스크탑, B서버에 각각 `agent-cli` 설치.
2.  **인증**: 각 기기에서 API Key로 로그인.
3.  **가동**: 각 기기에서 `/activate` (또는 데몬 모드) 실행하여 서버와 세션
    연결.
4.  **명령**: Slack/챗봇에서 _"A 데스크톱에 파일을 정리하여 보고해줘"_ 라고
    명령.
5.  **실행**: DidimAIStudio가 명령을 해석하여 A데스크탑의 CLI에게 전달 및 실행.

### [타당성 분석]

- **가능 여부**: **가능 (Feasible)**.
- **전제 조건**: 이 시나리오는 현재 DidimAIStudio의 기본 기능만으로는 작동하지
  않으며, 아래 **"아키텍처 제안"** 에 기술된 기능들이 서버와 클라이언트에
  구현되어야 합니다.

---

## 2. 실현을 위한 아키텍처 제안

이 시나리오를 완벽하게 구현하기 위해 필요한 **3가지 핵심 메커니즘**을
제안합니다.

### 2.1 Device Identification (기기 식별)

"A 데스크톱", "B 서버"를 구분하기 위해 각 CLI는 고유한 ID와 별칭(Alias)을 가져야
합니다.

- **CLI 동작**: 로그인 또는 `/activate` 실행 시, 기기의 별칭을 등록합니다.
  ```bash
  $ didim login --device-alias="desktop-a"
  # 또는
  $ didim activate --alias="server-b"
  ```
- **서버 동작**: `user_id`와 `device_alias`를 매핑하여 세션을 관리합니다.
  - User: `jungho`
    - Device 1: `desktop-a` (Status: Online, LastSeen: 10s ago)
    - Device 2: `server-b` (Status: Online, LastSeen: 1m ago)

### 2.2 Intelligent Routing (지능형 라우팅)

사용자의 자연어 명령("A 데스크톱에...")을 해석하여 타겟 기기를 찾아내는
로직입니다.

- **Didim Agent (LLM)**: 사용자의 프롬프트를 분석하여 **"대상 기기"** 와
  **"실행할 명령"** 을 추출합니다.
  - 사용자 입력: _"A 데스크톱에 파일을 정리해줘"_
  - LLM 추출(Tool Call):
    ```json
    {
      "tool": "send_remote_command",
      "args": {
        "target_device": "desktop-a",
        "command": "organize_files.sh"
      }
    }
    ```

### 2.3 Command Delivery (명령 전달 - Mailbox 방식)

CLI(NAT 내부)가 서버의 명령을 받기 위한 **Pull 방식**의 통신 구조입니다.

- **Command Queue (서버)**: 에이전트가 생성한 명령을 `desktop-a`의
  우편함(Queue)에 넣습니다.
- **CLI Polling/SSE (클라이언트)**: `desktop-a`에서 실행 중인 `/activate`
  프로세스가 서버에게 _"나한테 온 명령 있어?"_ 라고 주기적으로 묻거나, SSE
  연결을 통해 즉시 수신합니다.

---

## 3. 구현 제안 (Step-by-Step)

### Step 1: CLI 업데이트 (Client)

1.  **설정 파일 확장**: `~/.didim/config.json`에 `device_alias` 필드 추가.
2.  **`didim activate` 명령어 구현**:
    - 서버와 Persistent Connection(SSE) 연결.
    - `message` 이벤트 외에 `command` 이벤트를 리스닝.
    - 수신된 명령을 로컬 쉘에서 실행 후 결과 반환.

### Step 2: DidimAIStudio 서버 업데이트 (Server)

1.  **Device Registry**: 사용자의 기기 목록 및 상태 관리 API.
2.  **Command Queue**: 기기별 명령 대기열 및 조회 API.
    - `POST /v1/devices/{alias}/commands` (명령 등록)
    - `GET /v1/devices/me/commands` (명령 조회 - CLI용)

### Step 3: Agent 시나리오 설정

1.  **시스템 프롬프트**: "사용자가 특정 기기를 지칭하면 `send_remote_command`
    도구를 사용해라."
2.  **도구 설정**: `send_remote_command(target, cmd)` 도구 등록.

---

## 4. 결론

사용자가 구상한 시나리오는 **매우 논리적이며 기술적으로 구현 가능**합니다. 단,
이를 위해서는 DidimAIStudio가 단순한 챗봇을 넘어 **"인프라 제어 센터(C2)"**
역할을 수행해야 하므로, 서버 측의 **Device 관리 및 Command Queue API** 개발이
선행되어야 합니다.
