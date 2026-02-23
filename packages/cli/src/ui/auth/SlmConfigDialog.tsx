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

/**
 * Parse custom headers input — accepts JSON or key:value format.
 * Returns a JSON string, or null if the input cannot be parsed.
 *
 * Supported formats:
 *   - JSON: '{"X-Custom": "value"}'
 *   - key:value (one per line or comma-separated):
 *       'X-Custom: value'
 *       'X-Custom: value, X-Other: value2'
 *       'X-Custom: value\nX-Other: value2'
 */
export function parseCustomHeaders(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return '';

  // Try JSON first
  try {
    const parsed = JSON.parse(trimmed);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      !Array.isArray(parsed)
    ) {
      return trimmed;
    }
  } catch {
    // Not valid JSON — try key:value format below
  }

  // Try key: value format (newline or comma separated)
  // Split by newline first, then by comma for single-line input
  const entries = trimmed.includes('\n')
    ? trimmed.split('\n')
    : trimmed.split(',');

  const result: Record<string, string> = {};
  for (const entry of entries) {
    const cleaned = entry.trim();
    if (!cleaned) continue;
    // Match "key: value" or "key:value" — key is everything before first colon
    const colonIndex = cleaned.indexOf(':');
    if (colonIndex <= 0) return null; // No colon or colon at start
    const key = cleaned.slice(0, colonIndex).trim();
    const value = cleaned.slice(colonIndex + 1).trim();
    if (!key) return null;
    result[key] = value;
  }

  if (Object.keys(result).length === 0) return null;
  return JSON.stringify(result);
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

  // Focus management: which field is focused in multi-field steps (Tab to switch)
  // 'primary' = first field (API Key / Header Name), 'secondary' = second field (Model / Custom Headers)
  const [focusedField, setFocusedField] = useState<'primary' | 'secondary'>(
    'primary',
  );

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
      setFocusedField('primary');
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
      setFocusedField('primary');
      buffer.setText('');
    },
    [buffer, modelBuffer.text],
  );

  const handleAdvancedSubmit = useCallback(
    (value: string) => {
      setApiKeyHeaderName(value);
      const rawHeaders = headersBuffer.text;

      // Parse custom headers — accepts JSON or key:value format
      const parsedHeaders = parseCustomHeaders(rawHeaders);
      if (parsedHeaders === null) {
        setValidationError(
          'Custom headers format invalid. Use JSON ({"key": "value"}) or key: value format.',
        );
        return;
      }
      setCustomHeaders(parsedHeaders);

      setValidationError(null);
      const config: SlmConfig = {
        baseUrl,
        ...(value.trim() && { apiKeyHeaderName: value.trim() }),
        ...(parsedHeaders && { customHeaders: parsedHeaders }),
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
      // Tab switches focus between primary/secondary fields in multi-field steps
      if (
        key.name === 'tab' &&
        (currentStep === 'credentials' || currentStep === 'advanced')
      ) {
        setFocusedField((prev) =>
          prev === 'primary' ? 'secondary' : 'primary',
        );
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
              borderColor={
                focusedField === 'primary'
                  ? theme.border.focused
                  : theme.border.default
              }
              paddingX={1}
              flexGrow={1}
            >
              <TextInput
                buffer={buffer}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                placeholder="(optional) API key"
                focus={focusedField === 'primary'}
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
                borderColor={
                  focusedField === 'secondary'
                    ? theme.border.focused
                    : theme.border.default
                }
                paddingX={1}
                flexGrow={1}
              >
                <TextInput
                  buffer={modelBuffer}
                  onSubmit={() => handleSubmit(buffer.text)}
                  onCancel={handleCancel}
                  placeholder="(optional) e.g., llama3, mistral"
                  focus={focusedField === 'secondary'}
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
              borderColor={
                focusedField === 'primary'
                  ? theme.border.focused
                  : theme.border.default
              }
              paddingX={1}
              flexGrow={1}
            >
              <TextInput
                buffer={buffer}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                placeholder="(optional) e.g., X-API-Key"
                focus={focusedField === 'primary'}
              />
            </Box>
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text bold color={theme.text.primary}>
              Custom Headers (optional)
            </Text>
            <Text color={theme.text.secondary}>
              Additional HTTP headers as JSON or key: value format.
            </Text>
            <Box marginTop={1} flexDirection="row">
              <Box
                borderStyle="round"
                borderColor={
                  focusedField === 'secondary'
                    ? theme.border.focused
                    : theme.border.default
                }
                paddingX={1}
                flexGrow={1}
              >
                <TextInput
                  buffer={headersBuffer}
                  onSubmit={() => handleSubmit(buffer.text)}
                  onCancel={handleCancel}
                  placeholder="(optional) X-Custom: value"
                  focus={focusedField === 'secondary'}
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
          , Esc to {currentStep === 'endpoint' ? 'cancel' : 'go back'}
          {currentStep !== 'endpoint' ? ', Tab to switch fields' : ''})
        </Text>
      </Box>
    </Box>
  );
}
