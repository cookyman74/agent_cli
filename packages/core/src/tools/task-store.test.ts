/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, beforeEach } from 'vitest';
import { TaskStore, type TaskStatus } from './task-store.js';

describe('TaskStore', () => {
  let store: TaskStore;

  beforeEach(() => {
    store = new TaskStore();
  });

  // RED-1: Task 생성 테스트
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

  // RED-H1: 불변성 테스트
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

  // RED-2: Task 조회 테스트
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

  // RED-3: Task 삭제 테스트
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

  // RED-4: 상태 전이 규칙 테스트
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

    // RED-H2: 멱등 상태 업데이트
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

    it('should reject completed → completed (terminal, no writes)', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      store.update('1', { status: 'completed' });
      const updated = store.update('1', { status: 'completed' });
      expect(updated).toBeNull();
    });
  });

  // RED-5: 필드 업데이트 테스트
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
      const updated = store.update('1', { subject: 'Updated' });
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(before);
    });

    it('should return null for non-existent task update', () => {
      expect(store.update('999', { subject: 'X' })).toBeNull();
    });
  });

  // RED-6: 의존성 관리 테스트
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

    // RED-H3: self-dependency 방지
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

    // RED-H4: updatedAt 갱신
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
  });

  // RED-7: list() + toTodoList() 테스트
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

  // RED-H5: 입력 검증
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

    // RED-H7: typeof 가드 — 비문자열 입력
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

    // RED-R1: activeForm/owner typeof 가드
    it('should throw on create with non-string activeForm', () => {
      expect(() =>
        store.create({
          subject: 'Task',
          description: 'Desc',
          activeForm: (() => {}) as unknown as string,
        }),
      ).toThrow('activeForm must be a string');
    });

    it('should not leave orphan task after create fails due to non-string activeForm', () => {
      try {
        store.create({
          subject: 'Task',
          description: 'Desc',
          activeForm: (() => {}) as unknown as string,
        });
      } catch {
        // expected
      }
      expect(store.get('1')).toBeNull();
      expect(store.list()).toEqual([]);
    });

    it('should return null on update with non-string activeForm', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      expect(
        store.update('1', { activeForm: 123 as unknown as string }),
      ).toBeNull();
    });

    it('should return null on update with non-string owner', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      expect(store.update('1', { owner: {} as unknown as string })).toBeNull();
    });

    it('should preserve original task when update fails due to invalid activeForm', () => {
      store.create({
        subject: 'Task',
        description: 'Desc',
        activeForm: 'Original',
      });
      store.update('1', { activeForm: null as unknown as string });
      expect(store.get('1')!.activeForm).toBe('Original');
    });
  });

  // RED-R10: metadata deep copy — 외부 참조 변경으로 내부 상태 오염 방지
  describe('metadata deep copy isolation', () => {
    it('should not be affected by external mutation after create', () => {
      const meta = { nested: { value: 'original' } };
      store.create({ subject: 'Task', description: 'Desc', metadata: meta });
      meta.nested.value = 'mutated';
      expect(store.get('1')!.metadata).toEqual({
        nested: { value: 'original' },
      });
    });

    it('should not be affected by external mutation after update', () => {
      store.create({
        subject: 'Task',
        description: 'Desc',
        metadata: { key: 'initial' },
      });
      const newMeta = { nested: { value: 'updated' } };
      store.update('1', { metadata: newMeta });
      newMeta.nested.value = 'mutated';
      expect(store.get('1')!.metadata).toEqual({
        key: 'initial',
        nested: { value: 'updated' },
      });
    });
  });

  // RED-H6: metadata cloneability — structuredClone partial write 방지
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
      expect(store.get('1')).toBeNull();
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

    // RED-R4: create metadata:null 일관성 — update()와 동일하게 거부
    it('should throw on create with metadata: null', () => {
      expect(() =>
        store.create({
          subject: 'Task',
          description: 'Desc',
          metadata: null as unknown as Record<string, unknown>,
        }),
      ).toThrow('metadata');
    });

    it('should not leave orphan task after create fails due to null metadata', () => {
      try {
        store.create({
          subject: 'Task',
          description: 'Desc',
          metadata: null as unknown as Record<string, unknown>,
        });
      } catch {
        // expected
      }
      expect(store.get('1')).toBeNull();
      expect(store.list()).toEqual([]);
    });

    // RED-R2: metadata null 가드
    it('should return null on update with metadata: null', () => {
      store.create({ subject: 'Task', description: 'Desc' });
      expect(
        store.update('1', {
          metadata: null as unknown as Record<string, unknown>,
        }),
      ).toBeNull();
    });

    it('should preserve existing metadata when update with null rejected', () => {
      store.create({
        subject: 'Task',
        description: 'Desc',
        metadata: { key: 'original' },
      });
      store.update('1', {
        metadata: null as unknown as Record<string, unknown>,
      });
      expect(store.get('1')!.metadata).toEqual({ key: 'original' });
    });
  });

  // RED-R3: completed 태스크 의존성 추가 차단
  describe('completed dependency guard', () => {
    it('should ignore addBlocks on completed task', () => {
      store.create({ subject: 'Task 1', description: 'First' });
      store.create({ subject: 'Task 2', description: 'Second' });
      store.update('1', { status: 'completed' });
      store.addBlocks('1', ['2']);
      expect(store.get('1')!.blocks).toEqual([]);
      expect(store.get('2')!.blockedBy).toEqual([]);
    });

    it('should ignore addBlockedBy on completed task', () => {
      store.create({ subject: 'Task 1', description: 'First' });
      store.create({ subject: 'Task 2', description: 'Second' });
      store.update('1', { status: 'completed' });
      store.addBlockedBy('1', ['2']);
      expect(store.get('1')!.blockedBy).toEqual([]);
      expect(store.get('2')!.blocks).toEqual([]);
    });

    // Issue 4: Skip completed target when adding dependency
    it('should ignore addBlocks when target task is completed', () => {
      store.create({ subject: 'Task 1', description: 'First' });
      store.create({ subject: 'Task 2', description: 'Second' });
      store.update('2', { status: 'completed' });
      store.addBlocks('1', ['2']); // 1 blocks 2, but 2 is completed
      expect(store.get('1')!.blocks).toEqual([]);
      expect(store.get('2')!.blockedBy).toEqual([]);
    });

    it('should ignore addBlockedBy when target task is completed', () => {
      store.create({ subject: 'Task 1', description: 'First' });
      store.create({ subject: 'Task 2', description: 'Second' });
      store.update('2', { status: 'completed' });
      store.addBlockedBy('1', ['2']); // 1 blocked by 2, but 2 is completed
      expect(store.get('1')!.blockedBy).toEqual([]);
      expect(store.get('2')!.blocks).toEqual([]);
    });
  });

  // Issue 5: Cycle detection in dependency graph
  describe('cycle detection', () => {
    it('should prevent direct cycle: A blocks B, B blocks A', () => {
      store.create({ subject: 'A', description: 'Task A' });
      store.create({ subject: 'B', description: 'Task B' });
      store.addBlocks('1', ['2']); // A blocks B
      store.addBlocks('2', ['1']); // B blocks A — would create cycle
      expect(store.get('1')!.blocks).toEqual(['2']);
      expect(store.get('2')!.blocks).toEqual([]); // Silently rejected
    });

    it('should prevent indirect cycle: A→B→C→A', () => {
      store.create({ subject: 'A', description: 'Task A' });
      store.create({ subject: 'B', description: 'Task B' });
      store.create({ subject: 'C', description: 'Task C' });
      store.addBlocks('1', ['2']); // A blocks B
      store.addBlocks('2', ['3']); // B blocks C
      store.addBlocks('3', ['1']); // C blocks A — would create cycle
      expect(store.get('3')!.blocks).toEqual([]); // Silently rejected
      expect(store.get('1')!.blockedBy).toEqual([]); // No reverse link
    });

    it('should prevent cycle via blockedBy: A blockedBy B, B blockedBy A', () => {
      store.create({ subject: 'A', description: 'Task A' });
      store.create({ subject: 'B', description: 'Task B' });
      store.addBlockedBy('1', ['2']); // A blockedBy B
      store.addBlockedBy('2', ['1']); // B blockedBy A — would create cycle
      expect(store.get('1')!.blockedBy).toEqual(['2']);
      expect(store.get('2')!.blockedBy).toEqual([]); // Silently rejected
    });

    it('should allow valid non-cyclic dependencies', () => {
      store.create({ subject: 'A', description: 'Task A' });
      store.create({ subject: 'B', description: 'Task B' });
      store.create({ subject: 'C', description: 'Task C' });
      store.addBlocks('1', ['2']); // A blocks B
      store.addBlocks('1', ['3']); // A blocks C
      store.addBlocks('2', ['3']); // B blocks C (diamond, not cycle)
      expect(store.get('1')!.blocks).toEqual(['2', '3']);
      expect(store.get('2')!.blocks).toEqual(['3']);
      expect(store.get('3')!.blockedBy).toEqual(['1', '2']);
    });
  });
});
