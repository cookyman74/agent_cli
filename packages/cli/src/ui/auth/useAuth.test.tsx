/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import { renderHook } from '../../test-utils/render.js';
import { useAuthCommand, validateAuthMethodWithSettings } from './useAuth.js';
import { AuthType, type Config } from '@didim365/agent-cli-core';
import { AuthState } from '../types.js';
import type { LoadedSettings } from '../../config/settings.js';
import { waitFor } from '../../test-utils/async.js';

// Mock dependencies
const mockLoadApiKey = vi.fn();
const mockLoadProviderApiKey = vi.fn();
const mockValidateAuthMethod = vi.fn();

vi.mock('@didim365/agent-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@didim365/agent-cli-core')>();
  return {
    ...actual,
    loadApiKey: () => mockLoadApiKey(),
    loadProviderApiKey: (provider: string) => mockLoadProviderApiKey(provider),
  };
});

vi.mock('../../config/auth.js', () => ({
  validateAuthMethod: (authType: AuthType) => mockValidateAuthMethod(authType),
}));

describe('useAuth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    delete process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_DEFAULT_AUTH_TYPE'];
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['LLM_PROVIDER'];
    delete process.env['ENABLE_MULTI_PROVIDER'];
    delete process.env['LLM_MODEL'];
    delete process.env['LLM_BASE_URL'];
    delete process.env['LLM_API_KEY'];
    delete process.env['LLM_API_KEY_HEADER'];
    delete process.env['LLM_CUSTOM_HEADERS'];
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateAuthMethodWithSettings', () => {
    it('should return error if auth type is enforced and does not match', () => {
      const settings = {
        merged: {
          security: {
            auth: {
              enforcedType: AuthType.LOGIN_WITH_GOOGLE,
            },
          },
        },
      } as LoadedSettings;

      const error = validateAuthMethodWithSettings(
        AuthType.USE_GEMINI,
        settings,
      );
      expect(error).toContain('Authentication is enforced to be oauth');
    });

    it('should return null if useExternal is true', () => {
      const settings = {
        merged: {
          security: {
            auth: {
              useExternal: true,
            },
          },
        },
      } as LoadedSettings;

      const error = validateAuthMethodWithSettings(
        AuthType.LOGIN_WITH_GOOGLE,
        settings,
      );
      expect(error).toBeNull();
    });

    it('should return null if authType is USE_GEMINI', () => {
      const settings = {
        merged: {
          security: {
            auth: {},
          },
        },
      } as LoadedSettings;

      const error = validateAuthMethodWithSettings(
        AuthType.USE_GEMINI,
        settings,
      );
      expect(error).toBeNull();
    });

    it('should call validateAuthMethod for other auth types', () => {
      const settings = {
        merged: {
          security: {
            auth: {},
          },
        },
      } as LoadedSettings;

      mockValidateAuthMethod.mockReturnValue('Validation Error');
      const error = validateAuthMethodWithSettings(
        AuthType.LOGIN_WITH_GOOGLE,
        settings,
      );
      expect(error).toBe('Validation Error');
      expect(mockValidateAuthMethod).toHaveBeenCalledWith(
        AuthType.LOGIN_WITH_GOOGLE,
      );
    });
  });

  describe('useAuthCommand', () => {
    const mockConfig = {
      refreshAuth: vi.fn(),
    } as unknown as Config;

    const createSettings = (
      selectedType?: AuthType,
      selectedProvider?: string,
    ) =>
      ({
        merged: {
          security: {
            auth: {
              selectedType,
              selectedProvider,
            },
          },
        },
      }) as LoadedSettings;

    it('should initialize with Unauthenticated state', () => {
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );
      expect(result.current.authState).toBe(AuthState.Unauthenticated);
    });

    it('should go to SelectingProvider if no auth type is selected and no env key', async () => {
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(undefined), mockConfig),
      );

      // With multi-provider support, when no auth method and no provider is selected,
      // the hook starts in SelectingProvider state instead of showing an error
      expect(result.current.authState).toBe(AuthState.SelectingProvider);
      expect(result.current.authError).toBeNull();
    });

    it('should set error if no auth type is selected but env key exists', async () => {
      process.env['GEMINI_API_KEY'] = 'env-key';
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(undefined), mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain(
          'Existing API key detected (GEMINI_API_KEY)',
        );
        expect(result.current.authState).toBe(AuthState.Updating);
      });
    });

    it('should transition to AwaitingApiKeyInput if USE_GEMINI and no key found', async () => {
      mockLoadApiKey.mockResolvedValue(null);
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.USE_GEMINI), mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.AwaitingApiKeyInput);
      });
    });

    it('should authenticate if USE_GEMINI and key is found', async () => {
      mockLoadApiKey.mockResolvedValue('stored-key');
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.USE_GEMINI), mockConfig),
      );

      await waitFor(() => {
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.USE_GEMINI,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
        expect(result.current.apiKeyDefaultValue).toBe('stored-key');
      });
    });

    it('should authenticate if USE_GEMINI and env key is found', async () => {
      mockLoadApiKey.mockResolvedValue(null);
      process.env['GEMINI_API_KEY'] = 'env-key';
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.USE_GEMINI), mockConfig),
      );

      await waitFor(() => {
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.USE_GEMINI,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
        expect(result.current.apiKeyDefaultValue).toBe('env-key');
      });
    });

    it('should prioritize env key over stored key when both are present', async () => {
      mockLoadApiKey.mockResolvedValue('stored-key');
      process.env['GEMINI_API_KEY'] = 'env-key';
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.USE_GEMINI), mockConfig),
      );

      await waitFor(() => {
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.USE_GEMINI,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
        // The environment key should take precedence
        expect(result.current.apiKeyDefaultValue).toBe('env-key');
      });
    });

    it('should set error if validation fails', async () => {
      mockValidateAuthMethod.mockReturnValue('Validation Failed');
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toBe('Validation Failed');
        expect(result.current.authState).toBe(AuthState.Updating);
      });
    });

    it('should set error if GEMINI_DEFAULT_AUTH_TYPE is invalid', async () => {
      process.env['GEMINI_DEFAULT_AUTH_TYPE'] = 'INVALID_TYPE';
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain(
          'Invalid value for GEMINI_DEFAULT_AUTH_TYPE',
        );
        expect(result.current.authState).toBe(AuthState.Updating);
      });
    });

    it('should authenticate successfully for valid auth type', async () => {
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      await waitFor(() => {
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.LOGIN_WITH_GOOGLE,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
        expect(result.current.authError).toBeNull();
      });
    });

    it('should handle refreshAuth failure', async () => {
      (mockConfig.refreshAuth as Mock).mockRejectedValue(
        new Error('Auth Failed'),
      );
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(AuthType.LOGIN_WITH_GOOGLE), mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain('Failed to login');
        expect(result.current.authState).toBe(AuthState.Updating);
      });
    });

    // --- Issue 2: API Key default value should load per-provider ---

    it('should load provider-specific API key when AwaitingApiKeyInput with non-Gemini provider', async () => {
      mockLoadProviderApiKey.mockResolvedValue('sk-claude-key');
      const settings = createSettings(undefined, 'claude');

      const { result } = renderHook(() => useAuthCommand(settings, mockConfig));

      // Simulate transition to AwaitingApiKeyInput
      result.current.setAuthState(AuthState.AwaitingApiKeyInput);

      await waitFor(() => {
        expect(mockLoadProviderApiKey).toHaveBeenCalledWith('claude');
        expect(result.current.apiKeyDefaultValue).toBe('sk-claude-key');
      });
    });

    it('should load Gemini API key when AwaitingApiKeyInput with gemini provider', async () => {
      mockLoadApiKey.mockResolvedValue('gemini-stored-key');
      const settings = createSettings(undefined, 'gemini');

      const { result } = renderHook(() => useAuthCommand(settings, mockConfig));

      // Simulate transition to AwaitingApiKeyInput
      result.current.setAuthState(AuthState.AwaitingApiKeyInput);

      await waitFor(() => {
        expect(mockLoadApiKey).toHaveBeenCalled();
        expect(result.current.apiKeyDefaultValue).toBe('gemini-stored-key');
      });
    });

    // --- Issue 3: env-based non-Gemini auto-detection ---

    it('should auto-detect Claude from ANTHROPIC_API_KEY env var', async () => {
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(undefined), mockConfig),
      );

      await waitFor(() => {
        expect(process.env['LLM_PROVIDER']).toBe('claude');
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.USE_GEMINI,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
        expect(result.current.authError).toBeNull();
      });
    });

    it('should auto-detect OpenAI from OPENAI_API_KEY env var', async () => {
      process.env['OPENAI_API_KEY'] = 'sk-openai-test';
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(undefined), mockConfig),
      );

      await waitFor(() => {
        expect(process.env['LLM_PROVIDER']).toBe('openai');
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.USE_GEMINI,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
        expect(result.current.authError).toBeNull();
      });
    });

    it('should authenticate directly when LLM_PROVIDER env var is set', async () => {
      process.env['LLM_PROVIDER'] = 'claude';
      process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(undefined), mockConfig),
      );

      await waitFor(() => {
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.USE_GEMINI,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
        expect(result.current.authError).toBeNull();
      });
    });

    it('should show error when LLM_PROVIDER is set but required API key env var is missing', async () => {
      process.env['LLM_PROVIDER'] = 'claude';
      // ANTHROPIC_API_KEY is NOT set
      const { result } = renderHook(() =>
        useAuthCommand(createSettings(undefined), mockConfig),
      );

      await waitFor(() => {
        expect(result.current.authError).toContain('ANTHROPIC_API_KEY');
        expect(result.current.authError).toContain('missing');
        expect(mockConfig.refreshAuth).not.toHaveBeenCalled();
      });
    });

    // --- Issue: non-Gemini restart auto-authentication ---

    it('should auto-authenticate non-Gemini provider on restart with saved key', async () => {
      // Simulates restart: selectedType=USE_GEMINI + selectedProvider=claude + stored key
      mockLoadProviderApiKey.mockResolvedValue('sk-ant-saved');
      const settings = createSettings(AuthType.USE_GEMINI, 'claude');

      const { result } = renderHook(() => useAuthCommand(settings, mockConfig));

      await waitFor(() => {
        expect(mockLoadProviderApiKey).toHaveBeenCalledWith('claude');
        expect(process.env['LLM_PROVIDER']).toBe('claude');
        expect(process.env['ANTHROPIC_API_KEY']).toBe('sk-ant-saved');
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.USE_GEMINI,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
      });
    });

    it('should fall to AwaitingApiKeyInput when non-Gemini provider has no saved key', async () => {
      // Simulates restart: selectedType=USE_GEMINI + selectedProvider=openai + no stored key
      mockLoadProviderApiKey.mockResolvedValue('');
      const settings = createSettings(AuthType.USE_GEMINI, 'openai');

      const { result } = renderHook(() => useAuthCommand(settings, mockConfig));

      await waitFor(() => {
        expect(mockLoadProviderApiKey).toHaveBeenCalledWith('openai');
        expect(result.current.authState).toBe(AuthState.AwaitingApiKeyInput);
      });
    });

    // --- Issue: openai-compatible (sLM) restart with advanced headers ---

    it('should auto-authenticate openai-compatible provider on restart with slmConfig including advanced headers', async () => {
      mockLoadProviderApiKey.mockResolvedValue('slm-api-key');
      const settings = {
        merged: {
          security: {
            auth: {
              selectedType: AuthType.USE_GEMINI,
              selectedProvider: 'openai-compatible',
              slmConfig: {
                baseUrl: 'http://localhost:11434/v1',
                model: 'llama3',
                apiKeyHeaderName: 'X-API-Key',
                customHeaders: '{"X-Custom": "value"}',
              },
            },
          },
        },
      } as LoadedSettings;

      const { result } = renderHook(() => useAuthCommand(settings, mockConfig));

      await waitFor(() => {
        expect(process.env['LLM_PROVIDER']).toBe('openai-compatible');
        expect(process.env['LLM_BASE_URL']).toBe('http://localhost:11434/v1');
        expect(process.env['LLM_MODEL']).toBe('llama3');
        expect(process.env['LLM_API_KEY_HEADER']).toBe('X-API-Key');
        expect(process.env['LLM_CUSTOM_HEADERS']).toBe('{"X-Custom": "value"}');
        expect(process.env['LLM_API_KEY']).toBe('slm-api-key');
        expect(process.env['ENABLE_MULTI_PROVIDER']).toBe('true');
        expect(mockConfig.refreshAuth).toHaveBeenCalledWith(
          AuthType.USE_GEMINI,
        );
        expect(result.current.authState).toBe(AuthState.Authenticated);
      });
    });

    it('should go to ConfiguringSlm when openai-compatible has no baseUrl', async () => {
      const settings = {
        merged: {
          security: {
            auth: {
              selectedType: AuthType.USE_GEMINI,
              selectedProvider: 'openai-compatible',
              slmConfig: {},
            },
          },
        },
      } as LoadedSettings;

      const { result } = renderHook(() => useAuthCommand(settings, mockConfig));

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.ConfiguringSlm);
      });
    });

    it('should set GOOGLE_CLOUD env vars when restarting with Vertex AI auth', async () => {
      const settings = {
        merged: {
          security: {
            auth: {
              selectedType: AuthType.USE_VERTEX_AI,
              selectedProvider: 'vertex-ai',
              vertexConfig: {
                project: 'my-gcp-project',
                location: 'europe-west1',
              },
            },
          },
        },
      } as LoadedSettings;

      const { result } = renderHook(() => useAuthCommand(settings, mockConfig));

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.Authenticated);
        expect(process.env['GOOGLE_CLOUD_PROJECT']).toBe('my-gcp-project');
        expect(process.env['GOOGLE_CLOUD_LOCATION']).toBe('europe-west1');
      });
    });

    it('should clean sLM env vars when restarting with Claude provider', async () => {
      // Simulate sLM env vars left over from previous session
      process.env['LLM_MODEL'] = 'llama3';
      process.env['LLM_BASE_URL'] = 'http://localhost:11434/v1';
      process.env['LLM_API_KEY'] = 'old-slm-key';
      process.env['LLM_API_KEY_HEADER'] = 'X-API-Key';
      process.env['LLM_CUSTOM_HEADERS'] = '{"X-Old": "val"}';

      mockLoadProviderApiKey.mockResolvedValue('sk-ant-saved');
      const settings = createSettings(AuthType.USE_GEMINI, 'claude');

      const { result } = renderHook(() => useAuthCommand(settings, mockConfig));

      await waitFor(() => {
        expect(result.current.authState).toBe(AuthState.Authenticated);
        // sLM-specific env vars should be cleaned
        expect(process.env['LLM_MODEL']).toBeUndefined();
        expect(process.env['LLM_BASE_URL']).toBeUndefined();
        expect(process.env['LLM_API_KEY']).toBeUndefined();
        expect(process.env['LLM_API_KEY_HEADER']).toBeUndefined();
        expect(process.env['LLM_CUSTOM_HEADERS']).toBeUndefined();
      });
    });
  });
});
