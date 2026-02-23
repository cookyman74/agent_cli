/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Pricing information for a single model.
 *
 * All prices are in USD per 1 million tokens.
 */
export interface ModelPricing {
  /** USD per 1M input tokens */
  inputPerMToken: number;
  /** USD per 1M output tokens */
  outputPerMToken: number;
  /** USD per 1M cached input tokens (optional — fallback to inputPerMToken) */
  cachedPerMToken?: number;
}

/**
 * Static pricing table: provider → model → pricing.
 *
 * Prices sourced from official API pricing pages (as of 2026-02).
 * Models not listed here will be treated as $0 (unknown pricing).
 */
export const MODEL_PRICING: Record<string, Record<string, ModelPricing>> = {
  gemini: {
    'gemini-2.5-pro': {
      inputPerMToken: 1.25,
      outputPerMToken: 10.0,
      cachedPerMToken: 0.125,
    },
    'gemini-2.5-flash': {
      inputPerMToken: 0.3,
      outputPerMToken: 2.5,
      cachedPerMToken: 0.03,
    },
    'gemini-2.5-flash-lite': {
      inputPerMToken: 0.1,
      outputPerMToken: 0.4,
      cachedPerMToken: 0.01,
    },
  },
  claude: {
    'claude-opus-4-6': {
      inputPerMToken: 5.0,
      outputPerMToken: 25.0,
      cachedPerMToken: 0.5,
    },
    'claude-sonnet-4-5-20250929': {
      inputPerMToken: 3.0,
      outputPerMToken: 15.0,
      cachedPerMToken: 0.3,
    },
    'claude-haiku-4-5-20251001': {
      inputPerMToken: 1.0,
      outputPerMToken: 5.0,
      cachedPerMToken: 0.1,
    },
  },
  openai: {
    'gpt-5.2': {
      inputPerMToken: 1.25,
      outputPerMToken: 10.0,
      cachedPerMToken: 0.625,
    },
    'gpt-5-mini': {
      inputPerMToken: 0.4,
      outputPerMToken: 1.6,
      cachedPerMToken: 0.1,
    },
    'gpt-4.1': {
      inputPerMToken: 2.0,
      outputPerMToken: 8.0,
      cachedPerMToken: 0.5,
    },
    'gpt-4.1-mini': {
      inputPerMToken: 0.4,
      outputPerMToken: 1.6,
      cachedPerMToken: 0.1,
    },
    o3: {
      inputPerMToken: 2.0,
      outputPerMToken: 8.0,
    },
    'o4-mini': {
      inputPerMToken: 1.1,
      outputPerMToken: 4.4,
      cachedPerMToken: 0.275,
    },
  },
};

/**
 * Result of cost estimation across all models.
 */
export interface CostEstimate {
  /** Total estimated cost in USD */
  totalCost: number;
  /** Cost breakdown per provider in USD */
  byProvider: Record<string, number>;
}

/**
 * Token shape expected by estimateCost — subset of ModelMetrics.tokens.
 */
interface TokenInfo {
  input: number;
  cached: number;
  candidates: number;
}

const TOKENS_PER_MILLION = 1_000_000;

/**
 * Estimate cost based on token usage and static pricing table.
 *
 * @param models - Record of composite-key → token info
 * @param parseKey - Function to extract { provider, model } from composite key
 * @returns CostEstimate with total and per-provider breakdown
 */
export function estimateCost(
  models: Record<string, { tokens: TokenInfo }>,
  parseKey: (key: string) => { provider: string; model: string },
): CostEstimate {
  const byProvider: Record<string, number> = {};

  for (const [key, entry] of Object.entries(models)) {
    const { provider, model } = parseKey(key);
    const pricing = MODEL_PRICING[provider]?.[model];
    if (!pricing) continue;

    const nonCachedInput = Math.max(
      0,
      entry.tokens.input - entry.tokens.cached,
    );
    const cachedRate = pricing.cachedPerMToken ?? pricing.inputPerMToken;

    const inputCost =
      (nonCachedInput / TOKENS_PER_MILLION) * pricing.inputPerMToken;
    const cachedCost = (entry.tokens.cached / TOKENS_PER_MILLION) * cachedRate;
    const outputCost =
      (entry.tokens.candidates / TOKENS_PER_MILLION) * pricing.outputPerMToken;

    const modelCost = inputCost + cachedCost + outputCost;
    byProvider[provider] = (byProvider[provider] ?? 0) + modelCost;
  }

  const totalCost = Object.values(byProvider).reduce((sum, v) => sum + v, 0);
  return { totalCost, byProvider };
}

/**
 * Capitalize first letter of a string.
 */
function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Format a CostEstimate into a human-readable string.
 *
 * - Zero: "$0.00"
 * - Very small (< $0.01): "< $0.01"
 * - Single provider: "$1.23"
 * - Multi-provider: "$5.68 (Gemini $2.35 + Claude $3.33)"
 */
export function formatCostString(estimate: CostEstimate): string {
  if (estimate.totalCost === 0) return '$0.00';
  if (estimate.totalCost > 0 && estimate.totalCost < 0.01) return '< $0.01';

  const providers = Object.entries(estimate.byProvider);
  const totalStr = `$${estimate.totalCost.toFixed(2)}`;

  if (providers.length <= 1) return totalStr;

  const breakdown = providers
    .map(([name, cost]) => `${capitalize(name)} $${cost.toFixed(2)}`)
    .join(' + ');

  return `${totalStr} (${breakdown})`;
}
