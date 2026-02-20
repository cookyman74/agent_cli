/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  parseRateLimitHeaders,
  extractWithRateLimits,
  CLAUDE_RATE_LIMIT_HEADERS,
  OPENAI_RATE_LIMIT_HEADERS,
} from './rateLimitUtils.js';

describe('rateLimitUtils', () => {
  describe('parseRateLimitHeaders', () => {
    it('returns undefined when headers is undefined', () => {
      expect(
        parseRateLimitHeaders(undefined, CLAUDE_RATE_LIMIT_HEADERS),
      ).toBeUndefined();
    });

    it('returns undefined when no rate-limit headers are present', () => {
      const headers = new Map<string, string>();
      expect(
        parseRateLimitHeaders(headers, CLAUDE_RATE_LIMIT_HEADERS),
      ).toBeUndefined();
    });

    it('parses Anthropic rate-limit headers', () => {
      const headers = new Map([
        ['anthropic-ratelimit-requests-limit', '100'],
        ['anthropic-ratelimit-requests-remaining', '95'],
        ['anthropic-ratelimit-tokens-limit', '50000'],
        ['anthropic-ratelimit-tokens-remaining', '48000'],
        ['anthropic-ratelimit-requests-reset', '2026-01-01T00:00:00Z'],
      ]);

      const result = parseRateLimitHeaders(headers, CLAUDE_RATE_LIMIT_HEADERS);

      expect(result).toEqual({
        requestsLimit: 100,
        requestsRemaining: 95,
        tokensLimit: 50000,
        tokensRemaining: 48000,
        resetTime: new Date('2026-01-01T00:00:00Z'),
      });
    });

    it('parses OpenAI rate-limit headers', () => {
      const headers = new Map([
        ['x-ratelimit-limit-requests', '200'],
        ['x-ratelimit-remaining-requests', '190'],
        ['x-ratelimit-limit-tokens', '100000'],
        ['x-ratelimit-remaining-tokens', '98000'],
        ['x-ratelimit-reset-requests', '2026-01-01T00:00:00Z'],
      ]);

      const result = parseRateLimitHeaders(headers, OPENAI_RATE_LIMIT_HEADERS);

      expect(result).toEqual({
        requestsLimit: 200,
        requestsRemaining: 190,
        tokensLimit: 100000,
        tokensRemaining: 98000,
        resetTime: new Date('2026-01-01T00:00:00Z'),
      });
    });

    it('handles partial headers (only requests)', () => {
      const headers = new Map([
        ['anthropic-ratelimit-requests-limit', '100'],
        ['anthropic-ratelimit-requests-remaining', '50'],
      ]);

      const result = parseRateLimitHeaders(headers, CLAUDE_RATE_LIMIT_HEADERS);

      expect(result).toEqual({
        requestsLimit: 100,
        requestsRemaining: 50,
      });
    });
  });

  describe('extractWithRateLimits', () => {
    it('extracts rateLimits via .withResponse()', async () => {
      const mockData = { id: 'msg_1' };
      const headers = new Map([
        ['anthropic-ratelimit-requests-limit', '100'],
        ['anthropic-ratelimit-requests-remaining', '99'],
      ]);

      const createResult = Object.assign(Promise.resolve(mockData), {
        withResponse: () =>
          Promise.resolve({
            data: mockData,
            response: { headers },
          }),
      });

      const { data, rateLimits } = await extractWithRateLimits(
        createResult,
        CLAUDE_RATE_LIMIT_HEADERS,
      );

      expect(data).toBe(mockData);
      expect(rateLimits).toEqual({
        requestsLimit: 100,
        requestsRemaining: 99,
      });
    });

    it('returns data without rateLimits when .withResponse() is absent', async () => {
      const mockData = { id: 'msg_2' };
      const createResult = Promise.resolve(mockData);

      const { data, rateLimits } = await extractWithRateLimits(
        createResult,
        OPENAI_RATE_LIMIT_HEADERS,
      );

      expect(data).toBe(mockData);
      expect(rateLimits).toBeUndefined();
    });
  });
});
