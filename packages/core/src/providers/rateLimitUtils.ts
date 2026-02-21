/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared rate-limit header extraction utilities for SDK adapters.
 *
 * Both Anthropic and OpenAI SDKs expose `.withResponse()` on their API
 * promises, returning `{ data, response: { headers } }`. The header names
 * differ per provider, but the extraction logic is identical.
 */

import type { RateLimitInfo } from './events.js';

/** Duck-typed headers interface (compatible with Headers, Map). */
export type HeadersLike = { get(name: string): string | null | undefined };

/** Maps logical rate-limit fields to provider-specific header names. */
export interface RateLimitHeaderNames {
  requestsLimit: string;
  requestsRemaining: string;
  tokensLimit: string;
  tokensRemaining: string;
  requestsReset: string;
}

/** Anthropic rate-limit header names. */
export const CLAUDE_RATE_LIMIT_HEADERS: RateLimitHeaderNames = {
  requestsLimit: 'anthropic-ratelimit-requests-limit',
  requestsRemaining: 'anthropic-ratelimit-requests-remaining',
  tokensLimit: 'anthropic-ratelimit-tokens-limit',
  tokensRemaining: 'anthropic-ratelimit-tokens-remaining',
  requestsReset: 'anthropic-ratelimit-requests-reset',
};

/** OpenAI rate-limit header names. */
export const OPENAI_RATE_LIMIT_HEADERS: RateLimitHeaderNames = {
  requestsLimit: 'x-ratelimit-limit-requests',
  requestsRemaining: 'x-ratelimit-remaining-requests',
  tokensLimit: 'x-ratelimit-limit-tokens',
  tokensRemaining: 'x-ratelimit-remaining-tokens',
  requestsReset: 'x-ratelimit-reset-requests',
};

/**
 * Parse rate-limit headers into a provider-independent RateLimitInfo.
 * Returns undefined when no rate-limit headers are present.
 */
export function parseRateLimitHeaders(
  headers: HeadersLike | undefined,
  headerNames: RateLimitHeaderNames,
): RateLimitInfo | undefined {
  if (!headers) return undefined;

  const rl = headers.get(headerNames.requestsLimit);
  const rr = headers.get(headerNames.requestsRemaining);
  const tl = headers.get(headerNames.tokensLimit);
  const tr = headers.get(headerNames.tokensRemaining);
  const reset = headers.get(headerNames.requestsReset);

  if (rl == null && rr == null && tl == null && tr == null) return undefined;

  const safeNum = (v: string): number | undefined => {
    if (v.trim() === '') return undefined;
    const n = Number(v);
    return isNaN(n) ? undefined : n;
  };

  const safeDate = (v: string): Date | undefined => {
    const d = new Date(v);
    return isNaN(d.getTime()) ? undefined : d;
  };

  const rlNum = rl != null ? safeNum(rl) : undefined;
  const rrNum = rr != null ? safeNum(rr) : undefined;
  const tlNum = tl != null ? safeNum(tl) : undefined;
  const trNum = tr != null ? safeNum(tr) : undefined;
  const resetDate = reset != null ? safeDate(reset) : undefined;

  return {
    ...(rlNum != null && { requestsLimit: rlNum }),
    ...(rrNum != null && { requestsRemaining: rrNum }),
    ...(tlNum != null && { tokensLimit: tlNum }),
    ...(trNum != null && { tokensRemaining: trNum }),
    ...(resetDate != null && { resetTime: resetDate }),
  };
}

/**
 * Extract data and optional rate-limit info from an SDK create() result.
 * Uses `.withResponse()` when available (APIPromise pattern shared by
 * both Anthropic and OpenAI SDKs).
 */
export async function extractWithRateLimits(
  createResult: Promise<unknown>,
  headerNames: RateLimitHeaderNames,
): Promise<{ data: unknown; rateLimits?: RateLimitInfo }> {
  const withResponse = (
    createResult as { withResponse?: () => Promise<unknown> }
  ).withResponse;
  if (typeof withResponse === 'function') {
    const result = (await withResponse()) as {
      data: unknown;
      response?: { headers?: HeadersLike };
    };
    return {
      data: result.data,
      rateLimits: parseRateLimitHeaders(result.response?.headers, headerNames),
    };
  }
  return { data: await createResult };
}
