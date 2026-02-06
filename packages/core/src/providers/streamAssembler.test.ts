/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StreamAssembler } from './streamAssembler.js';
import { LlmEventType } from './events.js';
import type {
  LlmTextDeltaEvent,
  LlmThoughtDeltaEvent,
  LlmToolCallRequestEvent,
  LlmFinishedEvent,
  LlmMessageEndEvent,
} from './events.js';
import type { LlmTokenUsage } from './types.js';

describe('StreamAssembler', () => {
  let assembler: StreamAssembler;

  beforeEach(() => {
    assembler = new StreamAssembler();
  });

  describe('constructor', () => {
    it('should create assembler with default state', () => {
      expect(assembler).toBeDefined();
      expect(assembler.getText()).toBe('');
      expect(assembler.getThought()).toBe('');
      expect(assembler.getToolCalls()).toEqual([]);
    });
  });

  describe('processEvent()', () => {
    it('should accept and process a text delta event', () => {
      const event: LlmTextDeltaEvent = {
        type: LlmEventType.TextDelta,
        text: 'Hello',
      };

      assembler.processEvent(event);

      expect(assembler.getText()).toBe('Hello');
    });

    it('should return the assembler for chaining', () => {
      const event: LlmTextDeltaEvent = {
        type: LlmEventType.TextDelta,
        text: 'test',
      };

      const result = assembler.processEvent(event);

      expect(result).toBe(assembler);
    });
  });

  describe('text delta assembly', () => {
    it('should concatenate multiple text deltas', () => {
      assembler.processEvent({ type: LlmEventType.TextDelta, text: 'Hello ' });
      assembler.processEvent({ type: LlmEventType.TextDelta, text: 'World' });
      assembler.processEvent({ type: LlmEventType.TextDelta, text: '!' });

      expect(assembler.getText()).toBe('Hello World!');
    });

    it('should handle empty text deltas', () => {
      assembler.processEvent({ type: LlmEventType.TextDelta, text: 'Hello' });
      assembler.processEvent({ type: LlmEventType.TextDelta, text: '' });
      assembler.processEvent({ type: LlmEventType.TextDelta, text: ' World' });

      expect(assembler.getText()).toBe('Hello World');
    });

    it('should preserve whitespace and newlines', () => {
      assembler.processEvent({
        type: LlmEventType.TextDelta,
        text: 'Line 1\n',
      });
      assembler.processEvent({ type: LlmEventType.TextDelta, text: 'Line 2' });

      expect(assembler.getText()).toBe('Line 1\nLine 2');
    });
  });

  describe('thought delta assembly', () => {
    it('should concatenate thought deltas', () => {
      const event1: LlmThoughtDeltaEvent = {
        type: LlmEventType.ThoughtDelta,
        thought: 'Thinking about ',
      };
      const event2: LlmThoughtDeltaEvent = {
        type: LlmEventType.ThoughtDelta,
        thought: 'the problem...',
      };

      assembler.processEvent(event1);
      assembler.processEvent(event2);

      expect(assembler.getThought()).toBe('Thinking about the problem...');
    });

    it('should keep text and thought separate', () => {
      assembler.processEvent({ type: LlmEventType.TextDelta, text: 'Answer' });
      assembler.processEvent({
        type: LlmEventType.ThoughtDelta,
        thought: 'Reasoning',
      } as LlmThoughtDeltaEvent);

      expect(assembler.getText()).toBe('Answer');
      expect(assembler.getThought()).toBe('Reasoning');
    });
  });

  describe('tool call delta assembly', () => {
    it('should collect tool call requests', () => {
      const toolCall: LlmToolCallRequestEvent = {
        type: LlmEventType.ToolCallRequest,
        callId: 'call_123',
        name: 'read_file',
        args: { path: '/tmp/test.txt' },
      };

      assembler.processEvent(toolCall);

      const toolCalls = assembler.getToolCalls();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]).toEqual({
        type: 'tool_call',
        id: 'call_123',
        name: 'read_file',
        arguments: { path: '/tmp/test.txt' },
      });
    });

    it('should collect multiple tool calls', () => {
      assembler.processEvent({
        type: LlmEventType.ToolCallRequest,
        callId: 'call_1',
        name: 'tool_a',
        args: { x: 1 },
      } as LlmToolCallRequestEvent);

      assembler.processEvent({
        type: LlmEventType.ToolCallRequest,
        callId: 'call_2',
        name: 'tool_b',
        args: { y: 2 },
      } as LlmToolCallRequestEvent);

      const toolCalls = assembler.getToolCalls();
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].name).toBe('tool_a');
      expect(toolCalls[1].name).toBe('tool_b');
    });
  });

  describe('usage accumulation', () => {
    it('should capture usage from finished event', () => {
      const usage: LlmTokenUsage = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      };

      const event: LlmFinishedEvent = {
        type: LlmEventType.Finished,
        usage,
      };

      assembler.processEvent(event);

      expect(assembler.getUsage()).toEqual(usage);
    });

    it('should capture usage from message end event', () => {
      const usage: LlmTokenUsage = {
        promptTokens: 200,
        completionTokens: 100,
        totalTokens: 300,
      };

      const event: LlmMessageEndEvent = {
        type: LlmEventType.MessageEnd,
        usage,
      };

      assembler.processEvent(event);

      expect(assembler.getUsage()).toEqual(usage);
    });

    it('should return undefined when no usage', () => {
      expect(assembler.getUsage()).toBeUndefined();
    });
  });

  describe('isComplete()', () => {
    it('should return false initially', () => {
      expect(assembler.isComplete()).toBe(false);
    });

    it('should return true after finished event', () => {
      assembler.processEvent({ type: LlmEventType.Finished });

      expect(assembler.isComplete()).toBe(true);
    });

    it('should return true after message end event', () => {
      assembler.processEvent({ type: LlmEventType.MessageEnd });

      expect(assembler.isComplete()).toBe(true);
    });
  });

  describe('getAssembledMessage()', () => {
    it('should return complete message with all parts', () => {
      assembler.processEvent({
        type: LlmEventType.TextDelta,
        text: 'Response',
      });
      assembler.processEvent({
        type: LlmEventType.ThoughtDelta,
        thought: 'Thinking...',
      } as LlmThoughtDeltaEvent);
      assembler.processEvent({
        type: LlmEventType.ToolCallRequest,
        callId: 'call_1',
        name: 'tool',
        args: {},
      } as LlmToolCallRequestEvent);
      assembler.processEvent({
        type: LlmEventType.Finished,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      } as LlmFinishedEvent);

      const message = assembler.getAssembledMessage();

      expect(message.text).toBe('Response');
      expect(message.thought).toBe('Thinking...');
      expect(message.toolCalls).toHaveLength(1);
      expect(message.usage?.totalTokens).toBe(30);
      expect(message.isComplete).toBe(true);
    });

    it('should include finish reason when available', () => {
      assembler.processEvent({
        type: LlmEventType.Finished,
        finishReason: 'stop',
      } as LlmFinishedEvent);

      const message = assembler.getAssembledMessage();

      expect(message.finishReason).toBe('stop');
    });
  });

  describe('reset()', () => {
    it('should clear all accumulated state', () => {
      assembler.processEvent({ type: LlmEventType.TextDelta, text: 'text' });
      assembler.processEvent({
        type: LlmEventType.ThoughtDelta,
        thought: 'thought',
      } as LlmThoughtDeltaEvent);
      assembler.processEvent({
        type: LlmEventType.Finished,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      } as LlmFinishedEvent);

      assembler.reset();

      expect(assembler.getText()).toBe('');
      expect(assembler.getThought()).toBe('');
      expect(assembler.getToolCalls()).toEqual([]);
      expect(assembler.getUsage()).toBeUndefined();
      expect(assembler.isComplete()).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should capture error from error event', () => {
      assembler.processEvent({
        type: LlmEventType.Error,
        error: 'Something went wrong',
      });

      expect(assembler.getError()).toBe('Something went wrong');
    });

    it('should include error in assembled message', () => {
      assembler.processEvent({
        type: LlmEventType.Error,
        error: new Error('Test error'),
      });

      const message = assembler.getAssembledMessage();
      expect(message.error).toBeDefined();
    });

    it('should set isComplete to true on error', () => {
      assembler.processEvent({
        type: LlmEventType.Error,
        error: 'Connection failed',
      });

      expect(assembler.isComplete()).toBe(true);
    });
  });
});
