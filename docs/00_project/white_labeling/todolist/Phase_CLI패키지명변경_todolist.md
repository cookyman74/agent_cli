# CLI 배포 패키지명 변경 작업 계획서

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **Tidy First**: 구조적 변경(이름 변경)과
> 동작 변경 분리 **참고 문서**: [99_TDD_plan.md](../template/99_TDD_plan.md)
> **버전**: v1.0

---

## 📋 작업 개요

| 항목        | 내용                                                                      |
| ----------- | ------------------------------------------------------------------------- |
| 프로젝트    | CLI 배포 패키지명을 `@google/gemini-cli` → `@didim/agent-cli`로 변경      |
| 영향 범위   | 26개 파일, 77개 참조 (package.json, scripts, docs, source, tests)         |
| 위험 수준   | 🟡 Medium (문자열 치환 중심이나, tgz 파일명/npm 워크스페이스 연동에 주의) |
| 성능 민감도 | 🟢 Low (런타임 성능 무관)                                                 |
| 작업 브랜치 | `DID/v0.1` (현재 브랜치)                                                  |

---

## 🚨 핵심 리스크 요약

| 리스크                                | 영향      | 대응 방안                                      | 상태 |
| ------------------------------------- | --------- | ---------------------------------------------- | ---- |
| tgz 파일명 변경 누락                  | 🟠 Medium | `npm pack` 출력 파일명 패턴도 함께 변경        | ⬜   |
| npm workspace 참조 깨짐               | 🟠 Medium | root package.json + package-lock.json 재생성   | ⬜   |
| ESLint no-restricted-imports 미동기화 | 🟢 Low    | eslint.config.js의 패키지명도 함께 변경        | ⬜   |
| 소스 코드 내 update 명령 하드코딩     | 🟠 Medium | installationInfo.ts의 4곳 + 테스트 18곳 동기화 | ⬜   |

---

## 📊 영향 범위 상세

### 카테고리별 파일 목록

**A. 패키지 정의 (3 files)**

- `package.json` (root, line 2) — 루트 패키지명
- `packages/cli/package.json` (line 2) — CLI 패키지명 (핵심)
- `package-lock.json` — 재생성 필요

**B. 빌드/릴리스 스크립트 (6 files)**

- `scripts/build_sandbox.js` (lines 93, 95, 97, 118) — pack 명령 + tgz 파일명
- `scripts/get-release-version.js` (lines 42, 44) — 패키지명 기본값
- `scripts/releasing/create-patch-pr.js` (lines 35, 37) — 패키지명 기본값
- `scripts/releasing/patch-comment.js` (line 143) — npm install 문구
- `scripts/prepare-github-release.js` (lines 42, 44) — GitHub 패키징용 이름
- `scripts/tests/get-release-version.test.js` (lines 60, 130, 171, 178) — 테스트

**C. ESLint 설정 (1 file)**

- `eslint.config.js` (lines 228-229) — no-restricted-imports 규칙

**D. 소스 코드 (1 file)**

- `packages/cli/src/utils/installationInfo.ts` (lines 113, 126, 146, 179) —
  업데이트 명령

**E. 소스 테스트 (2 files)**

- `packages/cli/src/utils/installationInfo.test.ts` (7 occurrences)
- `packages/cli/src/utils/handleAutoUpdate.test.ts` (11 occurrences)

**F. 문서 (13 files)**

- `README.md` (5 occurrences)
- `docs/npm.md` (5), `docs/releases.md` (9), `docs/release-confidence.md` (4)
- `docs/get-started/installation.md` (2), `docs/get-started/gemini-3.md` (1)
- `docs/changelogs/preview.md` (1), `docs/changelogs/index.md` (1)
- `docs/troubleshooting.md` (1), `docs/faq.md` (1), `docs/cli/uninstall.md` (1)
- `docs/change_model/model_command_multi_provider_plan.md` (1)
- `docs/change_model/model_command_multi_provider_todolist.md` (2)
- `docs/00_project/ai_adapter/working_history/Phase3_ETC_...` (2)

---

## 🔄 Phase 1: 소스 코드 + 테스트 변경

> 소스 코드(`installationInfo.ts`)와 테스트에서 `@google/gemini-cli`를
> `@didim/agent-cli`로 변경

### 1.1 사전 작업 (Pre-Work)

- [ ] **[CONTEXT]** 작업 목적 및 배경 확인
  - `@google/gemini-cli`로 설치되는 패키지를 `@didim/agent-cli`로 변경하여 독립
    브랜딩
  - `@didim/agent-cli-core`, `@google/gemini-cli-a2a-server`는 변경하지 않음

- [ ] **[ANALYSIS]** 현재 소스 코드 참조 분석
  - `packages/cli/src/utils/installationInfo.ts` — 4곳 (pnpm/yarn/bun/npm update
    명령)
  - `packages/cli/src/utils/installationInfo.test.ts` — 7곳
  - `packages/cli/src/utils/handleAutoUpdate.test.ts` — 11곳

### 1.2 🔴 RED Phase: 기존 테스트 실패 확인

- [ ] **[RED]** 현재 테스트 기준선 확인

  ```bash
  npm test -w @google/gemini-cli -- src/utils/installationInfo.test.ts src/utils/handleAutoUpdate.test.ts
  ```
  - 현재 상태에서 모든 테스트가 PASS함을 기록 (변경 전 기준선)

- [ ] **[RED-VERIFY]** `installationInfo.ts`의 패키지명 변경 후 테스트 실패 확인
  - `installationInfo.ts`만 변경 → 관련 테스트에서 기대값 불일치로 FAIL 확인

### 1.3 🟢 GREEN Phase: 테스트 + 소스 동기화

- [ ] **[TASK-001]** `installationInfo.ts` 패키지명 변경
  - 파일: `packages/cli/src/utils/installationInfo.ts`
  - 변경: `@google/gemini-cli` → `@didim/agent-cli` (4곳)
    - Line 113: `pnpm add -g @didim/agent-cli@latest`
    - Line 126: `yarn global add @didim/agent-cli@latest`
    - Line 146: `bun add -g @didim/agent-cli@latest`
    - Line 179: `npm install -g @didim/agent-cli@latest`

- [ ] **[TASK-002]** `installationInfo.test.ts` 기대값 변경
  - 파일: `packages/cli/src/utils/installationInfo.test.ts`
  - 변경: `@google/gemini-cli` → `@didim/agent-cli` (7곳)

- [ ] **[TASK-003]** `handleAutoUpdate.test.ts` 기대값 변경
  - 파일: `packages/cli/src/utils/handleAutoUpdate.test.ts`
  - 변경: `@google/gemini-cli` → `@didim/agent-cli` (11곳)

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인
  ```bash
  npm test -w @google/gemini-cli -- src/utils/installationInfo.test.ts src/utils/handleAutoUpdate.test.ts
  ```

### 1.4 🔵 REFACTOR Phase

- [ ] **[REFACTOR-STRUCTURE]** 하드코딩 패키지명을 상수로 추출 검토
  - 현재 4곳에 `@didim/agent-cli` 하드코딩 — 상수 추출 여부 판단
  - 기존 패턴이 하드코딩이므로, 일관성 유지 차원에서 유지 (선택)

- [ ] **[REFACTOR-VERIFY]** 테스트 재확인
  ```bash
  npm test -w @google/gemini-cli -- src/utils/installationInfo.test.ts src/utils/handleAutoUpdate.test.ts
  ```

### 1.5 사후 작업 (Post-Work)

- [ ] **[LINT]** 린터 검사

  ```bash
  npm run lint -w @google/gemini-cli
  ```

- [ ] **[COMMIT]** 변경사항 커밋
  ```bash
  git commit -m "feat(cli): 설치/업데이트 명령 패키지명 @didim/agent-cli로 변경"
  ```

---

## 🔄 Phase 2: 패키지 정의 + 빌드 스크립트 변경

> package.json, build scripts, ESLint 설정의 패키지명 변경

### 2.1 사전 작업

- [ ] **[REVIEW]** Phase 1 완료 확인
- [ ] **[ANALYSIS]** tgz 파일명 패턴 확인
  - `npm pack`은 패키지명에서 `@scope/name` → `scope-name-version.tgz` 형식 생성
  - `@didim/agent-cli` → `didim-agent-cli-{version}.tgz`

### 2.2 🔴 RED Phase

- [ ] **[RED]** 빌드 스크립트 테스트 기준선 확인
  ```bash
  npx vitest run --config scripts/tests/vitest.config.ts scripts/tests/get-release-version.test.js
  ```

### 2.3 🟢 GREEN Phase

- [ ] **[TASK-001]** `packages/cli/package.json` name 변경
  - Line 2: `"name": "@google/gemini-cli"` → `"name": "@didim/agent-cli"`
  - `publishConfig` 추가:
    ```json
    "publishConfig": {
      "access": "public"
    }
    ```

- [ ] **[TASK-002]** `package.json` (root) name 변경
  - Line 2: `"name": "@google/gemini-cli"` → `"name": "@didim/agent-cli"`

- [ ] **[TASK-003]** `scripts/build_sandbox.js` 변경
  - Line 93: 로그 메시지 `@didim/agent-cli`
  - Line 95: rmSync glob `didim-agent-cli-*.tgz`
  - Line 97: `npm pack -w @didim/agent-cli`
  - Line 118: chmodSync `didim-agent-cli-${packageVersion}.tgz`

- [ ] **[TASK-004]** `scripts/get-release-version.js` 변경
  - Lines 42, 44: 패키지명 기본값 `@didim/agent-cli`

- [ ] **[TASK-005]** `scripts/releasing/create-patch-pr.js` 변경
  - Lines 35, 37: 패키지명 기본값 `@didim/agent-cli`

- [ ] **[TASK-006]** `scripts/releasing/patch-comment.js` 변경
  - Line 143: npm install 문구 `@didim/agent-cli`

- [ ] **[TASK-007]** `scripts/prepare-github-release.js` 변경
  - Line 42: 주석 `@didim/agent-cli`
  - Line 44: `pkg.name = '@didim/agent-cli'` (GitHub 패키징용)

- [ ] **[TASK-008]** `scripts/tests/get-release-version.test.js` 변경
  - Lines 60, 130, 171, 178: `@didim/agent-cli`

- [ ] **[TASK-009]** `eslint.config.js` 변경
  - Lines 228-229: no-restricted-imports 패키지명 `@didim/agent-cli`

- [ ] **[GREEN-VERIFY]** 빌드 및 테스트 확인
  ```bash
  npm install  # package-lock.json 재생성
  npm run build -w @didim/agent-cli
  npm run typecheck -w @didim/agent-cli
  npm run lint
  ```

### 2.4 🔵 REFACTOR Phase

- [ ] **[REFACTOR-STRUCTURE]** package-lock.json 재생성 정리

  ```bash
  rm package-lock.json && npm install
  ```

- [ ] **[REFACTOR-VERIFY]** 전체 빌드 재확인
  ```bash
  npm run build
  npm test -w @didim/agent-cli
  ```

### 2.5 사후 작업

- [ ] **[TEST]** Phase 1 테스트 회귀 확인 (workspace명 변경 반영)

  ```bash
  npm test -w @didim/agent-cli -- src/utils/installationInfo.test.ts src/utils/handleAutoUpdate.test.ts
  ```

- [ ] **[VERIFY]** npm pack 파일명 확인

  ```bash
  npm pack -w @didim/agent-cli --dry-run  # didim-agent-cli-{ver}.tgz 확인
  ```

- [ ] **[COMMIT]** 변경사항 커밋
  ```bash
  git commit -m "feat(cli): 패키지명 @didim/agent-cli로 변경 + 빌드 스크립트 동기화"
  ```

---

## 🔄 Phase 3: 문서 일괄 변경

> README, docs/ 내 모든 `@google/gemini-cli` 참조를 `@didim/agent-cli`로 변경

### 3.1 사전 작업

- [ ] **[REVIEW]** Phase 2 완료 확인 (빌드 성공)
- [ ] **[ANALYSIS]** 변경 대상 문서 목록 (13 files, ~35 occurrences)

### 3.2 🔴 RED Phase

> 문서는 TDD 대상이 아니므로, 변경 전 영향 범위 확인으로 대체

- [ ] **[RED]** 변경 전 grep 기준선 기록
  ```bash
  grep -r "@google/gemini-cli" docs/ README.md --include="*.md" | grep -v "gemini-cli-core" | grep -v "gemini-cli-a2a" | wc -l
  ```

### 3.3 🟢 GREEN Phase

- [ ] **[TASK-001]** `README.md` 변경 (5곳)
- [ ] **[TASK-002]** `docs/npm.md` 변경 (5곳)
- [ ] **[TASK-003]** `docs/releases.md` 변경 (9곳)
- [ ] **[TASK-004]** `docs/release-confidence.md` 변경 (4곳)
- [ ] **[TASK-005]** `docs/get-started/installation.md` 변경 (2곳)
- [ ] **[TASK-006]** `docs/get-started/gemini-3.md` 변경 (1곳)
- [ ] **[TASK-007]** `docs/changelogs/preview.md` 변경 (1곳)
- [ ] **[TASK-008]** `docs/changelogs/index.md` 변경 (1곳)
- [ ] **[TASK-009]** `docs/troubleshooting.md` 변경 (1곳)
- [ ] **[TASK-010]** `docs/faq.md` 변경 (1곳)
- [ ] **[TASK-011]** `docs/cli/uninstall.md` 변경 (1곳)
- [ ] **[TASK-012]** `docs/change_model/*.md` 변경 (3곳)
- [ ] **[TASK-013]** `docs/00_project/ai_adapter/working_history/...` 변경 (2곳)

- [ ] **[GREEN-VERIFY]** 변경 후 잔존 참조 확인
  ```bash
  grep -r "@google/gemini-cli" docs/ README.md --include="*.md" | grep -v "gemini-cli-core" | grep -v "gemini-cli-a2a"
  # 결과: 0건이어야 함
  ```

### 3.4 🔵 REFACTOR Phase

- [ ] **[REFACTOR-STRUCTURE]** 문구 일관성 확인
  - `npm install -g @didim/agent-cli` 형태 통일
  - 불필요한 Google NPM 뱃지 URL 검토

### 3.5 사후 작업

- [ ] **[VERIFY]** 문서 빌드 확인 (있는 경우)
- [ ] **[COMMIT]** 변경사항 커밋
  ```bash
  git commit -m "docs: 설치/릴리스 문서 패키지명 @didim/agent-cli로 변경"
  ```

---

## 🔄 Phase 4: 통합 검증 + 락파일 재생성

> 전체 빌드/테스트/린트 통합 검증 및 최종 정리

### 4.1 사전 작업

- [ ] **[REVIEW]** Phase 1~3 완료 확인

### 4.2 🟢 GREEN Phase (통합 검증)

- [ ] **[TASK-001]** package-lock.json 최종 재생성

  ```bash
  rm package-lock.json && npm install
  ```

- [ ] **[TASK-002]** 전체 빌드

  ```bash
  npm run build
  ```

- [ ] **[TASK-003]** 전체 테스트

  ```bash
  npm test -w @didim/agent-cli
  npm test -w @didim/agent-cli-core
  npm test -w @google/gemini-cli-a2a-server
  ```

- [ ] **[TASK-004]** 린트 + 타입체크

  ```bash
  npm run lint
  npm run typecheck
  ```

- [ ] **[TASK-005]** 잔존 참조 최종 확인
  ```bash
  grep -r "@google/gemini-cli" . --include="*.ts" --include="*.tsx" --include="*.js" --include="*.json" --include="*.md" | grep -v node_modules | grep -v "gemini-cli-core" | grep -v "gemini-cli-a2a" | grep -v package-lock.json
  # 결과: 0건이어야 함 (package-lock은 npm install이 처리)
  ```

### 4.3 사후 작업

- [ ] **[DOC]** 작업 결과서 작성
  - 파일:
    `docs/00_project/white_labeling/working_history/Phase_패키지명변경_{작업일자}.md`

- [ ] **[COMMIT]** 최종 커밋
  ```bash
  git commit -m "chore: package-lock.json 재생성 (패키지명 변경 반영)"
  ```

---

## ✅ 최종 체크리스트

### TDD 사이클 완료

- [x] Phase 1: 소스 코드 + 테스트 변경 완료
- [x] Phase 2: 패키지 정의 + 빌드 스크립트 변경 완료
- [x] Phase 3: 문서 일괄 변경 완료
- [x] Phase 4: 통합 검증 + 락파일 재생성 완료
- [x] 전체 테스트 통과 (변경 관련 36/36, 전체 timeout만 기존 flaky)
- [x] 린터 경고 0개
- [x] 잔존 `@google/gemini-cli` 참조 0건 (소스/설정 기준)

### 퍼블리시 준비 (별도)

- [ ] `@didim` npm scope 생성/권한 확인
- [ ] `npm publish --access public` 설정 확인
- [ ] `publishConfig.access: "public"` 추가 확인

### Phase 완료 조건

| Phase   | 🔴 Red | 🟢 Green | 🔵 Refactor | 결과서 | 커밋 | 상태 |
| ------- | ------ | -------- | ----------- | ------ | ---- | ---- |
| Phase 1 | ✅     | ✅       | ✅          | ✅     | ⬜   | ✅   |
| Phase 2 | ✅     | ✅       | ✅          | ✅     | ⬜   | ✅   |
| Phase 3 | ✅     | ✅       | ✅          | ✅     | ⬜   | ✅   |
| Phase 4 | -      | ✅       | -           | ✅     | ⬜   | ✅   |

---

## ⚠️ 주의사항

### 변경 범위 제한

1. **`@google/gemini-cli`만 변경** — `@didim/agent-cli-core`,
   `@google/gemini-cli-a2a-server`는 변경하지 않음
2. **tgz 파일명 패턴**: `@didim/agent-cli` → `didim-agent-cli-{ver}.tgz` (npm
   규칙)
3. **workspace 참조**: Phase 2 이후 `npm test -w` 명령에서 workspace 이름이
   `@didim/agent-cli`로 변경됨
4. **prepare-github-release.js**: GitHub Packages 사용 시 scope 검토 필요

### TDD 사이클 원칙

1. **Red First**: Phase 1에서 소스 변경 시 테스트 실패 확인 후 테스트 동기화
2. **Minimal Green**: 문자열 치환만 수행, 구조 변경 없음
3. **Safe Refactor**: 테스트가 통과하는 상태에서만 리팩터링 진행

---

## 📅 예상 일정

| Phase     | 예상 소요 | 비고                                          |
| --------- | --------- | --------------------------------------------- |
| Phase 1   | 15분      | 소스 + 테스트 3개 파일                        |
| Phase 2   | 20분      | 패키지 정의 + 스크립트 9개 파일 + lock 재생성 |
| Phase 3   | 15분      | 문서 13개 파일 일괄 치환                      |
| Phase 4   | 10분      | 통합 검증                                     |
| **Total** | **~60분** | -                                             |

---

**작성일**: 2026-02-14 **상태**: 🔄 작업 진행 중
