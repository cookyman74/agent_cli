/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { VertexConfigDialog } from './VertexConfigDialog.js';
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

describe('VertexConfigDialog', () => {
  const onComplete = vi.fn();
  const onCancel = vi.fn();
  let mockBuffer: TextBuffer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBuffer = createMockBuffer();
    mockedUseTextBuffer.mockReturnValue(mockBuffer);
  });

  describe('Step 1: Project ID', () => {
    it('renders the initial project ID input step', () => {
      const { lastFrame } = render(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );
      const frame = lastFrame()!;
      expect(frame).toContain('Vertex AI Configuration');
      expect(frame).toContain('Google Cloud Project ID');
      expect(frame).toContain('Step 1 of 2');
    });

    it('renders default project when defaultConfig.project is provided', () => {
      render(
        <VertexConfigDialog
          onComplete={onComplete}
          onCancel={onCancel}
          defaultConfig={{ project: 'my-gcp-project' }}
        />,
      );
      expect(mockedUseTextBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          initialText: 'my-gcp-project',
        }),
      );
    });

    it('shows validation error for empty project ID', () => {
      mockBuffer.text = '';
      const { lastFrame } = render(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 1 of 2');
      expect(frame).toContain('Project ID is required');
    });

    it('shows validation error for whitespace-only project ID', () => {
      mockBuffer.text = '   ';
      const { lastFrame } = render(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      expect(lastFrame()!).toContain('Project ID is required');
    });

    it('calls onCancel when Esc is pressed on step 1', () => {
      render(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // VertexConfigDialog's useKeypress is the first registered handler
      const vertexKeypress = mockedUseKeypress.mock.calls[0];
      act(() => {
        vertexKeypress[0]({
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

  describe('Step 2: Location', () => {
    it('advances to step 2 after valid project ID submission', () => {
      mockBuffer.text = 'my-gcp-project';
      const { lastFrame } = render(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 2 of 2');
      expect(frame).toContain('Google Cloud Location');
    });

    it('pre-fills default location us-central1', () => {
      mockBuffer.text = 'my-gcp-project';
      render(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      // After advancing to step 2, buffer.setText should be called with default location
      expect(mockBuffer.setText).toHaveBeenCalledWith('us-central1');
    });

    it('pre-fills location from defaultConfig', () => {
      mockBuffer.text = 'my-gcp-project';
      render(
        <VertexConfigDialog
          onComplete={onComplete}
          onCancel={onCancel}
          defaultConfig={{ location: 'europe-west1' }}
        />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      expect(mockBuffer.setText).toHaveBeenCalledWith('europe-west1');
    });

    it('shows validation error for whitespace-only location', () => {
      mockBuffer.text = 'my-gcp-project';
      const { lastFrame, rerender } = render(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 2 of 2');

      // Override buffer text and rerender to update TextInput's useCallback closure
      mockBuffer.text = '   ';
      rerender(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Submit whitespace-only location
      act(() => {
        pressEnterInTextInput();
      });

      expect(lastFrame()!).toContain('Location is required');
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('goes back to step 1 when Esc is pressed on step 2', () => {
      mockBuffer.text = 'my-gcp-project';
      const { lastFrame } = render(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Advance to step 2
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 2 of 2');

      // Press Esc — should go back to step 1
      const vertexKeypress = mockedUseKeypress.mock.calls.at(-2);
      act(() => {
        vertexKeypress![0]({
          name: 'escape',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '\u001b',
        });
      });

      expect(lastFrame()!).toContain('Step 1 of 2');
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('restores buffer to project value when Esc is pressed on step 2', () => {
      mockBuffer.text = 'my-gcp-project';
      render(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Advance to step 2 (buffer.setText is called with 'us-central1')
      act(() => {
        pressEnterInTextInput();
      });
      expect(mockBuffer.setText).toHaveBeenCalledWith('us-central1');

      // Press Esc — should restore buffer to the saved project value
      const vertexKeypress = mockedUseKeypress.mock.calls.at(-2);
      act(() => {
        vertexKeypress![0]({
          name: 'escape',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '\u001b',
        });
      });

      expect(mockBuffer.setText).toHaveBeenCalledWith('my-gcp-project');
    });
  });

  describe('Completion', () => {
    it('calls onComplete with project and location', () => {
      mockBuffer.text = 'my-gcp-project';
      const { lastFrame, rerender } = render(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 2 of 2');

      // Override buffer text and rerender to update TextInput's useCallback closure
      mockBuffer.text = 'europe-west1';
      rerender(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Submit location
      act(() => {
        pressEnterInTextInput();
      });

      expect(onComplete).toHaveBeenCalledWith({
        project: 'my-gcp-project',
        location: 'europe-west1',
      });
    });

    it('calls onComplete with default location when unchanged', () => {
      mockBuffer.text = 'my-gcp-project';
      render(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2
      act(() => {
        pressEnterInTextInput();
      });

      // Submit with default location (buffer was set to 'us-central1')
      mockBuffer.text = 'us-central1';
      act(() => {
        pressEnterInTextInput();
      });

      expect(onComplete).toHaveBeenCalledWith({
        project: 'my-gcp-project',
        location: 'us-central1',
      });
    });
  });

  describe('snapshot', () => {
    it('matches snapshot for initial render', () => {
      const { lastFrame } = render(
        <VertexConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
