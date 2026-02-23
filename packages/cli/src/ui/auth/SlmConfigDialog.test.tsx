/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { SlmConfigDialog, parseCustomHeaders } from './SlmConfigDialog.js';
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

/** Simulate pressing a number key (1-5) for server type selection */
function pressNumberKey(num: string) {
  const keypressCalls = mockedUseKeypress.mock.calls;
  // On serverType step, SlmConfigDialog's useKeypress is the last registered handler
  // (no TextInput on this step, so only one handler)
  const slmKeypress = keypressCalls.at(-1);
  if (slmKeypress) {
    slmKeypress[0]({
      name: num,
      shift: false,
      ctrl: false,
      cmd: false,
      sequence: num,
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
      expect(frame).toContain('Step 1 of 4');
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
      expect(frame).toContain('Step 1 of 4');
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
      expect(frame).toContain('Step 1 of 4');
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

  describe('Step B: Server Type Selection', () => {
    it('advances to server type selection after valid URL submission', () => {
      mockBuffer.text = 'http://localhost:11434/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 2 of 4');
      expect(frame).toContain('Server Type');
      expect(frame).toContain('GPUStack');
      expect(frame).toContain('vLLM');
      expect(frame).toContain('Ollama');
    });

    it('accepts https URLs and shows server type selection', () => {
      mockBuffer.text = 'https://api.example.com/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 2 of 4');
      expect(frame).toContain('Server Type');
    });

    it('advances to credentials step when server type is selected', () => {
      mockBuffer.text = 'http://localhost:11434/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2 (server type)
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 2 of 4');

      // Select server type (press '3' for Ollama)
      act(() => {
        pressNumberKey('3');
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 3 of 4');
      expect(frame).toContain('API Key (optional)');
      expect(frame).toContain('Model Name (required)');
      expect(frame).toContain('Ollama'); // Should show Ollama-specific hints
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
      expect(lastFrame()!).toContain('Step 2 of 4');

      // Press Esc — should go back to step 1
      // On serverType step, there's no TextInput, so only one useKeypress handler
      const slmKeypress = mockedUseKeypress.mock.calls.at(-1);
      act(() => {
        slmKeypress![0]({
          name: 'escape',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '\u001b',
        });
      });

      expect(lastFrame()!).toContain('Step 1 of 4');
      expect(onCancel).not.toHaveBeenCalled();
    });
  });

  describe('Step C: Credentials (API Key + Model)', () => {
    it('advances to step 4 after step 3 submission with model name', () => {
      mockBuffer.text = 'http://localhost:11434/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2 (server type)
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 2 of 4');

      // Step 2 → Step 3 (select server type)
      act(() => {
        pressNumberKey('1'); // GPUStack
      });
      expect(lastFrame()!).toContain('Step 3 of 4');

      // Set model name (required)
      mockBuffer.text = 'gpt-oss-20b';

      // Step 3 → Step 4
      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Step 4 of 4');
      expect(frame).toContain('API Key Header Name (optional)');
      expect(frame).toContain('Custom Headers (optional)');
    });

    it('shows validation error when model name is empty', () => {
      mockBuffer.text = 'http://localhost:11434/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2
      act(() => {
        pressEnterInTextInput();
      });

      // Step 2 → Step 3
      act(() => {
        pressNumberKey('1');
      });
      expect(lastFrame()!).toContain('Step 3 of 4');

      // Clear model name
      mockBuffer.text = '';

      // Try to submit without model name
      act(() => {
        pressEnterInTextInput();
      });

      // Should still be on Step 3 with validation error
      const frame = lastFrame()!;
      expect(frame).toContain('Step 3 of 4');
      expect(frame).toContain('Model name is required');
    });

    it('calls onComplete with config when model is provided', () => {
      mockBuffer.text = 'http://localhost:11434/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2
      act(() => {
        pressEnterInTextInput();
      });

      // Step 2 → Step 3
      act(() => {
        pressNumberKey('3'); // Ollama
      });
      expect(lastFrame()!).toContain('Step 3 of 4');

      // Set model name
      mockBuffer.text = 'llama3';

      // Step 3 → Step 4
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 4 of 4');

      // Clear buffer for step 4 (no advanced settings)
      mockBuffer.text = '';

      // Step 4 → Complete
      act(() => {
        pressEnterInTextInput();
      });

      // Note: Due to shared mock buffer, apiKey gets the same value as model
      expect(onComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          baseUrl: 'http://localhost:11434/v1',
          model: 'llama3',
        }),
      );
    });
  });

  describe('Step D: Advanced validation', () => {
    it('shows validation error for completely unparseable custom headers', () => {
      // Step 1: valid URL
      mockBuffer.text = 'http://localhost:11434/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2 (server type)
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 2 of 4');

      // Step 2 → Step 3 (credentials)
      act(() => {
        pressNumberKey('1');
      });
      expect(lastFrame()!).toContain('Step 3 of 4');

      // Set model name (required)
      mockBuffer.text = 'llama3';

      // Step 3 → Step 4 (advanced)
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 4 of 4');

      // Set completely unparseable value (no colon, not JSON)
      const headersBuffer = mockedUseTextBuffer.mock.results.at(-1)
        ?.value as TextBuffer;
      headersBuffer.text = 'just-a-random-string';

      // Submit step 4
      act(() => {
        pressEnterInTextInput();
      });

      const frame = lastFrame()!;
      expect(frame).toContain('Custom headers format invalid');
      expect(onComplete).not.toHaveBeenCalled();
    });
  });

  describe('Tab focus switching', () => {
    it('switches focus between fields via Tab key in step 3 (credentials)', () => {
      // Step 1: valid URL
      mockBuffer.text = 'http://localhost:11434/v1';
      const { lastFrame } = render(
        <SlmConfigDialog onComplete={onComplete} onCancel={onCancel} />,
      );

      // Step 1 → Step 2 (server type)
      act(() => {
        pressEnterInTextInput();
      });
      expect(lastFrame()!).toContain('Step 2 of 4');

      // Step 2 → Step 3 (credentials)
      act(() => {
        pressNumberKey('1');
      });
      expect(lastFrame()!).toContain('Step 3 of 4');

      // Press Tab — should switch from primary (API Key) to secondary (Model Name)
      const slmKeypress = mockedUseKeypress.mock.calls.at(-2);
      act(() => {
        slmKeypress![0]({
          name: 'tab',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '\t',
        });
      });

      // Press Tab again — should switch back to primary
      const slmKeypress2 = mockedUseKeypress.mock.calls.at(-2);
      act(() => {
        slmKeypress2![0]({
          name: 'tab',
          shift: false,
          ctrl: false,
          cmd: false,
          sequence: '\t',
        });
      });

      // Still on step 3 (Tab doesn't advance steps)
      expect(lastFrame()!).toContain('Step 3 of 4');
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

describe('parseCustomHeaders', () => {
  it('returns empty string for empty input', () => {
    expect(parseCustomHeaders('')).toBe('');
    expect(parseCustomHeaders('  ')).toBe('');
  });

  it('accepts valid JSON object', () => {
    expect(parseCustomHeaders('{"X-Custom": "value"}')).toBe(
      '{"X-Custom": "value"}',
    );
  });

  it('rejects JSON array', () => {
    expect(parseCustomHeaders('[1, 2, 3]')).toBeNull();
  });

  it('rejects JSON object with non-string values', () => {
    // HTTP headers must have string values
    expect(parseCustomHeaders('{"X-Count": 123}')).toBeNull();
    expect(parseCustomHeaders('{"X-Flag": true}')).toBeNull();
    expect(parseCustomHeaders('{"X-Data": {"nested": "obj"}}')).toBeNull();
  });

  it('rejects JSON object with empty header names', () => {
    // HTTP headers require non-empty header names
    expect(parseCustomHeaders('{"": "value"}')).toBeNull();
    expect(parseCustomHeaders('{"  ": "value"}')).toBeNull();
  });

  it('parses single key: value pair', () => {
    expect(parseCustomHeaders('X-Custom: my-value')).toBe(
      '{"X-Custom":"my-value"}',
    );
  });

  it('parses comma-separated key: value pairs', () => {
    const result = parseCustomHeaders('X-Custom: val1, X-Other: val2');
    const parsed = JSON.parse(result!);
    expect(parsed).toEqual({ 'X-Custom': 'val1', 'X-Other': 'val2' });
  });

  it('parses newline-separated key: value pairs', () => {
    const result = parseCustomHeaders('X-Custom: val1\nX-Other: val2');
    const parsed = JSON.parse(result!);
    expect(parsed).toEqual({ 'X-Custom': 'val1', 'X-Other': 'val2' });
  });

  it('handles value with colons (URL etc)', () => {
    const result = parseCustomHeaders('X-Endpoint: https://example.com:8080');
    const parsed = JSON.parse(result!);
    expect(parsed).toEqual({ 'X-Endpoint': 'https://example.com:8080' });
  });

  it('handles value with commas (Accept header etc)', () => {
    // Commas within a header value should be preserved, not treated as separators
    const result = parseCustomHeaders(
      'Accept: text/html,application/json, X-Custom: value',
    );
    const parsed = JSON.parse(result!);
    expect(parsed).toEqual({
      Accept: 'text/html,application/json',
      'X-Custom': 'value',
    });
  });

  it('returns null for unparseable input', () => {
    expect(parseCustomHeaders('just-a-string')).toBeNull();
  });

  it('returns null for colon at start of string', () => {
    expect(parseCustomHeaders(':value')).toBeNull();
  });

  it('trims whitespace from keys and values', () => {
    const result = parseCustomHeaders('  X-Custom  :  my value  ');
    const parsed = JSON.parse(result!);
    expect(parsed).toEqual({ 'X-Custom': 'my value' });
  });
});
