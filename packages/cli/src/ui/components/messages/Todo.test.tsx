/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../../test-utils/render.js';
import { describe, it, expect } from 'vitest';
import { Box } from 'ink';
import { TodoTray } from './Todo.js';
import type { Todo } from '@didim365/agent-cli-core';
import type { UIState } from '../../contexts/UIStateContext.js';
import { UIStateContext } from '../../contexts/UIStateContext.js';
import { StreamingContext } from '../../contexts/StreamingContext.js';
import type { HistoryItem, HistoryItemWithoutId } from '../../types.js';
import { ToolCallStatus, StreamingState } from '../../types.js';

const createTodoHistoryItem = (todos: Todo[]): HistoryItem =>
  ({
    type: 'tool_group',
    id: '1',
    tools: [
      {
        name: 'task_list',
        callId: 'tool-1',
        status: ToolCallStatus.Success,
        resultDisplay: {
          todos,
        },
      },
    ],
  }) as unknown as HistoryItem;

const createPendingTodoItem = (todos: Todo[]): HistoryItemWithoutId =>
  ({
    type: 'tool_group',
    tools: [
      {
        name: 'task_update',
        callId: 'tool-pending',
        status: ToolCallStatus.Executing,
        resultDisplay: {
          todos,
        },
      },
    ],
  }) as unknown as HistoryItemWithoutId;

describe.each([true, false])(
  '<TodoTray /> (showFullTodos: %s)',
  (showFullTodos: boolean) => {
    const renderWithUiState = (
      uiState: Partial<UIState>,
      streamingState: StreamingState = StreamingState.Idle,
    ) =>
      render(
        <StreamingContext.Provider value={streamingState}>
          <UIStateContext.Provider
            value={
              {
                pendingHistoryItems: [],
                ...uiState,
              } as UIState
            }
          >
            <TodoTray />
          </UIStateContext.Provider>
        </StreamingContext.Provider>,
      );

    it('renders null when no todos are in the history', () => {
      const { lastFrame } = renderWithUiState({ history: [], showFullTodos });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders null when todo list is empty', () => {
      const { lastFrame } = renderWithUiState({
        history: [createTodoHistoryItem([])],
        showFullTodos,
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders when todos exist but none are in progress', () => {
      const { lastFrame } = renderWithUiState({
        history: [
          createTodoHistoryItem([
            { description: 'Pending Task', status: 'pending' },
            { description: 'In Progress Task', status: 'cancelled' },
            { description: 'Completed Task', status: 'completed' },
          ]),
        ],
        showFullTodos,
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders when todos exist and one is in progress', () => {
      const { lastFrame } = renderWithUiState({
        history: [
          createTodoHistoryItem([
            { description: 'Pending Task', status: 'pending' },
            { description: 'Task 2', status: 'in_progress' },
            { description: 'In Progress Task', status: 'cancelled' },
            { description: 'Completed Task', status: 'completed' },
          ]),
        ],
        showFullTodos,
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders a todo list with long descriptions that wrap when full view is on', () => {
      const { lastFrame } = render(
        <StreamingContext.Provider value={StreamingState.Idle}>
          <Box width="50">
            <UIStateContext.Provider
              value={
                {
                  history: [
                    createTodoHistoryItem([
                      {
                        description:
                          'This is a very long description for a pending task that should wrap around multiple lines when the terminal width is constrained.',
                        status: 'in_progress',
                      },
                      {
                        description:
                          'Another completed task with an equally verbose description to test wrapping behavior.',
                        status: 'completed',
                      },
                    ]),
                  ],
                  pendingHistoryItems: [],
                  showFullTodos,
                } as unknown as UIState
              }
            >
              <TodoTray />
            </UIStateContext.Provider>
          </Box>
        </StreamingContext.Provider>,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders the most recent todo list when multiple task tool calls are in history', () => {
      const { lastFrame } = renderWithUiState({
        history: [
          createTodoHistoryItem([
            { description: 'Older Task 1', status: 'completed' },
            { description: 'Older Task 2', status: 'pending' },
          ]),
          createTodoHistoryItem([
            { description: 'Newer Task 1', status: 'pending' },
            { description: 'Newer Task 2', status: 'in_progress' },
          ]),
        ],
        showFullTodos,
      });
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders full list when all todos are inactive', () => {
      const { lastFrame } = renderWithUiState({
        history: [
          createTodoHistoryItem([
            { description: 'Task 1', status: 'completed' },
            { description: 'Task 2', status: 'cancelled' },
          ]),
        ],
        showFullTodos,
      });
      expect(lastFrame()).toMatchSnapshot();
    });
  },
);

describe('<TodoTray /> pending state priority', () => {
  const renderWithUiState = (
    uiState: Partial<UIState>,
    streamingState: StreamingState = StreamingState.Idle,
  ) =>
    render(
      <StreamingContext.Provider value={streamingState}>
        <UIStateContext.Provider
          value={
            {
              pendingHistoryItems: [],
              showFullTodos: true,
              ...uiState,
            } as UIState
          }
        >
          <TodoTray />
        </UIStateContext.Provider>
      </StreamingContext.Provider>,
    );

  it('prefers pending items over finalized history', () => {
    const { lastFrame } = renderWithUiState({
      history: [
        createTodoHistoryItem([{ description: 'Old Task', status: 'pending' }]),
      ],
      pendingHistoryItems: [
        createPendingTodoItem([
          { description: 'Live Task', status: 'in_progress' },
        ]),
      ],
    });
    const frame = lastFrame();
    expect(frame).toContain('Live Task');
    expect(frame).not.toContain('Old Task');
  });

  it('falls back to history when no pending items have todos', () => {
    const { lastFrame } = renderWithUiState({
      history: [
        createTodoHistoryItem([
          { description: 'History Task', status: 'pending' },
        ]),
      ],
      pendingHistoryItems: [],
    });
    expect(lastFrame()).toContain('History Task');
  });

  it('returns most recent TodoList within a tool group (reverse inner loop)', () => {
    const multiToolGroup: HistoryItem = {
      type: 'tool_group',
      id: '2',
      tools: [
        {
          name: 'task_create',
          callId: 'tool-1',
          status: ToolCallStatus.Success,
          resultDisplay: {
            todos: [{ description: 'Stale Task', status: 'pending' }],
          },
        },
        {
          name: 'task_update',
          callId: 'tool-2',
          status: ToolCallStatus.Success,
          resultDisplay: {
            todos: [{ description: 'Fresh Task', status: 'in_progress' }],
          },
        },
      ],
    } as unknown as HistoryItem;

    const { lastFrame } = renderWithUiState({
      history: [multiToolGroup],
    });
    const frame = lastFrame();
    expect(frame).toContain('Fresh Task');
    expect(frame).not.toContain('Stale Task');
  });

  it('prefers TodoList with more items when multiple schedulers interleave', () => {
    // Simulates multi-scheduler scenario where tools from different
    // schedulers are flattened in non-chronological order.
    // The TodoList with more items (more comprehensive snapshot) should win.
    const multiSchedulerGroup: HistoryItem = {
      type: 'tool_group',
      id: '3',
      tools: [
        {
          name: 'task_update',
          callId: 'tool-sub-1',
          status: ToolCallStatus.Success,
          resultDisplay: {
            todos: [{ description: 'Task A', status: 'completed' }],
          },
        },
        {
          name: 'task_create',
          callId: 'tool-root-1',
          status: ToolCallStatus.Success,
          resultDisplay: {
            todos: [
              { description: 'Task A', status: 'completed' },
              { description: 'Task B', status: 'in_progress' },
            ],
          },
        },
      ],
    } as unknown as HistoryItem;

    const { lastFrame } = renderWithUiState({
      history: [multiSchedulerGroup],
    });
    const frame = lastFrame();
    // Should pick the TodoList with 2 items (more comprehensive)
    expect(frame).toContain('Task B');
  });
});

describe('<TodoTray /> streaming connector view', () => {
  const renderStreaming = (
    todos: Todo[],
    streamingState: StreamingState = StreamingState.Responding,
  ) =>
    render(
      <StreamingContext.Provider value={streamingState}>
        <UIStateContext.Provider
          value={
            {
              history: [createTodoHistoryItem(todos)],
              pendingHistoryItems: [],
              showFullTodos: false,
            } as unknown as UIState
          }
        >
          <TodoTray />
        </UIStateContext.Provider>
      </StreamingContext.Provider>,
    );

  it('renders connector view during streaming with active todos', () => {
    const { lastFrame } = renderStreaming([
      { description: 'Done Task', status: 'completed' },
      { description: 'Active Task', status: 'in_progress' },
      { description: 'Next Task', status: 'pending' },
    ]);
    const frame = lastFrame();
    expect(frame).toContain('⎿');
    expect(frame).toContain('Done Task');
    expect(frame).toContain('Active Task');
    expect(frame).toContain('Next Task');
  });

  it('renders normal view when not streaming', () => {
    const { lastFrame } = renderStreaming(
      [
        { description: 'Done Task', status: 'completed' },
        { description: 'Active Task', status: 'in_progress' },
      ],
      StreamingState.Idle,
    );
    const frame = lastFrame();
    expect(frame).not.toContain('⎿');
    expect(frame).toContain('Todo');
  });

  it('uses updated status icons', () => {
    const { lastFrame } = renderStreaming([
      { description: 'Done', status: 'completed' },
      { description: 'Working', status: 'in_progress' },
      { description: 'Waiting', status: 'pending' },
    ]);
    const frame = lastFrame();
    expect(frame).toContain('✔');
    expect(frame).toContain('◼');
    expect(frame).toContain('◻');
  });
});

describe('<TodoTray /> stable streaming (between-turn gap)', () => {
  it('preserves connector view when streaming briefly becomes Idle with active todos', () => {
    const todos: Todo[] = [
      { description: 'Task A', status: 'completed' },
      { description: 'Task B', status: 'in_progress' },
    ];
    const historyItem = createTodoHistoryItem(todos);

    // Render first with streaming active to set stableStreamingRef
    const { lastFrame, rerender } = render(
      <StreamingContext.Provider value={StreamingState.Responding}>
        <UIStateContext.Provider
          value={
            {
              history: [historyItem],
              pendingHistoryItems: [],
              showFullTodos: false,
            } as unknown as UIState
          }
        >
          <TodoTray />
        </UIStateContext.Provider>
      </StreamingContext.Provider>,
    );

    // Should show connector view
    expect(lastFrame()).toContain('⎿');
    expect(lastFrame()).toContain('Task B');

    // Re-render with Idle (simulates between-turn gap)
    rerender(
      <StreamingContext.Provider value={StreamingState.Idle}>
        <UIStateContext.Provider
          value={
            {
              history: [historyItem],
              pendingHistoryItems: [],
              showFullTodos: false,
            } as unknown as UIState
          }
        >
          <TodoTray />
        </UIStateContext.Provider>
      </StreamingContext.Provider>,
    );

    // Should STILL show connector view (stableStreamingRef keeps it)
    const frame = lastFrame();
    expect(frame).toContain('⎿');
    expect(frame).toContain('Task A');
    expect(frame).toContain('Task B');
  });

  it('hides connector view when all tasks complete and streaming stops', () => {
    const activeTodos: Todo[] = [
      { description: 'Task A', status: 'in_progress' },
    ];
    const completedTodos: Todo[] = [
      { description: 'Task A', status: 'completed' },
    ];

    // Start streaming with active todos
    const { lastFrame, rerender } = render(
      <StreamingContext.Provider value={StreamingState.Responding}>
        <UIStateContext.Provider
          value={
            {
              history: [createTodoHistoryItem(activeTodos)],
              pendingHistoryItems: [],
              showFullTodos: false,
            } as unknown as UIState
          }
        >
          <TodoTray />
        </UIStateContext.Provider>
      </StreamingContext.Provider>,
    );

    expect(lastFrame()).toContain('⎿');

    // Re-render: all tasks completed + streaming stopped
    rerender(
      <StreamingContext.Provider value={StreamingState.Idle}>
        <UIStateContext.Provider
          value={
            {
              history: [createTodoHistoryItem(completedTodos)],
              pendingHistoryItems: [],
              showFullTodos: false,
            } as unknown as UIState
          }
        >
          <TodoTray />
        </UIStateContext.Provider>
      </StreamingContext.Provider>,
    );

    // Should NOT show connector view — no active todos
    const frame = lastFrame();
    expect(frame).not.toContain('⎿');
  });

  it('uses lastKnownTodos fallback when todos temporarily becomes null during streaming', () => {
    const todos: Todo[] = [{ description: 'Task X', status: 'in_progress' }];

    // Render with valid todos during streaming
    const { lastFrame, rerender } = render(
      <StreamingContext.Provider value={StreamingState.Responding}>
        <UIStateContext.Provider
          value={
            {
              history: [createTodoHistoryItem(todos)],
              pendingHistoryItems: [],
              showFullTodos: false,
            } as unknown as UIState
          }
        >
          <TodoTray />
        </UIStateContext.Provider>
      </StreamingContext.Provider>,
    );

    expect(lastFrame()).toContain('Task X');

    // Re-render with empty history/pending (brief transition during state update)
    rerender(
      <StreamingContext.Provider value={StreamingState.Responding}>
        <UIStateContext.Provider
          value={
            {
              history: [],
              pendingHistoryItems: [],
              showFullTodos: false,
            } as unknown as UIState
          }
        >
          <TodoTray />
        </UIStateContext.Provider>
      </StreamingContext.Provider>,
    );

    // Should STILL show Task X from lastKnownTodosRef fallback
    expect(lastFrame()).toContain('Task X');
  });

  it('clears ghost todos when streaming stops and source is empty', () => {
    const todos: Todo[] = [
      { description: 'Ghost Task', status: 'in_progress' },
    ];

    // 1. Render with valid todos during streaming → caches lastKnownTodos
    const { lastFrame, rerender } = render(
      <StreamingContext.Provider value={StreamingState.Responding}>
        <UIStateContext.Provider
          value={
            {
              history: [createTodoHistoryItem(todos)],
              pendingHistoryItems: [],
              showFullTodos: false,
            } as unknown as UIState
          }
        >
          <TodoTray />
        </UIStateContext.Provider>
      </StreamingContext.Provider>,
    );

    expect(lastFrame()).toContain('Ghost Task');

    // 2. Source becomes empty while still streaming → cache fallback keeps display
    rerender(
      <StreamingContext.Provider value={StreamingState.Responding}>
        <UIStateContext.Provider
          value={
            {
              history: [],
              pendingHistoryItems: [],
              showFullTodos: false,
            } as unknown as UIState
          }
        >
          <TodoTray />
        </UIStateContext.Provider>
      </StreamingContext.Provider>,
    );

    expect(lastFrame()).toContain('Ghost Task');

    // 3. Streaming stops with source still empty → ghost must be cleared
    rerender(
      <StreamingContext.Provider value={StreamingState.Idle}>
        <UIStateContext.Provider
          value={
            {
              history: [],
              pendingHistoryItems: [],
              showFullTodos: false,
            } as unknown as UIState
          }
        >
          <TodoTray />
        </UIStateContext.Provider>
      </StreamingContext.Provider>,
    );

    // Ghost Task must NOT persist — cache cleared by cleanup condition
    expect(lastFrame()).not.toContain('Ghost Task');
  });
});
