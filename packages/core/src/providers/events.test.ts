/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RED Phase tests for RateLimitInfo type and LlmMessageEndEvent.rateLimits field.
 *
 * These tests will FAIL (compile error) because:
 * - RateLimitInfo does not exist in events.ts yet
 * - LlmMessageEndEvent does not have a rateLimits field
 *
 * @see docs/00_project/command_for_multi_provider/phase_plan/phase3_quota_integration.md RED-1
 */

import { describe, it, expect } from 'vitest';
import {
  LlmEventType,
  type LlmMessageEndEvent,
  type RateLimitInfo, // RED: does not exist yet → compile error
} from './events.js';

describe('RateLimitInfo type', () => {
  it('should define rate-limit fields', () => {
    const info: RateLimitInfo = {
      requestsLimit: 100,
      requestsRemaining: 50,
      tokensLimit: 100000,
      tokensRemaining: 80000,
      resetTime: new Date('2026-02-21T12:00:00Z'),
    };
    expect(info.requestsLimit).toBe(100);
    expect(info.requestsRemaining).toBe(50);
    expect(info.tokensLimit).toBe(100000);
    expect(info.tokensRemaining).toBe(80000);
    expect(info.resetTime).toBeInstanceOf(Date);
  });

  it('should allow all fields to be optional', () => {
    const info: RateLimitInfo = {};
    expect(info).toBeDefined();
  });
});

describe('LlmMessageEndEvent rateLimits', () => {
  it('should accept optional rateLimits field', () => {
    const event: LlmMessageEndEvent = {
      type: LlmEventType.MessageEnd,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      rateLimits: {
        requestsLimit: 100,
        requestsRemaining: 50,
        tokensLimit: 100000,
        tokensRemaining: 80000,
        resetTime: new Date('2026-02-21T12:00:00Z'),
      },
    };
    expect(event.rateLimits).toBeDefined();
    expect(event.rateLimits!.requestsLimit).toBe(100);
  });

  it('should allow MessageEnd without rateLimits (backward compat)', () => {
    const event: LlmMessageEndEvent = {
      type: LlmEventType.MessageEnd,
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    };
    expect(event.rateLimits).toBeUndefined();
  });
});
