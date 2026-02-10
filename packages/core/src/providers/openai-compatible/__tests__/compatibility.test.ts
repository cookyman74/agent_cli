/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Compatibility scenario tests — verifies OpenAiCompatibleAdapter
 * handles response formats from vLLM, TGI, LM Studio, and Ollama.
 *
 * All tests use mock clients; no real server connections.
 *
 * @see docs/ai_adapter/todolist/phase3_provider_extension_todolist.md §3.3.3
 */

import { describe, it, expect, vi } from 'vitest';
import { OpenAiCompatibleAdapter } from '../adapter.js';
import type { OpenAiClient } from '../../openai/adapter.js';
import type { LlmGenerateRequest, AdapterConfig } from '../../types.js';
import { LlmEventType } from '../../events.js';
import type { LlmEvent } from '../../events.js';

// ============================================================================
// Helpers
// ============================================================================

function createMockClient(response: unknown): OpenAiClient {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue(response),
      },
    },
  };
}

function createStreamMockClient(chunks: unknown[]): OpenAiClient {
  return {
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) {
              yield chunk;
            }
          },
        }),
      },
    },
  };
}

function createBasicRequest(model: string): LlmGenerateRequest {
  return {
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  };
}

// ============================================================================
// 3.3.3.1 vLLM Compatibility
// ============================================================================

describe('vLLM compatibility', () => {
  const config: AdapterConfig = {
    baseUrl: 'http://localhost:8000/v1',
  };

  it('should handle vLLM chat completion response', async () => {
    const client = createMockClient({
      id: 'cmpl-vllm-001',
      object: 'chat.completion',
      model: 'meta-llama/Llama-3.1-8B-Instruct',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello from vLLM!' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 5,
        total_tokens: 17,
      },
    });

    const adapter = new OpenAiCompatibleAdapter(config, client);
    const result = await adapter.generateContent(
      createBasicRequest('meta-llama/Llama-3.1-8B-Instruct'),
      'test',
    );

    expect(result.content).toEqual([
      { type: 'text', text: 'Hello from vLLM!' },
    ]);
    expect(result.usage?.promptTokens).toBe(12);
    expect(result.usage?.completionTokens).toBe(5);
  });

  it('should handle vLLM streaming response', async () => {
    const client = createStreamMockClient([
      {
        id: 'cmpl-vllm-001',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: 'Hello' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'cmpl-vllm-001',
        choices: [
          { index: 0, delta: { content: ' from vLLM!' }, finish_reason: null },
        ],
      },
      {
        id: 'cmpl-vllm-001',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ]);

    const adapter = new OpenAiCompatibleAdapter(config, client);
    const events: LlmEvent[] = [];
    for await (const event of adapter.generateContentStream(
      createBasicRequest('meta-llama/Llama-3.1-8B-Instruct'),
      'test',
    )) {
      events.push(event);
    }

    const textDeltas = events.filter((e) => e.type === LlmEventType.TextDelta);
    expect(textDeltas.length).toBeGreaterThanOrEqual(1);

    const finished = events.filter((e) => e.type === LlmEventType.Finished);
    expect(finished.length).toBe(1);
  });

  it('should handle vLLM error response (model not found)', async () => {
    const err = new Error('Model not found');
    (err as Record<string, unknown>)['status'] = 404;

    const client = createMockClient(null);
    (
      client.chat.completions.create as ReturnType<typeof vi.fn>
    ).mockRejectedValue(err);

    const adapter = new OpenAiCompatibleAdapter(config, client);
    await expect(
      adapter.generateContent(createBasicRequest('nonexistent-model'), 'test'),
    ).rejects.toThrow();
  });

  it('should work without apiKey (local server)', async () => {
    const client = createMockClient({
      id: 'cmpl-001',
      model: 'llama',
      choices: [
        {
          message: { role: 'assistant', content: 'ok' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });

    const noKeyConfig: AdapterConfig = {
      baseUrl: 'http://localhost:8000/v1',
    };
    const adapter = new OpenAiCompatibleAdapter(noKeyConfig, client);
    const result = await adapter.generateContent(
      createBasicRequest('llama'),
      'test',
    );
    expect(result.content).toEqual([{ type: 'text', text: 'ok' }]);
  });
});

// ============================================================================
// 3.3.3.2 TGI Compatibility
// ============================================================================

describe('TGI compatibility', () => {
  const config: AdapterConfig = {
    apiKey: 'hf_token',
    baseUrl: 'https://api-inference.huggingface.co/v1',
  };

  it('should handle TGI chat completion response', async () => {
    const client = createMockClient({
      id: 'tgi-001',
      model: 'mistralai/Mistral-7B-Instruct-v0.2',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello from TGI!' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 4,
        total_tokens: 12,
      },
    });

    const adapter = new OpenAiCompatibleAdapter(config, client);
    const result = await adapter.generateContent(
      createBasicRequest('mistralai/Mistral-7B-Instruct-v0.2'),
      'test',
    );

    expect(result.content).toEqual([{ type: 'text', text: 'Hello from TGI!' }]);
  });

  it('should handle TGI streaming response', async () => {
    const client = createStreamMockClient([
      {
        id: 'tgi-001',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: 'TGI' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'tgi-001',
        choices: [
          { index: 0, delta: { content: ' streaming' }, finish_reason: null },
        ],
      },
      {
        id: 'tgi-001',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ]);

    const adapter = new OpenAiCompatibleAdapter(config, client);
    const events: LlmEvent[] = [];
    for await (const event of adapter.generateContentStream(
      createBasicRequest('mistralai/Mistral-7B-Instruct-v0.2'),
      'test',
    )) {
      events.push(event);
    }

    expect(events.some((e) => e.type === LlmEventType.TextDelta)).toBe(true);
    expect(events.some((e) => e.type === LlmEventType.Finished)).toBe(true);
  });

  it('should handle TGI error format', async () => {
    const err = new Error('Rate limit exceeded');
    (err as Record<string, unknown>)['status'] = 429;

    const client = createMockClient(null);
    (
      client.chat.completions.create as ReturnType<typeof vi.fn>
    ).mockRejectedValue(err);

    const adapter = new OpenAiCompatibleAdapter(config, client);
    await expect(
      adapter.generateContent(createBasicRequest('model'), 'test'),
    ).rejects.toThrow();
  });
});

// ============================================================================
// 3.3.3.3 LM Studio Compatibility
// ============================================================================

describe('LM Studio compatibility', () => {
  const config: AdapterConfig = {
    baseUrl: 'http://localhost:1234/v1',
  };

  it('should handle LM Studio chat completion response', async () => {
    const client = createMockClient({
      id: 'chatcmpl-lms-001',
      model: 'local-model',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello from LM Studio!' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 6,
        total_tokens: 16,
      },
    });

    const adapter = new OpenAiCompatibleAdapter(config, client);
    const result = await adapter.generateContent(
      createBasicRequest('local-model'),
      'test',
    );

    expect(result.content).toEqual([
      { type: 'text', text: 'Hello from LM Studio!' },
    ]);
  });

  it('should handle LM Studio streaming response', async () => {
    const client = createStreamMockClient([
      {
        id: 'lms-001',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: 'LM' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'lms-001',
        choices: [
          { index: 0, delta: { content: ' Studio' }, finish_reason: null },
        ],
      },
      {
        id: 'lms-001',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ]);

    const adapter = new OpenAiCompatibleAdapter(config, client);
    const events: LlmEvent[] = [];
    for await (const event of adapter.generateContentStream(
      createBasicRequest('local-model'),
      'test',
    )) {
      events.push(event);
    }

    expect(events.some((e) => e.type === LlmEventType.TextDelta)).toBe(true);
    expect(events.some((e) => e.type === LlmEventType.Finished)).toBe(true);
  });
});

// ============================================================================
// 3.3.3.4 Ollama Compatibility
// ============================================================================

describe('Ollama compatibility', () => {
  const config: AdapterConfig = {
    baseUrl: 'http://localhost:11434/v1',
  };

  it('should handle Ollama chat completion response', async () => {
    const client = createMockClient({
      id: 'chatcmpl-ollama',
      model: 'llama3.1',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello from Ollama!' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 5,
        completion_tokens: 4,
        total_tokens: 9,
      },
    });

    const adapter = new OpenAiCompatibleAdapter(config, client);
    const result = await adapter.generateContent(
      createBasicRequest('llama3.1'),
      'test',
    );

    expect(result.content).toEqual([
      { type: 'text', text: 'Hello from Ollama!' },
    ]);
  });

  it('should handle Ollama streaming response', async () => {
    const client = createStreamMockClient([
      {
        id: 'ollama-001',
        choices: [
          {
            index: 0,
            delta: { role: 'assistant', content: 'Ollama' },
            finish_reason: null,
          },
        ],
      },
      {
        id: 'ollama-001',
        choices: [
          { index: 0, delta: { content: ' reply' }, finish_reason: null },
        ],
      },
      {
        id: 'ollama-001',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      },
    ]);

    const adapter = new OpenAiCompatibleAdapter(config, client);
    const events: LlmEvent[] = [];
    for await (const event of adapter.generateContentStream(
      createBasicRequest('llama3.1'),
      'test',
    )) {
      events.push(event);
    }

    expect(events.some((e) => e.type === LlmEventType.TextDelta)).toBe(true);
    expect(events.some((e) => e.type === LlmEventType.Finished)).toBe(true);
  });

  it('should handle missing usage in response (graceful fallback)', async () => {
    const client = createMockClient({
      id: 'ollama-no-usage',
      model: 'llama3.1',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'No usage data' },
          finish_reason: 'stop',
        },
      ],
      // Ollama sometimes omits usage
    });

    const adapter = new OpenAiCompatibleAdapter(config, client);
    const result = await adapter.generateContent(
      createBasicRequest('llama3.1'),
      'test',
    );

    expect(result.content).toEqual([{ type: 'text', text: 'No usage data' }]);
    // Usage should be zeroed or undefined — no crash
    expect(result.usage).toBeDefined();
  });
});
