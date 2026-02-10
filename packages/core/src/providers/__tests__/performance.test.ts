/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M3.4.3.1 — Response latency benchmark (< 50ms)
 * M3.4.3.2 — Streaming TTFT benchmark (< 100ms)
 * M3.4.3.3 — Memory usage profiling (< 10% growth)
 *
 * Measures adapter framework overhead using mock adapters.
 * Network latency is excluded — only Registry → Factory → Adapter → Event Stream
 * overhead is measured.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
import type { LlmEventStream } from '../events.js';

// ============================================================================
// Benchmark Utilities
// ============================================================================

async function measureTime(fn: () => Promise<void>): Promise<number> {
  const start = performance.now();
  await fn();
  return performance.now() - start;
}

async function benchmark(
  fn: () => Promise<void>,
  iterations = 50,
): Promise<{ median: number; p95: number }> {
  const times: number[] = [];

  // Warm-up (5 iterations)
  for (let i = 0; i < 5; i++) {
    await fn();
  }

  // Measure
  for (let i = 0; i < iterations; i++) {
    times.push(await measureTime(fn));
  }

  times.sort((a, b) => a - b);
  return {
    median: times[Math.floor(times.length / 2)],
    p95: times[Math.floor(times.length * 0.95)],
  };
}

// ============================================================================
// Mock Adapters (minimal — mirrors multiProvider.integration.test.ts)
// ============================================================================

const MOCK_CAPABILITIES: LlmProviderCapabilities = {
  supportsStreaming: true,
  supportsToolCalls: true,
  supportsImageInput: false,
  supportsImageGeneration: false,
  supportsEmbedding: false,
  supportsTokenCount: false,
  supportsSystemMessage: true,
  supportsThought: false,
  maxContextLength: 128_000,
  maxOutputTokens: 8192,
};

class PerfMockGeminiAdapter extends BaseAdapter {
  readonly providerName = 'gemini';
  readonly capabilities = MOCK_CAPABILITIES;

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
      id: 'perf-gemini-1',
      content: [{ type: 'text', text: '[gemini] perf response' }],
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

class PerfMockClaudeAdapter extends BaseAdapter {
  readonly providerName = 'claude';
  readonly capabilities = MOCK_CAPABILITIES;

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
      id: 'perf-claude-1',
      content: [{ type: 'text', text: '[claude] perf response' }],
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

class PerfMockOpenAiAdapter extends BaseAdapter {
  readonly providerName = 'openai';
  readonly capabilities = MOCK_CAPABILITIES;

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
      id: 'perf-openai-1',
      content: [{ type: 'text', text: '[openai] perf response' }],
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
// Test Setup
// ============================================================================

function createBasicRequest(model: string): LlmGenerateRequest {
  return {
    model,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
  };
}

const PROVIDERS = [
  { name: 'gemini', AdapterClass: PerfMockGeminiAdapter },
  { name: 'claude', AdapterClass: PerfMockClaudeAdapter },
  { name: 'openai', AdapterClass: PerfMockOpenAiAdapter },
] as const;

// ============================================================================
// Tests
// ============================================================================

describe('Provider Performance Benchmarks', () => {
  let registry: ProviderRegistry;
  let factory: ProviderFactory;
  let adapters: Map<string, BaseAdapter>;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.clear();

    for (const { name, AdapterClass } of PROVIDERS) {
      registry.register(name, (config) => new AdapterClass(config), {
        force: true,
      });
    }

    factory = new ProviderFactory(registry);

    adapters = new Map();
    for (const { name } of PROVIDERS) {
      adapters.set(name, factory.create(name, {}));
    }
  });

  afterEach(() => {
    registry.clear();
  });

  // ==========================================================================
  // 3.4.3.1 Response Latency (< 50ms)
  // ==========================================================================
  describe('3.4.3.1 Response Latency', () => {
    it('generateContent overhead should be < 50ms per provider (p95)', async () => {
      const request = createBasicRequest('test-model');

      for (const { name } of PROVIDERS) {
        const adapter = adapters.get(name)!;
        const result = await benchmark(async () => {
          await adapter.generateContent(request, `bench-${name}`);
        });

        expect(
          result.p95,
          `${name} generateContent p95 (${result.p95.toFixed(2)}ms) exceeds 50ms`,
        ).toBeLessThan(50);
      }
    });

    it('provider creation overhead should be < 10ms (p95)', async () => {
      const result = await benchmark(async () => {
        factory.create('gemini', {});
      });

      expect(
        result.p95,
        `Provider creation p95 (${result.p95.toFixed(2)}ms) exceeds 10ms`,
      ).toBeLessThan(10);
    });

    it('registry lookup overhead should be < 5ms (p95)', async () => {
      const result = await benchmark(async () => {
        registry.get('claude');
      });

      expect(
        result.p95,
        `Registry lookup p95 (${result.p95.toFixed(2)}ms) exceeds 5ms`,
      ).toBeLessThan(5);
    });
  });

  // ==========================================================================
  // 3.4.3.2 Streaming TTFT (< 100ms)
  // ==========================================================================
  describe('3.4.3.2 Streaming TTFT', () => {
    it('time to first TextDelta should be < 100ms per provider (p95)', async () => {
      const request = createBasicRequest('test-model');

      for (const { name } of PROVIDERS) {
        const adapter = adapters.get(name)!;
        const result = await benchmark(async () => {
          const stream = adapter.generateContentStream(
            request,
            `bench-ttft-${name}`,
          );
          for await (const event of stream) {
            if (event.type === LlmEventType.TextDelta) break;
          }
        });

        expect(
          result.p95,
          `${name} TTFT p95 (${result.p95.toFixed(2)}ms) exceeds 100ms`,
        ).toBeLessThan(100);
      }
    });

    it('full stream consumption should be < 50ms per provider (p95)', async () => {
      const request = createBasicRequest('test-model');

      for (const { name } of PROVIDERS) {
        const adapter = adapters.get(name)!;
        const result = await benchmark(async () => {
          const stream = adapter.generateContentStream(
            request,
            `bench-stream-${name}`,
          );
          for await (const _event of stream) {
            /* consume all */
          }
        });

        expect(
          result.p95,
          `${name} full stream p95 (${result.p95.toFixed(2)}ms) exceeds 50ms`,
        ).toBeLessThan(50);
      }
    });
  });

  // ==========================================================================
  // 3.4.3.3 Memory Usage (< 10% growth)
  // ==========================================================================
  describe('3.4.3.3 Memory Usage', () => {
    it('memory growth during repeated operations should be < 10%', async () => {
      const request = createBasicRequest('test-model');

      // Encourage GC if available
      if (global.gc) global.gc();

      const before = process.memoryUsage().heapUsed;

      // 100 iterations × 3 providers × (generateContent + generateContentStream)
      for (let i = 0; i < 100; i++) {
        for (const [, adapter] of adapters) {
          await adapter.generateContent(request, `mem-${i}`);
          const stream = adapter.generateContentStream(request, `mem-s-${i}`);
          for await (const _event of stream) {
            /* consume */
          }
        }
      }

      if (global.gc) global.gc();
      const after = process.memoryUsage().heapUsed;

      const growthPercent = ((after - before) / before) * 100;
      expect(
        growthPercent,
        `Memory growth (${growthPercent.toFixed(2)}%) exceeds 10%`,
      ).toBeLessThan(10);
    });
  });
});
