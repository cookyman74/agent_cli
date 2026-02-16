# `.gemini` -> `.didim` 전환 작업 계획서

> **목표**: 프로젝트/사용자 설정 루트 디렉토리를 `.gemini`에서 `.didim`으로 전환
> **전환 원칙**: 무중단 호환(읽기: `.didim` 우선, `.gemini` fallback) + 단계적
> 마이그레이션 **작업 방식**: 사전분석 -> 구현 -> 검증 -> 문서화 -> 릴리스

---

## 📋 작업 개요

| 항목        | 내용                                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 프로젝트    | CLI 설정 루트 `.gemini`를 `.didim`으로 전환                                                                                                                      |
| 범위        | Core 경로 상수/Storage, CLI 설정 로딩, 커스텀 명령/스킬/에이전트/정책/확장/신뢰설정/샌드박스, `.geminiignore`, 샌드박스 프로필, 정책 TOML, Telemetry, a2a-server |
| 호환 전략   | 읽기: `.didim` -> `.gemini` 순서, 쓰기: `.didim` only                                                                                                            |
| 위험 수준   | 🔴 High (경로 변경 영향이 광범위 — 상수 1개 변경으로 해결되지 않는 하드코딩 17개소 이상)                                                                         |
| 목표 완료일 | 2026-02-xx (스프린트 내)                                                                                                                                         |

---

## 🎯 성공 기준 (Definition of Done)

- [ ] 신규 설치/실행 환경에서 `.didim`만으로 모든 기능 동작
- [ ] 기존 사용자(`.gemini`만 존재)도 중단 없이 실행 가능
- [ ] 설정 저장/수정은 `.didim`으로만 기록
- [ ] 핵심 기능 회귀 테스트 통과 (settings, commands, skills, hooks, sandbox,
      extensions)
- [ ] `AGENTS.md` 컨텍스트 파일 기본값 유지 확인 (Phase3 ETC에서 `GEMINI.md` →
      `AGENTS.md` 전환 완료)
- [ ] `.geminiignore` → `.didimignore` 전환 및 fallback 동작 확인
- [ ] 문서와 예시 경로가 `.didim` 기준으로 업데이트
- [ ] 마이그레이션 가이드 및 롤백 절차 문서화 완료

---

## 🚨 핵심 리스크 및 대응

| 리스크                                                                                                       | 영향      | 대응 방안                                                                                                                                                                                 | 상태 |
| ------------------------------------------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 상수 외 하드코딩 잔존 (샌드박스 .sb 6개, 정책 TOML regex, Telemetry sanitize 패턴, extension manifest 4개소) | 🔴 High   | `GEMINI_DIR` 변경만으로 누락되는 17개소 개별 수정                                                                                                                                         | ⬜   |
| 기존 사용자 설정 미인식                                                                                      | 🔴 High   | `.didim` 우선, `.gemini` fallback 로더 구현                                                                                                                                               | ⬜   |
| `.geminiignore` 미전환 시 파일 필터링 중단                                                                   | 🔴 High   | `.didimignore` 우선 + `.geminiignore` fallback, 파서 이름 갱신                                                                                                                            | ⬜   |
| `AGENTS.md` 컨텍스트 기본값 또는 fallback chain 훼손                                                         | 🟠 Medium | `.gemini` → `.didim` 전환 시 memoryTool 함수(`getCurrentGeminiMdFilename` 등)의 Gemini 접두사 함수명 변경 여부는 별도 결정. Extension fallback chain(`AGENTS.md` → `GEMINI.md`) 보존 확인 | ⬜   |
| OAuth 레거시 마이그레이션 경로 깨짐 (`oauth-credential-storage.ts:93,109`)                                   | 🔴 High   | `GEMINI_DIR` 변경 시 "old file" 마이그레이션 경로도 `.didim`으로 바뀌어 `~/.gemini/oauth_creds.json` 못 읽음. 마이그레이션 경로는 `'.gemini'` 리터럴 하드코딩 필요                        | ⬜   |
| `file-token-storage.ts`, `trustedFolders.ts` fallback 미적용                                                 | 🔴 High   | Storage 미사용 파일이 `GEMINI_DIR` 직접 조합 → 상수 변경 시 자동 반영되나 fallback resolver 미적용. Phase 1.2 resolver 도입 시 이 파일들도 fallback 적용 필요                             | ⬜   |
| a2a-server settings/config/env fallback 미구현                                                               | 🟠 Medium | a2a-server의 settings.ts, config.ts가 Storage 미사용 + `GEMINI_DIR` 직접 조합 → a2a 자체 fallback 필요                                                                                    | ⬜   |
| `system.md` 기본 경로 fallback 누락 (`prompts.ts:90`)                                                        | 🟠 Medium | 기존 `.gemini/system.md` 사용자 전환 후 시스템 프롬프트 미적용. `.didim/system.md` 우선 + `.gemini/system.md` fallback 필요                                                               | ⬜   |
| 글로벌 AGENTS.md fallback 누락 (`memoryDiscovery.ts:151,338,382`)                                            | 🟠 Medium | `GEMINI_DIR` 직접 조합 (Storage 미사용) → resolver 적용 범위 밖. `~/.gemini/AGENTS.md` 레거시 읽기 누락. dual-path 탐색 필요                                                              | ⬜   |
| 읽기 fallback vs 쓰기 `.didim` only 정책 충돌                                                                | 🔴 High   | `getGlobalGeminiDir()` fallback이 `.gemini` 반환 시 쓰기도 `.gemini`에 수행. **A안 채택**: `resolveReadDir`/`resolveWriteDir` 분리로 쓰기는 항상 `.didim` 강제 (Phase 1.2)                | ⬜   |
| `setupGithubCommand`가 `.gitignore`에 `.gemini/` 기록                                                        | 🟠 Medium | `.didim/` 기록으로 변경 + 기존 `.gemini/` 항목 유지 결정                                                                                                                                  | ⬜   |
| `gemini-extension.json` 파일명 불일치                                                                        | 🟠 Medium | `didim-extension.json`으로 변경 또는 유지 결정                                                                                                                                            | ⬜   |
| `a2a-server` 패키지 누락                                                                                     | 🟠 Medium | CLI/Core뿐 아니라 a2a-server 경로도 동시 전환                                                                                                                                             | ⬜   |
| 문서-코드 경로 불일치                                                                                        | 🟠 Medium | docs 일괄 변경 + FAQ/마이그레이션 안내 추가                                                                                                                                               | ⬜   |
| CI/테스트 fixture 경로 불일치                                                                                | 🟡 Low    | 테스트 fixture/스냅샷 동시 업데이트                                                                                                                                                       | ⬜   |

---

## ⚠️ 전환 제외 대상 (변경하지 않을 항목)

> 아래 항목은 `.gemini` 디렉토리가 아닌 별개 개념이므로 전환 대상에서
> **명시적으로 제외**한다.

- [ ] **`AGENTS.md`** (프로젝트 컨텍스트 파일): Phase3 ETC에서 `GEMINI.md` →
      `AGENTS.md` 전환 완료 (`DEFAULT_CONTEXT_FILENAME = 'AGENTS.md'`). 함수명은
      `getCurrentGeminiMdFilename()`, `setGeminiMdFilename()`,
      `getAllGeminiMdFilenames()` 등 **Gemini 접두사 유지** 상태 (메서드명
      변경은 `.gemini` → `.didim` 전환 시 Phase 1.3 tidy에서 일괄 결정).
      Extension fallback chain (`AGENTS.md` → `GEMINI.md` 순서 탐색) 보존 필요
- [ ] **`GEMINI_API_KEY`, `GOOGLE_API_KEY`** 등 API 키 환경변수: Provider
      인증용으로 디렉토리 전환과 무관
- [ ] **`@google/genai` SDK 참조**: 외부 패키지명이므로 변경 불가
- [ ] **GitHub Workflows** (`gemini-automated-issue-triage.yml` 등): `.gemini`
      직접 참조 없음 확인 완료

---

## 🧭 전환 정책

### 1) 경로 우선순위

- [ ] 우선순위: `.didim` 존재 시 사용
- [ ] `.didim` 미존재 + `.gemini` 존재 시 읽기 fallback
- [ ] 둘 다 존재 시 `.didim` 우선, 경고 로그(선택)

### 2) 읽기/쓰기 정책

- [ ] 읽기: `.didim`, `.gemini` 모두 지원(유예 기간)
- [ ] 쓰기: `.didim` only
- [ ] 설정 변경 명령(`/settings`, `/skills`, `/hooks`) 결과 저장 경로는 `.didim`
- [ ] ⚠️ **정책 충돌 주의**: `Storage.getGlobalGeminiDir()`이 fallback으로
      `.gemini` 경로를 반환하면, 이 경로를 사용하는 쓰기
      코드(`persistentState.ts`, `trustedHooks.ts`, `memoryTool.ts`,
      `mcpServerEnablement.ts` 등)도 `.gemini`에 쓰게 됨. **Phase 1.2
      A안(읽기/쓰기 resolver 분리)으로 해결** — `resolveWriteDir`는 항상
      `.didim` 강제

### 3) 파일명 전환 정책

- [ ] `.geminiignore` → `.didimignore` (읽기: 둘 다, 쓰기: `.didimignore`)
- [ ] `gemini-extension.json` → 유지 또는 `didim-extension.json` (결정 필요)
- [ ] `.gemini-extension-install.json` → 유지 또는
      `.didim-extension-install.json` (결정 필요 — `variables.ts:13`,
      `a2a extension.ts:23`)
- [ ] `AGENTS.md` → 유지 (이미 `GEMINI.md`에서 전환 완료. Extension fallback
      chain `['AGENTS.md', 'GEMINI.md']` 보존)

### 4) 릴리스 정책

- [ ] 1차 릴리스: fallback 포함
- [ ] 2차 릴리스: `.gemini` deprecation 경고 강화
- [ ] 3차 릴리스: fallback 제거 여부 결정

---

## 🔍 Phase 0: 영향도 분석 및 설계 확정

- [ ] `rg -n "\.gemini|GEMINI_DIR"` 기반 전체 참조 목록 고정
- [ ] 기능군별 영향도 분류
  - Core 경로/Storage (paths.ts, storage.ts — **SSOT**)
  - Settings 로더 (settings.ts)
  - Commands/Skills/Agents (registry.ts)
  - Hooks/Trusted Folders (hookRegistry.ts, trustedHooks.ts, trustedFolders.ts)
  - Sandbox 프로필 (**.sb 파일 6개** — 하드코딩) + **Docker 볼륨/bashrc/venv**
    (sandbox.ts, sandboxUtils.ts)
  - Extensions/MCP (variables.ts, mcpServerEnablement.ts, file-token-storage.ts,
    **`.gemini-extension-install.json`**)
  - **memoryDiscovery** (memoryDiscovery.ts:151,338,382 — `GEMINI_DIR` 직접
    조합, Storage 미사용)
  - **.env 범위 판별** (settings.ts:447 — `isProjectEnvFile` 로직이 fallback
    `.gemini` 경로와 충돌)
  - Policies/Telemetry (plan.toml regex, sanitize.ts 패턴)
  - History/ChatRecording/Logger
  - **a2a-server** (extension.ts, **settings.ts**, **config.ts** — Storage
    미사용, 직접 `GEMINI_DIR` 조합)
  - **OAuth 마이그레이션** (oauth-credential-storage.ts — "old file" 경로가
    `GEMINI_DIR` 의존)
  - **system.md** (prompts.ts — workspace `.gemini/system.md` 기본 경로)
  - **`.geminiignore`** 파서 및 18+ 참조 파일
- [ ] 하위 호환 스펙 문서화 (fallback 조건, 충돌 시 우선순위, 로그 정책)
- [ ] 작업 브랜치/커밋 전략 확정 (기능군별 분리 커밋)

### 0.1 코드 분석 결과 — 상수 변경으로 커버되지 않는 하드코딩 목록

> `GEMINI_DIR` 상수를 변경하면 자동 반영되는 경로와, **별도 수정이 필요한
> 하드코딩**을 구분해야 한다.

#### ✅ `GEMINI_DIR` 변경으로 자동 반영 (Storage 경유)

- `getGlobalGeminiDir()`, `getGeminiDir()` 및 모든 파생 메서드 (20+ 메서드)
- `getUserCommandsDir()`, `getUserSkillsDir()`, `getUserAgentsDir()`,
  `getUserPoliciesDir()`
- `getGlobalSettingsPath()`, `getWorkspaceSettingsPath()`
- `getMcpOAuthTokensPath()`, `getOAuthCredsPath()`, `getInstallationIdPath()`
- `getGlobalTempDir()`, `getProjectTempDir()`, `getHistoryDir()`
- `getExtensionsDir()` (단, `getExtensionsConfigPath()`는 내부에
  `'gemini-extension.json'` 하드코딩 — #16 참조)

#### 🔴 별도 수정 필요 — 하드코딩된 `.gemini` (17개소)

| #   | 파일                                                          | 라인 | 내용                                                      | 유형            |
| --- | ------------------------------------------------------------- | ---- | --------------------------------------------------------- | --------------- |
| 1   | `packages/cli/src/utils/sandbox-macos-permissive-closed.sb`   | —    | `(subpath (string-append (param "HOME_DIR") "/.gemini"))` | SANDBOX PROFILE |
| 2   | `packages/cli/src/utils/sandbox-macos-permissive-open.sb`     | —    | 동일                                                      | SANDBOX PROFILE |
| 3   | `packages/cli/src/utils/sandbox-macos-permissive-proxied.sb`  | —    | 동일                                                      | SANDBOX PROFILE |
| 4   | `packages/cli/src/utils/sandbox-macos-restrictive-closed.sb`  | —    | 동일                                                      | SANDBOX PROFILE |
| 5   | `packages/cli/src/utils/sandbox-macos-restrictive-open.sb`    | —    | 동일                                                      | SANDBOX PROFILE |
| 6   | `packages/cli/src/utils/sandbox-macos-restrictive-proxied.sb` | —    | 동일                                                      | SANDBOX PROFILE |
| 7   | `packages/core/src/policy/policies/plan.toml`                 | 73   | `argsPattern = "...\\.gemini/tmp/..."` regex              | POLICY REGEX    |
| 8   | `packages/core/src/telemetry/sanitize.ts`                     | 17   | `"/path/to/.gemini/hooks/"` 주석+패턴                     | TELEMETRY       |
| 9   | `packages/core/src/hooks/hookRegistry.ts`                     | 118  | `"(.gemini/settings.json)"` 사용자 메시지                 | DISPLAY MSG     |
| 10  | `packages/cli/src/ui/commands/setupGithubCommand.ts`          | 65   | `['.gemini/', 'gha-creds-*.json']` gitignore 엔트리       | WRITE           |
| 11  | `packages/cli/src/config/extensions/variables.ts`             | 12   | `'gemini-extension.json'` 상수                            | FILENAME        |
| 12  | `packages/a2a-server/src/config/extension.ts`                 | 22   | `'gemini-extension.json'` 상수                            | FILENAME        |
| 13  | `packages/core/src/utils/geminiIgnoreParser.ts`               | 전체 | `.geminiignore` 파서 클래스                               | PARSER          |
| 14  | `.gitignore`                                                  | 5-14 | `**/.gemini/`, `!/.gemini/` 등 선택적 포함 패턴           | VCS CONFIG      |
| 15  | `integration-tests/globalSetup.ts`                            | 34   | `GEMINI_CONFIG_DIR = join(runDir, '.gemini')`             | TEST SETUP      |
| 16  | `packages/core/src/config/storage.ts`                         | 171  | `getExtensionsConfigPath()` 내 `'gemini-extension.json'`  | FILENAME        |
| 17  | `packages/cli/src/commands/extensions/new.ts`                 | 66   | 신규 확장 생성 시 `'gemini-extension.json'` 하드코딩      | FILENAME        |

---

## 🏗️ Phase 1: Core 경로 상수/Storage 전환

### 1.1 경로 상수 변경

- [ ] `paths.ts`: `GEMINI_DIR = '.gemini'` → `DIDIM_DIR = '.didim'` 변경
- [ ] `GEMINI_DIR` export를 `@deprecated` alias로 유지 (하위 호환)
- [ ] 하드코딩 경로 조합이 없는지 재확인 (모두 Storage 경유 여부)

### 1.2 Storage API — fallback resolver 도입

- [ ] ✅ **A안 확정: 읽기/쓰기 resolver 분리** (정책 충돌 해결):
  - 현재 `Storage.getGlobalGeminiDir()`은 단일 경로를 반환하므로, 읽기
    fallback(`.gemini`)으로 해석된 경로에 쓰기도 수행됨 → "쓰기: `.didim` only"
    정책과 충돌
  - 호출처: `persistentState.ts:26`, `trustedHooks.ts:27`, `memoryTool.ts:102`
    등이 반환값을 읽기/쓰기 모두에 사용
  - **채택: A안 — 읽기용/쓰기용 resolver 분리**:
    - `resolveReadDir(base)` — `.didim` 우선, `.gemini` fallback 허용
    - `resolveWriteDir(base)` — 항상 `.didim` (없으면 생성)
    - 쓰기는 API 레벨에서 `.didim` 강제 → 모든 write call-site 누락 위험 최소
  - ~~B안 (쓰기 시 경로 치환)~~: 모든 write call-site에서 치환 누락 위험 높음 →
    기각
  - ~~C안 (첫 접근 시 자동 마이그레이션)~~: 마이그레이션 실패/부분 성공/동시
    접근 복잡도 높음 → 기각
  - 보완: Phase 4에서 별도 `didim migrate-config` 명령 제공 (A안과 조합)
- [ ] `getGlobalGeminiDir()` → 내부에 fallback resolver 적용 (메서드명 변경은
      Phase 후반)
- [ ] `getGeminiDir()` (workspace) → 동일 fallback 적용
- [ ] commands/skills/agents/extensions/policies/trusted 파일 경로 — resolver
      자동 반영 확인
- [ ] temp/history/checkpoints/logs 경로 — 쓰기 전용이므로 `.didim` 고정

### 1.3 메서드명 Tidy (선택적, 별도 커밋)

- [ ] `getGlobalGeminiDir()` → `getGlobalConfigDir()` (또는 유지 + deprecation)
- [ ] `getGeminiDir()` → `getProjectConfigDir()` (또는 유지)
- [ ] 호출자 일괄 업데이트

### 1.4 테스트

- [ ] `packages/core/src/config/storage.test.ts` 케이스 추가/수정
- [ ] `.didim only`, `.gemini only`, `둘 다 존재` 시나리오 검증
- [ ] 쓰기 경로가 항상 `.didim`인지 검증

---

## ⚙️ Phase 2: 설정/환경 로더 및 쓰기 경로 전환

### 2.1 settings 로딩

- [ ] user/workspace settings 로딩 순서에 fallback 적용
- [ ] 오류 메시지/검증 메시지 경로명 `.didim` 기준으로 정리
- [ ] `settings_validation_warning.test.ts` 경로 문자열 업데이트

### 2.2 .env 로딩

- [ ] `.didim/.env` 우선 로딩
- [ ] 기존 `.gemini/.env` fallback 지원
- [ ] trusted folder 정책과 충돌 없는지 점검
- [ ] `settings.ts:447` — ⚠️ **`.env` 파일 범위 판별 로직 충돌**:
      `isProjectEnvFile = !envFilePath.includes(GEMINI_DIR)` — `GEMINI_DIR`가
      `.didim`으로 변경되면, fallback으로 로드된 `.gemini/.env` 경로가
      `includes('.didim')`→false → project env로 오판별 → `excludedVars` 필터
      오동작. **대응**: `isProjectEnvFile` 판별을 `.didim` AND `.gemini` 양쪽
      모두 체크하도록 수정하거나, 경로 기반 대신 source 기반 판별로 전환

### 2.3 settings 저장

- [ ] settings set/save 계열은 `.didim`으로만 쓰기
- [ ] 기존 `.gemini` 파일 존재 시 첫 저장 시점 동작 정의(자동 이전/별도 안내)

### 2.4 `.geminiignore` → `.didimignore` 전환

- [ ] `GeminiIgnoreParser` → `DidimIgnoreParser` (또는 `IgnoreParser`) 이름 변경
- [ ] 파서가 `.didimignore` 우선, `.geminiignore` fallback으로 읽도록 수정
- [ ] 참조 파일 18개소 업데이트:
  - `filesearch/ignore.ts`, `ripGrep.ts`, `ls.ts`, `glob.ts`,
    `read-many-files.ts`
  - `fileDiscoveryService.ts`, `settingsSchema.ts` 등
- [ ] `docs/cli/gemini-ignore.md` → `docs/cli/didim-ignore.md` 문서 전환

### 2.5 테스트

- [ ] `packages/cli/src/config/settings.test.ts` 보강
- [ ] `fileDiscoveryService.test.ts` — `.didimignore` / `.geminiignore` 시나리오
      추가
- [ ] settings load/save/fallback 회귀 테스트 통과

---

## 🧩 Phase 3: 기능군별 경로 전환

### 3.1 커스텀 명령 / 스킬 / 에이전트

- [ ] `.didim/commands`, `.didim/skills`, `.didim/agents` 경로 지원
- [ ] 기존 `.gemini/*` fallback 지원
- [ ] 로딩 우선순위 및 충돌 처리 정책 검증
- [ ] `registry.ts`의 agent 로딩 경로 (Storage 경유 — 자동 반영 확인)

### 3.2 Hooks / Trusted

- [ ] project hooks 안내 문구 `.didim/settings.json` 기준 반영
- [ ] `hookRegistry.ts:118` — 사용자 메시지 `.gemini/settings.json` →
      `.didim/settings.json`
- [ ] `trustedFolders.ts:23` — `path.join(homedir(), GEMINI_DIR)` 직접 조합
      (Storage 미사용). `GEMINI_DIR` 상수 변경 시 경로 자동 반영되나, **fallback
      resolver 미적용** → Phase 1.2 resolver 도입 후 이 파일도 fallback 적용
      필요
- [ ] `trustedHooks.ts` — trusted hooks 디렉토리 (Storage 경유 — 자동 확인)
- [ ] `GEMINI_CLI_TRUSTED_FOLDERS_PATH` 환경변수 — 유지 또는
      `DIDIM_CLI_TRUSTED_FOLDERS_PATH` alias 추가
- [ ] untrusted workspace에서 project hooks 차단 로직 회귀 확인
- [ ] hook migration 명령 (`migrate.ts:243-245`) — `.gemini/settings.json` 문구
      업데이트

### 3.3 Sandbox 프로필 (하드코딩 — 별도 수정 필수)

- [ ] macOS Seatbelt 프로필 6개 `.gemini` → `.didim` 변경:
  - `sandbox-macos-permissive-closed.sb`
  - `sandbox-macos-permissive-open.sb`
  - `sandbox-macos-permissive-proxied.sb`
  - `sandbox-macos-restrictive-closed.sb`
  - `sandbox-macos-restrictive-open.sb`
  - `sandbox-macos-restrictive-proxied.sb`
- [ ] **⚠️ 잠재 버그**: fallback 필요 여부 — 기존 사용자의 `~/.gemini` 디렉토리
      접근 차단 위험
  - 대응: `.didim` + `.gemini` 양쪽 모두 `(subpath ...)` 허용하거나, fallback
    기간 중 양쪽 허용
- [ ] `sandbox.ts:63-66` — custom profile fallback 경로
      `.gemini/sandbox-macos-*.sb` → `.didim/` 확인
- [ ] `.didim/sandbox.Dockerfile` 지원
- [ ] `sandboxUtils.ts:125` — `GEMINI_DIR + '/sandbox.bashrc'` (프로젝트 레벨).
      `GEMINI_DIR` 상수 경유 자동 반영되나, 기존 `.gemini/sandbox.bashrc` 사용자
      fallback 필요 → `.didim/sandbox.bashrc` 우선, `.gemini/sandbox.bashrc`
      fallback
- [ ] `sandbox.ts:298` — Docker 볼륨 마운트:
      `path.join(userHomeDirOnHost, GEMINI_DIR)` → 컨테이너 내
      `/home/node/.didim` 마운트. 기존 `~/.gemini` 설정도 마운트해야 fallback
      보장 (또는 Phase 1.2 resolver에서 해결)
- [ ] `sandbox.ts:528` — `GEMINI_DIR + '/sandbox.venv'` (프로젝트 레벨
      가상환경). 기존 `.gemini/sandbox.venv` 사용자 fallback 필요

### 3.4 Extensions / a2a-server

- [ ] extensions 설치 루트 `.didim/extensions` 전환 (Storage 경유 — 자동)
- [ ] `gemini-extension.json` 파일명 결정:
  - 유지 시: 기존 확장 호환성 유지, 이름 불일치 감수
  - 변경 시: `didim-extension.json` + fallback 로직 추가
- [ ] `packages/cli/src/config/extensions/variables.ts:12` 상수 업데이트
- [ ] `packages/core/src/config/storage.ts:171` — `getExtensionsConfigPath()` 내
      `'gemini-extension.json'` 하드코딩 동시 업데이트
- [ ] `packages/cli/src/commands/extensions/new.ts:66` — 신규 확장 생성 시
      `'gemini-extension.json'` 하드코딩 동시 업데이트
- [ ] `packages/a2a-server/src/config/extension.ts:22` 상수 동시 업데이트
- [ ] `packages/cli/src/config/extensions/variables.ts:13` —
      `.gemini-extension-install.json` 설치 메타데이터 파일명 결정 (변경 시 기존
      설치 데이터 fallback 필요)
- [ ] `packages/a2a-server/src/config/extension.ts:23` —
      `.gemini-extension-install.json` 동시 업데이트
- [ ] a2a-server extension discovery 경로 확인
- [ ] `packages/cli/src/commands/extensions/validate.ts:65` — 에러 메시지
      `'The following context files referenced in gemini-extension.json are missing: ...'`
      → 파일명 변경 시 문구도 동시 업데이트
- [ ] Extension 템플릿 파일 6개 — 파일명 결정에 따라 동시 변경:
  - `packages/cli/src/commands/extensions/examples/context/gemini-extension.json`
  - `packages/cli/src/commands/extensions/examples/custom-commands/gemini-extension.json`
  - `packages/cli/src/commands/extensions/examples/exclude-tools/gemini-extension.json`
  - `packages/cli/src/commands/extensions/examples/hooks/gemini-extension.json`
  - `packages/cli/src/commands/extensions/examples/mcp-server/gemini-extension.json`
  - `packages/cli/src/commands/extensions/examples/skills/gemini-extension.json`
  - ⚠️ **조건부**: `gemini-extension.json` → `didim-extension.json` 파일명
    변경을 결정한 경우에만 리네임 필요. 유지 시 내용만 확인
- [ ] Extension 파일명 변경 시 문서/주석 동기화 (조건부 — 파일명 변경 결정 시):
  - `packages/cli/src/commands/extensions/examples/mcp-server/README.md:18` —
    `gemini-extension.json` 참조 설명문
  - `packages/cli/src/config/extension.ts:17` — JSDoc:
    `"Extension definition as written to disk in gemini-extension.json files."`
  - `packages/a2a-server/src/config/extension.ts:26` — 동일 JSDoc 주석
- [ ] `packages/a2a-server/src/config/settings.ts:20-21,83-87` — ⚠️ **Storage
      미사용**: `path.join(homedir(), GEMINI_DIR)`,
      `path.join(workspaceDir, GEMINI_DIR, 'settings.json')` 직접 조합.
      `GEMINI_DIR` 상수 변경 시 자동 반영되나, **a2a-server 자체적으로 fallback
      읽기 미구현** → a2a settings 로딩에 `.didim` 우선 + `.gemini` fallback
      적용 필요
- [ ] `packages/a2a-server/src/config/config.ts:190-203` — ⚠️ **Storage
      미사용**: `findEnvFile()` 내 `path.join(currentDir, GEMINI_DIR, '.env')`
      직접 조합. `GEMINI_DIR` 상수 변경 시 자동 반영되나, 기존 사용자의
      `.gemini/.env` fallback 보장을 위해 a2a `.env` 탐색에도 dual-path 적용
      필요
- [ ] `packages/a2a-server/src/config/config.ts:201` — 🐛 **기존 버그**: 홈
      fallback에서 `process.cwd()` 사용 (정상: `homedir()`). 주석은 "check .env
      under home as fallback"이지만 `process.cwd()`는 CWD이며 홈이 아님. CLI
      정상 구현 참조: `packages/cli/src/config/settings.ts:390` (`homedir()`
      사용). `.gemini` → `.didim` 전환 시 함께 수정

### 3.5 Policies / Telemetry

- [ ] `plan.toml:73` — regex 패턴 `\\.gemini/tmp/` → `\\.didim/tmp/` 변경
  - **⚠️ 잠재 버그**: fallback으로 `.gemini/tmp/`에 생성된 plan 파일도 접근
    허용해야 함
  - 대응: regex를 `\\.(didim|gemini)/tmp/` 으로 확장하거나, `.didim` 전용으로
    전환
- [ ] `sanitize.ts:17` — Telemetry 경로 패턴 `.gemini/hooks/` → `.didim/hooks/`
      (또는 양쪽)
- [ ] `sanitize.test.ts` — 테스트 데이터 `.gemini/hooks/` 경로 업데이트

### 3.6 Git / VCS 연동

- [ ] `setupGithubCommand.ts:65` — gitignore 엔트리 `.gemini/` → `.didim/`
- [ ] **⚠️ 잠재 버그**: 기존 사용자의 `.gitignore`에 `.gemini/`만 있고
      `.didim/`이 없을 경우, `.didim/` 디렉토리가 git에 노출
  - 대응: `['.didim/', '.gemini/', 'gha-creds-*.json']` 양쪽 모두 추가
- [ ] 루트 `.gitignore` 업데이트:
  ```
  **/.didim/
  !/.didim/
  .didim/*
  !.didim/config.yaml
  !.didim/commands/
  !.didim/skills/
  !.didim/settings.json
  ```

### 3.7 기타 (MCP, OAuth, PersistentState, Logger, system.md)

- [ ] `memoryDiscovery.ts:151,338,382` — ⚠️ **Storage 미사용, 글로벌 AGENTS.md
      fallback 누락**: `path.join(homedir(), GEMINI_DIR, filename)` 직접 조합
      (3곳). `GEMINI_DIR` 상수 변경 시 자동 반영되나, **Storage fallback
      resolver 적용 범위 밖** → 기존 `~/.gemini/AGENTS.md` 레거시 읽기를 위해
      memoryDiscovery 내에서도 dual-path 탐색 또는 resolver 호출 필요
- [ ] `mcpServerEnablement.ts:218,382` — ⚠️ **쓰기 경로 주의**:
      생성자(`:218`)에서 `configDir = Storage.getGlobalGeminiDir()`로 경로를
      캐시하고, `writeConfig()`(`:382-384`)에서 `fs.mkdir(this.configDir)` +
      `fs.writeFile(this.configFilePath)` 수행. A안(읽기/쓰기 resolver 분리)
      적용 시, 쓰기 경로가 `.didim`으로 강제되어야 하므로 `resolveWriteDir` 사용
      필요. 읽기(`readConfig`)는 fallback resolver 적용
- [ ] `file-token-storage.ts:21-22` — ⚠️ **Storage 미사용**:
      `path.join(homedir(), GEMINI_DIR)` 직접 조합. `GEMINI_DIR` 상수 변경 시
      경로 자동 반영되나, **fallback resolver 미적용** → Phase 1.2 resolver 도입
      후 이 파일도 fallback 적용 필요. 기존 `~/.gemini/mcp-oauth-tokens-v2.json`
      읽기 fallback 보장 필수
- [ ] `oauth-credential-storage.ts:93,109` — ⚠️ **레거시 마이그레이션 경로 깨짐
      위험**: `path.join(homedir(), GEMINI_DIR, OAUTH_FILE)`로 "old file" 경로를
      구성하는데, `GEMINI_DIR`가 `.didim`으로 바뀌면
      `~/.gemini/oauth_creds.json`을 찾지 못함. **대응**: 마이그레이션 경로는
      `'.gemini'` 리터럴로 하드코딩하여 실제 old path를 정확히 가리키도록 수정
- [ ] `persistentState.ts` — `Storage.getGlobalGeminiDir()` (자동 확인)
- [ ] `logger.ts` — `geminiDir` 변수명 변경 (선택적 tidy)
- [ ] `prompts.ts:90` — ⚠️ **system.md fallback 누락**:
      `path.resolve(path.join(GEMINI_DIR, 'system.md'))`로 workspace의
      `.gemini/system.md`를 기본 경로로 사용. `GEMINI_DIR` 변경 시 자동
      반영되나, 기존 `.gemini/system.md` 사용자를 위한 **fallback 읽기** 필요 →
      `.didim/system.md` 우선, `.gemini/system.md` fallback 로직 추가

### 3.8 사용자 메시지 / UX 문자열

> `.gemini` 또는 `.geminiignore`가 사용자에게 노출되는 안내/에러/팁 문자열. 기능
> 동작에는 영향 없으나 브랜딩 일관성을 위해 전환.

- [ ] `packages/cli/src/ui/commands/restoreCommand.ts:49` —
      `'Could not determine the .gemini directory path.'` → `.didim`으로 변경
- [ ] `packages/cli/src/services/prompt-processors/atFileProcessor.ts:60` —
      `'.gitignore or .geminiignore'` → fallback 정책과 일관성 유지 필요. 단순
      `.didimignore`로 치환하면 레거시 사용자에게 부정확 → **권장**:
      `'.gitignore or .didimignore (legacy: .geminiignore)'` 형태로 병기하거나,
      fallback 제거 시점에 단일 표기로 전환
- [ ] `packages/cli/src/ui/constants/tips.ts:39` —
      `'.geminiignore files in context'` → `.didimignore`로 변경 (팁 문구는
      간결성 우선, 필요 시 `.didimignore/.geminiignore` 병기)
- [ ] `packages/core/src/agents/cli-help-agent.ts:89` — `'.gemini/agents/'`,
      `'~/.gemini/agents/'` → `.didim/agents/`, `~/.didim/agents/`로 변경
- [ ] 기타: `rg` 스캔으로 `\.gemini[^_]` 패턴의 사용자 노출 문자열 추가 식별
      필요

### 3.9 테스트

- [ ] 관련 단위/통합 테스트 fixture 경로 업데이트 (20+ 테스트 파일)
- [ ] snapshots 경로 문자열 업데이트 (Notifications, AppHeader 등)
- [ ] `integration-tests/globalSetup.ts:34` — `GEMINI_CONFIG_DIR` → `.didim`
      경로
- [ ] 정책 테스트 (`policy/config.test.ts`) — `.gemini/policies` 경로 문자열
- [ ] `hookEventHandler.test.ts`, `hookRegistry.test.ts` — mock 경로
- [ ] `chatRecordingService.test.ts` — mock 경로
- [ ] `telemetry/sanitize.test.ts` — 테스트 데이터 경로

---

## 🛠️ Phase 4: 마이그레이션 도구/가이드

### 4.1 마이그레이션 동작 정의

- [ ] 옵션 A: 자동 마이그레이션 (첫 실행 시 복사/이동)
- [ ] 옵션 B: 수동 마이그레이션 명령 (`didim migrate-config`)
- [ ] 충돌 정책: 대상 파일 이미 존재 시 merge/skip/backup 규칙 확정

### 4.2 최소 요구 기능

- [ ] `~/.gemini` → `~/.didim` 파일 복사(보존 모드)
- [ ] `<project>/.gemini` → `<project>/.didim` 파일 복사
- [ ] `.geminiignore` → `.didimignore` 복사 (프로젝트 루트)
- [ ] 대상 권한/소유권 유지
- [ ] dry-run 지원
- [ ] 실행 결과 리포트 출력 (성공/스킵/충돌)

### 4.3 안전장치

- [ ] 백업 파일(`.didim_migration_backup_*`) 생성 옵션
- [ ] 실패 시 롤백 지침 제공

---

## 🧪 Phase 5: 검증 및 릴리스 준비

### 5.1 기능 검증

- [ ] 신규 사용자 시나리오 (`.didim`만 존재)
- [ ] 기존 사용자 시나리오 (`.gemini`만 존재)
- [ ] 혼합 시나리오 (둘 다 존재)
- [ ] `.didimignore` only / `.geminiignore` only / 둘 다 존재 시나리오
- [ ] macOS sandbox에서 `.didim` 디렉토리 접근 가능 확인
- [ ] 기존 `~/.gemini/oauth_creds.json` → keychain 마이그레이션 동작 확인 (OAuth
      레거시 경로)
- [ ] 기존 `.gemini/system.md` → 새 환경에서 fallback 읽기 확인
- [ ] a2a-server: 기존 `.gemini/settings.json`, `.gemini/.env` fallback 동작
      확인
- [ ] 레거시 `~/.gemini/AGENTS.md` 글로벌 메모리 fallback 읽기 확인
- [ ] `.gemini/.env` fallback 경로에서 `isProjectEnvFile` 판별 정확성 확인
- [ ] Docker sandbox: 기존 `.gemini/sandbox.bashrc`, `.gemini/sandbox.venv`
      fallback 확인
- [ ] 쓰기 정책: `.gemini` fallback 환경에서도 새 파일이 `.didim`에 기록되는지
      확인

### 5.2 품질 게이트

- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] 필요 시 `npm run preflight`
- [ ] `.sb` 프로필 macOS sandbox-exec 실행 검증

### 5.3 릴리스 체크

- [ ] 변경 로그/마이그레이션 안내 작성
- [ ] deprecation 경고 문구 검토
- [ ] 운영 중 이슈 대응 체크리스트 준비

---

## 📚 문서 업데이트 목록

- [ ] `README.md` 경로 예시 (`~/.didim`, `<project>/.didim`)
- [ ] `docs/get-started/configuration.md`
- [ ] `docs/get-started/authentication.md` (`.didim/.env` 예시)
- [ ] `docs/cli/custom-commands.md`
- [ ] `docs/cli/skills.md`
- [ ] `docs/cli/trusted-folders.md`
- [ ] `docs/cli/gemini-ignore.md` → `docs/cli/didim-ignore.md` (또는 내용
      업데이트)
- [ ] `docs/cli/gemini-md.md` (AGENTS.md 전환 완료 사실 반영, memoryTool 함수명
      Gemini 접두사 잔존 안내)
- [ ] `docs/cli/settings.md` (`~/.didim/settings.json`)
- [ ] `docs/cli/sandbox.md` (`.didim/sandbox-*`)
- [ ] `docs/cli/system-prompt.md` (`.didim/.env` 참조)
- [ ] `docs/hooks/*` (hook 경로 예시)
- [ ] `docs/extensions/reference.md` (확장 설치 경로)
- [ ] `docs/tools/mcp-server.md` (MCP OAuth 토큰 경로)
- [ ] `docs/cli/telemetry.md`
- [ ] `docs/cli/enterprise.md`
- [ ] `docs/faq.md`, `docs/troubleshooting.md`
- [ ] `docs/core/long-term-memory-proposal.md`, `long-term-memory-design.md`
- [ ] `CONTRIBUTING.md`
- [ ] `schemas/settings.schema.json` (경로 설명)

---

## 🔁 롤백 계획

- [ ] 긴급 시 읽기/쓰기 경로를 `.gemini`로 되돌리는 핫픽스 준비
  - `GEMINI_DIR` 상수 복원 + 샌드박스 프로필 복원 + 정책 TOML regex 복원
- [ ] 마이그레이션 수행 사용자 대상 복구 절차 문서화
- [ ] fallback 유지 기간 동안은 데이터 손실 없는 되돌리기 보장
- [ ] `.didimignore` 생성된 사용자도 `.geminiignore`로 롤백 가능

---

## 📊 영향도 요약 (코드 분석 기반)

| 카테고리                             | 파일 수    | 주요 변경                                                                                                       | 난이도       |
| ------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------------- | ------------ |
| Core 상수/Storage                    | 2          | `GEMINI_DIR` 값 변경 + **읽기/쓰기 분리 fallback resolver**                                                     | 🔴 High      |
| Storage 자동 반영                    | 20+ 메서드 | 변경 불필요 (상수 경유)                                                                                         | —            |
| 샌드박스 프로필 + Docker             | 6+3        | .sb 하드코딩 + Docker 볼륨/bashrc/venv fallback                                                                 | 🟠 Medium    |
| 정책 TOML regex                      | 1          | regex 패턴 변경                                                                                                 | 🟢 Low       |
| Telemetry sanitize                   | 2          | 패턴 + 테스트 데이터                                                                                            | 🟢 Low       |
| `.geminiignore` 파서                 | 1+18 참조  | 클래스명/파일명 + fallback 로직                                                                                 | 🟠 Medium    |
| Extension 파일명                     | 4+2        | `gemini-extension.json` + `.gemini-extension-install.json` 결정                                                 | 🟡 결정 필요 |
| Extension 템플릿 + 문서/주석         | 6+1+3      | `examples/*/gemini-extension.json` 리네임 + `validate.ts` 에러 문구 + README/JSDoc 3곳 (파일명 변경 시)         | 🟡 조건부    |
| MCP enablement 쓰기 경로             | 1          | `mcpServerEnablement.ts` — Storage 경유이나 writeFile 수행, A안 `resolveWriteDir` 적용 대상                     | 🟠 Medium    |
| OAuth 마이그레이션                   | 1          | `oauth-credential-storage.ts` — "old file" 경로 `.gemini` 하드코딩 필요                                         | 🔴 High      |
| Storage 미사용 직접 조합             | 2          | `file-token-storage.ts`, `trustedFolders.ts` — fallback resolver 적용                                           | 🟠 Medium    |
| a2a-server settings/config           | 2          | `settings.ts`, `config.ts` — Storage 미사용, fallback 미구현                                                    | 🟠 Medium    |
| system.md fallback                   | 1          | `prompts.ts` — `.didim/system.md` 우선 + `.gemini/system.md` fallback                                           | 🟠 Medium    |
| memoryDiscovery GEMINI_DIR 직접 조합 | 1 (3곳)    | `memoryDiscovery.ts` — Storage 미사용, `~/.gemini/AGENTS.md` fallback 누락                                      | 🟠 Medium    |
| .env 범위 판별                       | 1          | `settings.ts:447` — `isProjectEnvFile` 판별이 fallback `.gemini` 경로와 충돌                                    | 🟠 Medium    |
| a2a .env 홈 fallback 버그            | 1          | `config.ts:201` — `process.cwd()` 대신 `homedir()` 사용해야 함 (기존 버그)                                      | 🟢 Low       |
| Git 연동                             | 2          | `.gitignore` + setupGithubCommand                                                                               | 🟢 Low       |
| 사용자 메시지 / UX 문자열            | 4+         | `restoreCommand.ts`, `atFileProcessor.ts`, `tips.ts`, `cli-help-agent.ts` — `.gemini`/`.geminiignore` 노출 문구 | 🟢 Low       |
| 테스트 파일                          | 20+        | mock 경로/assertion 업데이트                                                                                    | 🟠 Medium    |
| 문서                                 | 20+        | 경로 예시/가이드 업데이트                                                                                       | 🟢 Low       |

---

## 🗂️ 작업 로그

| 날짜       | 작업자 | 내용                                   | 비고                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------- | ------ | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-02-15 | Codex  | 초기 작업 계획서 작성                  | v1.0                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 2026-02-15 | Claude | 코드 기반 영향도 분석 및 계획서 보강   | v2.0 — 하드코딩 15개소 식별, `.geminiignore` 전환 추가, 샌드박스 fallback 리스크, 전환 제외 대상 명시, Phase 3 세분화                                                                                                                                                                                                                                                                                                       |
| 2026-02-16 | Claude | GEMINI.md → AGENTS.md 전환 반영 검토   | v2.1 — Phase3 ETC 작업결과서 기반 검증. `GEMINI.md` 참조 5곳 → `AGENTS.md` 기준으로 정정. 함수명 Gemini 접두사 잔존 상태 기록, Extension fallback chain 보존 요건 명시                                                                                                                                                                                                                                                      |
| 2026-02-16 | Claude | 리뷰 이슈 5건 검증 및 계획서 반영      | v2.2 — (1) 하드코딩 15→17개: storage.ts:171 + new.ts:66 추가. (2) file-token-storage.ts, trustedFolders.ts "Storage 경유" 오류 정정→직접 조합+fallback 미적용. (3) OAuth 마이그레이션 경로 `.gemini` 하드코딩 필요 경고 추가. (4) a2a-server settings.ts/config.ts 범위 추가. (5) prompts.ts system.md fallback 누락 보완                                                                                                   |
| 2026-02-16 | Claude | 추가 리뷰 이슈 6건 검증 및 계획서 반영 | v2.3 — (1) 읽기 fallback vs 쓰기 .didim only 정책 충돌: resolver 읽기/쓰기 분리 설계 3안 추가, Core 난이도 🟢→🔴. (2) memoryDiscovery.ts 3곳 GEMINI_DIR 직접 조합→글로벌 AGENTS.md fallback 항목 추가. (3) settings.ts:447 isProjectEnvFile 판별 충돌 경고. (4) a2a config.ts:201 process.cwd()→homedir() 기존 버그 기록. (5) sandbox Docker 볼륨/bashrc/venv 3항목 추가. (6) .gemini-extension-install.json 전환 결정 추가 |
| 2026-02-16 | Claude | 아키텍처 A안 확정 + 추가 이슈 2건 반영 | v2.4 — (1) Phase 1.2 읽기/쓰기 resolver 분리 A안 확정 (B/C안 기각 기록). (2) Extension 템플릿 파일 6개(`examples/*/gemini-extension.json`) + `validate.ts:65` 에러 문구 → Phase 3.4에 조건부 항목 추가. (3) UX 문자열 4곳(`restoreCommand.ts:49`, `atFileProcessor.ts:60`, `tips.ts:39`, `cli-help-agent.ts:89`) → Phase 3.8 신규 섹션 추가. (4) 영향도 요약 테이블: Extension 템플릿 행 추가, 사용자 메시지 행 구체화      |
| 2026-02-16 | Claude | 재검증 이슈 3건 반영                   | v2.5 — (1) `mcpServerEnablement.ts:218,382` 쓰기 경로 — "자동 확인"→A안 `resolveWriteDir` 적용 대상으로 격상, 영향도 테이블 행 추가. (2) Extension 파일명 변경 시 문서/주석 동기화 3곳 추가 (README.md:18, extension.ts:17 JSDoc, a2a extension.ts:26 JSDoc). (3) `atFileProcessor.ts:60` — `.didimignore` 단독 표기→fallback 정책과 일관성 유지를 위해 병기 권장 기록                                                      |
