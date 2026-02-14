/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderWithProviders } from '../../test-utils/render.js';
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { ProviderSelectDialog } from './ProviderSelectDialog.js';
import { RadioButtonSelect } from '../components/shared/RadioButtonSelect.js';
import { useKeypress } from '../hooks/useKeypress.js';
import { Text } from 'ink';

vi.mock('../hooks/useKeypress.js', () => ({
  useKeypress: vi.fn(),
}));

vi.mock('../components/shared/RadioButtonSelect.js', () => ({
  RadioButtonSelect: vi.fn(({ items, initialIndex }) => (
    <>
      {items.map((item: { value: string; label: string }, index: number) => (
        <Text key={item.value}>
          {index === initialIndex ? '(selected)' : '(not selected)'}{' '}
          {item.label}
        </Text>
      ))}
    </>
  )),
}));

const mockedUseKeypress = useKeypress as Mock;
const mockedRadioButtonSelect = RadioButtonSelect as Mock;

describe('ProviderSelectDialog', () => {
  let props: {
    onSelect: (providerKey: string) => void;
    currentProvider?: string;
    onCancel?: () => void;
    error?: string | null;
    onError?: (error: string | null) => void;
  };

  beforeEach(() => {
    vi.resetAllMocks();
    props = {
      onSelect: vi.fn(),
      onCancel: vi.fn(),
      onError: vi.fn(),
    };
  });

  describe('Rendering', () => {
    it('renders 4 provider items', () => {
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const { items } = mockedRadioButtonSelect.mock.calls[0][0];
      expect(items).toHaveLength(4);
    });

    it('renders all expected providers in order', () => {
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const { items } = mockedRadioButtonSelect.mock.calls[0][0];
      const values = items.map(
        (item: { value: string; label: string }) => item.value,
      );
      expect(values).toEqual(['gemini', 'claude', 'openai', 'slm']);
    });

    it('renders provider labels with descriptions', () => {
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const { items } = mockedRadioButtonSelect.mock.calls[0][0];
      expect(items[0].label).toBe('Gemini (Google AI)');
      expect(items[1].label).toBe('Claude (Anthropic)');
      expect(items[2].label).toBe('OpenAI (OpenAI)');
      expect(items[3].label).toBe('sLM (Self-hosted / Local LLM)');
    });

    it('renders title and instruction text', () => {
      const { lastFrame } = renderWithProviders(
        <ProviderSelectDialog {...props} />,
      );
      expect(lastFrame()).toContain('Select LLM Provider');
      expect(lastFrame()).toContain('Which AI provider would you like to use?');
      expect(lastFrame()).toContain('(Use Enter to select)');
    });

    it('displays error when provided', () => {
      props.error = 'Something went wrong';
      const { lastFrame } = renderWithProviders(
        <ProviderSelectDialog {...props} />,
      );
      expect(lastFrame()).toContain('Something went wrong');
    });

    it('does not display error section when no error', () => {
      props.error = null;
      const { lastFrame } = renderWithProviders(
        <ProviderSelectDialog {...props} />,
      );
      expect(lastFrame()).not.toContain('Something went wrong');
    });
  });

  describe('Initial Selection', () => {
    it('defaults to index 0 (gemini) when no currentProvider', () => {
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const { initialIndex } = mockedRadioButtonSelect.mock.calls[0][0];
      expect(initialIndex).toBe(0);
    });

    it('selects claude when currentProvider is claude', () => {
      props.currentProvider = 'claude';
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const { initialIndex } = mockedRadioButtonSelect.mock.calls[0][0];
      expect(initialIndex).toBe(1);
    });

    it('selects openai when currentProvider is openai', () => {
      props.currentProvider = 'openai';
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const { initialIndex } = mockedRadioButtonSelect.mock.calls[0][0];
      expect(initialIndex).toBe(2);
    });

    it('maps openai-compatible to slm (index 3)', () => {
      props.currentProvider = 'openai-compatible';
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const { initialIndex } = mockedRadioButtonSelect.mock.calls[0][0];
      expect(initialIndex).toBe(3);
    });

    it('falls back to index 0 for unknown currentProvider', () => {
      props.currentProvider = 'unknown';
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const { initialIndex } = mockedRadioButtonSelect.mock.calls[0][0];
      expect(initialIndex).toBe(0);
    });
  });

  describe('onSelect', () => {
    it('calls onSelect with correct provider key', () => {
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];
      onSelect('claude');
      expect(props.onSelect).toHaveBeenCalledWith('claude');
    });

    it('clears error on selection', () => {
      props.error = 'old error';
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const { onSelect } = mockedRadioButtonSelect.mock.calls[0][0];
      onSelect('openai');
      expect(props.onError).toHaveBeenCalledWith(null);
    });

    it('clears error on highlight', () => {
      props.error = 'old error';
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const { onHighlight } = mockedRadioButtonSelect.mock.calls[0][0];
      onHighlight('gemini');
      expect(props.onError).toHaveBeenCalledWith(null);
    });
  });

  describe('useKeypress (Escape)', () => {
    it('calls onCancel on escape when currentProvider is set', () => {
      props.currentProvider = 'gemini';
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const keypressHandler = mockedUseKeypress.mock.calls[0][0];
      keypressHandler({ name: 'escape' });
      expect(props.onCancel).toHaveBeenCalled();
    });

    it('shows error on escape when no currentProvider', () => {
      props.currentProvider = undefined;
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const keypressHandler = mockedUseKeypress.mock.calls[0][0];
      keypressHandler({ name: 'escape' });
      expect(props.onError).toHaveBeenCalledWith(
        'You must select a provider to proceed. Press Ctrl+C twice to exit.',
      );
    });

    it('does not call onCancel on escape when no currentProvider', () => {
      props.currentProvider = undefined;
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const keypressHandler = mockedUseKeypress.mock.calls[0][0];
      keypressHandler({ name: 'escape' });
      expect(props.onCancel).not.toHaveBeenCalled();
    });

    it('does not call onCancel on non-escape keys', () => {
      props.currentProvider = 'gemini';
      renderWithProviders(<ProviderSelectDialog {...props} />);
      const keypressHandler = mockedUseKeypress.mock.calls[0][0];
      keypressHandler({ name: 'return' });
      expect(props.onCancel).not.toHaveBeenCalled();
    });
  });

  describe('Snapshots', () => {
    it('renders correctly with default props', () => {
      const { lastFrame } = renderWithProviders(
        <ProviderSelectDialog {...props} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders correctly with error', () => {
      props.error = 'Must select a provider';
      const { lastFrame } = renderWithProviders(
        <ProviderSelectDialog {...props} />,
      );
      expect(lastFrame()).toMatchSnapshot();
    });
  });
});
