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
    - `['GEMINI.md']` → `[DEFAULT_CONTEXT_FILENAME]`
- `packages/a2a-server/src/config/extension.ts`
  - 동일하게 기본값을 `[DEFAULT_CONTEXT_FILENAME]`로 전환

### 2.4 `/memory` 및 UI 노출 문구 정리

- `packages/core/src/commands/memory.ts`
  - `/memory list` 응답에서 하드코딩 `GEMINI.md` 제거
  - 현재 설정 파일명(`getCurrentGeminiMdFilename()`) 기준 출력
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
  src/commands/memory.test.ts \
  src/config/extension.test.ts
```

- 결과: PASS (`12 passed`)

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
