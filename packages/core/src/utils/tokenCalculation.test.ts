/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import {
  calculateRequestTokenCount,
  estimateLlmTokenCount,
} from './tokenCalculation.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { LlmContent } from '../providers/types.js';

describe('calculateRequestTokenCount', () => {
  const mockContentGenerator = {
    countTokens: vi.fn(),
  } as unknown as ContentGenerator;

  const model = 'gemini-pro';

  it('should use countTokens API for media requests (images/files)', async () => {
    vi.mocked(mockContentGenerator.countTokens).mockResolvedValue({
      totalTokens: 100,
    });
    const request = [{ inlineData: { mimeType: 'image/png', data: 'data' } }];

    const count = await calculateRequestTokenCount(
      request,
      mockContentGenerator,
      model,
    );

    expect(count).toBe(100);
    expect(mockContentGenerator.countTokens).toHaveBeenCalled();
  });

  it('should estimate tokens locally for tool calls', async () => {
    vi.mocked(mockContentGenerator.countTokens).mockClear();
    const request = [{ functionCall: { name: 'foo', args: { bar: 'baz' } } }];

    const count = await calculateRequestTokenCount(
      request,
      mockContentGenerator,
      model,
    );

    // Estimation logic: JSON.stringify(part).length / 4
    // JSON: {"functionCall":{"name":"foo","args":{"bar":"baz"}}}
    // Length: ~53 chars. 53 / 4 = 13.25 -> 13.
    expect(count).toBeGreaterThan(0);
    expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
  });

  it('should estimate tokens locally for simple ASCII text', async () => {
    vi.mocked(mockContentGenerator.countTokens).mockClear();
    // 12 chars. 12 * 0.25 = 3 tokens.
    const request = 'Hello world!';

    const count = await calculateRequestTokenCount(
      request,
      mockContentGenerator,
      model,
    );

    expect(count).toBe(3);
    expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
  });

  it('should estimate tokens locally for CJK text with higher weight', async () => {
    vi.mocked(mockContentGenerator.countTokens).mockClear();
    // 2 chars. 2 * 1.3 = 2.6 -> floor(2.6) = 2.
    // Old logic would be 2/4 = 0.5 -> 0.
    const request = '你好';

    const count = await calculateRequestTokenCount(
      request,
      mockContentGenerator,
      model,
    );

    expect(count).toBeGreaterThanOrEqual(2);
    expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
  });

  it('should handle mixed content', async () => {
    vi.mocked(mockContentGenerator.countTokens).mockClear();
    // 'Hi': 2 * 0.25 = 0.5
    // '你好': 2 * 1.3 = 2.6
    // Total: 3.1 -> 3
    const request = 'Hi你好';

    const count = await calculateRequestTokenCount(
      request,
      mockContentGenerator,
      model,
    );

    expect(count).toBe(3);
    expect(mockContentGenerator.countTokens).not.toHaveBeenCalled();
  });

  it('should handle empty text', async () => {
    const request = '';
    const count = await calculateRequestTokenCount(
      request,
      mockContentGenerator,
      model,
    );
    expect(count).toBe(0);
  });

  it('should fallback to local estimation when countTokens API fails', async () => {
    vi.mocked(mockContentGenerator.countTokens).mockRejectedValue(
      new Error('API error'),
    );
    const request = [
      { text: 'Hello' },
      { inlineData: { mimeType: 'image/png', data: 'data' } },
    ];

    const count = await calculateRequestTokenCount(
      request,
      mockContentGenerator,
      model,
    );

    // Should fallback to estimation:
    // 'Hello': 5 chars * 0.25 = 1.25
    // inlineData: 3000
    // Total: 3001.25 -> 3001
    expect(count).toBe(3001);
    expect(mockContentGenerator.countTokens).toHaveBeenCalled();
  });

  it('should use fixed estimate for images in fallback', async () => {
    vi.mocked(mockContentGenerator.countTokens).mockRejectedValue(
      new Error('API error'),
    );
    const request = [
      { inlineData: { mimeType: 'image/png', data: 'large_data' } },
    ];

    const count = await calculateRequestTokenCount(
      request,
      mockContentGenerator,
      model,
    );

    expect(count).toBe(3000);
  });

  it('should use countTokens API for PDF requests', async () => {
    vi.mocked(mockContentGenerator.countTokens).mockResolvedValue({
      totalTokens: 5160,
    });
    const request = [
      { inlineData: { mimeType: 'application/pdf', data: 'pdf_data' } },
    ];

    const count = await calculateRequestTokenCount(
      request,
      mockContentGenerator,
      model,
    );

    expect(count).toBe(5160);
    expect(mockContentGenerator.countTokens).toHaveBeenCalled();
  });

  it('should use fixed estimate for PDFs in fallback', async () => {
    vi.mocked(mockContentGenerator.countTokens).mockRejectedValue(
      new Error('API error'),
    );
    const request = [
      { inlineData: { mimeType: 'application/pdf', data: 'large_pdf_data' } },
    ];

    const count = await calculateRequestTokenCount(
      request,
      mockContentGenerator,
      model,
    );

    // PDF estimate: 25800 tokens (~100 pages at 258 tokens/page)
    expect(count).toBe(25800);
  });
});

// =================================================================
// 2.5.1 Provider-independent token estimation (LlmContent)
// =================================================================

describe('estimateLlmTokenCount', () => {
  it('should estimate tokens for text content', () => {
    const contents: LlmContent[] = [{ type: 'text', text: 'Hello world!' }];

    // 12 ASCII chars * 0.25 = 3
    expect(estimateLlmTokenCount(contents)).toBe(3);
  });

  it('should estimate tokens for CJK text', () => {
    const contents: LlmContent[] = [{ type: 'text', text: '你好' }];

    // 2 non-ASCII chars * 1.3 = 2.6 → floor = 2
    expect(estimateLlmTokenCount(contents)).toBeGreaterThanOrEqual(2);
  });

  it('should estimate tokens for image content', () => {
    const contents: LlmContent[] = [
      {
        type: 'image',
        source: { type: 'base64', mediaType: 'image/png', data: 'abc123' },
      },
    ];

    expect(estimateLlmTokenCount(contents)).toBe(3000);
  });

  it('should estimate tokens for PDF image content', () => {
    const contents: LlmContent[] = [
      {
        type: 'image',
        source: {
          type: 'base64',
          mediaType: 'application/pdf',
          data: 'pdf_data',
        },
      },
    ];

    expect(estimateLlmTokenCount(contents)).toBe(25800);
  });

  it('should estimate tokens for tool_call content', () => {
    const contents: LlmContent[] = [
      {
        type: 'tool_call',
        id: 'call-1',
        name: 'read_file',
        arguments: { path: '/tmp/test.txt' },
      },
    ];

    // JSON.stringify length / 4
    expect(estimateLlmTokenCount(contents)).toBeGreaterThan(0);
  });

  it('should estimate tokens for tool_result content', () => {
    const contents: LlmContent[] = [
      {
        type: 'tool_result',
        toolCallId: 'call-1',
        content: 'file contents here',
      },
    ];

    expect(estimateLlmTokenCount(contents)).toBeGreaterThan(0);
  });

  it('should estimate tokens for thought content', () => {
    const contents: LlmContent[] = [
      { type: 'thought', thought: 'I should think about this carefully' },
    ];

    expect(estimateLlmTokenCount(contents)).toBeGreaterThan(0);
  });

  it('should sum tokens across multiple contents', () => {
    const contents: LlmContent[] = [
      { type: 'text', text: 'Hello' },
      { type: 'text', text: 'World' },
    ];

    // 5 + 5 = 10 ASCII chars * 0.25 = 2.5 → floor = 2
    const result = estimateLlmTokenCount(contents);
    expect(result).toBe(2);
  });

  it('should return 0 for empty array', () => {
    expect(estimateLlmTokenCount([])).toBe(0);
  });
});
