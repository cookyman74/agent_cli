# Phase 1: `.gemini` → `.didim` Core 경로/Storage 전환 최종 결과서

> **작업일**: 2026-02-16 **브랜치**: `v0.1.2/white_labelling` **작업 범위**:
> Phase 1 초기 + 리뷰 1/2/3/4차 반영 통합 **참조 TODOLIST**:
> `docs/00_project/white_labeling/todolist/gemini_to_didim_20260215_todolist.md`

---

## 1. 문서 목적

`.gemini` → `.didim` 디렉토리 전환 Phase 1의 전체 작업 과정과 결과를 단일 문서로
통합한다.

핵심 원칙:

- **읽기**: `.didim` 우선, `.gemini` fallback
- **쓰기**: 항상 `.didim`

---

## 2. 커밋 타임라인

| 순서 | 커밋        | 성격                | 요약                                                                      |
| ---- | ----------- | ------------------- | ------------------------------------------------------------------------- |
| 1    | `5f5b5f0d4` | Phase 1 초기        | `paths.ts` 상수 전환 + Storage read/write resolver 도입                   |
| 2    | `734680c9c` | 리뷰 1차 반영       | file-level `resolveReadPath` 기반으로 Storage read 메서드 보강            |
| 3    | `c4ffd2e21` | 리뷰 2차 STRUCTURAL | `getGlobalWritePath()`, `getWritePath()` 헬퍼 추가                        |
| 4    | `00d641fd1` | 리뷰 2차 BEHAVIORAL | settings/consumer write 경로 분리, trustedFolders fallback 보강           |
| 5    | `9c051a02c` | 리뷰 3차 BEHAVIORAL | sandbox/skills/extensions/token v2/memory/prompts/notifications 추가 보완 |
| 6    | `0217dc192` | 기존 테스트 수정    | locale, 상수 변경으로 인한 pre-existing 테스트 실패 7건 수정              |
| 7    | `f9333d250` | 리뷰 4차 BEHAVIORAL | 정책/샌드박스/확장 경로 .didim 전환 5건                                   |

---

## 3. 설계 결정 요약

### 3.1 경로 상수

`packages/core/src/utils/paths.ts`

- `DIDIM_DIR = '.didim'`
- `LEGACY_GEMINI_DIR = '.gemini'`
- `GEMINI_DIR = DIDIM_DIR` (`@deprecated` alias)

### 3.2 resolver 계층

`packages/core/src/config/storage.ts`

- 디렉토리 단위: `resolveReadDir()`, `resolveWriteDir()`
- 파일 단위: `resolveReadPath(base, ...subPaths)`
- 쓰기 전용: `getGlobalWriteDir()`, `getWriteDir()`, `getGlobalWritePath()`,
  `getWritePath()`
- 설정 쓰기 전용: `getGlobalWriteSettingsPath()`, `getWriteSettingsPath()`

---

## 4. 리뷰 지적 및 조치 매트릭스 (전체)

### 4.1 리뷰 1차

| Finding                         | 심각도 | 조치 결과                                                         |
| ------------------------------- | ------ | ----------------------------------------------------------------- |
| 디렉토리 fallback로 파일 가려짐 | HIGH   | `resolveReadPath` 도입 + Storage read 메서드 file-level 전환      |
| 설정 저장이 read-path 기반      | HIGH   | write 전용 settings path 메서드 추가 (2차에서 consumer 반영 완료) |
| OAuth migration 경로 식별 혼선  | MEDIUM | `LEGACY_GEMINI_DIR` 명시 사용으로 의도 분리                       |
| Storage 밖 경로 fallback 누락   | HIGH   | `findEnvFile`/`isProjectEnvFile` 등 dual-path 검사 반영           |

### 4.2 리뷰 2차

| Finding                              | 심각도 | 조치 결과                                                           |
| ------------------------------------ | ------ | ------------------------------------------------------------------- |
| settings save가 legacy에 기록 가능   | HIGH   | `settings.ts` 저장 경로를 write-path로 전환                         |
| `getGlobalGeminiDir()` 우회 consumer | HIGH   | memory/persistentState/mcpEnablement/trustedHooks read/write 분리   |
| read-path를 write에 재사용           | MEDIUM | oauth-token/installation/userAccount/oauth2 write-path 분리         |
| trustedFolders fallback 미적용       | MEDIUM | `getTrustedFoldersReadPath()` + `getTrustedFoldersWritePath()` 분리 |

### 4.3 리뷰 3차

| Finding                                   | 심각도 | 조치 결과                                                         |
| ----------------------------------------- | ------ | ----------------------------------------------------------------- |
| sandbox 경로 fallback 미적용              | HIGH   | sandbox read 경로에 `resolveReadPath` 적용, mount 분기 보강       |
| skills/extensions install write 경로 문제 | HIGH   | install/write를 `getWritePath`/`getGlobalWritePath` 기반으로 전환 |
| encrypted token v2 fallback 없음          | MEDIUM | token read/write 경로 분리                                        |
| global memory/system prompt fallback 없음 | MEDIUM | `memoryDiscovery.ts`, `prompts.ts` read fallback 반영             |
| UI notifications settings 경로 불일치     | LOW    | `Storage.getGlobalSettingsPath()` 사용으로 통일                   |

### 4.4 리뷰 4차

| Finding                                                  | 심각도 | 조치 결과                                                                                       |
| -------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| Plan Mode write_file 정책이 `.gemini` 경로만 허용        | HIGH   | `plan.toml` argsPattern에 `.(?:didim\|gemini)` 양방향 허용                                      |
| macOS Seatbelt 프로파일이 `~/.gemini`만 쓰기 허용        | HIGH   | 6개 `.sb` 파일에 `~/.didim` 쓰기 허용 추가                                                      |
| Extension enablement 설정 읽기에서 legacy 파일 가려짐    | HIGH   | `ExtensionStorage.getUserExtensionsEnablementReadPath()` + `resolveReadPath` 파일 수준 fallback |
| Legacy extension이 `.didim/extensions` 생성 후 로드 누락 | MEDIUM | primary + legacy 양방향 디렉토리 스캔                                                           |
| `/setup-github`가 `.didim/`을 `.gitignore`에 미추가      | MEDIUM | `.didim/` + `.gemini/` 모두 추가                                                                |

### 4.5 기존 테스트 실패 수정

| 파일                   | 실패 수 | 원인                                         | 수정                       |
| ---------------------- | ------- | -------------------------------------------- | -------------------------- |
| `mcp.test.ts`          | 1       | help text description 불일치                 | yargs `.locale('en')` 적용 |
| `install.test.ts`      | 1       | 한국어 locale 에러 메시지                    | yargs `.locale('en')` 적용 |
| `validate.test.ts`     | 1       | 한국어 locale 에러 메시지                    | yargs `.locale('en')` 적용 |
| `modelCommand.test.ts` | 1       | description 문자열 불일치                    | yargs `.locale('en')` 적용 |
| `initCommand.test.ts`  | 2       | `GEMINI.MD` → `AGENTS.MD` 상수 변경          | 테스트 assertion 갱신      |
| `skillUtils.test.ts`   | 1       | `.gemini/skills` → `.didim/skills` 경로 변경 | 테스트 경로 갱신           |

---

## 5. 주요 변경 내용 상세

### 5.1 Storage write-path 헬퍼 (리뷰 2차 STRUCTURAL)

```typescript
// 글로벌 쓰기 경로 (항상 .didim)
static getGlobalWritePath(...subPaths: string[]): string {
  return path.join(Storage.getGlobalWriteDir(), ...subPaths);
}

// 워크스페이스 쓰기 경로 (항상 .didim)
getWritePath(...subPaths: string[]): string {
  return path.join(this.getWriteDir(), ...subPaths);
}
```

### 5.2 Read/Write 분리 패턴 (리뷰 2차 BEHAVIORAL)

**settings.ts** — save path 전환:

```typescript
// Before: read-path 기반 (legacy 있으면 legacy에 쓰기)
{ path: USER_SETTINGS_PATH, ... }

// After: write-path 기반 (항상 .didim에 쓰기)
{ path: Storage.getGlobalWriteSettingsPath(), ... }
```

**공통 패턴** — 4파일 (memoryTool/persistentState/mcpEnablement/trustedHooks):

```typescript
// Before: 단일 path 필드
const configPath = path.join(Storage.getGlobalGeminiDir(), FILENAME);

// After: read/write 분리
const readPath = resolveReadPath(homedir(), FILENAME); // .didim > .gemini fallback
const writePath = Storage.getGlobalWritePath(FILENAME); // 항상 .didim
```

### 5.3 trustedFolders (리뷰 2차)

```typescript
// Before: .didim 고정
export function getTrustedFoldersPath(): string { ... }

// After: read fallback + write 분리
export function getTrustedFoldersReadPath(): string {
  return resolveReadPath(homedir(), TRUSTED_FOLDERS_FILENAME);
}
export function getTrustedFoldersWritePath(): string {
  return Storage.getGlobalWritePath(TRUSTED_FOLDERS_FILENAME);
}
/** @deprecated */
export function getTrustedFoldersPath(): string {
  return getTrustedFoldersReadPath();
}
```

### 5.4 Sandbox Docker 마운트 (리뷰 3차)

`getGlobalGeminiDir()` (resolveReadDir: `.didim` > `.gemini`) → 존재하지 않으면
`getGlobalWriteDir()` (`.didim`) + mkdir.

### 5.5 Extension enablement 파일 수준 fallback (리뷰 4차)

```typescript
// storage.ts — mockable static method 추가
static getUserExtensionsEnablementReadPath(): string {
  return resolveReadPath(homedir(), 'extensions', 'extension-enablement.json');
}

// extensionEnablement.ts — 파일 수준 fallback 사용
this.configReadPath = ExtensionStorage.getUserExtensionsEnablementReadPath();
```

### 5.6 Extension manager 양방향 디렉토리 로드 (리뷰 4차)

```typescript
const primaryDir = ExtensionStorage.getUserExtensionsDir();
const legacyDir = path.join(homedir(), LEGACY_GEMINI_DIR, 'extensions');

// Primary 스캔
if (fs.existsSync(primaryDir)) {
  /* scan */
}

// Legacy 스캔 (primary와 다른 경로인 경우만, 기존 dedup 로직 활용)
if (legacyDir !== primaryDir && fs.existsSync(legacyDir)) {
  /* scan */
}
```

### 5.7 Plan 정책 + Seatbelt (리뷰 4차)

**plan.toml**: argsPattern regex에 `.didim|.gemini` 양방향 허용

```toml
argsPattern = "\"file_path\":\"[^\"]+/\\.(?:didim|gemini)/tmp/[a-f0-9]{64}/plans/[a-zA-Z0-9_-]+\\.md\""
```

**Seatbelt .sb 6개**: `~/.didim` 쓰기 허용 추가

```lisp
(subpath (string-append (param "HOME_DIR") "/.didim"))
(subpath (string-append (param "HOME_DIR") "/.gemini"))
```

---

## 6. 변경 파일 목록

### 6.1 Core

| 파일                                                        | 리뷰 차수 | 변경 유형                  |
| ----------------------------------------------------------- | --------- | -------------------------- |
| `packages/core/src/utils/paths.ts`                          | 초기      | 상수 전환                  |
| `packages/core/src/config/storage.ts`                       | 초기+2차  | resolver + write-path 헬퍼 |
| `packages/core/src/tools/memoryTool.ts`                     | 2차       | read/write 분리            |
| `packages/core/src/hooks/trustedHooks.ts`                   | 2차       | read/write 분리            |
| `packages/core/src/mcp/oauth-token-storage.ts`              | 2차       | write-path 전환            |
| `packages/core/src/utils/installationManager.ts`            | 2차       | write-path 전환            |
| `packages/core/src/utils/userAccountManager.ts`             | 2차       | write-path 전환            |
| `packages/core/src/code_assist/oauth2.ts`                   | 2차       | write-path 전환            |
| `packages/core/src/mcp/token-storage/file-token-storage.ts` | 3차       | read/write 분리            |
| `packages/core/src/utils/memoryDiscovery.ts`                | 3차       | resolveReadPath 적용       |
| `packages/core/src/core/prompts.ts`                         | 3차       | resolveReadPath 적용       |
| `packages/core/src/policy/policies/plan.toml`               | 4차       | argsPattern 양방향 허용    |

### 6.2 CLI

| 파일                                                        | 리뷰 차수 | 변경 유형                            |
| ----------------------------------------------------------- | --------- | ------------------------------------ |
| `packages/cli/src/config/settings.ts`                       | 2차       | save path 전환                       |
| `packages/cli/src/utils/persistentState.ts`                 | 2차       | read/write 분리                      |
| `packages/cli/src/config/mcp/mcpServerEnablement.ts`        | 2차       | read/write 분리                      |
| `packages/cli/src/config/trustedFolders.ts`                 | 2차       | read fallback + write 분리           |
| `packages/cli/src/utils/sandbox.ts`                         | 3차       | resolveReadPath 적용                 |
| `packages/cli/src/utils/skillUtils.ts`                      | 3차       | write-path 전환                      |
| `packages/cli/src/config/extension-manager.ts`              | 3차+4차   | write-path 전환 + 양방향 로드        |
| `packages/cli/src/config/extensions/storage.ts`             | 3차+4차   | write dir + enablement read path     |
| `packages/cli/src/config/extensions/extensionEnablement.ts` | 3차+4차   | read/write 분리 + 파일 수준 fallback |
| `packages/cli/src/ui/components/Notifications.tsx`          | 3차       | Storage.getGlobalSettingsPath()      |
| `packages/cli/src/ui/commands/setupGithubCommand.ts`        | 4차       | .gitignore에 .didim/ 추가            |
| 6x `packages/cli/src/utils/sandbox-macos-*.sb`              | 4차       | ~/.didim 쓰기 허용                   |

### 6.3 테스트

| 파일                                                             | 리뷰 차수   | 변경 유형               |
| ---------------------------------------------------------------- | ----------- | ----------------------- |
| `packages/core/src/config/storage.test.ts`                       | 초기+2차    | write-path 테스트 추가  |
| `packages/core/src/hooks/trustedHooks.test.ts`                   | 2차         | mock 갱신               |
| `packages/core/src/mcp/oauth-token-storage.test.ts`              | 2차         | mock 갱신               |
| `packages/cli/src/utils/persistentState.test.ts`                 | 2차         | mock 전면 재작성        |
| `packages/cli/src/config/mcp/mcpServerEnablement.test.ts`        | 2차         | mock 갱신               |
| `packages/cli/src/config/trustedFolders.test.ts`                 | 2차         | mock 갱신               |
| `packages/cli/src/config/extension.test.ts`                      | 2차         | Proxy 패턴 mock 적용    |
| `packages/core/src/mcp/token-storage/file-token-storage.test.ts` | 3차         | mock 추가               |
| `packages/cli/src/utils/sandbox.test.ts`                         | 3차         | mock 추가               |
| `packages/cli/src/config/extensions/extensionEnablement.test.ts` | 3차+4차     | mock 갱신               |
| `packages/cli/src/ui/components/Notifications.test.tsx`          | 3차         | mock 추가               |
| `packages/cli/src/ui/commands/setupGithubCommand.test.ts`        | 4차         | .didim/ assertion 추가  |
| `packages/cli/src/ui/commands/initCommand.test.ts`               | 테스트 수정 | AGENTS.MD 갱신          |
| `packages/cli/src/utils/skillUtils.test.ts`                      | 테스트 수정 | .didim/skills 경로 갱신 |
| `packages/cli/src/ui/commands/modelCommand.test.ts`              | 테스트 수정 | locale('en') 적용       |
| `packages/cli/src/config/extensions/install.test.ts`             | 테스트 수정 | locale('en') 적용       |
| `packages/cli/src/config/extensions/validate.test.ts`            | 테스트 수정 | locale('en') 적용       |
| `packages/cli/src/ui/commands/mcp.test.ts`                       | 테스트 수정 | locale('en') 적용       |

---

## 7. 마이그레이션 동작 검증 시나리오

**시나리오**: `.gemini/settings.json` 존재, `.didim/` 디렉토리는 존재하나
`settings.json` 없음

1. `loadSettings()` → `resolveReadPath` → `.gemini/settings.json` 읽기 ✅
2. `setValue()` → `saveSettings()` → `.didim/settings.json`에 저장 ✅
3. 다음 세션 `loadSettings()` → `resolveReadPath` → `.didim/settings.json` 읽기
   ✅
4. `.gemini/settings.json`은 stale하지만 무해 ✅

---

## 8. 최종 검증 요약

리뷰 4차 반영 + 기존 테스트 수정 후 최종 결과:

| 검증 항목              | 결과                                     |
| ---------------------- | ---------------------------------------- |
| Core tests (281 files) | ✅ 5380 passed, 0 failures               |
| CLI tests (351 files)  | ✅ 4758 passed, 0 failures               |
| TypeScript (typecheck) | ✅ 0 errors                              |
| ESLint (core)          | ✅ 0 errors                              |
| ESLint (cli)           | ✅ 0 errors                              |
| Pre-commit hooks       | ✅ prettier + eslint 통과 (전 커밋 대상) |

---

## 9. 교훈 (Lessons Learned)

### 9.1 Compiled dist mock 한계

CLI 테스트는 `@didim365/agent-cli-core`를 compiled dist(`dist/index.js`)에서
import. `vi.mock('os')` 등 source-level mock이 dist 내부 closure에 영향 못 줌. →
`Proxy` 패턴으로 특정 method만 intercept하는 방식 필요.

### 9.2 Class spread 금지

`...actual.Storage`는 class의 static method를 소실시킴.
`getGlobalSettingsPath is not a function` 등 런타임 에러 발생. → `Proxy` 패턴
또는 개별 method override 사용.

### 9.3 테스트 mock 연쇄 비용

Storage read/write 분리 같은 인프라 변경 시 각 테스트 파일이 서로 다른 mock
전략을 사용하여 일괄 수정이 불가능. **코드 변경 자체보다 테스트 mock 수정에 더
많은 시간 소요** (≈60%). → 사전에 mock 패턴 파악 후 작업 계획에 반영 필요.

### 9.4 순환 호출 주의

`trustedFolders.test.ts`에서 mock이 `getTrustedFoldersPath()` 호출 →
`getTrustedFoldersReadPath()` → `resolveReadPath()` → mock의 `fs.existsSync` →
다시 `getTrustedFoldersPath()` → 무한 재귀. → mock에서 `resolveReadPath`를 직접
mock하여 순환 차단.

### 9.5 Mockable static method 패턴

`resolveReadPath(homedir(), ...)` 같은 core 함수 직접 호출은 테스트에서 mock이
어려움. → `ExtensionStorage.getUserExtensionsEnablementReadPath()` 같은 mockable
static method로 감싸고, 테스트에서 `vi.mock('./storage.js')`로 auto-mock.

### 9.6 Seatbelt/정책 파일은 정적 프로파일

`.sb` 파일과 `.toml` 정책 파일은 단위 테스트가 아닌 정적 텍스트 검토로 검증.
경로 변경 시 수동 확인 필수.

---

## 10. 결론 및 잔여 리스크

1. Phase 1 + 리뷰 1/2/3/4차 기준으로, **읽기 fallback / 쓰기 고정 원칙은 모든
   핵심 경로에서 정착**됨.
2. 기존 pre-existing 테스트 실패 7건도 모두 수정 완료 — **전체 테스트 0
   failures**.
3. 다만 레거시 `.gemini` 데이터를 장기간 유지할 경우 stale 파일이 잔존할 수
   있으므로, 후속 Phase에서 명시적 migration/cleanup 정책이 필요하다.
