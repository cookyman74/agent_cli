/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  OpenDialogActionReturn,
  SlashCommand,
  LogoutActionReturn,
} from './types.js';
import { CommandKind } from './types.js';
import { clearCachedCredentialFile } from '@didim365/agent-cli-core';
import { SettingScope } from '../../config/settings.js';

const authLoginCommand: SlashCommand = {
  name: 'login',
  description: 'Select a provider and enter API key',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: (_context, _args): OpenDialogActionReturn => ({
    type: 'dialog',
    dialog: 'auth',
  }),
};

const authLogoutCommand: SlashCommand = {
  name: 'logout',
  description: 'Log out and clear all cached credentials',
  kind: CommandKind.BUILT_IN,
  action: async (context, _args): Promise<LogoutActionReturn> => {
    await clearCachedCredentialFile();
    // Clear the selected auth type and provider so user sees the provider selection menu
    context.services.settings.setValue(
      SettingScope.User,
      'security.auth.selectedType',
      undefined,
    );
    context.services.settings.setValue(
      SettingScope.User,
      'security.auth.selectedProvider',
      undefined,
    );
    // Clear sLM config so user must re-configure on next login
    context.services.settings.setValue(
      SettingScope.User,
      'security.auth.slmConfig',
      undefined,
    );
    // Clear Vertex AI config so user must re-configure on next login
    context.services.settings.setValue(
      SettingScope.User,
      'security.auth.vertexConfig',
      undefined,
    );
    // Clear Didim config so user must re-configure on next login
    context.services.settings.setValue(
      SettingScope.User,
      'security.auth.didimConfig',
      undefined,
    );
    // Clear provider-related runtime env vars to prevent stale routing
    delete process.env['ENABLE_MULTI_PROVIDER'];
    delete process.env['LLM_PROVIDER'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['DIDIM_API_KEY'];
    delete process.env['LLM_API_KEY'];
    delete process.env['LLM_BASE_URL'];
    delete process.env['LLM_MODEL'];
    delete process.env['LLM_API_KEY_HEADER'];
    delete process.env['LLM_CUSTOM_HEADERS'];
    delete process.env['DIDIM_SERVER_ADDRESS'];
    delete process.env['DIDIM_STREAM_MODE'];
    delete process.env['GOOGLE_CLOUD_PROJECT'];
    delete process.env['GOOGLE_CLOUD_LOCATION'];
    // Strip thoughts from history instead of clearing completely
    context.services.config?.getGeminiClient()?.stripThoughtsFromHistory();
    // Return logout action to signal explicit state change
    return {
      type: 'logout',
    };
  },
};

export const authCommand: SlashCommand = {
  name: 'auth',
  description: 'Manage authentication and provider selection',
  kind: CommandKind.BUILT_IN,
  subCommands: [authLoginCommand, authLogoutCommand],
  action: (context, args) =>
    // Default to login if no subcommand is provided
    authLoginCommand.action!(context, args),
};
