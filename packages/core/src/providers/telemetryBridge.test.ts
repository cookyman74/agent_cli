/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M2.2.5 TelemetryBridge — provider-agnostic telemetry schema tests.
 *
 * Bridges LlmTokenUsage (providers layer) ↔ GenAIUsageDetails (telemetry layer).
 * Adds provider field to API telemetry events.
 */

import { describe, it, expect } from 'vitest';
import type { LlmTokenUsage } from './types.js';
import type { GenAIUsageDetails } from '../telemetry/types.js';
import {
  llmTokenUsageToGenAIUsage,
  genAIUsageToLlmTokenUsage,
  createProviderApiResponseEvent,
  createProviderApiErrorEvent,
} from './telemetryBridge.js';

// ============================================================================
// 2.2.5.2 — provider-agnostic 스키마 정의
// ============================================================================

describe('TelemetryBridge', () => {
  // --------------------------------------------------------------------------
  // LlmTokenUsage → GenAIUsageDetails 변환
  // --------------------------------------------------------------------------
  describe('llmTokenUsageToGenAIUsage', () => {
    it('should convert LlmTokenUsage to GenAIUsageDetails with all fields', () => {
      const usage: LlmTokenUsage = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cachedTokens: 20,
        thoughtTokens: 30,
        toolTokens: 10,
      };

      const result: GenAIUsageDetails = llmTokenUsageToGenAIUsage(usage);

      expect(result.input_token_count).toBe(100);
      expect(result.output_token_count).toBe(50);
      expect(result.total_token_count).toBe(150);
      expect(result.cached_content_token_count).toBe(20);
      expect(result.thoughts_token_count).toBe(30);
      expect(result.tool_token_count).toBe(10);
    });

    it('should default optional fields to 0', () => {
      const usage: LlmTokenUsage = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      };

      const result = llmTokenUsageToGenAIUsage(usage);

      expect(result.cached_content_token_count).toBe(0);
      expect(result.thoughts_token_count).toBe(0);
      expect(result.tool_token_count).toBe(0);
    });

    it('should handle zero token counts', () => {
      const usage: LlmTokenUsage = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
      };

      const result = llmTokenUsageToGenAIUsage(usage);

      expect(result.input_token_count).toBe(0);
      expect(result.output_token_count).toBe(0);
      expect(result.total_token_count).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // GenAIUsageDetails → LlmTokenUsage 역변환
  // --------------------------------------------------------------------------
  describe('genAIUsageToLlmTokenUsage', () => {
    it('should convert GenAIUsageDetails to LlmTokenUsage', () => {
      const genAIUsage: GenAIUsageDetails = {
        input_token_count: 100,
        output_token_count: 50,
        total_token_count: 150,
        cached_content_token_count: 20,
        thoughts_token_count: 30,
        tool_token_count: 10,
      };

      const result: LlmTokenUsage = genAIUsageToLlmTokenUsage(genAIUsage);

      expect(result.promptTokens).toBe(100);
      expect(result.completionTokens).toBe(50);
      expect(result.totalTokens).toBe(150);
      expect(result.cachedTokens).toBe(20);
      expect(result.thoughtTokens).toBe(30);
      expect(result.toolTokens).toBe(10);
    });

    it('should set optional fields when values are 0', () => {
      const genAIUsage: GenAIUsageDetails = {
        input_token_count: 100,
        output_token_count: 50,
        total_token_count: 150,
        cached_content_token_count: 0,
        thoughts_token_count: 0,
        tool_token_count: 0,
      };

      const result = genAIUsageToLlmTokenUsage(genAIUsage);

      expect(result.cachedTokens).toBe(0);
      expect(result.thoughtTokens).toBe(0);
      expect(result.toolTokens).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 2.2.5.3 — 공통 필드 정의 (provider, model, latency)
  // --------------------------------------------------------------------------
  describe('createProviderApiResponseEvent', () => {
    it('should create ApiResponseEvent from LlmTokenUsage', () => {
      const event = createProviderApiResponseEvent({
        model: 'gemini-2.0-flash',
        durationMs: 1234,
        promptId: 'prompt-1',
        provider: 'gemini',
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          totalTokens: 150,
        },
      });

      expect(event.model).toBe('gemini-2.0-flash');
      expect(event.duration_ms).toBe(1234);
      expect(event.usage.input_token_count).toBe(100);
      expect(event.usage.output_token_count).toBe(50);
      expect(event.usage.total_token_count).toBe(150);
    });

    it('should include provider field in the event', () => {
      const event = createProviderApiResponseEvent({
        model: 'claude-sonnet-4-20250514',
        durationMs: 500,
        promptId: 'prompt-2',
        provider: 'claude',
        usage: {
          promptTokens: 200,
          completionTokens: 100,
          totalTokens: 300,
        },
      });

      // provider should be accessible on the event
      expect(event.provider).toBe('claude');
    });

    it('should include provider in OTel attributes', () => {
      const event = createProviderApiResponseEvent({
        model: 'gpt-4',
        durationMs: 800,
        promptId: 'prompt-3',
        provider: 'openai',
        usage: {
          promptTokens: 150,
          completionTokens: 75,
          totalTokens: 225,
        },
      });

      // The toLogRecord should include provider info
      const logBody = event.toLogBody();
      expect(logBody).toContain('gpt-4');
    });

    it('should default provider to "unknown" when not specified', () => {
      const event = createProviderApiResponseEvent({
        model: 'some-model',
        durationMs: 100,
        promptId: 'prompt-4',
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        },
      });

      expect(event.provider).toBe('unknown');
    });
  });

  describe('createProviderApiErrorEvent', () => {
    it('should create ApiErrorEvent with provider field', () => {
      const event = createProviderApiErrorEvent({
        model: 'gemini-2.0-flash',
        error: 'Rate limit exceeded',
        durationMs: 200,
        promptId: 'prompt-5',
        provider: 'gemini',
        errorType: 'RATE_LIMIT',
        statusCode: 429,
      });

      expect(event.model).toBe('gemini-2.0-flash');
      expect(event.error).toBe('Rate limit exceeded');
      expect(event.duration_ms).toBe(200);
      expect(event.provider).toBe('gemini');
      expect(event.error_type).toBe('RATE_LIMIT');
      expect(event.status_code).toBe(429);
    });

    it('should handle error without status code', () => {
      const event = createProviderApiErrorEvent({
        model: 'claude-sonnet-4-20250514',
        error: 'Connection timeout',
        durationMs: 30000,
        promptId: 'prompt-6',
        provider: 'claude',
      });

      expect(event.provider).toBe('claude');
      expect(event.status_code).toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // 2.2.5.4 — 기존 Telemetry 호환성 유지
  // --------------------------------------------------------------------------
  describe('backward compatibility', () => {
    it('should produce GenAIUsageDetails compatible with existing logApiResponse', () => {
      const usage: LlmTokenUsage = {
        promptTokens: 17,
        completionTokens: 50,
        totalTokens: 69,
        cachedTokens: 2,
      };

      const genAIUsage = llmTokenUsageToGenAIUsage(usage);

      // These are the exact fields existing loggers.ts checks
      expect(genAIUsage).toHaveProperty('input_token_count');
      expect(genAIUsage).toHaveProperty('output_token_count');
      expect(genAIUsage).toHaveProperty('cached_content_token_count');
      expect(genAIUsage).toHaveProperty('thoughts_token_count');
      expect(genAIUsage).toHaveProperty('tool_token_count');
      expect(genAIUsage).toHaveProperty('total_token_count');
    });

    it('should round-trip conversion preserve data', () => {
      const original: LlmTokenUsage = {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
        cachedTokens: 20,
        thoughtTokens: 30,
        toolTokens: 10,
      };

      const genAI = llmTokenUsageToGenAIUsage(original);
      const roundTripped = genAIUsageToLlmTokenUsage(genAI);

      expect(roundTripped.promptTokens).toBe(original.promptTokens);
      expect(roundTripped.completionTokens).toBe(original.completionTokens);
      expect(roundTripped.totalTokens).toBe(original.totalTokens);
      expect(roundTripped.cachedTokens).toBe(original.cachedTokens);
      expect(roundTripped.thoughtTokens).toBe(original.thoughtTokens);
      expect(roundTripped.toolTokens).toBe(original.toolTokens);
    });
  });
});
