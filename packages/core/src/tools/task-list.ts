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
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import type { TaskStore } from './task-store.js';

// --- Tool description ---

const TASK_LIST_DESCRIPTION = `List all tasks with summary information.

Returns an array of task summaries including id, subject, status, owner, and active blockers. Use this to check overall progress, find available tasks, or identify blocked work.

No parameters required.`;

// --- Params interface ---

export type TaskListToolParams = Record<string, never>;

// --- Invocation ---

class TaskListToolInvocation extends BaseToolInvocation<
  TaskListToolParams,
  ToolResult
> {
  constructor(
    params: TaskListToolParams,
    private readonly taskStore: TaskStore,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    return 'List all tasks';
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const summaries = this.taskStore.list();

    if (summaries.length === 0) {
      return {
        llmContent: 'No tasks found.',
        returnDisplay: { todos: [] },
      };
    }

    return {
      llmContent: JSON.stringify(summaries),
      returnDisplay: { todos: this.taskStore.toTodoList() },
    };
  }
}

// --- Tool class ---

export class TaskListTool extends BaseDeclarativeTool<
  TaskListToolParams,
  ToolResult
> {
  static readonly Name = 'task_list';

  constructor(
    private readonly taskStore: TaskStore,
    messageBus: MessageBus,
  ) {
    super(
      TaskListTool.Name,
      'TaskList',
      TASK_LIST_DESCRIPTION,
      Kind.Other,
      {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: TaskListToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _displayName?: string,
  ): ToolInvocation<TaskListToolParams, ToolResult> {
    return new TaskListToolInvocation(
      params,
      this.taskStore,
      messageBus,
      _toolName,
      _displayName,
    );
  }
}
