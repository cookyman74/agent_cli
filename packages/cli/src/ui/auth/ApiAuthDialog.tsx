/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useRef, useEffect } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { TextInput } from '../components/shared/TextInput.js';
import { useTextBuffer } from '../components/shared/text-buffer.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { clearProviderApiKey, debugLogger } from '@didim365/agent-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { keyMatchers, Command } from '../keyMatchers.js';
import { getProviderDisplayInfo } from './providerMetadata.js';

interface ApiAuthDialogProps {
  onSubmit: (apiKey: string) => void;
  onCancel: () => void;
  error?: string | null;
  defaultValue?: string;
  /** Provider key for dynamic labels/URLs. Defaults to 'gemini' for backward compatibility. */
  provider?: string;
}

export function ApiAuthDialog({
  onSubmit,
  onCancel,
  error,
  defaultValue = '',
  provider,
}: ApiAuthDialogProps): React.JSX.Element {
  const providerInfo = getProviderDisplayInfo(provider);
  const { terminalWidth } = useUIState();
  const viewportWidth = terminalWidth - 8;

  const pendingPromise = useRef<{ cancel: () => void } | null>(null);

  useEffect(
    () => () => {
      pendingPromise.current?.cancel();
    },
    [],
  );

  const initialApiKey = defaultValue;

  const buffer = useTextBuffer({
    initialText: initialApiKey || '',
    initialCursorOffset: initialApiKey?.length || 0,
    viewport: {
      width: viewportWidth,
      height: 4,
    },
    isValidPath: () => false, // No path validation needed for API key
    inputFilter: (text) =>
      text.replace(/[^a-zA-Z0-9_-]/g, '').replace(/[\r\n]/g, ''),
    singleLine: true,
  });

  const handleSubmit = (value: string) => {
    onSubmit(value);
  };

  const handleClear = () => {
    pendingPromise.current?.cancel();

    let isCancelled = false;
    const wrappedPromise = new Promise<void>((resolve, reject) => {
      clearProviderApiKey(providerInfo.providerType).then(
        () => !isCancelled && resolve(),
        (error) => !isCancelled && reject(error),
      );
    });

    pendingPromise.current = {
      cancel: () => {
        isCancelled = true;
      },
    };

    return wrappedPromise
      .then(() => {
        buffer.setText('');
      })
      .catch((err) => {
        debugLogger.debug('Failed to clear API key:', err);
      });
  };

  useKeypress(
    async (key) => {
      if (keyMatchers[Command.CLEAR_INPUT](key)) {
        await handleClear();
      }
    },
    { isActive: true },
  );

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.focused}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold color={theme.text.primary}>
        Enter {providerInfo.label} API Key
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.primary}>
          Please enter your {providerInfo.label} API key. It will be securely
          stored in your system keychain.
        </Text>
        {providerInfo.apiKeyUrl && (
          <Text color={theme.text.secondary}>
            You can get an API key from{' '}
            <Text color={theme.text.link}>{providerInfo.apiKeyUrl}</Text>
          </Text>
        )}
      </Box>
      <Box marginTop={1} flexDirection="row">
        <Box
          borderStyle="round"
          borderColor={theme.border.default}
          paddingX={1}
          flexGrow={1}
        >
          <TextInput
            buffer={buffer}
            onSubmit={handleSubmit}
            onCancel={onCancel}
            placeholder="Paste your API key here"
          />
        </Box>
      </Box>
      {error && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{error}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Press Enter to submit, Esc to cancel, Ctrl+C to clear stored key)
        </Text>
      </Box>
    </Box>
  );
}
