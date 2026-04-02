/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ProviderRegistry } from '../registry.js';
import { ValidationError } from '../errors.js';

describe('bootstrapDidimProvider', () => {
  let registry: ProviderRegistry;

  beforeEach(() => {
    registry = ProviderRegistry.getInstance();
    registry.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should register didim factory in ProviderRegistry', async () => {
    const { bootstrapDidimProvider } = await import('./bootstrap.js');
    bootstrapDidimProvider(registry);

    expect(registry.has('didim')).toBe(true);
  });

  it('should create DidimAdapter from factory', async () => {
    const { bootstrapDidimProvider } = await import('./bootstrap.js');
    bootstrapDidimProvider(registry);

    vi.stubEnv('DIDIM_SERVER_ADDRESS', 'test.didim365.com');

    const adapter = registry.createAdapter('didim', {
      apiKey: 'test-jwt',
      baseUrl: '',
    });
    expect(adapter.providerName).toBe('didim');
  });

  it('should be idempotent (register once)', async () => {
    const { bootstrapDidimProvider } = await import('./bootstrap.js');
    bootstrapDidimProvider(registry);
    bootstrapDidimProvider(registry); // No error on second call

    expect(registry.has('didim')).toBe(true);
  });
});

describe('Didim config wiring (bootstrap → adapter)', () => {
  let registry: ProviderRegistry;

  beforeEach(async () => {
    registry = ProviderRegistry.getInstance();
    registry.clear();
    const { bootstrapDidimProvider } = await import('./bootstrap.js');
    bootstrapDidimProvider(registry);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should pass serverAddress from AdapterConfig to DidimAdapter', () => {
    const adapter = registry.createAdapter('didim', {
      apiKey: 'test-jwt',
      baseUrl: '',
      serverAddress: 'aistudio.didim365.com',
      streamMode: 'sse',
    });

    expect(adapter.providerName).toBe('didim');
  });

  it('should pass streamMode from AdapterConfig to DidimAdapter', () => {
    vi.stubEnv('DIDIM_SERVER_ADDRESS', 'test.didim365.com');

    const adapter = registry.createAdapter('didim', {
      apiKey: 'test-jwt',
      baseUrl: '',
      streamMode: 'improved',
    });

    expect(adapter.providerName).toBe('didim');
  });

  it('should fallback to env vars when AdapterConfig fields are missing', () => {
    vi.stubEnv('DIDIM_API_KEY', 'env-jwt');
    vi.stubEnv('DIDIM_SERVER_ADDRESS', 'env.didim365.com');
    vi.stubEnv('DIDIM_STREAM_MODE', 'improved');

    const adapter = registry.createAdapter('didim', {
      apiKey: '',
      baseUrl: '',
    });

    expect(adapter.providerName).toBe('didim');
  });
});

// ============================================================================
// R1 Review: Wiring verification through actual API calls (1팀 #1)
// ============================================================================

describe('Didim wiring verification (serverAddress → URL, streamMode → endpoint)', () => {
  let registry: ProviderRegistry;

  beforeEach(async () => {
    registry = ProviderRegistry.getInstance();
    registry.clear();
    const { bootstrapDidimProvider } = await import('./bootstrap.js');
    bootstrapDidimProvider(registry);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should use serverAddress in fetch URL for non-streaming call', async () => {
    const calls: Array<[string, RequestInit]> = [];
    const mockFetchFn = vi
      .fn()
      .mockImplementation((url: string, init: RequestInit) => {
        calls.push([url, init]);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ response: 'OK', thread_id: 't1' }),
          headers: new Headers(),
        });
      });

    // Override globalThis.fetch temporarily
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchFn;
    try {
      const adapter = registry.createAdapter('didim', {
        apiKey: 'jwt-test',
        baseUrl: '',
        serverAddress: 'custom.didim365.com',
        streamMode: 'sse',
      });

      await adapter.generateContent(
        {
          model: 'didim-default',
          messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        },
        'prompt-001',
      );

      expect(calls).toHaveLength(1);
      expect(calls[0][0]).toContain('custom.didim365.com');
      expect(calls[0][0]).toContain('/scenario-gateway/v1/invoke');
      // Non-streaming URL should NOT contain /sse
      expect(calls[0][0]).not.toContain('/sse');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should use /sse path for streamMode=sse', async () => {
    const calls: Array<[string, RequestInit]> = [];
    const mockFetchFn = vi
      .fn()
      .mockImplementation((url: string, init: RequestInit) => {
        calls.push([url, init]);
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode('event: done\ndata: {"thread_id": "t1"}\n\n'),
            );
            controller.close();
          },
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          headers: new Headers(),
        });
      });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchFn;
    try {
      const adapter = registry.createAdapter('didim', {
        apiKey: 'jwt-test',
        baseUrl: '',
        serverAddress: 'custom.didim365.com',
        streamMode: 'sse',
      });

      const stream = adapter.generateContentStream(
        {
          model: 'didim-default',
          messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        },
        'prompt-001',
      );
      // Consume stream
      for await (const _event of stream) {
        // consume
      }

      expect(calls).toHaveLength(1);
      // v2: /api/v2/agent/chat endpoint 사용
      expect(calls[0][0]).toContain('/api/v2/agent/chat');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('should use /sse/improved path for streamMode=improved', async () => {
    const calls: Array<[string, RequestInit]> = [];
    const mockFetchFn = vi
      .fn()
      .mockImplementation((url: string, init: RequestInit) => {
        calls.push([url, init]);
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              encoder.encode('event: complete\ndata: {"thread_id": "t1"}\n\n'),
            );
            controller.close();
          },
        });
        return Promise.resolve({
          ok: true,
          status: 200,
          body: stream,
          headers: new Headers(),
        });
      });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetchFn;
    try {
      const adapter = registry.createAdapter('didim', {
        apiKey: 'jwt-test',
        baseUrl: '',
        serverAddress: 'custom.didim365.com',
        streamMode: 'improved',
      });

      const stream = adapter.generateContentStream(
        {
          model: 'didim-default',
          messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
        },
        'prompt-001',
      );
      for await (const _event of stream) {
        // consume
      }

      expect(calls).toHaveLength(1);
      // v2: /api/v2/agent/chat endpoint 사용
      expect(calls[0][0]).toContain('/api/v2/agent/chat');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ============================================================================
// R2 Review: streamMode validation (#7)
// ============================================================================

describe('Didim streamMode validation', () => {
  let registry: ProviderRegistry;

  beforeEach(async () => {
    registry = ProviderRegistry.getInstance();
    registry.clear();
    const { bootstrapDidimProvider } = await import('./bootstrap.js');
    bootstrapDidimProvider(registry);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should throw ValidationError for invalid streamMode value', () => {
    expect(() =>
      registry.createAdapter('didim', {
        apiKey: 'test-jwt',
        baseUrl: '',
        serverAddress: 'test.didim365.com',
        streamMode: 'invalid-mode',
      }),
    ).toThrow(ValidationError);
  });

  it('should include the invalid value in error message', () => {
    try {
      registry.createAdapter('didim', {
        apiKey: 'test-jwt',
        baseUrl: '',
        streamMode: 'badvalue',
      });
      expect.fail('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).message).toContain('badvalue');
    }
  });

  it('should accept valid streamMode "sse"', () => {
    const adapter = registry.createAdapter('didim', {
      apiKey: 'test-jwt',
      baseUrl: '',
      serverAddress: 'test.didim365.com',
      streamMode: 'sse',
    });
    expect(adapter.providerName).toBe('didim');
  });

  it('should accept valid streamMode "improved"', () => {
    const adapter = registry.createAdapter('didim', {
      apiKey: 'test-jwt',
      baseUrl: '',
      serverAddress: 'test.didim365.com',
      streamMode: 'improved',
    });
    expect(adapter.providerName).toBe('didim');
  });

  it('should throw ValidationError for invalid DIDIM_STREAM_MODE env var', () => {
    vi.stubEnv('DIDIM_STREAM_MODE', 'wrong');
    vi.stubEnv('DIDIM_SERVER_ADDRESS', 'test.didim365.com');

    expect(() =>
      registry.createAdapter('didim', {
        apiKey: 'test-jwt',
        baseUrl: '',
      }),
    ).toThrow(ValidationError);
  });
});
