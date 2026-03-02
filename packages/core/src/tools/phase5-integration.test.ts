/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Phase 5 — Cross-Module Integration Tests
 *
 * Verifies Phase 1~4 changes work together:
 * - INTEGRATION-1: TaskCreate → TaskList round-trip
 * - INTEGRATION-2: TaskCreate → TaskUpdate → TaskGet workflow
 * - INTEGRATION-3: returnDisplay format consistency (todos: Todo[])
 * - INTEGRATION-5: QuestionOption.markdown type propagation
 * - INTEGRATION-6: AskUser MessageBus round-trip (Issue 9)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TaskStore } from './task-store.js';
import { TaskCreateTool } from './task-create.js';
import { TaskGetTool } from './task-get.js';
import { TaskUpdateTool } from './task-update.js';
import { TaskListTool } from './task-list.js';
import { AskUserTool } from './ask-user.js';
import {
  createMockMessageBus,
  getMockMessageBusInstance,
} from '../test-utils/mock-message-bus.js';
import {
  MessageBusType,
  type AskUserRequest,
  type AskUserResponse,
  type QuestionOption,
} from '../confirmation-bus/types.js';

// --- Shared fixtures ---

const signal = new AbortController().signal;

describe('Phase 5 — Cross-Module Integration Tests', () => {
  let store: TaskStore;
  let createTool: TaskCreateTool;
  let getTool: TaskGetTool;
  let updateTool: TaskUpdateTool;
  let listTool: TaskListTool;

  beforeEach(() => {
    store = new TaskStore();
    const mockBus = createMockMessageBus();
    createTool = new TaskCreateTool(store, mockBus);
    getTool = new TaskGetTool(store, mockBus);
    updateTool = new TaskUpdateTool(store, mockBus);
    listTool = new TaskListTool(store, mockBus);
  });

  // ── INTEGRATION-1: TaskCreate → TaskList round-trip ──

  describe('INTEGRATION-1: TaskCreate → TaskList round-trip', () => {
    it('should list a task created via TaskCreate', async () => {
      const createResult = await createTool.buildAndExecute(
        {
          subject: 'Integration Test',
          description: 'Testing round-trip',
        },
        signal,
      );

      const taskId = JSON.parse(createResult.llmContent as string).taskId;

      const listResult = await listTool.buildAndExecute({}, signal);
      const tasks = JSON.parse(listResult.llmContent as string);

      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe(taskId);
      expect(tasks[0].subject).toBe('Integration Test');
      expect(tasks[0].status).toBe('pending');
    });

    it('should list multiple tasks in creation order', async () => {
      await createTool.buildAndExecute(
        { subject: 'First', description: 'A' },
        signal,
      );
      await createTool.buildAndExecute(
        { subject: 'Second', description: 'B' },
        signal,
      );
      await createTool.buildAndExecute(
        { subject: 'Third', description: 'C' },
        signal,
      );

      const listResult = await listTool.buildAndExecute({}, signal);
      const tasks = JSON.parse(listResult.llmContent as string);

      expect(tasks).toHaveLength(3);
      expect(tasks.map((t: { subject: string }) => t.subject)).toEqual([
        'First',
        'Second',
        'Third',
      ]);
    });
  });

  // ── INTEGRATION-2: TaskCreate → TaskUpdate → TaskGet workflow ──

  describe('INTEGRATION-2: TaskCreate → TaskUpdate → TaskGet workflow', () => {
    it('should reflect status update in TaskGet', async () => {
      const createResult = await createTool.buildAndExecute(
        {
          subject: 'Workflow Test',
          description: 'Testing workflow',
          activeForm: 'Testing',
        },
        signal,
      );
      const taskId = JSON.parse(createResult.llmContent as string).taskId;

      await updateTool.buildAndExecute(
        { taskId, status: 'in_progress' },
        signal,
      );

      const getResult = await getTool.buildAndExecute({ taskId }, signal);
      const task = JSON.parse(getResult.llmContent as string);

      expect(task.status).toBe('in_progress');
      expect(task.activeForm).toBe('Testing');
    });

    it('should track full lifecycle: pending → in_progress → completed', async () => {
      const createResult = await createTool.buildAndExecute(
        { subject: 'Lifecycle', description: 'Full lifecycle test' },
        signal,
      );
      const taskId = JSON.parse(createResult.llmContent as string).taskId;

      // pending → in_progress
      await updateTool.buildAndExecute(
        { taskId, status: 'in_progress' },
        signal,
      );
      let getResult = await getTool.buildAndExecute({ taskId }, signal);
      expect(JSON.parse(getResult.llmContent as string).status).toBe(
        'in_progress',
      );

      // in_progress → completed
      await updateTool.buildAndExecute({ taskId, status: 'completed' }, signal);
      getResult = await getTool.buildAndExecute({ taskId }, signal);
      expect(JSON.parse(getResult.llmContent as string).status).toBe(
        'completed',
      );
    });

    it('should support dependency wiring across tasks', async () => {
      const r1 = await createTool.buildAndExecute(
        { subject: 'Parent', description: 'Parent task' },
        signal,
      );
      const r2 = await createTool.buildAndExecute(
        { subject: 'Child', description: 'Child task' },
        signal,
      );
      const parentId = JSON.parse(r1.llmContent as string).taskId;
      const childId = JSON.parse(r2.llmContent as string).taskId;

      // Wire dependency: child blocked by parent
      await updateTool.buildAndExecute(
        { taskId: childId, addBlockedBy: [parentId] },
        signal,
      );

      // Verify child has blockedBy
      const childResult = await getTool.buildAndExecute(
        { taskId: childId },
        signal,
      );
      const child = JSON.parse(childResult.llmContent as string);
      expect(child.blockedBy).toContain(parentId);

      // Verify parent has blocks
      const parentResult = await getTool.buildAndExecute(
        { taskId: parentId },
        signal,
      );
      const parent = JSON.parse(parentResult.llmContent as string);
      expect(parent.blocks).toContain(childId);
    });
  });

  // ── INTEGRATION-3: returnDisplay format consistency ──

  describe('INTEGRATION-3: returnDisplay format consistency', () => {
    it('TaskCreate returnDisplay has todos array', async () => {
      const result = await createTool.buildAndExecute(
        { subject: 'Test', description: 'Desc' },
        signal,
      );

      expect(result.returnDisplay).toHaveProperty('todos');
      const display = result.returnDisplay as { todos: unknown[] };
      expect(Array.isArray(display.todos)).toBe(true);
      expect(display.todos.length).toBeGreaterThan(0);
    });

    it('TaskUpdate returnDisplay has todos array', async () => {
      await createTool.buildAndExecute(
        { subject: 'Test', description: 'Desc' },
        signal,
      );

      const updateResult = await updateTool.buildAndExecute(
        { taskId: '1', status: 'in_progress' },
        signal,
      );

      expect(updateResult.returnDisplay).toHaveProperty('todos');
      const display = updateResult.returnDisplay as { todos: unknown[] };
      expect(Array.isArray(display.todos)).toBe(true);
    });

    it('TaskList returnDisplay has todos array', async () => {
      await createTool.buildAndExecute(
        { subject: 'Test', description: 'Desc' },
        signal,
      );

      const listResult = await listTool.buildAndExecute({}, signal);

      expect(listResult.returnDisplay).toHaveProperty('todos');
      const display = listResult.returnDisplay as { todos: unknown[] };
      expect(Array.isArray(display.todos)).toBe(true);
    });

    it('all Task* tools return consistent todo format with description/status', async () => {
      await createTool.buildAndExecute(
        {
          subject: 'Consistency Check',
          description: 'Testing format',
          activeForm: 'Checking',
        },
        signal,
      );

      const listResult = await listTool.buildAndExecute({}, signal);
      const display = listResult.returnDisplay as {
        todos: Array<{ description: string; status: string }>;
      };

      expect(display.todos[0]).toHaveProperty('description');
      expect(display.todos[0]).toHaveProperty('status');
      expect(typeof display.todos[0].description).toBe('string');
      expect(typeof display.todos[0].status).toBe('string');
    });
  });

  // ── INTEGRATION-5: QuestionOption.markdown type propagation ──

  describe('INTEGRATION-5: QuestionOption.markdown type propagation', () => {
    it('QuestionOption supports markdown field (compile-time + runtime)', () => {
      // This test verifies that the markdown field is part of the QuestionOption type.
      // If the types.ts change were reverted, this would fail at compile time.
      const optionWithMarkdown: QuestionOption = {
        label: 'Horizontal Layout',
        description: 'Side-by-side panels',
        markdown: '┌─────┐\n│ A │ B │\n└─────┘',
      };

      expect(optionWithMarkdown.markdown).toBeDefined();
      expect(typeof optionWithMarkdown.markdown).toBe('string');
    });

    it('QuestionOption remains backward compatible without markdown', () => {
      const optionWithoutMarkdown: QuestionOption = {
        label: 'Simple Option',
        description: 'No preview',
      };

      expect(optionWithoutMarkdown.markdown).toBeUndefined();
    });
  });

  // ── INTEGRATION-6: AskUser MessageBus round-trip (Issue 9) ──

  describe('INTEGRATION-6: AskUser MessageBus round-trip (Issue 9)', () => {
    it('should complete full MessageBus cycle: request → response', async () => {
      const mockBus = createMockMessageBus();
      const mockInstance = getMockMessageBusInstance(mockBus);
      const tool = new AskUserTool(mockBus);

      // Auto-respond pattern: subscribe to requests and immediately reply
      mockBus.subscribe(
        MessageBusType.ASK_USER_REQUEST,
        (msg: AskUserRequest) => {
          expect(msg.questions).toHaveLength(1);
          expect(msg.questions[0].question).toBe('Runtime test?');

          mockInstance.publish({
            type: MessageBusType.ASK_USER_RESPONSE,
            correlationId: msg.correlationId,
            answers: { '0': 'Yes' },
          } as AskUserResponse);
        },
      );

      const invocation = tool.build({
        questions: [
          {
            question: 'Runtime test?',
            header: 'Test',
            options: [
              { label: 'Yes', description: 'Confirm' },
              { label: 'No', description: 'Deny' },
            ],
            multiSelect: false,
          },
        ],
      });

      const result = await invocation.execute(signal);

      expect(result.error).toBeUndefined();
      expect(result.llmContent).toContain('Yes');

      // Verify request was published
      const publishedRequest = mockInstance.publishedMessages.find(
        (m) => m.type === MessageBusType.ASK_USER_REQUEST,
      );
      expect(publishedRequest).toBeDefined();
    });

    it('should handle cancelled response correctly (R1)', async () => {
      const mockBus = createMockMessageBus();
      const mockInstance = getMockMessageBusInstance(mockBus);
      const tool = new AskUserTool(mockBus);

      // Auto-respond with cancellation
      mockBus.subscribe(
        MessageBusType.ASK_USER_REQUEST,
        (msg: AskUserRequest) => {
          mockInstance.publish({
            type: MessageBusType.ASK_USER_RESPONSE,
            correlationId: msg.correlationId,
            answers: {},
            cancelled: true,
          } as AskUserResponse);
        },
      );

      const invocation = tool.build({
        questions: [
          {
            question: 'Will cancel?',
            header: 'Test',
            options: [
              { label: 'A', description: 'First' },
              { label: 'B', description: 'Second' },
            ],
            multiSelect: false,
          },
        ],
      });

      const result = await invocation.execute(signal);

      expect(result.error).toBeDefined();
      expect(result.llmContent).toBe(
        'User cancelled the question without answering.',
      );
    });

    it('should resolve with cancel result when signal already aborted (R3)', async () => {
      const mockBus = createMockMessageBus();
      const tool = new AskUserTool(mockBus);
      const controller = new AbortController();

      // Pre-abort the signal before execute — tests the early return path
      controller.abort();

      const invocation = tool.build({
        questions: [
          {
            question: 'Will abort',
            header: 'Test',
            options: [
              { label: 'A', description: 'First' },
              { label: 'B', description: 'Second' },
            ],
            multiSelect: false,
          },
        ],
      });

      const result = await invocation.execute(controller.signal);
      expect(result.error).toBeDefined();
      expect(result.llmContent).toBe('Tool execution cancelled by user.');
    });

    it('should propagate markdown field through request (INTEGRATION-5 runtime)', async () => {
      const mockBus = createMockMessageBus();
      const mockInstance = getMockMessageBusInstance(mockBus);
      const tool = new AskUserTool(mockBus);

      let receivedMarkdown: string | undefined;

      mockBus.subscribe(
        MessageBusType.ASK_USER_REQUEST,
        (msg: AskUserRequest) => {
          receivedMarkdown = msg.questions[0].options?.[0]?.markdown;

          mockInstance.publish({
            type: MessageBusType.ASK_USER_RESPONSE,
            correlationId: msg.correlationId,
            answers: { '0': 'Layout A' },
          } as AskUserResponse);
        },
      );

      const invocation = tool.build({
        questions: [
          {
            question: 'Which layout?',
            header: 'Layout',
            options: [
              {
                label: 'Layout A',
                description: 'Horizontal',
                markdown: '┌───┐\n│A│B│\n└───┘',
              },
              { label: 'Layout B', description: 'Vertical' },
            ],
            multiSelect: false,
          },
        ],
      });

      await invocation.execute(signal);

      expect(receivedMarkdown).toBe('┌───┐\n│A│B│\n└───┘');
    });
  });
});
