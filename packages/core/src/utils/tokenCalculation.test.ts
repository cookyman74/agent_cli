/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateRequestTokenCount,
  estimateLlmTokenCount,
} from './tokenCalculation.js';
import type { ContentGenerator } from '../core/contentGenerator.js';
import type { LlmContent, LlmGenerateRequest } from '../providers/types.js';

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

// =================================================================
// calculateRequestTokenCount — non-Gemini provider path
// =================================================================

describe('calculateRequestTokenCount — non-Gemini provider', () => {
  let nonGeminiGenerator: ContentGenerator;
  let mockLlmCountTokens: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockLlmCountTokens = vi.fn().mockResolvedValue({ totalTokens: 150 });
    nonGeminiGenerator = {
      countTokens: vi.fn(),
      providerName: 'claude',
      llmGenerateContent: vi.fn(),
      llmGenerateContentStream: vi.fn(),
      llmCountTokens: mockLlmCountTokens,
    } as unknown as ContentGenerator;
  });

  // [RED-D1] non-Gemini + media → llmCountTokens 호출
  it('D1: calls llmCountTokens for non-Gemini provider with media', async () => {
    const request = [{ inlineData: { mimeType: 'image/png', data: 'data' } }];

    const count = await calculateRequestTokenCount(
      request,
      nonGeminiGenerator,
      'claude-sonnet',
    );

    expect(count).toBe(150);
    expect(mockLlmCountTokens).toHaveBeenCalled();
    expect(nonGeminiGenerator.countTokens).not.toHaveBeenCalled();
  });

  // [RED-D2] non-Gemini + text only → 로컬 추정치 (API 미호출)
  it('D2: uses local estimate for non-Gemini text-only input', async () => {
    const request = 'Hello world!';

    const count = await calculateRequestTokenCount(
      request,
      nonGeminiGenerator,
      'claude-sonnet',
    );

    // 12 ASCII chars * 0.25 = 3
    expect(count).toBe(3);
    expect(mockLlmCountTokens).not.toHaveBeenCalled();
    expect(nonGeminiGenerator.countTokens).not.toHaveBeenCalled();
  });

  // [RED-D3] Gemini + media → 기존 countTokens 유지 (회귀)
  it('D3: uses legacy countTokens for Gemini provider with media', async () => {
    const geminiGenerator = {
      countTokens: vi.fn().mockResolvedValue({ totalTokens: 200 }),
      providerName: 'gemini',
      llmGenerateContent: vi.fn(),
      llmGenerateContentStream: vi.fn(),
      llmCountTokens: vi.fn(),
    } as unknown as ContentGenerator;

    const request = [{ inlineData: { mimeType: 'image/png', data: 'data' } }];

    const count = await calculateRequestTokenCount(
      request,
      geminiGenerator,
      'gemini-2.5-flash',
    );

    expect(count).toBe(200);
    expect(geminiGenerator.countTokens).toHaveBeenCalled();
    expect(geminiGenerator.llmCountTokens).not.toHaveBeenCalled();
  });

  // [RED-D4] non-Gemini + media + llmCountTokens 실패 → fallback
  it('D4: falls back to local estimate when llmCountTokens fails', async () => {
    mockLlmCountTokens.mockRejectedValue(new Error('Not implemented'));
    const request = [
      { text: 'Hello' },
      { inlineData: { mimeType: 'image/png', data: 'data' } },
    ];

    const count = await calculateRequestTokenCount(
      request,
      nonGeminiGenerator,
      'claude-sonnet',
    );

    // Fallback: 'Hello' (5*0.25=1.25) + image (3000) = 3001.25 → 3001
    expect(count).toBe(3001);
    expect(mockLlmCountTokens).toHaveBeenCalled();
  });

  // [RED-D5] non-Gemini + media → LlmGenerateRequest 구조 검증
  it('D5: passes correct LlmGenerateRequest structure to llmCountTokens', async () => {
    const request = [
      { text: 'Describe this image' },
      { inlineData: { mimeType: 'image/png', data: 'base64data' } },
    ];

    await calculateRequestTokenCount(
      request,
      nonGeminiGenerator,
      'claude-sonnet',
    );

    expect(mockLlmCountTokens).toHaveBeenCalledTimes(1);
    const llmRequest = mockLlmCountTokens.mock
      .calls[0][0] as LlmGenerateRequest;
    expect(llmRequest.model).toBe('claude-sonnet');
    expect(llmRequest.messages).toHaveLength(1);
    expect(llmRequest.messages[0].role).toBe('user');
    expect(llmRequest.messages[0].content.length).toBeGreaterThan(0);
  });
});
