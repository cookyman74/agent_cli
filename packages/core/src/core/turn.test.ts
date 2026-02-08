/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Turn, LlmEventType } from './turn.js';
import type {
  LlmToolCallRequestEvent,
  LlmErrorEvent,
} from '../providers/events.js';
import type { GenerateContentResponse, Part, Content } from '@google/genai';
import { reportError } from '../utils/errorReporting.js';
import type { GeminiChat } from './geminiChat.js';
import { InvalidStreamError, StreamEventType } from './geminiChat.js';

const mockSendMessageStream = vi.fn();
const mockGetHistory = vi.fn();
const mockMaybeIncludeSchemaDepthContext = vi.fn();

vi.mock('@google/genai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@google/genai')>();
  const MockChat = vi.fn().mockImplementation(() => ({
    sendMessageStream: mockSendMessageStream,
    getHistory: mockGetHistory,
    maybeIncludeSchemaDepthContext: mockMaybeIncludeSchemaDepthContext,
  }));
  return {
    ...actual,
    Chat: MockChat,
  };
});

vi.mock('../utils/errorReporting', () => ({
  reportError: vi.fn(),
}));

describe('Turn', () => {
  let turn: Turn;
  // Define a type for the mocked Chat instance for clarity
  type MockedChatInstance = {
    sendMessageStream: typeof mockSendMessageStream;
    getHistory: typeof mockGetHistory;
    maybeIncludeSchemaDepthContext: typeof mockMaybeIncludeSchemaDepthContext;
  };
  let mockChatInstance: MockedChatInstance;

  beforeEach(() => {
    vi.resetAllMocks();
    mockChatInstance = {
      sendMessageStream: mockSendMessageStream,
      getHistory: mockGetHistory,
      maybeIncludeSchemaDepthContext: mockMaybeIncludeSchemaDepthContext,
    };
    turn = new Turn(mockChatInstance as unknown as GeminiChat, 'prompt-id-1');
    mockGetHistory.mockReturnValue([]);
    mockSendMessageStream.mockResolvedValue((async function* () {})());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize pendingToolCalls and debugResponses', () => {
      expect(turn.pendingToolCalls).toEqual([]);
      expect(turn.getDebugResponses()).toEqual([]);
    });
  });

  describe('run', () => {
    it('should yield content events for text parts', async () => {
      const mockResponseStream = (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
          } as GenerateContentResponse,
        };
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [{ content: { parts: [{ text: ' world' }] } }],
          } as GenerateContentResponse,
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Hi' }];
      for await (const event of turn.run(
        { model: 'gemini' },
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(mockSendMessageStream).toHaveBeenCalledWith(
        { model: 'gemini' },
        reqParts,
        'prompt-id-1',
        expect.any(AbortSignal),
      );

      expect(events).toEqual([
        { type: LlmEventType.TextDelta, text: 'Hello' },
        { type: LlmEventType.TextDelta, text: ' world' },
      ]);
      expect(turn.getDebugResponses().length).toBe(2);
    });

    it('should yield tool_call_request events for function calls', async () => {
      const mockResponseStream = (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            functionCalls: [
              {
                id: 'fc1',
                name: 'tool1',
                args: { arg1: 'val1' },
                isClientInitiated: false,
              },
              {
                name: 'tool2',
                args: { arg2: 'val2' },
                isClientInitiated: false,
              }, // No ID
            ],
          } as unknown as GenerateContentResponse,
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Use tools' }];
      for await (const event of turn.run(
        { model: 'gemini' },
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events.length).toBe(2);
      const event1 = events[0] as LlmToolCallRequestEvent;
      expect(event1.type).toBe(LlmEventType.ToolCallRequest);
      expect(event1).toEqual(
        expect.objectContaining({
          callId: 'fc1',
          name: 'tool1',
          args: { arg1: 'val1' },
          isClientInitiated: false,
          promptId: 'prompt-id-1',
        }),
      );
      expect(turn.pendingToolCalls[0]).toEqual(
        expect.objectContaining({
          callId: 'fc1',
          name: 'tool1',
          args: { arg1: 'val1' },
          isClientInitiated: false,
          prompt_id: 'prompt-id-1',
        }),
      );

      const event2 = events[1] as LlmToolCallRequestEvent;
      expect(event2.type).toBe(LlmEventType.ToolCallRequest);
      expect(event2).toEqual(
        expect.objectContaining({
          name: 'tool2',
          args: { arg2: 'val2' },
          isClientInitiated: false,
          promptId: 'prompt-id-1',
        }),
      );
      expect(event2.callId).toEqual(
        expect.stringMatching(/^tool2-\d{13}-\w{10,}$/),
      );
      expect(turn.pendingToolCalls[1]).toEqual(
        expect.objectContaining({
          name: 'tool2',
          args: { arg2: 'val2' },
          isClientInitiated: false,
          prompt_id: 'prompt-id-1',
        }),
      );
      expect(turn.getDebugResponses().length).toBe(1);
    });

    it('should yield UserCancelled event if signal is aborted', async () => {
      const abortController = new AbortController();
      const mockResponseStream = (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [{ content: { parts: [{ text: 'First part' }] } }],
          } as GenerateContentResponse,
        };
        abortController.abort();
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [
              {
                content: {
                  parts: [{ text: 'Second part - should not be processed' }],
                },
              },
            ],
          } as GenerateContentResponse,
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Test abort' }];
      for await (const event of turn.run(
        { model: 'gemini' },
        reqParts,
        abortController.signal,
      )) {
        events.push(event);
      }
      expect(events).toEqual([
        { type: LlmEventType.TextDelta, text: 'First part' },
        { type: LlmEventType.UserCancelled },
      ]);
      expect(turn.getDebugResponses().length).toBe(1);
    });

    it('should yield InvalidStream event if sendMessageStream throws InvalidStreamError', async () => {
      const error = new InvalidStreamError(
        'Test invalid stream',
        'NO_FINISH_REASON',
      );
      mockSendMessageStream.mockRejectedValue(error);
      const reqParts: Part[] = [{ text: 'Trigger invalid stream' }];

      const events = [];
      for await (const event of turn.run(
        { model: 'gemini' },
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([{ type: LlmEventType.InvalidStream }]);
      expect(turn.getDebugResponses().length).toBe(0);
      expect(reportError).not.toHaveBeenCalled(); // Should not report as error
    });

    it('should yield Error event and report if sendMessageStream throws', async () => {
      const error = new Error('API Error');
      mockSendMessageStream.mockRejectedValue(error);
      const reqParts: Part[] = [{ text: 'Trigger error' }];
      const historyContent: Content[] = [
        { role: 'model', parts: [{ text: 'Previous history' }] },
      ];
      mockGetHistory.mockReturnValue(historyContent);
      mockMaybeIncludeSchemaDepthContext.mockResolvedValue(undefined);
      const events = [];
      for await (const event of turn.run(
        { model: 'gemini' },
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events.length).toBe(1);
      const errorEvent = events[0] as LlmErrorEvent;
      expect(errorEvent.type).toBe(LlmEventType.Error);
      expect(errorEvent.error).toBe('API Error');
      expect(errorEvent.code).toBeUndefined();
      expect(turn.getDebugResponses().length).toBe(0);
      expect(reportError).toHaveBeenCalledWith(
        error,
        'Error when talking to Gemini API',
        [...historyContent, { role: 'user', parts: reqParts }],
        'Turn.run-sendMessageStream',
      );
    });

    it('should handle function calls with undefined name or args', async () => {
      const mockResponseStream = (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [],
            functionCalls: [
              // Add `id` back to the mock to match what the code expects
              { id: 'fc1', name: undefined, args: { arg1: 'val1' } },
              { id: 'fc2', name: 'tool2', args: undefined },
              { id: 'fc3', name: undefined, args: undefined },
            ],
          },
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      for await (const event of turn.run(
        { model: 'gemini' },
        [{ text: 'Test undefined tool parts' }],
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events.length).toBe(3);

      // Assertions for each specific tool call event
      const event1 = events[0] as LlmToolCallRequestEvent;
      expect(event1).toMatchObject({
        callId: 'fc1',
        name: 'undefined_tool_name',
        args: { arg1: 'val1' },
      });

      const event2 = events[1] as LlmToolCallRequestEvent;
      expect(event2).toMatchObject({
        callId: 'fc2',
        name: 'tool2',
        args: {},
      });

      const event3 = events[2] as LlmToolCallRequestEvent;
      expect(event3).toMatchObject({
        callId: 'fc3',
        name: 'undefined_tool_name',
        args: {},
      });
    });

    it.each([
      {
        description:
          'should yield finished event when response has finish reason',
        contentText: 'Partial response',
        finishReason: 'STOP',
        expectedFinishReason: 'end_turn',
        usageMetadata: {
          promptTokenCount: 17,
          candidatesTokenCount: 50,
          cachedContentTokenCount: 10,
          thoughtsTokenCount: 5,
          toolUsePromptTokenCount: 2,
        },
        expectedUsage: {
          promptTokens: 17,
          completionTokens: 50,
          totalTokens: 0,
        },
      },
      {
        description: 'should yield finished event for MAX_TOKENS finish reason',
        contentText: 'This is a long response that was cut off...',
        finishReason: 'MAX_TOKENS',
        expectedFinishReason: 'max_tokens',
        usageMetadata: undefined,
        expectedUsage: undefined,
      },
      {
        description: 'should yield finished event for SAFETY finish reason',
        contentText: 'Content blocked',
        finishReason: 'SAFETY',
        expectedFinishReason: 'content_filter',
        usageMetadata: undefined,
        expectedUsage: undefined,
      },
    ])(
      '$description',
      async ({
        contentText,
        finishReason,
        expectedFinishReason,
        usageMetadata,
        expectedUsage,
      }) => {
        const mockResponseStream = (async function* () {
          yield {
            type: StreamEventType.CHUNK,
            value: {
              candidates: [
                {
                  content: { parts: [{ text: contentText }] },
                  finishReason,
                },
              ],
              usageMetadata,
            } as GenerateContentResponse,
          };
        })();
        mockSendMessageStream.mockResolvedValue(mockResponseStream);

        const events = [];
        for await (const event of turn.run(
          { model: 'gemini' },
          [{ text: 'Test' }],
          new AbortController().signal,
        )) {
          events.push(event);
        }

        expect(events).toEqual([
          { type: LlmEventType.TextDelta, text: contentText },
          {
            type: LlmEventType.Finished,
            finishReason: expectedFinishReason,
            usage: expectedUsage,
          },
        ]);
      },
    );

    it('should yield finished event with undefined reason when there is no finish reason', async () => {
      const mockResponseStream = (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [
              {
                content: {
                  parts: [{ text: 'Response without finish reason' }],
                },
                // No finishReason property
              },
            ],
          },
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Test no finish reason' }];
      for await (const event of turn.run(
        { model: 'gemini' },
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        {
          type: LlmEventType.TextDelta,
          text: 'Response without finish reason',
        },
      ]);
    });

    it('should handle multiple responses with different finish reasons', async () => {
      const mockResponseStream = (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [
              {
                content: { parts: [{ text: 'First part' }] },
                // No finish reason on first response
              },
            ],
          },
        };
        yield {
          value: {
            type: StreamEventType.CHUNK,
            candidates: [
              {
                content: { parts: [{ text: 'Second part' }] },
                finishReason: 'OTHER',
              },
            ],
          },
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      const reqParts: Part[] = [{ text: 'Test multiple responses' }];
      for await (const event of turn.run(
        { model: 'gemini' },
        reqParts,
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: LlmEventType.TextDelta, text: 'First part' },
        { type: LlmEventType.TextDelta, text: 'Second part' },
        {
          type: LlmEventType.Finished,
          finishReason: 'unknown',
          usage: undefined,
        },
      ]);
    });

    it('should yield citation and finished events when response has citationMetadata', async () => {
      const mockResponseStream = (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [
              {
                content: { parts: [{ text: 'Some text.' }] },
                citationMetadata: {
                  citations: [
                    {
                      uri: 'https://example.com/source1',
                      title: 'Source 1 Title',
                    },
                  ],
                },
                finishReason: 'STOP',
              },
            ],
          },
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      for await (const event of turn.run(
        { model: 'gemini' },
        [{ text: 'Test citations' }],
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: LlmEventType.TextDelta, text: 'Some text.' },
        {
          type: LlmEventType.Citation,
          citations: [
            {
              url: 'Citations:\n(Source 1 Title) https://example.com/source1',
            },
          ],
        },
        {
          type: LlmEventType.Finished,
          finishReason: 'end_turn',
          usage: undefined,
        },
      ]);
    });

    it('should yield a single citation event for multiple citations in one response', async () => {
      const mockResponseStream = (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [
              {
                content: { parts: [{ text: 'Some text.' }] },
                citationMetadata: {
                  citations: [
                    {
                      uri: 'https://example.com/source2',
                      title: 'Title2',
                    },
                    {
                      uri: 'https://example.com/source1',
                      title: 'Title1',
                    },
                  ],
                },
                finishReason: 'STOP',
              },
            ],
          },
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      for await (const event of turn.run(
        { model: 'gemini' },
        [{ text: 'test' }],
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: LlmEventType.TextDelta, text: 'Some text.' },
        {
          type: LlmEventType.Citation,
          citations: [
            {
              url: 'Citations:\n(Title1) https://example.com/source1\n(Title2) https://example.com/source2',
            },
          ],
        },
        {
          type: LlmEventType.Finished,
          finishReason: 'end_turn',
          usage: undefined,
        },
      ]);
    });

    it('should not yield citation event if there is no finish reason', async () => {
      const mockResponseStream = (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [
              {
                content: { parts: [{ text: 'Some text.' }] },
                citationMetadata: {
                  citations: [
                    {
                      uri: 'https://example.com/source1',
                      title: 'Source 1 Title',
                    },
                  ],
                },
                // No finishReason
              },
            ],
          },
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      for await (const event of turn.run(
        { model: 'gemini' },
        [{ text: 'test' }],
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: LlmEventType.TextDelta, text: 'Some text.' },
      ]);
      // No Citation event (but we do get a Finished event with undefined reason)
      expect(events.some((e) => e.type === LlmEventType.Citation)).toBe(false);
    });

    it('should ignore citations without a URI', async () => {
      const mockResponseStream = (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [
              {
                content: { parts: [{ text: 'Some text.' }] },
                citationMetadata: {
                  citations: [
                    {
                      uri: 'https://example.com/source1',
                      title: 'Good Source',
                    },
                    {
                      // uri is undefined
                      title: 'Bad Source',
                    },
                  ],
                },
                finishReason: 'STOP',
              },
            ],
          },
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      for await (const event of turn.run(
        { model: 'gemini' },
        [{ text: 'test' }],
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: LlmEventType.TextDelta, text: 'Some text.' },
        {
          type: LlmEventType.Citation,
          citations: [
            {
              url: 'Citations:\n(Good Source) https://example.com/source1',
            },
          ],
        },
        {
          type: LlmEventType.Finished,
          finishReason: 'end_turn',
          usage: undefined,
        },
      ]);
    });

    it('should not crash when cancelled request has malformed error', async () => {
      const abortController = new AbortController();

      const errorToThrow = {
        response: {
          data: undefined, // Malformed error data
        },
      };

      mockSendMessageStream.mockImplementation(async () => {
        abortController.abort();
        throw errorToThrow;
      });

      const events = [];
      const reqParts: Part[] = [{ text: 'Test malformed error handling' }];

      for await (const event of turn.run(
        { model: 'gemini' },
        reqParts,
        abortController.signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([{ type: LlmEventType.UserCancelled }]);

      expect(reportError).not.toHaveBeenCalled();
    });

    it('should yield a Retry event when it receives one from the chat stream', async () => {
      const mockResponseStream = (async function* () {
        yield { type: StreamEventType.RETRY };
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [{ content: { parts: [{ text: 'Success' }] } }],
          },
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      for await (const event of turn.run(
        { model: 'gemini' },
        [],
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([
        { type: LlmEventType.Retry },
        { type: LlmEventType.TextDelta, text: 'Success' },
      ]);
    });

    it.each([
      {
        description: 'should yield content events with traceId',
        part: { text: 'Hello' },
        responseId: 'trace-123',
        expectedEvent: {
          type: LlmEventType.TextDelta,
          text: 'Hello',
          traceId: 'trace-123',
        },
      },
      {
        description: 'should yield thought events with traceId',
        part: { text: '[Thought: thinking]', thought: 'thinking' },
        responseId: 'trace-456',
        expectedEvent: {
          type: LlmEventType.ThoughtDelta,
          thought: '[Thought: thinking]',
          traceId: 'trace-456',
          metadata: { subject: '' },
        },
      },
    ])('$description', async ({ part, responseId, expectedEvent }) => {
      const mockResponseStream = (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [{ content: { parts: [part] } }],
            responseId,
          } as unknown as GenerateContentResponse,
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      for await (const event of turn.run(
        { model: 'gemini' },
        [{ text: 'Hi' }],
        new AbortController().signal,
      )) {
        events.push(event);
      }

      expect(events).toEqual([expectedEvent]);
    });

    it('should process all parts when thought is first part in chunk', async () => {
      const mockResponseStream = (async function* () {
        yield {
          type: StreamEventType.CHUNK,
          value: {
            candidates: [
              {
                content: {
                  parts: [
                    { text: '**Planning** the solution', thought: 'planning' },
                    { text: 'I will help you with that.' },
                  ],
                },
                citationMetadata: {
                  citations: [{ uri: 'https://example.com', title: 'Source' }],
                },
                finishReason: 'STOP',
              },
            ],
            functionCalls: [
              {
                id: 'fc1',
                name: 'ReadFile',
                args: { path: 'file.txt' },
              },
            ],
            responseId: 'trace-789',
          } as unknown as GenerateContentResponse,
        };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);

      const events = [];
      for await (const event of turn.run(
        { model: 'gemini' },
        [{ text: 'Test mixed content' }],
        new AbortController().signal,
      )) {
        events.push(event);
      }

      // Should yield:
      // 1. Thought event (from first part)
      // 2. Content event (from second part)
      // 3. ToolCallRequest event (from functionCalls)
      // 4. Citation event (from citationMetadata, emitted with finishReason)
      // 5. Finished event (from finishReason)

      expect(events.length).toBe(5);

      const thoughtEvent = events.find(
        (e) => e.type === LlmEventType.ThoughtDelta,
      );
      expect(thoughtEvent).toBeDefined();
      expect(thoughtEvent).toMatchObject({
        type: LlmEventType.ThoughtDelta,
        thought: 'the solution',
        traceId: 'trace-789',
        metadata: { subject: 'Planning' },
      });

      const contentEvent = events.find(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(contentEvent).toBeDefined();
      expect(contentEvent).toMatchObject({
        type: LlmEventType.TextDelta,
        text: 'I will help you with that.',
        traceId: 'trace-789',
      });

      const toolCallEvent = events.find(
        (e) => e.type === LlmEventType.ToolCallRequest,
      );
      expect(toolCallEvent).toBeDefined();
      expect(toolCallEvent).toMatchObject({
        type: LlmEventType.ToolCallRequest,
        callId: 'fc1',
        name: 'ReadFile',
        args: { path: 'file.txt' },
      });

      const citationEvent = events.find(
        (e) => e.type === LlmEventType.Citation,
      );
      expect(citationEvent).toBeDefined();
      expect(citationEvent).toMatchObject({
        type: LlmEventType.Citation,
        citations: expect.arrayContaining([
          expect.objectContaining({
            url: expect.stringContaining('https://example.com'),
          }),
        ]),
      });

      const finishedEvent = events.find(
        (e) => e.type === LlmEventType.Finished,
      );
      expect(finishedEvent).toBeDefined();
      expect(finishedEvent).toMatchObject({
        type: LlmEventType.Finished,
        finishReason: 'end_turn',
      });
    });
  });

  describe('getDebugResponses', () => {
    it('should return collected debug responses', async () => {
      const resp1 = {
        candidates: [{ content: { parts: [{ text: 'Debug 1' }] } }],
      } as unknown as GenerateContentResponse;
      const resp2 = {
        functionCalls: [{ name: 'debugTool' }],
      } as unknown as GenerateContentResponse;
      const mockResponseStream = (async function* () {
        yield { type: StreamEventType.CHUNK, value: resp1 };
        yield { type: StreamEventType.CHUNK, value: resp2 };
      })();
      mockSendMessageStream.mockResolvedValue(mockResponseStream);
      const reqParts: Part[] = [{ text: 'Hi' }];
      for await (const _ of turn.run(
        { model: 'gemini' },
        reqParts,
        new AbortController().signal,
      )) {
        // consume stream
      }
      expect(turn.getDebugResponses()).toEqual([resp1, resp2]);
    });
  });
});
