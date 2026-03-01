/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TaskStore } from './task-store.js';
import { TaskUpdateTool, type TaskUpdateToolParams } from './task-update.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

describe('TaskUpdateTool', () => {
  let store: TaskStore;
  let tool: TaskUpdateTool;
  const signal = new AbortController().signal;

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
        { taskId: '1', status: 'in_progress' },
        signal,
      );

      expect(result.error).toBeUndefined();
      const parsed = JSON.parse(result.llmContent as string);
      expect(parsed.status).toBe('in_progress');
    });

    it('should reject invalid status transition (completed → in_progress)', async () => {
      store.update('1', { status: 'completed' });
      const result = await tool.buildAndExecute(
        { taskId: '1', status: 'in_progress' },
        signal,
      );

      expect(result.error).toBeDefined();
    });
  });

  describe('delete', () => {
    it('should delete task when status is "deleted"', async () => {
      const result = await tool.buildAndExecute(
        { taskId: '1', status: 'deleted' },
        signal,
      );

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('deleted');
      expect(store.get('1')).toBeNull();
    });

    it('should return error when deleting non-existent task', async () => {
      const result = await tool.buildAndExecute(
        { taskId: '999', status: 'deleted' },
        signal,
      );

      expect(result.error).toBeDefined();
    });

    it('should return updated todos in returnDisplay after delete', async () => {
      store.create({ subject: 'Task 2', description: 'Second' });
      const result = await tool.buildAndExecute(
        { taskId: '1', status: 'deleted' },
        signal,
      );

      const display = result.returnDisplay as { todos: unknown[] };
      expect(display.todos).toHaveLength(1);
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
        { taskId: '1', owner: 'sub-agent-1' },
        signal,
      );

      expect(result.error).toBeUndefined();
      expect(store.get('1')!.owner).toBe('sub-agent-1');
    });

    it('should merge metadata', async () => {
      store.update('1', { metadata: { a: 1 } });
      const result = await tool.buildAndExecute(
        { taskId: '1', metadata: { b: 2 } },
        signal,
      );

      expect(result.error).toBeUndefined();
      expect(store.get('1')!.metadata).toEqual({ a: 1, b: 2 });
    });

    it('should update activeForm', async () => {
      const result = await tool.buildAndExecute(
        { taskId: '1', activeForm: 'Working on task' },
        signal,
      );

      expect(result.error).toBeUndefined();
      expect(store.get('1')!.activeForm).toBe('Working on task');
    });
  });

  describe('dependency management', () => {
    it('should add blocks via addBlocks parameter', async () => {
      store.create({ subject: 'Task 2', description: 'Second' });
      const result = await tool.buildAndExecute(
        { taskId: '1', addBlocks: ['2'] },
        signal,
      );

      expect(result.error).toBeUndefined();
      expect(store.get('1')!.blocks).toContain('2');
      expect(store.get('2')!.blockedBy).toContain('1');
    });

    it('should add blockedBy via addBlockedBy parameter', async () => {
      store.create({ subject: 'Task 2', description: 'Second' });
      const result = await tool.buildAndExecute(
        { taskId: '2', addBlockedBy: ['1'] },
        signal,
      );

      expect(result.error).toBeUndefined();
      expect(store.get('2')!.blockedBy).toContain('1');
    });
  });

  describe('returnDisplay', () => {
    it('should return todos in returnDisplay on status update', async () => {
      const result = await tool.buildAndExecute(
        { taskId: '1', status: 'in_progress' },
        signal,
      );

      expect(result.returnDisplay).toEqual({
        todos: expect.any(Array),
      });
    });
  });

  it('should return error for non-existent task on field update', async () => {
    const result = await tool.buildAndExecute(
      { taskId: '999', subject: 'Update' },
      signal,
    );

    expect(result.error).toBeDefined();
  });

  describe('completed task dependency guard', () => {
    it('should return error when adding addBlocks to completed task', async () => {
      store.create({ subject: 'Task 2', description: 'Second' });
      store.update('1', { status: 'completed' });
      const result = await tool.buildAndExecute(
        { taskId: '1', addBlocks: ['2'] },
        signal,
      );

      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('completed');
    });

    it('should return error when adding addBlockedBy to completed task', async () => {
      store.create({ subject: 'Task 2', description: 'Second' });
      store.update('1', { status: 'completed' });
      const result = await tool.buildAndExecute(
        { taskId: '1', addBlockedBy: ['2'] },
        signal,
      );

      expect(result.error).toBeDefined();
      expect(result.error!.message).toContain('completed');
    });

    it('should not modify dependencies on completed task', async () => {
      store.create({ subject: 'Task 2', description: 'Second' });
      store.update('1', { status: 'completed' });
      await tool.buildAndExecute({ taskId: '1', addBlocks: ['2'] }, signal);

      expect(store.get('1')!.blocks).toEqual([]);
      expect(store.get('2')!.blockedBy).toEqual([]);
    });
  });

  describe('validation', () => {
    it('should throw on missing taskId parameter', async () => {
      await expect(
        tool.buildAndExecute(
          { status: 'in_progress' } as unknown as TaskUpdateToolParams,
          signal,
        ),
      ).rejects.toThrow();
    });
  });
});
