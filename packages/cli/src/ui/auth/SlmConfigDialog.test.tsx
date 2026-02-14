/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { SlmConfigDialog } from './SlmConfigDialog.js';
import { useKeypress } from '../hooks/useKeypress.js';
import {
  useTextBuffer,
  type TextBuffer,
} from '../components/shared/text-buffer.js';
import { act } from 'react';

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

function createMockBuffer(initialText = ''): TextBuffer {
  const buffer = {
    text: initialText,
    lines: [initialText],
    cursor: [0, 0],
    visualCursor: [0, 0],
    viewportVisualLines: [initialText],
    handleInput: vi.fn(),
    setText: vi.fn((newText: string) => {
      buffer.text = newText;
      buffer.viewportVisualLines = [newText];
    }),
  } as unknown as TextBuffer;
  return buffer;
}

/** Simulate pressing Enter in TextInput by calling the onSubmit callback */
function pressEnterInTextInput() {
  const keypressCalls = mockedUseKeypress.mock.calls;
  // TextInput's useKeypress is the last registered handler
  const textInputKeypress = keypressCalls[keypressCalls.length - 1];
  if (textInputKeypress) {
    textInputKeypress[0]({
      name: 'return',
      shift: false,
      ctrl: false,
      cmd: false,
      sequence: '\r',
    });
  }
}

describe('SlmConfigDialog', () => {
  const onComplete = vi.fn();
  const onCancel = vi.fn();
  let mockBuffer: TextBuffer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBuffer = createMockBuffer();
    mockedUseTextBuffer.mockReturnValue(mockBuffer);
  });

  describe('Step A: API Endpoint URL', () => {
    it('renders the initial endpoint URL input step', () => {
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('sLM Configuration');
      expect(frame).toContain('API Endpoint URL');
      expect(frame).toContain('Step 1 of 3');
    });

    it('renders default URL when defaultConfig.baseUrl is provided', () => {
      render(
        <SlmConfigDialog
          onComplete={onComplete}
          onCancel={onCancel}
          defaultConfig={{ baseUrl: 'http://localhost:11434/v1' }}
        />,
      );
      expect(mockedUseTextBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          initialText: 'http://localhost:11434/v1',
        }),
      );
    });

    it('shows validation error for URL without http/https prefix', () => {
      mockBuffer.text = 'invalid-url';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      // Should still be on Step 1 and show validation error
      expect(frame).toContain('Step 1 of 3');
      expect(frame).toContain('URL must start with http:// or https://');
    });

    it('does not show validation error for empty URL submit', () => {
      mockBuffer.text = '';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 1 of 3');
      expect(frame).toContain('URL must start with http:// or https://');
    });

    it('calls onCancel when Esc is pressed on step 1', () => {
      render(<SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />);

      // SlmConfigDialog's useKeypress is the first registered handler
      const slmKeypress = mockedUseKeypress.mock.calls[0];
      act(() => {
        slmKeypress[0]({
          name: 'escape',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '\u001b',
        });
      });

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Step B: API Key + Model', () => {
    it('advances to step 2 after valid URL submission', () => {
      mockBuffer.text = 'http://localhost:11434/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 2 of 3');
      expect(frame).toContain('API Key (optional)');
      expect(frame).toContain('Model Name (optional)');
    });

    it('accepts https URLs', () => {
      mockBuffer.text = 'https://api.example.com/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 2 of 3');
    });

    it('goes back to step 1 when Esc is pressed on step 2', () => {
      mockBuffer.text = 'http://localhost:11434/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Advance to step 2
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 2 of 3');

      // Press Esc — should go back to step 1
      const slmKeypress = mockedUseKeypress.mock.calls.at(-2); // SlmConfigDialog's handler (re-registered)
      act(() => {
        slmKeypress![0]({
          name: 'escape',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '\u001b',
        });
      });

      expect(lastFrame()!).toContain('Step 1 of 3');
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('Step C: Advanced + Completion', () => {
    it('advances to step 3 after step 2 submission', () => {
      mockBuffer.text = 'http://localhost:11434/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 2 of 3');

      // Step 2 → Step 3
      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 3 of 3');
      expect(frame).toContain('API Key Header Name (optional)');
      expect(frame).toContain('Custom Headers (optional)');
    });

    it('calls onComplete with baseUrl-only config when optional fields are empty', () => {
      mockBuffer.text = 'http://localhost:11434/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2
      act(() => {
        pressEnterInTextInput();
      });
      // Step 2 → Step 3 (no API key/model entered)
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 3 of 3');

      // Step 3 → Complete (no advanced settings)
      act(() => {
        pressEnterInTextInput();
      });

      expect(onComplete).toHaveBeenCalledWith({
        baseUrl: 'http://localhost:11434/v1',
      });
    });
  });

  describe('snapshot', () => {
    it('matches snapshot for initial render', () => {
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
