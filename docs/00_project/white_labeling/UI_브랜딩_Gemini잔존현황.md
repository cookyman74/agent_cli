# UI 브랜딩 — "Gemini" 표시 잔존 현황

> **작성일**: 2026-02-14 **기준 브랜치**: `DID/v0.1` **목적**: `didim` 실행 시
> 터미널에 표시되는 "Gemini" 문자열 잔존 위치 목록 및 변경 계획 **분리 출처**:
> [인증없이실행\_분석.md](./인증없이실행_분석.md) 섹션 6에서 분리

---

## 1. 현황 요약

`didim` 실행 시 터미널에 "Gemini CLI", "Gemini" 등의 문자열이 다수 남아있음.
패키지명(`@didim365/agent-cli`)과 바이너리명(`didim`)은 변경 완료되었으나, 소스
코드 내 사용자 노출 문자열은 미변경 상태.

**참고**: ASCII 아트(`ui/components/AsciiArt.ts`)는 이미 "DIDIM" 브랜딩으로
변경됨.

---

## 2. 잔존 위치 목록

> 경로 기준: `packages/cli/src/`

### 2.1 인증/로그인 관련

| 파일                                            | 위치            | 표시 내용                             | 영향도 |
| ----------------------------------------------- | --------------- | ------------------------------------- | ------ |
| `ui/auth/AuthDialog.tsx:199`                    | 인증 다이얼로그 | "...Restarting Gemini CLI..."         | 높음   |
| `ui/auth/AuthDialog.tsx:244`                    | 이용약관        | "Terms of Services...for Gemini CLI"  | 높음   |
| `ui/auth/LoginWithGoogleRestartDialog.tsx:35`   | 로그인 후       | "...Gemini CLI needs to be restarted" | 높음   |
| `ui/components/LogoutConfirmationDialog.tsx:65` | 로그아웃        | "...using Gemini CLI..."              | 중간   |

### 2.2 일반 UI 컴포넌트

| 파일                                      | 위치               | 표시 내용                         | 영향도 |
| ----------------------------------------- | ------------------ | --------------------------------- | ------ |
| `ui/components/AboutBox.tsx:45`           | About 다이얼로그   | "About Gemini CLI"                | 높음   |
| `utils/windowTitle.ts:47`                 | 터미널 윈도우 제목 | "Gemini CLI (workspace)"          | 높음   |
| `ui/components/SessionBrowser.tsx:398`    | 세션 뷰어          | "Gemini:" (응답 접두사)           | 중간   |
| `ui/components/SettingsDialog.tsx:690`    | 설정 변경          | "...Gemini CLI must be restarted" | 중간   |
| `ui/components/FolderTrustDialog.tsx:118` | 폴더 신뢰          | "Gemini CLI is restarting..."     | 중간   |
| `ui/components/ModelDialog.tsx:79,97`     | 모델 선택          | "Let Gemini CLI decide..."        | 중간   |
| `ui/IdeIntegrationNudge.tsx:93`           | IDE 연동           | "...connect to Gemini CLI?"       | 낮음   |

### 2.3 알림/경고 메시지

| 파일                                 | 위치          | 표시 내용                        | 영향도 |
| ------------------------------------ | ------------- | -------------------------------- | ------ |
| `ui/utils/updateCheck.ts:78,94`      | 업데이트 알림 | "A new version of Gemini CLI..." | 중간   |
| `utils/userStartupWarnings.ts:45,60` | 경고 메시지   | "...running Gemini CLI in..."    | 낮음   |
| `ui/constants/tips.ts:69`            | 팁 메시지     | "Show Gemini CLI status..."      | 낮음   |

### 2.4 개인정보/법적 고지

| 파일                                             | 위치     | 표시 내용               | 영향도 |
| ------------------------------------------------ | -------- | ----------------------- | ------ |
| `ui/privacy/CloudFreePrivacyNotice.tsx:58,78,88` | 개인정보 | "Gemini Code Assist..." | 높음   |

### 2.5 명령어 설명 문자열

| 파일                                | 위치       | 표시 내용                            | 영향도 |
| ----------------------------------- | ---------- | ------------------------------------ | ------ |
| `config/config.ts:102`              | CLI 사용법 | "Usage: gemini [options]..."         | 높음   |
| `commands/extensions.tsx:24`        | 확장 명령  | "Manage Gemini CLI extensions"       | 낮음   |
| `commands/hooks.tsx:14`             | 훅 명령    | "Manage Gemini CLI hooks"            | 낮음   |
| `ui/commands/settingsCommand.ts:12` | 설정 명령  | "View and edit Gemini CLI settings"  | 낮음   |
| `ui/commands/toolsCommand.ts:16`    | 도구 명령  | "List available Gemini CLI tools"    | 낮음   |
| `ui/commands/docsCommand.ts:18`     | 문서 명령  | "Open full Gemini CLI documentation" | 낮음   |
| `ui/commands/skillsCommand.ts:285`  | 스킬 명령  | "...Gemini CLI agent skills..."      | 낮음   |

---

## 3. 변경 방침

### 3.1 치환 규칙

| 원본                     | 변경                 | 비고                        |
| ------------------------ | -------------------- | --------------------------- |
| `Gemini CLI`             | `Didim CLI`          | 제품명                      |
| `Gemini Code Assist`     | 검토 필요            | 서비스명 (Google 고유 명칭) |
| `gemini` (사용법 문자열) | `didim`              | 바이너리명                  |
| `Gemini:` (응답 접두사)  | `Didim:` 또는 모델명 | 세션 뷰어                   |

### 3.2 주의사항

- **법적 고지 문구** (`CloudFreePrivacyNotice.tsx`)는 단순 치환이 아닌 내용 검토
  필요
- **이용약관 URL** (`AuthDialog.tsx:248-252`)은 자체 약관 페이지로 교체 필요
- **IDE 연동** 문자열은 VS Code 확장과 동기화 확인 필요

---

## 4. 작업 계획

| 우선순위 | 범위                                                     | 파일 수 | 난이도 |
| -------- | -------------------------------------------------------- | ------- | ------ |
| 1 (즉시) | 높음 영향도: About, 윈도우 제목, 인증 다이얼로그, 사용법 | ~6개    | ★★☆☆☆  |
| 2 (단기) | 중간 영향도: 설정, 모델, 세션, 알림                      | ~7개    | ★★☆☆☆  |
| 3 (중기) | 낮음 영향도: 명령어 설명, 팁, 경고                       | ~8개    | ★☆☆☆☆  |
| 4 (검토) | 법적 고지: 개인정보, 이용약관                            | ~2개    | ★★★☆☆  |

---

## 5. 관련 문서

- [/auth login 멀티프로바이더 설계](./auth_login_멀티프로바이더_설계.md) — 인증
  다이얼로그 재설계 시 함께 변경
- [인증없이실행 분석](./인증없이실행_분석.md) — 원본 문서 (deprecated)
