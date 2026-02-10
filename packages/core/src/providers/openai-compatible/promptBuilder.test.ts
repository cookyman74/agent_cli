/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for PromptBuilder interface and ChatMLPromptBuilder.
 *
 * @see docs/ai_adapter/todolist/phase3_provider_extension_todolist.md §3.3.2
 */

import { describe, it, expect } from 'vitest';
import { ChatMLPromptBuilder } from './promptBuilder.js';

describe('ChatMLPromptBuilder', () => {
  const builder = new ChatMLPromptBuilder();

  it('should format a single user message', () => {
    const result = builder.formatPrompt([{ role: 'user', content: 'Hello' }]);
    expect(result).toBe(
      '<|im_start|>user\nHello<|im_end|>\n<|im_start|>assistant\n',
    );
  });

  it('should format system + user message', () => {
    const result = builder.formatPrompt([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ]);
    expect(result).toBe(
      '<|im_start|>system\nYou are helpful.<|im_end|>\n' +
        '<|im_start|>user\nHi<|im_end|>\n' +
        '<|im_start|>assistant\n',
    );
  });

  it('should format multi-turn conversation', () => {
    const result = builder.formatPrompt([
      { role: 'system', content: 'Be concise.' },
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: '4' },
      { role: 'user', content: 'And 3+3?' },
    ]);
    expect(result).toBe(
      '<|im_start|>system\nBe concise.<|im_end|>\n' +
        '<|im_start|>user\nWhat is 2+2?<|im_end|>\n' +
        '<|im_start|>assistant\n4<|im_end|>\n' +
        '<|im_start|>user\nAnd 3+3?<|im_end|>\n' +
        '<|im_start|>assistant\n',
    );
  });

  it('should always end with assistant start token', () => {
    const result = builder.formatPrompt([{ role: 'user', content: 'test' }]);
    expect(result.endsWith('<|im_start|>assistant\n')).toBe(true);
  });

  it('should handle empty messages array', () => {
    const result = builder.formatPrompt([]);
    expect(result).toBe('<|im_start|>assistant\n');
  });
});
