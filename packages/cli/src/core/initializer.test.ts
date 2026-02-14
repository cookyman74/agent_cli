/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initializeApp } from './initializer.js';
import {
  IdeClient,
  logIdeConnection,
  logCliConfiguration,
  type Config,
} from '@didim365/agent-cli-core';
import { performInitialAuth } from './auth.js';
import { validateTheme } from './theme.js';
import { type LoadedSettings, SettingScope } from '../config/settings.js';

vi.mock('@didim365/agent-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@didim365/agent-cli-core')>();
  return {
    ...actual,
    IdeClient: {
      getInstance: vi.fn(),
    },
    logIdeConnection: vi.fn(),
    logCliConfiguration: vi.fn(),
    StartSessionEvent: vi.fn(),
    IdeConnectionEvent: vi.fn(),
  };
});

vi.mock('./auth.js', () => ({
  performInitialAuth: vi.fn(),
}));

vi.mock('./theme.js', () => ({
  validateTheme: vi.fn(),
}));

describe('initializer', () => {
  let mockConfig: {
    getToolRegistry: ReturnType<typeof vi.fn>;
    getIdeMode: ReturnType<typeof vi.fn>;
    getGeminiMdFileCount: ReturnType<typeof vi.fn>;
  };
  let mockSettings: LoadedSettings;
  let mockIdeClient: {
    connect: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = {
      getToolRegistry: vi.fn(),
      getIdeMode: vi.fn().mockReturnValue(false),
      getGeminiMdFileCount: vi.fn().mockReturnValue(5),
    };
    mockSettings = {
      merged: {
        security: {
          auth: {
            selectedType: 'oauth',
          },
        },
      },
      user: {
        settings: {
          security: {
            auth: {
              selectedType: 'oauth',
            },
          },
        },
      },
      setValue: vi.fn(),
    } as unknown as LoadedSettings;
    mockIdeClient = {
      connect: vi.fn(),
    };
    vi.mocked(IdeClient.getInstance).mockResolvedValue(
      mockIdeClient as unknown as IdeClient,
    );
    vi.mocked(performInitialAuth).mockResolvedValue(null);
    vi.mocked(validateTheme).mockReturnValue(null);
  });

  it('should initialize correctly in non-IDE mode', async () => {
    const result = await initializeApp(
      mockConfig as unknown as Config,
      mockSettings,
    );

    expect(result).toEqual({
      authError: null,
      themeError: null,
      shouldOpenAuthDialog: false,
      geminiMdFileCount: 5,
    });
    expect(performInitialAuth).toHaveBeenCalledWith(mockConfig, 'oauth');
    expect(validateTheme).toHaveBeenCalledWith(mockSettings);
    expect(logCliConfiguration).toHaveBeenCalled();
    expect(IdeClient.getInstance).not.toHaveBeenCalled();
  });

  it('should initialize correctly in IDE mode', async () => {
    mockConfig.getIdeMode.mockReturnValue(true);
    const result = await initializeApp(
      mockConfig as unknown as Config,
      mockSettings,
    );

    expect(result).toEqual({
      authError: null,
      themeError: null,
      shouldOpenAuthDialog: false,
      geminiMdFileCount: 5,
    });
    expect(IdeClient.getInstance).toHaveBeenCalled();
    expect(mockIdeClient.connect).toHaveBeenCalled();
    expect(logIdeConnection).toHaveBeenCalledWith(
      mockConfig as unknown as Config,
      expect.any(Object),
    );
  });

  it('should handle auth error', async () => {
    vi.mocked(performInitialAuth).mockResolvedValue('Auth failed');
    const result = await initializeApp(
      mockConfig as unknown as Config,
      mockSettings,
    );

    expect(result.authError).toBe('Auth failed');
    expect(result.shouldOpenAuthDialog).toBe(true);
  });

  it('should handle undefined auth type', async () => {
    mockSettings.merged.security.auth.selectedType = undefined;
    const result = await initializeApp(
      mockConfig as unknown as Config,
      mockSettings,
    );

    expect(result.shouldOpenAuthDialog).toBe(true);
  });

  it('should handle theme error', async () => {
    vi.mocked(validateTheme).mockReturnValue('Theme not found');
    const result = await initializeApp(
      mockConfig as unknown as Config,
      mockSettings,
    );

    expect(result.themeError).toBe('Theme not found');
  });

  // --- migrateAuthSettings ---

  describe('migrateAuthSettings', () => {
    it('should set selectedProvider to gemini when selectedType exists without selectedProvider', async () => {
      // Existing Gemini user: selectedType='oauth', no selectedProvider (user scope)
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedType: 'oauth',
              // no selectedProvider
            },
          },
        },
        user: {
          settings: {
            security: {
              auth: {
                selectedType: 'oauth',
              },
            },
          },
        },
        setValue: vi.fn(),
      } as unknown as LoadedSettings;

      await initializeApp(mockConfig as unknown as Config, mockSettings);

      expect(
        (mockSettings as unknown as { setValue: ReturnType<typeof vi.fn> })
          .setValue,
      ).toHaveBeenCalledWith(
        SettingScope.User,
        'security.auth.selectedProvider',
        'gemini',
      );
    });

    it('should set selectedProvider to vertex-ai when selectedType is USE_VERTEX_AI', async () => {
      // Existing Vertex AI user: selectedType='vertex-ai', no selectedProvider
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedType: 'vertex-ai',
            },
          },
        },
        user: {
          settings: {
            security: {
              auth: {
                selectedType: 'vertex-ai',
              },
            },
          },
        },
        setValue: vi.fn(),
      } as unknown as LoadedSettings;

      await initializeApp(mockConfig as unknown as Config, mockSettings);

      expect(
        (mockSettings as unknown as { setValue: ReturnType<typeof vi.fn> })
          .setValue,
      ).toHaveBeenCalledWith(
        SettingScope.User,
        'security.auth.selectedProvider',
        'vertex-ai',
      );
    });

    it('should not migrate when both selectedType and selectedProvider exist', async () => {
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedType: 'oauth',
              selectedProvider: 'gemini',
            },
          },
        },
        user: {
          settings: {
            security: {
              auth: {
                selectedType: 'oauth',
                selectedProvider: 'gemini',
              },
            },
          },
        },
        setValue: vi.fn(),
      } as unknown as LoadedSettings;

      await initializeApp(mockConfig as unknown as Config, mockSettings);

      expect(
        (mockSettings as unknown as { setValue: ReturnType<typeof vi.fn> })
          .setValue,
      ).not.toHaveBeenCalled();
    });

    it('should not migrate when neither selectedType nor selectedProvider exist', async () => {
      mockSettings = {
        merged: {
          security: {
            auth: {},
          },
        },
        user: {
          settings: {
            security: {
              auth: {},
            },
          },
        },
        setValue: vi.fn(),
      } as unknown as LoadedSettings;

      await initializeApp(mockConfig as unknown as Config, mockSettings);

      expect(
        (mockSettings as unknown as { setValue: ReturnType<typeof vi.fn> })
          .setValue,
      ).not.toHaveBeenCalled();
    });

    it('should not migrate when selectedType exists only in workspace/system scope, not user scope', async () => {
      // selectedType comes from workspace scope, not user scope
      // Migration should NOT write to user scope to avoid settings pollution
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedType: 'oauth',
              // no selectedProvider in merged
            },
          },
        },
        user: {
          settings: {
            // user scope has no auth settings at all
          },
        },
        setValue: vi.fn(),
      } as unknown as LoadedSettings;

      await initializeApp(mockConfig as unknown as Config, mockSettings);

      expect(
        (mockSettings as unknown as { setValue: ReturnType<typeof vi.fn> })
          .setValue,
      ).not.toHaveBeenCalled();
    });
  });

  // --- Non-Gemini provider startup auth skip ---

  describe('non-Gemini provider startup', () => {
    it('should skip performInitialAuth for Claude provider', async () => {
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedType: 'use-gemini',
              selectedProvider: 'claude',
            },
          },
        },
        user: { settings: {} },
      } as unknown as LoadedSettings;

      const result = await initializeApp(
        mockConfig as unknown as Config,
        mockSettings,
      );

      expect(performInitialAuth).not.toHaveBeenCalled();
      expect(result.authError).toBeNull();
    });

    it('should skip performInitialAuth for OpenAI provider', async () => {
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedType: 'use-gemini',
              selectedProvider: 'openai',
            },
          },
        },
        user: { settings: {} },
      } as unknown as LoadedSettings;

      const result = await initializeApp(
        mockConfig as unknown as Config,
        mockSettings,
      );

      expect(performInitialAuth).not.toHaveBeenCalled();
      expect(result.authError).toBeNull();
    });

    it('should skip performInitialAuth for Vertex AI provider', async () => {
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedType: 'use-vertex-ai',
              selectedProvider: 'vertex-ai',
            },
          },
        },
        user: { settings: {} },
      } as unknown as LoadedSettings;

      const result = await initializeApp(
        mockConfig as unknown as Config,
        mockSettings,
      );

      expect(performInitialAuth).not.toHaveBeenCalled();
      expect(result.authError).toBeNull();
    });

    it('should call performInitialAuth for Gemini provider', async () => {
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedType: 'oauth',
              selectedProvider: 'gemini',
            },
          },
        },
        user: { settings: {} },
      } as unknown as LoadedSettings;

      await initializeApp(mockConfig as unknown as Config, mockSettings);

      expect(performInitialAuth).toHaveBeenCalledWith(mockConfig, 'oauth');
    });

    it('should call performInitialAuth when selectedProvider is undefined', async () => {
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedType: 'oauth',
              // no selectedProvider — migration will add 'gemini'
            },
          },
        },
        user: {
          settings: {
            security: {
              auth: {
                selectedType: 'oauth',
              },
            },
          },
        },
        setValue: vi.fn(),
      } as unknown as LoadedSettings;

      await initializeApp(mockConfig as unknown as Config, mockSettings);

      // After migration, selectedProvider='gemini' → performInitialAuth called
      expect(performInitialAuth).toHaveBeenCalledWith(mockConfig, 'oauth');
    });
  });

  // --- shouldOpenAuthDialog ---

  describe('shouldOpenAuthDialog', () => {
    it('should be false when both selectedType and selectedProvider are set', async () => {
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedType: 'oauth',
              selectedProvider: 'gemini',
            },
          },
        },
        user: { settings: {} },
      } as unknown as LoadedSettings;

      const result = await initializeApp(
        mockConfig as unknown as Config,
        mockSettings,
      );

      expect(result.shouldOpenAuthDialog).toBe(false);
    });

    it('should be true when both selectedType and selectedProvider are missing', async () => {
      mockSettings = {
        merged: {
          security: {
            auth: {},
          },
        },
        user: { settings: {} },
      } as unknown as LoadedSettings;

      const result = await initializeApp(
        mockConfig as unknown as Config,
        mockSettings,
      );

      expect(result.shouldOpenAuthDialog).toBe(true);
    });

    it('should be false for non-Gemini provider with selectedType', async () => {
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedType: 'use-gemini',
              selectedProvider: 'claude',
            },
          },
        },
        user: { settings: {} },
      } as unknown as LoadedSettings;

      const result = await initializeApp(
        mockConfig as unknown as Config,
        mockSettings,
      );

      expect(result.shouldOpenAuthDialog).toBe(false);
    });

    it('should be true when selectedProvider exists without selectedType (incomplete state)', async () => {
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedProvider: 'claude',
              // no selectedType — incomplete/corrupted state
            },
          },
        },
        user: { settings: {} },
      } as unknown as LoadedSettings;

      const result = await initializeApp(
        mockConfig as unknown as Config,
        mockSettings,
      );

      // Dialog should open to let user reconfigure
      expect(result.shouldOpenAuthDialog).toBe(true);
    });

    it('should be true when authError exists regardless of provider', async () => {
      vi.mocked(performInitialAuth).mockResolvedValue('Auth failed');
      mockSettings = {
        merged: {
          security: {
            auth: {
              selectedType: 'oauth',
              selectedProvider: 'gemini',
            },
          },
        },
        user: { settings: {} },
      } as unknown as LoadedSettings;

      const result = await initializeApp(
        mockConfig as unknown as Config,
        mockSettings,
      );

      expect(result.shouldOpenAuthDialog).toBe(true);
    });
  });
});
