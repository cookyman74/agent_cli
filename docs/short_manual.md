# Didim Agent CLI 간편 매뉴얼

## 설치

```bash
npm install -g @didim365/agent-cli
```

설치 없이 바로 실행:

```bash
npx @didim365/agent-cli
```

**Node.js 20 이상** 필요.

## 인증 설정

사용할 프로바이더를 하나 선택하고 환경변수를 설정합니다:

| 프로바이더              | 설정 방법                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Gemini (Google 로그인)  | `didim` 실행 → "Login with Google" 선택                                                    |
| Gemini (API Key)        | `export GEMINI_API_KEY="your-key"`                                                         |
| Claude (Anthropic)      | `export ANTHROPIC_API_KEY="your-key"`                                                      |
| OpenAI                  | `export OPENAI_API_KEY="your-key"`                                                         |
| Vertex AI               | `export GOOGLE_API_KEY="your-key"` + `export GOOGLE_GENAI_USE_VERTEXAI=true`               |
| 로컬/sLM (vLLM, Ollama) | `export LLM_PROVIDER=openai-compatible` + `export LLM_BASE_URL="http://localhost:8000/v1"` |

> `DIDIM_*`와 `GEMINI_*` 환경변수 접두사 모두 지원됩니다.

## 실행

```bash
# 현재 디렉토리에서 시작
didim

# 추가 디렉토리 포함
didim --include-directories ../lib,../docs

# 모델 지정
didim -m gemini-2.5-flash            # Gemini
didim -m claude-sonnet-4-5-20250929  # Claude
didim -m gpt-4.1                     # OpenAI

# 비대화형 모드 (스크립트 연동)
didim -p "이 코드베이스를 설명해줘"
didim -p "테스트 실행" --output-format json
```

## 주요 명령어

| 명령어               | 설명                           |
| -------------------- | ------------------------------ |
| `/help`              | 도움말 표시                    |
| `/model`             | 모델/프로바이더 변경           |
| `/auth login`        | 인증 프로바이더 전환           |
| `/chat save <tag>`   | 대화 저장                      |
| `/chat resume <tag>` | 저장된 대화 재개               |
| `/resume`            | 이전 세션 목록 탐색 및 재개    |
| `/restore`           | 파일 수정 되돌리기 (롤백)      |
| `/compress`          | 컨텍스트 요약하여 토큰 절약    |
| `/memory show`       | 로드된 AGENTS.md 컨텍스트 확인 |
| `/settings`          | 설정 편집기 열기               |
| `/mcp list`          | MCP 서버 도구 목록             |
| `/stats`             | 토큰 사용량 통계               |
| `/clear`             | 화면 지우기                    |
| `@server`            | 특정 MCP 서버로 프롬프트 전송  |
| `!command`           | 셸 명령 직접 실행              |

## 주요 단축키

| 단축키              | 동작                                        |
| ------------------- | ------------------------------------------- |
| `Enter`             | 프롬프트 제출                               |
| `Shift+Enter`       | 줄바꿈 (제출하지 않음)                      |
| `Ctrl+C`            | 현재 요청 취소 / 입력 지우기                |
| `Ctrl+D`            | CLI 종료                                    |
| `Ctrl+L`            | 화면 지우기                                 |
| `Ctrl+R`            | 히스토리 검색                               |
| `Ctrl+P` / `Ctrl+N` | 이전 / 다음 히스토리                        |
| `Ctrl+Y`            | 자동 승인(YOLO) 모드 토글                   |
| `Shift+Tab`         | 승인 모드 순환 (기본 → 자동편집 → 읽기전용) |
| `Ctrl+X`            | 외부 편집기에서 프롬프트 열기               |
| `Tab`               | 제안 수락 / 셸 입력으로 전환                |
| `Double Esc`        | 이전 상호작용 탐색                          |

## AGENTS.md 컨텍스트 파일

프로젝트 루트에 `AGENTS.md`를 만들면 AI에게 지속적인 지시를 제공할 수 있습니다:

```markdown
# 프로젝트 컨텍스트

이 프로젝트는 TypeScript와 React를 사용합니다. 커밋 전에 항상 테스트를
실행하세요.
```

계층적으로 로드됩니다: 글로벌(`~/.didim/AGENTS.md`) → 프로젝트 상위 디렉토리 →
하위 디렉토리 순서.

## MCP 서버 설정

`~/.didim/settings.json`에서 설정합니다:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "your-token" }
    }
  }
}
```

사용 예시: `@github 내 오픈 PR 목록 보여줘`

## 설정 파일 경로

| 경로                     | 설명                       |
| ------------------------ | -------------------------- |
| `~/.didim/settings.json` | 사용자 설정, MCP 서버 구성 |
| `~/.didim/model.json`    | 프로바이더별 저장된 모델   |
| `AGENTS.md`              | 프로젝트 수준 AI 컨텍스트  |

> `~/.gemini/` 경로도 하위 호환으로 지원됩니다.

## 문제 해결

| 증상                     | 해결 방법                                                         |
| ------------------------ | ----------------------------------------------------------------- |
| 하단에 "no sandbox" 표시 | `DIDIM_SANDBOX=true` 설정 또는 `--sandbox` 플래그 사용            |
| 파일 접근 오류           | 프로젝트 루트에서 `didim` 실행, 또는 `--include-directories` 사용 |
| 비Gemini 프로바이더 오류 | `ENABLE_MULTI_PROVIDER=true` 설정 확인                            |
| vLLM 404 오류            | `LLM_BASE_URL`에 `/v1` 접미사 포함 여부 확인                      |
| 모델을 찾을 수 없음      | `/model` 명령어로 사용 가능한 모델 목록 확인                      |

## 상세 문서

- [전체 문서](./index.md)
- [프로바이더 가이드](./providers.md)
- [설정 가이드](./configuration.md)
- [명령어 레퍼런스](./cli/commands.md)
- [키보드 단축키](./cli/keyboard-shortcuts.md)
- [MCP 서버 연동](./tools/mcp-server.md)
