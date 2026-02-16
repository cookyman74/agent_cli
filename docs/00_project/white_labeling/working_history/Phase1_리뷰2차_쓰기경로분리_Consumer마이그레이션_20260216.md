# Phase 1 리뷰 이슈 2차 수정 — 쓰기 경로 분리 + Consumer 마이그레이션

> **작업일**: 2026-02-16 **작업자**: Claude (Opus 4.6) **브랜치**:
> `v0.1.2/white_labelling` **커밋 1**: `c4ffd2e21` (STRUCTURAL) **커밋 2**:
> `00d641fd1` (BEHAVIORAL) **선행 작업**: `734680c9c` (Phase 1 리뷰 1차 —
> file-level resolver) **참조**:
> `docs/00_project/white_labeling/todolist/gemini_to_didim_20260215_todolist.md`

---

## 1. 작업 배경

Phase 1 리뷰 1차(`734680c9c`)에서 `resolveReadPath` 도입 및 Storage read 메서드
file-level 전환은 완료됐으나, 2차 리뷰에서 **쓰기 경로가 여전히 read resolver
기반**인 문제가 4건 제기됨.

핵심 원칙: **읽기는 .didim→.gemini fallback, 쓰기는 항상 .didim**

---

## 2. 리뷰 이슈 요약

| #   | Finding                           | 심각도 | 내용                                                       |
| --- | --------------------------------- | ------ | ---------------------------------------------------------- |
| F1  | settings save가 read-path 기반    | HIGH   | `USER_SETTINGS_PATH`/`workspaceSettingsPath`가 save에 사용 |
| F2  | `getGlobalGeminiDir()` 우회 4개소 | HIGH   | 디렉토리 단위 resolve, file-level fallback 미적용          |
| F3  | read-path resolver로 쓰기 9개소   | MEDIUM | legacy 파일 존재 시 legacy로 계속 write                    |
| F4  | trustedFolders fallback 미적용    | MEDIUM | `.didim` 고정, `.gemini/trustedFolders.json` 미인식        |

---

## 3. 변경 파일 목록

### Commit 1: STRUCTURAL (동작 변경 없음)

| #   | 파일                                       | 변경 유형   | 내용                                     |
| --- | ------------------------------------------ | ----------- | ---------------------------------------- |
| 1   | `packages/core/src/config/storage.ts`      | 메서드 추가 | `getGlobalWritePath()`, `getWritePath()` |
| 2   | `packages/core/src/config/storage.test.ts` | 테스트 추가 | 신규 메서드 3건                          |

### Commit 2: BEHAVIORAL (Consumer 마이그레이션)

| #   | 파일                                                      | Finding | 변경 유형                       |
| --- | --------------------------------------------------------- | ------- | ------------------------------- |
| 1   | `packages/cli/src/config/settings.ts`                     | F1      | save path → write-path 전환     |
| 2   | `packages/core/src/tools/memoryTool.ts`                   | F2      | read/write 경로 분리            |
| 3   | `packages/cli/src/utils/persistentState.ts`               | F2      | read/write 경로 분리            |
| 4   | `packages/cli/src/config/mcp/mcpServerEnablement.ts`      | F2      | read/write 경로 분리            |
| 5   | `packages/core/src/hooks/trustedHooks.ts`                 | F2      | read/write 경로 분리            |
| 6   | `packages/core/src/mcp/oauth-token-storage.ts`            | F3      | write 시 `getGlobalWritePath()` |
| 7   | `packages/core/src/utils/installationManager.ts`          | F3      | write 시 `getGlobalWritePath()` |
| 8   | `packages/core/src/utils/userAccountManager.ts`           | F3      | write 시 `getGlobalWritePath()` |
| 9   | `packages/core/src/code_assist/oauth2.ts`                 | F3      | write 시 `getGlobalWritePath()` |
| 10  | `packages/cli/src/config/trustedFolders.ts`               | F4      | read fallback + write 경로 분리 |
| 11  | `packages/core/src/hooks/trustedHooks.test.ts`            | —       | mock 갱신                       |
| 12  | `packages/core/src/mcp/oauth-token-storage.test.ts`       | —       | mock 갱신                       |
| 13  | `packages/cli/src/utils/persistentState.test.ts`          | —       | mock 전면 재작성                |
| 14  | `packages/cli/src/config/mcp/mcpServerEnablement.test.ts` | —       | mock 갱신                       |
| 15  | `packages/cli/src/config/trustedFolders.test.ts`          | —       | mock 갱신                       |
| 16  | `packages/cli/src/config/extension.test.ts`               | —       | Proxy 패턴 mock 적용            |

---

## 4. 상세 변경 내용

### 4.1 Commit 1 — Storage write-path 헬퍼

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

### 4.2 Finding 1 — settings.ts (save path 전환)

```typescript
// Before: read-path 기반 (legacy 있으면 legacy에 쓰기)
{ path: USER_SETTINGS_PATH, ... }
{ path: workspaceSettingsPath, ... }

// After: write-path 기반 (항상 .didim에 쓰기)
{ path: Storage.getGlobalWriteSettingsPath(), ... }
{ path: new Storage(workspaceDir).getWriteSettingsPath(), ... }
```

### 4.3 Finding 2 — 4파일 (getGlobalGeminiDir → read/write 분리)

공통 패턴: 단일 path 필드 → `getReadPath()` / `getWritePath()` 메서드 분리

| 파일                   | Before                                     | After (read)                                 | After (write)                                |
| ---------------------- | ------------------------------------------ | -------------------------------------------- | -------------------------------------------- |
| memoryTool.ts          | `Storage.getGlobalGeminiDir()`             | `resolveReadPath(homedir(), filename)`       | `Storage.getGlobalWritePath(filename)`       |
| persistentState.ts     | `Storage.getGlobalGeminiDir()` + 캐시 필드 | `resolveReadPath(homedir(), STATE_FILENAME)` | `Storage.getGlobalWritePath(STATE_FILENAME)` |
| mcpServerEnablement.ts | `configDir` + `configFilePath` 필드        | `resolveReadPath(homedir(), FILENAME)`       | `Storage.getGlobalWritePath(FILENAME)`       |
| trustedHooks.ts        | `configPath` 필드                          | `resolveReadPath(homedir(), FILENAME)`       | `Storage.getGlobalWritePath(FILENAME)`       |

### 4.4 Finding 3 — 4파일 (read-path → write-path)

공통 패턴: 단일 getter → readPath / writePath 분리

| 파일                   | read 호출자                                               | write 호출자                                            |
| ---------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| oauth-token-storage.ts | `getAllCredentials()`                                     | `setCredentials()`, `deleteCredentials()`, `clearAll()` |
| installationManager.ts | `readInstallationIdFromFile()`                            | `writeInstallationIdToFile()`                           |
| userAccountManager.ts  | `getCachedGoogleAccount()`, `getLifetimeGoogleAccounts()` | `cacheGoogleAccount()`, `clearCachedGoogleAccount()`    |
| oauth2.ts              | `getCachedCredentials()`                                  | `cacheCredentials()`, `clearCachedCredentialFile()`     |

### 4.5 Finding 4 — trustedFolders.ts

```typescript
// Before: .didim 고정, .gemini fallback 없음
export function getTrustedFoldersPath(): string {
  return path.join(getUserSettingsDir(), TRUSTED_FOLDERS_FILENAME);
}

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

`loadTrustedFolders()`: read 시 `getTrustedFoldersReadPath()`, 파일 객체의
path는 `getTrustedFoldersWritePath()` 설정.

---

## 5. 테스트 수정 상세 (6파일)

### 5.1 trustedHooks.test.ts (core)

- `Storage.getGlobalGeminiDir` mock → `resolveReadPath` +
  `Storage.getGlobalWritePath` mock
- `../utils/paths.js` mock 추가 (`homedir` 제공)

### 5.2 oauth-token-storage.test.ts (core)

- Storage mock에 `getGlobalWritePath: vi.fn()` 추가

### 5.3 persistentState.test.ts (cli)

- mock 전면 재작성: `resolveReadPath`, `homedir`, `Storage.getGlobalWritePath`
  추가
- read/write 분리: `mockReadPath` / `mockWritePath` 상수 분리
- ESLint `import/no-duplicates` 경고 해소 (중복 import 병합)

### 5.4 mcpServerEnablement.test.ts (cli)

- `@didim365/agent-cli-core` mock에 `homedir`, `resolveReadPath`,
  `Storage.getGlobalWritePath` 추가

### 5.5 trustedFolders.test.ts (cli)

- `@didim365/agent-cli-core` mock에 `resolveReadPath`,
  `Storage.getGlobalWritePath` 추가
- 순환 호출 문제 해소 (기존 mock이 `getTrustedFoldersPath()` 호출 → 무한 재귀)

### 5.6 extension.test.ts (cli) — 가장 복잡

**문제**: CLI 테스트는 `@didim365/agent-cli-core`를 compiled dist에서 import.
`vi.mock('os')`가 dist 내부 `os.homedir()` closure에 영향 못 줌. →
`Storage.getGlobalWritePath()`가 실제 홈 경로 반환.

**1차 시도 (실패)**: `...actual.Storage` spread → class static method 소실
(`getGlobalSettingsPath is not a function`)

**2차 시도 (성공)**: `Proxy` 패턴으로 `getGlobalWritePath`만 intercept

```typescript
Storage: new Proxy(actual.Storage, {
  get(target, prop, receiver) {
    if (prop === 'getGlobalWritePath') {
      return (...subPaths: string[]) => {
        const home = mockHomedir();
        return [home, '.didim', ...subPaths].join('/');
      };
    }
    return Reflect.get(target, prop, receiver);
  },
}),
```

---

## 6. 테스트 결과

### 6.1 Core 테스트

```
Test Files  281 passed (281)
     Tests  5380 passed | 24 skipped (5404)
```

### 6.2 CLI 테스트

```
Test Files  345 passed | 6 failed (351)  ← 6건 모두 pre-existing
     Tests  4751 passed | 7 failed | 2 skipped (4760)
```

Pre-existing 실패 (본 작업과 무관):

- `initCommand.test.ts` (2): GEMINI.md → AGENTS.md 이름 불일치
- `modelCommand.test.ts` (1): description 문자열 불일치
- `skillUtils.test.ts` (1): extension install flow
- `extensions/install.test.ts` (1): 한국어 locale 에러 메시지
- `extensions/validate.test.ts` (1): 한국어 locale 에러 메시지
- `commands/mcp.test.ts` (1): help text 불일치

### 6.3 Quality Gates

| Gate             | 결과                                 |
| ---------------- | ------------------------------------ |
| Core tests       | ✅ 281 files, 5380 passed            |
| CLI tests        | ✅ 345 files passed (6 pre-existing) |
| TypeScript       | ✅ 0 errors                          |
| ESLint (core)    | ✅ 0 errors                          |
| ESLint (cli)     | ✅ 0 errors                          |
| pre-commit hooks | ✅ prettier + eslint 통과 (2회)      |

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

## 8. 작업 과정 (Tidy First)

### Commit 1: STRUCTURAL (`c4ffd2e21`)

- `Storage.getGlobalWritePath()`, `Storage.getWritePath()` 헬퍼 추가
- 테스트 3건 추가
- **동작 변경 없음** — 아직 호출자 없음

### Commit 2: BEHAVIORAL (`00d641fd1`)

1. 12개 소스 파일 consumer 마이그레이션 (F1~F4 전체)
2. 6개 테스트 파일 mock 갱신
3. Quality gates 전체 통과

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

---

## 10. 변경하지 않은 항목

| 파일                     | 이유                                  |
| ------------------------ | ------------------------------------- |
| `prompts.ts:90`          | opt-in via env var, 비활성 기본값     |
| `memoryDiscovery.ts`     | graceful try/catch, 미존재 시 빈 결과 |
| Storage read-only 메서드 | 쓰기에 사용되지 않음                  |

---

## 11. 커밋 정보

```
Commit 1 (STRUCTURAL):
  커밋:    c4ffd2e21
  메시지:  refactor(config): Storage write-path 헬퍼 추가 — getGlobalWritePath, getWritePath
  파일:    2 files changed, 64 insertions(+)

Commit 2 (BEHAVIORAL):
  커밋:    00d641fd1
  메시지:  fix(config): Phase 1 리뷰 이슈 2차 — 쓰기 경로 분리 + consumer 마이그레이션
  파일:    16 files changed, 184 insertions(+), 91 deletions(-)

브랜치:  v0.1.2/white_labelling
```
