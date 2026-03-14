/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback } from 'react';
import type { Key } from '../../hooks/useKeypress.js';
import { Text, Box } from 'ink';
import { useKeypress } from '../../hooks/useKeypress.js';
import chalk from 'chalk';
import { theme } from '../../semantic-colors.js';
import {
  type TextBuffer,
  PASTED_TEXT_PLACEHOLDER_REGEX,
} from './text-buffer.js';
import { cpSlice } from '../../utils/textUtils.js';

export interface TextInputProps {
  buffer: TextBuffer;
  placeholder?: string;
  onSubmit?: (value: string) => void;
  onCancel?: () => void;
  focus?: boolean;
  /** When set, replaces each character with this mask character (e.g., '*') */
  mask?: string;
}

export function TextInput({
  buffer,
  placeholder = '',
  onSubmit,
  onCancel,
  focus = true,
  mask,
}: TextInputProps): React.JSX.Element {
  const {
    text,
    handleInput,
    visualCursor,
    viewportVisualLines,
    visualScrollRow,
  } = buffer;
  const [cursorVisualRowAbsolute, cursorVisualColAbsolute] = visualCursor;

  const handleKeyPress = useCallback(
    (key: Key) => {
      if (key.name === 'escape') {
        onCancel?.();
        return;
      }

      if (key.name === 'return') {
        // Expand paste placeholders (e.g. "[Pasted Text: 2400 chars]")
        // back to actual content before submitting, matching InputPrompt behavior.
        let value = text;
        if (buffer.pastedContent) {
          value = value.replace(
            PASTED_TEXT_PLACEHOLDER_REGEX,
            (match) => buffer.pastedContent[match] || match,
          );
        }
        onSubmit?.(value);
        return;
      }

      handleInput(key);
    },
    [buffer, handleInput, onCancel, onSubmit, text],
  );

  useKeypress(handleKeyPress, { isActive: focus });

  const showPlaceholder = text.length === 0 && placeholder;

  if (showPlaceholder) {
    return (
      <Box>
        {focus ? (
          <Text>
            {chalk.inverse(placeholder[0] || ' ')}
            <Text color={theme.text.secondary}>{placeholder.slice(1)}</Text>
          </Text>
        ) : (
          <Text color={theme.text.secondary}>{placeholder}</Text>
        )}
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {viewportVisualLines.map((rawLineText, idx) => {
        const currentVisualRow = visualScrollRow + idx;
        const isCursorLine =
          focus && currentVisualRow === cursorVisualRowAbsolute;

        // Apply mask: replace each character with mask char for display
        const lineText = mask
          ? mask.repeat([...rawLineText].length)
          : rawLineText;

        const lineDisplay = isCursorLine
          ? cpSlice(lineText, 0, cursorVisualColAbsolute) +
            chalk.inverse(
              cpSlice(
                lineText,
                cursorVisualColAbsolute,
                cursorVisualColAbsolute + 1,
              ) || ' ',
            ) +
            cpSlice(lineText, cursorVisualColAbsolute + 1)
          : lineText;

        return (
          <Box key={idx} height={1}>
            <Text>{lineDisplay}</Text>
          </Box>
        );
      })}
    </Box>
  );
}
