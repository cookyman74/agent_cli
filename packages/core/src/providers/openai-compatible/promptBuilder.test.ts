/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for PromptBuilder implementations.
 *
 * @see docs/ai_adapter/todolist/phase3_provider_extension_todolist.md §3.3.2
 */

import { describe, it, expect } from 'vitest';
import {
  ChatMLPromptBuilder,
  Llama3PromptBuilder,
  MistralPromptBuilder,
  createPromptBuilderForModel,
} from './promptBuilder.js';

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

describe('Llama3PromptBuilder', () => {
  const builder = new Llama3PromptBuilder();

  it('should format a single user message', () => {
    const result = builder.formatPrompt([{ role: 'user', content: 'Hello' }]);
    expect(result).toBe(
      '<|begin_of_text|>' +
        '<|start_header_id|>user<|end_header_id|>\n\nHello<|eot_id|>' +
        '<|start_header_id|>assistant<|end_header_id|>\n\n',
    );
  });

  it('should include system and user messages in order', () => {
    const result = builder.formatPrompt([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ]);

    expect(result).toBe(
      '<|begin_of_text|>' +
        '<|start_header_id|>system<|end_header_id|>\n\nYou are helpful.<|eot_id|>' +
        '<|start_header_id|>user<|end_header_id|>\n\nHi<|eot_id|>' +
        '<|start_header_id|>assistant<|end_header_id|>\n\n',
    );
  });

  it('should handle empty messages array', () => {
    const result = builder.formatPrompt([]);
    expect(result).toBe(
      '<|begin_of_text|><|start_header_id|>assistant<|end_header_id|>\n\n',
    );
  });
});

describe('MistralPromptBuilder', () => {
  const builder = new MistralPromptBuilder();

  it('should format a single user message', () => {
    const result = builder.formatPrompt([{ role: 'user', content: 'Hello' }]);
    expect(result).toBe('<s>[INST] Hello [/INST]');
  });

  it('should embed leading system message into the first user turn', () => {
    const result = builder.formatPrompt([
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ]);

    expect(result).toBe('<s>[INST] You are helpful.\n\nHi [/INST]');
  });

  it('should format multi-turn user/assistant conversation', () => {
    const result = builder.formatPrompt([
      { role: 'user', content: 'What is 2+2?' },
      { role: 'assistant', content: '4' },
      { role: 'user', content: 'And 3+3?' },
    ]);

    expect(result).toBe(
      '<s>[INST] What is 2+2? [/INST] 4</s><s>[INST] And 3+3? [/INST]',
    );
  });

  it('should handle empty messages array', () => {
    const result = builder.formatPrompt([]);
    expect(result).toBe('<s>[INST]  [/INST]');
  });

  it('should handle system-only messages', () => {
    const result = builder.formatPrompt([
      { role: 'system', content: 'Be concise.' },
    ]);
    expect(result).toBe('<s>[INST] Be concise. [/INST]');
  });

  it('should treat tool role as user-side context turn', () => {
    const result = builder.formatPrompt([
      { role: 'user', content: 'Search docs' },
      { role: 'assistant', content: 'Calling tool...' },
      { role: 'tool', content: '{"items":2}' },
      { role: 'user', content: 'Summarize' },
    ]);

    expect(result).toBe(
      '<s>[INST] Search docs [/INST] Calling tool...</s>' +
        '<s>[INST] Tool result:\n{"items":2} [/INST]' +
        '<s>[INST] Summarize [/INST]',
    );
  });
});

describe('createPromptBuilderForModel', () => {
  it('should return Llama3PromptBuilder for llama3 models', () => {
    const builder = createPromptBuilderForModel(
      'meta-llama/Llama-3.1-8B-Instruct',
    );
    expect(builder).toBeInstanceOf(Llama3PromptBuilder);
  });

  it('should return MistralPromptBuilder for mistral models', () => {
    const builder = createPromptBuilderForModel(
      'mistralai/Mistral-7B-Instruct-v0.2',
    );
    expect(builder).toBeInstanceOf(MistralPromptBuilder);
  });

  it('should return MistralPromptBuilder for mixtral models', () => {
    const builder = createPromptBuilderForModel('Mixtral-8x7B-Instruct');
    expect(builder).toBeInstanceOf(MistralPromptBuilder);
  });

  it('should return ChatMLPromptBuilder for llama2 models', () => {
    const builder = createPromptBuilderForModel(
      'meta-llama/Llama-2-70b-chat-hf',
    );
    expect(builder).toBeInstanceOf(ChatMLPromptBuilder);
  });

  it('should return Llama3PromptBuilder for llama3 vision models', () => {
    const builder = createPromptBuilderForModel('llama-3.2-vision-instruct');
    expect(builder).toBeInstanceOf(Llama3PromptBuilder);
  });

  it('should return ChatMLPromptBuilder for llama-guard models', () => {
    const builder = createPromptBuilderForModel('meta-llama/Llama-Guard-3-8B');
    expect(builder).toBeInstanceOf(ChatMLPromptBuilder);
  });

  it('should match model names case-insensitively', () => {
    const builder = createPromptBuilderForModel('META-LLAMA/LLAMA-3-8B');
    expect(builder).toBeInstanceOf(Llama3PromptBuilder);
  });

  it('should return ChatMLPromptBuilder for unknown models', () => {
    const builder = createPromptBuilderForModel('custom-model');
    expect(builder).toBeInstanceOf(ChatMLPromptBuilder);
  });

  it('should return ChatMLPromptBuilder when model is omitted', () => {
    const builder = createPromptBuilderForModel();
    expect(builder).toBeInstanceOf(ChatMLPromptBuilder);
  });
});
