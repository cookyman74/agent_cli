# UI 브랜딩 "Gemini" 잔존 문자열 제거 작업 계획서

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**:
> 사전작업 → 본작업 → 사후작업 3-Stage 준수 **Tidy First**: 구조적 변경과 동작
> 변경 분리, 별도 커밋 **현황 문서**:
> `docs/00_project/white_labeling/UI_브랜딩_Gemini잔존현황.md` **브랜치**:
> `v0.1.2/white_labelling` **버전**: v1.2 (리뷰 반영)

---

## 📋 작업 개요

| 항목        | 내용                                                                                  |
| ----------- | ------------------------------------------------------------------------------------- |
| 프로젝트    | 터미널 UI에 남아있는 "Gemini CLI" / "Gemini" 문자열을 "Didim CLI" / "Didim" 으로 치환 |
| 목표        | `didim` 실행 시 사용자에게 노출되는 모든 "Gemini" 브랜딩을 "Didim" 브랜딩으로 변경    |
| 영향 범위   | CLI 소스 30+ 파일 (src), 테스트 20+ 파일, 스냅샷 11개 파일                            |
| 위험 수준   | 🟡 Medium (문자열 치환이 대부분이나 법적 고지/이용약관 검토 필요)                     |
| 작업 브랜치 | `v0.1.2/white_labelling`                                                              |

### 치환 규칙

| 원본                     | 변경                     | 비고                                     |
| ------------------------ | ------------------------ | ---------------------------------------- |
| `Gemini CLI`             | `Didim CLI`              | 제품명                                   |
| `Gemini Code Assist`     | 검토 후 결정             | 서비스명 (법적 고지 영역)                |
| `gemini` (사용법 문자열) | `didim`                  | 바이너리명                               |
| `Gemini:` (응답 접두사)  | 모델명 또는 삭제         | 세션 뷰어 (v1.2: assistant:/모델명 기반) |
| `Gemini` (단독 노출)     | `Didim` 또는 문맥별 결정 | 설명 문구 내 (예: FolderTrust)           |

---

## 🚨 핵심 리스크 요약

| 리스크                              | 영향      | 대응 방안                                        | 상태 |
| ----------------------------------- | --------- | ------------------------------------------------ | ---- |
| 법적 고지문 단순 치환 불가          | 🟠 Medium | Phase 8에서 별도 검토, 내용 재작성 필요          | ⬜   |
| 이용약관 URL 교체 필요              | 🟠 Medium | 자체 약관 페이지 URL 확인 후 교체                | ⬜   |
| 스냅샷 대량 갱신 (11개 파일)        | 🟢 Low    | 소스 변경 후 `--updateSnapshot` 일괄 갱신        | ⬜   |
| 테스트 assertion 문자열 불일치      | 🟡 Medium | 소스 변경과 테스트 동시 수정                     | ⬜   |
| IDE 연동 문자열 VS Code 확장 동기화 | 🟢 Low    | VS Code 확장 별도 작업으로 분리                  | ⬜   |
| 계획 범위 누락 파일 존재 (v1.0)     | 🔴 High   | v1.1에서 누락 파일 추가, Phase별 매트릭스 재정비 | ✅   |
| `git add .` 무관 변경 혼입 위험     | 🟡 Medium | `git add -p` 또는 명시적 파일 지정으로 변경      | ✅   |

---

## 🔄 Phase 5: 높음 영향도 — 핵심 UI 브랜딩 (인증, About, 윈도우 제목, 사용법)

> 사용자가 가장 빈번하게 접하는 핵심 UI 문자열 6개 파일 치환

### 5.0 사전작업 (Pre-Work)

- [ ] **[CONTEXT]** 작업 목적 및 배경 확인
  - 현황 문서: `UI_브랜딩_Gemini잔존현황.md` 섹션 2.1, 2.2, 2.5
  - "Gemini CLI" → "Didim CLI" 치환 대상 확인
  - 이전 브랜딩 작업 (AsciiArt.ts, 패키지명 변경) 완료 확인

- [ ] **[ANALYSIS]** 대상 파일 현재 상태 분석
  - `ui/auth/AuthDialog.tsx` (L202, L247): 재시작 메시지 + 이용약관 문구
  - `ui/auth/LoginWithGoogleRestartDialog.tsx` (L35): 로그인 후 재시작 안내
  - `ui/components/AboutBox.tsx` (L45): About 다이얼로그 제목
  - `ui/AppContainer.tsx` (L642): 구글 로그인 재시작 메시지 (**v1.1 추가**)
  - `utils/windowTitle.ts` (L47): 터미널 윈도우 제목 형식
  - `config/config.ts` (L100, L102, L110): scriptName + CLI 사용법 + 디폴트 명령
    설명 (**L100 v1.2 추가**)

- [ ] **[DEPENDENCY]** 관련 테스트 파일 확인
  - `ui/auth/__snapshots__/AuthDialog.test.tsx.snap` (3곳 "Gemini CLI")
  - `ui/auth/__snapshots__/LoginWithGoogleRestartDialog.test.tsx.snap` (1곳)
  - `ui/components/AboutBox.test.tsx` (L30: `toContain('About Gemini CLI')`)
  - `ui/components/HistoryItemDisplay.test.tsx` (L127:
    `toContain('About Gemini CLI')`) (**v1.1 추가**)
  - `utils/windowTitle.test.ts` (L42, L237: 윈도우 제목 기대값)
  - `ui/AppContainer.test.tsx` (L1079: 윈도우 제목 기대값)

---

### 5.1 🔴 RED Phase: 실패 테스트 작성/수정

> **목적**: 변경될 문자열을 반영한 테스트 기대값을 먼저 수정하여 실패 확인
> **원칙**: 테스트가 실패하는 것을 확인한 후에만 소스 변경 시작

- [ ] **[RED]** 테스트 기대값 "Gemini CLI" → "Didim CLI" 변경

  **파일**: `packages/cli/src/ui/components/AboutBox.test.tsx`

  ```typescript
  // 변경 전
  expect(output).toContain('About Gemini CLI');
  // 변경 후
  expect(output).toContain('About Didim CLI');
  ```

  **파일**: `packages/cli/src/utils/windowTitle.test.ts`

  ```typescript
  // 변경 전
  expected: 'Gemini CLI (my-project)'.padEnd(80, ' '),
  // 변경 후
  expected: 'Didim CLI (my-project)'.padEnd(80, ' '),
  ```

  ```typescript
  // 변경 전
  expect(title).toContain('Gemini CLI (CCCCC');
  // 변경 후
  expect(title).toContain('Didim CLI (CCCCC');
  ```

  **파일**: `packages/cli/src/ui/AppContainer.test.tsx`

  ```typescript
  // 변경 전
  `\x1b]0;${'Gemini CLI (workspace)'.padEnd(80, ' ')}\x07`
  // 변경 후
  `\x1b]0;${'Didim CLI (workspace)'.padEnd(80, ' ')}\x07`;
  ```

  **파일**: `packages/cli/src/ui/components/HistoryItemDisplay.test.tsx` (**v1.1
  추가**)

  ```typescript
  // L127: 변경 전
  expect(lastFrame()).toContain('About Gemini CLI');
  // 변경 후
  expect(lastFrame()).toContain('About Didim CLI');
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/AboutBox.test.tsx -v
  npm test -w @didim365/agent-cli -- src/utils/windowTitle.test.ts -v
  npm test -w @didim365/agent-cli -- src/ui/AppContainer.test.tsx -v
  npm test -w @didim365/agent-cli -- src/ui/components/HistoryItemDisplay.test.tsx -v
  # 반드시 FAIL이어야 함
  ```

---

### 5.2 🟢 GREEN Phase: 소스 문자열 치환

> **목적**: 테스트를 통과하는 최소한의 코드 변경 **원칙**: "Make it work" —
> 문자열 치환만, 리팩토링은 REFACTOR에서

- [ ] **[TASK-001]** AuthDialog.tsx 문자열 변경
  - 파일: `packages/cli/src/ui/auth/AuthDialog.tsx`
  - L199: `"...Restarting Gemini CLI..."` → `"...Restarting Didim CLI..."`
  - L244: `"Terms of Services...for Gemini CLI"` →
    `"Terms of Services...for Didim CLI"`
  - 예상 소요: 5분

- [ ] **[TASK-002]** LoginWithGoogleRestartDialog.tsx 문자열 변경
  - 파일: `packages/cli/src/ui/auth/LoginWithGoogleRestartDialog.tsx`
  - L35: `"...Gemini CLI needs to be restarted"` →
    `"...Didim CLI needs to be restarted"`
  - 예상 소요: 3분

- [ ] **[TASK-003]** AboutBox.tsx 문자열 변경
  - 파일: `packages/cli/src/ui/components/AboutBox.tsx`
  - L45: `"About Gemini CLI"` → `"About Didim CLI"`
  - 예상 소요: 3분

- [ ] **[TASK-004]** windowTitle.ts 문자열 변경
  - 파일: `packages/cli/src/utils/windowTitle.ts`
  - L47: `"Gemini CLI (workspace)"` → `"Didim CLI (workspace)"`
  - 예상 소요: 3분

- [ ] **[TASK-005]** config.ts CLI 사용법 문자열 + scriptName 변경
  - 파일: `packages/cli/src/config/config.ts`
  - L100: `.scriptName('gemini')` → `.scriptName('didim')` (**v1.2 추가**)
  - L102: `"Usage: gemini [options]...\\nGemini CLI"` →
    `"Usage: didim [options]...\\nDidim CLI"`
  - L110: `"Launch Gemini CLI"` → `"Launch Didim CLI"` (**v1.1 추가**)
  - 예상 소요: 5분

- [ ] **[TASK-006]** AppContainer.tsx 구글 로그인 재시작 메시지 변경 (**v1.1
      추가**)
  - 파일: `packages/cli/src/ui/AppContainer.tsx`
  - L642: `"Restarting Gemini CLI"` → `"Restarting Didim CLI"`
  - 예상 소요: 3분

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/AboutBox.test.tsx -v
  npm test -w @didim365/agent-cli -- src/utils/windowTitle.test.ts -v
  npm test -w @didim365/agent-cli -- src/ui/AppContainer.test.tsx -v
  npm test -w @didim365/agent-cli -- src/ui/components/HistoryItemDisplay.test.tsx -v
  # 반드시 PASS여야 함
  ```

---

### 5.3 🔵 REFACTOR Phase: 스냅샷 갱신 + 구조 개선

> **목적**: 스냅샷 업데이트 및 브랜딩 상수 추출 검토 **원칙**: 테스트가 통과하는
> 상태에서만 리팩터링

- [ ] **[REFACTOR-SNAPSHOT]** 영향받는 스냅샷 갱신

  ```bash
  npm test -w @didim365/agent-cli -- src/ui/auth/AuthDialog.test.tsx -- --updateSnapshot
  npm test -w @didim365/agent-cli -- src/ui/auth/LoginWithGoogleRestartDialog.test.tsx -- --updateSnapshot
  ```

- [ ] **[REFACTOR-STRUCTURE]** 브랜딩 상수 추출 검토
  - `APP_NAME = 'Didim CLI'` 상수를 공통 모듈로 추출할지 검토
  - 현재 단계에서는 인라인 치환 유지, Phase 9에서 최종 판단

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/auth/ -v
  npm test -w @didim365/agent-cli -- src/ui/components/AboutBox.test.tsx -v
  npm test -w @didim365/agent-cli -- src/utils/windowTitle.test.ts -v
  # 여전히 PASS여야 함
  ```

---

### 5.4 사후작업 (Post-Work)

- [ ] **[LINT]** 린터 검사

  ```bash
  npm run lint -w @didim365/agent-cli
  ```

- [ ] **[TYPECHECK]** 타입 검사

  ```bash
  npm run typecheck -w @didim365/agent-cli
  ```

- [ ] **[VERIFY]** 수동 기능 검증
  - 확인 항목 1: `didim` 실행 → About 다이얼로그 (`/about`) → "About Didim CLI"
    표시
  - 확인 항목 2: 터미널 윈도우 제목에 "Didim CLI" 표시

- [ ] **[DOC]** 작업 결과서 작성
  - 파일:
    `docs/00_project/white_labeling/working_history/Phase5_UI브랜딩_Gemini잔존제거_Phase5_20260214.md`

- [ ] **[COMMIT]** 변경사항 커밋
  ```bash
  git add -p
  git commit -m "fix(cli): Phase 5 UI 브랜딩 — 핵심 UI 'Gemini CLI' → 'Didim CLI' 치환"
  ```

### Phase 5 Quality Gates

- [ ] 모든 단위 테스트 통과
- [ ] TypeScript 컴파일 에러 없음
- [ ] ESLint 경고 없음
- [ ] 스냅샷 갱신 완료
- [ ] 문서 업데이트 완료

---

## 🔄 Phase 6: 중간 영향도 — 일반 UI 컴포넌트 + 알림

> 설정 변경, 모델 선택, 세션 뷰어, 폴더 신뢰, 업데이트 알림 등 7개 파일

### 6.0 사전작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 5 작업 결과서 검토
  - 파일: `./working_history/Phase5_UI브랜딩_Gemini잔존제거_Phase5_20260214.md`
  - 확인: 체크리스트 완료 여부, 미해결 이슈

- [ ] **[ANALYSIS]** 대상 파일 현재 상태 분석
  - `ui/components/SessionBrowser.tsx` (L398): 응답 접두사 `"Gemini:"` →
    모델명/`assistant:` 기반으로 변경 (**v1.2 방침 변경**)
  - `ui/components/SettingsDialog.tsx` (L690): 재시작 안내 문구
  - `ui/components/FolderTrustDialog.tsx` (L103, L118): 폴더 신뢰 설명 + 재시작
    메시지 (**L103 v1.1 추가: Gemini 단독 노출**)
  - `ui/components/ModelDialog.tsx` (L79, L97): 모델 선택 설명 문구
  - `ui/components/LogoutConfirmationDialog.tsx` (L65): 로그아웃 안내
  - `ui/components/PermissionsModifyTrustDialog.tsx` (L135): 신뢰 변경 재시작
    메시지 (**v1.1 추가**)
  - `ui/hooks/useFolderTrust.ts` (L69): 신뢰 저장 실패 종료 메시지 (**v1.1 추가,
    Issue #2 수정**)

- [ ] **[DEPENDENCY]** 관련 알림/경고 메시지 파일 확인
  - `ui/utils/updateCheck.ts` (L78, L94): 업데이트 알림 문구
  - `utils/userStartupWarnings.ts` (L45, L60): 시작 경고 메시지

- [ ] **[DEPENDENCY]** 관련 테스트 파일 확인
  - `ui/components/SettingsDialog.test.tsx` (L757)
  - `ui/components/FolderTrustDialog.test.tsx` (L77)
  - `ui/components/LogoutConfirmationDialog.test.tsx` (L32)
  - `utils/userStartupWarnings.test.ts` (L66)
  - `ui/hooks/useFolderTrust.test.ts` (L305)

---

### 6.1 🔴 RED Phase: 테스트 기대값 수정

- [ ] **[RED]** 테스트 기대값 "Gemini CLI" → "Didim CLI" 변경 (7개 파일)

  **파일**: `packages/cli/src/ui/components/SettingsDialog.test.tsx`

  ```typescript
  // L757: 'To see changes, Gemini CLI must be restarted' → 'Didim CLI'
  ```

  **파일**: `packages/cli/src/ui/components/FolderTrustDialog.test.tsx`

  ```typescript
  // L77: 'Gemini CLI is restarting' → 'Didim CLI is restarting'
  ```

  **파일**: `packages/cli/src/ui/components/LogoutConfirmationDialog.test.tsx`

  ```typescript
  // L32: 'using Gemini CLI' → 'using Didim CLI'
  ```

  **파일**: `packages/cli/src/utils/userStartupWarnings.test.ts`

  ```typescript
  // L66: 'running Gemini CLI in' → 'running Didim CLI in'
  ```

  **파일**: `packages/cli/src/ui/hooks/useFolderTrust.test.ts`

  ```typescript
  // L305: 'Exiting Gemini CLI' → 'Exiting Didim CLI'
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/SettingsDialog.test.tsx -v
  npm test -w @didim365/agent-cli -- src/ui/components/FolderTrustDialog.test.tsx -v
  npm test -w @didim365/agent-cli -- src/ui/components/LogoutConfirmationDialog.test.tsx -v
  npm test -w @didim365/agent-cli -- src/utils/userStartupWarnings.test.ts -v
  npm test -w @didim365/agent-cli -- src/ui/hooks/useFolderTrust.test.ts -v
  # 반드시 FAIL이어야 함
  ```

---

### 6.2 🟢 GREEN Phase: 소스 문자열 치환

- [ ] **[TASK-001]** SessionBrowser.tsx 응답 접두사 변경 (**v1.2 방침 변경**)
  - 파일: `packages/cli/src/ui/components/SessionBrowser.tsx`
  - L398: `"Gemini:"` → 실제 모델명 또는 `assistant:` 표시
  - ⚠️ 멀티 프로바이더 환경에서 화자 표기 정확성 확보 (Claude/OpenAI 응답도
    적절히 표시)
  - 구현 방안: `firstMatch.role === 'assistant'`일 때 세션의 모델명 또는
    `'Assistant:'`로 표시
  - 예상 소요: 15분
- [ ] **[TASK-002]** SettingsDialog.tsx 재시작 메시지 변경
  - 파일: `packages/cli/src/ui/components/SettingsDialog.tsx`
  - L690: `"Gemini CLI must be restarted"` → `"Didim CLI must be restarted"`
  - 예상 소요: 3분

- [ ] **[TASK-003]** FolderTrustDialog.tsx 재시작 메시지 + 설명 문구 변경
  - 파일: `packages/cli/src/ui/components/FolderTrustDialog.tsx`
  - L103: `"allows Gemini to execute"` → `"allows Didim to execute"` (**v1.1
    추가**)
  - L118: `"Gemini CLI is restarting..."` → `"Didim CLI is restarting..."`
  - 예상 소요: 5분

- [ ] **[TASK-004]** ModelDialog.tsx 설명 문구 변경
  - 파일: `packages/cli/src/ui/components/ModelDialog.tsx`
  - L79, L97: `"Let Gemini CLI decide..."` → `"Let Didim CLI decide..."`
  - 예상 소요: 3분

- [ ] **[TASK-005]** LogoutConfirmationDialog.tsx 안내 문구 변경
  - 파일: `packages/cli/src/ui/components/LogoutConfirmationDialog.tsx`
  - L65: `"...using Gemini CLI..."` → `"...using Didim CLI..."`
  - 예상 소요: 3분

- [ ] **[TASK-006]** updateCheck.ts 업데이트 알림 변경
  - 파일: `packages/cli/src/ui/utils/updateCheck.ts`
  - L78, L94: `"A new version of Gemini CLI..."` →
    `"A new version of Didim CLI..."`
  - 예상 소요: 3분

- [ ] **[TASK-007]** userStartupWarnings.ts 경고 메시지 변경
  - 파일: `packages/cli/src/utils/userStartupWarnings.ts`
  - L45, L60: `"...running Gemini CLI in..."` → `"...running Didim CLI in..."`
  - 예상 소요: 3분

- [ ] **[TASK-008]** PermissionsModifyTrustDialog.tsx 재시작 메시지 변경 (**v1.1
      추가**)
  - 파일: `packages/cli/src/ui/components/PermissionsModifyTrustDialog.tsx`
  - L135: `"Gemini CLI must be restarted"` → `"Didim CLI must be restarted"`
  - 예상 소요: 3분

- [ ] **[TASK-009]** useFolderTrust.ts 종료 메시지 변경 (**v1.1 추가, Issue #2
      수정**)
  - 파일: `packages/cli/src/ui/hooks/useFolderTrust.ts`
  - L69: `"Exiting Gemini CLI"` → `"Exiting Didim CLI"`
  - 예상 소요: 3분

- [ ] **[TASK-010]** AppContainer.tsx 모델 안내 메시지 변경 (**v1.1 추가**)
  - 파일: `packages/cli/src/ui/AppContainer.tsx`
  - L1848: `"Gemini 3 Flash and Pro..."` → 브랜딩 제거 또는 삭제 (검토 필요)
  - 예상 소요: 5분

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/SettingsDialog.test.tsx -v
  npm test -w @didim365/agent-cli -- src/ui/components/FolderTrustDialog.test.tsx -v
  npm test -w @didim365/agent-cli -- src/ui/components/LogoutConfirmationDialog.test.tsx -v
  npm test -w @didim365/agent-cli -- src/utils/userStartupWarnings.test.ts -v
  npm test -w @didim365/agent-cli -- src/ui/hooks/useFolderTrust.test.ts -v
  # 반드시 PASS여야 함
  ```

---

### 6.3 🔵 REFACTOR Phase: 스냅샷 갱신

- [ ] **[REFACTOR-SNAPSHOT]** 영향받는 스냅샷 일괄 갱신

  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/ -- --updateSnapshot
  ```

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/ -v
  npm test -w @didim365/agent-cli -- src/utils/ -v
  # 여전히 PASS여야 함
  ```

---

### 6.4 사후작업 (Post-Work)

- [ ] **[LINT]** 린터 검사

  ```bash
  npm run lint -w @didim365/agent-cli
  ```

- [ ] **[TYPECHECK]** 타입 검사

  ```bash
  npm run typecheck -w @didim365/agent-cli
  ```

- [ ] **[VERIFY]** 수동 기능 검증
  - 확인 항목 1: `/settings` → 설정 변경 → 재시작 메시지에 "Didim CLI" 표시
  - 확인 항목 2: 세션 브라우저에서 응답 접두사 "Didim:" 표시

- [ ] **[DOC]** 작업 결과서 작성
  - 파일:
    `docs/00_project/white_labeling/working_history/Phase6_UI브랜딩_Gemini잔존제거_Phase6_20260214.md`

- [ ] **[COMMIT]** 변경사항 커밋
  ```bash
  git add -p
  git commit -m "fix(cli): Phase 6 UI 브랜딩 — 일반 UI/알림 'Gemini CLI' → 'Didim CLI' 치환"
  ```

### Phase 6 Quality Gates

- [ ] 모든 단위 테스트 통과
- [ ] TypeScript 컴파일 에러 없음
- [ ] ESLint 경고 없음
- [ ] 스냅샷 갱신 완료

---

## 🔄 Phase 7: 낮음 영향도 — 명령어 설명 + 팁 + IDE 연동

> 명령어 describe 문자열, 팁 메시지, IDE 연동 안내 등 8개 파일

### 7.0 사전작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 6 작업 결과서 검토
  - 파일: `./working_history/Phase6_UI브랜딩_Gemini잔존제거_Phase6_20260214.md`
  - 확인: 체크리스트 완료 여부, 미해결 이슈

- [ ] **[ANALYSIS]** 대상 파일 현재 상태 분석
  - `commands/extensions.tsx` (L24): 확장 명령 설명
  - `commands/hooks.tsx` (L14): 훅 명령 설명
  - `commands/hooks/migrate.ts` (L254, L267): 마이그레이션 명령 설명/사용법
    (**v1.1 추가**)
  - `ui/commands/settingsCommand.ts` (L12): 설정 명령 설명
  - `ui/commands/toolsCommand.ts` (L16): 도구 명령 설명
  - `ui/commands/docsCommand.ts` (L18): 문서 명령 설명
  - `ui/commands/skillsCommand.ts` (L285): 스킬 명령 설명
  - `ui/commands/ideCommand.ts` (L149): IDE 미지원 환경 안내 (**v1.1 추가**)
  - `ui/components/views/ToolsList.tsx` (L26): 도구 목록 제목 (**v1.1 추가,
    Issue #4 수정**)
  - `ui/constants/tips.ts` (L69): 팁 메시지
  - `ui/IdeIntegrationNudge.tsx` (L93): IDE 연동 안내
  - `config/extensions/extensionSettings.ts` (L38): 확장 스토리지 키 접두사
    (**v1.1 추가**)
  - `config/settingsSchema.ts` (L385, L405, L690, L2043, L2075, L2174): 설정
    설명 문구 6곳 (**v1.2 추가**)
  - `commands/mcp/add.ts` (L145): MCP 추가 사용법 (**v1.2 추가**)
  - `commands/mcp/remove.ts` (L44): MCP 제거 사용법 (**v1.2 추가**)

- [ ] **[DEPENDENCY]** 관련 테스트 파일 확인
  - `commands/extensions.test.tsx` (L42: `Manage Gemini CLI extensions`)
  - `ui/commands/settingsCommand.test.ts` (L33:
    `View and edit Gemini CLI settings`)
  - `ui/components/views/__snapshots__/ToolsList.test.tsx.snap` (3곳)
  - `ui/IdeIntegrationNudge.test.tsx` (L69)
  - `ui/components/Tips.test.tsx` — "Gemini" 포함 여부 확인

---

### 7.1 🔴 RED Phase: 테스트 기대값 수정

- [ ] **[RED]** 테스트 기대값 "Gemini CLI" → "Didim CLI" 변경

  **파일**: `packages/cli/src/commands/extensions.test.tsx`

  ```typescript
  // L42: 'Manage Gemini CLI extensions.' → 'Manage Didim CLI extensions.'
  ```

  **파일**: `packages/cli/src/ui/commands/settingsCommand.test.ts`

  ```typescript
  // L33: 'View and edit Gemini CLI settings' → 'View and edit Didim CLI settings'
  ```

  **파일**: `packages/cli/src/ui/IdeIntegrationNudge.test.tsx`

  ```typescript
  // L69: 'connect to Gemini CLI?' → 'connect to Didim CLI?'
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli -- src/commands/extensions.test.tsx -v
  npm test -w @didim365/agent-cli -- src/ui/commands/settingsCommand.test.ts -v
  npm test -w @didim365/agent-cli -- src/ui/IdeIntegrationNudge.test.tsx -v
  # 반드시 FAIL이어야 함
  ```

---

### 7.2 🟢 GREEN Phase: 소스 문자열 치환

- [ ] **[TASK-001]** extensions.tsx 명령어 설명 변경
  - 파일: `packages/cli/src/commands/extensions.tsx`
  - L24: `"Manage Gemini CLI extensions"` → `"Manage Didim CLI extensions"`
  - 예상 소요: 2분

- [ ] **[TASK-002]** hooks.tsx 명령어 설명 변경
  - 파일: `packages/cli/src/commands/hooks.tsx`
  - L14: `"Manage Gemini CLI hooks"` → `"Manage Didim CLI hooks"`
  - 예상 소요: 2분

- [ ] **[TASK-003]** settingsCommand.ts 설명 변경
  - 파일: `packages/cli/src/ui/commands/settingsCommand.ts`
  - L12: `"View and edit Gemini CLI settings"` →
    `"View and edit Didim CLI settings"`
  - 예상 소요: 2분

- [ ] **[TASK-004]** toolsCommand.ts 설명 변경
  - 파일: `packages/cli/src/ui/commands/toolsCommand.ts`
  - L16: `"List available Gemini CLI tools"` →
    `"List available Didim CLI tools"`
  - 예상 소요: 2분

- [ ] **[TASK-005]** docsCommand.ts 설명 변경
  - 파일: `packages/cli/src/ui/commands/docsCommand.ts`
  - L18: `"Open full Gemini CLI documentation"` →
    `"Open full Didim CLI documentation"`
  - 예상 소요: 2분

- [ ] **[TASK-006]** skillsCommand.ts 설명 변경
  - 파일: `packages/cli/src/ui/commands/skillsCommand.ts`
  - L285: `"...Gemini CLI agent skills..."` → `"...Didim CLI agent skills..."`
  - 예상 소요: 2분

- [ ] **[TASK-007]** tips.ts 팁 메시지 변경
  - 파일: `packages/cli/src/ui/constants/tips.ts`
  - L69: `"Show Gemini CLI status..."` → `"Show Didim CLI status..."`
  - 예상 소요: 2분

- [ ] **[TASK-008]** IdeIntegrationNudge.tsx IDE 연동 안내 변경
  - 파일: `packages/cli/src/ui/IdeIntegrationNudge.tsx`
  - L93: `"...connect to Gemini CLI?"` → `"...connect to Didim CLI?"`
  - ⚠️ VS Code 확장 측과 동기화 필요 (별도 작업)
  - 예상 소요: 3분

- [ ] **[TASK-009]** ToolsList.tsx 도구 목록 제목 변경 (**v1.1 추가, Issue #4
      수정**)
  - 파일: `packages/cli/src/ui/components/views/ToolsList.tsx`
  - L26: `"Available Gemini CLI tools:"` → `"Available Didim CLI tools:"`
  - 예상 소요: 2분

- [ ] **[TASK-010]** ideCommand.ts IDE 미지원 환경 안내 변경 (**v1.1 추가**)
  - 파일: `packages/cli/src/ui/commands/ideCommand.ts`
  - L149: `"run Gemini CLI in one of..."` → `"run Didim CLI in one of..."`
  - 예상 소요: 2분

- [ ] **[TASK-011]** hooks/migrate.ts 마이그레이션 명령 설명 변경 (**v1.1
      추가**)
  - 파일: `packages/cli/src/commands/hooks/migrate.ts`
  - L254: `"Migrate hooks...to Gemini CLI"` → `"Migrate hooks...to Didim CLI"`
  - L267: `"Usage: gemini hooks migrate...Gemini CLI format"` →
    `"Usage: didim hooks migrate...Didim CLI format"`
  - 예상 소요: 3분

- [ ] **[TASK-012]** extensionSettings.ts 스토리지 키 접두사 변경 (**v1.1
      추가**)
  - 파일: `packages/cli/src/config/extensions/extensionSettings.ts`
  - L38: `"Gemini CLI Extensions"` → `"Didim CLI Extensions"`
  - ⚠️ 기존 사용자의 데이터 마이그레이션 필요 여부 검토
  - 예상 소요: 5분

- [ ] **[TASK-013]** settingsSchema.ts 설정 설명 변경 (**v1.2 추가**)
  - 파일: `packages/cli/src/config/settingsSchema.ts`
  - L385: `"Show Gemini CLI model thoughts..."` →
    `"Show Didim CLI model thoughts..."`
  - L405: `"...running Gemini CLI in the home directory"` →
    `"...running Didim CLI in the home directory"`
  - L690: `"The Gemini model to use"` → `"The model to use"` (브랜드 중립적
    설명)
  - L2043: `"...the Gemini CLI extension"` → `"...the Didim CLI extension"`
  - L2075: `"Telemetry...for Gemini CLI"` → `"Telemetry...for Didim CLI"`
  - L2174: `"...for styling Gemini CLI output"` →
    `"...for styling Didim CLI output"`
  - 예상 소요: 10분

- [ ] **[TASK-014]** mcp/add.ts 사용법 문자열 변경 (**v1.2 추가**)
  - 파일: `packages/cli/src/commands/mcp/add.ts`
  - L145: `"Usage: gemini mcp add..."` → `"Usage: didim mcp add..."`
  - 예상 소요: 2분

- [ ] **[TASK-015]** mcp/remove.ts 사용법 문자열 변경 (**v1.2 추가**)
  - 파일: `packages/cli/src/commands/mcp/remove.ts`
  - L44: `"Usage: gemini mcp remove..."` → `"Usage: didim mcp remove..."`
  - 예상 소요: 2분

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli -- src/commands/extensions.test.tsx -v
  npm test -w @didim365/agent-cli -- src/ui/commands/settingsCommand.test.ts -v
  npm test -w @didim365/agent-cli -- src/ui/IdeIntegrationNudge.test.tsx -v
  # 반드시 PASS여야 함
  ```

---

### 7.3 🔵 REFACTOR Phase: 스냅샷 갱신

- [ ] **[REFACTOR-SNAPSHOT]** 영향받는 스냅샷 일괄 갱신

  ```bash
  npm test -w @didim365/agent-cli -- src/ui/components/views/ -- --updateSnapshot
  ```

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli -- src/commands/ -v
  npm test -w @didim365/agent-cli -- src/ui/commands/ -v
  npm test -w @didim365/agent-cli -- src/ui/IdeIntegrationNudge.test.tsx -v
  # 여전히 PASS여야 함
  ```

---

### 7.4 사후작업 (Post-Work)

- [ ] **[LINT]** 린터 검사

  ```bash
  npm run lint -w @didim365/agent-cli
  ```

- [ ] **[TYPECHECK]** 타입 검사

  ```bash
  npm run typecheck -w @didim365/agent-cli
  ```

- [ ] **[VERIFY]** 수동 기능 검증
  - 확인 항목 1: `/help` 입력 → 명령어 설명에 "Didim CLI" 표시
  - 확인 항목 2: `/tools` → 도구 목록 제목에 "Didim CLI" 표시

- [ ] **[DOC]** 작업 결과서 작성
  - 파일:
    `docs/00_project/white_labeling/working_history/Phase7_UI브랜딩_Gemini잔존제거_Phase7_20260214.md`

- [ ] **[COMMIT]** 변경사항 커밋
  ```bash
  git add -p
  git commit -m "fix(cli): Phase 7 UI 브랜딩 — 명령어 설명/팁/IDE 연동 'Gemini CLI' → 'Didim CLI' 치환"
  ```

### Phase 7 Quality Gates

- [ ] 모든 단위 테스트 통과
- [ ] TypeScript 컴파일 에러 없음
- [ ] ESLint 경고 없음
- [ ] 스냅샷 갱신 완료

---

## 🔄 Phase 8: 법적 고지 — 개인정보/이용약관 (검토 필요)

> 단순 치환 불가, 내용 검토 및 자체 약관 페이지 URL 교체 필요

### 8.0 사전작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 7 작업 결과서 검토
  - 파일: `./working_history/Phase7_UI브랜딩_Gemini잔존제거_Phase7_20260214.md`
  - 확인: 체크리스트 완료 여부, 미해결 이슈

- [ ] **[ANALYSIS]** 법적 고지 내용 검토
  - `ui/privacy/CloudFreePrivacyNotice.tsx` (L58, L78, L88): "Gemini Code
    Assist" 관련 개인정보 고지
  - `ui/auth/AuthDialog.tsx` (L247, L253): 이용약관 문구 + URL
  - `ui/privacy/CloudFreePrivacyNotice.tsx` (L58, L78, L83, L88): 개인정보보호
    고지 내 `Gemini Code Assist` 4곳 (**v1.2 추가**)
  - `ui/commands/docsCommand.ts` (L18): 문서 링크 설명 (**v1.2 추가**) (Google
    약관 → 자체 약관)

- [ ] **[DEPENDENCY]** 법적 검토 필요 사항 확인
  - "Gemini Code Assist" → 자체 서비스명 결정 필요
  - 이용약관 URL: 자체 약관 페이지 존재 여부 확인
  - 개인정보 처리방침: 자체 방침 문서 존재 여부 확인

---

### 8.1 🔴 RED Phase: 실패 테스트 작성

- [ ] **[RED]** CloudFreePrivacyNotice 문자열 변경 테스트 작성
  - "Gemini Code Assist" → 결정된 서비스명으로 기대값 변경
  - 이용약관 URL 기대값 변경

- [ ] **[RED-VERIFY]** 테스트 실패 확인

---

### 8.2 🟢 GREEN Phase: 법적 고지 문구 변경

- [ ] **[TASK-001]** CloudFreePrivacyNotice.tsx 서비스명 변경
  - 파일: `packages/cli/src/ui/privacy/CloudFreePrivacyNotice.tsx`
  - L58, L78, L88: "Gemini Code Assist" → (결정된 서비스명)
  - ⚠️ 단순 치환 아닌 내용 검토 필요
  - 예상 소요: 30분

- [ ] **[TASK-002]** AuthDialog.tsx 이용약관 URL 교체
  - 파일: `packages/cli/src/ui/auth/AuthDialog.tsx`
  - L248-252: Google 약관 URL → 자체 약관 URL
  - ⚠️ 자체 약관 페이지 URL 확정 필요
  - 예상 소요: 15분

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인

---

### 8.3 🔵 REFACTOR Phase

- [ ] **[REFACTOR-STRUCTURE]** 법적 고지 문구를 별도 상수/설정 파일로 분리 검토
- [ ] **[REFACTOR-SNAPSHOT]** 영향받는 스냅샷 갱신 (**v1.1 추가, Issue #8
      수정**)
  ```bash
  npm test -w @didim365/agent-cli -- src/ui/auth/AuthDialog.test.tsx -- --updateSnapshot
  ```
- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인

---

### 8.4 사후작업 (Post-Work)

- [ ] **[LINT]** 린터 검사
- [ ] **[TYPECHECK]** 타입 검사
- [ ] **[VERIFY]** 수동 기능 검증
  - 확인 항목 1: 개인정보 안내에 "Gemini" 미표시
  - 확인 항목 2: 이용약관 링크 클릭 시 자체 약관 페이지 이동

- [ ] **[DOC]** 작업 결과서 작성
- [ ] **[COMMIT]** 변경사항 커밋
  ```bash
  git add -p
  git commit -m "fix(cli): Phase 8 UI 브랜딩 — 법적 고지/이용약관 브랜딩 변경"
  ```

### Phase 8 Quality Gates

- [ ] 모든 단위 테스트 통과
- [ ] TypeScript 컴파일 에러 없음
- [ ] ESLint 경고 없음
- [ ] 법적 고지 내용 검토 완료

---

## 🔄 Phase 9: 최종 검증 + 잔존 정리 + 브랜딩 상수 추출

> 전체 grep 스캔으로 잔존 확인 및 브랜딩 상수화

### 9.1 ⭕ 사전작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 5~8 작업 결과서 전체 리뷰

- [ ] **[TEST-COVERAGE]** 테스트 커버리지 개선 (**v1.2 추가, Issue #6**)
  - AppContainer.tsx L642/643: 구글 로그인 재시작 메시지에 대한 테스트 assertion
    추가 검토
  - ideCommand.ts L149: IDE 미지원 환경 안내에 대한 테스트 assertion 추가 검토
  - PermissionsModifyTrustDialog.tsx L135: 재시작 메시지에 대한 테스트 assertion
    추가 검토
  - ⚠️ 추후 브랜딩 회귀 방지를 위해 CI에서 잡힘 수 있는 테스트 추가 권장

- [ ] **[ANALYSIS]** 잔존 문자열 최종 스캔 (**Issue #5 수정:
      single-quote/template literal 포함**)
  ```bash
  # 소스 코드 내 "Gemini" 잔존 확인 (providers/gemini, 코드 내부 식별자 제외)
  grep -rn "Gemini" packages/cli/src/ \
    --include="*.ts" --include="*.tsx" \
    --exclude-dir="__snapshots__" \
    | grep -v "providers/gemini" \
    | grep -v ".test." \
    | grep -v "GeminiMessage" \
    | grep -v "GeminiEventType" \
    | grep -v "GeminiChat" \
    | grep -v "GeminiRespondingSpinner" \
    | grep -v "GeminiCLIExtension" \
    | grep -v "useGeminiStream" \
    | grep -v "getGeminiClient" \
    | grep -v "GeminiMd" \
    | grep -v "import "
  ```

---

### 9.1 🟢 GREEN Phase: 잔존 문자열 정리 + 상수 추출

- [ ] **[TASK-001]** 잔존 문자열 치환 (위 스캔 결과 기반)
- [ ] **[TASK-002]** 브랜딩 상수 추출 검토 및 적용
  - `APP_NAME`, `APP_BINARY_NAME` 등 공통 상수 추출 여부 결정
  - 향후 브랜딩 변경 시 단일 지점 수정 가능하도록 설계

---

### 9.2 사후작업 (Post-Work)

- [ ] **[TEST]** 전체 테스트 실행

  ```bash
  npm test -w @didim365/agent-cli
  npm run typecheck -w @didim365/agent-cli
  npm run lint -w @didim365/agent-cli
  ```

- [ ] **[VERIFY]** 최종 잔존 스캔 (**Issue #5 수정: 모든 인용부호 타입 포함**)

  ```bash
  # 사용자 노출 문자열에서 "Gemini CLI" 잔존 없어야 함
  grep -rn 'Gemini CLI' packages/cli/src/ \
    --include="*.ts" --include="*.tsx" \
    --exclude-dir="__snapshots__" \
    | grep -v ".test." \
    | grep -v "providers/gemini" \
    | grep -v "import "
  # 결과 0건이어야 함
  ```

- [ ] **[DOC]** 최종 작업 결과서 작성
- [ ] **[COMMIT]** 최종 커밋
  ```bash
  git add -p
  git commit -m "fix(cli): Phase 9 UI 브랜딩 — 최종 잔존 정리 및 검증"
  ```

---

## ✅ 최종 체크리스트

### Phase 완료 현황

| Phase   | 내용                        | 🔴 Red | 🟢 Green | 🔵 Refactor | 결과서 | 커밋 | 상태 |
| ------- | --------------------------- | ------ | -------- | ----------- | ------ | ---- | ---- |
| Phase 5 | 핵심 UI (인증, About, 제목) | ⬜     | ⬜       | ⬜          | ⬜     | ⬜   | ⬜   |
| Phase 6 | 일반 UI + 알림              | ⬜     | ⬜       | ⬜          | ⬜     | ⬜   | ⬜   |
| Phase 7 | 명령어 설명 + 팁 + IDE      | ⬜     | ⬜       | ⬜          | ⬜     | ⬜   | ⬜   |
| Phase 8 | 법적 고지 (검토 필요)       | ⬜     | ⬜       | ⬜          | ⬜     | ⬜   | ⬜   |
| Phase 9 | 최종 검증 + 상수 추출       | N/A    | ⬜       | ⬜          | ⬜     | ⬜   | ⬜   |

### Phase 의존성

```
Phase 5 (핵심 UI) ─┬─ Phase 6 (일반 UI)  [순차]
                    ├─ Phase 7 (명령어)    [Phase 6 이후]
                    └─ Phase 8 (법적 고지) [독립, 검토 대기 가능]
                         └─ Phase 9 (최종 검증) [Phase 5~8 완료 후]
```

### 수정 파일 요약

| 우선순위 | 소스 파일 수 | 테스트 파일 수 | 스냅샷 파일 수 |
| -------- | ------------ | -------------- | -------------- |
| Phase 5  | 7개          | 5개            | 2개            |
| Phase 6  | 10개         | 5개            | ~3개           |
| Phase 7  | 15개         | 5개            | 1개            |
| Phase 8  | 4개          | ~2개           | ~2개           |
| **합계** | **36개**     | **~17개**      | **~8개**       |

---

## ⚠️ 주의사항

### TDD 사이클 원칙

1. **Red First**: 테스트 기대값을 "Didim CLI"로 먼저 수정하여 실패 확인
2. **Minimal Green**: 소스 문자열만 치환, 불필요한 리팩토링 금지
3. **Safe Refactor**: 스냅샷 갱신은 모든 테스트 통과 후에만 진행

### 작업 관리 원칙

4. **Tidy First**: 문자열 치환(동작 변경)과 상수 추출(구조 변경) 별도 커밋
5. **스냅샷 일괄 갱신**: 소스 변경 완료 후 `--updateSnapshot` 으로 일괄 처리
6. **법적 고지 별도**: Phase 8은 단순 치환이 아닌 내용 검토 필요, 별도 판단
7. **providers/gemini 제외**: `GeminiAdapter`, `GeminiChat` 등의 내부 코드명은
   변경 대상 아님
8. **GeminiMessage 등 컴포넌트명**: 코드 내부 식별자는 이번 작업 범위 외

### 확인 필요 사항 (v1.1 추가)

> 리뷰에서 제기된 범위 관련 결정 사항

1. **`Gemini` 단독 노출 범위**: `Gemini CLI` 브랜딩만 제거할지, `Gemini` 단독
   노출(예: FolderTrustDialog L103 `"allows Gemini to execute"`)도 제거할지 범위
   확정 필요 → **v1.1에서 포함으로 결정**
2. **`Gemini:` 접두사 처리**: 제품 브랜딩(`Didim:`) vs 화자 의미
   중심(`Assistant:`/모델명) → **v1.2에서 `assistant:`/모델명 기반으로 결정**
   (멀티 프로바이더 UX 정확성 확보)
3. **CLI help/usage 계열**: `scriptName`, `mcp add/remove` usage,
   `hooks migrate` 등 이번 화이트라벨 범위에 포함 → **v1.2에서 전체 포함으로
   결정**
4. **docs URL/약관 URL 정책**: Didim 전용으로 바꿀지, 당분간 Google 문서
   유지할지 → **Phase 8에서 결정**

---

## 📅 예상 일정

| Phase     | 예상 소요 | 시작일     | 완료일 | 비고                              |
| --------- | --------- | ---------- | ------ | --------------------------------- |
| Phase 5   | 0.5일     | 2026-02-14 | -      | 핵심 UI 7개 파일                  |
| Phase 6   | 1일       | -          | -      | 일반 UI 10개 파일 (↑v1.1)         |
| Phase 7   | 1.5일     | -          | -      | 명령어/팁/설정 15개 파일 (↑v1.2)  |
| Phase 8   | 1일       | -          | -      | 법적 고지 + 개인정보 검토 (↑v1.2) |
| Phase 9   | 0.5일     | -          | -      | 최종 검증 + 테스트커버리지        |
| **Total** | **4.5일** | -          | -      | v1.1 대비 +0.5일 (설정/법적 확대) |

---

**작성일**: 2026-02-14 **작성자**: AI Assistant **최종 수정일**: 2026-02-14
**상태**: ⬜ 작성 중
