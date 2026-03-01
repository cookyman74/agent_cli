# Phase 1: Core — TaskStore 인메모리 태스크 저장소

> **TDD 방법론 기반**: Red → Green → Refactor 사이클 적용 **작업 원칙**: 테스트
> 먼저 작성 → 최소 코드 구현 → 리팩터링 **리팩터링 원칙**: "Make it work → Make
> it right → Make it fast" **참고 문서**:
>
> - [99_TDD_plan.md](../../ai_adapter/template/99_TDD_plan.md) — TDD 방법론
> - [plan_20260224.md](../plan_20260224.md) — Step 1: TaskStore 설계

---

## 작업 개요

| 항목        | 내용                                                                        |
| ----------- | --------------------------------------------------------------------------- |
| 프로젝트    | Agent-CLI 기본 도구 업그레이드 — TaskStore                                  |
| 영향 범위   | `packages/core/src/tools/task-store.ts` (신규), `task-store.test.ts` (신규) |
| 위험 수준   | 🟢 Low — 신규 파일 추가, 기존 코드 영향 없음                                |
| 성능 민감도 | 🟢 Low — 인메모리 Map, 세션 단위 수명                                       |
| 참고 설계   | [plan_20260224.md Step 1](../plan_20260224.md)                              |
| 작업 브랜치 | `DID/v0.2`                                                                  |

---

## 핵심 리스크 요약

| 리스크                                       | 영향      | 대응 방안                                   | 상태 |
| -------------------------------------------- | --------- | ------------------------------------------- | ---- |
| `completed` 상태에서 재변경 허용 실수        | 🟡 Medium | 상태 전이 검증 로직 + 전용 테스트           | ⬜   |
| `delete` 시 양방향 의존성 참조 정합성        | 🟡 Medium | 삭제 시 blocks/blockedBy 양쪽 정리 + 테스트 | ⬜   |
| `toTodoList()` 변환 시 기존 Todo 포맷 불일치 | 🟡 Medium | write_todos의 Todo 인터페이스 정확히 참조   | ⬜   |

---

## 1.1 사전 작업 (Pre-Work)

> **목적**: 본작업의 실패를 줄이기 위한 작업 준비 과정 **원칙**: 설계 문서와
> 기존 코드를 정확히 이해한 뒤 시작

- [ ] **[CONTEXT]** 작업 목적 및 배경 확인
  - 설계 문서 검토: [plan_20260224.md Step 1](../plan_20260224.md) — TaskStore
    설계
  - Claude Code의 TaskCreate/TaskGet/TaskUpdate/TaskList 동작 이해

- [ ] **[ANALYSIS-1]** 현재 `write_todos` 도구 분석
  - 파일: `packages/core/src/tools/write-todos.ts`
  - 확인: `Todo` 인터페이스 (`description`, `status`),
    `returnDisplay: { todos }` 포맷
  - 확인: `TODO_STATUSES` 배열 (`pending | in_progress | completed | cancelled`)

- [ ] **[ANALYSIS-2]** 기존 `Todo` 타입 참조 위치 분석
  - 파일: `packages/core/src/tools/write-todos.ts`
  - 확인: `Todo` 인터페이스 export 여부, CLI 측 TodoTray 참조 경로
  - **핵심**: `toTodoList()` 반환 타입이 기존 `Todo[]`와 정확히 호환되어야 함

- [ ] **[ANALYSIS-3]** `MessageBus` 패턴 확인
  - 파일: `packages/core/src/confirmation-bus/types.ts`
  - 확인: 기존 도구들이 MessageBus를 어떻게 전달받는지 패턴 확인

- [ ] **[ANALYSIS-4]** 기존 테스트 환경 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- --list  # 테스트 파일 목록
  ```

---

## 1.2 RED Phase: 실패 테스트 작성

> **목적**: 구현할 기능을 정의하는 실패 테스트 작성 **원칙**: 테스트가 실패하는
> 것을 확인한 후에만 구현 시작

### 1.2.1 CRUD 기본 테스트

- [ ] **[RED-1]** Task 생성 테스트

  ```typescript
  // packages/core/src/tools/task-store.test.ts (신규)
  import { TaskStore } from './task-store.js';

  describe('TaskStore', () => {
    let store: TaskStore;

    beforeEach(() => {
      store = new TaskStore();
    });

    describe('create', () => {
      it('should create task with auto-incrementing ID starting at "1"', () => {
        const task = store.create({
          subject: 'Run tests',
          description: 'Execute all unit tests',
        });
        expect(task.id).toBe('1');
        expect(task.subject).toBe('Run tests');
        expect(task.description).toBe('Execute all unit tests');
        expect(task.status).toBe('pending');
        expect(task.blocks).toEqual([]);
        expect(task.blockedBy).toEqual([]);
        expect(task.createdAt).toBeGreaterThan(0);
        expect(task.updatedAt).toBeGreaterThan(0);
      });

      it('should assign sequential IDs', () => {
        const task1 = store.create({ subject: 'Task 1', description: 'First' });
        const task2 = store.create({
          subject: 'Task 2',
          description: 'Second',
        });
        expect(task1.id).toBe('1');
        expect(task2.id).toBe('2');
      });

      it('should store optional activeForm and metadata', () => {
        const task = store.create({
          subject: 'Fix bug',
          description: 'Fix the auth bug',
          activeForm: 'Fixing auth bug',
          metadata: { priority: 'high' },
        });
        expect(task.activeForm).toBe('Fixing auth bug');
        expect(task.metadata).toEqual({ priority: 'high' });
      });
    });
  });
  ```

- [ ] **[RED-2]** Task 조회 테스트

  ```typescript
  describe('get', () => {
    it('should get task by ID', () => {
      store.create({ subject: 'Task 1', description: 'First' });
      const task = store.get('1');
      expect(task).not.toBeNull();
      expect(task!.subject).toBe('Task 1');
    });

    it('should return null for non-existent task', () => {
      expect(store.get('999')).toBeNull();
    });
  });
  ```

- [ ] **[RED-3]** Task 삭제 테스트

  ```typescript
  describe('delete', () => {
    it('should delete task and return true', () => {
      store.create({ subject: 'Task 1', description: 'First' });
      expect(store.delete('1')).toBe(true);
      expect(store.get('1')).toBeNull();
    });

    it('should return false for non-existent task', () => {
      expect(store.delete('999')).toBe(false);
    });

    it('should not reuse deleted task IDs', () => {
      store.create({ subject: 'Task 1', description: 'First' });
      store.delete('1');
      const task2 = store.create({ subject: 'Task 2', description: 'Second' });
      expect(task2.id).toBe('2'); // not "1"
    });
  });
  ```

### 1.2.2 상태 전이 테스트

- [ ] **[RED-4]** 상태 전이 규칙 테스트

  ```typescript
  describe('status transitions', () => {
    it('should transition pending → in_progress', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      const updated = store.update('1', { status: 'in_progress' });
      expect(updated!.status).toBe('in_progress');
    });

    it('should transition in_progress → completed', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      store.update('1', { status: 'in_progress' });
      const updated = store.update('1', { status: 'completed' });
      expect(updated!.status).toBe('completed');
    });

    it('should allow pending → completed (skip in_progress)', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      const updated = store.update('1', { status: 'completed' });
      expect(updated!.status).toBe('completed');
    });

    it('should reject completed → in_progress', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      store.update('1', { status: 'completed' });
      const updated = store.update('1', { status: 'in_progress' });
      expect(updated).toBeNull(); // 거부
    });

    it('should reject completed → pending', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      store.update('1', { status: 'completed' });
      const updated = store.update('1', { status: 'pending' });
      expect(updated).toBeNull();
    });

    it('should allow in_progress → pending (rollback)', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      store.update('1', { status: 'in_progress' });
      const updated = store.update('1', { status: 'pending' });
      expect(updated!.status).toBe('pending');
    });
  });
  ```

### 1.2.3 업데이트 필드 테스트

- [ ] **[RED-5]** 필드 업데이트 테스트

  ```typescript
  describe('update fields', () => {
    it('should update subject and description', () => {
      store.create({ subject: 'Old', description: 'Old desc' });
      const updated = store.update('1', {
        subject: 'New',
        description: 'New desc',
      });
      expect(updated!.subject).toBe('New');
      expect(updated!.description).toBe('New desc');
    });

    it('should update activeForm', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      const updated = store.update('1', { activeForm: 'Working on task' });
      expect(updated!.activeForm).toBe('Working on task');
    });

    it('should update owner', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      const updated = store.update('1', { owner: 'sub-agent-1' });
      expect(updated!.owner).toBe('sub-agent-1');
    });

    it('should merge metadata on update', () => {
      store.create({
        subject: 'Task',
        description: 'Desc',
        metadata: { a: 1, b: 2 },
      });
      const updated = store.update('1', { metadata: { b: 3, c: 4 } });
      expect(updated!.metadata).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should delete metadata key when set to null', () => {
      store.create({
        subject: 'Task',
        description: 'Desc',
        metadata: { a: 1, b: 2 },
      });
      const updated = store.update('1', { metadata: { b: null } });
      expect(updated!.metadata).toEqual({ a: 1 });
    });

    it('should update updatedAt timestamp', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      const before = store.get('1')!.updatedAt;
      // 미세한 시간 차이를 위해 약간의 지연
      const updated = store.update('1', { subject: 'Updated' });
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('should return null for non-existent task update', () => {
      expect(store.update('999', { subject: 'X' })).toBeNull();
    });
  });
  ```

### 1.2.4 의존성 관리 테스트

> **⚠️ 설계 결정 (Issue 8)**: `blocks`/`blockedBy`는 **정보성 메타데이터**이다.
> TaskStore가 blockedBy 상태를 기반으로 작업 실행을 런타임에서 차단하지 않는다.
> `getOpenBlockers()`는 LLM/사용자가 의존 상태를 **조회**하기 위한 헬퍼이며,
> `TaskListTool`의 `list()` 결과에서 미완료 blocker만 필터하여 표시하는
> 용도이다. 실제 작업 순서 강제는 LLM 프롬프트 수준에서 처리한다.

- [ ] **[RED-6]** 의존성 관리 테스트

  ```typescript
  describe('dependency management', () => {
    it('should add blocks relationship', () => {
      store.create({ subject: 'Task 1', description: 'First' });
      store.create({ subject: 'Task 2', description: 'Second' });
      store.addBlocks('1', ['2']);
      const task1 = store.get('1')!;
      const task2 = store.get('2')!;
      expect(task1.blocks).toContain('2');
      expect(task2.blockedBy).toContain('1');
    });

    it('should add blockedBy relationship', () => {
      store.create({ subject: 'Task 1', description: 'First' });
      store.create({ subject: 'Task 2', description: 'Second' });
      store.addBlockedBy('2', ['1']);
      const task1 = store.get('1')!;
      const task2 = store.get('2')!;
      expect(task2.blockedBy).toContain('1');
      expect(task1.blocks).toContain('2');
    });

    it('should filter open blockers (exclude completed)', () => {
      store.create({ subject: 'Task 1', description: 'Blocker' });
      store.create({ subject: 'Task 2', description: 'Blocked' });
      store.addBlockedBy('2', ['1']);

      // task 1 미완료 → open blocker
      expect(store.getOpenBlockers('2')).toEqual(['1']);

      // task 1 완료 → no open blockers
      store.update('1', { status: 'completed' });
      expect(store.getOpenBlockers('2')).toEqual([]);
    });

    it('should clean up references when task deleted', () => {
      store.create({ subject: 'Task 1', description: 'Blocker' });
      store.create({ subject: 'Task 2', description: 'Blocked' });
      store.addBlocks('1', ['2']);

      store.delete('1');
      const task2 = store.get('2')!;
      expect(task2.blockedBy).not.toContain('1');
    });

    it('should ignore non-existent task IDs in addBlocks', () => {
      store.create({ subject: 'Task 1', description: 'First' });
      // 존재하지 않는 ID 999에 대해 에러 없이 무시
      store.addBlocks('1', ['999']);
      const task1 = store.get('1')!;
      expect(task1.blocks).toEqual([]); // 존재하지 않는 태스크는 추가 안됨
    });
  });
  ```

### 1.2.5 list() + toTodoList() 변환 테스트

- [ ] **[RED-7]** list() 및 toTodoList() 테스트

  ```typescript
  describe('list', () => {
    it('should return all task summaries', () => {
      store.create({ subject: 'Task 1', description: 'First' });
      store.create({ subject: 'Task 2', description: 'Second' });
      const list = store.list();
      expect(list).toHaveLength(2);
      expect(list[0]).toEqual({
        id: '1',
        subject: 'Task 1',
        status: 'pending',
        owner: undefined,
        blockedBy: [],
      });
    });

    it('should return empty array when no tasks', () => {
      expect(store.list()).toEqual([]);
    });

    it('should show only open blockers in blockedBy', () => {
      store.create({ subject: 'Task 1', description: 'Blocker' });
      store.create({ subject: 'Task 2', description: 'Also Blocker' });
      store.create({ subject: 'Task 3', description: 'Blocked' });
      store.addBlockedBy('3', ['1', '2']);
      store.update('1', { status: 'completed' });

      const list = store.list();
      const task3Summary = list.find((t) => t.id === '3');
      expect(task3Summary!.blockedBy).toEqual(['2']); // task 1은 completed → 제외
    });
  });

  describe('toTodoList', () => {
    it('should convert tasks to Todo[] format', () => {
      store.create({ subject: 'Run tests', description: 'Desc' });
      store.create({ subject: 'Fix bug', description: 'Desc' });
      store.update('1', { status: 'in_progress' });

      const todos = store.toTodoList();
      expect(todos).toEqual([
        { description: 'Run tests', status: 'in_progress' },
        { description: 'Fix bug', status: 'pending' },
      ]);
    });

    it('should use activeForm in description for in_progress tasks', () => {
      store.create({
        subject: 'Run tests',
        description: 'Desc',
        activeForm: 'Running tests',
      });
      store.update('1', { status: 'in_progress' });

      const todos = store.toTodoList();
      expect(todos[0].description).toBe('Run tests — Running tests');
    });

    it('should not use activeForm for pending/completed tasks', () => {
      store.create({
        subject: 'Run tests',
        description: 'Desc',
        activeForm: 'Running tests',
      });

      const todos = store.toTodoList();
      expect(todos[0].description).toBe('Run tests'); // pending → activeForm 미사용
    });

    it('should return empty array when no tasks', () => {
      expect(store.toTodoList()).toEqual([]);
    });
  });
  ```

- [ ] **[RED-VERIFY]** 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-store.test  # 반드시 FAIL
  ```

---

## 1.3 GREEN Phase: 최소 코드 구현

> **목적**: 테스트를 통과하는 최소한의 코드 구현 **원칙**: "Make it work" —
> 동작하게 만드는 것이 최우선

- [ ] **[TASK-001]** `task-store.ts` 생성 — 타입 정의
  - 파일: `packages/core/src/tools/task-store.ts` (신규)
  - 내용:
    - `TaskStatus` 타입: `'pending' | 'in_progress' | 'completed'`
    - `Task` 인터페이스: id, subject, description, status, activeForm, owner,
      metadata, blocks, blockedBy, createdAt, updatedAt
    - `TaskSummary` 인터페이스: id, subject, status, owner, blockedBy
    - `TaskCreateParams` 인터페이스: subject, description, activeForm?,
      metadata?
    - `TaskUpdateParams` 인터페이스: status?, subject?, description?,
      activeForm?, owner?, metadata?

- [ ] **[TASK-002]** `task-store.ts` — TaskStore 클래스 CRUD 구현
  - `private tasks: Map<string, Task>`
  - `private nextId: number = 1`
  - `create(params)`: 태스크 생성, `id = String(nextId++)`, `status = 'pending'`
  - `get(id)`: ID로 태스크 조회, 없으면 `null`
  - `update(id, params)`: 태스크 수정, 상태 전이 검증, 없으면 `null`
  - `delete(id)`: 태스크 삭제, 양방향 참조 정리, 없으면 `false`
  - `list()`: 전체 요약 목록, blockedBy는 미완료만 필터

- [ ] **[TASK-003]** `task-store.ts` — 의존성 관리 메서드 구현
  - `addBlocks(taskId, blockedIds)`: 양방향 관계 설정
  - `addBlockedBy(taskId, blockingIds)`: 양방향 관계 설정
  - `getOpenBlockers(taskId)`: blockedBy 중 미완료 태스크만 반환

- [ ] **[TASK-004]** `task-store.ts` — 상태 전이 검증 + toTodoList 구현
  - `private validateStatusTransition(from, to)`: 유효한 전이 확인
    - `pending → in_progress | completed`
    - `in_progress → pending | completed`
    - `completed → (없음)` — 변경 불가
  - `toTodoList()`: 기존 `Todo[]` 포맷 변환
    - in_progress + activeForm → `"subject — activeForm"`
    - 그 외 → `"subject"`

- [ ] **[GREEN-VERIFY]** 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-store.test  # 반드시 PASS
  ```

---

## 1.4 REFACTOR Phase: 코드 개선

> **목적**: 동작을 유지하면서 코드 구조 개선 **원칙**: "Make it right" —
> 테스트가 통과하는 상태에서만 리팩터링

- [ ] **[REFACTOR-STRUCTURE]** 코드 구조 개선
  - `task-store.ts`: 메서드 순서 정리 (public → private)
  - 타입 정의를 파일 상단으로 모으기
  - JSDoc 주석 핵심 메서드에 추가
  - `VALID_TRANSITIONS` 상수를 클래스 외부 모듈 레벨로 추출
  - 중복 의존성 설정 로직(addBlocks/addBlockedBy) 공통 private 메서드 추출

- [ ] **[REFACTOR-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-store.test  # 여전히 PASS
  ```

---

## 1.5 사후 작업 (Post-Work)

> **목적**: 수정된 코드 검증 및 작업 결과 문서화

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
  - 확인 항목 1: `create()` → 자동 증가 ID, status='pending'
  - 확인 항목 2: `completed` 상태 재변경 거부
  - 확인 항목 3: `delete()` 후 양방향 참조 정리 확인
  - 확인 항목 4: `toTodoList()` → 기존 `Todo[]` 포맷 호환
  - 확인 항목 5: `list()` → blockedBy 중 미완료만 필터

- [ ] **[DOC]** 작업 결과서 작성
  - 파일: `../working_history/Phase1_task_store_{작업일자}.md`

- [ ] **[COMMIT]** 변경사항 커밋

  ```bash
  git add packages/core/src/tools/task-store.ts packages/core/src/tools/task-store.test.ts
  git commit -m "feat(core): add TaskStore — in-memory task CRUD with dependency management"
  ```

---

## Phase 완료 조건

| 검증 항목                                            | 상태 |
| ---------------------------------------------------- | ---- |
| RED: TaskStore CRUD + 상태 전이 + 의존성 테스트 작성 | ✅   |
| GREEN: TaskStore 최소 구현 + 테스트 통과             | ✅   |
| REFACTOR: 코드 구조 개선                             | ✅   |
| Core 빌드 성공                                       | ✅   |
| Lint + Typecheck 통과                                | ✅   |
| 기존 Core 테스트 회귀 없음                           | ✅   |
| 작업 결과서 작성                                     | ✅   |
| 커밋 완료                                            | ✅   |

---

**작성일**: 2026-03-01 **상태**: ✅ 완료 (커밋 `ad54cc465`, 결과서
`working_history/Phase1_task_store_20260301.md`)
