/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ApiAuthDialog } from './ApiAuthDialog.js';
import { useKeypress } from '../hooks/useKeypress.js';
import {
  useTextBuffer,
  type TextBuffer,
} from '../components/shared/text-buffer.js';
import { clearProviderApiKey } from '@didim365/agent-cli-core';

// Mocks
vi.mock('@didim365/agent-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@didim365/agent-cli-core')>();
  return {
    ...actual,
    clearProviderApiKey: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('./providerMetadata.js', () => ({
  getProviderDisplayInfo: vi.fn((provider?: string) => {
    const map: Record<
      string,
      {
        label: string;
        description: string;
        envVarName: string;
        apiKeyUrl: string;
        providerType: string;
        keychainEntry: string;
      }
    > = {
      gemini: {
        providerType: 'gemini',
        label: 'Gemini',
        description: 'Google AI',
        envVarName: 'GEMINI_API_KEY',
        apiKeyUrl: 'https://aistudio.google.com/app/apikey',
        keychainEntry: 'default-api-key',
      },
      claude: {
        providerType: 'claude',
        label: 'Claude',
        description: 'Anthropic',
        envVarName: 'ANTHROPIC_API_KEY',
        apiKeyUrl: 'https://console.anthropic.com/settings/keys',
        keychainEntry: 'claude-api-key',
      },
      openai: {
        providerType: 'openai',
        label: 'OpenAI',
        description: 'OpenAI',
        envVarName: 'OPENAI_API_KEY',
        apiKeyUrl: 'https://platform.openai.com/api-keys',
        keychainEntry: 'openai-api-key',
      },
    };
    return map[provider ?? 'gemini'] ?? map['gemini'];
  }),
}));

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../components/shared/text-buffer.js', () => ({
  useTextBuffer: vi.fn(),
}));

vi.mock('../contexts/UIStateContext.js', () => ({
  useUIState: vi.fn(() => ({
    terminalWidth: 80,
  })),
}));

const mockedUseKeypress = useKeypress as Mock;
const mockedUseTextBuffer = useTextBuffer as Mock;

describe('ApiAuthDialog', () => {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  let mockBuffer: TextBuffer;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('GEMINI_API_KEY', '');
    mockBuffer = {
      text: '',
      lines: [''],
      cursor: [0, 0],
      visualCursor: [0, 0],
      viewportVisualLines: [''],
      handleInput: vi.fn(),
      setText: vi.fn((newText) => {
        mockBuffer.text = newText;
        mockBuffer.viewportVisualLines = [newText];
      }),
    } as unknown as TextBuffer;
    mockedUseTextBuffer.mockReturnValue(mockBuffer);
  });

  it('renders correctly', () => {
    const { lastFrame } = render(
      <ApiAuthDialog onSubmit={onSubmit} onCancel={onCancel} />,
    );
    expect(lastFrame()).toMatchSnapshot();
  });

  it('renders with a defaultValue', () => {
    render(
      <ApiAuthDialog
        onSubmit={onSubmit}
        onCancel={onCancel}
        defaultValue="test-key"
      />,
    );
    expect(mockedUseTextBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        initialText: 'test-key',
        viewport: expect.objectContaining({
          height: 4,
        }),
      }),
    );
  });

  it.each([
    {
      keyName: 'return',
      sequence: '\r',
      expectedCall: onSubmit,
      args: ['submitted-key'],
    },
    { keyName: 'escape', sequence: '\u001b', expectedCall: onCancel, args: [] },
  ])(
    'calls $expectedCall.name when $keyName is pressed',
    ({ keyName, sequence, expectedCall, args }) => {
      mockBuffer.text = 'submitted-key'; // Set for the onSubmit case
      render(<ApiAuthDialog onSubmit={onSubmit} onCancel={onCancel} />);
      // calls[0] is the ApiAuthDialog's useKeypress (Ctrl+C handler)
      // calls[1] is the TextInput's useKeypress (typing handler)
      const keypressHandler = mockedUseKeypress.mock.calls[1][0];

      keypressHandler({
        name: keyName,
        shift: false,
        ctrl: false,
        cmd: false,
        sequence,
      });

      expect(expectedCall).toHaveBeenCalledWith(...args);
    },
  );

  it('displays an error message', () => {
    const { lastFrame } = render(
      <ApiAuthDialog
        onSubmit={onSubmit}
        onCancel={onCancel}
        error="Invalid API Key"
      />,
    );

    expect(lastFrame()).toContain('Invalid API Key');
  });

  it('calls clearProviderApiKey and clears buffer when Ctrl+C is pressed', async () => {
    render(<ApiAuthDialog onSubmit={onSubmit} onCancel={onCancel} />);
    // calls[0] is the ApiAuthDialog's useKeypress (Ctrl+C handler)
    const keypressHandler = mockedUseKeypress.mock.calls[0][0];

    await keypressHandler({
      name: 'c',
      shift: false,
      ctrl: true,
      cmd: false,
    });

    expect(clearProviderApiKey).toHaveBeenCalledWith('gemini');
    expect(mockBuffer.setText).toHaveBeenCalledWith('');
  });

  describe('provider-aware rendering', () => {
    it('renders Claude title and URL when provider is claude', () => {
      const { lastFrame } = render(
        <ApiAuthDialog
          onSubmit={onSubmit}
          onCancel={onCancel}
          provider="claude"
        />,
      );
      expect(lastFrame()).toContain('Enter Claude API Key');
      expect(lastFrame()).toContain('Claude API key');
      expect(lastFrame()).toContain(
        'https://console.anthropic.com/settings/keys',
      );
    });

    it('renders OpenAI title and URL when provider is openai', () => {
      const { lastFrame } = render(
        <ApiAuthDialog
          onSubmit={onSubmit}
          onCancel={onCancel}
          provider="openai"
        />,
      );
      expect(lastFrame()).toContain('Enter OpenAI API Key');
      expect(lastFrame()).toContain('OpenAI API key');
      expect(lastFrame()).toContain('https://platform.openai.com/api-keys');
    });

    it('renders Gemini title by default when no provider specified', () => {
      const { lastFrame } = render(
        <ApiAuthDialog onSubmit={onSubmit} onCancel={onCancel} />,
      );
      expect(lastFrame()).toContain('Enter Gemini API Key');
      expect(lastFrame()).toContain('Gemini API key');
    });

    it('calls clearProviderApiKey with claude when provider is claude', async () => {
      render(
        <ApiAuthDialog
          onSubmit={onSubmit}
          onCancel={onCancel}
          provider="claude"
        />,
      );
      const keypressHandler = mockedUseKeypress.mock.calls[0][0];

      await keypressHandler({
        name: 'c',
        shift: false,
        ctrl: true,
        cmd: false,
      });

      expect(clearProviderApiKey).toHaveBeenCalledWith('claude');
    });
  });
});
