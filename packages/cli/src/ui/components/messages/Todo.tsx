/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import {
  type Todo,
  type TodoList,
  type TodoStatus,
  type ToolResultDisplay,
} from '@didim365/agent-cli-core';
import { theme } from '../../semantic-colors.js';
import { useUIState } from '../../contexts/UIStateContext.js';
import { useStreamingContext } from '../../contexts/StreamingContext.js';
import { useMemo, useRef } from 'react';
import {
  type HistoryItemToolGroup,
  type HistoryItemWithoutId,
  StreamingState,
} from '../../types.js';

/** Type guard for TodoList in ToolResultDisplay union. */
function isTodoList(
  display: ToolResultDisplay | undefined,
): display is TodoList {
  return (
    display !== undefined &&
    display !== null &&
    typeof display === 'object' &&
    'todos' in display &&
    Array.isArray(display.todos)
  );
}

/**
 * Extract the most comprehensive TodoList from a tool_group history entry.
 *
 * Each task tool call returns the full current state from a shared store.
 * With multiple schedulers, `Object.values(toolCallsMap).flat()` produces
 * tools in Map-insertion order — which is NOT guaranteed to be chronological
 * across different schedulers. We iterate all tools and prefer the TodoList
 * with the most items (more items = more tasks created = more recent snapshot).
 * For equal counts, the last one found wins (later in array = more likely
 * from a recently-active scheduler within a single scheduler's chronological
 * ordering).
 */
function extractTodoList(entry: HistoryItemWithoutId): TodoList | null {
  if (entry.type !== 'tool_group') return null;
  const toolGroup: HistoryItemToolGroup = entry;
  let best: TodoList | null = null;
  for (const tool of toolGroup.tools) {
    if (isTodoList(tool.resultDisplay)) {
      if (
        best === null ||
        tool.resultDisplay.todos.length >= best.todos.length
      ) {
        best = tool.resultDisplay;
      }
    }
  }
  return best;
}

const TodoTitleDisplay: React.FC<{ todos: TodoList }> = ({ todos }) => {
  const score = useMemo(() => {
    let total = 0;
    let completed = 0;
    for (const todo of todos.todos) {
      if (todo.status !== 'cancelled') {
        total += 1;
        if (todo.status === 'completed') {
          completed += 1;
        }
      }
    }
    return `${completed}/${total} completed`;
  }, [todos]);

  return (
    <Box flexDirection="row" columnGap={2} height={1}>
      <Text color={theme.text.primary} bold aria-label="Todo list">
        Todo
      </Text>
      <Text color={theme.text.secondary}>{score} (ctrl+t to toggle)</Text>
    </Box>
  );
};

const TodoStatusDisplay: React.FC<{ status: TodoStatus }> = ({ status }) => {
  switch (status) {
    case 'completed':
      return (
        <Text color={theme.status.success} aria-label="Completed">
          ✔
        </Text>
      );
    case 'in_progress':
      return (
        <Text color={theme.text.accent} aria-label="In Progress">
          ◼
        </Text>
      );
    case 'pending':
      return (
        <Text color={theme.text.secondary} aria-label="Pending">
          ◻
        </Text>
      );
    case 'cancelled':
    default:
      return (
        <Text color={theme.status.error} aria-label="Cancelled">
          ✗
        </Text>
      );
  }
};

const TodoItemDisplay: React.FC<{
  todo: Todo;
  wrap?: 'truncate';
  role?: 'listitem';
}> = ({ todo, wrap, role: ariaRole }) => {
  const textColor = (() => {
    switch (todo.status) {
      case 'in_progress':
        return theme.text.accent;
      case 'completed':
      case 'cancelled':
        return theme.text.secondary;
      default:
        return theme.text.primary;
    }
  })();
  const strikethrough =
    todo.status === 'completed' || todo.status === 'cancelled';

  return (
    <Box flexDirection="row" columnGap={1} aria-role={ariaRole}>
      <TodoStatusDisplay status={todo.status} />
      <Box flexShrink={1}>
        <Text color={textColor} wrap={wrap} strikethrough={strikethrough}>
          {todo.description}
        </Text>
      </Box>
    </Box>
  );
};

export const TodoTray: React.FC = () => {
  const uiState = useUIState();
  const streamingState = useStreamingContext();
  const isStreaming = streamingState !== StreamingState.Idle;

  // Stable streaming flag: prevents connector view from flashing during brief
  // Idle gaps between multi-turn agent execution. Uses useRef instead of
  // useState to avoid render-during-render setState amplification — the ref
  // is set and read synchronously within the same render cycle, and parent
  // context changes (StreamingContext, UIState) already trigger re-renders.
  const stableStreamingRef = useRef(false);

  // Last known TodoList cache: prevents flash when todos is briefly null during
  // state transitions (e.g., pendingHistoryItems cleared before history updates).
  const lastKnownTodosRef = useRef<TodoList | null>(null);

  const todos: TodoList | null = useMemo(() => {
    // Search LIVE pending items first (real-time update during tool execution)
    for (let i = uiState.pendingHistoryItems.length - 1; i >= 0; i--) {
      const result = extractTodoList(uiState.pendingHistoryItems[i]);
      if (result) return result;
    }

    // Fallback: search finalized history
    for (let i = uiState.history.length - 1; i >= 0; i--) {
      const result = extractTodoList(uiState.history[i]);
      if (result) return result;
    }

    return null;
  }, [uiState.pendingHistoryItems, uiState.history]);

  // Update cache when a valid TodoList is found
  if (todos !== null) {
    lastKnownTodosRef.current = todos;
  }

  // Ghost Todo cleanup: when the real source is empty AND streaming has stopped,
  // clear the cache to prevent stale (ghost) todos from persisting. Without this,
  // displayTodos would use the cached lastKnownTodos → hasActiveTodos=true →
  // stableStreamingRef stays true → circular ghost state.
  if (todos === null && !isStreaming) {
    stableStreamingRef.current = false;
    lastKnownTodosRef.current = null;
  }

  // Use displayTodos: fallback to cache during stable streaming to prevent flash
  const displayTodos =
    todos ?? (stableStreamingRef.current ? lastKnownTodosRef.current : null);

  const inProgress: Todo | null = useMemo(() => {
    if (displayTodos === null) {
      return null;
    }
    return (
      displayTodos.todos.find((todo) => todo.status === 'in_progress') || null
    );
  }, [displayTodos]);

  const hasActiveTodos = useMemo(() => {
    if (!displayTodos || !displayTodos.todos) return false;
    return displayTodos.todos.some(
      (todo) => todo.status === 'pending' || todo.status === 'in_progress',
    );
  }, [displayTodos]);

  // Update stable streaming ref synchronously during render (before return).
  if (isStreaming && hasActiveTodos) {
    stableStreamingRef.current = true;
  } else if (!isStreaming && !hasActiveTodos) {
    stableStreamingRef.current = false;
  }
  // When !isStreaming && hasActiveTodos: keep stableStreamingRef as-is (between-turn gap)

  if (
    displayTodos === null ||
    !displayTodos.todos ||
    displayTodos.todos.length === 0 ||
    (!uiState.showFullTodos && !hasActiveTodos)
  ) {
    return null;
  }

  // Streaming connector view: renders below LoadingIndicator with ⎿ prefix.
  // Uses stableStreamingRef to prevent flash during brief Idle gaps between turns.
  if (stableStreamingRef.current && hasActiveTodos) {
    return (
      <Box flexDirection="column" paddingLeft={1}>
        {displayTodos.todos.map((todo: Todo, index: number) => (
          <Box key={index} flexDirection="row">
            <Box width={5} flexShrink={0}>
              <Text color={theme.text.secondary}>
                {index === 0 ? '  ⎿  ' : '     '}
              </Text>
            </Box>
            <Box flexShrink={1}>
              <TodoItemDisplay todo={todo} role="listitem" />
            </Box>
          </Box>
        ))}
      </Box>
    );
  }

  return (
    <Box
      borderStyle="single"
      borderBottom={false}
      borderRight={false}
      borderLeft={false}
      borderColor={theme.border.default}
      paddingLeft={1}
      paddingRight={1}
    >
      {uiState.showFullTodos ? (
        <Box flexDirection="column" rowGap={1}>
          <TodoTitleDisplay todos={displayTodos} />
          <TodoListDisplay todos={displayTodos} />
        </Box>
      ) : (
        <Box flexDirection="row" columnGap={1} height={1}>
          <Box flexShrink={0} flexGrow={0}>
            <TodoTitleDisplay todos={displayTodos} />
          </Box>
          {inProgress && (
            <Box flexShrink={1} flexGrow={1}>
              <TodoItemDisplay todo={inProgress} wrap="truncate" />
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

interface TodoListDisplayProps {
  todos: TodoList;
}

const TodoListDisplay: React.FC<TodoListDisplayProps> = ({ todos }) => (
  <Box flexDirection="column" aria-role="list">
    {todos.todos.map((todo: Todo, index: number) => (
      <TodoItemDisplay todo={todo} key={index} role="listitem" />
    ))}
  </Box>
);
