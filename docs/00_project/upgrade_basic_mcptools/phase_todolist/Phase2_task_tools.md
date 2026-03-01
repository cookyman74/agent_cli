# Phase 2: Core — Task\* 도구 4개 구현

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) — TDD 방법론
> - [plan_20260224.md](../plan_20260224.md) — Step 2: Task\* 도구 4개 설계

---

## 작업 개요

| 항목        | 내용                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------- |
| 프로젝트    | Agent-CLI 기본 도구 업그레이드 — Task\* 도구 4개                                         |
| 영향 범위   | `task-create.ts`, `task-get.ts`, `task-update.ts`, `task-list.ts` + 각 테스트 (8개 파일) |
| 위험 수준   | 🟡 Medium — 4개 도구 동시 구현, BaseDeclarativeTool 패턴 준수 필요                       |
| 성능 민감도 | 🟢 Low — 인메모리 TaskStore 호출, 런타임 성능 영향 미미                                  |
| 참고 설계   | [plan_20260224.md Step 2](../plan_20260224.md)                                           |
| 작업 브랜치 | `DID/v0.2`                                                                               |

---

## 핵심 리스크 요약

| 리스크                                                  | 영향      | 대응 방안                                              | 상태 |
| ------------------------------------------------------- | --------- | ------------------------------------------------------ | ---- |
| BaseDeclarativeTool 패턴 미준수                         | 🟠 Medium | WriteTodosTool/AskUserTool 패턴 엄밀 참조              | ⬜   |
| TaskStore DI 주입 패턴 불일치                           | 🟡 Medium | 기존 도구의 Config DI 패턴 참조 (constructor 인자)     | ⬜   |
| `returnDisplay: { todos }` 포맷 불일치                  | 🟠 Medium | `toTodoList()` 반환값이 기존 `Todo[]`와 동일 형식 검증 | ⬜   |
| TaskUpdateTool 파라미터 복잡도 (status + 필드 + 의존성) | 🟡 Medium | 단계적 테스트 (상태만 → 필드 → 의존성 → 삭제)          | ⬜   |

---

## 2.1 사전 작업 (Pre-Work)

- [ ] **[REVIEW]** Phase 1 작업 결과서 검토
  - 파일: `../working_history/Phase1_task_store_{작업일자}.md`
  - 확인: TaskStore 완성 여부, 테스트 통과 상태, 발견 이슈

- [ ] **[CONTEXT]** Phase 2 작업 목적 확인
  - 설계: [plan_20260224.md Step 2](../plan_20260224.md) — 도구 4개 상세 설계
  - 패턴 참조: `packages/core/src/tools/write-todos.ts` — BaseDeclarativeTool
    패턴

- [ ] **[ANALYSIS-1]** BaseDeclarativeTool 패턴 분석
  - 파일: `packages/core/src/tools/tools.ts`
  - 확인: constructor 시그니처
    (`name, displayName, description, kind, parameterSchema, messageBus, isOutputMarkdown, canUpdateOutput`)
  - 확인: `validateToolParamValues()` override 패턴
  - 확인: `createInvocation()` 팩토리 메서드 패턴

- [ ] **[ANALYSIS-2]** WriteTodosTool 구현 패턴 상세 분석
  - 파일: `packages/core/src/tools/write-todos.ts`
  - 확인: Invocation 클래스 구조, `getDescription()`, `execute()` 패턴
  - 확인: `returnDisplay: { todos }` 반환 형식
  - 확인: `shouldConfirmExecute()` → false 패턴

- [ ] **[ANALYSIS-2.1]** buildAndExecute 시그니처 확인 (Issue 4)
  - 파일: `packages/core/src/tools/tools.ts`
  - 확인:
    `buildAndExecute(params: TParams, signal: AbortSignal, updateOutput?, shellExecutionConfig?)`
  - **핵심**: AbortSignal이 2번째 필수 인자 → 모든 테스트에서
    `new AbortController().signal` 전달 필수
  - 참고: `packages/core/src/tools/write-todos.test.ts` —
    `const signal = new AbortController().signal` 패턴

- [ ] **[ANALYSIS-3]** ToolResult/Kind 타입 확인
  - 확인: `Kind.Other`, `ToolResult` 인터페이스, `ToolErrorType` enum

- [ ] **[ANALYSIS-4]** 기존 테스트 베이스라인
  ```bash
  npm test -w @didim365/agent-cli-core  # 전체 Core 테스트 PASS 확인
  ```

---

## 2.2 RED Phase (Part A): TaskCreate + TaskGet 테스트

### 2.2.1 TaskCreateTool 테스트

- [ ] **[RED-1]** TaskCreate 기본 동작 테스트

  ```typescript
  // packages/core/src/tools/task-create.test.ts (신규)
  import { TaskStore } from './task-store.js';
  import { TaskCreateTool } from './task-create.js';
  import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

  describe('TaskCreateTool', () => {
    let store: TaskStore;
    let tool: TaskCreateTool;
    const signal = new AbortController().signal; // Issue 4: AbortSignal 필수

    beforeEach(() => {
      store = new TaskStore();
      const mockMessageBus = createMockMessageBus();
      tool = new TaskCreateTool(store, mockMessageBus);
    });

    it('should have correct tool name "task_create"', () => {
      expect(tool.name).toBe('task_create');
    });

    describe('execute', () => {
      it('should create task and return taskId in llmContent', async () => {
        const result = await tool.buildAndExecute(
          {
            subject: 'Fix auth bug',
            description: 'Fix the authentication bug in login flow',
            activeForm: 'Fixing auth bug',
          },
          signal,
        );

        expect(result.error).toBeUndefined();
        const parsed = JSON.parse(result.llmContent as string);
        expect(parsed.taskId).toBe('1');
        expect(parsed.subject).toBe('Fix auth bug');
        expect(parsed.status).toBe('pending');
      });

      it('should return todos in returnDisplay for TodoTray', async () => {
        const result = await tool.buildAndExecute(
          {
            subject: 'Task 1',
            description: 'First task',
          },
          signal,
        );

        expect(result.returnDisplay).toEqual({
          todos: [{ description: 'Task 1', status: 'pending' }],
        });
      });

      it('should validate required subject parameter', async () => {
        const result = await tool.buildAndExecute(
          {
            description: 'Missing subject',
          } as any,
          signal,
        );

        expect(result.error).toBeDefined();
      });

      it('should validate required description parameter', async () => {
        const result = await tool.buildAndExecute(
          {
            subject: 'Missing description',
          } as any,
          signal,
        );

        expect(result.error).toBeDefined();
      });
    });
  });
  ```

### 2.2.2 TaskGetTool 테스트

- [ ] **[RED-2]** TaskGet 기본 동작 테스트

  ```typescript
  // packages/core/src/tools/task-get.test.ts (신규)
  import { TaskStore } from './task-store.js';
  import { TaskGetTool } from './task-get.js';
  import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

  describe('TaskGetTool', () => {
    let store: TaskStore;
    let tool: TaskGetTool;
    const signal = new AbortController().signal; // Issue 4: AbortSignal 필수

    beforeEach(() => {
      store = new TaskStore();
      const mockMessageBus = createMockMessageBus();
      tool = new TaskGetTool(store, mockMessageBus);
      store.create({ subject: 'Test Task', description: 'Test description' });
    });

    it('should have correct tool name "task_get"', () => {
      expect(tool.name).toBe('task_get');
    });

    describe('execute', () => {
      it('should return full task details in llmContent', async () => {
        const result = await tool.buildAndExecute({ taskId: '1' }, signal);

        expect(result.error).toBeUndefined();
        const parsed = JSON.parse(result.llmContent as string);
        expect(parsed.id).toBe('1');
        expect(parsed.subject).toBe('Test Task');
        expect(parsed.description).toBe('Test description');
        expect(parsed.status).toBe('pending');
        expect(parsed.blocks).toEqual([]);
        expect(parsed.blockedBy).toEqual([]);
      });

      it('should return error for non-existent task', async () => {
        const result = await tool.buildAndExecute({ taskId: '999' }, signal);

        expect(result.error).toBeDefined();
        expect(result.error!.message).toContain('not found');
      });

      it('should validate required taskId parameter', async () => {
        const result = await tool.buildAndExecute({} as any, signal);

        expect(result.error).toBeDefined();
      });
    });
  });
  ```

- [ ] **[RED-VERIFY-A]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-create.test  # FAIL
  npm test -w @didim365/agent-cli-core -- src/tools/task-get.test     # FAIL
  ```

---

## 2.3 GREEN Phase (Part A): TaskCreate + TaskGet 구현

- [ ] **[TASK-001]** `task-create.ts` 생성
  - 파일: `packages/core/src/tools/task-create.ts` (신규)
  - 내용:
    - `TaskCreateParams` 인터페이스 (subject, description, activeForm?,
      metadata?)
    - `TaskCreateToolInvocation` — execute()에서 `taskStore.create()` 호출
    - `TaskCreateTool` — BaseDeclarativeTool 확장, Kind.Other
    - JSON Schema: subject(필수, string), description(필수, string),
      activeForm(선택), metadata(선택, object)
    - `returnDisplay: { todos: taskStore.toTodoList() }`
  - 참고: WriteTodosTool 패턴 (constructor DI: TaskStore + MessageBus)

- [ ] **[TASK-002]** `task-get.ts` 생성
  - 파일: `packages/core/src/tools/task-get.ts` (신규)
  - 내용:
    - `TaskGetParams` 인터페이스 (taskId: string)
    - `TaskGetToolInvocation` — execute()에서 `taskStore.get()` 호출
    - `TaskGetTool` — BaseDeclarativeTool 확장, Kind.Other
    - 미존재 시 `error: { message, type: ToolErrorType.INVALID_TOOL_PARAMS }`

- [ ] **[GREEN-VERIFY-A]** TaskCreate + TaskGet 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-create.test  # PASS
  npm test -w @didim365/agent-cli-core -- src/tools/task-get.test     # PASS
  ```

---

## 2.4 RED Phase (Part B): TaskUpdate + TaskList 테스트

### 2.4.1 TaskUpdateTool 테스트

- [ ] **[RED-3]** TaskUpdate 상태 변경 테스트

  ```typescript
  // packages/core/src/tools/task-update.test.ts (신규)
  import { TaskStore } from './task-store.js';
  import { TaskUpdateTool } from './task-update.js';
  import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

  describe('TaskUpdateTool', () => {
    let store: TaskStore;
    let tool: TaskUpdateTool;
    const signal = new AbortController().signal; // Issue 4: AbortSignal 필수

    beforeEach(() => {
      store = new TaskStore();
      const mockMessageBus = createMockMessageBus();
      tool = new TaskUpdateTool(store, mockMessageBus);
      store.create({ subject: 'Test Task', description: 'Desc' });
    });

    it('should have correct tool name "task_update"', () => {
      expect(tool.name).toBe('task_update');
    });

    describe('status update', () => {
      it('should update task status to in_progress', async () => {
        const result = await tool.buildAndExecute(
          {
            taskId: '1',
            status: 'in_progress',
          },
          signal,
        );

        expect(result.error).toBeUndefined();
        const parsed = JSON.parse(result.llmContent as string);
        expect(parsed.status).toBe('in_progress');
      });

      it('should reject invalid status transition', async () => {
        store.update('1', { status: 'completed' });
        const result = await tool.buildAndExecute(
          {
            taskId: '1',
            status: 'in_progress',
          },
          signal,
        );

        expect(result.error).toBeDefined();
      });
    });

    describe('delete', () => {
      it('should delete task when status is "deleted"', async () => {
        const result = await tool.buildAndExecute(
          {
            taskId: '1',
            status: 'deleted',
          },
          signal,
        );

        expect(result.error).toBeUndefined();
        expect(result.llmContent).toContain('deleted');
        expect(store.get('1')).toBeNull();
      });

      it('should return error when deleting non-existent task', async () => {
        const result = await tool.buildAndExecute(
          {
            taskId: '999',
            status: 'deleted',
          },
          signal,
        );

        expect(result.error).toBeDefined();
      });
    });

    describe('field update', () => {
      it('should update subject and description', async () => {
        const result = await tool.buildAndExecute(
          {
            taskId: '1',
            subject: 'Updated Subject',
            description: 'Updated Desc',
          },
          signal,
        );

        expect(result.error).toBeUndefined();
        const task = store.get('1')!;
        expect(task.subject).toBe('Updated Subject');
        expect(task.description).toBe('Updated Desc');
      });

      it('should update owner', async () => {
        const result = await tool.buildAndExecute(
          {
            taskId: '1',
            owner: 'sub-agent-1',
          },
          signal,
        );

        expect(result.error).toBeUndefined();
        expect(store.get('1')!.owner).toBe('sub-agent-1');
      });

      it('should merge metadata', async () => {
        store.update('1', { metadata: { a: 1 } });
        const result = await tool.buildAndExecute(
          {
            taskId: '1',
            metadata: { b: 2 },
          },
          signal,
        );

        expect(result.error).toBeUndefined();
        expect(store.get('1')!.metadata).toEqual({ a: 1, b: 2 });
      });
    });

    describe('dependency management', () => {
      it('should add blocks via addBlocks parameter', async () => {
        store.create({ subject: 'Task 2', description: 'Second' });
        const result = await tool.buildAndExecute(
          {
            taskId: '1',
            addBlocks: ['2'],
          },
          signal,
        );

        expect(result.error).toBeUndefined();
        expect(store.get('1')!.blocks).toContain('2');
        expect(store.get('2')!.blockedBy).toContain('1');
      });

      it('should add blockedBy via addBlockedBy parameter', async () => {
        store.create({ subject: 'Task 2', description: 'Second' });
        const result = await tool.buildAndExecute(
          {
            taskId: '2',
            addBlockedBy: ['1'],
          },
          signal,
        );

        expect(result.error).toBeUndefined();
        expect(store.get('2')!.blockedBy).toContain('1');
      });
    });

    describe('returnDisplay', () => {
      it('should return todos in returnDisplay', async () => {
        const result = await tool.buildAndExecute(
          {
            taskId: '1',
            status: 'in_progress',
          },
          signal,
        );

        expect(result.returnDisplay).toEqual({
          todos: expect.any(Array),
        });
      });
    });

    it('should return error for non-existent task', async () => {
      const result = await tool.buildAndExecute(
        {
          taskId: '999',
          subject: 'Update',
        },
        signal,
      );

      expect(result.error).toBeDefined();
    });
  });
  ```

### 2.4.2 TaskListTool 테스트

- [ ] **[RED-4]** TaskList 기본 동작 테스트

  ```typescript
  // packages/core/src/tools/task-list.test.ts (신규)
  import { TaskStore } from './task-store.js';
  import { TaskListTool } from './task-list.js';
  import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

  describe('TaskListTool', () => {
    let store: TaskStore;
    let tool: TaskListTool;
    const signal = new AbortController().signal; // Issue 4: AbortSignal 필수

    beforeEach(() => {
      store = new TaskStore();
      const mockMessageBus = createMockMessageBus();
      tool = new TaskListTool(store, mockMessageBus);
    });

    it('should have correct tool name "task_list"', () => {
      expect(tool.name).toBe('task_list');
    });

    describe('execute', () => {
      it('should return "No tasks found." when empty', async () => {
        const result = await tool.buildAndExecute({}, signal);

        expect(result.llmContent).toBe('No tasks found.');
      });

      it('should return task summaries as JSON in llmContent', async () => {
        store.create({ subject: 'Task 1', description: 'First' });
        store.create({ subject: 'Task 2', description: 'Second' });

        const result = await tool.buildAndExecute({}, signal);

        const parsed = JSON.parse(result.llmContent as string);
        expect(parsed).toHaveLength(2);
        expect(parsed[0].id).toBe('1');
        expect(parsed[0].subject).toBe('Task 1');
        expect(parsed[0].status).toBe('pending');
      });

      it('should return todos in returnDisplay', async () => {
        store.create({ subject: 'Task 1', description: 'First' });

        const result = await tool.buildAndExecute({}, signal);

        expect(result.returnDisplay).toEqual({
          todos: [{ description: 'Task 1', status: 'pending' }],
        });
      });

      it('should require no parameters', async () => {
        store.create({ subject: 'Task 1', description: 'First' });
        const result = await tool.buildAndExecute({}, signal);
        expect(result.error).toBeUndefined();
      });
    });
  });
  ```

- [ ] **[RED-VERIFY-B]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-update.test  # FAIL
  npm test -w @didim365/agent-cli-core -- src/tools/task-list.test    # FAIL
  ```

---

## 2.5 GREEN Phase (Part B): TaskUpdate + TaskList 구현

- [ ] **[TASK-003]** `task-update.ts` 생성
  - 파일: `packages/core/src/tools/task-update.ts` (신규)
  - 내용:
    - `TaskUpdateParams` 인터페이스 (taskId, status?, subject?, description?,
      activeForm?, owner?, metadata?, addBlocks?, addBlockedBy?)
    - `TaskUpdateToolInvocation` — execute():
      - `status === 'deleted'` → `taskStore.delete()` 호출
      - 그 외 → `taskStore.update()` + `addBlocks`/`addBlockedBy` 처리
    - `TaskUpdateTool` — BaseDeclarativeTool 확장
    - JSON Schema: taskId(필수), 나머지 선택. status는 enum
      `['pending', 'in_progress', 'completed', 'deleted']`
    - `returnDisplay: { todos: taskStore.toTodoList() }`

- [ ] **[TASK-004]** `task-list.ts` 생성
  - 파일: `packages/core/src/tools/task-list.ts` (신규)
  - 내용:
    - `TaskListParams` 인터페이스 (빈 객체)
    - `TaskListToolInvocation` — execute():
      - `taskStore.list()` → 빈 목록이면 `'No tasks found.'`
      - 있으면 `JSON.stringify(summaries)` + `{ todos: taskStore.toTodoList() }`
    - `TaskListTool` — BaseDeclarativeTool 확장
    - JSON Schema: `{ type: 'object', properties: {} }` (파라미터 없음)

- [ ] **[GREEN-VERIFY-B]** TaskUpdate + TaskList 테스트 통과
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-update.test  # PASS
  npm test -w @didim365/agent-cli-core -- src/tools/task-list.test    # PASS
  ```

---

## 2.6 REFACTOR Phase: 코드 개선

- [ ] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - 4개 도구 간 공통 패턴 확인 및 추출:
    - 에러 응답 생성 헬퍼: `createNotFoundError(taskId)` → 중복 에러 메시지 제거
    - `returnDisplay` 생성 헬퍼: `createTodoDisplay(taskStore)` → 중복
      `toTodoList()` 호출 정리
  - 각 도구 파일의 LLM description 문자열 정리 (일관된 포맷)
  - import 순서 통일 (도구 → 타입 → 상수)

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-create.test
  npm test -w @didim365/agent-cli-core -- src/tools/task-get.test
  npm test -w @didim365/agent-cli-core -- src/tools/task-update.test
  npm test -w @didim365/agent-cli-core -- src/tools/task-list.test
  ```

---

## 2.7 사후 작업 (Post-Work)

- [ ] **[TEST]** 전체 Core 테스트 실행

  ```bash
  npm test -w @didim365/agent-cli-core
  ```

- [ ] **[BUILD]** Core 빌드 확인

  ```bash
  npm run build -w @didim365/agent-cli-core
  ```

- [ ] **[LINT]** 린터 + 타입체크

  ```bash
  npm run lint -w @didim365/agent-cli-core
  npm run typecheck -w @didim365/agent-cli-core
  ```

- [ ] **[VERIFY]** 기능 검증
  - 확인 항목 1: TaskCreate → 태스크 생성 + 자동 ID + returnDisplay todos
  - 확인 항목 2: TaskGet → 미존재 시 에러, 존재 시 상세 JSON
  - 확인 항목 3: TaskUpdate 'deleted' → 물리 삭제 + returnDisplay 갱신
  - 확인 항목 4: TaskUpdate addBlocks → 양방향 관계 설정
  - 확인 항목 5: TaskList → 빈 목록 메시지, 목록 JSON + returnDisplay todos
  - 확인 항목 6: Phase 1 TaskStore 테스트 회귀 없음

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase2_task_tools_{작업일자}.md`

- [ ] **[COMMIT]** 변경사항 커밋 (Tidy First: 구조 → 동작 분리)

  ```bash
  # 1차 커밋: TaskCreate + TaskGet 신규 (구조적 변경)
  git add packages/core/src/tools/task-create.ts packages/core/src/tools/task-create.test.ts
  git add packages/core/src/tools/task-get.ts packages/core/src/tools/task-get.test.ts
  git commit -m "feat(core): add TaskCreate + TaskGet tools"

  # 2차 커밋: TaskUpdate + TaskList (동작 변경 — 기존 todoList 변환 포함)
  git add packages/core/src/tools/task-update.ts packages/core/src/tools/task-update.test.ts
  git add packages/core/src/tools/task-list.ts packages/core/src/tools/task-list.test.ts
  git commit -m "feat(core): add TaskUpdate + TaskList tools with TodoList conversion"
  ```

---

## Phase 완료 조건

| 검증 항목                                   | 상태 |
| ------------------------------------------- | ---- |
| RED(A): TaskCreate + TaskGet 테스트 작성    | ⬜   |
| GREEN(A): TaskCreate + TaskGet 구현 + 통과  | ⬜   |
| RED(B): TaskUpdate + TaskList 테스트 작성   | ⬜   |
| GREEN(B): TaskUpdate + TaskList 구현 + 통과 | ⬜   |
| REFACTOR: 공통 패턴 추출, 구조 개선         | ⬜   |
| Core 빌드 성공                              | ⬜   |
| Lint + Typecheck 통과                       | ⬜   |
| Phase 1 TaskStore 회귀 없음                 | ⬜   |
| 작업 결과서 작성                            | ⬜   |
| 커밋 완료                                   | ⬜   |

---

**작성일**: 2026-03-01 **상태**: ⬜ 작성 중
