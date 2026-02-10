/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { LlmResponseAccumulator } from './historyBuilder.js';
import { LlmEventType } from '../events.js';
import type { LlmEvent } from '../events.js';

describe('LlmResponseAccumulator', () => {
  // ============================================================================
  // TextDelta accumulation
  // ============================================================================

  describe('TextDelta accumulation', () => {
    it('should accumulate single text delta', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({
        type: LlmEventType.TextDelta,
        text: 'Hello world',
      });

      expect(acc.getResponseText()).toBe('Hello world');
    });

    it('should concatenate multiple text deltas', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({ type: LlmEventType.TextDelta, text: 'Hello ' });
      acc.addEvent({ type: LlmEventType.TextDelta, text: 'world' });

      expect(acc.getResponseText()).toBe('Hello world');
    });

    it('should generate Content with text part', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({ type: LlmEventType.TextDelta, text: 'Hi' });

      const content = acc.toContent();
      expect(content.role).toBe('model');
      expect(content.parts).toHaveLength(1);
      expect(content.parts![0]).toEqual({ text: 'Hi' });
    });
  });

  // ============================================================================
  // ToolCallRequest accumulation
  // ============================================================================

  describe('ToolCallRequest accumulation', () => {
    it('should accumulate a single tool call', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({
        type: LlmEventType.ToolCallRequest,
        callId: 'call-1',
        name: 'read_file',
        args: { path: '/tmp/test.txt' },
      });

      const toolCalls = acc.getPendingToolCalls();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0].callId).toBe('call-1');
      expect(toolCalls[0].name).toBe('read_file');
      expect(toolCalls[0].args).toEqual({ path: '/tmp/test.txt' });
      expect(toolCalls[0].prompt_id).toBe('test-prompt');
      expect(toolCalls[0].isClientInitiated).toBe(false);
    });

    it('should accumulate multiple tool calls', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({
        type: LlmEventType.ToolCallRequest,
        callId: 'call-1',
        name: 'read_file',
        args: { path: '/a.txt' },
      });
      acc.addEvent({
        type: LlmEventType.ToolCallRequest,
        callId: 'call-2',
        name: 'write_file',
        args: { path: '/b.txt', content: 'hi' },
      });

      const toolCalls = acc.getPendingToolCalls();
      expect(toolCalls).toHaveLength(2);
      expect(toolCalls[0].name).toBe('read_file');
      expect(toolCalls[1].name).toBe('write_file');
    });

    it('should generate Content with functionCall parts', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({
        type: LlmEventType.ToolCallRequest,
        callId: 'call-1',
        name: 'search',
        args: { query: 'cats' },
      });

      const content = acc.toContent();
      expect(content.role).toBe('model');
      expect(content.parts).toHaveLength(1);
      expect(content.parts![0]).toEqual({
        functionCall: {
          id: 'call-1',
          name: 'search',
          args: { query: 'cats' },
        },
      });
    });

    it('should use isClientInitiated from event when provided', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({
        type: LlmEventType.ToolCallRequest,
        callId: 'call-1',
        name: 'tool',
        args: {},
        isClientInitiated: true,
      });

      const toolCalls = acc.getPendingToolCalls();
      expect(toolCalls[0].isClientInitiated).toBe(true);
    });
  });

  // ============================================================================
  // Mixed content (text + tool calls)
  // ============================================================================

  describe('mixed content', () => {
    it('should handle text followed by tool calls', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({
        type: LlmEventType.TextDelta,
        text: 'Let me search for that.',
      });
      acc.addEvent({
        type: LlmEventType.ToolCallRequest,
        callId: 'call-1',
        name: 'search',
        args: { q: 'test' },
      });

      expect(acc.getResponseText()).toBe('Let me search for that.');
      expect(acc.getPendingToolCalls()).toHaveLength(1);

      const content = acc.toContent();
      expect(content.parts).toHaveLength(2);
      expect(content.parts![0]).toEqual({
        text: 'Let me search for that.',
      });
      expect(content.parts![1]).toEqual({
        functionCall: { id: 'call-1', name: 'search', args: { q: 'test' } },
      });
    });
  });

  // ============================================================================
  // Finished event
  // ============================================================================

  describe('Finished event', () => {
    it('should capture finishReason from Finished event', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({
        type: LlmEventType.Finished,
        finishReason: 'end_turn',
      });

      expect(acc.getFinishReason()).toBe('end_turn');
    });

    it('should return undefined finishReason when no Finished event', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({ type: LlmEventType.TextDelta, text: 'hi' });

      expect(acc.getFinishReason()).toBeUndefined();
    });
  });

  // ============================================================================
  // Empty response
  // ============================================================================

  describe('empty response', () => {
    it('should return empty text for no events', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      expect(acc.getResponseText()).toBe('');
    });

    it('should return empty Content parts for no events', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      const content = acc.toContent();
      expect(content.role).toBe('model');
      expect(content.parts).toHaveLength(0);
    });

    it('should return empty pendingToolCalls for no events', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      expect(acc.getPendingToolCalls()).toHaveLength(0);
    });
  });

  // ============================================================================
  // Ignored events
  // ============================================================================

  describe('ignored events', () => {
    it('should ignore non-content events gracefully', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({ type: LlmEventType.Retry } as LlmEvent);
      acc.addEvent({
        type: LlmEventType.ModelInfo,
        modelName: 'test',
      } as LlmEvent);

      expect(acc.getResponseText()).toBe('');
      expect(acc.getPendingToolCalls()).toHaveLength(0);
    });
  });

  // ============================================================================
  // Error tracking
  // ============================================================================

  describe('error tracking', () => {
    it('should track isError state from Error event', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({
        type: LlmEventType.Error,
        error: 'Something went wrong',
      } as LlmEvent);

      expect(acc.hasError()).toBe(true);
    });

    it('should not be in error state without Error event', () => {
      const acc = new LlmResponseAccumulator('test-prompt');
      acc.addEvent({ type: LlmEventType.TextDelta, text: 'ok' });
      expect(acc.hasError()).toBe(false);
    });
  });
});
