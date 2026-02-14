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

/** sLM connection configuration matching settingsSchema.slmConfig */
export interface SlmConfig {
  baseUrl: string;
  model?: string;
  apiKey?: string;
  apiKeyHeaderName?: string;
  customHeaders?: string;
}

interface SlmConfigDialogProps {
  onComplete: (config: SlmConfig) => void;
  onCancel: () => void;
  defaultConfig?: Partial<SlmConfig>;
}

type Step = 'endpoint' | 'credentials' | 'advanced';

const STEPS: Step[] = ['endpoint', 'credentials', 'advanced'];

function isValidUrl(url: string): boolean {
  return /^https?:\/\/.+/.test(url.trim());
}

export function SlmConfigDialog({
  onComplete,
  onCancel,
  defaultConfig,
}: SlmConfigDialogProps): React.JSX.Element {
  const { terminalWidth } = useUIState();
  const viewportWidth = terminalWidth - 8;

  const [currentStep, setCurrentStep] = useState<Step>('endpoint');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Accumulated config across steps
  const [baseUrl, setBaseUrl] = useState(defaultConfig?.baseUrl ?? '');
  const [apiKey, setApiKey] = useState(defaultConfig?.apiKey ?? '');
  const [model, setModel] = useState(defaultConfig?.model ?? '');
  const [apiKeyHeaderName, setApiKeyHeaderName] = useState(
    defaultConfig?.apiKeyHeaderName ?? '',
  );
  const [customHeaders, setCustomHeaders] = useState(
    defaultConfig?.customHeaders ?? '',
  );

  const stepIndex = STEPS.indexOf(currentStep);
  const stepLabel = `Step ${stepIndex + 1} of ${STEPS.length}`;

  // Text buffer for current input field
  const getInitialText = useCallback(() => {
    switch (currentStep) {
      case 'endpoint':
        return baseUrl;
      case 'credentials':
        return apiKey;
      case 'advanced':
        return apiKeyHeaderName;
      default:
        return '';
    }
  }, [currentStep, baseUrl, apiKey, apiKeyHeaderName]);

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

  // Secondary buffer for model input (step 2 has two fields)
  const modelBuffer = useTextBuffer({
    initialText: model,
    initialCursorOffset: model.length,
    viewport: {
      width: viewportWidth,
      height: 4,
    },
    isValidPath: () => false,
    singleLine: true,
  });

  // Secondary buffer for custom headers (step 3 has two fields)
  const headersBuffer = useTextBuffer({
    initialText: customHeaders,
    initialCursorOffset: customHeaders.length,
    viewport: {
      width: viewportWidth,
      height: 4,
    },
    isValidPath: () => false,
    singleLine: true,
  });

  const handleEndpointSubmit = useCallback(
    (value: string) => {
      if (!isValidUrl(value)) {
        setValidationError(
          'URL must start with http:// or https:// (e.g., http://localhost:11434/v1)',
        );
        return;
      }
      setValidationError(null);
      setBaseUrl(value);
      setCurrentStep('credentials');
      buffer.setText('');
    },
    [buffer],
  );

  const handleCredentialsSubmit = useCallback(
    (value: string) => {
      setApiKey(value);
      setModel(modelBuffer.text);
      setValidationError(null);
      setCurrentStep('advanced');
      buffer.setText('');
    },
    [buffer, modelBuffer.text],
  );

  const handleAdvancedSubmit = useCallback(
    (value: string) => {
      setApiKeyHeaderName(value);
      const headers = headersBuffer.text;
      setCustomHeaders(headers);

      // Validate custom headers JSON if provided
      if (headers.trim()) {
        try {
          JSON.parse(headers);
        } catch {
          setValidationError(
            'Custom headers must be valid JSON (e.g., {"X-Custom": "value"})',
          );
          return;
        }
      }

      setValidationError(null);
      const config: SlmConfig = {
        baseUrl,
        ...(value.trim() && { apiKeyHeaderName: value.trim() }),
        ...(headers.trim() && { customHeaders: headers.trim() }),
        ...(apiKey.trim() && { apiKey: apiKey.trim() }),
        ...(model.trim() && { model: model.trim() }),
      };
      onComplete(config);
    },
    [headersBuffer.text, baseUrl, apiKey, model, onComplete],
  );

  const handleSubmit = useCallback(
    (value: string) => {
      switch (currentStep) {
        case 'endpoint':
          handleEndpointSubmit(value);
          break;
        case 'credentials':
          handleCredentialsSubmit(value);
          break;
        case 'advanced':
          handleAdvancedSubmit(value);
          break;
        default:
          break;
      }
    },
    [
      currentStep,
      handleEndpointSubmit,
      handleCredentialsSubmit,
      handleAdvancedSubmit,
    ],
  );

  const handleCancel = useCallback(() => {
    if (currentStep === 'endpoint') {
      onCancel();
    } else {
      // Go back to previous step
      const prevIndex = stepIndex - 1;
      if (prevIndex >= 0) {
        setCurrentStep(STEPS[prevIndex]);
        setValidationError(null);
      }
    }
  }, [currentStep, stepIndex, onCancel]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        handleCancel();
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
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold color={theme.text.primary}>
          sLM Configuration
        </Text>
        <Text color={theme.text.secondary}>{stepLabel}</Text>
      </Box>

      {currentStep === 'endpoint' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            API Endpoint URL
          </Text>
          <Text color={theme.text.secondary}>
            Enter the base URL for your OpenAI-compatible API endpoint.
          </Text>
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
                onCancel={handleCancel}
                placeholder="http://localhost:11434/v1"
              />
            </Box>
          </Box>
        </Box>
      )}

      {currentStep === 'credentials' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            API Key (optional)
          </Text>
          <Text color={theme.text.secondary}>
            Enter an API key if your endpoint requires authentication. Leave
            empty to skip.
          </Text>
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
                onCancel={handleCancel}
                placeholder="(optional) API key"
              />
            </Box>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text bold color={theme.text.primary}>
              Model Name (optional)
            </Text>
            <Text color={theme.text.secondary}>
              Specify the model name. Leave empty for provider default.
            </Text>
            <Box marginTop={1} flexDirection="row">
              <Box
                borderStyle="round"
                borderColor={theme.border.default}
                paddingX={1}
                flexGrow={1}
              >
                <TextInput
                  buffer={modelBuffer}
                  onSubmit={() => handleSubmit(buffer.text)}
                  onCancel={handleCancel}
                  placeholder="(optional) e.g., llama3, mistral"
                />
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {currentStep === 'advanced' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            API Key Header Name (optional)
          </Text>
          <Text color={theme.text.secondary}>
            Custom HTTP header name for the API key (default: Authorization).
          </Text>
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
                onCancel={handleCancel}
                placeholder="(optional) e.g., X-API-Key"
              />
            </Box>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text bold color={theme.text.primary}>
              Custom Headers (optional)
            </Text>
            <Text color={theme.text.secondary}>
              Additional HTTP headers as JSON (e.g., {`{"X-Custom": "value"}`}).
            </Text>
            <Box marginTop={1} flexDirection="row">
              <Box
                borderStyle="round"
                borderColor={theme.border.default}
                paddingX={1}
                flexGrow={1}
              >
                <TextInput
                  buffer={headersBuffer}
                  onSubmit={() => handleSubmit(buffer.text)}
                  onCancel={handleCancel}
                  placeholder='(optional) {"key": "value"}'
                />
              </Box>
            </Box>
          </Box>
        </Box>
      )}

      {validationError && (
        <Box marginTop={1}>
          <Text color={theme.status.error}>{validationError}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={theme.text.secondary}>
          (Press Enter to {currentStep === 'advanced' ? 'complete' : 'continue'}
          , Esc to {currentStep === 'endpoint' ? 'cancel' : 'go back'})
        </Text>
      </Box>
    </Box>
  );
}
