/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration tests for Gemini stream processing pipeline.
 *
 * M2.2.3: EventMapper + StreamAssembler integration
 * Verifies the full pipeline: ServerGeminiStreamEvent → LlmEvent → AssembledMessage
 */

import { describe, it, expect } from 'vitest';
import { GeminiEventType } from './types.js';
import type { ServerGeminiStreamEvent } from './types.js';
import { LlmEventType } from '../events.js';
import type { LlmEvent } from '../events.js';
import type { AssembledMessage } from '../streamAssembler.js';
import { createGeminiStreamPipeline } from './geminiStream.js';
import type { FinishReason } from '@google/genai';

// Helper: create an async generator from an array of Gemini events
async function* geminiStreamFromArray(
  events: ServerGeminiStreamEvent[],
): AsyncGenerator<ServerGeminiStreamEvent, void, unknown> {
  for (const event of events) {
    yield event;
  }
}

// Helper: collect all LlmEvents from a pipeline stream via manual iteration,
// returning both the collected events and the AssembledMessage return value.
async function consumePipeline(
  stream: AsyncGenerator<LlmEvent, AssembledMessage, unknown>,
): Promise<{ events: LlmEvent[]; assembled: AssembledMessage }> {
  const events: LlmEvent[] = [];
  let result = await stream.next();
  while (!result.done) {
    events.push(result.value);
    result = await stream.next();
  }
  return { events, assembled: result.value };
}

describe('M2.2.3 Gemini Stream Pipeline', () => {
  // =========================================================================
  // 2.2.3.2: Gemini stream → LlmEvent conversion
  // =========================================================================
  describe('2.2.3.2 - Gemini stream to LlmEvent conversion', () => {
    it('should yield LlmEvents converted from Gemini Content events', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'hello world' },
      ];

      const { stream } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );
      const { events } = await consumePipeline(stream);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LlmEventType.TextDelta);
      expect(
        (events[0] as { type: LlmEventType.TextDelta; text: string }).text,
      ).toBe('hello world');
    });

    it('should handle an empty stream and return default AssembledMessage', async () => {
      const { stream } = createGeminiStreamPipeline(geminiStreamFromArray([]));
      const { events, assembled } = await consumePipeline(stream);

      expect(events).toHaveLength(0);
      expect(assembled.text).toBe('');
      expect(assembled.thought).toBe('');
      expect(assembled.toolCalls).toEqual([]);
      expect(assembled.isComplete).toBe(false);
    });
  });

  // =========================================================================
  // 2.2.3.3: StreamAssembler integration
  // =========================================================================
  describe('2.2.3.3 - StreamAssembler integration', () => {
    it('should return AssembledMessage as generator return value', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'result text' },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as FinishReason,
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
            },
          },
        },
      ];

      const { stream } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );
      const { assembled } = await consumePipeline(stream);

      expect(assembled.text).toBe('result text');
      expect(assembled.isComplete).toBe(true);
      expect(assembled.usage).toBeDefined();
    });

    it('should expose assembler for mid-stream state queries', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'first ' },
        { type: GeminiEventType.Content, value: 'second' },
      ];

      const { stream, assembler } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );

      // Before consuming: assembler is empty
      expect(assembler.getText()).toBe('');

      // Consume first event
      await stream.next();
      expect(assembler.getText()).toBe('first ');

      // Consume second event
      await stream.next();
      expect(assembler.getText()).toBe('first second');
    });

    it('should mark assembler as complete when Finished event is received', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'text' },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as FinishReason,
            usageMetadata: undefined,
          },
        },
      ];

      const { stream, assembler } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );

      // Before Finished
      await stream.next(); // Content
      expect(assembler.isComplete()).toBe(false);

      // After Finished
      await stream.next(); // Finished
      expect(assembler.isComplete()).toBe(true);
    });
  });

  // =========================================================================
  // 2.2.3.4: Text delta assembly verification
  // =========================================================================
  describe('2.2.3.4 - text delta assembly', () => {
    it('should assemble multiple Content events into full text', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'Hello ' },
        { type: GeminiEventType.Content, value: 'World' },
        { type: GeminiEventType.Content, value: '!' },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as FinishReason,
            usageMetadata: undefined,
          },
        },
      ];

      const { stream } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );
      const { assembled } = await consumePipeline(stream);

      expect(assembled.text).toBe('Hello World!');
    });

    it('should assemble text and thought separately', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'Answer' },
        {
          type: GeminiEventType.Thought,
          value: { subject: 'Analysis', description: 'Reasoning about it' },
        },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as FinishReason,
            usageMetadata: undefined,
          },
        },
      ];

      const { stream } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );
      const { assembled } = await consumePipeline(stream);

      expect(assembled.text).toBe('Answer');
      expect(assembled.thought).toBe('Reasoning about it');
    });
  });

  // =========================================================================
  // 2.2.3.5: Tool call delta assembly verification
  // =========================================================================
  describe('2.2.3.5 - tool call delta assembly', () => {
    it('should collect single tool call from stream', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-1',
            name: 'read_file',
            args: { path: '/tmp/test.txt' },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
            traceId: 'trace-1',
          },
        },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as FinishReason,
            usageMetadata: undefined,
          },
        },
      ];

      const { stream } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );
      const { assembled } = await consumePipeline(stream);

      expect(assembled.toolCalls).toHaveLength(1);
      expect(assembled.toolCalls[0]).toMatchObject({
        type: 'tool_call',
        id: 'call-1',
        name: 'read_file',
        arguments: { path: '/tmp/test.txt' },
      });
    });

    it('should collect multiple tool calls from stream', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-1',
            name: 'read_file',
            args: { path: '/a.txt' },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-2',
            name: 'write_file',
            args: { path: '/b.txt', content: 'data' },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as FinishReason,
            usageMetadata: undefined,
          },
        },
      ];

      const { stream } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );
      const { assembled } = await consumePipeline(stream);

      expect(assembled.toolCalls).toHaveLength(2);
      expect(assembled.toolCalls[0].name).toBe('read_file');
      expect(assembled.toolCalls[1].name).toBe('write_file');
    });

    it('should assemble mixed text and tool calls', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'Let me help' },
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-1',
            name: 'read_file',
            args: { path: '/tmp/test.txt' },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as FinishReason,
            usageMetadata: undefined,
          },
        },
      ];

      const { stream } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );
      const { assembled } = await consumePipeline(stream);

      expect(assembled.text).toBe('Let me help');
      expect(assembled.toolCalls).toHaveLength(1);
    });
  });

  // =========================================================================
  // 2.2.3.6: Usage info accumulation verification
  // =========================================================================
  describe('2.2.3.6 - usage info accumulation', () => {
    it('should capture usage from Finished event with usageMetadata', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'text' },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as FinishReason,
            usageMetadata: {
              promptTokenCount: 100,
              candidatesTokenCount: 50,
              totalTokenCount: 150,
            },
          },
        },
      ];

      const { stream } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );
      const { assembled } = await consumePipeline(stream);

      expect(assembled.usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      });
    });

    it('should capture finish reason from Finished event', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as FinishReason,
            usageMetadata: undefined,
          },
        },
      ];

      const { stream } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );
      const { assembled } = await consumePipeline(stream);

      expect(assembled.finishReason).toBe('end_turn');
    });

    it('should handle Finished without usageMetadata', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as FinishReason,
            usageMetadata: undefined,
          },
        },
      ];

      const { stream } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );
      const { assembled } = await consumePipeline(stream);

      expect(assembled.usage).toBeUndefined();
      expect(assembled.isComplete).toBe(true);
    });
  });

  // =========================================================================
  // Additional: Error handling and mixed streams
  // =========================================================================
  describe('error handling', () => {
    it('should handle Error event in stream', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'partial' },
        {
          type: GeminiEventType.Error,
          value: { error: { message: 'Connection failed', status: 500 } },
        },
      ];

      const { stream } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );
      const { assembled } = await consumePipeline(stream);

      expect(assembled.text).toBe('partial');
      expect(assembled.error).toBeDefined();
      expect(assembled.isComplete).toBe(true);
    });
  });

  describe('mixed event streams', () => {
    it('should handle full realistic stream with all event types', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        {
          type: GeminiEventType.Thought,
          value: {
            subject: 'Plan',
            description: 'reasoning about the problem',
          },
        },
        { type: GeminiEventType.Content, value: 'Here is the result: ' },
        {
          type: GeminiEventType.ToolCallRequest,
          value: {
            callId: 'call-1',
            name: 'read_file',
            args: { path: '/tmp/test.txt' },
            isClientInitiated: false,
            prompt_id: 'prompt-1',
          },
        },
        { type: GeminiEventType.Content, value: 'more text' },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as FinishReason,
            usageMetadata: {
              promptTokenCount: 200,
              candidatesTokenCount: 100,
              totalTokenCount: 300,
            },
          },
        },
      ];

      const { stream } = createGeminiStreamPipeline(
        geminiStreamFromArray(geminiEvents),
      );
      const { events, assembled } = await consumePipeline(stream);

      // All 5 events should be yielded
      expect(events).toHaveLength(5);
      expect(events[0].type).toBe(LlmEventType.ThoughtDelta);
      expect(events[1].type).toBe(LlmEventType.TextDelta);
      expect(events[2].type).toBe(LlmEventType.ToolCallRequest);
      expect(events[3].type).toBe(LlmEventType.TextDelta);
      expect(events[4].type).toBe(LlmEventType.Finished);

      // AssembledMessage should have all parts
      expect(assembled.thought).toBe('reasoning about the problem');
      expect(assembled.text).toBe('Here is the result: more text');
      expect(assembled.toolCalls).toHaveLength(1);
      expect(assembled.toolCalls[0].name).toBe('read_file');
      expect(assembled.usage).toEqual({
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
      });
      expect(assembled.isComplete).toBe(true);
    });
  });
});
