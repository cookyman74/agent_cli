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
| `completed` 상태에서 재변경 허용 실수        | 🟡 Medium | 상태 전이 검증 로직 + 전용 테스트           | ✅   |
| `delete` 시 양방향 의존성 참조 정합성        | 🟡 Medium | 삭제 시 blocks/blockedBy 양쪽 정리 + 테스트 | ✅   |
| `toTodoList()` 변환 시 기존 Todo 포맷 불일치 | 🟡 Medium | write_todos의 Todo 인터페이스 정확히 참조   | ✅   |
| 객체 참조 직접 노출로 불변식 우회 가능       | 🔴 High   | `structuredClone()` 방어적 복사             | ✅   |
| 동일 상태 재전송 시 null 반환 (비멱등)       | 🔴 High   | same-status no-op 정책 + 테스트 추가        | ✅   |
| 자기 자신 의존(self-dependency) 방지 없음    | 🟡 Medium | `taskId === targetId` 가드 + 테스트         | ✅   |
| 의존성 변경 시 `updatedAt` 미갱신            | 🟡 Medium | `addDependency`/`delete` cleanup에 갱신     | ✅   |
| 빈 subject/description 허용                  | 🟡 Medium | `create` throw + `update` null 반환         | ✅   |
| structuredClone 예외 시 partial write 오염   | 🔴 High   | 메타데이터 사전 검증 + clone-before-store   | ⬜   |
| trim() 비문자열 입력 시 TypeError            | 🟡 Medium | typeof 가드 추가                            | ⬜   |
| 결과서 메타데이터(커밋/줄 수) 불일치         | 🟢 Low    | 결과서 헤더 및 1장 개요 수정                | ⬜   |

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

## 1.6 Phase 1 보강 (Hardening) — 리뷰 이슈 수정

> **배경**: Phase 1 완료 후 코드 리뷰에서 5개 이슈 발견. Phase 2 연동 전에 수정
> 필요. **방법**: TDD Red → Green → Refactor 사이클 동일 적용.

### 설계 결정 (오픈 질문 해소)

| 질문                                       | 결정                                                                                                                                     |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `update(status=현재상태)` 성공 vs 실패?    | **성공 (no-op)** — LLM이 동일 상태를 재전송하는 패턴이 흔함. 멱등 정책 채택.                                                             |
| TaskStore 참조 노출 허용 vs API 경계 보장? | **방어적 복사** — `structuredClone()`으로 반환. 내부 전용이지만 Phase 2 Tool 계층에서 반환값을 그대로 LLM에 전달하므로 불변식 보호 필수. |

### 1.6.1 ANALYSIS — 이슈 코드 레벨 검증

| #   | 심각도 | 이슈                                                                         | 코드 위치                                 | 검증 |
| --- | ------ | ---------------------------------------------------------------------------- | ----------------------------------------- | ---- |
| 1   | HIGH   | 내부 Task 객체 참조 직접 반환 → 외부 mutation으로 상태 전이/의존성 우회 가능 | `create`:81, `get`:86, `update`:120       | 확인 |
| 2   | HIGH   | `VALID_TRANSITIONS.pending`에 `'pending'` 미포함 → `pending→pending` = null  | `update`:95-99, `VALID_TRANSITIONS`:53-57 | 확인 |
| 3   | MEDIUM | `addDependency`에서 `taskId === targetId` 체크 없음 → A blocks A 가능        | `addDependency`:208-216                   | 확인 |
| 4   | MEDIUM | `addDependency`/`delete` cleanup에서 변경된 태스크의 `updatedAt` 미갱신      | `addDependency`:208-217, `delete`:129-140 | 확인 |
| 5   | MEDIUM | `create()`/`update()`에 `subject`/`description` 빈 문자열 검증 없음          | `create`:70-71, `update`:102-103          | 확인 |

### 1.6.2 RED Phase — 보강 실패 테스트

- [ ] **[RED-H1]** 객체 참조 불변성 테스트

  ```typescript
  describe('immutability', () => {
    it('should return a copy from create — mutating returned object should not affect store', () => {
      const returned = store.create({ subject: 'Task', description: 'Desc' });
      returned.subject = 'Mutated';
      returned.status = 'completed' as TaskStatus;
      returned.blocks.push('999');

      const internal = store.get('1')!;
      expect(internal.subject).toBe('Task');
      expect(internal.status).toBe('pending');
      expect(internal.blocks).toEqual([]);
    });

    it('should return a copy from get — mutating returned object should not affect store', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      const got = store.get('1')!;
      got.subject = 'Mutated';

      const fresh = store.get('1')!;
      expect(fresh.subject).toBe('Task');
    });

    it('should return a copy from update — mutating returned object should not affect store', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      const updated = store.update('1', { subject: 'New' })!;
      updated.subject = 'Mutated';

      const fresh = store.get('1')!;
      expect(fresh.subject).toBe('New');
    });
  });
  ```

- [ ] **[RED-H2]** 멱등 상태 업데이트 테스트

  ```typescript
  describe('idempotent status updates', () => {
    it('should accept pending → pending as no-op', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      const updated = store.update('1', { status: 'pending' });
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('pending');
    });

    it('should accept in_progress → in_progress as no-op', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      store.update('1', { status: 'in_progress' });
      const updated = store.update('1', { status: 'in_progress' });
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('in_progress');
    });

    it('should still reject completed → completed (terminal state, no writes allowed)', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      store.update('1', { status: 'completed' });
      const updated = store.update('1', { status: 'completed' });
      expect(updated).toBeNull();
    });
  });
  ```

  > **설계 참고**: `completed → completed`는 null 반환 유지. completed 태스크는
  > 어떤 필드도 변경할 수 없어야 향후 "completed는 터미널" 불변식이 일관된다.
  > LLM이 completed 재전송 시 Phase 2 Tool 계층에서 안내 메시지로 대응.

- [ ] **[RED-H3]** 자기 자신 의존 방지 테스트

  ```typescript
  it('should ignore self-dependency in addBlocks', () => {
    store.create({ subject: 'Task 1', description: 'First' });
    store.addBlocks('1', ['1']);
    const task = store.get('1')!;
    expect(task.blocks).toEqual([]);
    expect(task.blockedBy).toEqual([]);
  });

  it('should ignore self-dependency in addBlockedBy', () => {
    store.create({ subject: 'Task 1', description: 'First' });
    store.addBlockedBy('1', ['1']);
    const task = store.get('1')!;
    expect(task.blocks).toEqual([]);
    expect(task.blockedBy).toEqual([]);
  });
  ```

- [ ] **[RED-H4]** 의존성 변경 시 updatedAt 갱신 테스트

  ```typescript
  it('should update updatedAt when dependency added via addBlocks', () => {
    store.create({ subject: 'Task 1', description: 'First' });
    store.create({ subject: 'Task 2', description: 'Second' });
    const before1 = store.get('1')!.updatedAt;
    const before2 = store.get('2')!.updatedAt;

    store.addBlocks('1', ['2']);

    const after1 = store.get('1')!.updatedAt;
    const after2 = store.get('2')!.updatedAt;
    expect(after1).toBeGreaterThanOrEqual(before1);
    expect(after2).toBeGreaterThanOrEqual(before2);
  });

  it('should update updatedAt on affected tasks when task deleted', () => {
    store.create({ subject: 'Task 1', description: 'Blocker' });
    store.create({ subject: 'Task 2', description: 'Blocked' });
    store.addBlocks('1', ['2']);
    const before2 = store.get('2')!.updatedAt;

    store.delete('1');

    const after2 = store.get('2')!.updatedAt;
    expect(after2).toBeGreaterThanOrEqual(before2);
  });
  ```

- [ ] **[RED-H5]** 입력 검증 테스트

  ```typescript
  describe('input validation', () => {
    it('should throw on create with empty subject', () => {
      expect(() => store.create({ subject: '', description: 'Desc' })).toThrow(
        'subject must be a non-empty string',
      );
    });

    it('should throw on create with whitespace-only subject', () => {
      expect(() =>
        store.create({ subject: '   ', description: 'Desc' }),
      ).toThrow('subject must be a non-empty string');
    });

    it('should throw on create with empty description', () => {
      expect(() => store.create({ subject: 'Task', description: '' })).toThrow(
        'description must be a non-empty string',
      );
    });

    it('should return null on update with empty subject', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      expect(store.update('1', { subject: '' })).toBeNull();
    });

    it('should return null on update with whitespace-only description', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      expect(store.update('1', { description: '   ' })).toBeNull();
    });
  });
  ```

- [ ] **[RED-H-VERIFY]** 보강 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-store.test  # 신규 테스트 FAIL
  ```

### 1.6.3 GREEN Phase — 보강 구현

- [ ] **[TASK-H1]** 방어적 복사 적용
  - `create()`, `get()`, `update()` 반환 시 `structuredClone(task)`
  - 내부 Map에는 원본 참조 유지, 외부에는 복사본 반환
  - `list()`, `toTodoList()`는 이미 새 객체를 생성하므로 변경 불필요

- [ ] **[TASK-H2]** 멱등 상태 업데이트 적용
  - `update()` 내 상태 전이 검증 전에 same-status 조기 반환:
    ```typescript
    if (params.status !== undefined) {
      if (params.status === task.status) {
        // no-op: 동일 상태 재전송은 성공 처리 (멱등)
        // status 변경 없이 아래 필드 업데이트로 진행
      } else if (!VALID_TRANSITIONS[task.status].includes(params.status)) {
        return null;
      } else {
        task.status = params.status;
      }
    }
    ```
  - **예외**: `completed → completed`도 같은 로직이면 no-op 성공이 되나,
    completed 태스크의 다른 필드 수정도 차단해야 하므로 `completed` 상태일 때
    조기 null 반환:
    ```typescript
    // completed 태스크는 어떤 변경도 불가 (터미널 상태)
    if (task.status === 'completed' && hasAnyUpdate(params)) {
      return null;
    }
    ```

- [ ] **[TASK-H3]** self-dependency 가드 추가
  - `addDependency()` 루프 첫 줄에 `if (taskId === targetId) continue;`

- [ ] **[TASK-H4]** 의존성 변경 시 updatedAt 갱신
  - `addDependency()`: 실제로 관계가 추가된 경우에만 양쪽 태스크의
    `updatedAt = Date.now()` 갱신
  - `delete()` cleanup: 참조 제거된 태스크의 `updatedAt = Date.now()` 갱신

- [ ] **[TASK-H5]** 입력 검증 추가
  - `create()`: `subject.trim()` / `description.trim()` 빈 문자열 시
    `throw new Error()`
  - `update()`: `subject?.trim()` / `description?.trim()` 빈 문자열 시
    `return null`

- [ ] **[GREEN-H-VERIFY]** 보강 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-store.test  # 전체 PASS
  ```

### 1.6.4 REFACTOR Phase — 보강 코드 정리

- [ ] **[REFACTOR-H]** 보강 후 코드 정리
  - completed 터미널 가드 로직을 별도 private 메서드로 추출 검토
  - `structuredClone` 호출을 `private snapshot(task)` 래퍼로 추출 검토
  - 테스트 describe 구조에 보강 테스트 자연스럽게 통합 (별도 섹션이 아닌 기존
    describe에 병합)

- [ ] **[REFACTOR-H-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-store.test  # 여전히 PASS
  ```

### 1.6.5 보강 사후 작업

- [ ] **[TEST-H]** 전체 Core 테스트
- [ ] **[BUILD-H]** Core 빌드 확인
- [ ] **[LINT-H]** 린터 + 타입체크
- [ ] **[DOC-H]** 작업 결과서 업데이트
  - 파일: `../working_history/Phase1_task_store_20260301.md`에 보강 섹션 추가
- [ ] **[COMMIT-H]** 변경사항 커밋
  ```bash
  git add packages/core/src/tools/task-store.ts packages/core/src/tools/task-store.test.ts
  git commit -m "fix(core): harden TaskStore — immutability, idempotency, validation"
  ```

---

## 1.7 Phase 1 추가 보강 (Hardening-2) — 런타임 안정성 이슈 수정

> **배경**: Phase 1-H 보강 완료 후 추가 리뷰에서 2개 런타임 안정성 이슈 + 1개
> 문서 불일치 발견. Phase 2 도구 경계에서 비정상 입력이 유입될 수 있어 수정
> 필요. **방법**: TDD Red → Green → Refactor 사이클 동일 적용.

### 설계 결정

| 질문                                 | 결정                                                                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| structuredClone 실패 시 어떻게 처리? | **사전 검증**: metadata를 `structuredClone()`으로 사전 검증하여 non-cloneable 값을 차단. create는 throw, update는 null 반환. store에 쓰기 전에 실패시켜 partial write 방지. |
| 비문자열 입력 시 어떻게 처리?        | **typeof 가드**: `typeof x !== 'string'` 검사를 trim() 호출 전에 수행. create는 throw, update는 null 반환.                                                                  |

### 1.7.1 ANALYSIS — 이슈 코드 레벨 검증

| #   | 심각도 | 이슈                                                                                                                  | 코드 위치                              | 검증                                     |
| --- | ------ | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------- |
| 6   | HIGH   | `create()`: `tasks.set()` (L86) 후 `structuredClone()` (L87) 실패 → Map에 오염 데이터 잔류, 이후 `get()` 연쇄 예외    | `create`:86-87, `get`:93, `update`:135 | 확인 (DOMException: could not be cloned) |
| 7   | MEDIUM | `trim()` 직접 호출 시 비문자열 입력(number, null)으로 TypeError 발생. Phase 2 Tool 경계 검증 누락/우회 시 런타임 장애 | `create`:67,70, `update`:105-106       | 확인 (TypeError: trim is not a function) |
| 8   | LOW    | 결과서 헤더 커밋 `ad54cc465`만 표기 (보강 `8b91bd238` 미반영), 1장 줄 수(219/316) ≠ 6장(247/447) 불일치               | 결과서 :3, :13-14                      | 확인                                     |

### 1.7.2 RED Phase — 추가 보강 실패 테스트

- [ ] **[RED-H6]** structuredClone partial write 방지 테스트

  ```typescript
  describe('metadata cloneability', () => {
    it('should throw on create with non-cloneable metadata', () => {
      expect(() =>
        store.create({
          subject: 'Task',
          description: 'Desc',
          metadata: { fn: () => {} },
        }),
      ).toThrow('metadata contains non-cloneable values');
    });

    it('should not leave orphan task after create fails due to non-cloneable metadata', () => {
      try {
        store.create({
          subject: 'Task',
          description: 'Desc',
          metadata: { fn: () => {} },
        });
      } catch {
        // expected
      }
      expect(store.get('1')).toBeNull(); // no orphan
      expect(store.list()).toEqual([]);
    });

    it('should return null on update with non-cloneable metadata', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      const result = store.update('1', {
        metadata: { fn: () => {} },
      });
      expect(result).toBeNull();
    });

    it('should preserve original task when update fails due to non-cloneable metadata', () => {
      store.create({
        subject: 'Task',
        description: 'Desc',
        metadata: { key: 'original' },
      });
      store.update('1', { metadata: { fn: () => {} } });
      const task = store.get('1')!;
      expect(task.metadata).toEqual({ key: 'original' });
    });
  });
  ```

- [ ] **[RED-H7]** typeof 가드 테스트

  ```typescript
  describe('type-safe input validation', () => {
    it('should throw on create with non-string subject', () => {
      expect(() =>
        store.create({
          subject: 123 as unknown as string,
          description: 'Desc',
        }),
      ).toThrow('subject must be a non-empty string');
    });

    it('should throw on create with null description', () => {
      expect(() =>
        store.create({
          subject: 'Task',
          description: null as unknown as string,
        }),
      ).toThrow('description must be a non-empty string');
    });

    it('should return null on update with non-string subject', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      expect(
        store.update('1', { subject: 123 as unknown as string }),
      ).toBeNull();
    });

    it('should return null on update with null description', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      expect(
        store.update('1', { description: null as unknown as string }),
      ).toBeNull();
    });
  });
  ```

- [ ] **[RED-H-VERIFY-2]** 추가 보강 테스트 실패 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-store.test  # 신규 테스트 FAIL
  ```

### 1.7.3 GREEN Phase — 추가 보강 구현

- [ ] **[TASK-H6]** structuredClone partial write 방지
  - `create()`: metadata 사전 검증 후 `tasks.set()` 수행
    ```typescript
    // metadata 사전 검증 (non-cloneable 값 차단)
    if (params.metadata) {
      try {
        structuredClone(params.metadata);
      } catch {
        throw new Error('metadata contains non-cloneable values');
      }
    }
    // ... task 구성 ...
    this.tasks.set(task.id, task);
    return structuredClone(task); // 사전 검증 통과했으므로 안전
    ```
  - `update()`: metadata 사전 검증 후 merge 수행
    ```typescript
    // metadata 사전 검증
    if (params.metadata !== undefined) {
      try {
        structuredClone(params.metadata);
      } catch {
        return null;
      }
    }
    // ... 아래에서 merge ...
    ```
  - `get()`: store가 clean 상태이므로 (create/update에서 사전 검증) 변경 불필요.
    만약 예상치 못한 corruption 발생 시 DataCloneError는 프로그래밍 에러로
    그대로 전파.

- [ ] **[TASK-H7]** typeof 가드 추가
  - `create()`: trim() 호출 전 typeof 검사 추가
    ```typescript
    if (typeof params.subject !== 'string' || !params.subject.trim()) {
      throw new Error('subject must be a non-empty string');
    }
    if (typeof params.description !== 'string' || !params.description.trim()) {
      throw new Error('description must be a non-empty string');
    }
    ```
  - `update()`: trim() 호출 전 typeof 검사 추가
    ```typescript
    if (
      params.subject !== undefined &&
      (typeof params.subject !== 'string' || !params.subject.trim())
    )
      return null;
    if (
      params.description !== undefined &&
      (typeof params.description !== 'string' || !params.description.trim())
    )
      return null;
    ```

- [ ] **[GREEN-H-VERIFY-2]** 추가 보강 테스트 통과 확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-store.test  # 전체 PASS
  ```

### 1.7.4 REFACTOR Phase — 추가 보강 코드 정리

- [ ] **[REFACTOR-H2]** 추가 보강 후 코드 정리
  - create/update 입력 검증부를 private `validateString(value, name)` 메서드로
    추출 검토
  - metadata 검증을 private `validateMetadata(metadata)` 메서드로 추출 검토
  - 테스트 describe 구조에 자연스럽게 통합

- [ ] **[REFACTOR-H2-VERIFY]** 리팩터링 후 테스트 재확인
  ```bash
  npm test -w @didim365/agent-cli-core -- src/tools/task-store.test  # 여전히 PASS
  ```

### 1.7.5 추가 보강 사후 작업

- [ ] **[TEST-H2]** 전체 Core 테스트
- [ ] **[BUILD-H2]** Core 빌드 확인
- [ ] **[LINT-H2]** 린터 + 타입체크
- [ ] **[DOC-H2]** 작업 결과서 수정 (Issue 8 — 메타데이터 불일치 수정)
  - 헤더: 커밋 정보를 1차 `ad54cc465` + 보강 `8b91bd238` + 보강2 커밋으로 갱신
  - 1장 개요: 줄 수를 최종 값으로 갱신
  - 보강2 섹션 추가
- [ ] **[COMMIT-H2]** 변경사항 커밋
  ```bash
  git add packages/core/src/tools/task-store.ts packages/core/src/tools/task-store.test.ts
  git commit -m "fix(core): prevent TaskStore partial writes and type-unsafe input"
  ```

---

## Phase 완료 조건

| 검증 항목                                             | 상태 |
| ----------------------------------------------------- | ---- |
| RED: TaskStore CRUD + 상태 전이 + 의존성 테스트 작성  | ✅   |
| GREEN: TaskStore 최소 구현 + 테스트 통과              | ✅   |
| REFACTOR: 코드 구조 개선                              | ✅   |
| Core 빌드 성공                                        | ✅   |
| Lint + Typecheck 통과                                 | ✅   |
| 기존 Core 테스트 회귀 없음                            | ✅   |
| 작업 결과서 작성                                      | ✅   |
| 커밋 완료                                             | ✅   |
| **보강** RED-H1~H5: 불변성/멱등/검증 테스트 추가      | ✅   |
| **보강** GREEN-H1~H5: 방어적 복사/멱등/가드 구현      | ✅   |
| **보강** REFACTOR-H: 코드 정리                        | ✅   |
| **보강** 전체 테스트 + 빌드 + 결과서 + 커밋           | ✅   |
| **보강2** RED-H6~H7: partial write/TypeError 테스트   | ⬜   |
| **보강2** GREEN-H6~H7: 사전 검증 + typeof 가드 구현   | ⬜   |
| **보강2** REFACTOR-H2: 코드 정리                      | ⬜   |
| **보강2** 전체 테스트 + 빌드 + 결과서(Issue 3) + 커밋 | ⬜   |

---

**작성일**: 2026-03-01 **1차 완료**: ✅ 커밋 `ad54cc465` — 기본 CRUD + 의존성 +
toTodoList **보강 완료**: ✅ 리뷰 이슈 5건 수정 완료 (커밋 `8b91bd238`) **보강2
상태**: ⬜ 리뷰 이슈 3건 수정 대기 **보강 결과서**:
`working_history/Phase1_task_store_20260301.md` 보강 섹션 추가 완료
