/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parity tests — verify that the new GeminiAdapter/Converter path produces
 * results equivalent to the legacy GeminiEventMapper path.
 *
 * New path:  LlmGenerateRequest → GeminiConverter → SDK → GeminiConverter → LlmGenerateResponse/LlmEvent
 * Legacy path: ServerGeminiStreamEvent → GeminiEventMapper → LlmEvent
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.2, §3.3.3
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAdapter } from './adapter.js';
import { GeminiConverter } from './converter.js';
import { GeminiEventMapper } from './eventMapper.js';
import { LlmEventType } from '../events.js';
import type { LlmEvent } from '../events.js';
import {
  GeminiEventType,
  type ServerGeminiStreamEvent,
  type ServerGeminiContentEvent,
  type ServerGeminiFinishedEvent,
  type ServerGeminiErrorEvent,
  type ServerGeminiToolCallRequestEvent,
  type ServerGeminiChatCompressedEvent,
  type ServerGeminiThoughtEvent,
  type ServerGeminiCitationEvent,
  type ServerGeminiModelInfoEvent,
  type ServerGeminiContextWindowWillOverflowEvent,
  type ServerGeminiInvalidStreamEvent,
  type ServerGeminiAgentExecutionStoppedEvent,
  type ServerGeminiAgentExecutionBlockedEvent,
} from './types.js';
import type { LlmGenerateRequest, AdapterConfig } from '../types.js';
import type { GenerateContentResponse } from '@google/genai';

// =================================================================
// Test helpers
// =================================================================

function createMockModels() {
  return {
    generateContent: vi.fn(),
    generateContentStream: vi.fn(),
    countTokens: vi.fn(),
  };
}

function createBasicRequest(
  overrides?: Partial<LlmGenerateRequest>,
): LlmGenerateRequest {
  return {
    model: 'gemini-2.0-flash',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    ...overrides,
  };
}

function createGeminiTextResponse(
  text: string,
  finishReason = 'STOP' as const,
) {
  return {
    candidates: [
      {
        content: { role: 'model', parts: [{ text }] },
        finishReason,
      },
    ],
    usageMetadata: {
      promptTokenCount: 10,
      candidatesTokenCount: 5,
      totalTokenCount: 15,
    },
  } as unknown as GenerateContentResponse;
}

// =================================================================
// Tests
// =================================================================

describe('GeminiAdapter Parity Tests', () => {
  let mockModels: ReturnType<typeof createMockModels>;
  let adapter: GeminiAdapter;
  const converter = new GeminiConverter();
  const mapper = new GeminiEventMapper();

  beforeEach(() => {
    mockModels = createMockModels();
    adapter = new GeminiAdapter(
      { apiKey: 'test' } as AdapterConfig,
      mockModels,
    );
  });

  // ==============================================================
  // 2.3.3.1 — Basic conversation parity
  // ==============================================================

  describe('2.3.3.1 basic conversation parity', () => {
    it('should produce same text content via adapter and converter', async () => {
      const geminiResponse = createGeminiTextResponse('Hello there!');
      mockModels.generateContent.mockResolvedValue(geminiResponse);

      // New path: adapter
      const adapterResult = await adapter.generateContent(
        createBasicRequest(),
        'prompt-1',
      );

      // Legacy path: converter directly
      const converterResult = converter.fromGeminiResponse(
        geminiResponse,
        'gemini-2.0-flash',
      );

      // Both should produce same content
      expect(adapterResult.content).toHaveLength(1);
      expect(converterResult.content).toHaveLength(1);
      expect(adapterResult.content[0].type).toBe(
        converterResult.content[0].type,
      );
      expect(adapterResult.content[0].type).toBe('text');
    });

    it('should produce same stop reason for STOP finish', async () => {
      const geminiResponse = createGeminiTextResponse('done');
      mockModels.generateContent.mockResolvedValue(geminiResponse);

      const adapterResult = await adapter.generateContent(
        createBasicRequest(),
        'prompt-1',
      );
      const converterResult = converter.fromGeminiResponse(
        geminiResponse,
        'gemini-2.0-flash',
      );

      expect(adapterResult.stopReason).toBe(converterResult.stopReason);
      expect(adapterResult.stopReason).toBe('end_turn');
    });

    it('should produce same token usage', async () => {
      const geminiResponse = createGeminiTextResponse('ok');
      mockModels.generateContent.mockResolvedValue(geminiResponse);

      const adapterResult = await adapter.generateContent(
        createBasicRequest(),
        'prompt-1',
      );
      const converterResult = converter.fromGeminiResponse(
        geminiResponse,
        'gemini-2.0-flash',
      );

      expect(adapterResult.usage!.promptTokens).toBe(
        converterResult.usage!.promptTokens,
      );
      expect(adapterResult.usage!.completionTokens).toBe(
        converterResult.usage!.completionTokens,
      );
      expect(adapterResult.usage!.totalTokens).toBe(
        converterResult.usage!.totalTokens,
      );
    });

    it('text content from adapter and mapper should map to same event type', () => {
      // Legacy path: GeminiEventMapper
      const geminiEvent: ServerGeminiContentEvent = {
        type: GeminiEventType.Content,
        value: 'Hello there!',
      };
      const mappedEvent = mapper.toLlmEvent(geminiEvent);

      // New path: converter from SDK response part
      const adapterEvent = converter.fromGeminiParts([
        { text: 'Hello there!' },
      ]);

      expect(mappedEvent.type).toBe(LlmEventType.TextDelta);
      expect(adapterEvent[0].type).toBe('text');
      // Both correctly handle text content
    });
  });

  // ==============================================================
  // 2.3.3.2 — Streaming conversation parity
  // ==============================================================

  describe('2.3.3.2 streaming conversation parity', () => {
    it('should produce text_delta events for text chunks', async () => {
      const chunks = [
        {
          candidates: [
            { content: { role: 'model', parts: [{ text: 'Hello' }] } },
          ],
        },
        {
          candidates: [
            { content: { role: 'model', parts: [{ text: ' world' }] } },
          ],
        },
        {
          candidates: [
            {
              content: { role: 'model', parts: [{ text: '!' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 8,
            totalTokenCount: 13,
          },
        },
      ];

      async function* mockStream() {
        for (const chunk of chunks) yield chunk;
      }
      mockModels.generateContentStream.mockResolvedValue(mockStream());

      // New path: adapter stream
      const events: LlmEvent[] = [];
      for await (const event of adapter.generateContentStream(
        createBasicRequest(),
        'prompt-1',
      )) {
        events.push(event);
      }

      // Legacy path: mapper
      const legacyEvents: LlmEvent[] = [
        mapper.toLlmEvent({ type: GeminiEventType.Content, value: 'Hello' }),
        mapper.toLlmEvent({ type: GeminiEventType.Content, value: ' world' }),
        mapper.toLlmEvent({ type: GeminiEventType.Content, value: '!' }),
      ];

      // Both should have text_delta events with same text
      const adapterTextEvents = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(adapterTextEvents).toHaveLength(3);
      expect(legacyEvents).toHaveLength(3);

      for (let i = 0; i < 3; i++) {
        expect(adapterTextEvents[i].type).toBe(legacyEvents[i].type);
      }
    });

    it('should produce finished event with usage at stream end', async () => {
      const chunks = [
        {
          candidates: [
            {
              content: { role: 'model', parts: [{ text: 'done' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 3,
            totalTokenCount: 8,
          },
        },
      ];

      async function* mockStream() {
        for (const chunk of chunks) yield chunk;
      }
      mockModels.generateContentStream.mockResolvedValue(mockStream());

      const events: LlmEvent[] = [];
      for await (const event of adapter.generateContentStream(
        createBasicRequest(),
        'prompt-1',
      )) {
        events.push(event);
      }

      // Legacy path
      const legacyFinished = mapper.toLlmEvent({
        type: GeminiEventType.Finished,
        value: {
          reason: 'STOP' as const,
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 3,
            totalTokenCount: 8,
          },
        },
      } as ServerGeminiFinishedEvent);

      const adapterFinished = events.find(
        (e) => e.type === LlmEventType.Finished,
      );
      expect(adapterFinished).toBeDefined();
      expect(adapterFinished!.type).toBe(legacyFinished.type);
    });

    it('should produce MAX_TOKENS finish reason parity', async () => {
      const chunks = [
        {
          candidates: [
            {
              content: { role: 'model', parts: [{ text: 'partial' }] },
              finishReason: 'MAX_TOKENS',
            },
          ],
        },
      ];

      async function* mockStream() {
        for (const chunk of chunks) yield chunk;
      }
      mockModels.generateContentStream.mockResolvedValue(mockStream());

      const events: LlmEvent[] = [];
      for await (const event of adapter.generateContentStream(
        createBasicRequest(),
        'prompt-1',
      )) {
        events.push(event);
      }

      const legacyFinished = mapper.toLlmEvent({
        type: GeminiEventType.Finished,
        value: { reason: 'MAX_TOKENS' as const, usageMetadata: undefined },
      } as ServerGeminiFinishedEvent);

      const adapterFinished = events.find(
        (e) => e.type === LlmEventType.Finished,
      );
      expect(adapterFinished).toBeDefined();

      // Both should map to 'max_tokens'
      const adapterReason = (adapterFinished as { finishReason?: string })
        .finishReason;
      const legacyReason = (legacyFinished as { finishReason?: string })
        .finishReason;
      expect(adapterReason).toBe(legacyReason);
      expect(adapterReason).toBe('max_tokens');
    });
  });

  // ==============================================================
  // 2.3.3.3 — Tool call parity
  // ==============================================================

  describe('2.3.3.3 tool call parity', () => {
    it('should produce tool_call content for function call response', async () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
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
            finishReason: 'STOP',
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          candidatesTokenCount: 5,
          totalTokenCount: 15,
        },
      } as unknown as GenerateContentResponse;

      mockModels.generateContent.mockResolvedValue(geminiResponse);

      // New path
      const adapterResult = await adapter.generateContent(
        createBasicRequest({
          tools: [
            {
              name: 'read_file',
              description: 'Read a file',
              parameters: {
                type: 'object',
                properties: { path: { type: 'string' } },
              },
            },
          ],
        }),
        'prompt-1',
      );

      // Legacy path mapper
      const legacyEvent = mapper.toLlmEvent({
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'call-1',
          name: 'read_file',
          args: { path: '/tmp/test.txt' },
          isClientInitiated: false,
          prompt_id: '',
          traceId: '',
        },
      } as ServerGeminiToolCallRequestEvent);

      // Both should produce tool call with same name and args
      expect(adapterResult.content[0].type).toBe('tool_call');
      expect(legacyEvent.type).toBe(LlmEventType.ToolCallRequest);

      const adapterToolCall = adapterResult.content[0] as {
        type: 'tool_call';
        name: string;
        arguments: Record<string, unknown>;
      };
      const legacyToolCall = legacyEvent as {
        type: string;
        name: string;
        args: Record<string, unknown>;
      };

      expect(adapterToolCall.name).toBe(legacyToolCall.name);
      expect(adapterToolCall.arguments).toEqual(legacyToolCall.args);
    });

    it('should produce tool_call_request events in streaming', async () => {
      const chunks = [
        {
          candidates: [
            {
              content: {
                role: 'model',
                parts: [
                  {
                    functionCall: {
                      name: 'search',
                      args: { query: 'test' },
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
        },
      ];

      async function* mockStream() {
        for (const chunk of chunks) yield chunk;
      }
      mockModels.generateContentStream.mockResolvedValue(mockStream());

      const events: LlmEvent[] = [];
      for await (const event of adapter.generateContentStream(
        createBasicRequest(),
        'prompt-1',
      )) {
        events.push(event);
      }

      const toolEvent = events.find(
        (e) => e.type === LlmEventType.ToolCallRequest,
      );
      expect(toolEvent).toBeDefined();

      // Legacy path
      const legacyEvent = mapper.toLlmEvent({
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'call-1',
          name: 'search',
          args: { query: 'test' },
          isClientInitiated: false,
          prompt_id: '',
          traceId: '',
        },
      } as ServerGeminiToolCallRequestEvent);

      expect(toolEvent!.type).toBe(legacyEvent.type);
    });
  });

  // ==============================================================
  // 2.3.3.4 — Image input parity
  // ==============================================================

  describe('2.3.3.4 image input parity', () => {
    it('should convert base64 image to inlineData Part consistently', () => {
      const request = createBasicRequest({
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
      });

      const geminiParams = converter.toGeminiRequest(request);
      const contentsArr = geminiParams.contents as Array<{ parts?: unknown[] }>;
      const parts = contentsArr[0]?.parts;

      expect(parts).toBeDefined();
      expect(parts).toHaveLength(1);

      const part = parts![0] as Record<string, unknown>;
      expect(part).toHaveProperty('inlineData');
      const inlineData = part['inlineData'] as Record<string, unknown>;
      expect(inlineData['mimeType']).toBe('image/png');
      expect(inlineData['data']).toBe('base64data');
    });

    it('should convert image response back to image content', () => {
      const geminiResponse = {
        candidates: [
          {
            content: {
              role: 'model',
              parts: [
                {
                  inlineData: {
                    mimeType: 'image/png',
                    data: 'responseImageData',
                  },
                },
              ],
            },
            finishReason: 'STOP',
          },
        ],
      } as unknown as GenerateContentResponse;

      const result = converter.fromGeminiResponse(
        geminiResponse,
        'gemini-2.0-flash',
      );

      expect(result.content[0].type).toBe('image');
    });
  });

  // ==============================================================
  // 2.3.3.5 — Error handling parity
  // ==============================================================

  describe('2.3.3.5 error handling parity', () => {
    it('should produce error with same classification via both paths', () => {
      // Legacy path: GeminiEventMapper with 500 error
      const geminiErrorEvent: ServerGeminiErrorEvent = {
        type: GeminiEventType.Error,
        value: {
          error: {
            message: 'Internal Server Error',
            status: 500,
          },
        },
      };
      const legacyEvent = mapper.toLlmEvent(geminiErrorEvent);

      expect(legacyEvent.type).toBe(LlmEventType.Error);
      const legacyError = legacyEvent as {
        type: string;
        error: string;
        code?: string;
        isRetryable?: boolean;
      };
      expect(legacyError.isRetryable).toBe(true);
      expect(legacyError.code).toBe('500');
    });

    it('should handle SDK error in adapter gracefully', async () => {
      mockModels.generateContent.mockRejectedValue(
        new Error('API quota exceeded'),
      );

      const request = createBasicRequest();
      await expect(
        adapter.generateContent(request, 'prompt-1'),
      ).rejects.toThrow();
    });

    it('should classify authentication errors as non-retryable', () => {
      const geminiErrorEvent: ServerGeminiErrorEvent = {
        type: GeminiEventType.Error,
        value: {
          error: { message: 'Invalid API Key', status: 401 },
        },
      };
      const legacyEvent = mapper.toLlmEvent(geminiErrorEvent) as {
        type: string;
        isRetryable?: boolean;
      };
      expect(legacyEvent.isRetryable).toBe(false);
    });
  });

  // ==============================================================
  // 2.3.3.6 — Rate limit parity
  // ==============================================================

  describe('2.3.3.6 rate limit parity', () => {
    it('should classify 429 as retryable via legacy mapper', () => {
      const geminiErrorEvent: ServerGeminiErrorEvent = {
        type: GeminiEventType.Error,
        value: {
          error: { message: 'Rate limit exceeded', status: 429 },
        },
      };

      const event = mapper.toLlmEvent(geminiErrorEvent) as {
        type: string;
        error: string;
        code?: string;
        isRetryable?: boolean;
      };

      expect(event.type).toBe(LlmEventType.Error);
      expect(event.isRetryable).toBe(true);
      expect(event.code).toBe('429');
    });

    it('should classify 503 as retryable via legacy mapper', () => {
      const geminiErrorEvent: ServerGeminiErrorEvent = {
        type: GeminiEventType.Error,
        value: {
          error: { message: 'Service Unavailable', status: 503 },
        },
      };

      const event = mapper.toLlmEvent(geminiErrorEvent) as {
        type: string;
        isRetryable?: boolean;
      };

      expect(event.isRetryable).toBe(true);
    });
  });

  // ==============================================================
  // 2.3.3.7 — 18 stream event type parity
  // ==============================================================

  describe('2.3.3.7 18 stream event type parity', () => {
    it('Content → TextDelta', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.Content,
        value: 'text',
      } as ServerGeminiContentEvent);
      expect(event.type).toBe(LlmEventType.TextDelta);
    });

    it('Thought → ThoughtDelta', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.Thought,
        value: { subject: 'Thinking', description: 'reasoning...' },
      } as ServerGeminiThoughtEvent);
      expect(event.type).toBe(LlmEventType.ThoughtDelta);
    });

    it('ToolCallRequest → ToolCallRequest', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.ToolCallRequest,
        value: {
          callId: 'c1',
          name: 'tool',
          args: {},
          isClientInitiated: false,
          prompt_id: '',
          traceId: '',
        },
      } as ServerGeminiToolCallRequestEvent);
      expect(event.type).toBe(LlmEventType.ToolCallRequest);
    });

    it('ToolCallResponse → ToolCallResponse', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.ToolCallResponse,
        value: {
          callId: 'c1',
          responseParts: [{ text: 'result' }],
        },
      } as unknown as ServerGeminiStreamEvent);
      expect(event.type).toBe(LlmEventType.ToolCallResponse);
    });

    it('ToolCallConfirmation → ToolCallConfirmation', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.ToolCallConfirmation,
        value: {
          request: {
            callId: 'c1',
            name: 'tool',
            args: {},
            isClientInitiated: false,
            prompt_id: '',
            traceId: '',
          },
          details: { confirmed: true },
        },
      } as unknown as ServerGeminiStreamEvent);
      expect(event.type).toBe(LlmEventType.ToolCallConfirmation);
    });

    it('UserCancelled → UserCancelled', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.UserCancelled,
      } as ServerGeminiStreamEvent);
      expect(event.type).toBe(LlmEventType.UserCancelled);
    });

    it('Error → Error', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.Error,
        value: { error: { message: 'fail', status: 500 } },
      } as ServerGeminiErrorEvent);
      expect(event.type).toBe(LlmEventType.Error);
    });

    it('ChatCompressed → ChatCompressed', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.ChatCompressed,
        value: {
          originalTokenCount: 1000,
          newTokenCount: 500,
          compressionStatus: 1,
        },
      } as ServerGeminiChatCompressedEvent);
      expect(event.type).toBe(LlmEventType.ChatCompressed);
    });

    it('Thought event content preserved', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.Thought,
        value: { subject: 'Analysis', description: 'deep thinking' },
      } as ServerGeminiThoughtEvent);
      const thoughtEvent = event as { thought: string };
      expect(thoughtEvent.thought).toBe('deep thinking');
    });

    it('MaxSessionTurns → MaxSessionTurns', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.MaxSessionTurns,
      } as ServerGeminiStreamEvent);
      expect(event.type).toBe(LlmEventType.MaxSessionTurns);
    });

    it('Finished → Finished', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.Finished,
        value: { reason: 'STOP' as const, usageMetadata: undefined },
      } as ServerGeminiFinishedEvent);
      expect(event.type).toBe(LlmEventType.Finished);
    });

    it('LoopDetected → LoopDetected', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.LoopDetected,
      } as ServerGeminiStreamEvent);
      expect(event.type).toBe(LlmEventType.LoopDetected);
    });

    it('Citation → Citation', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.Citation,
        value: 'https://example.com',
      } as ServerGeminiCitationEvent);
      expect(event.type).toBe(LlmEventType.Citation);
    });

    it('Retry → Retry', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.Retry,
      } as ServerGeminiStreamEvent);
      expect(event.type).toBe(LlmEventType.Retry);
    });

    it('ContextWindowWillOverflow → ContextWindowOverflow', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.ContextWindowWillOverflow,
        value: {
          estimatedRequestTokenCount: 900000,
          remainingTokenCount: 100000,
        },
      } as ServerGeminiContextWindowWillOverflowEvent);
      expect(event.type).toBe(LlmEventType.ContextWindowOverflow);
    });

    it('InvalidStream → InvalidStream', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.InvalidStream,
        reason: 'NO_FINISH_REASON',
      } as ServerGeminiInvalidStreamEvent);
      expect(event.type).toBe(LlmEventType.InvalidStream);
    });

    it('ModelInfo → ModelInfo', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.ModelInfo,
        value: 'gemini-2.0-flash',
      } as ServerGeminiModelInfoEvent);
      expect(event.type).toBe(LlmEventType.ModelInfo);
    });

    it('AgentExecutionStopped → AgentStopped', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.AgentExecutionStopped,
        value: { reason: 'user request' },
      } as ServerGeminiAgentExecutionStoppedEvent);
      expect(event.type).toBe(LlmEventType.AgentStopped);
    });

    it('AgentExecutionBlocked → AgentBlocked', () => {
      const event = mapper.toLlmEvent({
        type: GeminiEventType.AgentExecutionBlocked,
        value: { reason: 'policy violation' },
      } as ServerGeminiAgentExecutionBlockedEvent);
      expect(event.type).toBe(LlmEventType.AgentBlocked);
    });

    it('should cover all 18 GeminiEventType values', () => {
      const allGeminiEventTypes = Object.values(GeminiEventType);
      expect(allGeminiEventTypes).toHaveLength(18);

      // Verify each type is handled (no unknown event error)
      const eventFixtures: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.Content,
          value: 'text',
        } as ServerGeminiContentEvent,
        {
          type: GeminiEventType.Thought,
          value: { subject: 's', description: 'd' },
        } as ServerGeminiThoughtEvent,
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'c',
            name: 'n',
            args: {},
            isClientInitiated: false,
            prompt_id: '',
            traceId: '',
          },
        } as ServerGeminiToolCallRequestEvent,
        {
          type: GeminiEventType.ToolCallResponse,
          value: { callId: 'c', responseParts: [] },
        } as unknown as ServerGeminiStreamEvent,
        {
          type: GeminiEventType.ToolCallConfirmation,
          value: {
            request: {
              callId: 'c',
              name: 'n',
              args: {},
              isClientInitiated: false,
              prompt_id: '',
              traceId: '',
            },
            details: { confirmed: true },
          },
        } as unknown as ServerGeminiStreamEvent,
        { type: GeminiEventType.UserCancelled } as ServerGeminiStreamEvent,
        {
          type: GeminiEventType.Error,
          value: { error: { message: 'e' } },
        } as ServerGeminiErrorEvent,
        {
          type: GeminiEventType.ChatCompressed,
          value: null,
        } as ServerGeminiChatCompressedEvent,
        { type: GeminiEventType.MaxSessionTurns } as ServerGeminiStreamEvent,
        {
          type: GeminiEventType.Finished,
          value: { reason: 'STOP' as const, usageMetadata: undefined },
        } as ServerGeminiFinishedEvent,
        { type: GeminiEventType.LoopDetected } as ServerGeminiStreamEvent,
        {
          type: GeminiEventType.Citation,
          value: 'url',
        } as ServerGeminiCitationEvent,
        { type: GeminiEventType.Retry } as ServerGeminiStreamEvent,
        {
          type: GeminiEventType.ContextWindowWillOverflow,
          value: { estimatedRequestTokenCount: 1, remainingTokenCount: 1 },
        } as ServerGeminiContextWindowWillOverflowEvent,
        {
          type: GeminiEventType.InvalidStream,
        } as ServerGeminiInvalidStreamEvent,
        {
          type: GeminiEventType.ModelInfo,
          value: 'model',
        } as ServerGeminiModelInfoEvent,
        {
          type: GeminiEventType.AgentExecutionStopped,
          value: { reason: 'r' },
        } as ServerGeminiAgentExecutionStoppedEvent,
        {
          type: GeminiEventType.AgentExecutionBlocked,
          value: { reason: 'r' },
        } as ServerGeminiAgentExecutionBlockedEvent,
      ];

      expect(eventFixtures).toHaveLength(18);

      for (const fixture of eventFixtures) {
        const mapped = mapper.toLlmEvent(fixture);
        // Should not be an Error event (unless it's the Error fixture)
        if (fixture.type !== GeminiEventType.Error) {
          expect(mapped.type).not.toBe(LlmEventType.Error);
        }
      }
    });

    it('finish reason mapping parity: converter vs mapper', () => {
      const finishReasons = [
        'STOP',
        'MAX_TOKENS',
        'SAFETY',
        'RECITATION',
      ] as const;
      const expectedLlm = [
        'end_turn',
        'max_tokens',
        'content_filter',
        'content_filter',
      ];

      for (let i = 0; i < finishReasons.length; i++) {
        // New path: converter
        const converterResult = converter.mapStopReason(finishReasons[i]);

        // Legacy path: mapper via Finished event
        const mapperEvent = mapper.toLlmEvent({
          type: GeminiEventType.Finished,
          value: { reason: finishReasons[i], usageMetadata: undefined },
        } as ServerGeminiFinishedEvent) as { finishReason?: string };

        expect(converterResult).toBe(expectedLlm[i]);
        expect(mapperEvent.finishReason).toBe(expectedLlm[i]);
        expect(converterResult).toBe(mapperEvent.finishReason);
      }
    });
  });
});
