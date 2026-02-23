/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { CommandContext, SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import process from 'node:process';
import { MessageType, type HistoryItemAbout } from '../types.js';
import {
  IdeClient,
  UserAccountManager,
  debugLogger,
  getVersion,
} from '@didim365/agent-cli-core';
import { resolveActiveProvider } from '../utils/resolveActiveProvider.js';

export const aboutCommand: SlashCommand = {
  name: 'about',
  description: 'Show version info',
  kind: CommandKind.BUILT_IN,
  autoExecute: true,
  action: async (context) => {
    const osVersion = process.platform;
    let sandboxEnv = 'no sandbox';
    if (process.env['SANDBOX'] && process.env['SANDBOX'] !== 'sandbox-exec') {
      sandboxEnv = process.env['SANDBOX'];
    } else if (process.env['SANDBOX'] === 'sandbox-exec') {
      sandboxEnv = `sandbox-exec (${
        process.env['SEATBELT_PROFILE'] || 'unknown'
      })`;
    }
    const modelVersion = context.services.config?.getModel() || 'Unknown';
    const cliVersion = await getVersion();
    const selectedAuthType =
      context.services.settings.merged.security.auth.selectedType || '';
    // Get the actual runtime provider from core's content generator (single source of truth).
    // Falls back to resolveActiveProvider() if config is unavailable (e.g., pre-auth).
    const runtimeProvider =
      context.services.config?.getContentGenerator()?.providerName;
    const selectedProvider =
      runtimeProvider ||
      resolveActiveProvider(
        context.services.settings.merged.security.auth.selectedProvider || '',
      );
    const gcpProject = process.env['GOOGLE_CLOUD_PROJECT'] || '';
    const ideClient = await getIdeClientName(context);

    const userAccountManager = new UserAccountManager();
    const cachedAccount = userAccountManager.getCachedGoogleAccount();
    debugLogger.log('AboutCommand: Retrieved cached Google account', {
      cachedAccount,
    });
    const userEmail = cachedAccount ?? undefined;

    const tier = context.services.config?.getUserTierName();

    const aboutItem: Omit<HistoryItemAbout, 'id'> = {
      type: MessageType.ABOUT,
      cliVersion,
      osVersion,
      sandboxEnv,
      modelVersion,
      selectedAuthType,
      selectedProvider,
      gcpProject,
      ideClient,
      userEmail,
      tier,
    };

    context.ui.addItem(aboutItem);
  },
};

async function getIdeClientName(context: CommandContext) {
  if (!context.services.config?.getIdeMode()) {
    return '';
  }
  const ideClient = await IdeClient.getInstance();
  return ideClient?.getDetectedIdeDisplayName() ?? '';
}
