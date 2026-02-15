/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { TextInput } from './shared/TextInput.js';
import { useTextBuffer } from './shared/text-buffer.js';
import { theme } from '../semantic-colors.js';

interface FreeformModelInputProps {
  onSelect: (model: string) => void;
  onClose: () => void;
  currentModel?: string;
}

export function FreeformModelInput({
  onSelect,
  onClose,
  currentModel,
}: FreeformModelInputProps): React.JSX.Element {
  const buffer = useTextBuffer({
    initialText: '',
    singleLine: true,
    viewport: { width: 60, height: 1 },
    isValidPath: () => false,
  });

  return (
    <Box flexDirection="column">
      <Text bold>Enter model name</Text>
      {currentModel && (
        <Text color={theme.text.secondary}>Current model: {currentModel}</Text>
      )}
      <Box marginTop={1}>
        <TextInput
          buffer={buffer}
          placeholder="model-name"
          onSubmit={(text: string) => {
            const trimmed = text.trim();
            if (trimmed) onSelect(trimmed);
          }}
          onCancel={onClose}
        />
      </Box>
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Press Enter to confirm, Esc to cancel)
        </Text>
      </Box>
    </Box>
  );
}
