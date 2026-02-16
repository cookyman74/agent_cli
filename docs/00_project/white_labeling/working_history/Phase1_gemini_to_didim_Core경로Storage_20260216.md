# Phase 1: Core 경로 상수/Storage 전환 — 작업 결과서

> **작업일**: 2026-02-16 **작업자**: Claude (Opus 4.6) **브랜치**:
> `v0.1.2/white_labelling` **커밋**: `5f5b5f0d4` **참조**:
> `docs/00_project/white_labeling/todolist/gemini_to_didim_20260215_todolist.md`
> Phase 1

---

## 1. 작업 목표

`.gemini` → `.didim` 전환의 첫 단계로, Core 패키지의 경로 상수(`paths.ts`)와
Storage API(`storage.ts`)에 읽기/쓰기 분리 resolver를 도입한다.

- **읽기**: `.didim` 우선, `.gemini` fallback (기존 사용자 호환)
- **쓰기**: 항상 `.didim` (신규 데이터는 새 경로에만 기록)
- **설계**: A안 확정 — `resolveReadDir` / `resolveWriteDir` 분리

---

## 2. 변경 파일 목록

| #   | 파일                                                  | 변경 유형        | 내용                                                                                            |
| --- | ----------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| 1   | `packages/core/src/utils/paths.ts`                    | 상수 추가        | `DIDIM_DIR`, `LEGACY_GEMINI_DIR`, `GEMINI_DIR` @deprecated alias                                |
| 2   | `packages/core/src/config/storage.ts`                 | 함수/메서드 추가 | `resolveReadDir`, `resolveWriteDir`, `getGlobalWriteDir`, `getWriteDir` + 기존 메서드 배선 변경 |
| 3   | `packages/core/src/config/storage.test.ts`            | 테스트 추가      | resolver 6건, write 4건, read fallback 4건 (14건 신규)                                          |
| 4   | `packages/core/src/policy/config.test.ts`             | 회귀 수정        | `.gemini/policies` → `.didim/policies` (5개소)                                                  |
| 5   | `packages/core/src/tools/memoryTool.test.ts`          | 회귀 수정        | fs mock에 `existsSync` 추가                                                                     |
| 6   | `packages/core/src/utils/getFolderStructure.test.ts`  | 회귀 수정        | gitignore/geminiignore 패턴 `.gemini` → `.didim` (3개소)                                        |
| 7   | `packages/core/src/utils/installationManager.test.ts` | 회귀 수정        | `existsSync` mockReturnValueOnce 2단계로 확장 (resolveReadDir + file check)                     |

---

## 3. 상세 변경 내용

### 3.1 paths.ts — 경로 상수

```typescript
// Before
export const GEMINI_DIR = '.gemini';

// After
export const DIDIM_DIR = '.didim';
export const LEGACY_GEMINI_DIR = '.gemini';
/** @deprecated Use DIDIM_DIR instead */
export const GEMINI_DIR = DIDIM_DIR;
```

- `GEMINI_DIR`는 `DIDIM_DIR`의 alias로 유지 → 기존 import 코드 변경 불필요
- `LEGACY_GEMINI_DIR`는 resolver 전용 (fallback 경로 조합에 사용)

### 3.2 storage.ts — Resolver 함수

```typescript
export function resolveReadDir(base: string): string {
  const primary = path.join(base, DIDIM_DIR);
  if (fs.existsSync(primary)) return primary;
  const legacy = path.join(base, LEGACY_GEMINI_DIR);
  if (fs.existsSync(legacy)) return legacy;
  return primary; // 둘 다 없으면 .didim (새 사용자)
}

export function resolveWriteDir(base: string): string {
  return path.join(base, DIDIM_DIR); // 항상 .didim
}
```

### 3.3 storage.ts — Storage 메서드 변경

| 메서드                    | 변경 전                                 | 변경 후                           | 용도            |
| ------------------------- | --------------------------------------- | --------------------------------- | --------------- |
| `getGlobalGeminiDir()`    | `path.join(homeDir, GEMINI_DIR)`        | `resolveReadDir(homeDir)`         | 읽기 (fallback) |
| `getGeminiDir()`          | `path.join(this.targetDir, GEMINI_DIR)` | `resolveReadDir(this.targetDir)`  | 읽기 (fallback) |
| **`getGlobalWriteDir()`** | (신규)                                  | `resolveWriteDir(homeDir)`        | 쓰기 전용       |
| **`getWriteDir()`**       | (신규)                                  | `resolveWriteDir(this.targetDir)` | 쓰기 전용       |
| `getGlobalTempDir()`      | `Storage.getGlobalGeminiDir()`          | `Storage.getGlobalWriteDir()`     | 쓰기 전용       |
| `getHistoryDir()`         | `Storage.getGlobalGeminiDir()`          | `Storage.getGlobalWriteDir()`     | 쓰기 전용       |

### 3.4 회귀 테스트 수정 (4파일)

`resolveReadDir`이 `fs.existsSync`를 호출하면서 기존 테스트에 영향:

1. **config.test.ts**: Mock 경로에 `.gemini/policies` 하드코딩 →
   `.didim/policies`로 변경
2. **memoryTool.test.ts**: fs mock에 `existsSync` export 누락 → 추가
3. **getFolderStructure.test.ts**: gitignore/geminiignore 콘텐츠의 `.gemini/*`
   패턴이 `.didim/` 디렉토리와 불일치 → `.didim/*`로 변경
4. **installationManager.test.ts**: `mockReturnValueOnce(true)` 1회 → 2회로 확장
   (resolveReadDir + 실제 파일 체크)

---

## 4. 테스트 결과

### 4.1 Storage 테스트 (storage.test.ts)

| 테스트 그룹                                       | 테스트 수 | 상태            |
| ------------------------------------------------- | --------- | --------------- |
| 기존 테스트 (getGlobalGeminiDir, getGeminiDir 등) | 14        | ✅ Pass         |
| resolveReadDir                                    | 4         | ✅ Pass         |
| resolveWriteDir                                   | 2         | ✅ Pass         |
| Storage – write methods                           | 4         | ✅ Pass         |
| Storage – read fallback                           | 4         | ✅ Pass         |
| **합계**                                          | **28**    | **✅ All Pass** |

### 4.2 전체 Core 테스트

```
Test Files  281 passed (281)
     Tests  5362 passed | 24 skipped (5386)
  Duration  31.29s
```

### 4.3 Quality Gates

| Gate                      | 결과                                |
| ------------------------- | ----------------------------------- |
| Unit tests (core)         | ✅ 281 files, 5362 passed, 0 failed |
| TypeScript (core)         | ✅ tsc --noEmit: 0 errors           |
| ESLint (core)             | ✅ 0 errors                         |
| TypeScript (full project) | ✅ 0 errors                         |
| pre-commit hooks          | ✅ prettier + eslint 통과           |
| 회귀 없음                 | ✅ 확인 (git stash 비교 검증)       |

---

## 5. 작업 과정 (TDD + Tidy First)

### Step 1: STRUCTURAL — 상수 추가 (동작 변경 없음)

- `paths.ts`에 `DIDIM_DIR`, `LEGACY_GEMINI_DIR` 추가
- `GEMINI_DIR = DIDIM_DIR` alias로 변경
- `storage.ts` import 업데이트
- 기존 14/14 테스트 통과 (GEMINI_DIR 상수 기반 assertion 자동 적응)

### Step 2: RED — 실패 테스트 작성

- `resolveReadDir`, `resolveWriteDir` 스텁 함수 추가
- `getGlobalWriteDir()`, `getWriteDir()` 스텁 메서드 추가
- 14건 신규 테스트 작성
- 3건 실패 확인 (RED): resolveReadDir fallback, getGlobalGeminiDir fallback,
  getGeminiDir fallback

### Step 3: GREEN — resolver 구현 + Storage 배선

- `resolveReadDir` fs.existsSync 로직 구현
- `getGlobalGeminiDir()` → `resolveReadDir(homeDir)` 배선
- `getGeminiDir()` → `resolveReadDir(this.targetDir)` 배선
- Write-only 메서드 배선: `getGlobalTempDir()`, `getHistoryDir()` →
  `getGlobalWriteDir()`
- 28/28 테스트 통과 (GREEN)

### Step 4: Post-work — Quality Gates + 회귀 수정

- ESLint arrow-body-style 6건 수정
- 전체 core 테스트에서 10건 실패 발견 (4파일)
- 원인 분석: `resolveReadDir`의 `fs.existsSync` 도입으로 mock 불일치
- 4파일 회귀 수정 → 281 files, 5362 passed

---

## 6. 설계 결정 사항

### A안 확정: 읽기/쓰기 resolver 분리

| 항목                    | 결정                                                                           |
| ----------------------- | ------------------------------------------------------------------------------ |
| 읽기 resolver           | `resolveReadDir(base)` — .didim 우선, .gemini fallback                         |
| 쓰기 resolver           | `resolveWriteDir(base)` — 항상 .didim                                          |
| 기존 메서드 호환        | `getGlobalGeminiDir()`, `getGeminiDir()` → resolveReadDir 적용 (메서드명 유지) |
| 메서드명 Tidy           | Phase 후반으로 연기 (`getGlobalConfigDir()` 등)                                |
| B안 (write-site 치환)   | 기각 — 누락 위험 높음                                                          |
| C안 (자동 마이그레이션) | 기각 — 복잡도 높음                                                             |

---

## 7. 알려진 제한 / 후속 작업

### Phase 1에서 미처리 (Phase 2~3에서 해결)

1. **Storage 미사용 파일의 fallback 미적용**: `file-token-storage.ts`,
   `trustedFolders.ts`, `memoryDiscovery.ts`는 `GEMINI_DIR` 직접 조합 → 상수
   변경으로 `.didim` 자동 반영되나, fallback resolver 미적용 (Phase 3에서 개별
   resolver 적용 예정)

2. **하드코딩 17개소 미수정**: 샌드박스 .sb 6개, 정책 TOML regex, Telemetry
   sanitize 패턴 등은 Phase 3 기능군별 전환에서 처리

3. **메서드명 Tidy 연기**: `getGlobalGeminiDir()` → `getGlobalConfigDir()` 등의
   이름 변경은 Phase 후반에서 일괄 결정

4. **`.geminiignore` 전환**: Phase 2.4에서 `.didimignore` 우선 + fallback 로직
   구현 예정

---

## 8. 커밋 정보

```
커밋:    5f5b5f0d4
브랜치:  v0.1.2/white_labelling
메시지:  feat(config): .gemini → .didim 경로 전환 Phase 1 — Core 상수/Storage resolver
파일:    7 files changed, 212 insertions(+), 34 deletions(-)
```
