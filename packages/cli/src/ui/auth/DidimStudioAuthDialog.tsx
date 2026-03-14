/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { TextInput } from '../components/shared/TextInput.js';
import { useTextBuffer } from '../components/shared/text-buffer.js';
import { useUIState } from '../contexts/UIStateContext.js';
import { useKeypress } from '../hooks/useKeypress.js';

/** DidimAIStudio configuration matching settingsSchema.didimConfig */
export interface DidimConfig {
  serverAddress: string;
  apiKey: string;
  streamMode: 'sse' | 'improved';
}

interface DidimStudioAuthDialogProps {
  onComplete: (config: DidimConfig) => void;
  onCancel: () => void;
  defaultConfig?: Partial<{ serverAddress: string; streamMode: string }>;
}

type Step = 'serverAddress' | 'apiKey' | 'streamMode';

const STEPS: Step[] = ['serverAddress', 'apiKey', 'streamMode'];

const DEFAULT_SERVER = 'aistudio.didim365.com';

export function DidimStudioAuthDialog({
  onComplete,
  onCancel,
  defaultConfig,
}: DidimStudioAuthDialogProps): React.JSX.Element {
  const { terminalWidth } = useUIState();
  const viewportWidth = terminalWidth - 8;

  const [currentStep, setCurrentStep] = useState<Step>('serverAddress');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Accumulated config across steps
  const [serverAddress, setServerAddress] = useState(
    defaultConfig?.serverAddress ?? DEFAULT_SERVER,
  );
  const [apiKey, setApiKey] = useState('');
  const [streamMode, setStreamMode] = useState<'sse' | 'improved'>(() => {
    const raw = defaultConfig?.streamMode;
    return raw === 'sse' || raw === 'improved' ? raw : 'sse';
  });

  const stepIndex = STEPS.indexOf(currentStep);
  const stepLabel = `Step ${stepIndex + 1} of ${STEPS.length}`;

  // Text buffer for current input field
  const getInitialText = useCallback(() => {
    switch (currentStep) {
      case 'serverAddress':
        return serverAddress;
      case 'apiKey':
        return apiKey;
      case 'streamMode':
        return '';
      default:
        return '';
    }
  }, [currentStep, serverAddress, apiKey]);

  const buffer = useTextBuffer({
    initialText: getInitialText(),
    initialCursorOffset: getInitialText().length,
    viewport: {
      width: viewportWidth,
      height: 4,
    },
    isValidPath: () => false,
    singleLine: true,
  });

  const handleServerAddressSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setValidationError('Server address is required.');
        return;
      }
      setValidationError(null);
      setServerAddress(trimmed);
      setCurrentStep('apiKey');
      buffer.setText(apiKey);
    },
    [buffer, apiKey],
  );

  const handleApiKeySubmit = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setValidationError('JWT token is required.');
      return;
    }
    setValidationError(null);
    setApiKey(trimmed);
    setCurrentStep('streamMode');
  }, []);

  const handleSubmit = useCallback(
    (value: string) => {
      switch (currentStep) {
        case 'serverAddress':
          handleServerAddressSubmit(value);
          break;
        case 'apiKey':
          handleApiKeySubmit(value);
          break;
        default:
          break;
      }
    },
    [currentStep, handleServerAddressSubmit, handleApiKeySubmit],
  );

  const handleStreamModeSelect = useCallback(
    (mode: 'sse' | 'improved') => {
      setStreamMode(mode);
      setValidationError(null);
      onComplete({
        serverAddress,
        apiKey,
        streamMode: mode,
      });
    },
    [serverAddress, apiKey, onComplete],
  );

  const handleCancel = useCallback(() => {
    if (currentStep === 'serverAddress') {
      onCancel();
    } else {
      const prevIndex = stepIndex - 1;
      if (prevIndex >= 0) {
        const prevStep = STEPS[prevIndex];
        setCurrentStep(prevStep);
        setValidationError(null);
        switch (prevStep) {
          case 'serverAddress':
            buffer.setText(serverAddress);
            break;
          case 'apiKey':
            buffer.setText(apiKey);
            break;
          default:
            break;
        }
      }
    }
  }, [currentStep, stepIndex, onCancel, buffer, serverAddress, apiKey]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        handleCancel();
      }
      // Number keys for stream mode selection
      if (currentStep === 'streamMode') {
        if (key.sequence === '1') {
          handleStreamModeSelect('sse');
        } else if (key.sequence === '2') {
          handleStreamModeSelect('improved');
        }
      }
    },
    { isActive: true },
  );

  // Mask JWT token display: show first 4 + last 4 chars with dots
  const maskedApiKey =
    apiKey.length > 8
      ? `${apiKey.slice(0, 4)}${'*'.repeat(Math.min(apiKey.length - 8, 20))}${apiKey.slice(-4)}`
      : apiKey.length > 0
        ? '*'.repeat(apiKey.length)
        : '';

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.focused}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={theme.text.primary}>
          DidimAIStudio Configuration
        </Text>
        <Text color={theme.text.secondary}>{stepLabel}</Text>
      </Box>

      {currentStep === 'serverAddress' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            Server Domain
          </Text>
          <Text color={theme.text.secondary}>
            Enter the DidimAIStudio server address.
          </Text>
          <Box marginTop={1} flexDirection="row">
            <Box
              borderStyle="round"
              borderColor={theme.border.default}
              width="100%"
            >
              <TextInput buffer={buffer} onSubmit={handleSubmit} focus={true} />
            </Box>
          </Box>
          {validationError && (
            <Text color={theme.status.error}>{validationError}</Text>
          )}
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>
              Press Enter to continue, Esc to go back
            </Text>
          </Box>
        </Box>
      )}

      {currentStep === 'apiKey' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            JWT Token
          </Text>
          <Text color={theme.text.secondary}>
            Enter the JWT authentication token for {serverAddress}.
          </Text>
          <Box marginTop={1} flexDirection="row">
            <Box
              borderStyle="round"
              borderColor={theme.border.default}
              width="100%"
            >
              <TextInput buffer={buffer} onSubmit={handleSubmit} focus={true} />
            </Box>
          </Box>
          {maskedApiKey && (
            <Text color={theme.text.secondary}>Token: {maskedApiKey}</Text>
          )}
          {validationError && (
            <Text color={theme.status.error}>{validationError}</Text>
          )}
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>
              Press Enter to continue, Esc to go back
            </Text>
          </Box>
        </Box>
      )}

      {currentStep === 'streamMode' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            Stream Mode
          </Text>
          <Text color={theme.text.secondary}>
            Select the SSE streaming mode for {serverAddress}.
          </Text>
          <Box marginTop={1} flexDirection="column" gap={0}>
            <Text
              color={
                streamMode === 'sse' ? theme.text.accent : theme.text.primary
              }
            >
              {' '}
              1. SSE (Standard)
            </Text>
            <Text
              color={
                streamMode === 'improved'
                  ? theme.text.accent
                  : theme.text.primary
              }
            >
              {' '}
              2. SSE Improved (Enhanced streaming)
            </Text>
          </Box>
          {validationError && (
            <Text color={theme.status.error}>{validationError}</Text>
          )}
          <Box marginTop={1}>
            <Text color={theme.text.secondary}>
              Press 1 or 2 to select, Esc to go back
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
