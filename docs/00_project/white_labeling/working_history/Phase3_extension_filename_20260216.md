# Phase 3 (완료): Extension 파일명 `didim-extension.json` 전환 + 환경변수 alias

> **작업일**: 2026-02-16 **브랜치**: `v0.1.2/white_labelling` **범위**:
> Extension config 파일명, 환경변수, 템플릿 **선행**: Phase 3 a2a-server
> fallback 완료

---

## 1. 설계 결정사항

### 1.1 사용자 결정 3건

Phase 3 a2a-server 완료 후, 잔여 결정이 필요했던 항목에 대해 사용자 확인:

1. **`gemini-extension.json` → `didim-extension.json`** (읽기: fallback, 쓰기:
   didim only)
2. **`.gemini-extension-install.json` → `.didim-extension-install.json`** (읽기:
   fallback)
3. **`GEMINI_CLI_TRUSTED_FOLDERS_PATH` → `DIDIM_CLI_TRUSTED_FOLDERS_PATH`**
   (legacy alias)

### 1.2 커밋 전략 — Tidy First 4커밋

| 커밋     | 유형       | 범위                                                                 |
| -------- | ---------- | -------------------------------------------------------------------- |
| Commit 1 | STRUCTURAL | 상수 rename + legacy alias (동작 변경 없음)                          |
| Commit 2 | BEHAVIORAL | 읽기 fallback 로직 4곳 (extension-manager, extension, a2a-server ×2) |
| Commit 3 | BEHAVIORAL | 쓰기/생성 + UI 메시지 + 템플릿 rename 6개 + 환경변수 alias           |
| Commit 4 | TEST       | 테스트 fixture 8파일 업데이트                                        |

### 1.3 resolveReadPath 한계 인식

`Storage.getExtensionsConfigPath()` 내부의 `resolveReadPath`는 **디렉토리
접두사만** swap (`.didim/` → `.gemini/`), 파일명은 swap하지 않는다. 따라서
`didim-extension.json` → `gemini-extension.json` 파일명 fallback은 별도
`LEGACY_EXTENSIONS_CONFIG_FILENAME` 상수를 사용하여 로딩 함수에서 처리.

---

## 2. 커밋 상세

### Commit 1: `9a58a7743` — 상수 rename + legacy alias

**`refactor(extensions): rename extension config constants to didim with legacy aliases`**

| 파일                                 | 변경                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `cli/config/extensions/variables.ts` | 상수값 변경 + `LEGACY_EXTENSIONS_CONFIG_FILENAME`, `LEGACY_INSTALL_METADATA_FILENAME` 추가 |
| `a2a-server/config/extension.ts`     | 동일 패턴 적용                                                                             |
| `core/config/storage.ts`             | `getExtensionsConfigPath()` 파일명 `'didim-extension.json'`                                |

```typescript
// packages/cli/src/config/extensions/variables.ts
export const EXTENSIONS_CONFIG_FILENAME = 'didim-extension.json';
export const INSTALL_METADATA_FILENAME = '.didim-extension-install.json';
/** @deprecated Use EXTENSIONS_CONFIG_FILENAME */
export const LEGACY_EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json';
/** @deprecated Use INSTALL_METADATA_FILENAME */
export const LEGACY_INSTALL_METADATA_FILENAME =
  '.gemini-extension-install.json';
```

### Commit 2: `1849b7680` — 읽기 fallback 4곳

**`feat(extensions): add gemini-extension.json fallback in config loaders`**

| 파일                              | 함수                  | 변경                              |
| --------------------------------- | --------------------- | --------------------------------- |
| `cli/config/extension-manager.ts` | `loadExtensionConfig` | primaryPath → legacyPath fallback |
| `cli/config/extension.ts`         | `loadInstallMetadata` | primaryPath → legacyPath fallback |
| `a2a-server/config/extension.ts`  | `loadExtension`       | primaryPath → legacyPath fallback |
| `a2a-server/config/extension.ts`  | `loadInstallMetadata` | primaryPath → legacyPath fallback |

공통 패턴:

```typescript
const primaryPath = path.join(extensionDir, EXTENSIONS_CONFIG_FILENAME);
const legacyPath = path.join(extensionDir, LEGACY_EXTENSIONS_CONFIG_FILENAME);
const configFilePath = fs.existsSync(primaryPath) ? primaryPath : legacyPath;
```

### Commit 3: `82cc42b08` — 쓰기/생성 + UI + 템플릿 + 환경변수

**`feat(extensions): update creation, UI messages, templates, and env var to didim`**

| 파일                                  | 변경                                                                  |
| ------------------------------------- | --------------------------------------------------------------------- |
| `cli/commands/extensions/new.ts`      | 하드코딩 제거, `EXTENSIONS_CONFIG_FILENAME` import 사용               |
| `cli/commands/extensions/validate.ts` | 에러 메시지 `didim-extension.json`                                    |
| `cli/config/extension.ts`             | JSDoc `gemini-extension.json` → `didim-extension.json`                |
| `a2a-server/config/extension.ts`      | JSDoc 동일 변경                                                       |
| `examples/*/gemini-extension.json`    | `git mv` → `didim-extension.json` (6개 템플릿)                        |
| `examples/mcp-server/README.md`       | 참조 파일명 업데이트                                                  |
| `cli/config/trustedFolders.ts`        | `DIDIM_CLI_TRUSTED_FOLDERS_PATH` ?? `GEMINI_CLI_TRUSTED_FOLDERS_PATH` |

환경변수 패턴:

```typescript
// getTrustedFoldersReadPath / getTrustedFoldersWritePath
const envPath =
  process.env['DIDIM_CLI_TRUSTED_FOLDERS_PATH'] ??
  process.env['GEMINI_CLI_TRUSTED_FOLDERS_PATH'];
```

### Commit 4: `424e0d7b2` — 테스트 fixture 업데이트

**`test(extensions): update extension filename fixtures to didim-extension.json`**

| 파일                                           | 변경 내용                                                  |
| ---------------------------------------------- | ---------------------------------------------------------- |
| `cli/config/extension.test.ts`                 | 파일명 문자열 + `LEGACY_EXTENSIONS_CONFIG_FILENAME` import |
| `cli/config/extension-manager-scope.test.ts`   | 파일명 문자열                                              |
| `cli/services/FileCommandLoader.test.ts`       | 파일명 문자열 (7개소)                                      |
| `cli/commands/extensions/validate.test.ts`     | 에러 메시지 문자열                                         |
| `cli/config/trustedFolders.test.ts`            | `GEMINI_CLI_*` → `DIDIM_CLI_*` 환경변수                    |
| `core/config/storage.test.ts`                  | `getExtensionsConfigPath` fallback 기대값                  |
| `integration-tests/extensions-install.test.ts` | 파일명 문자열                                              |
| `integration-tests/extensions-reload.test.ts`  | 파일명 문자열                                              |

---

## 3. 수정 과정에서 발견된 이슈

### 3.1 `replace_all` LEGACY 상수 오염

`replace_all`로 a2a-server/extension.ts의 JSDoc `gemini-extension.json` →
`didim-extension.json` 치환 시,
`LEGACY_EXTENSIONS_CONFIG_FILENAME = 'gemini-extension.json'` 상수값까지 의도치
않게 변경됨. 수동 복원 처리.

**교훈**: `replace_all` 사용 시 LEGACY 상수의 원본값이 치환 대상과 동일한 경우
부작용 발생. 개별 `old_string` 매칭 사용 권장.

### 3.2 storage.test.ts fallback 기대값

`getExtensionsConfigPath()`가 `resolveReadPath`를 경유하므로, `.didim` 미존재 시
`.gemini/extensions/didim-extension.json`을 반환 (디렉토리 prefix만 swap,
파일명은 유지). 테스트 기대값을 이에 맞게 수정.

### 3.3 extension.test.ts 에러 경로

`didim-extension.json`과 `gemini-extension.json` 모두 부재 시, 에러 메시지에
legacyPath가 노출됨 (마지막으로 확인한 경로). 테스트에서
`LEGACY_EXTENSIONS_CONFIG_FILENAME` import하여 기대값 일치 처리.

### 3.4 new.ts import 경로

`new.ts`의 위치가 `commands/extensions/`이므로
`variables.ts`(`config/extensions/`) 접근 시
`'../../config/extensions/variables.js'` 상대 경로 필요. 초기 `'./variables.js'`
설정 오류 수정.

---

## 4. 테스트 결과

| 패키지     | 파일 수 | 통과  | 실패 | 비고                               |
| ---------- | ------- | ----- | ---- | ---------------------------------- |
| core       | 281     | 5,390 | 0    |                                    |
| a2a-server | 12      | 102   | 0    |                                    |
| cli        | 351     | 4,540 | 7    | 전부 pre-existing (git stash 검증) |

Pre-existing 실패 7건: `config.integration.test.ts` (getWorkingDir),
`restoreNonGeminiEnvVars.test.ts`, `mcp.test.ts`, `config.test.ts`,
`skills-backward-compatibility.test.ts`, `list.test.ts`

### 잔존 gemini 참조 검증

`find` 명령으로 `gemini-extension-install`, `GEMINI_CLI_TRUSTED_FOLDERS_PATH`
잔존 검색 결과, 모든 참조가 의도적:

- **LEGACY 상수**: `variables.ts`, `a2a-server/extension.ts`,
  `trustedFolders.ts`
- **빌드 산출물**: `dist/`, `bundle/` (소스 변경 후 재빌드 시 자동 반영)
- **문서**: 향후 Phase 문서 업데이트에서 처리

---

## 5. Phase 3 완료 요약

Phase 3 전체 작업 (5개 세션, 11커밋):

| 세션                   | 커밋 수 | 주요 내용                                                         |
| ---------------------- | ------- | ----------------------------------------------------------------- |
| 사용자 메시지 + 테스트 | 3       | logger tidy, UX 문자열 4곳, .gitignore, 테스트 fixture 24파일     |
| a2a-server fallback    | 2       | settings.ts fallback, config.ts env dual-path + homedir 버그 수정 |
| Extension 파일명 전환  | 4       | 상수 rename, 읽기 fallback, 쓰기/UI/템플릿/env, 테스트 fixture    |
| 문서 업데이트          | 2       | 작업 이력 + todolist                                              |

**Phase 3 Definition of Done**:

- [x] 사용자 메시지 `.didim` 기준 업데이트
- [x] `.gitignore` `.didim/` 패턴 추가
- [x] 테스트 fixture 경로 `.didim` 기준 (24+8 파일)
- [x] a2a-server settings/env fallback + homedir 버그 수정
- [x] Extension 파일명 `didim-extension.json` 전환 + fallback
- [x] 환경변수 `DIDIM_CLI_TRUSTED_FOLDERS_PATH` 우선 + legacy alias
- [x] 전체 테스트 통과 (pre-existing 제외)
- [x] typecheck / lint 0 errors
