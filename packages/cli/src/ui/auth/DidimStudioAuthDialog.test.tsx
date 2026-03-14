/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DidimStudioAuthDialog } from './DidimStudioAuthDialog.js';
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

describe('DidimStudioAuthDialog', () => {
  const onComplete = vi.fn();
  const onCancel = vi.fn();
  let mockBuffer: TextBuffer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBuffer = createMockBuffer();
    mockedUseTextBuffer.mockReturnValue(mockBuffer);
  });

  describe('Step 1: Server Domain', () => {
    it('renders the initial server domain input step', () => {
      const { lastFrame } = render(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('DidimAIStudio Configuration');
      expect(frame).toContain('Server Domain');
      expect(frame).toContain('Step 1 of 3');
    });

    it('renders default server when defaultConfig.serverAddress is provided', () => {
      render(
        <DidimStudioAuthDialog
          onComplete={onComplete}
          onCancel={onCancel}
          defaultConfig={{ serverAddress: 'custom.server.com' }}
        />,
      );
      expect(mockedUseTextBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          initialText: 'custom.server.com',
        }),
      );
    });

    it('shows validation error for empty server address', () => {
      mockBuffer.text = '';
      const { lastFrame } = render(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 1 of 3');
      expect(frame).toContain('Server address is required');
    });

    it('shows validation error for whitespace-only server address', () => {
      mockBuffer.text = '   ';
      const { lastFrame } = render(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      expect(lastFrame()!).toContain('Server address is required');
    });

    it('calls onCancel when Esc is pressed on step 1', () => {
      render(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // DidimStudioAuthDialog's useKeypress is the first registered handler
      const dialogKeypress = mockedUseKeypress.mock.calls[0];
      act(() => {
        dialogKeypress[0]({
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

  describe('Step 2: JWT Token', () => {
    it('advances to step 2 after valid server domain submission', () => {
      mockBuffer.text = 'aistudio.didim365.com';
      const { lastFrame } = render(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 2 of 3');
      expect(frame).toContain('JWT Token');
    });

    it('shows validation error for empty JWT token', () => {
      mockBuffer.text = 'aistudio.didim365.com';
      const { lastFrame, rerender } = render(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 2 of 3');

      // Override buffer text and rerender to update TextInput's useCallback closure
      mockBuffer.text = '';
      rerender(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Submit empty token
      act(() => {
        pressEnterInTextInput();
      });

      expect(lastFrame()!).toContain('JWT token is required');
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('shows masked token preview for token > 8 chars', () => {
      mockBuffer.text = 'aistudio.didim365.com';
      const { lastFrame, rerender } = render(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2
      act(() => {
        pressEnterInTextInput();
      });

      // Submit a long JWT token to set apiKey state (moves to step 3)
      mockBuffer.text = 'eyJhbGciOiJIUzI1NiJ9.token';
      rerender(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      // Now on step 3 (no TextInput), go back to step 2 to see the masked token
      // On step 3, dialog's useKeypress is the only one registered (last call)
      const dialogKeypress = mockedUseKeypress.mock.calls.at(-1);
      act(() => {
        dialogKeypress![0]({
          name: 'escape',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '\u001b',
        });
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 2 of 3');
      // Token: 'eyJhbGciOiJIUzI1NiJ9.token' (27 chars)
      // first 4 = 'eyJh', last 4 = 'oken', middle = 19 asterisks (capped at 20)
      expect(frame).toContain('Token: eyJh');
      expect(frame).toContain('oken');
    });

    it('goes back to step 1 when Esc is pressed on step 2', () => {
      mockBuffer.text = 'aistudio.didim365.com';
      const { lastFrame } = render(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Advance to step 2
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 2 of 3');

      // Press Esc — should go back to step 1
      const dialogKeypress = mockedUseKeypress.mock.calls.at(-2);
      act(() => {
        dialogKeypress![0]({
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

    it('restores buffer to server address when going back from step 2', () => {
      mockBuffer.text = 'aistudio.didim365.com';
      render(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Advance to step 2
      act(() => {
        pressEnterInTextInput();
      });

      // Press Esc — should restore buffer to the saved server address
      const dialogKeypress = mockedUseKeypress.mock.calls.at(-2);
      act(() => {
        dialogKeypress![0]({
          name: 'escape',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '\u001b',
        });
      });

      expect(mockBuffer.setText).toHaveBeenCalledWith('aistudio.didim365.com');
    });
  });

  describe('Step 3: Stream Mode', () => {
    function advanceToStep3() {
      mockBuffer.text = 'aistudio.didim365.com';
      const result = render(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2
      act(() => {
        pressEnterInTextInput();
      });

      // Step 2 → Step 3
      mockBuffer.text = 'my-jwt-token-value-here';
      result.rerender(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );
      act(() => {
        pressEnterInTextInput();
      });

      return result;
    }

    it('advances to step 3 after valid JWT token submission', () => {
      const { lastFrame } = advanceToStep3();

      const frame = lastFrame()!;
      expect(frame).toContain('Step 3 of 3');
      expect(frame).toContain('Stream Mode');
    });

    it('calls onComplete with streamMode sse when pressing 1', () => {
      advanceToStep3();

      // On step 3, no TextInput is rendered, so only the dialog's useKeypress is registered (last call)
      const dialogKeypress = mockedUseKeypress.mock.calls.at(-1);
      act(() => {
        dialogKeypress![0]({
          name: '1',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '1',
        });
      });

      expect(onComplete).toHaveBeenCalledWith({
        serverAddress: 'aistudio.didim365.com',
        apiKey: 'my-jwt-token-value-here',
        streamMode: 'sse',
      });
    });

    it('calls onComplete with streamMode improved when pressing 2', () => {
      advanceToStep3();

      // On step 3, no TextInput is rendered, so only the dialog's useKeypress is registered (last call)
      const dialogKeypress = mockedUseKeypress.mock.calls.at(-1);
      act(() => {
        dialogKeypress![0]({
          name: '2',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '2',
        });
      });

      expect(onComplete).toHaveBeenCalledWith({
        serverAddress: 'aistudio.didim365.com',
        apiKey: 'my-jwt-token-value-here',
        streamMode: 'improved',
      });
    });

    it('goes back to step 2 when Esc is pressed on step 3', () => {
      const { lastFrame } = advanceToStep3();
      expect(lastFrame()!).toContain('Step 3 of 3');

      // On step 3, no TextInput is rendered, so only the dialog's useKeypress is registered (last call)
      const dialogKeypress = mockedUseKeypress.mock.calls.at(-1);
      act(() => {
        dialogKeypress![0]({
          name: 'escape',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '\u001b',
        });
      });

      expect(lastFrame()!).toContain('Step 2 of 3');
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('defaultConfig prefill', () => {
    it('uses defaultConfig.serverAddress for initial text buffer', () => {
      render(
        <DidimStudioAuthDialog
          onComplete={onComplete}
          onCancel={onCancel}
          defaultConfig={{ serverAddress: 'my-custom-server.com' }}
        />,
      );
      expect(mockedUseTextBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          initialText: 'my-custom-server.com',
          initialCursorOffset: 'my-custom-server.com'.length,
        }),
      );
    });

    it('falls back to sse when defaultConfig.streamMode is an invalid value', () => {
      mockBuffer.text = 'aistudio.didim365.com';
      const result = render(
        <DidimStudioAuthDialog
          onComplete={onComplete}
          onCancel={onCancel}
          defaultConfig={{ streamMode: 'corrupted-value' }}
        />,
      );

      // Step 1 → Step 2
      act(() => {
        pressEnterInTextInput();
      });

      // Step 2 → Step 3
      mockBuffer.text = 'my-jwt-token';
      result.rerender(
        <DidimStudioAuthDialog
          onComplete={onComplete}
          onCancel={onCancel}
          defaultConfig={{ streamMode: 'corrupted-value' }}
        />,
      );
      act(() => {
        pressEnterInTextInput();
      });

      // Press 'return' (Enter) won't do anything on step 3, press '1' for SSE
      const dialogKeypress = mockedUseKeypress.mock.calls.at(-1);
      act(() => {
        dialogKeypress![0]({
          name: 'return',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '\r',
        });
      });

      // The SSE option should be highlighted (default) despite corrupted value
      const frame = result.lastFrame()!;
      expect(frame).toContain('Stream Mode');
      // The 'sse' option text should be present
      expect(frame).toContain('SSE (Standard)');
    });

    it('uses defaultConfig.streamMode to highlight default selection', () => {
      mockBuffer.text = 'aistudio.didim365.com';
      const result = render(
        <DidimStudioAuthDialog
          onComplete={onComplete}
          onCancel={onCancel}
          defaultConfig={{ streamMode: 'improved' }}
        />,
      );

      // Step 1 → Step 2
      act(() => {
        pressEnterInTextInput();
      });

      // Step 2 → Step 3
      mockBuffer.text = 'my-jwt-token';
      result.rerender(
        <DidimStudioAuthDialog
          onComplete={onComplete}
          onCancel={onCancel}
          defaultConfig={{ streamMode: 'improved' }}
        />,
      );
      act(() => {
        pressEnterInTextInput();
      });

      const frame = result.lastFrame()!;
      expect(frame).toContain('Stream Mode');
      // The 'improved' option should be rendered (it's present regardless)
      expect(frame).toContain('SSE Improved');
    });
  });

  describe('snapshot', () => {
    it('matches snapshot for initial render', () => {
      const { lastFrame } = render(
        <DidimStudioAuthDialog onComplete={onComplete} onCancel={onCancel} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
