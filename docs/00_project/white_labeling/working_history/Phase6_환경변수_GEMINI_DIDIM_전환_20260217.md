# Phase 6: GEMINI* → DIDIM* 환경변수 전환

> **작업일**: 2026-02-17 **작업자**: Claude **브랜치**:
> `v0.2.0/se_manager_agent` **상태**: ✅ Complete (리뷰 반영 완료)

---

## 1. 개요

`.gemini` → `.didim` 화이트라벨링의 마지막 단계로, `GEMINI_` 접두사 환경변수를
`DIDIM_` 접두사로 전환한다.

- **전환 대상**: ~40개 환경변수, 프로덕션 ~80참조, 테스트 ~70참조, 스크립트
  ~10참조
- **전환 패턴**: `DIDIM_` 우선 → `GEMINI_` fallback (중앙 유틸리티
  `resolveEnv()` 경유)
- **제외 대상**: `GEMINI_API_KEY`, `GOOGLE_API_KEY` (프로바이더 인증 표준)

---

## 2. 설계

### 2.1 중앙 유틸리티 (`envResolver.ts`)

**파일**: `packages/core/src/utils/envResolver.ts` (신규)

| 함수               | 시그니처                                      | 용도                                            |
| ------------------ | --------------------------------------------- | ----------------------------------------------- |
| `resolveEnv`       | `(suffix: string) => string \| undefined`     | `DIDIM_{suffix}` ?? `GEMINI_{suffix}`           |
| `resolvePromptEnv` | `(promptName: string) => string \| undefined` | `DIDIM_PROMPT_{name}` ?? `GEMINI_PROMPT_{name}` |
| `isCliEnvVar`      | `(key: string) => boolean`                    | `DIDIM_CLI_*` \|\| `GEMINI_CLI_*` 접두사 판별   |

### 2.2 커밋 전략 (Tidy First, 5커밋)

| #   | 유형       | 커밋 메시지                                                                   | 범위                              |
| --- | ---------- | ----------------------------------------------------------------------------- | --------------------------------- |
| 1   | Structural | `refactor(core): add envResolver utility for DIDIM_/GEMINI_ dual-prefix`      | 유틸리티 + 테스트 + barrel export |
| 2   | Behavioral | `feat(core): apply DIDIM_ env var prefix with GEMINI_ fallback`               | Core 프로덕션 ~15파일             |
| 3   | Behavioral | `feat(cli): apply DIDIM_ env var prefix with GEMINI_ fallback`                | CLI 프로덕션 ~12파일              |
| 4   | Behavioral | `feat(a2a,vscode,scripts): apply DIDIM_ env var prefix with GEMINI_ fallback` | 위성 패키지 + 스크립트 ~9파일     |
| 5   | Test       | `test: update env var references for DIDIM_/GEMINI_ dual-prefix`              | 테스트 18파일                     |

---

## 3. 커밋 상세

### 3.1 Commit 1 — Structural: envResolver 유틸리티

**커밋**: `0c5f96b1f` **파일**: 3 files, +161 lines

| 파일                                          | 변경                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| `packages/core/src/utils/envResolver.ts`      | 신규 — `resolveEnv`, `resolvePromptEnv`, `isCliEnvVar` 3개 함수                 |
| `packages/core/src/utils/envResolver.test.ts` | 신규 — 13개 테스트 케이스 (우선순위, fallback, undefined, 프롬프트, CLI 접두사) |
| `packages/core/src/index.ts`                  | barrel export 추가                                                              |

### 3.2 Commit 2 — Core 프로덕션 파일

**커밋**: `3b12c98c8` **파일**: 15 files, +68/-47 lines

| 파일                         | 변환 대상 환경변수                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `paths.ts`                   | `GEMINI_CLI_HOME` → `resolveEnv('CLI_HOME')`                                                                 |
| `storage.ts`                 | `GEMINI_CLI_SYSTEM_SETTINGS_PATH` → `resolveEnv('CLI_SYSTEM_SETTINGS_PATH')`                                 |
| `prompts.ts`                 | `GEMINI_SYSTEM_MD`, `GEMINI_WRITE_SYSTEM_MD`, `GEMINI_PROMPT_<NAME>` → `resolveEnv` / `resolvePromptEnv`     |
| `contentGenerator.ts`        | `GEMINI_CLI_CUSTOM_HEADERS`, `GEMINI_API_KEY_AUTH_MECHANISM`                                                 |
| `telemetry/config.ts`        | 8개 텔레메트리 변수 (`GEMINI_TELEMETRY_*`, `GEMINI_USAGE_REPORTING`, `GEMINI_DEV_TMP_TELEMETRY_ENDPOINT` 등) |
| `trace.ts`                   | `GEMINI_DEV_TRACING`                                                                                         |
| `debugLogger.ts`             | `GEMINI_DEBUG_LOG_FILE`                                                                                      |
| `ide-client.ts`              | 5개 IDE 변수 (`GEMINI_CLI_IDE_*`)                                                                            |
| `hybrid-token-storage.ts`    | `GEMINI_FORCE_FILE_STORAGE`                                                                                  |
| `token-storage/index.ts`     | `GEMINI_FORCE_ENCRYPTED_FILE_STORAGE`                                                                        |
| `experiments.ts`             | `GEMINI_EXP`                                                                                                 |
| `environmentSanitization.ts` | 인라인 `startsWith('DIDIM_CLI_')` 추가 (`DIDIM_CLI_*` allowlist)                                             |
| `hookRunner.ts`              | `GEMINI_PROJECT_DIR` → 양쪽 설정 + `$DIDIM_PROJECT_DIR` 치환 추가                                            |
| `oauth2.ts`                  | `GEMINI_CLI_USE_COMPUTE_ADC`                                                                                 |
| `oauth-token-storage.ts`     | `GEMINI_FORCE_FILE_STORAGE`                                                                                  |

### 3.3 Commit 3 — CLI 프로덕션 파일

**커밋**: `9edb0d76c` **파일**: 12 files, +57/-47 lines

| 파일                      | 변환 대상 환경변수                                                 |
| ------------------------- | ------------------------------------------------------------------ |
| `sandboxConfig.ts`        | `GEMINI_SANDBOX`, `GEMINI_SANDBOX_IMAGE`                           |
| `settings.ts`             | `GEMINI_CLI_SYSTEM_SETTINGS_PATH`, `GEMINI_CLI_USER_SETTINGS_PATH` |
| `config.ts`               | `GEMINI_SANDBOX`, `GEMINI_MODEL`                                   |
| `trustedFolders.ts`       | `GEMINI_CLI_TRUSTED_FOLDERS_PATH`                                  |
| `useAuth.ts`              | `GEMINI_DEFAULT_AUTH_TYPE`                                         |
| `AuthDialog.tsx`          | `GEMINI_CLI_USE_COMPUTE_ADC`, `GEMINI_DEFAULT_AUTH_TYPE`           |
| `sandbox.ts`              | Docker passthrough 5+ 변수 (DIDIM* + GEMINI* 양쪽 전달)            |
| `relaunch.ts`             | `GEMINI_CLI_NO_RELAUNCH`                                           |
| `handleAutoUpdate.ts`     | `GEMINI_SANDBOX`                                                   |
| `gemini.tsx`              | `GEMINI_CLI_NO_RELAUNCH`, `GEMINI_CLI_USE_COMPUTE_ADC`             |
| `StatusDisplay.tsx`       | `GEMINI_SYSTEM_MD`                                                 |
| `IdeIntegrationNudge.tsx` | IDE 변수 2개                                                       |

#### 특수 케이스: sandbox.ts Docker passthrough

Docker 컨테이너로 양쪽 이름 전달:

```typescript
const model = resolveEnv('MODEL');
if (model) {
  args.push('--env', `DIDIM_MODEL=${model}`);
  args.push('--env', `GEMINI_MODEL=${model}`); // container 내부 호환
}
```

### 3.4 Commit 4 — Satellite 패키지 + 스크립트

**커밋**: `112cd188d` **파일**: 9 files, +75/-28 lines

| 파일                                      | 변환 내용                                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `a2a-server/config.ts`                    | `resolveEnv` import 추가, `FOLDER_TRUST`, `YOLO_MODE` 전환                                     |
| `vscode-ide-companion/ide-server.ts`      | DIDIM* primary + GEMINI* legacy 상수 6개 (PORT, WORKSPACE_PATH, AUTH_TOKEN × 2)                |
| `scripts/start.js`                        | `DIDIM_CLI_NO_RELAUNCH` + `GEMINI_CLI_NO_RELAUNCH` 양쪽 설정                                   |
| `scripts/telemetry_utils.js`              | `DIDIM_CLI_HOME \|\| GEMINI_CLI_HOME` fallback                                                 |
| `scripts/sandbox_command.js`              | `DIDIM_SANDBOX \|\| GEMINI_SANDBOX` + `DIDIM_CLI_HOME \|\| GEMINI_CLI_HOME` + 에러 메시지 병기 |
| `scripts/lint.js`                         | `DIDIM_LINT_TEMP_DIR \|\| GEMINI_LINT_TEMP_DIR`                                                |
| `scripts/build_sandbox.js`                | `DIDIM_SANDBOX_IMAGE_TAG \|\| GEMINI_SANDBOX_IMAGE_TAG`                                        |
| `vscode-ide-companion/ide-server.test.ts` | `toHaveBeenCalledTimes(3→6)`, NthCalledWith 6개 assertion                                      |
| `a2a-server/config.test.ts`               | `resolveEnv` mock 추가                                                                         |

> **참고**: 스크립트(.js)는 TypeScript `resolveEnv`를 import 불가 → 인라인
> `process.env['DIDIM_X'] || process.env['GEMINI_X']` 패턴 사용

### 3.5 Commit 5 — 테스트 파일

**커밋**: `dd032e856` **파일**: 18 files, +137/-136 lines

#### Core 테스트 (11 files)

| 파일                               | 변환 대상                                                               | 변경 수 |
| ---------------------------------- | ----------------------------------------------------------------------- | ------- |
| `storage.test.ts`                  | `GEMINI_CLI_SYSTEM_SETTINGS_PATH` → `DIDIM_`                            | 5       |
| `registry_acknowledgement.test.ts` | `GEMINI_CLI_HOME` → `DIDIM_CLI_HOME`                                    | 4       |
| `acknowledgedAgents.test.ts`       | `GEMINI_CLI_HOME` → `DIDIM_CLI_HOME`                                    | 4       |
| `hybrid-token-storage.test.ts`     | `GEMINI_FORCE_FILE_STORAGE` → `DIDIM_`                                  | 1       |
| `ide-client.test.ts`               | 5개 IDE vars → `DIDIM_CLI_IDE_*`                                        | 12      |
| `experiments_local.test.ts`        | `GEMINI_EXP` → `DIDIM_EXP`                                              | 8       |
| `experiments.test.ts`              | `GEMINI_EXP` → `DIDIM_EXP`                                              | 1       |
| `prompts-substitution.test.ts`     | `GEMINI_SYSTEM_MD` → `DIDIM_SYSTEM_MD`                                  | 1       |
| `prompts.test.ts`                  | `GEMINI_SYSTEM_MD`, `GEMINI_WRITE_SYSTEM_MD` → `DIDIM_`                 | 13      |
| `contentGenerator.test.ts`         | `GEMINI_API_KEY_AUTH_MECHANISM`, `GEMINI_CLI_CUSTOM_HEADERS` → `DIDIM_` | 5       |
| `shellExecutionService.test.ts`    | `GEMINI_CLI_TEST_VAR` → `DIDIM_CLI_TEST_VAR`                            | 6       |

#### CLI 테스트 (6 files)

| 파일                               | 변환 대상                                           | 변경 수 |
| ---------------------------------- | --------------------------------------------------- | ------- |
| `relaunch.test.ts`                 | `GEMINI_CLI_NO_RELAUNCH` → `DIDIM_`                 | 5       |
| `sandboxConfig.test.ts`            | `GEMINI_SANDBOX`, `GEMINI_SANDBOX_IMAGE` → `DIDIM_` | 9       |
| `settings.test.ts`                 | `GEMINI_CLI_SYSTEM_SETTINGS_PATH` → `DIDIM_`        | 4       |
| `config.test.ts`                   | `GEMINI_MODEL`, 9개 `GEMINI_TELEMETRY_*` → `DIDIM_` | 28+     |
| `extension-manager-skills.test.ts` | `GEMINI_CLI_HOME` → `DIDIM_`                        | 1       |
| `handleAutoUpdate.test.ts`         | `GEMINI_SANDBOX` → `DIDIM_`                         | 1       |

#### 스크립트 테스트 (1 file)

| 파일                                  | 변환 내용                                            |
| ------------------------------------- | ---------------------------------------------------- |
| `scripts/tests/telemetry_gcp.test.ts` | `delete process.env.DIDIM_CLI_CREDENTIALS_PATH` 추가 |

---

## 4. 발생 이슈 및 해결

### 4.1 vscode-ide-companion 테스트 실패 — `toHaveBeenCalledTimes` 불일치

- **증상**: `expected 3 calls, received 6`
- **원인**: 프로덕션 코드가 DIDIM* + GEMINI* 양쪽에 `replace()` 호출 (6회)
- **해결**: 테스트에서 `toHaveBeenCalledTimes(6)` + NthCalledWith 6개
  assertion으로 변경

### 4.2 `replace_all` 부작용 — 테스트 assertion 오염

- **증상**: 4번째 NthCalledWith assertion이 의도치 않게
  `DIDIM_CLI_IDE_WORKSPACE_PATH`로 변경됨
- **원인**: Edit `replace_all` 옵션이 테스트 내 GEMINI\_ legacy assertion까지
  치환
- **해결**: 해당 assertion만 수동으로 `GEMINI_CLI_IDE_WORKSPACE_PATH`로 복원
- **교훈**: MEMORY.md에 기존 기록과 일치 —
  `replace_all 부작용: 접두사 중복 주의`

### 4.3 a2a-server 테스트 실패 — `resolveEnv is not a function`

- **증상**: `resolveEnv is not a function` 런타임 에러
- **원인**: vi.mock에서 `@didim365/agent-cli-core` mock에 `resolveEnv` 미포함
- **해결**: mock 객체에 `resolveEnv` 구현 추가

---

## 5. 검증

### 5.1 테스트 결과

| 패키지     | 테스트 파일 | 통과       | 실패  | 스킵   |
| ---------- | ----------- | ---------- | ----- | ------ |
| core       | 282         | 5,441      | 0     | 24     |
| cli        | 351         | 4,771      | 0     | —      |
| a2a-server | 3           | 40         | 0     | 1      |
| **합계**   | **636**     | **10,252** | **0** | **25** |

### 5.2 잔존 검증 — 미전환 참조 ZERO

```bash
# process.env['GEMINI_'] 잔존 스캔 (테스트 제외)
rg "process\.env\['GEMINI_" packages/*/src/ --glob='!*.test.*'
→ 모두 GEMINI_API_KEY / GOOGLE_API_KEY (제외 대상)

# process.env.GEMINI_ (dot notation) 잔존 스캔
rg "process\.env\.GEMINI_" packages/*/src/
→ 0건
```

### 5.3 전환 제외 확인

| 환경변수         | 잔존 여부    | 사유                 |
| ---------------- | ------------ | -------------------- |
| `GEMINI_API_KEY` | ✅ 정상 잔존 | 프로바이더 인증 표준 |
| `GOOGLE_API_KEY` | ✅ 정상 잔존 | Google API 인증 표준 |

---

## 6. 변경 파일 요약

| 커밋                   | 프로덕션 | 테스트 | 합계   |
| ---------------------- | -------- | ------ | ------ |
| Commit 1 (envResolver) | 2        | 1      | 3      |
| Commit 2 (Core)        | 15       | 0      | 15     |
| Commit 3 (CLI)         | 12       | 0      | 12     |
| Commit 4 (Satellite)   | 7        | 2      | 9      |
| Commit 5 (Tests)       | 0        | 18     | 18     |
| **합계**               | **36**   | **21** | **57** |

---

## 7. 전환 대상 환경변수 전체 목록

### Core 패키지

| 기존                                  | 신규 (DIDIM\_ 우선)                  | resolveEnv suffix              |
| ------------------------------------- | ------------------------------------ | ------------------------------ |
| `GEMINI_CLI_HOME`                     | `DIDIM_CLI_HOME`                     | `CLI_HOME`                     |
| `GEMINI_CLI_SYSTEM_SETTINGS_PATH`     | `DIDIM_CLI_SYSTEM_SETTINGS_PATH`     | `CLI_SYSTEM_SETTINGS_PATH`     |
| `GEMINI_SYSTEM_MD`                    | `DIDIM_SYSTEM_MD`                    | `SYSTEM_MD`                    |
| `GEMINI_WRITE_SYSTEM_MD`              | `DIDIM_WRITE_SYSTEM_MD`              | `WRITE_SYSTEM_MD`              |
| `GEMINI_PROMPT_<NAME>`                | `DIDIM_PROMPT_<NAME>`                | (resolvePromptEnv)             |
| `GEMINI_CLI_CUSTOM_HEADERS`           | `DIDIM_CLI_CUSTOM_HEADERS`           | `CLI_CUSTOM_HEADERS`           |
| `GEMINI_API_KEY_AUTH_MECHANISM`       | `DIDIM_API_KEY_AUTH_MECHANISM`       | `API_KEY_AUTH_MECHANISM`       |
| `GEMINI_DEV_TRACING`                  | `DIDIM_DEV_TRACING`                  | `DEV_TRACING`                  |
| `GEMINI_DEBUG_LOG_FILE`               | `DIDIM_DEBUG_LOG_FILE`               | `DEBUG_LOG_FILE`               |
| `GEMINI_CLI_IDE_SERVER_PORT`          | `DIDIM_CLI_IDE_SERVER_PORT`          | `CLI_IDE_SERVER_PORT`          |
| `GEMINI_CLI_IDE_WORKSPACE_PATH`       | `DIDIM_CLI_IDE_WORKSPACE_PATH`       | `CLI_IDE_WORKSPACE_PATH`       |
| `GEMINI_CLI_IDE_AUTH_TOKEN`           | `DIDIM_CLI_IDE_AUTH_TOKEN`           | `CLI_IDE_AUTH_TOKEN`           |
| `GEMINI_CLI_IDE_ORIGINAL_BIN`         | `DIDIM_CLI_IDE_ORIGINAL_BIN`         | `CLI_IDE_ORIGINAL_BIN`         |
| `GEMINI_CLI_IDE_MODE`                 | `DIDIM_CLI_IDE_MODE`                 | `CLI_IDE_MODE`                 |
| `GEMINI_FORCE_FILE_STORAGE`           | `DIDIM_FORCE_FILE_STORAGE`           | `FORCE_FILE_STORAGE`           |
| `GEMINI_FORCE_ENCRYPTED_FILE_STORAGE` | `DIDIM_FORCE_ENCRYPTED_FILE_STORAGE` | `FORCE_ENCRYPTED_FILE_STORAGE` |
| `GEMINI_EXP`                          | `DIDIM_EXP`                          | `EXP`                          |
| `GEMINI_TELEMETRY_ENABLED`            | `DIDIM_TELEMETRY_ENABLED`            | (telemetry config 내 인라인)   |
| `GEMINI_USAGE_REPORTING`              | `DIDIM_USAGE_REPORTING`              | (telemetry config 내 인라인)   |
| `GEMINI_DEV_TMP_TELEMETRY_ENDPOINT`   | `DIDIM_DEV_TMP_TELEMETRY_ENDPOINT`   | (telemetry config 내 인라인)   |
| `GEMINI_PROJECT_DIR`                  | `DIDIM_PROJECT_DIR`                  | (hookRunner 내 양쪽 설정)      |
| `GEMINI_CLI_USE_COMPUTE_ADC`          | `DIDIM_CLI_USE_COMPUTE_ADC`          | `CLI_USE_COMPUTE_ADC`          |

### CLI 패키지

| 기존                              | 신규 (DIDIM\_ 우선)              | resolveEnv suffix          |
| --------------------------------- | -------------------------------- | -------------------------- |
| `GEMINI_SANDBOX`                  | `DIDIM_SANDBOX`                  | `SANDBOX`                  |
| `GEMINI_SANDBOX_IMAGE`            | `DIDIM_SANDBOX_IMAGE`            | `SANDBOX_IMAGE`            |
| `GEMINI_MODEL`                    | `DIDIM_MODEL`                    | `MODEL`                    |
| `GEMINI_CLI_TRUSTED_FOLDERS_PATH` | `DIDIM_CLI_TRUSTED_FOLDERS_PATH` | `CLI_TRUSTED_FOLDERS_PATH` |
| `GEMINI_DEFAULT_AUTH_TYPE`        | `DIDIM_DEFAULT_AUTH_TYPE`        | `DEFAULT_AUTH_TYPE`        |
| `GEMINI_CLI_NO_RELAUNCH`          | `DIDIM_CLI_NO_RELAUNCH`          | `CLI_NO_RELAUNCH`          |
| `GEMINI_CLI_USER_SETTINGS_PATH`   | `DIDIM_CLI_USER_SETTINGS_PATH`   | `CLI_USER_SETTINGS_PATH`   |

### Satellite 패키지 / 스크립트

| 기존                            | 신규 (DIDIM\_ 우선)            | 파일                                   |
| ------------------------------- | ------------------------------ | -------------------------------------- |
| `GEMINI_FOLDER_TRUST`           | `DIDIM_FOLDER_TRUST`           | a2a-server/config.ts                   |
| `GEMINI_YOLO_MODE`              | `DIDIM_YOLO_MODE`              | a2a-server/config.ts                   |
| `GEMINI_CLI_IDE_SERVER_PORT`    | `DIDIM_CLI_IDE_SERVER_PORT`    | ide-server.ts (producer)               |
| `GEMINI_CLI_IDE_WORKSPACE_PATH` | `DIDIM_CLI_IDE_WORKSPACE_PATH` | ide-server.ts (producer)               |
| `GEMINI_CLI_IDE_AUTH_TOKEN`     | `DIDIM_CLI_IDE_AUTH_TOKEN`     | ide-server.ts (producer)               |
| `GEMINI_CLI_HOME`               | `DIDIM_CLI_HOME`               | telemetry_utils.js, sandbox_command.js |
| `GEMINI_SANDBOX`                | `DIDIM_SANDBOX`                | sandbox_command.js                     |
| `GEMINI_LINT_TEMP_DIR`          | `DIDIM_LINT_TEMP_DIR`          | lint.js                                |
| `GEMINI_SANDBOX_IMAGE_TAG`      | `DIDIM_SANDBOX_IMAGE_TAG`      | build_sandbox.js                       |
| `GEMINI_CLI_NO_RELAUNCH`        | `DIDIM_CLI_NO_RELAUNCH`        | start.js                               |

---

## 8. 리뷰 결과 반영

### 8.1 리뷰 이슈 요약

| #   | 심각도 | 파일                   | 이슈                                                                                         | 판정    | 조치      |
| --- | ------ | ---------------------- | -------------------------------------------------------------------------------------------- | ------- | --------- |
| 1   | HIGH   | `telemetry_utils.js`   | WORKSPACE_SETTINGS_FILE이 `.didim` 고정, `.gemini` fallback 없음; writeJsonFile에 mkdir 없음 | ✅ 확인 | 코드 수정 |
| 2   | MEDIUM | `sandbox.ts:252`       | build_sandbox 자식 프로세스에 `GEMINI_SANDBOX`만 주입, `DIDIM_SANDBOX` 누락                  | ✅ 확인 | 코드 수정 |
| 3   | MEDIUM | `relaunch.ts:57`       | 자식 프로세스 env에 `GEMINI_CLI_NO_RELAUNCH`만 설정, `DIDIM_` 누락                           | ✅ 확인 | 코드 수정 |
| 4   | LOW    | 작업결과서 Section 3.2 | `environmentSanitization.ts`가 `isCliEnvVar()` 사용으로 기술, 실제는 인라인 `startsWith`     | ✅ 확인 | 문서 수정 |

### 8.2 수정 상세

#### Issue 1: `scripts/telemetry_utils.js` — 설정 경로 fallback + mkdir

**변경 전**:
`WORKSPACE_SETTINGS_FILE = path.join(projectRoot, GEMINI_DIR, 'settings.json')`
고정

**변경 후**:

- `LEGACY_GEMINI_DIR` import 추가
- `resolveSettingsPath()`: `.didim/settings.json` 우선 → `.gemini/settings.json`
  fallback → `.didim/` 기본
- `getWriteSettingsPath()`: 항상 `.didim/settings.json` (쓰기 경로 고정)
- `writeJsonFile()`: `fs.mkdirSync(dir, { recursive: true })` 추가 — 디렉토리
  미존재 시 자동 생성
- `manageTelemetrySettings()`: 읽기는 resolve 경로, 쓰기는 primary `.didim/`
  경로 사용

#### Issue 2: `packages/cli/src/utils/sandbox.ts:252` — DIDIM_SANDBOX 주입

**변경 전**:

```typescript
env: { ...process.env, GEMINI_SANDBOX: config.command }
```

**변경 후**:

```typescript
env: {
  ...process.env,
  DIDIM_SANDBOX: config.command,      // primary
  GEMINI_SANDBOX: config.command,     // legacy fallback
}
```

#### Issue 3: `packages/cli/src/utils/relaunch.ts:57` — 자식 프로세스 양쪽 설정

**변경 전**:

```typescript
const newEnv = { ...process.env, GEMINI_CLI_NO_RELAUNCH: 'true' };
```

**변경 후**:

```typescript
const newEnv = {
  ...process.env,
  DIDIM_CLI_NO_RELAUNCH: 'true',
  GEMINI_CLI_NO_RELAUNCH: 'true', // legacy fallback
};
```

#### Issue 4: 작업결과서 Section 3.2 문서 오류

`environmentSanitization.ts` 설명을 `` `isCliEnvVar()` 함수 활용 `` →
``인라인 `startsWith('DIDIM_CLI_')` 추가``로 정정.

> `isCliEnvVar()` 유틸리티 함수는 `envResolver.ts`에 존재하나,
> `environmentSanitization.ts`에서는 import하지 않고 인라인
> `key.startsWith('DIDIM_CLI_') || key.startsWith('GEMINI_CLI_')` 로 구현.

### 8.3 검증

- **커밋**: `ea887d106` (코드 수정 3건)
- **테스트**: 전체 10,253 통과, 0 실패
  - Core: 282 files, 5,441 passed
  - CLI: 351 files, 4,772 passed
  - vscode: 3 files, 40 passed

---

## 9. 추가 리뷰 결과 반영

### 9.1 추가 리뷰 이슈 요약

| #   | 심각도 | 파일                 | 이슈                                                                                                  | 판정        | 조치      |
| --- | ------ | -------------------- | ----------------------------------------------------------------------------------------------------- | ----------- | --------- |
| 1   | HIGH   | `telemetry_utils.js` | `readJsonFile()`이 JSONC 파싱 실패 시 `{}` 반환 → `manageTelemetrySettings()`가 기존 설정 덮어써 손실 | ✅ 확인     | 코드 수정 |
| 2   | HIGH   | `telemetry.js`       | `/\/\/[^\n]*/g` 정규식이 `http://` 등 문자열 내부 `//`도 제거 → JSON 파싱 실패                        | ✅ 확인     | 코드 수정 |
| 3   | MEDIUM | `telemetry.js`       | `DIDIM_CLI_HOME`/`GEMINI_CLI_HOME` 무시, `HOME`/`USERPROFILE`만 사용                                  | ✅ 확인     | 코드 수정 |
| 4   | MEDIUM | `telemetry_utils.js` | `USER_GEMINI_DIR`이 `.didim` 전용, legacy `.gemini` fallback 없음                                     | ⚠️ 부분확인 | 주석 보강 |
| 5   | MEDIUM | `sandbox_command.js` | `if (settings.sandbox)` — `false`는 falsy → macOS에서 sandbox-exec로 귀결                             | ✅ 확인     | 코드 수정 |

### 9.2 수정 상세

#### Issue 1: `telemetry_utils.js` — JSONC 파싱 + 데이터 손실 방지

**변경**:

- `strip-json-comments` import 추가
- `readJsonFile()`: `JSON.parse(content)` →
  `JSON.parse(stripJsonComments(content))`
- 파싱 실패 시 `{}` 대신 `null` 반환 (파일 미존재 `{}`와 구분)
- `manageTelemetrySettings()`: `null` 체크 추가 — 파싱 실패 시 쓰기 생략하여
  데이터 손실 방지

#### Issue 2: `telemetry.js` — URL 안전 JSONC 파싱

**변경 전**: `content.replace(/\/\/[^\n]*/g, '')` — `"http://localhost:4317"`
내부 `//` 제거

**변경 후**: `JSON.parse(stripJsonComments(content))` — 문자열 내부 `//`는 보존

#### Issue 3: `telemetry.js` — 커스텀 홈 디렉토리 지원

**변경 전**:
`process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH`

**변경 후**:

```javascript
const homedir =
  process.env['DIDIM_CLI_HOME'] ||
  process.env['GEMINI_CLI_HOME'] ||
  os.homedir();
```

#### Issue 4: `telemetry_utils.js` — USER_GEMINI_DIR legacy fallback

**판정**: 부분 확인. workspace settings 읽기/쓰기는 이전 리뷰에서
`.didim`/`.gemini` fallback 적용 완료
(resolveSettingsPath/getWriteSettingsPath). `USER_GEMINI_DIR`은 OTEL
아티팩트(텔레메트리 바이너리) 저장 전용이며, legacy `.gemini/tmp/...` 경로에
대한 마이그레이션은 불필요 (바이너리는 자동 재다운로드). 명확한 주석 추가로
대응.

#### Issue 5: `sandbox_command.js` — `sandbox: false` 명시적 비활성화

**변경**:

1. `if (settings.sandbox)` → `if (settings.sandbox !== undefined)` + `String()`
   변환
2. final else 블록 앞에 `['0', 'false'].includes(geminiSandbox)` 전용 분기 추가
   → `process.exit(1)` (sandbox 비활성화 → start.js에서
   sandboxCommand=undefined)

### 9.3 검증

- **커밋**: `c20da59c3` (코드 수정 4건 + 주석 1건)
- **테스트**: 전체 10,253 통과, 0 실패
  - Core: 282 files, 5,441 passed
  - CLI: 351 files, 4,772 passed
  - vscode: 3 files, 40 passed
