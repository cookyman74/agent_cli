/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M3.4.1.1 — Provider switching integration test
 * M3.4.1.2 — Concurrent provider usage integration test
 *
 * Tests the full lifecycle: Registry → Factory → Adapter → generate/stream
 * using mock adapters that simulate real provider behavior without SDK calls.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ProviderRegistry } from '../registry.js';
import { ProviderFactory } from '../factory.js';
import { BaseAdapter } from '../baseAdapter.js';
import { LlmEventType } from '../events.js';
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmProviderCapabilities,
  LlmGenerateConfig,
  GenerateOptions,
} from '../types.js';
import type { LlmEvent, LlmEventStream } from '../events.js';

// ============================================================================
// Mock Adapters
// ============================================================================

function createBasicRequest(model: string): LlmGenerateRequest {
  return {
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  };
}

class MockGeminiAdapter extends BaseAdapter {
  readonly providerName = 'gemini';
  readonly capabilities: LlmProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    supportsEmbedding: false,
    supportsTokenCount: true,
    supportsSystemMessage: true,
    supportsThought: true,
    maxContextLength: 1_000_000,
    maxOutputTokens: 8192,
  };

  protected mapToProviderConfig(
    _config: LlmGenerateConfig,
  ): Record<string, unknown> {
    return {};
  }

  async generateContent(
    request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    this.validateRequest(request);
    return {
      id: 'gemini-resp-1',
      content: [
        {
          type: 'text',
          text: `[gemini] Response to: ${request.messages[0].content[0].type === 'text' ? (request.messages[0].content[0] as { type: 'text'; text: string }).text : 'unknown'}`,
        },
      ],
      model: request.model,
      stopReason: 'end_turn',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };
  }

  async *generateContentStream(
    request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): LlmEventStream {
    this.validateRequest(request);
    yield { type: LlmEventType.TextDelta, text: '[gemini] ' };
    yield { type: LlmEventType.TextDelta, text: 'streaming' };
    yield { type: LlmEventType.Finished, finishReason: 'end_turn' };
  }
}

class MockClaudeAdapter extends BaseAdapter {
  readonly providerName = 'claude';
  readonly capabilities: LlmProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    supportsEmbedding: false,
    supportsTokenCount: true,
    supportsSystemMessage: true,
    supportsThought: true,
    maxContextLength: 200_000,
    maxOutputTokens: 8192,
  };

  protected mapToProviderConfig(
    _config: LlmGenerateConfig,
  ): Record<string, unknown> {
    return {};
  }

  async generateContent(
    request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    this.validateRequest(request);
    return {
      id: 'claude-resp-1',
      content: [
        {
          type: 'text',
          text: `[claude] Response to: ${request.messages[0].content[0].type === 'text' ? (request.messages[0].content[0] as { type: 'text'; text: string }).text : 'unknown'}`,
        },
      ],
      model: request.model,
      stopReason: 'end_turn',
      usage: { promptTokens: 15, completionTokens: 25, totalTokens: 40 },
    };
  }

  async *generateContentStream(
    request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): LlmEventStream {
    this.validateRequest(request);
    yield { type: LlmEventType.TextDelta, text: '[claude] ' };
    yield { type: LlmEventType.TextDelta, text: 'streaming' };
    yield { type: LlmEventType.Finished, finishReason: 'end_turn' };
  }
}

class MockOpenAiAdapter extends BaseAdapter {
  readonly providerName = 'openai';
  readonly capabilities: LlmProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsImageInput: true,
    supportsImageGeneration: false,
    supportsEmbedding: false,
    supportsTokenCount: false,
    supportsSystemMessage: true,
    supportsThought: false,
    maxContextLength: 128_000,
    maxOutputTokens: 16_384,
  };

  protected mapToProviderConfig(
    _config: LlmGenerateConfig,
  ): Record<string, unknown> {
    return {};
  }

  async generateContent(
    request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    this.validateRequest(request);
    return {
      id: 'openai-resp-1',
      content: [
        {
          type: 'text',
          text: `[openai] Response to: ${request.messages[0].content[0].type === 'text' ? (request.messages[0].content[0] as { type: 'text'; text: string }).text : 'unknown'}`,
        },
      ],
      model: request.model,
      stopReason: 'end_turn',
      usage: { promptTokens: 12, completionTokens: 18, totalTokens: 30 },
    };
  }

  async *generateContentStream(
    request: LlmGenerateRequest,
    _userPromptId: string,
    _options?: GenerateOptions,
  ): LlmEventStream {
    this.validateRequest(request);
    yield { type: LlmEventType.TextDelta, text: '[openai] ' };
    yield { type: LlmEventType.TextDelta, text: 'streaming' };
    yield { type: LlmEventType.Finished, finishReason: 'end_turn' };
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('M3.4.1 Multi-Provider Integration', () => {
  let registry: ProviderRegistry;
  let factory: ProviderFactory;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.clear();
    factory = new ProviderFactory(registry);
  });

  // ==========================================================================
  // 3.4.1.1 — Provider Switching
  // ==========================================================================

  describe('3.4.1.1 — Provider switching', () => {
    beforeEach(() => {
      registry.register('gemini', (config) => new MockGeminiAdapter(config));
      registry.register('claude', (config) => new MockClaudeAdapter(config));
      registry.register('openai', (config) => new MockOpenAiAdapter(config));
    });

    it('should register all 3 providers', () => {
      expect(registry.has('gemini')).toBe(true);
      expect(registry.has('claude')).toBe(true);
      expect(registry.has('openai')).toBe(true);
      expect(registry.list()).toHaveLength(3);
    });

    it('should create adapters with correct providerName', () => {
      const gemini = factory.create('gemini', { apiKey: 'g-key' });
      const claude = factory.create('claude', { apiKey: 'c-key' });
      const openai = factory.create('openai', { apiKey: 'o-key' });

      expect(gemini.providerName).toBe('gemini');
      expect(claude.providerName).toBe('claude');
      expect(openai.providerName).toBe('openai');
    });

    it('should switch providers and get distinct responses via generateContent', async () => {
      const providers = ['gemini', 'claude', 'openai'] as const;
      const responses: LlmGenerateResponse[] = [];

      for (const provider of providers) {
        const adapter = factory.create(provider, { apiKey: `${provider}-key` });
        const request = createBasicRequest(`${provider}-model`);
        const response = await adapter.generateContent(request, 'prompt-1');
        responses.push(response);
      }

      // Each provider returns distinct response
      expect(responses[0].id).toBe('gemini-resp-1');
      expect(responses[1].id).toBe('claude-resp-1');
      expect(responses[2].id).toBe('openai-resp-1');

      // Each response contains provider tag
      for (let i = 0; i < providers.length; i++) {
        const text = responses[i].content[0];
        expect(text.type).toBe('text');
        if (text.type === 'text') {
          expect(text.text).toContain(`[${providers[i]}]`);
        }
      }
    });

    it('should switch providers and stream distinct events', async () => {
      const providers = ['gemini', 'claude', 'openai'] as const;

      for (const provider of providers) {
        const adapter = factory.create(provider, { apiKey: `${provider}-key` });
        const request = createBasicRequest(`${provider}-model`);
        const events: LlmEvent[] = [];

        for await (const event of adapter.generateContentStream(
          request,
          'prompt-1',
        )) {
          events.push(event);
        }

        // All providers yield TextDelta + TextDelta + Finished
        expect(events).toHaveLength(3);
        expect(events[0].type).toBe(LlmEventType.TextDelta);
        if (events[0].type === LlmEventType.TextDelta) {
          expect(events[0].text).toContain(`[${provider}]`);
        }
        expect(events[2].type).toBe(LlmEventType.Finished);
      }
    });

    it('should support case-insensitive provider names via factory', () => {
      expect(factory.canCreate('GEMINI')).toBe(true);
      expect(factory.canCreate('Claude')).toBe(true);
      expect(factory.canCreate('OpenAI')).toBe(true);

      const adapter = factory.create('CLAUDE', { apiKey: 'test' });
      expect(adapter.providerName).toBe('claude');
    });

    it('should expose different capabilities per provider', () => {
      const gemini = factory.create('gemini', { apiKey: 'key' });
      const claude = factory.create('claude', { apiKey: 'key' });
      const openai = factory.create('openai', { apiKey: 'key' });

      // Gemini: largest context
      expect(gemini.capabilities.maxContextLength).toBe(1_000_000);
      // Claude: supports thought
      expect(claude.capabilities.supportsThought).toBe(true);
      // OpenAI: no token count support
      expect(openai.capabilities.supportsTokenCount).toBe(false);
    });

    it('should maintain model passthrough across providers', async () => {
      const providers = ['gemini', 'claude', 'openai'] as const;
      const models = [
        'gemini-2.0-flash',
        'claude-3-5-sonnet-20241022',
        'gpt-4o',
      ];

      for (let i = 0; i < providers.length; i++) {
        const adapter = factory.create(providers[i], { apiKey: 'key' });
        const request = createBasicRequest(models[i]);
        const response = await adapter.generateContent(request, 'prompt-1');
        expect(response.model).toBe(models[i]);
      }
    });
  });

  // ==========================================================================
  // 3.4.1.2 — Concurrent Provider Usage
  // ==========================================================================

  describe('3.4.1.2 — Concurrent provider usage', () => {
    beforeEach(() => {
      registry.register('gemini', (config) => new MockGeminiAdapter(config));
      registry.register('claude', (config) => new MockClaudeAdapter(config));
      registry.register('openai', (config) => new MockOpenAiAdapter(config));
    });

    it('should handle concurrent generateContent from all 3 providers', async () => {
      const gemini = factory.create('gemini', { apiKey: 'g-key' });
      const claude = factory.create('claude', { apiKey: 'c-key' });
      const openai = factory.create('openai', { apiKey: 'o-key' });

      const [geminiResp, claudeResp, openaiResp] = await Promise.all([
        gemini.generateContent(
          createBasicRequest('gemini-2.0-flash'),
          'prompt-g',
        ),
        claude.generateContent(
          createBasicRequest('claude-3-5-sonnet'),
          'prompt-c',
        ),
        openai.generateContent(createBasicRequest('gpt-4o'), 'prompt-o'),
      ]);

      expect(geminiResp.id).toBe('gemini-resp-1');
      expect(claudeResp.id).toBe('claude-resp-1');
      expect(openaiResp.id).toBe('openai-resp-1');
    });

    it('should handle concurrent streaming from all 3 providers', async () => {
      const gemini = factory.create('gemini', { apiKey: 'g-key' });
      const claude = factory.create('claude', { apiKey: 'c-key' });
      const openai = factory.create('openai', { apiKey: 'o-key' });

      async function collectEvents(
        stream: LlmEventStream,
      ): Promise<LlmEvent[]> {
        const events: LlmEvent[] = [];
        for await (const event of stream) {
          events.push(event);
        }
        return events;
      }

      const [geminiEvents, claudeEvents, openaiEvents] = await Promise.all([
        collectEvents(
          gemini.generateContentStream(
            createBasicRequest('gemini-2.0-flash'),
            'prompt-g',
          ),
        ),
        collectEvents(
          claude.generateContentStream(
            createBasicRequest('claude-3-5-sonnet'),
            'prompt-c',
          ),
        ),
        collectEvents(
          openai.generateContentStream(
            createBasicRequest('gpt-4o'),
            'prompt-o',
          ),
        ),
      ]);

      // Each stream independently yields its own events
      expect(geminiEvents).toHaveLength(3);
      expect(claudeEvents).toHaveLength(3);
      expect(openaiEvents).toHaveLength(3);

      // Verify no cross-contamination
      if (geminiEvents[0].type === LlmEventType.TextDelta) {
        expect(geminiEvents[0].text).toContain('[gemini]');
      }
      if (claudeEvents[0].type === LlmEventType.TextDelta) {
        expect(claudeEvents[0].text).toContain('[claude]');
      }
      if (openaiEvents[0].type === LlmEventType.TextDelta) {
        expect(openaiEvents[0].text).toContain('[openai]');
      }
    });

    it('should create independent adapter instances per factory call', () => {
      const adapter1 = factory.create('claude', { apiKey: 'key-1' });
      const adapter2 = factory.create('claude', { apiKey: 'key-2' });

      expect(adapter1).not.toBe(adapter2);
      // Both are valid Claude adapters
      expect(adapter1.providerName).toBe('claude');
      expect(adapter2.providerName).toBe('claude');
    });

    it('should support mixed concurrent operations (generate + stream)', async () => {
      const gemini = factory.create('gemini', { apiKey: 'g-key' });
      const claude = factory.create('claude', { apiKey: 'c-key' });

      async function collectEvents(
        stream: LlmEventStream,
      ): Promise<LlmEvent[]> {
        const events: LlmEvent[] = [];
        for await (const event of stream) {
          events.push(event);
        }
        return events;
      }

      const [geminiResp, claudeEvents] = await Promise.all([
        gemini.generateContent(
          createBasicRequest('gemini-2.0-flash'),
          'prompt-g',
        ),
        collectEvents(
          claude.generateContentStream(
            createBasicRequest('claude-3-5-sonnet'),
            'prompt-c',
          ),
        ),
      ]);

      expect(geminiResp.id).toBe('gemini-resp-1');
      expect(claudeEvents).toHaveLength(3);
    });
  });
});
