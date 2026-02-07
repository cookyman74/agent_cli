/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the Gemini provider public export surface.
 * Ensures that Gemini types are properly exposed through the providers module.
 */

import { describe, it, expect } from 'vitest';

// Test that Gemini namespace is exported from providers/index.ts
import { Gemini } from '../index.js';

// Test that types can be accessed from providers/gemini/index.ts directly
import { GeminiEventType, CompressionStatus } from './index.js';

describe('Gemini Provider Export Surface', () => {
  describe('Namespace export from providers/index.ts', () => {
    it('should export Gemini namespace', () => {
      expect(Gemini).toBeDefined();
    });

    it('should have GeminiEventType enum in namespace', () => {
      expect(Gemini.GeminiEventType).toBeDefined();
      expect(Gemini.GeminiEventType.Content).toBe('content');
      expect(Gemini.GeminiEventType.Error).toBe('error');
    });

    it('should have CompressionStatus enum in namespace', () => {
      expect(Gemini.CompressionStatus).toBeDefined();
      expect(Gemini.CompressionStatus.COMPRESSED).toBe(1);
    });
  });

  describe('Direct export from providers/gemini/index.ts', () => {
    it('should export GeminiEventType directly', () => {
      expect(GeminiEventType).toBeDefined();
      expect(GeminiEventType.Content).toBe('content');
      expect(GeminiEventType.ToolCallRequest).toBe('tool_call_request');
    });

    it('should export CompressionStatus directly', () => {
      expect(CompressionStatus).toBeDefined();
      expect(CompressionStatus.NOOP).toBe(5);
    });
  });

  describe('GeminiEventType enum values', () => {
    it('should have all 18 event types', () => {
      const eventTypes = Object.values(GeminiEventType);
      expect(eventTypes).toHaveLength(18);
    });

    it('should have expected event type values', () => {
      expect(GeminiEventType.Content).toBe('content');
      expect(GeminiEventType.ToolCallRequest).toBe('tool_call_request');
      expect(GeminiEventType.ToolCallResponse).toBe('tool_call_response');
      expect(GeminiEventType.ToolCallConfirmation).toBe(
        'tool_call_confirmation',
      );
      expect(GeminiEventType.UserCancelled).toBe('user_cancelled');
      expect(GeminiEventType.Error).toBe('error');
      expect(GeminiEventType.ChatCompressed).toBe('chat_compressed');
      expect(GeminiEventType.Thought).toBe('thought');
      expect(GeminiEventType.MaxSessionTurns).toBe('max_session_turns');
      expect(GeminiEventType.Finished).toBe('finished');
      expect(GeminiEventType.LoopDetected).toBe('loop_detected');
      expect(GeminiEventType.Citation).toBe('citation');
      expect(GeminiEventType.Retry).toBe('retry');
      expect(GeminiEventType.ContextWindowWillOverflow).toBe(
        'context_window_will_overflow',
      );
      expect(GeminiEventType.InvalidStream).toBe('invalid_stream');
      expect(GeminiEventType.ModelInfo).toBe('model_info');
      expect(GeminiEventType.AgentExecutionStopped).toBe(
        'agent_execution_stopped',
      );
      expect(GeminiEventType.AgentExecutionBlocked).toBe(
        'agent_execution_blocked',
      );
    });
  });
});
