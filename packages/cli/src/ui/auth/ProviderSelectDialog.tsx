/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import {
  PROVIDER_SELECT_ITEMS,
  PROVIDER_DISPLAY_MAP,
} from './providerMetadata.js';

interface ProviderSelectDialogProps {
  onSelect: (providerKey: string) => void;
  currentProvider?: string;
  onCancel?: () => void;
  error?: string | null;
  onError?: (error: string | null) => void;
}

const items = PROVIDER_SELECT_ITEMS.map((key) => {
  const info = PROVIDER_DISPLAY_MAP[key];
  return {
    label: `${info.label} (${info.description})`,
    value: key,
    key,
  };
});

export function ProviderSelectDialog({
  onSelect,
  currentProvider,
  onCancel,
  error,
  onError,
}: ProviderSelectDialogProps): React.JSX.Element {
  // Map stored provider keys to UI selection keys
  // 'openai-compatible' is stored internally but shown as 'slm' in the UI
  const mappedProvider =
    currentProvider === 'openai-compatible' ? 'slm' : currentProvider;
  const initialIndex = mappedProvider
    ? items.findIndex((item) => item.value === mappedProvider)
    : 0;

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (currentProvider && onCancel) {
          onCancel();
        } else {
          onError?.(
            'You must select a provider to proceed. Press Ctrl+C twice to exit.',
          );
        }
      }
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.focused}
      flexDirection="row"
      padding={1}
      width="100%"
      alignItems="flex-start"
    >
      <Text color={theme.text.accent}>? </Text>
      <Box flexDirection="column" flexGrow={1}>
        <Text bold color={theme.text.primary}>
          Select LLM Provider
        </Text>
        <Box marginTop={1}>
          <Text color={theme.text.primary}>
            Which AI provider would you like to use?
          </Text>
        </Box>
        <Box marginTop={1}>
          <RadioButtonSelect
            items={items}
            initialIndex={initialIndex >= 0 ? initialIndex : 0}
            onSelect={(providerKey) => {
              onError?.(null);
              onSelect(providerKey);
            }}
            onHighlight={() => {
              onError?.(null);
            }}
          />
        </Box>
        {error && (
          <Box marginTop={1}>
            <Text color={theme.status.error}>{error}</Text>
          </Box>
        )}
        <Box marginTop={1}>
          <Text color={theme.text.secondary}>(Use Enter to select)</Text>
        </Box>
      </Box>
    </Box>
  );
}
