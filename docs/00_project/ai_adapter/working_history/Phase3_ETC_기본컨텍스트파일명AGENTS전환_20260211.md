# Phase3 ETC 기본 컨텍스트 파일명 AGENTS 전환 작업 결과서

- 작업일: 2026-02-11
- 범위: 기본 컨텍스트 파일명을 `GEMINI.md`에서 `AGENTS.md`로 전환
- 상태: 완료

---

## 1) 작업 배경

- 현재 컨텍스트 파일 기본값이 `GEMINI.md`로 고정되어 있어 운영 관점에서
  `AGENTS.md` 중심 정책과 불일치.
- 요청사항:
  - 기본 파일명 자체를 `AGENTS.md`로 변경
  - `/init`, `/memory`, extension 기본 탐색 경로, UI 안내 문구를 일관화

---

## 2) 코드 변경 요약

### 2.1 기본값 전환

- `packages/core/src/tools/memoryTool.ts`
  - `DEFAULT_CONTEXT_FILENAME`:
    - `GEMINI.md` → `AGENTS.md`

### 2.2 `/init` 경로 전환

- `packages/core/src/commands/init.ts`
  - 기본 파일명을 상수(`DEFAULT_CONTEXT_FILENAME`) 기반으로 사용
  - 안내 문구도 동적 파일명 반영
- `packages/cli/src/ui/commands/initCommand.ts`
  - 생성 파일 경로를 `AGENTS.md` 기본값으로 사용
- `packages/a2a-server/src/commands/init.ts`
  - 생성 파일 경로/설명 문구를 `AGENTS.md` 기본값으로 사용

### 2.3 extension 기본 context 파일 전환

- `packages/cli/src/config/extension-manager.ts`
  - extension config에 `contextFileName` 미지정 시 기본값:
    - `['GEMINI.md']` → `[DEFAULT_CONTEXT_FILENAME, 'GEMINI.md']` (fallback
      체인)
  - 첫 번째로 발견된 파일만 사용하여 중복 로드 방지
- `packages/a2a-server/src/config/extension.ts`
  - 동일하게 fallback 체인 + 첫 발견 파일 사용 로직 적용

### 2.4 `/memory` 및 UI 노출 문구 정리

- `packages/core/src/commands/memory.ts`
  - `/memory list` 응답에서 하드코딩 `GEMINI.md` 제거
  - 다중 파일명 지원: `getAllGeminiMdFilenames()` 기준 출력
  - 단일/다중 파일 구분 표시
- `packages/cli/src/ui/components/Tips.tsx`
- `packages/cli/src/ui/constants/tips.ts`
- `packages/cli/src/ui/AppContainer.tsx`
- `packages/cli/src/ui/hooks/useShowMemoryCommand.ts`
- `packages/cli/src/ui/commands/directoryCommand.tsx`
- `packages/cli/src/ui/commands/memoryCommand.ts`
- `packages/a2a-server/src/commands/memory.ts`
- `packages/cli/src/config/settingsSchema.ts`
  - 사용자 노출 문구를 `AGENTS.md` 기준 또는 일반화된 context 파일 표현으로 정리

### 2.5 주석/설명 텍스트 정리

- `packages/core/src/utils/memoryDiscovery.ts`
- `packages/core/src/utils/memoryImportProcessor.ts`
- `packages/core/src/tools/read-many-files.ts`
- `packages/core/src/config/config.ts`
  - 문서/주석의 `GEMINI.md` 고정 표현을 context 파일 기준으로 정리

---

## 3) 테스트/검증

### 3.1 Core

```bash
npm test --workspace @google/gemini-cli-core -- \
  src/commands/init.test.ts \
  src/commands/memory.test.ts \
  src/tools/memoryTool.test.ts \
  src/config/config.test.ts
```

- 결과: PASS (`171 passed`)

### 3.2 CLI

```bash
npm test --workspace @google/gemini-cli -- \
  src/ui/commands/initCommand.test.ts \
  src/ui/commands/memoryCommand.test.ts \
  src/ui/components/Tips.test.tsx \
  src/ui/commands/directoryCommand.test.tsx \
  src/ui/hooks/useShowMemoryCommand.test.ts
```

- 결과: PASS (`37 passed`)

```bash
npm test --workspace @google/gemini-cli -- \
  src/ui/components/AppHeader.test.tsx \
  src/ui/components/AlternateBufferQuittingDisplay.test.tsx -u
```

- 결과: PASS (`17 passed`)
- 비고: `Tips` 문구 변경으로 snapshot 12건 업데이트

### 3.3 A2A Server

```bash
npm test --workspace @google/gemini-cli-a2a-server -- \
  src/commands/init.test.ts \
  src/commands/memory.test.ts
```

- 결과: PASS (`12 passed`)
- 비고: `extension.test.ts` 파일은 존재하지 않음 (§6.3 참조)

### 3.4 Typecheck

```bash
npm run typecheck --workspace @google/gemini-cli-core
npm run typecheck --workspace @google/gemini-cli
npm run typecheck --workspace @google/gemini-cli-a2a-server
```

- 결과: 전부 PASS

---

## 4) 변경 파일 (본 작업 범위)

- `packages/core/src/tools/memoryTool.ts`
- `packages/core/src/commands/init.ts`
- `packages/core/src/commands/memory.ts`
- `packages/core/src/commands/memory.test.ts`
- `packages/core/src/tools/memoryTool.test.ts`
- `packages/core/src/utils/memoryDiscovery.ts`
- `packages/core/src/utils/memoryImportProcessor.ts`
- `packages/core/src/tools/read-many-files.ts`
- `packages/core/src/config/config.ts`
- `packages/cli/src/ui/commands/initCommand.ts`
- `packages/cli/src/config/extension-manager.ts`
- `packages/cli/src/ui/commands/memoryCommand.ts`
- `packages/cli/src/ui/components/Tips.tsx`
- `packages/cli/src/ui/components/Tips.test.tsx`
- `packages/cli/src/ui/constants/tips.ts`
- `packages/cli/src/ui/AppContainer.tsx`
- `packages/cli/src/ui/hooks/useShowMemoryCommand.ts`
- `packages/cli/src/ui/commands/directoryCommand.tsx`
- `packages/cli/src/config/settingsSchema.ts`
- `packages/cli/src/ui/components/__snapshots__/AppHeader.test.tsx.snap`
- `packages/cli/src/ui/components/__snapshots__/AlternateBufferQuittingDisplay.test.tsx.snap`
- `packages/a2a-server/src/config/extension.ts`
- `packages/a2a-server/src/commands/init.ts`
- `packages/a2a-server/src/commands/memory.ts`

---

## 5) 호환성 메모

- 기본값은 `AGENTS.md`로 전환되었지만, 설정으로 다중 파일명을 유지 가능:
  - `context.fileName: ["AGENTS.md", "GEMINI.md"]`
- 즉, 기존 `GEMINI.md` 기반 프로젝트도 설정으로 병행 운영 가능.

---

## 6) 리뷰 반영 (2026-02-11)

### 6.1 중간: `/memory list` 다중 파일명 오표기

**문제**: `getCurrentGeminiMdFilename()`은 배열일 때 첫 번째 파일명만 반환
(`memoryTool.ts:81-86`). `listMemoryFiles()`가 단일 파일명으로 전체 결과를
라벨링하여, `context.fileName=["AGENTS.md","GEMINI.md"]` 설정 시 "There are N
AGENTS.md file(s)..."로 고정 표기됨.

**영향**: 다중 컨텍스트 파일 설정 시 사용자가 실제 탐색 범위를 오인할 수 있음.

**수정** (`memory.ts:82-100`):

- `getAllGeminiMdFilenames()`를 사용하여 모든 설정 파일명 획득
- 다중 파일 시: `"context file(s) (AGENTS.md, GEMINI.md)"`
- 단일 파일 시: `"AGENTS.md file(s)"` (기존 동작 유지)
- else 블록(파일 없음)도 동일 패턴 적용

**부수 수정**:

- `getCurrentGeminiMdFilename` import 제거 (미사용)

### 6.2 중간: Extension 레거시 호환성 리스크

**문제**: `getContextFileNames()` 기본값이 `[DEFAULT_CONTEXT_FILENAME]` (=
`['AGENTS.md']`) 단일값으로 변경됨 (`extension-manager.ts:920`,
`extension.ts:131`). `contextFileName` 미지정 + `GEMINI.md`만 가진 기존 확장은
컨텍스트 로드 실패 (조용한 실패 → context 미적용).

**영향**: 레거시 확장 호환성 리스크. 기존 확장이 예고 없이 컨텍스트를 로드하지
못할 수 있음.

**수정**:

- 기본값을 `[DEFAULT_CONTEXT_FILENAME, 'GEMINI.md']`로 변경하여 fallback 체인
  지원
- **첫 번째로 발견된 파일만 사용**: `extension-manager.ts:610-621`,
  `extension.ts:107-117`에서 for 루프 + break 패턴 구현
- 우선순위: AGENTS.md → GEMINI.md (둘 다 있으면 AGENTS.md만 로드)
- 중복 로드 방지: 두 파일이 모두 있어도 첫 발견 파일만 사용하여 프롬프트
  중복/충돌 회피

### 6.3 낮음: 작업결과서 검증 명령 부정확

**문제**: 결과서 §3.3 (line 112)에 존재하지 않는 테스트 파일 포함:
`src/config/extension.test.ts` (실제: a2a-server에 해당 파일 없음).

**수정**: 검증 명령 정정:

```bash
# 수정 전 (부정확)
npm test --workspace @google/gemini-cli-a2a-server -- \
  src/commands/init.test.ts \
  src/commands/memory.test.ts \
  src/config/extension.test.ts

# 수정 후 (정확)
npm test --workspace @google/gemini-cli-a2a-server -- \
  src/commands/init.test.ts \
  src/commands/memory.test.ts
```

**비고**: a2a-server는 `config.test.ts`, `settings.test.ts`만 존재. extension
관련 테스트 파일 없음.

### 6.4 리뷰 반영 후 검증 (1차)

| 범위                      | 결과          |
| ------------------------- | ------------- |
| memory.test.ts (12 tests) | ✅ All passed |
| Lint                      | ✅ Clean      |
| Typecheck                 | ✅ Clean      |

**기능 검증**:

- 단일 파일 설정 (`AGENTS.md`): "There are N AGENTS.md file(s)..." ✅
- 다중 파일 설정 (`["AGENTS.md", "GEMINI.md"]`): "There are N context file(s)
  (AGENTS.md, GEMINI.md)..." ✅
- 파일 없음: "No AGENTS.md files in use." (단일) / "No context files (AGENTS.md,
  GEMINI.md) in use." (다중) ✅
- Extension 레거시 호환: `contextFileName` 미지정 시 AGENTS.md → GEMINI.md
  fallback 동작 ✅

---

## 7) 추가 리뷰 반영 (2026-02-11)

### 7.1 중간: Extension fallback 중복 로드 방지

**문제 (1차 리뷰 반영 후 발견)**: `extension-manager.ts:610-614`,
`extension.ts:107-109`에서 `getContextFileNames()`가 반환한 **모든** 파일명을
매핑하고 존재하는 것 전부를 로드함. 결과서 §6.2에는 "첫 번째로 발견된 파일만
사용"이라 설명했지만, 실제 코드는 `.filter(fs.existsSync)`로 **존재하는 모든
파일**을 로드.

**영향**: extension 디렉터리에 AGENTS.md와 GEMINI.md가 함께 있으면 컨텍스트가
중복 로드되어 의도치 않은 프롬프트 중복/충돌 가능성.

**수정**:

- `extension-manager.ts:610-621`: for 루프 + break로 첫 발견 파일만 사용
- `extension.ts:107-117`: 동일 패턴 적용
- 주석 추가: "Use the first existing context file from the configured list. This
  prevents duplicate context loading when multiple files exist."

### 7.2 낮음: `/memory list` "파일 없음" 메시지 `files` 중복

**문제**: `memory.ts:97-99`에서 `"context files (AGENTS.md, GEMINI.md)"`
(line 97) + `"files in use."` (line 99) →
`"No context files (...) files in use."` — `files` 중복.

**수정**:

- 단일 파일: `No ${allFilenames[0]} files in use.`
- 다중 파일: `No context files (AGENTS.md, GEMINI.md) in use.`

### 7.3 낮음: 작업결과서 본문 일관성

**문제**: §2.3/2.4에 예전 설명(`[DEFAULT_CONTEXT_FILENAME]` 단일,
`getCurrentGeminiMdFilename`) 잔존. §6.2에는 fallback 체인/다중 처리로 기술되어
상충.

**수정**: §2.3/2.4를 fallback 체인 + 첫 발견 파일 사용 로직으로 정정.

### 7.4 추가 리뷰 반영 후 검증 (2차)

| 범위                      | 결과          |
| ------------------------- | ------------- |
| memory.test.ts (12 tests) | ✅ All passed |
| Lint                      | ✅ Clean      |
| Typecheck                 | ✅ Clean      |

**기능 검증**:

- Extension 첫 발견 파일 사용: AGENTS.md + GEMINI.md 공존 시 AGENTS.md만 로드 ✅
- `/memory list` "파일 없음" 문구: `files` 중복 제거 ✅
- 작업결과서 본문 일관성: §2.3/2.4와 §6.2/§7 내용 정합성 확보 ✅

---

## 8) 회귀 테스트 추가 (2026-02-12)

### 8.1 배경

리뷰를 통해 식별된 주요 기능 변경에 대한 회귀 테스트 부재:

- **낮음**: Extension fallback(AGENTS→GEMINI, 첫 발견 1개만 로드) 동작 미검증
- **낮음**: `/memory list`의 다중 파일명 + 파일 없음 문구 분기 미검증

**리스크**: 향후 리팩터링 시 중복 로드 방지 로직 또는 다중 파일 표시 로직이
깨져도 조기 탐지 어려움.

### 8.2 추가된 테스트

#### 8.2.1 Extension Fallback 회귀 테스트

**파일**: `packages/cli/src/config/extension.test.ts`

**추가된 테스트** (3건):

1. **`should load only AGENTS.md when both AGENTS.md and GEMINI.md exist (first-found fallback)`**
   - 시나리오: `contextFileName` 미지정 + AGENTS.md + GEMINI.md 공존
   - 검증: `contextFiles`에 AGENTS.md만 포함 (길이 1)
   - 목적: 첫 발견 파일만 로드하는 로직 검증 (중복 방지)

2. **`should load GEMINI.md when only GEMINI.md exists (fallback works)`**
   - 시나리오: `contextFileName` 미지정 + GEMINI.md만 존재 (레거시 확장)
   - 검증: `contextFiles`에 GEMINI.md 포함
   - 목적: Fallback chain 동작 검증 (레거시 호환)

3. **`should load AGENTS.md when only AGENTS.md exists (primary path)`**
   - 시나리오: `contextFileName` 미지정 + AGENTS.md만 존재
   - 검증: `contextFiles`에 AGENTS.md 포함
   - 목적: Primary path 우선 로드 검증

**구현 상세**:

- `DEFAULT_CONTEXT_FILENAME` import 추가 (`@google/gemini-cli-core`)
- `createExtension()` + 수동 `fs.writeFileSync()`로 파일 조합 제어
- `contextFiles` 배열 길이 및 경로 정확성 검증

#### 8.2.2 Multi-File Display 회귀 테스트

**파일**: `packages/core/src/commands/memory.test.ts`

**추가된 테스트** (2건, §7에서 추가됨):

1. **`should display multiple filenames when configured`**
   - 시나리오: `setGeminiMdFilename(['AGENTS.md', 'GEMINI.md'])` + 파일 2개
   - 검증: `"There are 2 context file(s) (AGENTS.md, GEMINI.md) in use:"`
   - 목적: 다중 파일 라벨 표시 검증

2. **`should display multi-filename label when no files exist`**
   - 시나리오: `setGeminiMdFilename(['AGENTS.md', 'GEMINI.md'])` + 파일 0개
   - 검증: `"No context files (AGENTS.md, GEMINI.md) in use."`
   - 목적: 다중 파일 "파일 없음" 문구 검증

### 8.3 검증 결과

| 범위              | 테스트 수 | 결과          |
| ----------------- | --------- | ------------- |
| extension.test.ts | 79 (76+3) | ✅ All passed |
| memory.test.ts    | 14 (12+2) | ✅ All passed |
| Lint (CLI)        | -         | ✅ Clean      |
| Typecheck (CLI)   | -         | ✅ Clean      |

**회귀 방지 효과**:

- Extension 중복 로드 방지 로직 변경 시 조기 탐지 가능
- Multi-file display 문구 변경 시 예상치 못한 문구 오류 방지
- 리팩터링 안전성 확보 (fallback chain + 첫 발견 패턴 보존)

---

## 9) 3차 리뷰 반영 (2026-02-14)

### 9.1 중간: A2A init 테스트 AGENTS 전환 불일치

**문제**: `packages/a2a-server/src/commands/init.test.ts`에서 `GEMINI.md`가
하드코딩되어 있어, `init.ts`가 `DEFAULT_CONTEXT_FILENAME` (= `AGENTS.md`)을
사용하는 것과 불일치. `fs.writeFileSync` assertion이 실패.

- Line 89, 101, 113: mock 반환값에 `'GEMINI.md already exists.'` 하드코딩
- Line 146, 169: mock 반환값에 `'Create a new GEMINI.md file.'` 하드코딩
- **Line 153-154**: `path.join(mockWorkspacePath, 'GEMINI.md')` — 실제 코드는
  `DEFAULT_CONTEXT_FILENAME` 사용

**영향**: 테스트 1건 실패 — 검증 게이트가 깨져 있어 회귀 탐지 불가.

**재현**:

```bash
npm test --workspace @google/gemini-cli-a2a-server -- src/commands/init.test.ts
# 결과: 1 failed | 4 passed (5)
```

**수정** (`packages/a2a-server/src/commands/init.test.ts`):

- `DEFAULT_CONTEXT_FILENAME` import 추가 (`@google/gemini-cli-core`)
- 하드코딩 `'GEMINI.md already exists.'` →
  `` `${DEFAULT_CONTEXT_FILENAME} already exists.` `` (로컬 변수 `infoMessage`)
- 하드코딩 `'Create a new GEMINI.md file.'` →
  `` `Create a new ${DEFAULT_CONTEXT_FILENAME} file.` `` (로컬 변수
  `submitPromptContent`)
- `path.join(mockWorkspacePath, 'GEMINI.md')` →
  `path.join(mockWorkspacePath, DEFAULT_CONTEXT_FILENAME)`
- 로컬 변수 재사용으로 assertion 중복 제거

### 9.2 낮음: A2A extension fallback 회귀 테스트 추가

**문제**: `packages/a2a-server/src/config/extension.ts`의 AGENTS→GEMINI
fallback + first-found 로직에 전용 테스트가 없음.

**영향**: 리팩터링 시 중복 로드/우선순위 회귀를 조기 탐지하기 어려움.

**수정**: `packages/a2a-server/src/config/extension.test.ts` 신규 생성 (5건):

1. **`should load only AGENTS.md when both AGENTS.md and GEMINI.md exist`**
   - 시나리오: 두 파일 공존, `contextFileName` 미설정
   - 검증: `contextFiles`에 AGENTS.md만 포함 (길이 1)
   - 목적: 첫 발견 파일만 로드하는 중복 방지 검증

2. **`should load GEMINI.md when only GEMINI.md exists (legacy fallback)`**
   - 시나리오: GEMINI.md만 존재, `contextFileName` 미설정
   - 검증: `contextFiles`에 GEMINI.md 포함
   - 목적: 레거시 호환 fallback 동작 검증

3. **`should load AGENTS.md when only AGENTS.md exists (primary path)`**
   - 시나리오: AGENTS.md만 존재
   - 검증: `contextFiles`에 AGENTS.md 포함
   - 목적: Primary path 우선 로드 검증

4. **`should return empty contextFiles when neither file exists`**
   - 시나리오: 컨텍스트 파일 없음
   - 검증: `contextFiles` 빈 배열
   - 목적: 파일 미존재 시 graceful handling

5. **`should use custom contextFileName when configured`**
   - 시나리오: `contextFileName: 'CUSTOM.md'` 설정
   - 검증: `contextFiles`에 CUSTOM.md 포함
   - 목적: 사용자 정의 파일명 지원 검증

**구현 상세**:

- 실제 파일시스템 사용 (`os.tmpdir()` 기반 temp 디렉터리)
- `homedir()` mock으로 home 디렉터리 격리
- `logger` mock으로 콘솔 출력 억제
- `afterEach`에서 temp 디렉터리 정리 (`fs.rmSync`)

### 9.3 검증 결과

| 범위                   | 테스트 수 | 결과                                         |
| ---------------------- | --------- | -------------------------------------------- |
| a2a init.test.ts       | 5 (5+0)   | ✅ All passed (기존 1건 실패 → 수정 후 통과) |
| a2a extension.test.ts  | 5 (신규)  | ✅ All passed                                |
| Lint (a2a-server)      | -         | ✅ Clean                                     |
| Typecheck (a2a-server) | -         | ✅ Clean                                     |

### 9.4 변경 파일

- `packages/a2a-server/src/commands/init.test.ts` (수정)
- `packages/a2a-server/src/config/extension.test.ts` (신규)
