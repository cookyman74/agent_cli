/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Todo } from './tools.js';

// --- Type definitions ---

export type TaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  subject: string;
  description: string;
  status: TaskStatus;
  activeForm?: string;
  owner?: string;
  metadata?: Record<string, unknown>;
  blocks: string[];
  blockedBy: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TaskSummary {
  id: string;
  subject: string;
  status: TaskStatus;
  owner?: string;
  blockedBy: string[];
}

export interface TaskCreateParams {
  subject: string;
  description: string;
  activeForm?: string;
  metadata?: Record<string, unknown>;
}

export interface TaskUpdateParams {
  status?: TaskStatus;
  subject?: string;
  description?: string;
  activeForm?: string;
  owner?: string;
  metadata?: Record<string, unknown | null>;
}

// --- Status transition rules ---

const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress', 'completed'],
  in_progress: ['pending', 'completed'],
  completed: [], // completed is terminal
};

// --- TaskStore class ---

export class TaskStore {
  private tasks = new Map<string, Task>();
  private nextId = 1;

  /** Creates a new task with auto-incrementing string ID and 'pending' status. */
  create(params: TaskCreateParams): Task {
    if (typeof params.subject !== 'string' || !params.subject.trim()) {
      throw new Error('subject must be a non-empty string');
    }
    if (typeof params.description !== 'string' || !params.description.trim()) {
      throw new Error('description must be a non-empty string');
    }
    if (
      params.activeForm !== undefined &&
      typeof params.activeForm !== 'string'
    ) {
      throw new Error('activeForm must be a string');
    }
    if (params.metadata !== undefined) {
      if (params.metadata === null || typeof params.metadata !== 'object') {
        throw new Error('metadata must be a non-null object');
      }
      try {
        structuredClone(params.metadata);
      } catch {
        throw new Error('metadata contains non-cloneable values');
      }
    }
    const now = Date.now();
    const task: Task = {
      id: String(this.nextId++),
      subject: params.subject,
      description: params.description,
      status: 'pending',
      activeForm: params.activeForm,
      metadata: params.metadata ? structuredClone(params.metadata) : undefined,
      blocks: [],
      blockedBy: [],
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    return structuredClone(task);
  }

  /** Returns the task with the given ID, or null if not found. */
  get(id: string): Task | null {
    const task = this.tasks.get(id);
    return task ? structuredClone(task) : null;
  }

  /** Updates task fields. Returns null if task not found, completed, or invalid. */
  update(id: string, params: TaskUpdateParams): Task | null {
    const task = this.tasks.get(id);
    if (!task) return null;

    // Completed terminal guard: block ALL writes
    if (task.status === 'completed') return null;

    // Input validation: reject empty strings and non-string types
    if (
      params.subject !== undefined &&
      (typeof params.subject !== 'string' || !params.subject.trim())
    )
      return null;
    if (
      params.description !== undefined &&
      (typeof params.description !== 'string' || !params.description.trim())
    )
      return null;
    if (
      params.activeForm !== undefined &&
      typeof params.activeForm !== 'string'
    )
      return null;
    if (params.owner !== undefined && typeof params.owner !== 'string')
      return null;

    // Status transition: same-status = no-op, otherwise validate
    if (params.status !== undefined && params.status !== task.status) {
      if (!VALID_TRANSITIONS[task.status].includes(params.status)) {
        return null;
      }
      task.status = params.status;
    }

    if (params.subject !== undefined) task.subject = params.subject;
    if (params.description !== undefined) task.description = params.description;
    if (params.activeForm !== undefined) task.activeForm = params.activeForm;
    if (params.owner !== undefined) task.owner = params.owner;

    // Merge metadata: pre-validate cloneability, then merge (null deletes keys)
    if (params.metadata !== undefined) {
      if (params.metadata === null || typeof params.metadata !== 'object') {
        return null;
      }
      try {
        structuredClone(params.metadata);
      } catch {
        return null;
      }
      if (!task.metadata) task.metadata = {};
      const clonedMetadata = structuredClone(params.metadata);
      for (const [key, value] of Object.entries(clonedMetadata)) {
        if (value === null) {
          delete task.metadata[key];
        } else {
          task.metadata[key] = value;
        }
      }
    }

    task.updatedAt = Date.now();
    return structuredClone(task);
  }

  /** Deletes the task and cleans up all dependency references. */
  delete(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    const now = Date.now();

    // Clean up dependency references and update timestamps
    for (const blockedId of task.blocks) {
      const blocked = this.tasks.get(blockedId);
      if (blocked) {
        blocked.blockedBy = blocked.blockedBy.filter((bid) => bid !== id);
        blocked.updatedAt = now;
      }
    }
    for (const blockerId of task.blockedBy) {
      const blocker = this.tasks.get(blockerId);
      if (blocker) {
        blocker.blocks = blocker.blocks.filter((bid) => bid !== id);
        blocker.updatedAt = now;
      }
    }

    this.tasks.delete(id);
    return true;
  }

  /** Marks taskId as blocking each of the given blockedIds. */
  addBlocks(taskId: string, blockedIds: string[]): void {
    this.addDependency(taskId, blockedIds, 'blocks');
  }

  /** Marks taskId as blocked by each of the given blockingIds. */
  addBlockedBy(taskId: string, blockingIds: string[]): void {
    this.addDependency(taskId, blockingIds, 'blockedBy');
  }

  /** Returns IDs of non-completed tasks that block the given task. */
  getOpenBlockers(taskId: string): string[] {
    const task = this.tasks.get(taskId);
    if (!task) return [];

    return task.blockedBy.filter((blockerId) => {
      const blocker = this.tasks.get(blockerId);
      return blocker && blocker.status !== 'completed';
    });
  }

  /** Returns summary of all tasks with only open (non-completed) blockers. */
  list(): TaskSummary[] {
    const summaries: TaskSummary[] = [];
    for (const task of this.tasks.values()) {
      summaries.push({
        id: task.id,
        subject: task.subject,
        status: task.status,
        owner: task.owner,
        blockedBy: this.getOpenBlockers(task.id),
      });
    }
    return summaries;
  }

  /** Converts all tasks to the existing Todo[] format for CLI TodoTray compatibility. */
  toTodoList(): Todo[] {
    const todos: Todo[] = [];
    for (const task of this.tasks.values()) {
      let description = task.subject;
      if (task.status === 'in_progress' && task.activeForm) {
        description = `${task.subject} — ${task.activeForm}`;
      }
      todos.push({ description, status: task.status });
    }
    return todos;
  }

  // --- Private helpers ---

  private addDependency(
    taskId: string,
    targetIds: string[],
    direction: 'blocks' | 'blockedBy',
  ): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    if (task.status === 'completed') return;

    const forward = direction; // e.g. 'blocks'
    const reverse = direction === 'blocks' ? 'blockedBy' : 'blocks';
    const now = Date.now();

    for (const targetId of targetIds) {
      if (targetId === taskId) continue; // Self-dependency guard
      const target = this.tasks.get(targetId);
      if (!target) continue;
      let changed = false;
      if (!task[forward].includes(targetId)) {
        task[forward].push(targetId);
        changed = true;
      }
      if (!target[reverse].includes(taskId)) {
        target[reverse].push(taskId);
        changed = true;
      }
      if (changed) {
        task.updatedAt = now;
        target.updatedAt = now;
      }
    }
  }
}
