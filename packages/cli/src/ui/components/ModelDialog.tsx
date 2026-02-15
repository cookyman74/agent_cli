/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useCallback, useContext, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import {
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
  ModelSlashCommandEvent,
  logModelSlashCommand,
  PROVIDER_MODEL_REGISTRY,
} from '@didim365/agent-cli-core';
import { useKeypress } from '../hooks/useKeypress.js';
import { theme } from '../semantic-colors.js';
import { DescriptiveRadioButtonSelect } from './shared/DescriptiveRadioButtonSelect.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { ThemedGradient } from './ThemedGradient.js';
import { resolveActiveProvider } from '../utils/resolveActiveProvider.js';
import { SettingsContext } from '../contexts/SettingsContext.js';
import { SettingScope } from '../../config/settings.js';
import { FreeformModelInput } from './FreeformModelInput.js';

interface ModelDialogProps {
  onClose: () => void;
  selectedProvider?: string;
}

export function ModelDialog({
  onClose,
  selectedProvider,
}: ModelDialogProps): React.JSX.Element {
  const config = useContext(ConfigContext);
  const settings = useContext(SettingsContext);
  const [view, setView] = useState<'main' | 'manual'>('main');
  const [persistMode, setPersistMode] = useState(false);

  // Resolve active provider from multiple sources
  const provider = resolveActiveProvider(selectedProvider);
  const modelGroup = PROVIDER_MODEL_REGISTRY[provider];
  const isGemini = provider === 'gemini';

  // Determine the Preferred Model (read once when the dialog opens).
  const preferredModel = config?.getModel() || '';

  const shouldShowPreviewModels =
    isGemini &&
    config?.getPreviewFeatures() &&
    config.getHasAccessToPreviewModel();

  // Check if preferred model is in the manual model list
  const manualModelSelected = useMemo(() => {
    if (!modelGroup) return '';
    return modelGroup.models.some((m) => m.id === preferredModel)
      ? preferredModel
      : '';
  }, [modelGroup, preferredModel]);

  useKeypress(
    (key) => {
      if (key.name === 'escape') {
        if (view === 'manual') {
          setView('main');
        } else {
          onClose();
        }
      }
      if (key.name === 'tab') {
        setPersistMode((prev) => !prev);
      }
    },
    { isActive: !modelGroup?.freeformInput },
  );

  const mainOptions = useMemo(() => {
    if (!modelGroup) return [];

    let presets = [...modelGroup.presets];

    // Gemini-specific: filter preview preset when preview features are off
    if (isGemini && !shouldShowPreviewModels) {
      presets = presets.filter((p) => p.value !== PREVIEW_GEMINI_MODEL_AUTO);
    }

    const list = presets.map((p) => ({
      value: p.value,
      title: p.title,
      description: p.description,
      key: p.value,
    }));

    // Add "Manual" option if there are individual models to choose from
    if (modelGroup.models.length > 0) {
      list.push({
        value: 'Manual',
        title: manualModelSelected
          ? `Manual (${manualModelSelected})`
          : 'Manual',
        description: 'Manually select a model',
        key: 'Manual',
      });
    }

    return list;
  }, [modelGroup, shouldShowPreviewModels, manualModelSelected, isGemini]);

  const manualOptions = useMemo(() => {
    if (!modelGroup) return [];

    let models = [...modelGroup.models];

    // Gemini-specific: filter preview models when preview features are off
    if (isGemini && !shouldShowPreviewModels) {
      models = models.filter(
        (m) =>
          m.id !== PREVIEW_GEMINI_MODEL && m.id !== PREVIEW_GEMINI_FLASH_MODEL,
      );
    }

    return models.map((m) => ({
      value: m.id,
      title: m.displayName || m.id,
      description: m.description,
      key: m.id,
    }));
  }, [modelGroup, shouldShowPreviewModels, isGemini]);

  const options = view === 'main' ? mainOptions : manualOptions;

  // Calculate the initial index based on the preferred model.
  const initialIndex = useMemo(() => {
    const idx = options.findIndex((option) => option.value === preferredModel);
    if (idx !== -1) {
      return idx;
    }
    if (view === 'main') {
      const manualIdx = options.findIndex((o) => o.value === 'Manual');
      return manualIdx !== -1 ? manualIdx : 0;
    }
    return 0;
  }, [preferredModel, options, view]);

  // Handle selection internally (Autonomous Dialog).
  const handleSelect = useCallback(
    (model: string) => {
      if (model === 'Manual') {
        setView('manual');
        return;
      }

      // freeformInput providers (sLM) always persist — no toggle shown in UI
      const shouldPersist = persistMode || !!modelGroup?.freeformInput;

      if (config) {
        // isTemporary=false triggers onModelChange → saveModelForProvider
        config.setModel(model, !shouldPersist);
        const event = new ModelSlashCommandEvent(model);
        logModelSlashCommand(config, event);
      }

      // Sync LLM_MODEL env for non-Gemini providers
      if (!isGemini) {
        process.env['LLM_MODEL'] = model;
      }

      // Sync slmConfig.model for openai-compatible (sLM) provider
      // (onModelChange does NOT handle slmConfig, so this is the only write site)
      if (settings && shouldPersist && provider === 'openai-compatible') {
        const userSlmConfig =
          (
            settings.forScope(SettingScope.User).settings as {
              security?: {
                auth?: { slmConfig?: Record<string, unknown> };
              };
            }
          ).security?.auth?.slmConfig ?? {};
        settings.setValue(SettingScope.User, 'security.auth.slmConfig', {
          ...userSlmConfig,
          model,
        });
      }

      onClose();
    },
    [config, onClose, persistMode, isGemini, settings, provider, modelGroup],
  );

  // Freeform input (e.g., openai-compatible / sLM)
  if (modelGroup?.freeformInput) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <FreeformModelInput
          onSelect={handleSelect}
          onClose={onClose}
          currentModel={preferredModel}
        />
      </Box>
    );
  }

  // Model selection disabled (e.g., DidimAIStudio)
  if (modelGroup?.modelSelectionDisabled) {
    return (
      <Box
        borderStyle="round"
        borderColor={theme.border.default}
        flexDirection="column"
        padding={1}
        width="100%"
      >
        <Text bold>Select Model</Text>
        <Box marginTop={1}>
          <Text>{modelGroup.disabledMessage}</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text color={theme.text.secondary}>(Press Esc to close)</Text>
        </Box>
      </Box>
    );
  }

  // Header/subheader — Gemini-specific preview messaging
  let header;
  let subheader;
  if (isGemini) {
    if (shouldShowPreviewModels) {
      header = undefined;
      subheader = undefined;
    } else if (config?.getHasAccessToPreviewModel()) {
      header = 'Gemini 3 is now available.';
      subheader =
        'Enable "Preview features" in /settings.\nLearn more at https://goo.gle/enable-preview-features';
    } else {
      header = 'Gemini 3 is coming soon.';
      subheader = undefined;
    }
  }

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      padding={1}
      width="100%"
    >
      <Text bold>Select Model</Text>

      <Box flexDirection="column">
        {header && (
          <Box marginTop={1}>
            <ThemedGradient>
              <Text>{header}</Text>
            </ThemedGradient>
          </Box>
        )}
        {subheader && <Text>{subheader}</Text>}
      </Box>
      <Box marginTop={1}>
        <DescriptiveRadioButtonSelect
          items={options}
          onSelect={handleSelect}
          initialIndex={initialIndex}
          showNumbers={true}
        />
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text color={theme.text.primary}>
            Remember model for future sessions:{' '}
          </Text>
          <Text color={theme.status.success}>
            {persistMode ? 'true' : 'false'}
          </Text>
        </Box>
        <Text color={theme.text.secondary}>(Press Tab to toggle)</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>
          {isGemini
            ? '> To use a specific Gemini model on startup, use the --model flag.'
            : '> To use a specific model on startup, use the --model flag or set LLM_MODEL env.'}
        </Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text color={theme.text.secondary}>(Press Esc to close)</Text>
      </Box>
    </Box>
  );
}
