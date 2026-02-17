# Phase 3 (부분): a2a-server settings/env `.gemini` fallback + homedir 버그 수정

> **작업일**: 2026-02-16 **브랜치**: `v0.1.2/white_labelling` **범위**:
> a2a-server settings.ts, config.ts **선행**: Phase 3 사용자 메시지 + 테스트
> fixture 완료

---

## 1. 설계 결정사항

### 1.1 a2a-server 특수성

a2a-server는 Core의 `Storage` 클래스를 사용하지 않고 `GEMINI_DIR` 상수를 직접
조합하여 경로를 구성한다. Phase 1에서 `GEMINI_DIR = DIDIM_DIR = '.didim'`으로
변경했으므로 기본 경로는 자동 반영되지만, 기존 `.gemini/` 디렉토리를 사용하는
사용자를 위한 **fallback 읽기**가 누락되어 있었다.

### 1.2 커밋 전략 — 기능 단위 2커밋

| 커밋     | 유형       | 범위                                        |
| -------- | ---------- | ------------------------------------------- |
| Commit 1 | BEHAVIORAL | settings.ts fallback + 테스트 3건 추가      |
| Commit 2 | BEHAVIORAL | config.ts env dual-path + homedir 버그 수정 |

### 1.3 기존 버그 발견 및 수정

`config.ts:201`의 홈 fallback에서 `process.cwd()` 사용:

```typescript
// 수정 전 (버그)
const homeGeminiEnvPath = path.join(process.cwd(), GEMINI_DIR, '.env');
// 수정 후
const homeDidimEnvPath = path.join(homedir(), GEMINI_DIR, '.env');
```

주석은 "check .env under home as fallback"이지만 `process.cwd()`는 CWD이며 홈이
아님. CLI 정상 구현(`packages/cli/src/config/settings.ts:390`)을 참조하여
`homedir()` 사용으로 교정.

---

## 2. 커밋 상세

### Commit 1: `a3b18f4ca` — settings.ts fallback

**`feat(a2a-server): add .gemini fallback in settings loader`**

| 파일               | 변경                                                                              |
| ------------------ | --------------------------------------------------------------------------------- |
| `settings.ts`      | `LEGACY_GEMINI_DIR` import, `LEGACY_USER_SETTINGS_PATH` 추가                      |
| `settings.ts`      | user settings: `.didim` 우선, `.gemini` fallback                                  |
| `settings.ts`      | workspace settings: `.didim` 우선, `.gemini` fallback                             |
| `settings.test.ts` | `GEMINI_DIR` mock `.gemini` → `.didim`, `LEGACY_GEMINI_DIR` 추가                  |
| `settings.test.ts` | 3개 fallback 테스트 추가 (`.gemini` only, workspace fallback, 양쪽 존재 우선순위) |

---

### Commit 2: `032827a44` — config.ts env dual-path + 버그 수정

**`feat(a2a-server): add .gemini fallback in env loader and fix homedir bug`**

| 파일             | 변경                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| `config.ts`      | `LEGACY_GEMINI_DIR` import                                                   |
| `config.ts`      | `findEnvFile()`: 각 디렉토리에서 `.didim/.env` 우선, `.gemini/.env` fallback |
| `config.ts`      | 홈 fallback: `process.cwd()` → `homedir()` 버그 수정                         |
| `config.test.ts` | `GEMINI_DIR` mock `.gemini` → `.didim`, `LEGACY_GEMINI_DIR` 추가             |

---

## 3. 품질 게이트

| 항목                 | 결과                                 |
| -------------------- | ------------------------------------ |
| a2a-server 테스트    | 12 files, **102 passed**, 0 failed   |
| Core 테스트          | 281 files, **5390 passed**, 0 failed |
| CLI 테스트           | 351 files, **4758 passed**, 0 failed |
| TypeScript typecheck | 0 errors (a2a-server)                |
| Pre-commit hooks     | 2/2 커밋 모두 통과                   |

---

## 4. Phase 3 잔여 항목

| 항목                                             | 상태         | 비고                              |
| ------------------------------------------------ | ------------ | --------------------------------- |
| Extensions 파일명 결정 (`gemini-extension.json`) | ⬜ 결정 필요 | 유지 vs `didim-extension.json`    |
| `.gemini-extension-install.json` 파일명          | ⬜ 결정 필요 | 변경 시 기존 설치 데이터 fallback |
| `GEMINI_CLI_TRUSTED_FOLDERS_PATH` env var        | ⬜ 결정 필요 | 유지 또는 alias 추가              |
| VS Code extension ID                             | ⬜           | 마켓플레이스 ID, 변경 불가        |

---

## 5. Lessons Learned

- **a2a-server Storage 미사용**: Core의 `Storage` resolver를 사용하지 않으므로
  fallback 로직을 별도 구현해야 한다. `GEMINI_DIR` 상수 변경만으로는 기존 사용자
  호환이 보장되지 않는다.
- **process.cwd() vs homedir()**: 기존 코드의 "home fallback" 주석과 실제 코드
  불일치 — 코드 리뷰 시 주석과 구현의 일관성 확인 필수.
- **테스트 mock 경로 동기화**: `GEMINI_DIR` mock을 `.gemini`에서 `.didim`으로
  변경 시, 테스트 내 디렉토리 생성/정리 코드도 동기화 필요.
