/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '../../test-utils/render.js';
import { describe, it, expect, vi } from 'vitest';
import { StatsDisplay } from './StatsDisplay.js';
import * as SessionContext from '../contexts/SessionContext.js';
import type { SessionMetrics } from '../contexts/SessionContext.js';
import {
  ToolCallDecision,
  type RetrieveUserQuotaResponse,
} from '@didim365/agent-cli-core';

// Mock the context to provide controlled data for testing
vi.mock('../contexts/SessionContext.js', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContext>();
  return {
    ...actual,
    useSessionStats: vi.fn(),
  };
});

const useSessionStatsMock = vi.mocked(SessionContext.useSessionStats);

const renderWithMockedStats = (metrics: SessionMetrics) => {
  useSessionStatsMock.mockReturnValue({
    stats: {
      sessionId: 'test-session-id',
      sessionStartTime: new Date(),
      metrics,
      lastPromptTokenCount: 0,
      promptCount: 5,
    },

    getPromptCount: () => 5,
    startNewPrompt: vi.fn(),
  });

  return render(<StatsDisplay duration="1s" />);
};

// Helper to create metrics with default zero values
const createTestMetrics = (
  overrides: Partial<SessionMetrics> = {},
): SessionMetrics => ({
  models: {},
  tools: {
    totalCalls: 0,
    totalSuccess: 0,
    totalFail: 0,
    totalDurationMs: 0,
    totalDecisions: {
      accept: 0,
      reject: 0,
      modify: 0,
      [ToolCallDecision.AUTO_ACCEPT]: 0,
    },
    byName: {},
  },
  files: {
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
  },
  ...overrides,
});

describe('<StatsDisplay />', () => {
  it('renders only the Performance section in its zero state', () => {
    const zeroMetrics = createTestMetrics();

    const { lastFrame } = renderWithMockedStats(zeroMetrics);
    const output = lastFrame();

    expect(output).toContain('Performance');
    expect(output).toContain('Interaction Summary');
    expect(output).toMatchSnapshot();
  });

  it('renders a table with two models correctly', () => {
    const metrics = createTestMetrics({
      models: {
        'gemini::gemini-2.5-pro': {
          provider: 'gemini',
          api: { totalRequests: 3, totalErrors: 0, totalLatencyMs: 15000 },
          tokens: {
            input: 500,
            prompt: 1000,
            candidates: 2000,
            total: 43234,
            cached: 500,
            cacheCreation: 0,
            thoughts: 100,
            tool: 50,
          },
        },
        'gemini::gemini-2.5-flash': {
          provider: 'gemini',
          api: { totalRequests: 5, totalErrors: 1, totalLatencyMs: 4500 },
          tokens: {
            input: 15000,
            prompt: 25000,
            candidates: 15000,
            total: 150000000,
            cached: 10000,
            cacheCreation: 0,
            thoughts: 2000,
            tool: 1000,
          },
        },
      },
    });

    const { lastFrame } = renderWithMockedStats(metrics);
    const output = lastFrame();

    expect(output).toContain('gemini-2.5-pro');
    expect(output).toContain('gemini-2.5-flash');
    expect(output).toContain('15,000');
    expect(output).toContain('10,000');
    expect(output).toMatchSnapshot();
  });

  it('renders all sections when all data is present', () => {
    const metrics = createTestMetrics({
      models: {
        'gemini::gemini-2.5-pro': {
          provider: 'gemini',
          api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
          tokens: {
            input: 50,
            prompt: 100,
            candidates: 100,
            total: 250,
            cached: 50,
            cacheCreation: 0,
            thoughts: 0,
            tool: 0,
          },
        },
      },
      tools: {
        totalCalls: 2,
        totalSuccess: 1,
        totalFail: 1,
        totalDurationMs: 123,
        totalDecisions: {
          accept: 1,
          reject: 0,
          modify: 0,
          [ToolCallDecision.AUTO_ACCEPT]: 0,
        },
        byName: {
          'test-tool': {
            count: 2,
            success: 1,
            fail: 1,
            durationMs: 123,
            decisions: {
              accept: 1,
              reject: 0,
              modify: 0,
              [ToolCallDecision.AUTO_ACCEPT]: 0,
            },
          },
        },
      },
    });

    const { lastFrame } = renderWithMockedStats(metrics);
    const output = lastFrame();

    expect(output).toContain('Performance');
    expect(output).toContain('Interaction Summary');
    expect(output).toContain('User Agreement');
    expect(output).toContain('gemini-2.5-pro');
    expect(output).toMatchSnapshot();
  });

  describe('Conditional Rendering Tests', () => {
    it('hides User Agreement when no decisions are made', () => {
      const metrics = createTestMetrics({
        tools: {
          totalCalls: 2,
          totalSuccess: 1,
          totalFail: 1,
          totalDurationMs: 123,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          }, // No decisions
          byName: {
            'test-tool': {
              count: 2,
              success: 1,
              fail: 1,
              durationMs: 123,
              decisions: {
                accept: 0,
                reject: 0,
                modify: 0,
                [ToolCallDecision.AUTO_ACCEPT]: 0,
              },
            },
          },
        },
      });

      const { lastFrame } = renderWithMockedStats(metrics);
      const output = lastFrame();

      expect(output).toContain('Interaction Summary');
      expect(output).toContain('Success Rate');
      expect(output).not.toContain('User Agreement');
      expect(output).toMatchSnapshot();
    });

    it('hides Efficiency section when cache is not used', () => {
      const metrics = createTestMetrics({
        models: {
          'gemini::gemini-2.5-pro': {
            provider: 'gemini',
            api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
            tokens: {
              input: 100,
              prompt: 100,
              candidates: 100,
              total: 200,
              cached: 0,
              cacheCreation: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
      });

      const { lastFrame } = renderWithMockedStats(metrics);
      const output = lastFrame();

      expect(output).toMatchSnapshot();
    });
  });

  describe('Conditional Color Tests', () => {
    it('renders success rate in green for high values', () => {
      const metrics = createTestMetrics({
        tools: {
          totalCalls: 10,
          totalSuccess: 10,
          totalFail: 0,
          totalDurationMs: 0,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          },
          byName: {},
        },
      });
      const { lastFrame } = renderWithMockedStats(metrics);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders success rate in yellow for medium values', () => {
      const metrics = createTestMetrics({
        tools: {
          totalCalls: 10,
          totalSuccess: 9,
          totalFail: 1,
          totalDurationMs: 0,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          },
          byName: {},
        },
      });
      const { lastFrame } = renderWithMockedStats(metrics);
      expect(lastFrame()).toMatchSnapshot();
    });

    it('renders success rate in red for low values', () => {
      const metrics = createTestMetrics({
        tools: {
          totalCalls: 10,
          totalSuccess: 5,
          totalFail: 5,
          totalDurationMs: 0,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          },
          byName: {},
        },
      });
      const { lastFrame } = renderWithMockedStats(metrics);
      expect(lastFrame()).toMatchSnapshot();
    });
  });

  describe('Code Changes Display', () => {
    it('displays Code Changes when line counts are present', () => {
      const metrics = createTestMetrics({
        tools: {
          totalCalls: 1,
          totalSuccess: 1,
          totalFail: 0,
          totalDurationMs: 100,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          },
          byName: {},
        },
        files: {
          totalLinesAdded: 42,
          totalLinesRemoved: 18,
        },
      });

      const { lastFrame } = renderWithMockedStats(metrics);
      const output = lastFrame();

      expect(output).toContain('Code Changes:');
      expect(output).toContain('+42');
      expect(output).toContain('-18');
      expect(output).toMatchSnapshot();
    });

    it('hides Code Changes when no lines are added or removed', () => {
      const metrics = createTestMetrics({
        tools: {
          totalCalls: 1,
          totalSuccess: 1,
          totalFail: 0,
          totalDurationMs: 100,
          totalDecisions: {
            accept: 0,
            reject: 0,
            modify: 0,
            [ToolCallDecision.AUTO_ACCEPT]: 0,
          },
          byName: {},
        },
      });

      const { lastFrame } = renderWithMockedStats(metrics);
      const output = lastFrame();

      expect(output).not.toContain('Code Changes:');
      expect(output).toMatchSnapshot();
    });
  });

  describe('Title Rendering', () => {
    const zeroMetrics = createTestMetrics();

    it('renders the default title when no title prop is provided', () => {
      const { lastFrame } = renderWithMockedStats(zeroMetrics);
      const output = lastFrame();
      expect(output).toContain('Session Stats');
      expect(output).not.toContain('Agent powering down');
      expect(output).toMatchSnapshot();
    });

    it('renders the custom title when a title prop is provided', () => {
      useSessionStatsMock.mockReturnValue({
        stats: {
          sessionId: 'test-session-id',
          sessionStartTime: new Date(),
          metrics: zeroMetrics,
          lastPromptTokenCount: 0,
          promptCount: 5,
        },

        getPromptCount: () => 5,
        startNewPrompt: vi.fn(),
      });

      const { lastFrame } = render(
        <StatsDisplay duration="1s" title="Agent powering down. Goodbye!" />,
      );
      const output = lastFrame();
      expect(output).toContain('Agent powering down. Goodbye!');
      expect(output).not.toContain('Session Stats');
      expect(output).toMatchSnapshot();
    });
  });

  // Phase 1 RED-5: Provider disambiguation in multi-provider scenarios
  describe('Provider Disambiguation', () => {
    it('shows provider-qualified names when multiple providers exist', () => {
      const metrics = createTestMetrics({
        models: {
          'gemini::gemini-2.5-pro': {
            provider: 'gemini',
            api: { totalRequests: 3, totalErrors: 0, totalLatencyMs: 15000 },
            tokens: {
              input: 500,
              prompt: 1000,
              candidates: 2000,
              total: 3000,
              cached: 500,
              cacheCreation: 0,
              thoughts: 0,
              tool: 0,
            },
          },
          'claude::claude-sonnet-4': {
            provider: 'claude',
            api: { totalRequests: 2, totalErrors: 0, totalLatencyMs: 8000 },
            tokens: {
              input: 300,
              prompt: 600,
              candidates: 1000,
              total: 1600,
              cached: 300,
              cacheCreation: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
      });

      const { lastFrame } = renderWithMockedStats(metrics);
      const output = lastFrame();

      // Multi-provider: should show provider-qualified display names
      expect(output).toContain('gemini-2.5-pro (gemini)');
      expect(output).toContain('claude-sonnet-4 (claude)');
      // Should NOT show raw composite key separators
      expect(output).not.toContain('gemini::');
      expect(output).not.toContain('claude::');
    });

    it('does not show provider qualification when single provider', () => {
      const metrics = createTestMetrics({
        models: {
          'gemini::gemini-2.5-pro': {
            provider: 'gemini',
            api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
            tokens: {
              input: 50,
              prompt: 100,
              candidates: 100,
              total: 250,
              cached: 50,
              cacheCreation: 0,
              thoughts: 0,
              tool: 0,
            },
          },
          'gemini::gemini-2.5-flash': {
            provider: 'gemini',
            api: { totalRequests: 2, totalErrors: 0, totalLatencyMs: 200 },
            tokens: {
              input: 100,
              prompt: 200,
              candidates: 200,
              total: 500,
              cached: 100,
              cacheCreation: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
      });

      const { lastFrame } = renderWithMockedStats(metrics);
      const output = lastFrame();

      // Single provider: should show model names WITHOUT provider qualification
      expect(output).toContain('gemini-2.5-pro');
      expect(output).toContain('gemini-2.5-flash');
      expect(output).not.toContain('(gemini)');
      expect(output).not.toContain('gemini::');
    });

    it('disambiguates same model name from different providers', () => {
      const metrics = createTestMetrics({
        models: {
          'openai::gpt-5.2': {
            provider: 'openai',
            api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
            tokens: {
              input: 50,
              prompt: 100,
              candidates: 100,
              total: 200,
              cached: 0,
              cacheCreation: 0,
              thoughts: 0,
              tool: 0,
            },
          },
          'openai-compatible::gpt-5.2': {
            provider: 'openai-compatible',
            api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 200 },
            tokens: {
              input: 30,
              prompt: 60,
              candidates: 80,
              total: 140,
              cached: 0,
              cacheCreation: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
      });

      const { lastFrame } = renderWithMockedStats(metrics);
      const output = lastFrame();

      // Should show provider-qualified names to prevent confusion
      // Note: long provider names may be truncated by 25-char nameWidth
      expect(output).toContain('gpt-5.2 (openai)');
      expect(output).toContain('gpt-5.2 (openai-compatib');
    });
  });

  // Phase 1 RED-6: VALID_GEMINI_MODELS replacement with PROVIDER_MODEL_REGISTRY
  describe('Quota-only row filtering with PROVIDER_MODEL_REGISTRY', () => {
    it('shows quota-only rows for models in PROVIDER_MODEL_REGISTRY.gemini', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      // Only gemini-2.5-pro is active; gemini-2.5-flash has quota only
      const metrics = createTestMetrics({
        models: {
          'gemini::gemini-2.5-pro': {
            provider: 'gemini',
            api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
            tokens: {
              input: 50,
              prompt: 100,
              candidates: 100,
              total: 250,
              cached: 50,
              cacheCreation: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
      });

      const resetTime = new Date(now.getTime() + 1000 * 60 * 60).toISOString();

      const quotas: RetrieveUserQuotaResponse = {
        buckets: [
          { modelId: 'gemini-2.5-pro', remainingFraction: 0.8, resetTime },
          { modelId: 'gemini-2.5-flash', remainingFraction: 0.5, resetTime }, // registered in PROVIDER_MODEL_REGISTRY
        ],
      };

      useSessionStatsMock.mockReturnValue({
        stats: {
          sessionId: 'test-session-id',
          sessionStartTime: new Date(),
          metrics,
          lastPromptTokenCount: 0,
          promptCount: 5,
        },
        getPromptCount: () => 5,
        startNewPrompt: vi.fn(),
      });

      const { lastFrame } = render(
        <StatsDisplay duration="1s" quotas={quotas} />,
      );
      const output = lastFrame();

      // gemini-2.5-flash should appear as quota-only row
      expect(output).toContain('gemini-2.5-flash');
      expect(output).toContain('50.0%');

      vi.useRealTimers();
    });

    it('does not suppress Gemini quota-only when non-Gemini provider uses same modelId', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      // openai-compatible uses a model named 'gemini-2.5-flash' (unlikely but possible)
      const metrics = createTestMetrics({
        models: {
          'openai-compatible::gemini-2.5-flash': {
            provider: 'openai-compatible',
            api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
            tokens: {
              input: 50,
              prompt: 100,
              candidates: 100,
              total: 200,
              cached: 0,
              cacheCreation: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
      });

      const resetTime = new Date(now.getTime() + 1000 * 60 * 60).toISOString();

      const quotas: RetrieveUserQuotaResponse = {
        buckets: [
          { modelId: 'gemini-2.5-flash', remainingFraction: 0.5, resetTime },
        ],
      };

      useSessionStatsMock.mockReturnValue({
        stats: {
          sessionId: 'test-session-id',
          sessionStartTime: new Date(),
          metrics,
          lastPromptTokenCount: 0,
          promptCount: 5,
        },
        getPromptCount: () => 5,
        startNewPrompt: vi.fn(),
      });

      const { lastFrame } = render(
        <StatsDisplay duration="1s" quotas={quotas} />,
      );
      const output = lastFrame();

      // Gemini quota-only row should STILL appear even though non-Gemini uses same modelId
      expect(output).toContain('gemini-2.5-flash');
      expect(output).toContain('50.0%');

      vi.useRealTimers();
    });

    it('does NOT show quota-only rows for unknown gemini quota buckets', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const metrics = createTestMetrics({
        models: {
          'gemini::gemini-2.5-pro': {
            provider: 'gemini',
            api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
            tokens: {
              input: 50,
              prompt: 100,
              candidates: 100,
              total: 250,
              cached: 50,
              cacheCreation: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
      });

      const resetTime = new Date(now.getTime() + 1000 * 60 * 60).toISOString();

      const quotas: RetrieveUserQuotaResponse = {
        buckets: [
          // Not in PROVIDER_MODEL_REGISTRY → should NOT appear as quota-only
          {
            modelId: 'gemini-experimental-xyz',
            remainingFraction: 0.3,
            resetTime,
          },
        ],
      };

      useSessionStatsMock.mockReturnValue({
        stats: {
          sessionId: 'test-session-id',
          sessionStartTime: new Date(),
          metrics,
          lastPromptTokenCount: 0,
          promptCount: 5,
        },
        getPromptCount: () => 5,
        startNewPrompt: vi.fn(),
      });

      const { lastFrame } = render(
        <StatsDisplay duration="1s" quotas={quotas} />,
      );
      const output = lastFrame();

      // Unknown experimental model should NOT appear
      expect(output).not.toContain('gemini-experimental-xyz');

      vi.useRealTimers();
    });
  });

  describe('Quota Display', () => {
    it('renders quota information when quotas are provided', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const metrics = createTestMetrics({
        models: {
          'gemini::gemini-2.5-pro': {
            provider: 'gemini',
            api: { totalRequests: 1, totalErrors: 0, totalLatencyMs: 100 },
            tokens: {
              input: 50,
              prompt: 100,
              candidates: 100,
              total: 250,
              cached: 50,
              cacheCreation: 0,
              thoughts: 0,
              tool: 0,
            },
          },
        },
      });

      const resetTime = new Date(now.getTime() + 1000 * 60 * 90).toISOString(); // 1 hour 30 minutes from now

      const quotas: RetrieveUserQuotaResponse = {
        buckets: [
          {
            modelId: 'gemini-2.5-pro',
            remainingFraction: 0.75,
            resetTime,
          },
        ],
      };

      useSessionStatsMock.mockReturnValue({
        stats: {
          sessionId: 'test-session-id',
          sessionStartTime: new Date(),
          metrics,
          lastPromptTokenCount: 0,
          promptCount: 5,
        },

        getPromptCount: () => 5,
        startNewPrompt: vi.fn(),
      });

      const { lastFrame } = render(
        <StatsDisplay duration="1s" quotas={quotas} />,
      );
      const output = lastFrame();

      expect(output).toContain('Usage left');
      expect(output).toContain('75.0%');
      expect(output).toContain('(Resets in 1h 30m)');
      expect(output).toMatchSnapshot();

      vi.useRealTimers();
    });

    it('renders quota information for unused models', () => {
      const now = new Date('2025-01-01T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);

      // No models in metrics, but a quota for gemini-2.5-flash
      const metrics = createTestMetrics();

      const resetTime = new Date(now.getTime() + 1000 * 60 * 120).toISOString(); // 2 hours from now

      const quotas: RetrieveUserQuotaResponse = {
        buckets: [
          {
            modelId: 'gemini-2.5-flash',
            remainingFraction: 0.5,
            resetTime,
          },
        ],
      };

      useSessionStatsMock.mockReturnValue({
        stats: {
          sessionId: 'test-session-id',
          sessionStartTime: new Date(),
          metrics,
          lastPromptTokenCount: 0,
          promptCount: 5,
        },
        getPromptCount: () => 5,
        startNewPrompt: vi.fn(),
      });

      const { lastFrame } = render(
        <StatsDisplay duration="1s" quotas={quotas} />,
      );
      const output = lastFrame();

      expect(output).toContain('gemini-2.5-flash');
      expect(output).toContain('-'); // for requests
      expect(output).toContain('50.0%');
      expect(output).toContain('(Resets in 2h)');
      expect(output).toMatchSnapshot();

      vi.useRealTimers();
    });
  });
});
