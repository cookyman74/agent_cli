# Phase 3 (부분): 사용자 메시지 + 테스트 fixture `.gemini` → `.didim` 전환

> **작업일**: 2026-02-16 **브랜치**: `v0.1.2/white_labelling` **범위**: 사용자
> 노출 메시지 4곳 + .gitignore + logger tidy + 테스트 fixture 24파일 **선행**:
> Phase 1 (Core/Storage) + Phase 2 (.geminiignore fallback + UI 라벨) 완료

---

## 1. 설계 결정사항

### 1.1 커밋 전략 — Tidy First (3커밋)

| 커밋     | 유형       | 범위                                        |
| -------- | ---------- | ------------------------------------------- |
| Commit 1 | STRUCTURAL | logger.ts 변수명 tidy + registry.ts 주석    |
| Commit 2 | BEHAVIORAL | 사용자 메시지 4곳 + .gitignore + 테스트 3곳 |
| Commit 3 | TEST       | 테스트 fixture 24파일 일괄 업데이트         |

### 1.2 `.gitignore` 전략

`.didim/` 패턴을 **새로 추가**하고 기존 `.gemini/` 패턴은 **Legacy 호환으로
유지**:

```gitignore
# didim agent-cli settings
**/.didim/
!/.didim/
.didim/*
!.didim/config.yaml
!.didim/commands/
!.didim/skills/
!.didim/settings.json

# Legacy .gemini support (upstream compatibility)
**/.gemini/
!/.gemini/
...
```

### 1.3 테스트 fixture 변경 원칙

- **Mock 경로**: `getGeminiDir()`, `getProjectTempDir()` 등 Storage 메서드 mock
  → `.didim` 반환 (현재 GEMINI_DIR = '.didim')
- **LEGACY 경로 유지**: `oauth-credential-storage.test.ts`의 `oldFilePath` →
  `.gemini` 유지 (LEGACY_GEMINI_DIR 마이그레이션 경로)
- **GEMINI.md 파일명 유지**: `contextManager.test.ts`의
  `/home/user/.didim/GEMINI.md` → 디렉토리만 변경, 파일명은 fallback chain 일부

---

## 2. 커밋 상세

### Commit 1: `7c14b6d5c` — STRUCTURAL (동작 변경 없음)

**`refactor(core): rename logger geminiDir to projectTempDir and update agent comments`**

| 파일                                   | 변경                                                |
| -------------------------------------- | --------------------------------------------------- |
| `packages/core/src/core/logger.ts`     | `geminiDir` → `projectTempDir` (8곳)                |
| `packages/core/src/agents/registry.ts` | 주석 `~/.gemini/agents/` → `~/.didim/agents/` (2곳) |

---

### Commit 2: `5376c8cfc` — BEHAVIORAL (사용자 메시지 + .gitignore)

**`refactor(cli): update .gemini user messages to .didim and add .didim .gitignore patterns`**

| 파일                     | 라인          | 변경                                               |
| ------------------------ | ------------- | -------------------------------------------------- |
| `hookRegistry.ts`        | 118           | `.gemini/settings.json` → `.didim/settings.json`   |
| `migrate.ts`             | 243, 245      | `.gemini/settings.json` → `.didim/settings.json`   |
| `restoreCommand.ts`      | 49            | `.gemini directory path` → `.didim directory path` |
| `cli-help-agent.ts`      | 89            | `.gemini/agents/` → `.didim/agents/`               |
| `migrate.test.ts`        | 136, 509, 512 | 기대 문자열 동기화                                 |
| `restoreCommand.test.ts` | 96            | 기대 문자열 동기화                                 |
| `.gitignore`             | 5-16          | `.didim/` 패턴 추가, 기존 `.gemini/` 유지          |

---

### Commit 3: `9b64d0758` — TEST (24파일 일괄)

**`test: update .gemini mock paths to .didim in 24 test files`**

| 카테고리    | 파일                              | 변경 패턴                                             |
| ----------- | --------------------------------- | ----------------------------------------------------- |
| Core 서비스 | chatRecordingService.test.ts      | `.gemini/tmp` → `.didim/tmp`                          |
| Core 서비스 | contextManager.test.ts            | `/home/user/.gemini/` → `/home/user/.didim/`          |
| Hooks       | hookEventHandler.test.ts          | `.gemini/tmp` → `.didim/tmp`                          |
| Hooks       | hookRegistry.test.ts              | `/project/.gemini` → `/project/.didim`                |
| Agents      | registry_acknowledgement.test.ts  | `.gemini/agents` → `.didim/agents`                    |
| Telemetry   | sanitize.test.ts                  | `.gemini/hooks` → `.didim/hooks`                      |
| Telemetry   | metrics.test.ts                   | `.gemini/hooks` → `.didim/hooks`                      |
| Logger      | logger.test.ts                    | 테스트 설명 문자열                                    |
| CLI Config  | settings-validation.test.ts       | `~/.gemini/settings.json` → `~/.didim/`               |
| CLI Config  | policy-engine.integration.test.ts | `.gemini/tmp` → `.didim/tmp`                          |
| CLI Config  | mcpServerEnablement.test.ts       | `/virtual-home/.gemini` → `.didim`                    |
| Extensions  | storage.test.ts                   | `.gemini/extensions` → `.didim/extensions`            |
| Extensions  | extensionSettings.test.ts         | `.gemini/extensions` → `.didim/extensions`            |
| Extensions  | extensionUpdates.test.ts          | `.gemini/extensions` → `.didim/extensions`            |
| Extensions  | extension-manager-scope.test.ts   | `.gemini/extensions` → `.didim/extensions`            |
| Extensions  | github.test.ts                    | `/mock/.gemini` → `/mock/.didim`                      |
| Commands    | migrate.test.ts                   | `/test/project/.gemini` → `.didim`                    |
| Commands    | disable.test.ts                   | `.gemini/settings.json` → `.didim/settings.json`      |
| Commands    | list.test.ts (mcp)                | `.gemini/tmp`, GEMINI_DIR mock                        |
| UI          | chatCommand.test.ts               | `.gemini/tmp` → `.didim/tmp`                          |
| UI          | useShellHistory.test.ts           | `.gemini/settings.json` → `.didim/`                   |
| Sandbox     | sandbox.test.ts                   | GEMINI_DIR, resolveReadPath, getGlobalGeminiDir mocks |
| CLI         | nonInteractiveCli.test.ts         | `.gemini/tmp` → `.didim/tmp`                          |
| Integration | globalSetup.ts                    | GEMINI_CONFIG_DIR → `.didim`                          |

**의도적 미변경**:

- `oauth-credential-storage.test.ts:62` —
  `oldFilePath = '/mock/home/.gemini/oauth.json'` (LEGACY 마이그레이션 테스트)

---

## 3. 품질 게이트

| 항목                 | 결과                                 |
| -------------------- | ------------------------------------ |
| Core 테스트          | 281 files, **5390 passed**, 0 failed |
| CLI 테스트           | 351 files, **4758 passed**, 0 failed |
| TypeScript typecheck | ✅ 0 errors (core + cli)             |
| Pre-commit hooks     | ✅ 3/3 커밋 모두 통과                |

---

## 4. Phase 3 잔여 항목

| 항목                                             | 상태         | 비고                              |
| ------------------------------------------------ | ------------ | --------------------------------- |
| Extensions 파일명 결정 (`gemini-extension.json`) | ⬜ 결정 필요 | 유지 vs `didim-extension.json`    |
| `.gemini-extension-install.json` 파일명          | ⬜ 결정 필요 | 변경 시 기존 설치 데이터 fallback |
| a2a-server settings/config fallback              | ⬜           | Storage 미사용, dual-path 필요    |
| a2a-server config.ts:201 cwd 버그                | ⬜           | `process.cwd()` → `homedir()`     |
| `GEMINI_CLI_TRUSTED_FOLDERS_PATH` env var        | ⬜ 결정 필요 | 유지 또는 alias 추가              |
| VS Code extension ID                             | ⬜           | 마켓플레이스 ID, 변경 불가        |

---

## 5. Lessons Learned

- **replace_all 줄바꿈 불일치**: `path.join(dir, '.gemini', 'extensions')`
  패턴이 줄바꿈으로 나뉘어 있으면 `replace_all`로 `'.gemini', 'extensions'` 매칭
  실패 → 별도 `'.gemini',` 패턴으로 보완
- **OAuth LEGACY 경로 보존**: `oauth-credential-storage.test.ts`의
  `oldFilePath`는 `LEGACY_GEMINI_DIR` 기반 마이그레이션 테스트 → `.gemini`
  유지가 정확
- **contextManager GEMINI.md**: 디렉토리(`.didim`)와 파일명(`GEMINI.md`)은
  독립적 — 파일명은 extension fallback chain 일부
