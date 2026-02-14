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
import { type LoadedSettings, SettingScope } from '../config/settings.js';
import { performInitialAuth } from './auth.js';
import { validateTheme } from './theme.js';

/**
 * Map selectedType to the correct selectedProvider for migration.
 * USE_VERTEX_AI maps to 'vertex-ai'; all other Gemini auth types map to 'gemini'.
 */
function resolveProviderFromAuthType(selectedType: string): string {
  // AuthType.USE_VERTEX_AI = 'vertex-ai'
  if (selectedType === 'vertex-ai') {
    return 'vertex-ai';
  }
  return 'gemini';
}

/**
 * Migrate existing users to the multi-provider settings model.
 * Existing users have selectedType (e.g., 'oauth', 'use-gemini', 'vertex-ai')
 * but no selectedProvider. This adds the correct selectedProvider so the
 * migration is persistent across restarts.
 *
 * Only checks user-scope settings to avoid polluting user scope with values
 * that originated from workspace or system scope.
 */
function migrateAuthSettings(settings: LoadedSettings): void {
  const userAuth = settings.user.settings.security?.auth;
  if (userAuth?.selectedType && !userAuth?.selectedProvider) {
    settings.setValue(
      SettingScope.User,
      'security.auth.selectedProvider',
      resolveProviderFromAuthType(userAuth.selectedType),
    );
  }
}

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
  // Migrate existing Gemini-only users (selectedType without selectedProvider)
  migrateAuthSettings(settings);

  const selectedProvider = settings.merged.security.auth.selectedProvider;

  // Non-Gemini providers (Claude, OpenAI, sLM, Vertex AI) need env var setup
  // from useAuth.ts which runs after React renders. Skip startup auth to avoid
  // refreshAuth(USE_GEMINI) failing due to missing GEMINI_API_KEY.
  const shouldSkipStartupAuth =
    !!selectedProvider && selectedProvider !== 'gemini';

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
