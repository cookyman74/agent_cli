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

const TASK_UPDATE_DESCRIPTION = `Update an existing task's fields, status, dependencies, or delete it.

Use this tool to:
- Change task status: pending → in_progress → completed (completed is terminal)
- Update task fields: subject, description, activeForm, owner, metadata
- Manage dependencies: addBlocks (this task blocks others), addBlockedBy (this task is blocked by others)
- Delete a task: set status to "deleted" for physical removal

Parameters:
- taskId (required): The ID of the task to update
- status (optional): New status — 'pending', 'in_progress', 'completed', or 'deleted'
- subject (optional): Updated task title
- description (optional): Updated task description
- activeForm (optional): Updated spinner text for in_progress state
- owner (optional): Assign task to a sub-agent
- metadata (optional): Key-value data to merge (set key to null to delete it)
- addBlocks (optional): Array of task IDs that this task blocks
- addBlockedBy (optional): Array of task IDs that block this task`;

// --- Params interface ---

export interface TaskUpdateToolParams {
  taskId: string;
  status?: 'pending' | 'in_progress' | 'completed' | 'deleted';
  subject?: string;
  description?: string;
  activeForm?: string;
  owner?: string;
  metadata?: Record<string, unknown | null>;
  addBlocks?: string[];
  addBlockedBy?: string[];
}

// --- Invocation ---

class TaskUpdateToolInvocation extends BaseToolInvocation<
  TaskUpdateToolParams,
  ToolResult
> {
  constructor(
    params: TaskUpdateToolParams,
    private readonly taskStore: TaskStore,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(params, messageBus, _toolName, _toolDisplayName);
  }

  getDescription(): string {
    if (this.params.status === 'deleted') {
      return `Delete task ${this.params.taskId}`;
    }
    return `Update task ${this.params.taskId}`;
  }

  async execute(
    _signal: AbortSignal,
    _updateOutput?: (output: string) => void,
  ): Promise<ToolResult> {
    const { taskId } = this.params;

    // Handle delete
    if (this.params.status === 'deleted') {
      const deleted = this.taskStore.delete(taskId);
      if (!deleted) {
        const message = `Task ${taskId} not found.`;
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
        llmContent: JSON.stringify({
          taskId,
          status: 'deleted',
        }),
        returnDisplay: { todos: this.taskStore.toTodoList() },
      };
    }

    // Build update params (exclude taskId, addBlocks, addBlockedBy)
    const updateParams: Record<string, unknown> = {};
    if (this.params.status !== undefined)
      updateParams['status'] = this.params.status;
    if (this.params.subject !== undefined)
      updateParams['subject'] = this.params.subject;
    if (this.params.description !== undefined)
      updateParams['description'] = this.params.description;
    if (this.params.activeForm !== undefined)
      updateParams['activeForm'] = this.params.activeForm;
    if (this.params.owner !== undefined)
      updateParams['owner'] = this.params.owner;
    if (this.params.metadata !== undefined)
      updateParams['metadata'] = this.params.metadata;

    // Apply field/status updates
    const hasFieldUpdates = Object.keys(updateParams).length > 0;
    if (hasFieldUpdates) {
      const updated = this.taskStore.update(taskId, updateParams);
      if (!updated) {
        const message = `Failed to update task ${taskId}. Task may not exist or update may be invalid.`;
        return {
          llmContent: message,
          returnDisplay: message,
          error: {
            message,
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
        };
      }
    } else {
      // No field updates — verify task exists before processing dependencies
      const task = this.taskStore.get(taskId);
      if (!task) {
        const message = `Task ${taskId} not found.`;
        return {
          llmContent: message,
          returnDisplay: message,
          error: {
            message,
            type: ToolErrorType.INVALID_TOOL_PARAMS,
          },
        };
      }
    }

    // Apply dependency updates
    if (this.params.addBlocks) {
      this.taskStore.addBlocks(taskId, this.params.addBlocks);
    }
    if (this.params.addBlockedBy) {
      this.taskStore.addBlockedBy(taskId, this.params.addBlockedBy);
    }

    // Return updated task state
    const task = this.taskStore.get(taskId)!;
    return {
      llmContent: JSON.stringify({
        taskId: task.id,
        status: task.status,
        subject: task.subject,
      }),
      returnDisplay: { todos: this.taskStore.toTodoList() },
    };
  }
}

// --- Tool class ---

export class TaskUpdateTool extends BaseDeclarativeTool<
  TaskUpdateToolParams,
  ToolResult
> {
  static readonly Name = 'task_update';

  constructor(
    private readonly taskStore: TaskStore,
    messageBus: MessageBus,
  ) {
    super(
      TaskUpdateTool.Name,
      'TaskUpdate',
      TASK_UPDATE_DESCRIPTION,
      Kind.Other,
      {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The ID of the task to update',
          },
          status: {
            type: 'string',
            description: 'New status for the task',
            enum: ['pending', 'in_progress', 'completed', 'deleted'],
          },
          subject: {
            type: 'string',
            description: 'Updated task title',
          },
          description: {
            type: 'string',
            description: 'Updated task description',
          },
          activeForm: {
            type: 'string',
            description:
              'Present continuous form shown in spinner when task is in_progress',
          },
          owner: {
            type: 'string',
            description: 'Assign task to a sub-agent',
          },
          metadata: {
            type: 'object',
            description:
              'Key-value data to merge into task metadata. Set a key to null to delete it.',
          },
          addBlocks: {
            type: 'array',
            description:
              'Array of task IDs that this task blocks (cannot start until this one completes)',
            items: { type: 'string' },
          },
          addBlockedBy: {
            type: 'array',
            description:
              'Array of task IDs that block this task (must complete before this one can start)',
            items: { type: 'string' },
          },
        },
        required: ['taskId'],
        additionalProperties: false,
      },
      messageBus,
    );
  }

  protected createInvocation(
    params: TaskUpdateToolParams,
    messageBus: MessageBus,
    _toolName?: string,
    _displayName?: string,
  ): ToolInvocation<TaskUpdateToolParams, ToolResult> {
    return new TaskUpdateToolInvocation(
      params,
      this.taskStore,
      messageBus,
      _toolName,
      _displayName,
    );
  }
}
