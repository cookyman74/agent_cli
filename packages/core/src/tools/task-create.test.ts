/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TaskStore } from './task-store.js';
import { TaskCreateTool, type TaskCreateToolParams } from './task-create.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

describe('TaskCreateTool', () => {
  let store: TaskStore;
  let tool: TaskCreateTool;
  const signal = new AbortController().signal;

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

    it('should auto-increment task IDs', async () => {
      await tool.buildAndExecute(
        { subject: 'Task 1', description: 'First' },
        signal,
      );
      const result = await tool.buildAndExecute(
        { subject: 'Task 2', description: 'Second' },
        signal,
      );

      const parsed = JSON.parse(result.llmContent as string);
      expect(parsed.taskId).toBe('2');
    });

    it('should include multiple tasks in returnDisplay after creation', async () => {
      await tool.buildAndExecute(
        { subject: 'Task 1', description: 'First' },
        signal,
      );
      const result = await tool.buildAndExecute(
        { subject: 'Task 2', description: 'Second' },
        signal,
      );

      const display = result.returnDisplay as { todos: unknown[] };
      expect(display.todos).toHaveLength(2);
    });

    it('should handle TaskStore create error gracefully', async () => {
      const result = await tool.buildAndExecute(
        {
          subject: '',
          description: 'Empty subject should fail in TaskStore',
        },
        signal,
      );

      expect(result.error).toBeDefined();
    });
  });

  describe('validation', () => {
    it('should throw on missing subject parameter', async () => {
      await expect(
        tool.buildAndExecute(
          { description: 'Missing subject' } as unknown as TaskCreateToolParams,
          signal,
        ),
      ).rejects.toThrow();
    });

    it('should throw on missing description parameter', async () => {
      await expect(
        tool.buildAndExecute(
          { subject: 'Missing description' } as unknown as TaskCreateToolParams,
          signal,
        ),
      ).rejects.toThrow();
    });
  });
});
