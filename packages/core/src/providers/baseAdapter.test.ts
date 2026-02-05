/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import { BaseAdapter } from './baseAdapter.js';
import type {
  LlmGenerateConfig,
  LlmTokenCount,
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmProviderCapabilities,
  AdapterConfig,
} from './types.js';
import { LlmEventType } from './events.js';
import type { LlmEventStream } from './events.js';
import { LlmError, LlmErrorType } from './errors.js';

// Mock concrete implementation for testing abstract class
class TestAdapter extends BaseAdapter {
  readonly providerName = 'test-provider';
  readonly capabilities: LlmProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: false,
    supportsImageInput: false,
    supportsImageGeneration: false,
    supportsEmbedding: false,
    supportsTokenCount: false,
    supportsSystemMessage: true,
    supportsThought: false,
    maxContextLength: 8192,
    maxOutputTokens: 4096,
  };

  constructor(config: AdapterConfig) {
    super(config);
  }

  async generateContent(
    _request: LlmGenerateRequest,
    _userPromptId: string,
  ): Promise<LlmGenerateResponse> {
    return { text: 'test' } as unknown as LlmGenerateResponse;
  }

  async *generateContentStream(
    _request: LlmGenerateRequest,
    _userPromptId: string,
  ): LlmEventStream {
    yield {
      type: LlmEventType.TextDelta,
      text: 'chunk',
    };
  }

  async countTokens(_request: LlmGenerateRequest): Promise<LlmTokenCount> {
    return { totalTokens: 10 };
  }

  mapToProviderConfig(_config: LlmGenerateConfig): Record<string, unknown> {
    return {};
  }

  // Test helper methods to expose protected methods for testing
  testValidateRequest(request: LlmGenerateRequest): void {
    return this.validateRequest(request);
  }

  testHandleError(error: unknown): never {
    return this.handleError(error);
  }
}

describe('BaseAdapter', () => {
  const validConfig: AdapterConfig = {
    apiKey: 'test-key',
  };

  it('should initialize with config', () => {
    const adapter = new TestAdapter(validConfig);
    expect(adapter).toBeDefined();
    expect(adapter.providerName).toBe('test-provider');
  });

  it('should provide capabilities', () => {
    const adapter = new TestAdapter(validConfig);
    const caps = adapter.capabilities;
    expect(caps.supportsStreaming).toBe(true);
  });

  it('should validate configuration', () => {
    // @ts-expect-error Testing null config validation
    expect(() => new TestAdapter(null)).toThrow('Configuration is required');
  });

  it('should require mapToProviderConfig implementation', () => {
    const adapter = new TestAdapter(validConfig);
    const mapped = adapter.mapToProviderConfig({
      provider: 'test',
      model: 'test',
    });
    expect(mapped).toEqual({});
  });

  it('should implement generateContentStream', async () => {
    const adapter = new TestAdapter(validConfig);
    const mockRequest: LlmGenerateRequest = {
      model: 'test-model',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    };
    const stream = adapter.generateContentStream(mockRequest, 'prompt-id');
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].type).toBe(LlmEventType.TextDelta);
  });

  it('should implement countTokens', async () => {
    const adapter = new TestAdapter(validConfig);
    const mockRequest: LlmGenerateRequest = {
      model: 'test-model',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    };
    const count = await adapter.countTokens(mockRequest);
    expect(count.totalTokens).toBe(10);
  });

  describe('validateRequest', () => {
    it('should throw error when model is missing', () => {
      const adapter = new TestAdapter(validConfig);
      const invalidRequest = {
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        ],
      } as LlmGenerateRequest;

      expect(() => adapter.testValidateRequest(invalidRequest)).toThrow(
        'Model is required',
      );
    });

    it('should throw error when messages are empty', () => {
      const adapter = new TestAdapter(validConfig);
      const invalidRequest = {
        model: 'test-model',
        messages: [],
      } as LlmGenerateRequest;

      expect(() => adapter.testValidateRequest(invalidRequest)).toThrow(
        'At least one message is required',
      );
    });

    it('should pass validation for valid request', () => {
      const adapter = new TestAdapter(validConfig);
      const validRequest: LlmGenerateRequest = {
        model: 'test-model',
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'hello' }] },
        ],
      };

      expect(() => adapter.testValidateRequest(validRequest)).not.toThrow();
    });
  });

  describe('handleError', () => {
    it('should wrap non-LlmError in LlmError', () => {
      const adapter = new TestAdapter(validConfig);
      const genericError = new Error('Something went wrong');

      expect(() => adapter.testHandleError(genericError)).toThrow(
        'test-provider error: Something went wrong',
      );
    });

    it('should rethrow LlmError as-is', () => {
      const adapter = new TestAdapter(validConfig);
      const llmError = new LlmError(LlmErrorType.RATE_LIMIT, 'Rate limit hit');

      expect(() => adapter.testHandleError(llmError)).toThrow(llmError);
    });
  });
});
