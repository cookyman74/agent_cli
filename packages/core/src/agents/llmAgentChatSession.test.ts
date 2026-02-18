/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Tests for LlmAgentChatSession and convertLlmEventToStreamEvent.
 *
 * Tests cover:
 * - LlmEvent → StreamEvent conversion (TextDelta, ThoughtDelta, ToolCallRequest, etc.)
 * - Session management (history, usage tracking)
 * - Error handling (Error event → throw)
 * - Model resolution (resolveProviderModel with resolved alias)
 * - fixToolResultRoles integration
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { LlmEventType } from '../providers/events.js';
import type {
  LlmEvent,
  LlmTextDeltaEvent,
  LlmThoughtDeltaEvent,
  LlmToolCallRequestEvent,
  LlmRetryEvent,
  LlmAgentStoppedEvent,
  LlmAgentBlockedEvent,
  LlmFinishedEvent,
  LlmMessageEndEvent,
  LlmErrorEvent,
} from '../providers/events.js';
import { StreamEventType } from '../providers/gemini/chat.js';
import type { LlmGenerateRequest, LlmTokenUsage } from '../providers/types.js';

import {
  convertLlmEventToStreamEvent,
  LlmAgentChatSession,
  type ResolvedGenerateConfig,
} from './llmAgentChatSession.js';

// ─── convertLlmEventToStreamEvent ────────────────────────────────

describe('convertLlmEventToStreamEvent', () => {
  it('converts TextDelta to CHUNK with text part', () => {
    const event: LlmTextDeltaEvent = {
      type: LlmEventType.TextDelta,
      text: 'Hello world',
    };
    const result = convertLlmEventToStreamEvent(event);

    expect(result).not.toBeNull();
    expect(result!.type).toBe(StreamEventType.CHUNK);
    if (result!.type === StreamEventType.CHUNK) {
      const parts = result!.value.candidates?.[0]?.content?.parts;
      expect(parts).toHaveLength(1);
      expect(parts![0].text).toBe('Hello world');
      expect(parts![0].thought).toBeUndefined();
    }
  });

  it('converts ThoughtDelta to CHUNK with thought flag', () => {
    const event: LlmThoughtDeltaEvent = {
      type: LlmEventType.ThoughtDelta,
      thought: 'I should analyze...',
    };
    const result = convertLlmEventToStreamEvent(event);

    expect(result).not.toBeNull();
    expect(result!.type).toBe(StreamEventType.CHUNK);
    if (result!.type === StreamEventType.CHUNK) {
      const part = result!.value.candidates?.[0]?.content?.parts?.[0];
      expect(part?.text).toBe('I should analyze...');
      expect(part?.thought).toBe(true);
    }
  });

  it('converts ToolCallRequest to CHUNK with functionCalls', () => {
    const event: LlmToolCallRequestEvent = {
      type: LlmEventType.ToolCallRequest,
      callId: 'call-1',
      name: 'list_directory',
      args: { dir_path: '/src' },
    };
    const result = convertLlmEventToStreamEvent(event);

    expect(result).not.toBeNull();
    expect(result!.type).toBe(StreamEventType.CHUNK);
    if (result!.type === StreamEventType.CHUNK) {
      // functionCalls array for local-executor
      expect(result!.value.functionCalls).toHaveLength(1);
      expect(result!.value.functionCalls![0]).toEqual({
        id: 'call-1',
        name: 'list_directory',
        args: { dir_path: '/src' },
      });
      // candidates[0].content.parts[0].functionCall for history
      const fc =
        result!.value.candidates?.[0]?.content?.parts?.[0]?.functionCall;
      expect(fc).toBeDefined();
      expect(fc?.name).toBe('list_directory');
    }
  });

  it('converts Retry to RETRY event', () => {
    const event: LlmRetryEvent = { type: LlmEventType.Retry };
    const result = convertLlmEventToStreamEvent(event);
    expect(result).not.toBeNull();
    expect(result!.type).toBe(StreamEventType.RETRY);
  });

  it('converts AgentStopped to AGENT_EXECUTION_STOPPED', () => {
    const event: LlmAgentStoppedEvent = {
      type: LlmEventType.AgentStopped,
      reason: 'completed',
    };
    const result = convertLlmEventToStreamEvent(event);
    expect(result).not.toBeNull();
    expect(result!.type).toBe(StreamEventType.AGENT_EXECUTION_STOPPED);
    if (result!.type === StreamEventType.AGENT_EXECUTION_STOPPED) {
      expect(result!.reason).toBe('completed');
    }
  });

  it('converts AgentBlocked to AGENT_EXECUTION_BLOCKED', () => {
    const event: LlmAgentBlockedEvent = {
      type: LlmEventType.AgentBlocked,
      reason: 'policy violation',
    };
    const result = convertLlmEventToStreamEvent(event);
    expect(result).not.toBeNull();
    expect(result!.type).toBe(StreamEventType.AGENT_EXECUTION_BLOCKED);
    if (result!.type === StreamEventType.AGENT_EXECUTION_BLOCKED) {
      expect(result!.reason).toBe('policy violation');
    }
  });

  it('returns null for Finished event', () => {
    const event: LlmFinishedEvent = { type: LlmEventType.Finished };
    expect(convertLlmEventToStreamEvent(event)).toBeNull();
  });

  it('returns null for MessageEnd event', () => {
    const event: LlmMessageEndEvent = { type: LlmEventType.MessageEnd };
    expect(convertLlmEventToStreamEvent(event)).toBeNull();
  });

  it('returns null for Error event (handled separately)', () => {
    const event: LlmErrorEvent = {
      type: LlmEventType.Error,
      error: new Error('fail'),
    };
    expect(convertLlmEventToStreamEvent(event)).toBeNull();
  });

  it('returns null for unrecognized event types', () => {
    const event = {
      type: LlmEventType.ModelInfo,
      modelName: 'test',
    } as LlmEvent;
    expect(convertLlmEventToStreamEvent(event)).toBeNull();
  });
});

// ─── LlmAgentChatSession ─────────────────────────────────────────

describe('LlmAgentChatSession', () => {
  // Mock generator
  const mockGenerator = {
    providerName: 'claude' as const,
    llmGenerateContentStream: vi.fn(),
  };

  // Mock dependencies
  const mockResolveProviderModel = vi.fn();
  const mockBuildLlmRequest = vi.fn();
  const mockFixToolResultRoles = vi.fn();
  const mockConvertContentsToLlmMessages = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockFixToolResultRoles.mockImplementation((msgs) => msgs);
    mockConvertContentsToLlmMessages.mockReturnValue([]);
  });

  // Mock for resolveGenerateConfigFn [리뷰 #1]
  const mockResolveGenerateConfig =
    vi.fn<() => ResolvedGenerateConfig | undefined>();

  /**
   * Creates a session with injectable dependencies for testing.
   */
  function createSession(opts?: {
    systemInstruction?: string;
    initialHistory?: Array<{
      role: string;
      parts: Array<Record<string, unknown>>;
    }>;
    resolveGenerateConfigFn?: typeof mockResolveGenerateConfig;
  }) {
    return new LlmAgentChatSession({
      generator: mockGenerator as never,
      providerName: 'claude',
      systemInstruction: opts?.systemInstruction,
      tools: [],
      initialHistory: (opts?.initialHistory ?? []) as never,
      resolveProviderModelFn: mockResolveProviderModel,
      buildLlmRequestFn: mockBuildLlmRequest,
      fixToolResultRolesFn: mockFixToolResultRoles,
      convertContentsToLlmMessagesFn: mockConvertContentsToLlmMessages,
      resolveGenerateConfigFn: opts?.resolveGenerateConfigFn,
    });
  }

  /**
   * Helper to create an async generator from events.
   */
  async function* makeEventStream(
    events: LlmEvent[],
  ): AsyncGenerator<LlmEvent> {
    for (const event of events) {
      yield event;
    }
  }

  describe('sendMessageStream', () => {
    it('calls llmGenerateContentStream with resolved model', async () => {
      mockResolveProviderModel.mockReturnValue('claude-sonnet-4-5-20250929');
      mockBuildLlmRequest.mockReturnValue({
        model: 'placeholder',
        messages: [],
      });
      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([
          { type: LlmEventType.TextDelta, text: 'hi' } as LlmTextDeltaEvent,
          { type: LlmEventType.Finished } as LlmFinishedEvent,
        ]),
      );

      const session = createSession();
      const gen = await session.sendMessageStream(
        { model: 'gemini-2.5-flash' },
        [{ text: 'hello' }],
        'prompt-1',
        new AbortController().signal,
      );

      // Consume stream
      const events = [];
      for await (const event of gen) {
        events.push(event);
      }

      // Verify resolveProviderModel was called with the modelConfigKey model
      expect(mockResolveProviderModel).toHaveBeenCalledWith(
        'gemini-2.5-flash',
        'claude',
      );

      // Verify the request model was overridden with resolved model
      expect(mockGenerator.llmGenerateContentStream).toHaveBeenCalled();
      const requestArg = mockGenerator.llmGenerateContentStream.mock
        .calls[0][0] as LlmGenerateRequest;
      expect(requestArg.model).toBe('claude-sonnet-4-5-20250929');
    });

    it('passes through user override model from modelConfigKey', async () => {
      // [4차 #1] When resolvedConfig.model is already a valid provider model
      mockResolveProviderModel.mockReturnValue('claude-haiku-4-5-20251001');
      mockBuildLlmRequest.mockReturnValue({
        model: 'placeholder',
        messages: [],
      });
      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([{ type: LlmEventType.Finished } as LlmFinishedEvent]),
      );

      const session = createSession();
      await session.sendMessageStream(
        { model: 'claude-haiku-4-5-20251001' },
        [{ text: 'test' }],
        'p1',
        new AbortController().signal,
      );

      expect(mockResolveProviderModel).toHaveBeenCalledWith(
        'claude-haiku-4-5-20251001',
        'claude',
      );
    });

    it('applies fixToolResultRoles after building request', async () => {
      const mockMessages = [
        {
          role: 'user' as const,
          content: [{ type: 'text' as const, text: 'q' }],
        },
      ];
      mockBuildLlmRequest.mockReturnValue({
        model: 'p',
        messages: mockMessages,
      });
      mockResolveProviderModel.mockReturnValue('model');
      mockFixToolResultRoles.mockReturnValue([
        {
          role: 'tool',
          content: [
            { type: 'tool_result', toolCallId: 'c1', name: 'fn', content: 'r' },
          ],
        },
      ]);
      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([{ type: LlmEventType.Finished } as LlmFinishedEvent]),
      );

      const session = createSession();
      await session.sendMessageStream(
        { model: 'm' },
        [{ text: 'test' }],
        'p1',
        new AbortController().signal,
      );

      expect(mockFixToolResultRoles).toHaveBeenCalledWith(mockMessages);
    });

    it('yields CHUNK events for TextDelta', async () => {
      mockResolveProviderModel.mockReturnValue('model');
      mockBuildLlmRequest.mockReturnValue({ model: 'p', messages: [] });
      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([
          { type: LlmEventType.TextDelta, text: 'Hello ' } as LlmTextDeltaEvent,
          { type: LlmEventType.TextDelta, text: 'world' } as LlmTextDeltaEvent,
          { type: LlmEventType.Finished } as LlmFinishedEvent,
        ]),
      );

      const session = createSession();
      const gen = await session.sendMessageStream(
        { model: 'm' },
        [{ text: 'hi' }],
        'p1',
        new AbortController().signal,
      );

      const events = [];
      for await (const event of gen) {
        events.push(event);
      }

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe(StreamEventType.CHUNK);
      expect(events[1].type).toBe(StreamEventType.CHUNK);
    });

    it('throws on Error event', async () => {
      mockResolveProviderModel.mockReturnValue('model');
      mockBuildLlmRequest.mockReturnValue({ model: 'p', messages: [] });
      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([
          {
            type: LlmEventType.TextDelta,
            text: 'partial',
          } as LlmTextDeltaEvent,
          {
            type: LlmEventType.Error,
            error: new Error('API failure'),
          } as LlmErrorEvent,
        ]),
      );

      const session = createSession();
      const gen = await session.sendMessageStream(
        { model: 'm' },
        [{ text: 'hi' }],
        'p1',
        new AbortController().signal,
      );

      // First event is fine
      const first = await gen.next();
      expect(first.done).toBe(false);

      // Second event should throw
      await expect(gen.next()).rejects.toThrow('API failure');
    });

    it('throws error string on Error event with string error', async () => {
      mockResolveProviderModel.mockReturnValue('model');
      mockBuildLlmRequest.mockReturnValue({ model: 'p', messages: [] });
      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([
          {
            type: LlmEventType.Error,
            error: 'string error message',
          } as LlmErrorEvent,
        ]),
      );

      const session = createSession();
      const gen = await session.sendMessageStream(
        { model: 'm' },
        [{ text: 'hi' }],
        'p1',
        new AbortController().signal,
      );

      await expect(gen.next()).rejects.toThrow('string error message');
    });

    it('updates lastPromptTokenCount from Finished event usage', async () => {
      const usage: LlmTokenUsage = {
        promptTokens: 150,
        completionTokens: 50,
        totalTokens: 200,
      };
      mockResolveProviderModel.mockReturnValue('model');
      mockBuildLlmRequest.mockReturnValue({ model: 'p', messages: [] });
      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([
          { type: LlmEventType.TextDelta, text: 'hi' } as LlmTextDeltaEvent,
          {
            type: LlmEventType.Finished,
            usage,
          } as LlmFinishedEvent,
        ]),
      );

      const session = createSession();
      const gen = await session.sendMessageStream(
        { model: 'm' },
        [{ text: 'q' }],
        'p1',
        new AbortController().signal,
      );
      for await (const _event of gen) {
        /* consume */
      }

      expect(session.getLastPromptTokenCount()).toBe(150);
    });

    it('applies generation config from resolveGenerateConfigFn to request [리뷰 #1]', async () => {
      const genConfig: ResolvedGenerateConfig = {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 4096,
        stopSequences: ['STOP'],
      };
      mockResolveGenerateConfig.mockReturnValue(genConfig);
      mockResolveProviderModel.mockReturnValue('claude-sonnet-4-5-20250929');
      mockBuildLlmRequest.mockReturnValue({
        model: 'placeholder',
        messages: [],
      });
      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([{ type: LlmEventType.Finished } as LlmFinishedEvent]),
      );

      const session = createSession({
        resolveGenerateConfigFn: mockResolveGenerateConfig,
      });
      const gen = await session.sendMessageStream(
        { model: 'flash', overrideScope: 'agent-test' },
        [{ text: 'hi' }],
        'p1',
        new AbortController().signal,
      );
      for await (const _event of gen) {
        /* consume */
      }

      // Verify resolveGenerateConfigFn was called with the full ModelConfigKey
      expect(mockResolveGenerateConfig).toHaveBeenCalledWith({
        model: 'flash',
        overrideScope: 'agent-test',
      });

      // Verify generation params were applied to the request
      const requestArg = mockGenerator.llmGenerateContentStream.mock
        .calls[0][0] as LlmGenerateRequest;
      expect(requestArg.temperature).toBe(0.7);
      expect(requestArg.topP).toBe(0.9);
      expect(requestArg.topK).toBe(40);
      expect(requestArg.maxTokens).toBe(4096); // maxOutputTokens → maxTokens
      expect(requestArg.stopSequences).toEqual(['STOP']);
    });

    it('does not override request fields when resolveGenerateConfigFn returns undefined [리뷰 #1]', async () => {
      mockResolveGenerateConfig.mockReturnValue(undefined);
      mockResolveProviderModel.mockReturnValue('model');
      mockBuildLlmRequest.mockReturnValue({
        model: 'placeholder',
        messages: [],
        temperature: 0.5, // pre-existing value
      });
      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([{ type: LlmEventType.Finished } as LlmFinishedEvent]),
      );

      const session = createSession({
        resolveGenerateConfigFn: mockResolveGenerateConfig,
      });
      const gen = await session.sendMessageStream(
        { model: 'm' },
        [{ text: 'hi' }],
        'p1',
        new AbortController().signal,
      );
      for await (const _event of gen) {
        /* consume */
      }

      // Pre-existing temperature should remain unchanged
      const requestArg = mockGenerator.llmGenerateContentStream.mock
        .calls[0][0] as LlmGenerateRequest;
      expect(requestArg.temperature).toBe(0.5);
    });

    it('updates lastPromptTokenCount from MessageEnd event usage', async () => {
      const usage: LlmTokenUsage = {
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
      };
      mockResolveProviderModel.mockReturnValue('model');
      mockBuildLlmRequest.mockReturnValue({ model: 'p', messages: [] });
      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([
          { type: LlmEventType.TextDelta, text: 'hi' } as LlmTextDeltaEvent,
          { type: LlmEventType.Finished } as LlmFinishedEvent,
          {
            type: LlmEventType.MessageEnd,
            usage,
          } as LlmMessageEndEvent,
        ]),
      );

      const session = createSession();
      const gen = await session.sendMessageStream(
        { model: 'm' },
        [{ text: 'q' }],
        'p1',
        new AbortController().signal,
      );
      for await (const _event of gen) {
        /* consume */
      }

      expect(session.getLastPromptTokenCount()).toBe(200);
    });
  });

  describe('history management', () => {
    it('adds user content to history before streaming', async () => {
      mockResolveProviderModel.mockReturnValue('model');
      mockBuildLlmRequest.mockReturnValue({ model: 'p', messages: [] });

      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([{ type: LlmEventType.Finished } as LlmFinishedEvent]),
      );

      const session = createSession();
      const gen = await session.sendMessageStream(
        { model: 'm' },
        [{ text: 'hello user message' }],
        'p1',
        new AbortController().signal,
      );

      // History should include user message before consuming
      const historyDuringStream = session.getHistory();
      expect(historyDuringStream.length).toBeGreaterThan(0);
      expect(historyDuringStream[historyDuringStream.length - 1].role).toBe(
        'user',
      );

      for await (const _event of gen) {
        /* consume */
      }
    });

    it('adds model response to history after stream completes', async () => {
      mockResolveProviderModel.mockReturnValue('model');
      mockBuildLlmRequest.mockReturnValue({ model: 'p', messages: [] });
      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([
          {
            type: LlmEventType.TextDelta,
            text: 'response text',
          } as LlmTextDeltaEvent,
          { type: LlmEventType.Finished } as LlmFinishedEvent,
        ]),
      );

      const session = createSession();
      const gen = await session.sendMessageStream(
        { model: 'm' },
        [{ text: 'question' }],
        'p1',
        new AbortController().signal,
      );

      for await (const _event of gen) {
        /* consume */
      }

      const history = session.getHistory();
      // Last entry should be model response
      const lastEntry = history[history.length - 1];
      expect(lastEntry.role).toBe('model');
    });

    it('does not add model response on error', async () => {
      mockResolveProviderModel.mockReturnValue('model');
      mockBuildLlmRequest.mockReturnValue({ model: 'p', messages: [] });
      mockGenerator.llmGenerateContentStream.mockReturnValue(
        makeEventStream([
          {
            type: LlmEventType.Error,
            error: new Error('fail'),
          } as LlmErrorEvent,
        ]),
      );

      const session = createSession();
      const gen = await session.sendMessageStream(
        { model: 'm' },
        [{ text: 'question' }],
        'p1',
        new AbortController().signal,
      );

      try {
        for await (const _ of gen) {
          /* consume */
        }
      } catch {
        // Expected
      }

      const history = session.getHistory();
      // Last entry should be user, not model (error → no model response added)
      const lastEntry = history[history.length - 1];
      expect(lastEntry.role).toBe('user');
    });

    it('setHistory replaces history', () => {
      const session = createSession();
      const newHistory = [
        { role: 'user', parts: [{ text: 'q1' }] },
        { role: 'model', parts: [{ text: 'a1' }] },
      ] as never;
      session.setHistory(newHistory);
      expect(session.getHistory()).toEqual(newHistory);
    });

    it('getHistory returns deep copy — external mutation does not affect internal state [리뷰 #2]', () => {
      const session = createSession({
        initialHistory: [
          { role: 'user', parts: [{ text: 'original question' }] },
        ],
      });

      const history1 = session.getHistory();
      // Mutate the returned copy
      history1[0].parts = [{ text: 'MUTATED' }] as never;
      history1.push({ role: 'model', parts: [{ text: 'injected' }] } as never);

      // Internal state should be unaffected
      const history2 = session.getHistory();
      expect(history2).toHaveLength(1); // No injected entry
      expect(
        (history2[0].parts as Array<Record<string, unknown>>)[0]['text'],
      ).toBe('original question'); // Not mutated
    });
  });

  describe('getLastPromptTokenCount', () => {
    it('returns 0 before any streaming', () => {
      const session = createSession();
      expect(session.getLastPromptTokenCount()).toBe(0);
    });

    it('recalculates token count after setHistory [리뷰 #5]', () => {
      const session = createSession();
      expect(session.getLastPromptTokenCount()).toBe(0);

      // Set history with substantial text content
      const longText = 'word '.repeat(100); // ~100 tokens
      session.setHistory([
        { role: 'user', parts: [{ text: longText }] },
        { role: 'model', parts: [{ text: 'response text here' }] },
      ] as never);

      // Token count should be recalculated to a non-zero value
      expect(session.getLastPromptTokenCount()).toBeGreaterThan(0);
    });
  });
});
