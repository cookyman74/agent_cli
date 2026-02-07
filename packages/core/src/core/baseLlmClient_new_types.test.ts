/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  BaseLlmClient,
  type LlmGenerateJsonOptions,
  type LlmGenerateContentOptions,
} from './baseLlmClient.js';
import type { ContentGenerator } from './contentGenerator.js';
import type { Config } from '../config/config.js';
import type { GenerateContentResponse } from '@google/genai';

describe('BaseLlmClient', () => {
  let mockContentGenerator: ContentGenerator;
  let mockConfig: Config;
  let baseLlmClient: BaseLlmClient;

  beforeEach(() => {
    mockContentGenerator = {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
      embedContent: vi.fn(),
    } as unknown as ContentGenerator;

    mockConfig = {
      modelConfigService: {
        getResolvedConfig: vi.fn().mockReturnValue({
          model: 'gemini-pro',
          config: {},
          maxAttempts: 1,
        }),
      },
      getActiveModel: vi.fn().mockReturnValue('gemini-pro'),
      getContentGeneratorConfig: vi
        .fn()
        .mockReturnValue({ authType: 'GOOGLE_ADC' }),
      isInteractive: vi.fn().mockReturnValue(false),
      getEmbeddingModel: vi.fn().mockReturnValue('embedding-001'),
      getModel: vi.fn().mockReturnValue('gemini-pro'),
      getModelAvailabilityService: vi.fn().mockReturnValue({
        selectFirstAvailable: vi
          .fn()
          .mockReturnValue({ selectedModel: 'gemini-pro', attempts: 1 }),
        markHealthy: vi.fn(),
        recordSuccess: vi.fn(),
        consumeStickyAttempt: vi.fn(),
      }),
      setActiveModel: vi.fn(),
    } as unknown as Config;

    baseLlmClient = new BaseLlmClient(mockContentGenerator, mockConfig);
  });

  describe('generateJson (New Type)', () => {
    it('should handle LlmGenerateJsonOptions and convert messages correctly', async () => {
      const mockResponse: GenerateContentResponse = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: '{"result": "success"}' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse;
      vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
        mockResponse,
      );

      const options: LlmGenerateJsonOptions = {
        modelConfigKey: { model: 'gemini-pro' },
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
        ],
        schema: { type: 'object' },
        abortSignal: new AbortController().signal,
        promptId: 'test-prompt',
      };

      const result = await baseLlmClient.generateJson(options);

      expect(result).toEqual({ result: 'success' });
      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            { role: 'user', parts: [{ text: 'Hello' }] },
            { role: 'model', parts: [{ text: 'Hi' }] },
          ],
        }),
        'test-prompt',
      );
    });
  });

  describe('generateContent (New Type)', () => {
    it('should handle LlmGenerateContentOptions and convert messages correctly', async () => {
      const mockResponse: GenerateContentResponse = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [{ text: 'Generated content' }],
            },
          },
        ],
      } as unknown as GenerateContentResponse;
      vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
        mockResponse,
      );

      const options: LlmGenerateContentOptions = {
        modelConfigKey: { model: 'gemini-pro' },
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Test prompt' }] },
        ],
        systemInstruction: 'System prompt',
        abortSignal: new AbortController().signal,
        promptId: 'test-content',
      };

      const result = await baseLlmClient.generateContent(options);

      expect(result).toBe(mockResponse);
      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [{ role: 'user', parts: [{ text: 'Test prompt' }] }],
          config: expect.objectContaining({
            systemInstruction: 'System prompt',
          }),
        }),
        'test-content',
      );
    });
  });

  describe('Image Handling', () => {
    it('should convert base64 image content correctly', async () => {
      const mockResponse: GenerateContentResponse = {
        candidates: [
          { content: { role: 'model', parts: [{ text: 'Image analyzed' }] } },
        ],
      } as unknown as GenerateContentResponse;
      vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
        mockResponse,
      );

      const options: LlmGenerateContentOptions = {
        modelConfigKey: { model: 'gemini-vision' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  mediaType: 'image/png',
                  data: 'base64data',
                },
              },
            ],
          },
        ],
        abortSignal: new AbortController().signal,
        promptId: 'image-test',
      };

      await baseLlmClient.generateContent(options);

      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: { mimeType: 'image/png', data: 'base64data' },
                },
              ],
            },
          ],
        }),
        'image-test',
      );
    });

    it('should convert URL image content correctly (fileData)', async () => {
      const mockResponse: GenerateContentResponse = {
        candidates: [
          {
            content: { role: 'model', parts: [{ text: 'URL Image analyzed' }] },
          },
        ],
      } as unknown as GenerateContentResponse;
      vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
        mockResponse,
      );

      const options: LlmGenerateContentOptions = {
        modelConfigKey: { model: 'gemini-vision' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'url',
                  mediaType: 'image/jpeg',
                  url: 'https://example.com/image.jpg',
                },
              },
            ],
          },
        ],
        abortSignal: new AbortController().signal,
        promptId: 'url-image-test',
      };

      await baseLlmClient.generateContent(options);

      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  fileData: {
                    mimeType: 'image/jpeg',
                    fileUri: 'https://example.com/image.jpg',
                  },
                },
              ],
            },
          ],
        }),
        'url-image-test',
      );
    });
  });

  describe('Tool Handling', () => {
    it('should convert tool_call content correctly', async () => {
      const mockResponse: GenerateContentResponse = {
        candidates: [{ content: { role: 'model', parts: [{ text: 'OK' }] } }],
      } as unknown as GenerateContentResponse;
      vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
        mockResponse,
      );

      const options: LlmGenerateContentOptions = {
        modelConfigKey: { model: 'gemini-pro' },
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_call',
                id: 'call-123',
                name: 'read_file',
                arguments: { path: '/tmp/test.txt' },
              },
            ],
          },
        ],
        abortSignal: new AbortController().signal,
        promptId: 'tool-call-test',
      };

      await baseLlmClient.generateContent(options);

      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            {
              role: 'model',
              parts: [
                {
                  functionCall: {
                    name: 'read_file',
                    args: { path: '/tmp/test.txt' },
                  },
                },
              ],
            },
          ],
        }),
        'tool-call-test',
      );
    });

    it('should convert tool_result content correctly', async () => {
      const mockResponse: GenerateContentResponse = {
        candidates: [{ content: { role: 'model', parts: [{ text: 'OK' }] } }],
      } as unknown as GenerateContentResponse;
      vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
        mockResponse,
      );

      const options: LlmGenerateContentOptions = {
        modelConfigKey: { model: 'gemini-pro' },
        messages: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool_result',
                toolCallId: 'call-123',
                name: 'read_file',
                content: 'file contents here',
              },
            ],
          },
        ],
        abortSignal: new AbortController().signal,
        promptId: 'tool-result-test',
      };

      await baseLlmClient.generateContent(options);

      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            {
              role: 'user', // tool role maps to user in Gemini
              parts: [
                {
                  functionResponse: {
                    name: 'read_file',
                    response: { result: 'file contents here' },
                  },
                },
              ],
            },
          ],
        }),
        'tool-result-test',
      );
    });

    it('should convert tool_result with structured content correctly', async () => {
      const mockResponse: GenerateContentResponse = {
        candidates: [{ content: { role: 'model', parts: [{ text: 'OK' }] } }],
      } as unknown as GenerateContentResponse;
      vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
        mockResponse,
      );

      const structuredContent = { files: ['a.txt', 'b.txt'], count: 2 };
      const options: LlmGenerateContentOptions = {
        modelConfigKey: { model: 'gemini-pro' },
        messages: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool_result',
                toolCallId: 'call-456',
                name: 'list_files',
                content: structuredContent,
              },
            ],
          },
        ],
        abortSignal: new AbortController().signal,
        promptId: 'tool-result-structured-test',
      };

      await baseLlmClient.generateContent(options);

      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            {
              role: 'user',
              parts: [
                {
                  functionResponse: {
                    name: 'list_files',
                    response: structuredContent,
                  },
                },
              ],
            },
          ],
        }),
        'tool-result-structured-test',
      );
    });
  });

  describe('Thought Handling', () => {
    it('should convert thought content to text with prefix', async () => {
      const mockResponse: GenerateContentResponse = {
        candidates: [{ content: { role: 'model', parts: [{ text: 'OK' }] } }],
      } as unknown as GenerateContentResponse;
      vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
        mockResponse,
      );

      const options: LlmGenerateContentOptions = {
        modelConfigKey: { model: 'gemini-pro' },
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'thought',
                thought: 'Let me think about this...',
              },
            ],
          },
        ],
        abortSignal: new AbortController().signal,
        promptId: 'thought-test',
      };

      await baseLlmClient.generateContent(options);

      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            {
              role: 'model',
              parts: [{ text: '[Thought] Let me think about this...' }],
            },
          ],
        }),
        'thought-test',
      );
    });
  });

  describe('System Role Handling', () => {
    it('should filter out system role messages (handled via systemInstruction)', async () => {
      const mockResponse: GenerateContentResponse = {
        candidates: [{ content: { role: 'model', parts: [{ text: 'OK' }] } }],
      } as unknown as GenerateContentResponse;
      vi.mocked(mockContentGenerator.generateContent).mockResolvedValue(
        mockResponse,
      );

      const options: LlmGenerateContentOptions = {
        modelConfigKey: { model: 'gemini-pro' },
        messages: [
          {
            role: 'system',
            content: [{ type: 'text', text: 'You are a helpful assistant' }],
          },
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
        ],
        systemInstruction: 'Be concise',
        abortSignal: new AbortController().signal,
        promptId: 'system-role-test',
      };

      await baseLlmClient.generateContent(options);

      // System role message should be filtered out
      expect(mockContentGenerator.generateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [
            { role: 'user', parts: [{ text: 'Hello' }] },
            { role: 'model', parts: [{ text: 'Hi there!' }] },
          ],
        }),
        'system-role-test',
      );
    });
  });
});
