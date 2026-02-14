/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../semantic-colors.js';
import { useKeypress } from '../hooks/useKeypress.js';

interface DidimStudioComingSoonDialogProps {
  onBack: () => void;
}

export function DidimStudioComingSoonDialog({
  onBack,
}: DidimStudioComingSoonDialogProps): React.JSX.Element {
  useKeypress(
    (key) => {
      if (key.name === 'escape' || key.name === 'return') {
        onBack();
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
      <Box flexDirection="column" alignItems="center" gap={1}>
        <Text bold color={theme.text.accent}>
          DidimAIStudio
        </Text>

        <Box marginTop={1} flexDirection="column" alignItems="center">
          <Text bold color={theme.text.primary}>
            Coming Soon
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column" paddingX={2}>
          <Text color={theme.text.primary}>
            DidimAIStudio Scenario integration is currently under development.
          </Text>
          <Text color={theme.text.primary}> </Text>
          <Text color={theme.text.secondary}>
            Design complex AI workflows visually with drag & drop — connect
            local LLMs, agents, and tools into automated pipelines, all running
            on-premises without cloud dependency.
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column" paddingX={2}>
          <Text color={theme.text.secondary}>Key features planned:</Text>
          <Text color={theme.text.secondary}>
            {' '}
            Scenario-based AI workflow automation
          </Text>
          <Text color={theme.text.secondary}>
            {' '}
            MCP tools & external service integration
          </Text>
          <Text color={theme.text.secondary}> RAG-powered chatbot service</Text>
          <Text color={theme.text.secondary}>
            {' '}
            Integrated dashboard & monitoring
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            Learn more:{' '}
            <Text color={theme.text.accent} underline>
              https://aistudio.didim365.com
            </Text>
          </Text>
        </Box>

        <Box marginTop={1}>
          <Text color={theme.text.secondary}>
            (Press Enter or Esc to go back)
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
