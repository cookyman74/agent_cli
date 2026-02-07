/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for stream-level conversion utilities.
 *
 * M2.2.2.2: convertGeminiStream / convertGeminiStreamWithReturn
 */

import { describe, it, expect } from 'vitest';
import { GeminiEventType } from './types.js';
import type { ServerGeminiStreamEvent } from './types.js';
import { LlmEventType } from '../events.js';
import type { LlmEvent } from '../events.js';
import {
  convertGeminiStream,
  convertGeminiStreamWithReturn,
} from './streamConverter.js';

// Helper: create an async generator from an array of Gemini events
async function* geminiStreamFromArray(
  events: ServerGeminiStreamEvent[],
): AsyncGenerator<ServerGeminiStreamEvent, void, unknown> {
  for (const event of events) {
    yield event;
  }
}

// Helper: create an async generator with a return value
async function* geminiStreamWithReturn<TReturn>(
  events: ServerGeminiStreamEvent[],
  returnValue: TReturn,
): AsyncGenerator<ServerGeminiStreamEvent, TReturn, unknown> {
  for (const event of events) {
    yield event;
  }
  return returnValue;
}

// Helper: collect all events from an LlmEvent stream
async function collectEvents(
  stream: AsyncGenerator<LlmEvent, unknown, unknown>,
): Promise<LlmEvent[]> {
  const collected: LlmEvent[] = [];
  let result = await stream.next();
  while (!result.done) {
    collected.push(result.value);
    result = await stream.next();
  }
  return collected;
}

describe('M2.2.2.2 Stream Conversion Utilities', () => {
  describe('convertGeminiStream', () => {
    it('should convert a single Content event to TextDelta', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'hello world' },
      ];

      const llmStream = convertGeminiStream(
        geminiStreamFromArray(geminiEvents),
      );
      const events = await collectEvents(llmStream);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe(LlmEventType.TextDelta);
      expect(
        (events[0] as { type: LlmEventType.TextDelta; text: string }).text,
      ).toBe('hello world');
    });

    it('should convert multiple diverse Gemini events to LlmEvents', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'part1' },
        { type: GeminiEventType.Content, value: 'part2' },
        {
          type: GeminiEventType.Thought,
          value: { subject: 'Thinking', description: 'reasoning...' },
        },
        { type: GeminiEventType.ModelInfo, value: 'gemini-2.0-flash' },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as import('@google/genai').FinishReason,
            usageMetadata: undefined,
          },
        },
      ];

      const llmStream = convertGeminiStream(
        geminiStreamFromArray(geminiEvents),
      );
      const events = await collectEvents(llmStream);

      expect(events).toHaveLength(5);
      expect(events[0].type).toBe(LlmEventType.TextDelta);
      expect(events[1].type).toBe(LlmEventType.TextDelta);
      expect(events[2].type).toBe(LlmEventType.ThoughtDelta);
      expect(events[3].type).toBe(LlmEventType.ModelInfo);
      expect(events[4].type).toBe(LlmEventType.Finished);
    });

    it('should handle an empty stream gracefully', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [];

      const llmStream = convertGeminiStream(
        geminiStreamFromArray(geminiEvents),
      );
      const events = await collectEvents(llmStream);

      expect(events).toHaveLength(0);
    });
  });

  describe('convertGeminiStreamWithReturn', () => {
    it('should convert events and preserve the return value', async () => {
      const geminiEvents: ServerGeminiStreamEvent[] = [
        { type: GeminiEventType.Content, value: 'chunk1' },
        { type: GeminiEventType.Content, value: 'chunk2' },
        {
          type: GeminiEventType.Finished,
          value: {
            reason: 'STOP' as import('@google/genai').FinishReason,
            usageMetadata: undefined,
          },
        },
      ];

      const turnResult = { turnId: 'turn-1', success: true };
      const stream = geminiStreamWithReturn(geminiEvents, turnResult);

      const convertedStream = convertGeminiStreamWithReturn(stream);

      // Collect events manually to also capture the return value
      const collected: LlmEvent[] = [];
      let result = await convertedStream.next();
      while (!result.done) {
        collected.push(result.value);
        result = await convertedStream.next();
      }

      // Verify events were converted
      expect(collected).toHaveLength(3);
      expect(collected[0].type).toBe(LlmEventType.TextDelta);
      expect(collected[1].type).toBe(LlmEventType.TextDelta);
      expect(collected[2].type).toBe(LlmEventType.Finished);

      // Verify return value is preserved
      expect(result.done).toBe(true);
      expect(result.value).toEqual(turnResult);
    });

    it('should preserve return value even for an empty stream', async () => {
      const returnValue = { empty: true };
      const stream = geminiStreamWithReturn([], returnValue);

      const convertedStream = convertGeminiStreamWithReturn(stream);

      const collected: LlmEvent[] = [];
      let result = await convertedStream.next();
      while (!result.done) {
        collected.push(result.value);
        result = await convertedStream.next();
      }

      expect(collected).toHaveLength(0);
      expect(result.done).toBe(true);
      expect(result.value).toEqual(returnValue);
    });
  });
});
