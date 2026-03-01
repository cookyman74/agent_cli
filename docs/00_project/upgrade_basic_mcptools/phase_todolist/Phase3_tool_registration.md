# Phase 3: Core — 도구 등록 + 프롬프트 + 빌드 검증

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) — TDD 방법론
> - [plan_20260224.md](../plan_20260224.md) — Step 3~4: 도구 등록 및 UI 통합

---

## 작업 개요

| 항목        | 내용                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------ |
| 프로젝트    | Agent-CLI 기본 도구 업그레이드 — Task\* 도구 등록 + 프롬프트 통합                                                  |
| 영향 범위   | `packages/core/src/tools/tool-names.ts`, `packages/core/src/config/config.ts`, `packages/core/src/core/prompts.ts` |
| 위험 수준   | 🟡 Medium — 기존 `config.ts` 수정, `write_todos` 호환 유지, `prompts.ts` 수정 필요                                 |
| 성능 민감도 | 🟢 Low — 도구 등록은 startup 1회 실행                                                                              |
| 참고 설계   | [plan_20260224.md Step 3~4](../plan_20260224.md)                                                                   |
| 작업 브랜치 | `DID/v0.2`                                                                                                         |

---

## 핵심 리스크 요약

| 리스크                                                         | 영향      | 대응 방안                                                  | 상태 |
| -------------------------------------------------------------- | --------- | ---------------------------------------------------------- | ---- |
| `createToolRegistry()` 수정 시 기존 도구 등록 순서 영향        | 🟡 Medium | Task\* 도구를 write_todos 바로 뒤에 추가, 기존 순서 유지   | ✅   |
| `write_todos`와 Task\* 도구 동시 활성화 시 LLM 혼란            | 🟡 Medium | Phase A 전략: 공존 유지, `prompts.ts`에서 Task\* 우선 안내 | ✅   |
| TaskStore 인스턴스가 각 Task\* 도구에서 공유되지 않음          | 🟠 Medium | 단일 TaskStore 인스턴스 생성 후 4개 도구에 DI              | ✅   |
| `ALL_BUILTIN_TOOL_NAMES` 누락 시 getCoreTools 필터에서 제외    | 🟡 Medium | tool-names.ts에 4개 상수 + ALL_BUILTIN 배열 추가 확인      | ✅   |
| Task\* 도구가 `useWriteTodos` 게이트 우회 (Issue 7)            | 🟡 Medium | `getUseWriteTodos()` 동일 조건으로 Task\* 등록 게이트 적용 | ✅   |
| TodoTray "last wins" 동작으로 UI 혼동 가능 (Issue 6)           | 🟡 Medium | Phase A 공존에서 허용: 마지막 호출 도구의 todos만 표시됨   | ✅   |
| `prompts.ts` 미수정 시 LLM이 Task\* 도구 사용법 모름 (Issue 2) | 🟡 Medium | `prompts.ts`에 Task\* 조건부 프롬프트 삽입                 | ✅   |

---

## 3.1 사전 작업 (Pre-Work)

- [x] **[REVIEW]** Phase 2 작업 결과서 검토
  - 파일: `../working_history/Phase2_task_tools_{작업일자}.md`
  - 확인: Task\* 도구 4개 완성 여부, 빌드 상태

- [x] **[CONTEXT]** Phase 3 작업 목적 확인
  - 설계: [plan_20260224.md Step 3](../plan_20260224.md) — 도구 등록 전략
  - 설계: [plan_20260224.md Step 4](../plan_20260224.md) — TodoList 변환 (이미
    Phase 1~2에서 구현됨)

- [x] **[ANALYSIS-1]** 현재 `tool-names.ts` 구조 분석
  - 파일: `packages/core/src/tools/tool-names.ts`
  - 확인: 기존 상수 패턴 (`WRITE_TODOS_TOOL_NAME` 등)
  - 확인: `ALL_BUILTIN_TOOL_NAMES` 배열 구성
  - 확인: `PLAN_MODE_TOOLS` 배열 (Task\* 도구 포함 필요 여부 결정)

- [x] **[ANALYSIS-2]** 현재 `config.ts` createToolRegistry 분석
  - 파일: `packages/core/src/config/config.ts`
  - 확인: `registerCoreTool()` 패턴 (ToolClass, ...args)
  - 확인: `getUseWriteTodos()` 조건부 등록 패턴
  - 확인: MessageBus 전달 패턴 (마지막 인자로 자동 전달)
  - **핵심 (Issue 7)**:
    `useWriteTodos = isPreviewModel(model) ? false : (params.useWriteTodos ?? true)`
    — Task\* 도구도 동일 게이트 적용 필요

- [x] **[ANALYSIS-3]** 현재 `prompts.ts` 프롬프트 삽입 패턴 분석 (Issue 2)
  - 파일: `packages/core/src/core/prompts.ts`
  - 확인:
    `enableWriteTodosTool = config.getToolRegistry().getAllToolNames().includes(WriteTodosTool.Name)`
    패턴
  - 확인: 4개 워크플로우 variant에서 write_todos 안내 조건부 삽입 방식
  - **핵심**: Task\* 도구도 동일 패턴으로 조건부 삽입 필요

- [x] **[ANALYSIS-4]** TodoTray "last wins" 동작 이해 (Issue 6)
  - 파일: `packages/cli/src/ui/components/messages/Todo.tsx`
  - 확인: `TodoTray`가 `uiState.history`를 역순 탐색 → 마지막 `todos` 결과만
    표시
  - **Phase A 결정**: Task\*와 write_todos가 동일 UI 슬롯 공유하며 마지막
    호출자의 데이터만 표시 — 허용

- [x] **[ANALYSIS-5]** 기존 테스트 베이스라인
  ```bash
  npm test -w @didim365/agent-cli-core  # 전체 Core 테스트
  npm run build -w @didim365/agent-cli-core  # 빌드 확인
  ```

---

## 3.2 RED Phase: 도구 등록 + 프롬프트 + 빌드 검증 테스트

- [x] **[RED-1]** tool-names.ts 상수 존재 테스트

  ```typescript
  // 기존 테스트 파일 또는 별도 검증
  // tool-names.ts에서 export된 상수 확인
  import {
    TASK_CREATE_TOOL_NAME,
    TASK_GET_TOOL_NAME,
    TASK_UPDATE_TOOL_NAME,
    TASK_LIST_TOOL_NAME,
    ALL_BUILTIN_TOOL_NAMES,
  } from './tool-names.js';

  describe('Task tool names', () => {
    it('should export TASK_CREATE_TOOL_NAME as "task_create"', () => {
      expect(TASK_CREATE_TOOL_NAME).toBe('task_create');
    });

    it('should export TASK_GET_TOOL_NAME as "task_get"', () => {
      expect(TASK_GET_TOOL_NAME).toBe('task_get');
    });

    it('should export TASK_UPDATE_TOOL_NAME as "task_update"', () => {
      expect(TASK_UPDATE_TOOL_NAME).toBe('task_update');
    });

    it('should export TASK_LIST_TOOL_NAME as "task_list"', () => {
      expect(TASK_LIST_TOOL_NAME).toBe('task_list');
    });

    it('should include all Task* tools in ALL_BUILTIN_TOOL_NAMES', () => {
      expect(ALL_BUILTIN_TOOL_NAMES).toContain('task_create');
      expect(ALL_BUILTIN_TOOL_NAMES).toContain('task_get');
      expect(ALL_BUILTIN_TOOL_NAMES).toContain('task_update');
      expect(ALL_BUILTIN_TOOL_NAMES).toContain('task_list');
    });
  });
  ```

- [x] **[RED-2]** ToolRegistry에 Task\* 도구 등록 확인 테스트

  ```typescript
  // config.test.ts 또는 통합 테스트
  const signal = new AbortController().signal; // Issue 4: AbortSignal 필수

  describe('createToolRegistry - Task* tools', () => {
    it('should register task_create tool', async () => {
      const registry = await config.createToolRegistry();
      expect(registry.getTool('task_create')).toBeDefined();
    });

    it('should register task_get tool', async () => {
      const registry = await config.createToolRegistry();
      expect(registry.getTool('task_get')).toBeDefined();
    });

    it('should register task_update tool', async () => {
      const registry = await config.createToolRegistry();
      expect(registry.getTool('task_update')).toBeDefined();
    });

    it('should register task_list tool', async () => {
      const registry = await config.createToolRegistry();
      expect(registry.getTool('task_list')).toBeDefined();
    });

    it('should share the same TaskStore instance across all Task* tools', async () => {
      // TaskCreate로 태스크 생성 → TaskGet으로 조회 가능 확인
      const registry = await config.createToolRegistry();
      const createTool = registry.getTool('task_create');
      const getTool = registry.getTool('task_get');

      const createResult = await createTool.buildAndExecute(
        {
          subject: 'Test',
          description: 'Test desc',
        },
        signal,
      );
      const taskId = JSON.parse(createResult.llmContent as string).taskId;

      const getResult = await getTool.buildAndExecute({ taskId }, signal);
      expect(getResult.error).toBeUndefined();
    });

    it('should keep write_todos registered (coexistence)', async () => {
      const registry = await config.createToolRegistry();
      // write_todos가 활성화된 환경에서 공존 확인
      expect(registry.getTool('write_todos')).toBeDefined();
    });

    it('should gate Task* tools behind getUseWriteTodos() (Issue 7)', async () => {
      // useWriteTodos=false 환경 (preview model 등)에서는 Task* 미등록
      // 구현 시 getUseWriteTodos() 조건 확인
    });
  });
  ```

- [x] **[RED-3]** prompts.ts에 Task\* 도구 안내 포함 테스트 (Issue 2)

  ```typescript
  // prompts.test.ts (기존 파일에 추가 또는 신규)
  describe('prompts - Task* tools integration', () => {
    it('should include Task* tool guidance when task tools are registered', () => {
      // ToolRegistry에 task_create 등록된 상태에서 프롬프트 생성
      // → Task* 도구 사용 안내 문구 포함 확인
    });

    it('should not include Task* guidance when task tools are not registered', () => {
      // ToolRegistry에 task_create 미등록 상태 (preview model 등)
      // → Task* 도구 안내 문구 미포함 확인
    });
  });
  ```

- [x] **[RED-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/tool-names  # FAIL (상수 미존재)
  ```

---

## 3.3 GREEN Phase: tool-names.ts + config.ts + prompts.ts 수정

- [x] **[TASK-001]** `tool-names.ts`에 Task\* 상수 추가
  - 파일: `packages/core/src/tools/tool-names.ts`
  - 변경:
    ```typescript
    // Task* 도구 상수 추가
    export const TASK_CREATE_TOOL_NAME = 'task_create';
    export const TASK_GET_TOOL_NAME = 'task_get';
    export const TASK_UPDATE_TOOL_NAME = 'task_update';
    export const TASK_LIST_TOOL_NAME = 'task_list';
    ```
  - `ALL_BUILTIN_TOOL_NAMES` 배열에 4개 상수 추가

- [x] **[TASK-002]** `config.ts` createToolRegistry에 Task\* 등록 (Issue 7
      게이트 적용)
  - 파일: `packages/core/src/config/config.ts`
  - 위치: `registerCoreTool(WriteTodosTool)` 근처
  - 변경:

    ```typescript
    // Issue 7: Task* 도구도 write_todos와 동일 게이트 적용
    if (this.getUseWriteTodos()) {
      registerCoreTool(WriteTodosTool);

      // TaskStore 인스턴스 생성 (단일 인스턴스 공유)
      const taskStore = new TaskStore();

      // Task* 도구 등록 — Phase A 공존 전략
      registerCoreTool(TaskCreateTool, taskStore);
      registerCoreTool(TaskGetTool, taskStore);
      registerCoreTool(TaskUpdateTool, taskStore);
      registerCoreTool(TaskListTool, taskStore);
    }
    ```

  - **핵심**: `taskStore`를 `config.ts` 내에서 생성하여 4개 도구에 동일 인스턴스
    DI
  - **Issue 7 적용**: Task\* 도구가 `getUseWriteTodos()` 동일 조건 내에서 등록
  - **공존 전략**: `write_todos`와 Task\* 도구가 같은 조건 블록 내에서 함께 등록

- [x] **[TASK-003]** `prompts.ts`에 Task\* 도구 안내 조건부 삽입 (Issue 2)
  - 파일: `packages/core/src/core/prompts.ts`
  - 변경: 기존 `enableWriteTodosTool` 패턴을 참조하여 Task\* 도구 안내 추가

    ```typescript
    // 기존 패턴 참조:
    // const enableWriteTodosTool = config.getToolRegistry().getAllToolNames().includes(WriteTodosTool.Name);

    const enableTaskTools = config
      .getToolRegistry()
      .getAllToolNames()
      .includes('task_create');

    // Task* 도구 등록 시 LLM 안내 삽입
    if (enableTaskTools) {
      // Task* CRUD 도구 사용 안내 (write_todos 대신 Task* 우선 사용 권장)
      // 기존 write_todos 안내와 공존: "Task* 도구가 사용 가능한 경우 우선 사용"
    }
    ```

  - **핵심**: LLM이 Task\* 도구 존재를 인지하고 우선 사용하도록 안내

- [x] **[TASK-004]** import 추가
  - `config.ts`에 TaskStore, TaskCreateTool, TaskGetTool, TaskUpdateTool,
    TaskListTool import

- [x] **[TASK-005]** `prompts.test.ts` 스냅샷 갱신 (Issue 5)
  - 파일: `packages/core/src/core/prompts.test.ts`
  - 스냅샷 파일: `packages/core/src/core/__snapshots__/prompts.test.ts.snap`
    (233KB, 11개 테스트)
  - **핵심**: `prompts.ts` 수정 시 시스템 프롬프트 출력이 변경되므로 기존
    스냅샷이 깨짐
  - 절차:

    ```bash
    # 1. 스냅샷 테스트 실패 확인
    npm test -w @didim365/agent-cli-core -- src/core/prompts.test  # FAIL (snapshot mismatch)

    # 2. 스냅샷 갱신
    npm test -w @didim365/agent-cli-core -- src/core/prompts.test --update  # 스냅샷 업데이트

    # 3. diff 수동 확인 — Task* 도구 안내 문구만 추가되었는지 검증
    git diff packages/core/src/core/__snapshots__/prompts.test.ts.snap
    ```

  - **⚠️ 주의**: 스냅샷 diff에서 Task\* 관련 변경분 외에 의도치 않은 변경이
    없는지 반드시 확인

- [x] **[GREEN-VERIFY]** 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/tool-names  # PASS
  npm test -w @didim365/agent-cli-core -- src/core/prompts.test  # PASS (스냅샷 갱신 후)
  npm run build -w @didim365/agent-cli-core  # 빌드 성공
  ```

---

## 3.4 REFACTOR Phase: 코드 정리

- [x] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - `config.ts`: TaskStore 생성 위치를 `getUseWriteTodos()` 조건 블록 내
    상단으로 정리
  - `tool-names.ts`: Task\* 상수를 기존 상수와 동일한 그룹/정렬 패턴으로 배치
  - `prompts.ts`: Task\* 안내 삽입 위치와 포맷을 기존 write_todos 패턴과
    일관되게 정리

- [x] **[REFACTOR-DOCS]** Phase A 공존 전략 관련 주석 추가
  - `config.ts`: write_todos와 Task\* 도구의 공존 관계 설명
  - **TodoTray "last wins" 동작 문서화 (Issue 6)**:
    > TodoTray는 `uiState.history`를 역순 탐색하여 마지막 `returnDisplay.todos`
    > 결과만 표시. Task\*와 write_todos가 동일 UI 슬롯을 공유하므로 마지막 호출
    > 도구의 데이터만 보인다. Phase A(공존) 전략에서는 이 동작을 허용하며, 추후
    > Phase B(전환) 시 write_todos 제거로 해소.

- [x] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core  # 전체 Core 테스트 PASS
  ```

---

## 3.5 사후 작업 (Post-Work)

- [x] **[TEST]** 전체 테스트 실행

  ```bash
  npm test -w @didim365/agent-cli-core  # Phase 1~3 통합
  ```

- [x] **[BUILD]** 전체 빌드 확인

  ```bash
  npm run build -w @didim365/agent-cli-core
  npm run build -w @didim365/agent-cli  # CLI도 빌드 확인 (Core 의존)
  ```

- [x] **[LINT]** 린터 + 타입체크

  ```bash
  npm run lint -w @didim365/agent-cli-core
  npm run typecheck -w @didim365/agent-cli-core
  npm run typecheck -w @didim365/agent-cli  # CLI 타입체크도 확인
  ```

- [x] **[VERIFY]** 기능 검증
  - 확인 항목 1: `task_create`, `task_get`, `task_update`, `task_list` →
    ALL_BUILTIN 포함
  - 확인 항목 2: ToolRegistry에 Task\* 4개 도구 등록 확인
  - 확인 항목 3: 동일 TaskStore 인스턴스 공유 (Create → Get 왕복 테스트)
  - 확인 항목 4: write_todos 도구 공존 확인
  - 확인 항목 5: **Task\* 도구가 `getUseWriteTodos()` 게이트 내에서 등록 확인
    (Issue 7)**
  - 확인 항목 6: **`prompts.ts`에 Task\* 도구 안내 조건부 삽입 확인 (Issue 2)**
  - 확인 항목 7: Phase 1~2 회귀 테스트 통과

- [x] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase3_tool_registration_{작업일자}.md`

- [x] **[COMMIT]** 변경사항 커밋

  ```bash
  git add packages/core/src/tools/tool-names.ts packages/core/src/config/config.ts packages/core/src/core/prompts.ts
  git commit -m "feat(core): register Task* tools in ToolRegistry with prompts.ts integration"
  ```

---

## Phase 완료 조건

| 검증 항목                                                 | 상태 |
| --------------------------------------------------------- | ---- |
| RED: tool-names + ToolRegistry + prompts 등록 테스트 작성 | ✅   |
| GREEN: tool-names.ts + config.ts + prompts.ts 수정 + 통과 | ✅   |
| REFACTOR: 코드 정리 + TodoTray "last wins" 문서화         | ✅   |
| Core 빌드 성공                                            | ✅   |
| CLI 빌드 성공 (Core 의존 확인)                            | ✅   |
| Lint + Typecheck 통과 (Core + CLI)                        | ✅   |
| Phase 1~2 회귀 없음                                       | ✅   |
| write_todos 공존 확인                                     | ✅   |
| Task\* useWriteTodos 게이트 적용 확인 (Issue 7)           | ✅   |
| prompts.ts Task\* 안내 삽입 확인 (Issue 2)                | ✅   |
| TodoTray "last wins" 동작 문서화 (Issue 6)                | ✅   |
| 작업 결과서 작성                                          | ✅   |
| 커밋 완료                                                 | ✅   |

---

**작성일**: 2026-03-01 **완료일**: 2026-03-01 **상태**: ✅ Phase 3 완료 (도구
등록 + 프롬프트 통합)
