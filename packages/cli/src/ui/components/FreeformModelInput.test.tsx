/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { FreeformModelInput } from './FreeformModelInput.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { useTextBuffer, type TextBuffer } from './shared/text-buffer.js';
import { act } from 'react';

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('./shared/text-buffer.js', () => ({
  useTextBuffer: vi.fn(),
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

/** Simulate pressing Enter in TextInput by calling the captured useKeypress handler */
function pressEnterInTextInput() {
  const keypressCalls = mockedUseKeypress.mock.calls;
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

/** Simulate pressing Escape in TextInput */
function pressEscapeInTextInput() {
  const keypressCalls = mockedUseKeypress.mock.calls;
  const textInputKeypress = keypressCalls[keypressCalls.length - 1];
  if (textInputKeypress) {
    textInputKeypress[0]({
      name: 'escape',
      shift: false,
      ctrl: false,
      cmd: false,
      sequence: '\u001b',
    });
  }
}

describe('<FreeformModelInput />', () => {
  const mockOnSelect = vi.fn();
  const mockOnClose = vi.fn();
  let mockBuffer: TextBuffer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockBuffer = createMockBuffer();
    mockedUseTextBuffer.mockReturnValue(mockBuffer);
  });

  it('renders text input with prompt', () => {
    const { lastFrame } = render(
      <FreeformModelInput onSelect={mockOnSelect} onClose={mockOnClose} />,
    );
    expect(lastFrame()).toContain('Enter model name');
  });

  it('displays current model when provided', () => {
    const { lastFrame } = render(
      <FreeformModelInput
        onSelect={mockOnSelect}
        onClose={mockOnClose}
        currentModel="llama3"
      />,
    );
    expect(lastFrame()).toContain('llama3');
  });

  it('calls onSelect with entered text on Enter', () => {
    mockBuffer.text = 'my-custom-model';
    render(
      <FreeformModelInput onSelect={mockOnSelect} onClose={mockOnClose} />,
    );
    act(() => {
      pressEnterInTextInput();
    });
    expect(mockOnSelect).toHaveBeenCalledWith('my-custom-model');
  });

  it('calls onClose on Escape', () => {
    render(
      <FreeformModelInput onSelect={mockOnSelect} onClose={mockOnClose} />,
    );
    act(() => {
      pressEscapeInTextInput();
    });
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('does not call onSelect with empty input on Enter', () => {
    mockBuffer.text = '';
    render(
      <FreeformModelInput onSelect={mockOnSelect} onClose={mockOnClose} />,
    );
    act(() => {
      pressEnterInTextInput();
    });
    expect(mockOnSelect).not.toHaveBeenCalled();
  });
});
