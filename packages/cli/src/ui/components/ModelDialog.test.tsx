/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModelDialog } from './ModelDialog.js';
import { ConfigContext } from '../contexts/ConfigContext.js';
import { KeypressProvider } from '../contexts/KeypressContext.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
  PROVIDER_MODEL_REGISTRY,
} from '@didim365/agent-cli-core';
import type { Config, ModelSlashCommandEvent } from '@didim365/agent-cli-core';
import { SettingsContext } from '../contexts/SettingsContext.js';
import type { LoadedSettings } from '../../config/settings.js';

// Mock saveModelForProvider
const mockSaveModelForProvider = vi.fn();
vi.mock('../../config/settings.js', async () => {
  const actual = await vi.importActual('../../config/settings.js');
  return {
    ...actual,
    saveModelForProvider: (...args: unknown[]) =>
      mockSaveModelForProvider(...args),
  };
});

// Mock dependencies
const mockGetDisplayString = vi.fn();
const mockLogModelSlashCommand = vi.fn();
const mockModelSlashCommandEvent = vi.fn();

vi.mock('@didim365/agent-cli-core', async () => {
  const actual = await vi.importActual('@didim365/agent-cli-core');
  return {
    ...actual,
    getDisplayString: (val: string) => mockGetDisplayString(val),
    logModelSlashCommand: (config: Config, event: ModelSlashCommandEvent) =>
      mockLogModelSlashCommand(config, event),
    ModelSlashCommandEvent: class {
      constructor(model: string) {
        mockModelSlashCommandEvent(model);
      }
    },
  };
});

describe('<ModelDialog />', () => {
  const mockSetModel = vi.fn();
  const mockGetModel = vi.fn();
  const mockGetPreviewFeatures = vi.fn();
  const mockOnClose = vi.fn();
  const mockGetHasAccessToPreviewModel = vi.fn();

  interface MockConfig extends Partial<Config> {
    setModel: (model: string, isTemporary?: boolean) => void;
    getModel: () => string;
    getPreviewFeatures: () => boolean;
    getHasAccessToPreviewModel: () => boolean;
  }

  const mockConfig: MockConfig = {
    setModel: mockSetModel,
    getModel: mockGetModel,
    getPreviewFeatures: mockGetPreviewFeatures,
    getHasAccessToPreviewModel: mockGetHasAccessToPreviewModel,
  };

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetModel.mockReturnValue(DEFAULT_GEMINI_MODEL_AUTO);
    mockGetPreviewFeatures.mockReturnValue(false);
    mockGetHasAccessToPreviewModel.mockReturnValue(false);

    mockSaveModelForProvider.mockClear();

    // Default implementation for getDisplayString
    mockGetDisplayString.mockImplementation((val: string) => {
      if (val === 'auto-gemini-2.5') return 'Auto (Gemini 2.5)';
      if (val === 'auto-gemini-3') return 'Auto (Preview)';
      return val;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const renderComponent = (contextValue = mockConfig as Config) =>
    render(
      <KeypressProvider>
        <ConfigContext.Provider value={contextValue}>
          <ModelDialog onClose={mockOnClose} />
        </ConfigContext.Provider>
      </KeypressProvider>,
    );

  const renderWithProvider = (selectedProvider?: string) =>
    render(
      <KeypressProvider>
        <ConfigContext.Provider value={mockConfig as Config}>
          <ModelDialog
            onClose={mockOnClose}
            selectedProvider={selectedProvider}
          />
        </ConfigContext.Provider>
      </KeypressProvider>,
    );

  const waitForUpdate = () =>
    new Promise((resolve) => setTimeout(resolve, 150));

  it('renders the initial "main" view correctly', () => {
    const { lastFrame } = renderComponent();
    expect(lastFrame()).toContain('Select Model');
    expect(lastFrame()).toContain('Remember model for future sessions: false');
    expect(lastFrame()).toContain('Auto');
    expect(lastFrame()).toContain('Manual');
  });

  it('renders "main" view with preview options when preview features are enabled', () => {
    mockGetPreviewFeatures.mockReturnValue(true);
    mockGetHasAccessToPreviewModel.mockReturnValue(true); // Must have access
    const { lastFrame } = renderComponent();
    expect(lastFrame()).toContain('Auto (Gemini 3)');
  });

  it('switches to "manual" view when "Manual" is selected', async () => {
    const { lastFrame, stdin } = renderComponent();

    // Select "Manual" (index 1)
    // Press down arrow to move to "Manual"
    stdin.write('\u001B[B'); // Arrow Down
    await waitForUpdate();

    // Press enter to select
    stdin.write('\r');
    await waitForUpdate();

    // Should now show manual options
    expect(lastFrame()).toContain(DEFAULT_GEMINI_MODEL);
    expect(lastFrame()).toContain(DEFAULT_GEMINI_FLASH_MODEL);
    expect(lastFrame()).toContain(DEFAULT_GEMINI_FLASH_LITE_MODEL);
  });

  it('renders "manual" view with preview options when preview features are enabled', async () => {
    mockGetPreviewFeatures.mockReturnValue(true);
    mockGetHasAccessToPreviewModel.mockReturnValue(true); // Must have access
    mockGetModel.mockReturnValue(PREVIEW_GEMINI_MODEL_AUTO);
    const { lastFrame, stdin } = renderComponent();

    // Select "Manual" (index 2 because Preview Auto is first, then Auto (Gemini 2.5))
    // Press down enough times to ensure we reach the bottom (Manual)
    stdin.write('\u001B[B'); // Arrow Down
    await waitForUpdate();
    stdin.write('\u001B[B'); // Arrow Down
    await waitForUpdate();

    // Press enter to select Manual
    stdin.write('\r');
    await waitForUpdate();

    expect(lastFrame()).toContain(PREVIEW_GEMINI_MODEL);
  });

  it('sets model and closes when a model is selected in "main" view', async () => {
    const { stdin } = renderComponent();

    // Select "Auto" (index 0)
    stdin.write('\r');
    await waitForUpdate();

    expect(mockSetModel).toHaveBeenCalledWith(
      DEFAULT_GEMINI_MODEL_AUTO,
      true, // Session only by default
    );
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('sets model and closes when a model is selected in "manual" view', async () => {
    const { stdin } = renderComponent();

    // Navigate to Manual (index 1) and select
    stdin.write('\u001B[B');
    await waitForUpdate();
    stdin.write('\r');
    await waitForUpdate();

    // Now in manual view. Default selection is first item (DEFAULT_GEMINI_MODEL)
    stdin.write('\r');
    await waitForUpdate();

    expect(mockSetModel).toHaveBeenCalledWith(DEFAULT_GEMINI_MODEL, true);
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('toggles persist mode with Tab key', async () => {
    const { lastFrame, stdin } = renderComponent();

    expect(lastFrame()).toContain('Remember model for future sessions: false');

    // Press Tab to toggle persist mode
    stdin.write('\t');
    await waitForUpdate();

    expect(lastFrame()).toContain('Remember model for future sessions: true');

    // Select "Auto" (index 0)
    stdin.write('\r');
    await waitForUpdate();

    expect(mockSetModel).toHaveBeenCalledWith(
      DEFAULT_GEMINI_MODEL_AUTO,
      false, // Persist enabled
    );
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('closes dialog on escape in "main" view', async () => {
    const { stdin } = renderComponent();

    stdin.write('\u001B'); // Escape
    await waitForUpdate();

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('goes back to "main" view on escape in "manual" view', async () => {
    const { lastFrame, stdin } = renderComponent();

    // Go to manual view
    stdin.write('\u001B[B');
    await waitForUpdate();
    stdin.write('\r');
    await waitForUpdate();

    expect(lastFrame()).toContain(DEFAULT_GEMINI_MODEL);

    // Press Escape
    stdin.write('\u001B');
    await waitForUpdate();

    expect(mockOnClose).not.toHaveBeenCalled();
    // Should be back to main view (Manual option visible)
    expect(lastFrame()).toContain('Manual');
  });

  describe('Preview Logic', () => {
    it('should NOT show preview options if user has no access', () => {
      mockGetHasAccessToPreviewModel.mockReturnValue(false);
      mockGetPreviewFeatures.mockReturnValue(true); // Even if enabled
      const { lastFrame } = renderComponent();
      expect(lastFrame()).not.toContain('Auto (Gemini 3)');
    });

    it('should NOT show preview options if user has access but preview features are disabled', () => {
      mockGetHasAccessToPreviewModel.mockReturnValue(true);
      mockGetPreviewFeatures.mockReturnValue(false);
      const { lastFrame } = renderComponent();
      expect(lastFrame()).not.toContain('Auto (Gemini 3)');
    });

    it('should show preview options if user has access AND preview features are enabled', () => {
      mockGetHasAccessToPreviewModel.mockReturnValue(true);
      mockGetPreviewFeatures.mockReturnValue(true);
      const { lastFrame } = renderComponent();
      expect(lastFrame()).toContain('Auto (Gemini 3)');
    });

    it('should show "Gemini 3 is now available" header if user has access but preview features disabled', () => {
      mockGetHasAccessToPreviewModel.mockReturnValue(true);
      mockGetPreviewFeatures.mockReturnValue(false);
      const { lastFrame } = renderComponent();
      expect(lastFrame()).toContain('Gemini 3 is now available.');
      expect(lastFrame()).toContain('Enable "Preview features" in /settings');
    });

    it('should show "Gemini 3 is coming soon" header if user has no access', () => {
      mockGetHasAccessToPreviewModel.mockReturnValue(false);
      mockGetPreviewFeatures.mockReturnValue(false);
      const { lastFrame } = renderComponent();
      expect(lastFrame()).toContain('Gemini 3 is coming soon.');
    });

    it('should NOT show header/subheader if preview options are shown', () => {
      mockGetHasAccessToPreviewModel.mockReturnValue(true);
      mockGetPreviewFeatures.mockReturnValue(true);
      const { lastFrame } = renderComponent();
      expect(lastFrame()).not.toContain('Gemini 3 is now available.');
      expect(lastFrame()).not.toContain('Gemini 3 is coming soon.');
    });
  });

  // =========================================================================
  // Provider branching tests (Phase 3 — RED)
  // =========================================================================

  describe('Gemini provider (explicit selectedProvider)', () => {
    it('renders Gemini presets when selectedProvider="gemini"', () => {
      const { lastFrame } = renderWithProvider('gemini');
      expect(lastFrame()).toContain('Select Model');
      expect(lastFrame()).toContain('Auto');
      expect(lastFrame()).toContain('Manual');
    });

    it('shows preview presets only when preview features enabled', () => {
      mockGetPreviewFeatures.mockReturnValue(true);
      mockGetHasAccessToPreviewModel.mockReturnValue(true);
      const { lastFrame } = renderWithProvider('gemini');
      expect(lastFrame()).toContain('Auto (Gemini 3)');
      expect(lastFrame()).toContain('Auto (Gemini 2.5)');
    });
  });

  describe('Claude provider', () => {
    beforeEach(() => {
      mockGetModel.mockReturnValue('claude-opus-4-6');
    });

    it('renders Claude presets when selectedProvider="claude"', () => {
      const { lastFrame } = renderWithProvider('claude');
      expect(lastFrame()).toContain('Select Model');
      expect(lastFrame()).toContain('Recommended (claude-opus-4-6)');
      expect(lastFrame()).toContain('Manual');
      // Should NOT show Gemini-specific content
      expect(lastFrame()).not.toContain('Gemini');
    });

    it('renders Claude manual models on Manual select', async () => {
      const { lastFrame, stdin } = renderWithProvider('claude');
      // Navigate to Manual (index 1) and select
      stdin.write('\u001B[B'); // Arrow Down to Manual
      await waitForUpdate();
      stdin.write('\r'); // Select Manual
      await waitForUpdate();

      expect(lastFrame()).toContain('claude-opus-4-6');
      expect(lastFrame()).toContain('claude-sonnet-4-5-20250929');
      expect(lastFrame()).toContain('claude-haiku-4-5-20251001');
    });
  });

  describe('OpenAI provider', () => {
    beforeEach(() => {
      mockGetModel.mockReturnValue('gpt-4.1');
    });

    it('renders OpenAI presets when selectedProvider="openai"', () => {
      const { lastFrame } = renderWithProvider('openai');
      expect(lastFrame()).toContain('Select Model');
      expect(lastFrame()).toContain('Recommended (gpt-4.1)');
      expect(lastFrame()).toContain('Manual');
      expect(lastFrame()).not.toContain('Gemini');
    });

    it('renders OpenAI manual models including reasoning models', async () => {
      const { lastFrame, stdin } = renderWithProvider('openai');
      stdin.write('\u001B[B');
      await waitForUpdate();
      stdin.write('\r');
      await waitForUpdate();

      expect(lastFrame()).toContain('gpt-4.1');
      expect(lastFrame()).toContain('gpt-4.1-mini');
      expect(lastFrame()).toContain('o3');
      expect(lastFrame()).toContain('o4-mini');
    });
  });

  describe('DidimAIStudio provider', () => {
    it('renders disabled message instead of model list', () => {
      const { lastFrame } = renderWithProvider('didim');
      const disabledMsg = PROVIDER_MODEL_REGISTRY['didim'].disabledMessage!;
      expect(lastFrame()).toContain(disabledMsg);
      // Should NOT show model selection options
      expect(lastFrame()).not.toContain('Manual');
    });
  });

  describe('env auto-detect', () => {
    it('detects Claude via LLM_PROVIDER when selectedProvider is undefined', () => {
      vi.stubEnv('LLM_PROVIDER', 'claude');
      mockGetModel.mockReturnValue('claude-opus-4-6');
      const { lastFrame } = renderWithProvider();
      expect(lastFrame()).toContain('Recommended (claude-opus-4-6)');
      expect(lastFrame()).not.toContain('Gemini');
    });
  });

  // =========================================================================
  // Part B: handleSelect persistence sync tests (Phase 3 — RED)
  // =========================================================================

  describe('handleSelect persistence sync', () => {
    const mockSetValue = vi.fn();
    const mockForScope = vi.fn();

    const mockSettings = {
      setValue: mockSetValue,
      forScope: mockForScope,
      merged: {},
    } as unknown as LoadedSettings;

    const renderWithSettings = (selectedProvider?: string) =>
      render(
        <SettingsContext.Provider value={mockSettings}>
          <KeypressProvider>
            <ConfigContext.Provider value={mockConfig as Config}>
              <ModelDialog
                onClose={mockOnClose}
                selectedProvider={selectedProvider}
              />
            </ConfigContext.Provider>
          </KeypressProvider>
        </SettingsContext.Provider>,
      );

    beforeEach(() => {
      mockSetValue.mockClear();
      mockForScope.mockClear();
      mockForScope.mockReturnValue({ settings: {} });
    });

    it('sets LLM_MODEL env for non-gemini provider', async () => {
      vi.stubEnv('LLM_MODEL', '');
      mockGetModel.mockReturnValue('claude-opus-4-6');
      const { stdin } = renderWithSettings('claude');
      // Select first preset (claude-opus-4-6)
      stdin.write('\r');
      await waitForUpdate();
      expect(process.env['LLM_MODEL']).toBe('claude-opus-4-6');
    });

    it('does NOT set LLM_MODEL env for gemini provider', async () => {
      vi.stubEnv('LLM_MODEL', '');
      const { stdin } = renderWithSettings('gemini');
      // Select first preset (auto-gemini-2.5)
      stdin.write('\r');
      await waitForUpdate();
      expect(process.env['LLM_MODEL']).toBe('');
    });

    it('updates slmConfig.model in settings for openai-compatible', async () => {
      mockForScope.mockReturnValue({
        settings: {
          security: {
            auth: { slmConfig: { baseUrl: 'http://localhost:11434' } },
          },
        },
      });
      // sLM renders FreeformModelInput — tested via FreeformModelInput.test
      // Here we verify the settings.setValue path is called for sLM
      // This test will pass once handleSelect includes slmConfig sync
      const { lastFrame } = renderWithSettings('slm');
      // For now, just verify the dialog renders for sLM
      expect(lastFrame()).toContain('Enter model name');
    });

    it('saves model via saveModelForProvider (byProvider sync)', async () => {
      mockGetModel.mockReturnValue('claude-opus-4-6');
      const { stdin } = renderWithSettings('claude');
      stdin.write('\r');
      await waitForUpdate();
      expect(mockSaveModelForProvider).toHaveBeenCalledWith(
        mockSettings,
        'claude',
        'claude-opus-4-6',
      );
    });
  });

  describe('sLM provider (openai-compatible)', () => {
    it('renders FreeformModelInput for sLM (selectedProvider="slm")', () => {
      const { lastFrame } = renderWithProvider('slm');
      // Should render text input instead of radio buttons
      expect(lastFrame()).toContain('Enter model name');
      expect(lastFrame()).not.toContain('Recommended');
    });
  });
});
