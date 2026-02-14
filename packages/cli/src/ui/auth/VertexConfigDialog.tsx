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

/** Vertex AI configuration matching settingsSchema.vertexConfig */
export interface VertexConfig {
  project: string;
  location: string;
}

interface VertexConfigDialogProps {
  onComplete: (config: VertexConfig) => void;
  onCancel: () => void;
  defaultConfig?: Partial<VertexConfig>;
}

type Step = 'project' | 'location';

const STEPS: Step[] = ['project', 'location'];

const DEFAULT_LOCATION = 'us-central1';

export function VertexConfigDialog({
  onComplete,
  onCancel,
  defaultConfig,
}: VertexConfigDialogProps): React.JSX.Element {
  const { terminalWidth } = useUIState();
  const viewportWidth = terminalWidth - 8;

  const [currentStep, setCurrentStep] = useState<Step>('project');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Accumulated config across steps
  const [project, setProject] = useState(defaultConfig?.project ?? '');

  const stepIndex = STEPS.indexOf(currentStep);
  const stepLabel = `Step ${stepIndex + 1} of ${STEPS.length}`;

  // Text buffer for current input field
  const getInitialText = useCallback(() => {
    switch (currentStep) {
      case 'project':
        return project;
      case 'location':
        return defaultConfig?.location ?? DEFAULT_LOCATION;
      default:
        return '';
    }
  }, [currentStep, project, defaultConfig?.location]);

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

  const handleProjectSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setValidationError('Project ID is required.');
        return;
      }
      setValidationError(null);
      setProject(trimmed);
      setCurrentStep('location');
      buffer.setText(defaultConfig?.location ?? DEFAULT_LOCATION);
    },
    [buffer, defaultConfig?.location],
  );

  const handleLocationSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setValidationError('Location is required.');
        return;
      }
      setValidationError(null);
      onComplete({
        project,
        location: trimmed,
      });
    },
    [project, onComplete],
  );

  const handleSubmit = useCallback(
    (value: string) => {
      switch (currentStep) {
        case 'project':
          handleProjectSubmit(value);
          break;
        case 'location':
          handleLocationSubmit(value);
          break;
        default:
          break;
      }
    },
    [currentStep, handleProjectSubmit, handleLocationSubmit],
  );

  const handleCancel = useCallback(() => {
    if (currentStep === 'project') {
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
          Vertex AI Configuration
        </Text>
        <Text color={theme.text.secondary}>{stepLabel}</Text>
      </Box>

      {currentStep === 'project' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            Google Cloud Project ID
          </Text>
          <Text color={theme.text.secondary}>
            Enter the Google Cloud project ID to use with Vertex AI.
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

      {currentStep === 'location' && (
        <Box marginTop={1} flexDirection="column">
          <Text bold color={theme.text.primary}>
            Google Cloud Location
          </Text>
          <Text color={theme.text.secondary}>
            Enter the Google Cloud region (e.g., us-central1, europe-west1).
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
              Press Enter to save, Esc to go back
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
