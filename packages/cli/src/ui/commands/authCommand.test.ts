/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authCommand } from './authCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { SettingScope } from '../../config/settings.js';
import { cleanProviderEnvVars } from '../utils/resolveActiveProvider.js';

vi.mock('@didim365/agent-cli-core', async () => {
  const actual = await vi.importActual('@didim365/agent-cli-core');
  return {
    ...actual,
    clearCachedCredentialFile: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../utils/resolveActiveProvider.js', async () => {
  const actual = await vi.importActual('../utils/resolveActiveProvider.js');
  return {
    ...actual,
    cleanProviderEnvVars: vi.fn(
      (actual as { cleanProviderEnvVars: () => void }).cleanProviderEnvVars,
    ),
  };
});

describe('authCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext({
      services: {
        config: {
          getGeminiClient: vi.fn(),
        },
      },
    });
    // Add setValue mock to settings
    mockContext.services.settings.setValue = vi.fn();
    vi.clearAllMocks();
  });

  it('should have subcommands: login and logout', () => {
    expect(authCommand.subCommands).toBeDefined();
    expect(authCommand.subCommands).toHaveLength(2);
    expect(authCommand.subCommands?.[0]?.name).toBe('login');
    expect(authCommand.subCommands?.[1]?.name).toBe('logout');
  });

  it('should return a dialog action to open the auth dialog when called with no args', () => {
    if (!authCommand.action) {
      throw new Error('The auth command must have an action.');
    }

    const result = authCommand.action(mockContext, '');

    expect(result).toEqual({
      type: 'dialog',
      dialog: 'auth',
    });
  });

  it('should have the correct name and description', () => {
    expect(authCommand.name).toBe('auth');
    expect(authCommand.description).toBe(
      'Manage authentication and provider selection',
    );
  });

  describe('auth login subcommand', () => {
    it('should return auth dialog action', () => {
      const loginCommand = authCommand.subCommands?.[0];
      expect(loginCommand?.name).toBe('login');
      const result = loginCommand!.action!(mockContext, '');
      expect(result).toEqual({ type: 'dialog', dialog: 'auth' });
    });
  });

  describe('auth logout subcommand', () => {
    it('should clear cached credentials', async () => {
      const logoutCommand = authCommand.subCommands?.[1];
      expect(logoutCommand?.name).toBe('logout');

      const { clearCachedCredentialFile } = await import(
        '@didim365/agent-cli-core'
      );

      await logoutCommand!.action!(mockContext, '');

      expect(clearCachedCredentialFile).toHaveBeenCalledOnce();
    });

    it('should clear selectedAuthType setting', async () => {
      const logoutCommand = authCommand.subCommands?.[1];

      await logoutCommand!.action!(mockContext, '');

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'security.auth.selectedType',
        undefined,
      );
    });

    it('should clear DIDIM_API_KEY runtime env var', async () => {
      const logoutCommand = authCommand.subCommands?.[1];
      process.env['DIDIM_API_KEY'] = 'didim-test-key';

      await logoutCommand!.action!(mockContext, '');

      expect(process.env['DIDIM_API_KEY']).toBeUndefined();
    });

    it('should clear DIDIM_SERVER_ADDRESS and DIDIM_STREAM_MODE env vars on logout', async () => {
      const logoutCommand = authCommand.subCommands?.[1];
      process.env['DIDIM_SERVER_ADDRESS'] = 'aistudio.didim365.com';
      process.env['DIDIM_STREAM_MODE'] = 'sse';

      await logoutCommand!.action!(mockContext, '');

      expect(process.env['DIDIM_SERVER_ADDRESS']).toBeUndefined();
      expect(process.env['DIDIM_STREAM_MODE']).toBeUndefined();
    });

    it('should clear didimConfig setting on logout', async () => {
      const logoutCommand = authCommand.subCommands?.[1];

      await logoutCommand!.action!(mockContext, '');

      expect(mockContext.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'security.auth.didimConfig',
        undefined,
      );
    });

    it('should use cleanProviderEnvVars shared helper for env cleanup', async () => {
      const logoutCommand = authCommand.subCommands?.[1];

      await logoutCommand!.action!(mockContext, '');

      expect(cleanProviderEnvVars).toHaveBeenCalledOnce();
    });

    it('should clear OpenAI SDK env vars via cleanProviderEnvVars', async () => {
      const logoutCommand = authCommand.subCommands?.[1];
      process.env['OPENAI_BASE_URL'] = 'http://localhost:11434/v1';
      process.env['OPENAI_ORG_ID'] = 'org_test';
      process.env['OPENAI_PROJECT_ID'] = 'proj_test';

      await logoutCommand!.action!(mockContext, '');

      // These were previously missing from authCommand's individual delete list
      // but are covered by cleanProviderEnvVars
      expect(process.env['OPENAI_BASE_URL']).toBeUndefined();
      expect(process.env['OPENAI_ORG_ID']).toBeUndefined();
      expect(process.env['OPENAI_PROJECT_ID']).toBeUndefined();
    });

    it('should strip thoughts from history', async () => {
      const logoutCommand = authCommand.subCommands?.[1];
      const mockStripThoughts = vi.fn();
      const mockClient = {
        stripThoughtsFromHistory: mockStripThoughts,
      } as unknown as ReturnType<
        NonNullable<typeof mockContext.services.config>['getGeminiClient']
      >;

      if (mockContext.services.config) {
        mockContext.services.config.getGeminiClient = vi.fn(() => mockClient);
      }

      await logoutCommand!.action!(mockContext, '');

      expect(mockStripThoughts).toHaveBeenCalled();
    });

    it('should return logout action to signal explicit state change', async () => {
      const logoutCommand = authCommand.subCommands?.[1];
      const result = await logoutCommand!.action!(mockContext, '');

      expect(result).toEqual({ type: 'logout' });
    });

    it('should handle missing config gracefully', async () => {
      const logoutCommand = authCommand.subCommands?.[1];
      mockContext.services.config = null;

      const result = await logoutCommand!.action!(mockContext, '');

      expect(result).toEqual({ type: 'logout' });
    });
  });
});
