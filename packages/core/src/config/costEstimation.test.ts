/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  estimateCost,
  formatCostString,
  MODEL_PRICING,
} from './costEstimation.js';
import { parseCompositeKey } from '../telemetry/uiTelemetry.js';

describe('costEstimation (Phase 4 F4-2)', () => {
  describe('MODEL_PRICING', () => {
    it('should contain pricing for known gemini models', () => {
      expect(MODEL_PRICING['gemini']).toBeDefined();
      expect(MODEL_PRICING['gemini']['gemini-2.5-pro']).toBeDefined();
      expect(MODEL_PRICING['gemini']['gemini-2.5-flash']).toBeDefined();
      expect(MODEL_PRICING['gemini']['gemini-2.5-flash-lite']).toBeDefined();
    });

    it('should contain pricing for known claude models', () => {
      expect(MODEL_PRICING['claude']).toBeDefined();
      expect(MODEL_PRICING['claude']['claude-opus-4-6']).toBeDefined();
      expect(
        MODEL_PRICING['claude']['claude-sonnet-4-5-20250929'],
      ).toBeDefined();
      expect(
        MODEL_PRICING['claude']['claude-haiku-4-5-20251001'],
      ).toBeDefined();
    });

    it('should contain pricing for known openai models', () => {
      expect(MODEL_PRICING['openai']).toBeDefined();
      expect(MODEL_PRICING['openai']['gpt-5.2']).toBeDefined();
      expect(MODEL_PRICING['openai']['o3']).toBeDefined();
      expect(MODEL_PRICING['openai']['o4-mini']).toBeDefined();
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost for a known single model', () => {
      // gemini-2.5-pro: input $1.25/MTok, output $10.00/MTok, cached $0.125/MTok
      const models = {
        'gemini::gemini-2.5-pro': {
          tokens: { input: 1_000_000, cached: 200_000, candidates: 500_000 },
        },
      };

      const result = estimateCost(models, parseCompositeKey);

      // input cost: (1_000_000 - 200_000) / 1_000_000 * 1.25 = 1.0
      // cached cost: 200_000 / 1_000_000 * 0.125 = 0.025
      // output cost: 500_000 / 1_000_000 * 10.0 = 5.0
      // total = 6.025
      expect(result.totalCost).toBeCloseTo(6.025, 3);
      expect(result.byProvider['gemini']).toBeCloseTo(6.025, 3);
    });

    it('should return zero cost for unknown models', () => {
      const models = {
        'custom::unknown-model-xyz': {
          tokens: { input: 1_000_000, cached: 0, candidates: 500_000 },
        },
      };

      const result = estimateCost(models, parseCompositeKey);

      expect(result.totalCost).toBe(0);
      expect(result.byProvider).toEqual({});
    });

    it('should aggregate costs by provider for multi-provider scenario', () => {
      const models = {
        // gemini-2.5-flash: input $0.30/MTok, output $2.50/MTok, cached $0.03/MTok
        'gemini::gemini-2.5-flash': {
          tokens: { input: 2_000_000, cached: 500_000, candidates: 1_000_000 },
        },
        // claude-sonnet-4-5: input $3/MTok, output $15/MTok, cached $0.30/MTok
        'claude::claude-sonnet-4-5-20250929': {
          tokens: { input: 100_000, cached: 20_000, candidates: 50_000 },
        },
      };

      const result = estimateCost(models, parseCompositeKey);

      // gemini-2.5-flash:
      //   input: (2_000_000 - 500_000) / 1M * 0.30 = 0.45
      //   cached: 500_000 / 1M * 0.03 = 0.015
      //   output: 1_000_000 / 1M * 2.50 = 2.50
      //   subtotal = 2.965
      const geminiCost = 0.45 + 0.015 + 2.5;
      expect(result.byProvider['gemini']).toBeCloseTo(geminiCost, 3);

      // claude-sonnet-4-5:
      //   input: (100_000 - 20_000) / 1M * 3.0 = 0.24
      //   cached: 20_000 / 1M * 0.30 = 0.006
      //   output: 50_000 / 1M * 15.0 = 0.75
      //   subtotal = 0.996
      const claudeCost = 0.24 + 0.006 + 0.75;
      expect(result.byProvider['claude']).toBeCloseTo(claudeCost, 3);

      expect(result.totalCost).toBeCloseTo(geminiCost + claudeCost, 3);
    });

    it('should return empty result for empty models', () => {
      const result = estimateCost({}, parseCompositeKey);

      expect(result.totalCost).toBe(0);
      expect(result.byProvider).toEqual({});
    });

    it('should handle model with no cached pricing (fallback to input rate)', () => {
      // o3: input $2.00/MTok, output $8.00/MTok, NO cachedPerMToken
      const models = {
        'openai::o3': {
          tokens: { input: 500_000, cached: 100_000, candidates: 200_000 },
        },
      };

      const result = estimateCost(models, parseCompositeKey);

      // When no cached pricing, cached tokens use input rate
      // input: (500_000 - 100_000) / 1M * 2.0 = 0.8
      // cached: 100_000 / 1M * 2.0 = 0.2  (uses inputPerMToken)
      // output: 200_000 / 1M * 8.0 = 1.6
      // total = 2.6
      expect(result.totalCost).toBeCloseTo(2.6, 3);
    });
  });

  describe('formatCostString', () => {
    it('should format single provider cost', () => {
      const result = formatCostString({
        totalCost: 1.234,
        byProvider: { gemini: 1.234 },
      });

      expect(result).toBe('$1.23');
    });

    it('should format multi-provider cost with breakdown', () => {
      const result = formatCostString({
        totalCost: 5.678,
        byProvider: { gemini: 2.345, claude: 3.333 },
      });

      // Should include breakdown: "$5.68 (Gemini $2.35 + Claude $3.33)"
      expect(result).toContain('$5.68');
      expect(result).toContain('Gemini');
      expect(result).toContain('Claude');
    });

    it('should format zero cost', () => {
      const result = formatCostString({
        totalCost: 0,
        byProvider: {},
      });

      expect(result).toBe('$0.00');
    });

    it('should format very small cost with enough precision', () => {
      const result = formatCostString({
        totalCost: 0.001,
        byProvider: { gemini: 0.001 },
      });

      // Should show meaningful precision for small amounts
      expect(result).toBe('< $0.01');
    });
  });
});
