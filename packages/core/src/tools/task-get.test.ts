/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { TaskStore } from './task-store.js';
import { TaskGetTool, type TaskGetToolParams } from './task-get.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

describe('TaskGetTool', () => {
  let store: TaskStore;
  let tool: TaskGetTool;
  const signal = new AbortController().signal;

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

    it('should return task with dependency info', async () => {
      store.create({ subject: 'Task 2', description: 'Second' });
      store.addBlocks('1', ['2']);

      const result = await tool.buildAndExecute({ taskId: '1' }, signal);
      const parsed = JSON.parse(result.llmContent as string);
      expect(parsed.blocks).toContain('2');
    });
  });

  describe('validation', () => {
    it('should throw on missing taskId parameter', async () => {
      await expect(
        tool.buildAndExecute({} as unknown as TaskGetToolParams, signal),
      ).rejects.toThrow();
    });
  });
});
