# Task Tools (`task_create`, `task_get`, `task_update`, `task_list`)

This document describes the Task tools for the Gemini CLI.

## Description

The Task tools allow the Gemini agent to create and manage structured tasks for
complex user requests. This provides you, the user, with greater visibility into
the agent's plan and its current progress. It also helps with alignment where
the agent is less likely to lose track of its current goal.

### Tools

- **`task_create`**: Create a new task with a subject, description, and active
  form (present continuous label shown during execution).
- **`task_get`**: Retrieve full details of a specific task by its ID, including
  dependencies.
- **`task_update`**: Update a task's status, subject, description, or
  dependencies.
- **`task_list`**: List all tasks with their current status summary.

### Task Fields

- `subject` (string): A brief, actionable title in imperative form (e.g., "Fix
  authentication bug").
- `description` (string): Detailed description of what needs to be done.
- `activeForm` (string): Present continuous form shown in the spinner when the
  task is in progress (e.g., "Fixing authentication bug").
- `status` (string): The current status (`pending`, `in_progress`, `completed`,
  or `deleted`).

## Behavior

The agent uses these tools to break down complex multi-step requests into a
clear plan.

- **Progress tracking:** The agent updates tasks as it works, marking them as
  `completed` when done.
- **Single focus:** Only one task will be marked `in_progress` at a time,
  indicating exactly what the agent is currently working on.
- **Dependencies:** Tasks can declare blocking relationships (`blocks`,
  `blockedBy`) to enforce execution order.
- **Dynamic updates:** The plan may evolve as the agent discovers new
  information, leading to new tasks being added or existing ones being updated.

When active, the current `in_progress` task is displayed above the input box,
keeping you informed of the immediate action. You can toggle the full view of
the task list at any time by pressing `Ctrl+T`.

## Important notes

- **Always enabled:** Task tools are always available and are the primary method
  for tracking progress on multi-step tasks.
- **Intended use:** These tools are primarily used by the agent for complex,
  multi-turn tasks. They are generally not used for simple, single-turn
  questions.
