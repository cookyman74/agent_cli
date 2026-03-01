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

const TASK_GET_DESCRIPTION = `Retrieve full details of a task by its ID.

Returns the complete task object including subject, description, status, dependencies (blocks/blockedBy), timestamps, and metadata. Use this to check task requirements before starting work or to understand task dependencies.

Parameters:
- taskId (required): The ID of the task to retrieve`;

// --- Params interface ---

export interface TaskGetToolParams {
  taskId: string;
}

// --- Invocation ---

class TaskGetToolInvocation extends BaseToolInvocation<
  TaskGetToolParams,
  ToolResult
> {
  constructor(
    params: TaskGetToolParams,
    private readonly taskStore: TaskStore,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    return `Get task ${this.params.taskId}`;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const task = this.taskStore.get(this.params.taskId);

    if (!task) {
      const message = `Task ${this.params.taskId} not found.`;
      return {
        llmContent: message,
        returnDisplay: message,
        error: {
          message,
          type: ToolErrorType.INVALID_TOOL_PARAMS,
        },
      };
    }

    return {
      llmContent: JSON.stringify(task),
      returnDisplay: JSON.stringify(task, null, 2),
    };
  }
}

// --- Tool class ---

export class TaskGetTool extends BaseDeclarativeTool<
  TaskGetToolParams,
  ToolResult
> {
  static readonly Name = 'task_get';

  constructor(
    private readonly taskStore: TaskStore,
    messageBus: MessageBus,
  ) {
    super(
      TaskGetTool.Name,
      'TaskGet',
      TASK_GET_DESCRIPTION,
      Kind.Other,
      {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The ID of the task to retrieve',
          },
        },
        required: ['taskId'],
        additionalProperties: false,
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: TaskGetToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _displayName?: string,
  ): ToolInvocation<TaskGetToolParams, ToolResult> {
    return new TaskGetToolInvocation(
      params,
      this.taskStore,
      messageBus,
      _toolName,
      _displayName,
    );
  }
}
