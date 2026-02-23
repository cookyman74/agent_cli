/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryItemStats } from '../types.js';
import { MessageType } from '../types.js';
import { formatDuration } from '../utils/formatters.js';
import {
  type CommandContext,
  type SlashCommand,
  CommandKind,
} from './types.js';

function parseProviderFlag(args: string): string | undefined {
  const match = args.match(/--provider\s+(\S+)/);
  return match?.[1]?.toLowerCase();
}

async function defaultSessionView(
  context: CommandContext,
  providerFilter?: string,
) {
  const now = new Date();
  const { sessionStartTime } = context.session.stats;
  if (!sessionStartTime) {
    context.ui.addItem({
      type: MessageType.ERROR,
      text: 'Session start time is unavailable, cannot calculate stats.',
    });
    return;
  }
  const wallDuration = now.getTime() - sessionStartTime.getTime();

  const statsItem: HistoryItemStats = {
    type: MessageType.STATS,
    duration: formatDuration(wallDuration),
    ...(providerFilter && { providerFilter }),
  };

  if (context.services.config) {
    const quota = await context.services.config.refreshUserQuota();
    if (quota) {
      statsItem.quotas = quota;
    }
  }

  // Non-Gemini provider quotas from response headers
  const providerQuotaService = context.services.providerQuotaService;
  if (providerQuotaService) {
    const all = providerQuotaService.getAll();
    if (Object.keys(all).length > 0) {
      statsItem.providerQuotas = all;
    }
  }

  context.ui.addItem(statsItem);
}

export const statsCommand: SlashCommand = {
  name: 'stats',
  altNames: ['usage'],
  description:
    'Check session stats. Usage: /stats [session|model|tools] [--provider <name>]',
  kind: CommandKind.BUILT_IN,
  autoExecute: false,
  action: async (context: CommandContext, args: string) => {
    const providerFilter = parseProviderFlag(args);
    await defaultSessionView(context, providerFilter);
  },
  subCommands: [
    {
      name: 'session',
      description: 'Show session-specific usage statistics',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: async (context: CommandContext, args: string) => {
        const providerFilter = parseProviderFlag(args);
        await defaultSessionView(context, providerFilter);
      },
    },
    {
      name: 'model',
      description: 'Show model-specific usage statistics',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        context.ui.addItem({
          type: MessageType.MODEL_STATS,
        });
      },
    },
    {
      name: 'tools',
      description: 'Show tool-specific usage statistics',
      kind: CommandKind.BUILT_IN,
      autoExecute: true,
      action: (context: CommandContext) => {
        context.ui.addItem({
          type: MessageType.TOOL_STATS,
        });
      },
    },
  ],
};
