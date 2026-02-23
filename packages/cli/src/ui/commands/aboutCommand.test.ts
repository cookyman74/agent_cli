/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { aboutCommand } from './aboutCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { MessageType } from '../types.js';
import { IdeClient, getVersion } from '@didim365/agent-cli-core';

vi.mock('@didim365/agent-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@didim365/agent-cli-core')>();
  return {
    ...actual,
    IdeClient: {
      getInstance: vi.fn().mockResolvedValue({
        getDetectedIdeDisplayName: vi.fn().mockReturnValue('test-ide'),
      }),
    },
    UserAccountManager: vi.fn().mockImplementation(() => ({
      getCachedGoogleAccount: vi.fn().mockReturnValue('test-email@example.com'),
    })),
    getVersion: vi.fn(),
  };
});

describe('aboutCommand', () => {
  let mockContext: CommandContext;
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockContext = createMockCommandContext({
      services: {
        config: {
          getModel: vi.fn(),
          getIdeMode: vi.fn().mockReturnValue(true),
          getUserTierName: vi.fn().mockReturnValue(undefined),
          getContentGenerator: vi
            .fn()
            .mockReturnValue({ providerName: 'test-provider' }),
        },
        settings: {
          merged: {
            security: {
              auth: {
                selectedType: 'test-auth',
                selectedProvider: 'test-provider',
              },
            },
          },
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext);

    vi.mocked(getVersion).mockResolvedValue('test-version');
    vi.spyOn(mockContext.services.config!, 'getModel').mockReturnValue(
      'test-model',
    );
    process.env['GOOGLE_CLOUD_PROJECT'] = 'test-gcp-project';
    Object.defineProperty(process, 'platform', {
      value: 'test-os',
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should have the correct name and description', () => {
    expect(aboutCommand.name).toBe('about');
    expect(aboutCommand.description).toBe('Show version info');
  });

  it('should call addItem with all version info', async () => {
    process.env['SANDBOX'] = '';
    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith({
      type: MessageType.ABOUT,
      cliVersion: 'test-version',
      osVersion: 'test-os',
      sandboxEnv: 'no sandbox',
      modelVersion: 'test-model',
      selectedAuthType: 'test-auth',
      selectedProvider: 'test-provider',
      gcpProject: 'test-gcp-project',
      ideClient: 'test-ide',
      userEmail: 'test-email@example.com',
      tier: undefined,
    });
  });

  it('should show the correct sandbox environment variable', async () => {
    process.env['SANDBOX'] = 'gemini-sandbox';
    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxEnv: 'gemini-sandbox',
      }),
    );
  });

  it('should show sandbox-exec profile when applicable', async () => {
    process.env['SANDBOX'] = 'sandbox-exec';
    process.env['SEATBELT_PROFILE'] = 'test-profile';
    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxEnv: 'sandbox-exec (test-profile)',
      }),
    );
  });

  it('should not show ide client when it is not detected', async () => {
    vi.mocked(IdeClient.getInstance).mockResolvedValue({
      getDetectedIdeDisplayName: vi.fn().mockReturnValue(undefined),
    } as unknown as IdeClient);

    process.env['SANDBOX'] = '';
    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.ABOUT,
        cliVersion: 'test-version',
        osVersion: 'test-os',
        sandboxEnv: 'no sandbox',
        modelVersion: 'test-model',
        selectedAuthType: 'test-auth',
        gcpProject: 'test-gcp-project',
        ideClient: '',
      }),
    );
  });

  it('should resolve provider from LLM_PROVIDER env when settings is empty', async () => {
    // Override mock: getContentGenerator returns undefined to trigger fallback
    mockContext = createMockCommandContext({
      services: {
        config: {
          getModel: vi.fn().mockReturnValue('test-model'),
          getIdeMode: vi.fn().mockReturnValue(false),
          getUserTierName: vi.fn().mockReturnValue(undefined),
          getContentGenerator: vi.fn().mockReturnValue(undefined),
        },
        settings: {
          merged: {
            security: {
              auth: {
                selectedType: 'test-auth',
                selectedProvider: '',
              },
            },
          },
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext);

    process.env['LLM_PROVIDER'] = 'openai';
    process.env['SANDBOX'] = '';

    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedProvider: 'openai',
      }),
    );
  });

  it('should normalize anthropic provider key to claude', async () => {
    // Override mock: getContentGenerator returns undefined to trigger fallback
    mockContext = createMockCommandContext({
      services: {
        config: {
          getModel: vi.fn().mockReturnValue('test-model'),
          getIdeMode: vi.fn().mockReturnValue(false),
          getUserTierName: vi.fn().mockReturnValue(undefined),
          getContentGenerator: vi.fn().mockReturnValue(undefined),
        },
        settings: {
          merged: {
            security: {
              auth: {
                selectedType: 'test-auth',
                selectedProvider: 'anthropic',
              },
            },
          },
        },
      },
      ui: {
        addItem: vi.fn(),
      },
    } as unknown as CommandContext);

    process.env['SANDBOX'] = '';

    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedProvider: 'claude',
      }),
    );
  });

  it('should display the tier when getUserTierName returns a value', async () => {
    vi.mocked(mockContext.services.config!.getUserTierName).mockReturnValue(
      'Enterprise Tier',
    );
    if (!aboutCommand.action) {
      throw new Error('The about command must have an action.');
    }

    await aboutCommand.action(mockContext, '');

    expect(mockContext.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'Enterprise Tier',
      }),
    );
  });
});
