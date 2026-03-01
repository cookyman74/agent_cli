/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolInvocation } from './tools.js';
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
  type ToolResult,
} from './tools.js';
import { ToolErrorType } from './tool-error.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { TaskStore } from './task-store.js';

// --- Tool description ---

const TASK_CREATE_DESCRIPTION = `Create a new task to track progress on a subtask. Each task gets an auto-incrementing ID and starts with 'pending' status.

Use this when you need to track individual work items with their own lifecycle (pending → in_progress → completed). For complex tasks, create multiple tasks and set up dependencies between them using TaskUpdate.

Parameters:
- subject (required): Brief imperative title (e.g., "Fix authentication bug in login flow")
- description (required): Detailed description of what needs to be done, including context and acceptance criteria
- activeForm (optional): Present continuous form shown while task is in_progress (e.g., "Fixing authentication bug")
- metadata (optional): Arbitrary key-value data to attach to the task`;

// --- Params interface ---

export interface TaskCreateToolParams {
  subject: string;
  description: string;
  activeForm?: string;
  metadata?: Record<string, unknown>;
}

// --- Invocation ---

class TaskCreateToolInvocation extends BaseToolInvocation<
  TaskCreateToolParams,
  ToolResult
> {
  constructor(
    params: TaskCreateToolParams,
    private readonly taskStore: TaskStore,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    return `Create task: ${this.params.subject}`;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    try {
      const task = this.taskStore.create({
        subject: this.params.subject,
        description: this.params.description,
        activeForm: this.params.activeForm,
        metadata: this.params.metadata,
      });

      return {
        llmContent: JSON.stringify({
          taskId: task.id,
          subject: task.subject,
          status: task.status,
        }),
        returnDisplay: { todos: this.taskStore.toTodoList() },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `Error: Failed to create task. Reason: ${message}`,
        returnDisplay: message,
        error: {
          message,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }
}

// --- Tool class ---

export class TaskCreateTool extends BaseDeclarativeTool<
  TaskCreateToolParams,
  ToolResult
> {
  static readonly Name = 'task_create';

  constructor(
    private readonly taskStore: TaskStore,
    messageBus: MessageBus,
  ) {
    super(
      TaskCreateTool.Name,
      'TaskCreate',
      TASK_CREATE_DESCRIPTION,
      Kind.Other,
      {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
            description:
              'Brief imperative title for the task (e.g., "Fix authentication bug in login flow")',
          },
          description: {
            type: 'string',
            description:
              'Detailed description of what needs to be done, including context and acceptance criteria',
          },
          activeForm: {
            type: 'string',
            description:
              'Present continuous form shown in spinner when task is in_progress (e.g., "Fixing authentication bug")',
          },
          metadata: {
            type: 'object',
            description: 'Arbitrary key-value data to attach to the task',
          },
        },
        required: ['subject', 'description'],
        additionalProperties: false,
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: TaskCreateToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _displayName?: string,
  ): ToolInvocation<TaskCreateToolParams, ToolResult> {
    return new TaskCreateToolInvocation(
      params,
      this.taskStore,
      messageBus,
      _toolName,
      _displayName,
    );
  }
}
