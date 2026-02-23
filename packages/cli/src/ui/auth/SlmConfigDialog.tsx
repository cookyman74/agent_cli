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

type Step = 'endpoint' | 'serverType' | 'credentials' | 'advanced';

const STEPS: Step[] = ['endpoint', 'serverType', 'credentials', 'advanced'];

/** Supported server types with their model name hints */
export type ServerType = 'gpustack' | 'vllm' | 'ollama' | 'lmstudio' | 'other';

interface ServerTypeInfo {
  label: string;
  description: string;
  modelHint: string;
  modelExample: string;
}

export const SERVER_TYPES: Record<ServerType, ServerTypeInfo> = {
  gpustack: {
    label: 'GPUStack',
    description: 'GPU cluster management with vLLM backend',
    modelHint: 'Use the deployment name from GPUStack dashboard',
    modelExample: 'gpt-oss-20b, llama3.1-70b',
  },
  vllm: {
    label: 'vLLM',
    description: 'High-throughput LLM serving engine',
    modelHint: 'Use HuggingFace model ID or --served-model-name',
    modelExample: 'meta-llama/Llama-3-70B-Instruct',
  },
  ollama: {
    label: 'Ollama',
    description: 'Local model runner for macOS/Linux/Windows',
    modelHint: 'Use model tag from "ollama list"',
    modelExample: 'llama3, mistral, qwen2:7b, codellama:13b',
  },
  lmstudio: {
    label: 'LM Studio',
    description: 'Desktop app for running local LLMs',
    modelHint: 'Use model name shown in LM Studio',
    modelExample: 'TheBloke/Llama-2-7B-GGUF',
  },
  other: {
    label: 'Other',
    description: 'Custom OpenAI-compatible server',
    modelHint: 'Check your server documentation for model name format',
    modelExample: 'model-name',
  },
};

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
      // Validate all keys are non-empty strings and values are strings
      // HTTP headers require non-empty header names
      for (const [key, value] of Object.entries(parsed)) {
        if (
          typeof key !== 'string' ||
          key.trim() === '' ||
          typeof value !== 'string'
        ) {
          return null; // Invalid: empty/non-string key or non-string value
        }
      }
      return trimmed;
    }
  } catch {
    // Not valid JSON — try key:value format below
  }

  // Try key: value format (newline or comma separated)
  // Split by newline first for multi-line input
  // For single-line: use regex to split on commas that are followed by a header key (key:)
  // This preserves commas within header values (e.g., Accept: text/html,application/json)
  const entries = trimmed.includes('\n')
    ? trimmed.split('\n')
    : trimmed.split(/,(?=\s*[^,:]+:)/);

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
  const [serverType, setServerType] = useState<ServerType>('other');
  const [apiKey, setApiKey] = useState(defaultConfig?.apiKey ?? '');
  const [model, setModel] = useState(defaultConfig?.model ?? '');
  const [apiKeyHeaderName, setApiKeyHeaderName] = useState(
    defaultConfig?.apiKeyHeaderName ?? '',
  );
  const [customHeaders, setCustomHeaders] = useState(
    defaultConfig?.customHeaders ?? '',
  );

  // Get current server type info for hints
  const serverInfo = SERVER_TYPES[serverType];

  const stepIndex = STEPS.indexOf(currentStep);
  const stepLabel = `Step ${stepIndex + 1} of ${STEPS.length}`;

  // Text buffer for current input field
  const getInitialText = useCallback(() => {
    switch (currentStep) {
      case 'endpoint':
        return baseUrl;
      case 'serverType':
        return ''; // No text input for server type selection
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

  const handleEndpointSubmit = useCallback((value: string) => {
    if (!isValidUrl(value)) {
      setValidationError(
        'URL must start with http:// or https:// (e.g., http://localhost:11434/v1)',
      );
      return;
    }
    setValidationError(null);
    setBaseUrl(value);
    setCurrentStep('serverType');
  }, []);

  const handleServerTypeSelect = useCallback(
    (type: ServerType) => {
      setServerType(type);
      setValidationError(null);
      setCurrentStep('credentials');
      setFocusedField('primary');
      // Reset buffer for credentials step
      buffer.setText(apiKey || '');
    },
    [buffer, apiKey],
  );

  const handleCredentialsSubmit = useCallback(
    (value: string) => {
      // Model name is required for OpenAI-compatible servers
      const modelValue = modelBuffer.text.trim();
      if (!modelValue) {
        setValidationError(
          'Model name is required. Examples: gpt-oss-20b, llama3, mistral, qwen2.5-coder',
        );
        setFocusedField('secondary');
        return;
      }
      setApiKey(value);
      setModel(modelValue);
      setValidationError(null);
      setCurrentStep('advanced');
      setFocusedField('primary');
      // Reset buffer to apiKeyHeaderName's initial value (or empty) for the advanced step
      // This prevents the API key value from leaking into apiKeyHeaderName
      buffer.setText(apiKeyHeaderName || '');
    },
    [buffer, modelBuffer.text, apiKeyHeaderName],
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
        case 'serverType':
          // Server type is selected via number keys, not Enter
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
      // Go back to previous step with buffer synchronization
      const prevIndex = stepIndex - 1;
      if (prevIndex >= 0) {
        const prevStep = STEPS[prevIndex];
        setCurrentStep(prevStep);
        setValidationError(null);
        setFocusedField('primary');

        // Synchronize buffers with stored state values to prevent pollution
        switch (prevStep) {
          case 'endpoint':
            buffer.setText(baseUrl);
            break;
          case 'serverType':
            // No text buffer for serverType step
            break;
          case 'credentials':
            buffer.setText(apiKey);
            modelBuffer.setText(model);
            break;
          case 'advanced':
            buffer.setText(apiKeyHeaderName);
            headersBuffer.setText(customHeaders);
            break;
          default:
            // No action needed for other steps
            break;
        }
      }
    }
  }, [
    currentStep,
    stepIndex,
    onCancel,
    buffer,
    modelBuffer,
    headersBuffer,
    baseUrl,
    apiKey,
    model,
    apiKeyHeaderName,
    customHeaders,
  ]);

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
      // Number keys 1-5 for server type selection
      if (currentStep === 'serverType') {
        const serverTypeKeys: Record<string, ServerType> = {
          '1': 'gpustack',
          '2': 'vllm',
          '3': 'ollama',
          '4': 'lmstudio',
          '5': 'other',
        };
        const selectedType = serverTypeKeys[key.sequence];
        if (selectedType) {
          handleServerTypeSelect(selectedType);
        }
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

      {currentStep === 'serverType' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            Server Type
          </Text>
          <Text color={theme.text.secondary}>
            Select your OpenAI-compatible server type for model name hints.
          </Text>
          <Box marginTop={1} flexDirection="column">
            {(
              Object.entries(SERVER_TYPES) as Array<[ServerType, ServerTypeInfo]>
            ).map(([type, info], index) => (
              <Box key={type} flexDirection="row" gap={1}>
                <Text color={theme.text.accent}>[{index + 1}]</Text>
                <Text color={theme.text.primary}>{info.label}</Text>
                <Text color={theme.text.secondary}>- {info.description}</Text>
              </Box>
            ))}
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
              Model Name (required) - {serverInfo.label}
            </Text>
            <Text color={theme.text.secondary}>{serverInfo.modelHint}</Text>
            <Text color={theme.text.secondary} dimColor>
              Examples: {serverInfo.modelExample}
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
                  placeholder={`e.g., ${serverInfo.modelExample.split(',')[0]}`}
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
          {currentStep === 'serverType'
            ? '(Press 1-5 to select, Esc to go back)'
            : `(Press Enter to ${currentStep === 'advanced' ? 'complete' : 'continue'}, Esc to ${currentStep === 'endpoint' ? 'cancel' : 'go back'}${currentStep === 'credentials' || currentStep === 'advanced' ? ', Tab to switch fields' : ''})`}
        </Text>
      </Box>
    </Box>
  );
}
