/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  IdeClient,
  IdeConnectionEvent,
  IdeConnectionType,
  logIdeConnection,
  type Config,
  StartSessionEvent,
  logCliConfiguration,
  startupProfiler,
} from '@didim365/agent-cli-core';
import type { LoadedSettings } from '../config/settings.js';
import { performInitialAuth } from './auth.js';
import { validateTheme } from './theme.js';

export interface InitializationResult {
  authError: string | null;
  themeError: string | null;
  shouldOpenAuthDialog: boolean;
  geminiMdFileCount: number;
}

/**
 * Orchestrates the application's startup initialization.
 * This runs BEFORE the React UI is rendered.
 * @param config The application config.
 * @param settings The loaded application settings.
 * @returns The results of the initialization.
 */
export async function initializeApp(
  config: Config,
  settings: LoadedSettings,
): Promise<InitializationResult> {
  const selectedProvider = settings.merged.security.auth.selectedProvider;

  // Only run startup auth for confirmed Gemini provider users.
  // Skip when: no selectedProvider (unmigrated/fresh user → ProviderSelectDialog),
  // or non-Gemini provider (Claude, OpenAI, sLM, Vertex AI → useAuth.ts handles).
  const shouldSkipStartupAuth =
    !selectedProvider || selectedProvider !== 'gemini';

  const authHandle = startupProfiler.start('authenticate');
  const authError = shouldSkipStartupAuth
    ? null
    : await performInitialAuth(
        config,
        settings.merged.security.auth.selectedType,
      );
  authHandle?.end();
  const themeError = validateTheme(settings);

  // Auth dialog needed when no auth type is configured.
  // Non-Gemini providers have selectedType=USE_GEMINI so this is correctly false.
  // The edge case of selectedProvider without selectedType is treated as incomplete
  // → dialog opens to let the user reconfigure properly.
  const shouldOpenAuthDialog =
    !settings.merged.security.auth.selectedType || !!authError;

  logCliConfiguration(
    config,
    new StartSessionEvent(config, config.getToolRegistry()),
  );

  if (config.getIdeMode()) {
    const ideClient = await IdeClient.getInstance();
    await ideClient.connect();
    logIdeConnection(config, new IdeConnectionEvent(IdeConnectionType.START));
  }

  return {
    authError,
    themeError,
    shouldOpenAuthDialog,
    geminiMdFileCount: config.getGeminiMdFileCount(),
  };
}
