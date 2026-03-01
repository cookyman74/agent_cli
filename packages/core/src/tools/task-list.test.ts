/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TaskStore } from './task-store.js';
import { TaskListTool } from './task-list.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

describe('TaskListTool', () => {
  let store: TaskStore;
  let tool: TaskListTool;
  const signal = new AbortController().signal;

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

      expect(result.error).toBeUndefined();
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

    it('should show only open blockers in blockedBy', async () => {
      store.create({ subject: 'Task 1', description: 'First' });
      store.create({ subject: 'Task 2', description: 'Second' });
      store.addBlocks('1', ['2']);
      store.update('1', { status: 'completed' });

      const result = await tool.buildAndExecute({}, signal);
      const parsed = JSON.parse(result.llmContent as string);
      const task2Summary = parsed.find((t: { id: string }) => t.id === '2');
      expect(task2Summary.blockedBy).toEqual([]);
    });

    it('should require no parameters', async () => {
      store.create({ subject: 'Task 1', description: 'First' });
      const result = await tool.buildAndExecute({}, signal);
      expect(result.error).toBeUndefined();
    });
  });
});
