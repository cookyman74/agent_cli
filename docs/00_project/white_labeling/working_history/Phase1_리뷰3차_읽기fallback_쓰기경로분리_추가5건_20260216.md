# Phase 1 리뷰 이슈 3차 수정 — 읽기 fallback + 쓰기 경로 분리 추가 5건

> **작업일**: 2026-02-16 **작업자**: Claude (Opus 4.6) **브랜치**:
> `v0.1.2/white_labelling` **커밋**: `9c051a02c` (BEHAVIORAL) **선행 작업**:
> `00d641fd1` (Phase 1 리뷰 2차 — 쓰기 경로 분리) **참조**:
> `docs/00_project/white_labeling/todolist/gemini_to_didim_20260215_todolist.md`

---

## 1. 작업 배경

Phase 1 리뷰 2차(`00d641fd1`)에서 쓰기 경로 분리 + consumer 마이그레이션을
완료했으나, 3차 리뷰에서 **추가 6건** 이슈가 제기됨. 검증 결과 5건 실수정, 1건
이미 해결 확인.

핵심 원칙: **읽기는 .didim→.gemini fallback, 쓰기는 항상 .didim**

---

## 2. 리뷰 이슈 요약

| #   | Finding                                     | 심각도 | 상태         | 판정                                    |
| --- | ------------------------------------------- | ------ | ------------ | --------------------------------------- |
| 1   | Sandbox 경로 legacy fallback 없음           | HIGH   | ✅ 수정      | READ에 resolveReadPath 적용             |
| 2   | Skills/Extensions install이 read-path 기반  | HIGH   | ✅ 수정      | WRITE에 getWritePath 적용               |
| 3   | Trusted folders fallback 없음               | MEDIUM | ⏭️ 이미 해결 | 이전 커밋에서 resolveReadPath 적용 완료 |
| 4   | Encrypted MCP token v2 fallback 없음        | MEDIUM | ✅ 수정      | read/write 경로 분리                    |
| 5   | 글로벌 메모리/시스템 프롬프트 fallback 없음 | MEDIUM | ✅ 수정      | READ에 resolveReadPath 적용             |
| 6   | UI 알림 settings 경로 불일치                | LOW    | ✅ 수정      | Storage.getGlobalSettingsPath() 사용    |

---

## 3. 수정 상세

### Issue 1: sandbox.ts (4개소)

| 위치     | 변경 전                                       | 변경 후                                                | 유형  |
| -------- | --------------------------------------------- | ------------------------------------------------------ | ----- |
| L65      | `path.join(GEMINI_DIR, ...)`                  | `resolveReadPath(process.cwd(), ...)`                  | READ  |
| L208-211 | `path.join(GEMINI_DIR, 'sandbox.Dockerfile')` | `resolveReadPath(process.cwd(), 'sandbox.Dockerfile')` | READ  |
| L232-235 | 동일                                          | 동일                                                   | READ  |
| L298-301 | `path.join(homedir, GEMINI_DIR)`              | `Storage.getGlobalGeminiDir()` + fallback              | MOUNT |

Docker 마운트 수정 전략: `getGlobalGeminiDir()` (resolveReadDir: .didim >
.gemini) → 존재하지 않으면 `getGlobalWriteDir()` (.didim) + mkdir.

### Issue 2: Skills/Extensions (4파일)

| 파일                     | 변경                                                                                                                | 유형       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------- |
| `skillUtils.ts`          | installSkill: `getProjectSkillsDir()`→`getWritePath('skills')`, `getUserSkillsDir()`→`getGlobalWritePath('skills')` | WRITE      |
| `extensions/storage.ts`  | `getUserExtensionsWriteDir()` 신규 추가                                                                             | WRITE      |
| `extension-manager.ts`   | install: `getUserExtensionsDir()`→`getUserExtensionsWriteDir()`                                                     | WRITE      |
| `extensionEnablement.ts` | configFilePath/configDir → configReadPath/configWritePath/configWriteDir 분리                                       | READ/WRITE |

### Issue 4: file-token-storage.ts

- `tokenFilePath` → `tokenReadPath` (resolveReadPath) + `tokenWritePath`
  (Storage.getGlobalWritePath)
- `loadTokens()`: tokenReadPath,
  `saveTokens()`/`clearAll()`/`deleteCredentials()`: tokenWritePath
- Import: `GEMINI_DIR` 제거, `resolveReadPath`, `Storage` 추가

### Issue 5: memoryDiscovery.ts + prompts.ts

**memoryDiscovery.ts (4개소)**:

- L153: `path.join(resolvedHome, GEMINI_DIR, ...)` →
  `resolveReadPath(resolvedHome, ...)`
- L189: 경계 검사 `.didim` + `.gemini` 모두 체크
- L338: `path.join(userHome, GEMINI_DIR, ...)` →
  `resolveReadPath(userHome, ...)`
- L382: `path.join(homedir(), GEMINI_DIR)` → `Storage.getGlobalGeminiDir()`

**prompts.ts (1개소)**:

- L90: `path.resolve(path.join(GEMINI_DIR, 'system.md'))` →
  `resolveReadPath(process.cwd(), 'system.md')`

### Issue 6: Notifications.tsx

- L21: `path.join(homedir(), GEMINI_DIR, 'settings.json')` →
  `Storage.getGlobalSettingsPath()`
- Import: `GEMINI_DIR, homedir` 제거, `Storage` 유지

---

## 4. 테스트 수정

| 테스트 파일                   | 변경 내용                                                                |
| ----------------------------- | ------------------------------------------------------------------------ |
| `file-token-storage.test.ts`  | `vi.mock('../../config/storage.js')` 추가 — resolveReadPath/Storage mock |
| `extensionEnablement.test.ts` | `getUserExtensionsWriteDir` mock 반환값 추가                             |
| `sandbox.test.ts`             | `resolveReadPath`/`Storage` mock 추가 (.gemini 기반)                     |
| `Notifications.test.tsx`      | `getGlobalSettingsPath` mock 추가                                        |

---

## 5. 검증 결과

| 검증 항목              | 결과                                      |
| ---------------------- | ----------------------------------------- |
| TypeScript (typecheck) | ✅ 0 new errors                           |
| ESLint (core + CLI)    | ✅ 0 errors                               |
| Core tests (281 files) | ✅ 5380 passed                            |
| CLI tests (351 files)  | ✅ 4751 passed, 7 failed (모두 기존 실패) |
| Pre-commit hooks       | ✅ prettier + eslint 통과                 |

기존 CLI 실패 7건 (변경과 무관):

- initCommand.test.ts (2), modelCommand.test.ts (1), skillUtils.test.ts (1)
- extensions/install.test.ts (1), extensions/validate.test.ts (1), mcp.test.ts
  (1)

---

## 6. 변경 파일 요약

총 **13파일** (소스 9 + 테스트 4):

**Core (4)**:

- `packages/core/src/core/prompts.ts`
- `packages/core/src/utils/memoryDiscovery.ts`
- `packages/core/src/mcp/token-storage/file-token-storage.ts`
- `packages/core/src/mcp/token-storage/file-token-storage.test.ts`

**CLI (9)**:

- `packages/cli/src/utils/sandbox.ts`
- `packages/cli/src/utils/sandbox.test.ts`
- `packages/cli/src/utils/skillUtils.ts`
- `packages/cli/src/config/extension-manager.ts`
- `packages/cli/src/config/extensions/storage.ts`
- `packages/cli/src/config/extensions/extensionEnablement.ts`
- `packages/cli/src/config/extensions/extensionEnablement.test.ts`
- `packages/cli/src/ui/components/Notifications.tsx`
- `packages/cli/src/ui/components/Notifications.test.tsx`
