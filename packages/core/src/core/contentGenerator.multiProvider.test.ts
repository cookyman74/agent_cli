/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M3.0.5 regression tests for multi-provider selection in createContentGenerator.
 *
 * Tests the 7 scenarios from the phase3 todolist covering all combinations
 * of ENABLE_MULTI_PROVIDER, LLM_PROVIDER, and authType.
 *
 * @see docs/ai_adapter/todolist/phase3_provider_extension_todolist.md §3.0.5.5
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createContentGenerator,
  AuthType,
  isProviderIndependentGenerator,
} from './contentGenerator.js';
import type { Config } from '../config/config.js';
import {
  setMultiProviderOverride,
  clearMultiProviderOverride,
} from '../providers/gemini/featureFlag.js';
import { ProviderRegistry } from '../providers/registry.js';
import { GoogleGenAI } from '@google/genai';
import { LoggingContentGenerator } from './loggingContentGenerator.js';

// ============================================================================
// Module mocks
// ============================================================================

vi.mock('@google/genai');
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}));
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}));
vi.mock('../code_assist/codeAssist.js');
vi.mock('./apiKeyCredentialStorage.js', () => ({
  loadApiKey: vi.fn(),
}));
vi.mock('./fakeContentGenerator.js');

// ============================================================================
// Helpers
// ============================================================================

function createMockConfig(overrides: Partial<Config> = {}): Config {
  return {
    getModel: vi.fn().mockReturnValue('gemini-pro'),
    getProxy: vi.fn().mockReturnValue(undefined),
    getUsageStatisticsEnabled: vi.fn().mockReturnValue(false),
    getPreviewFeatures: vi.fn().mockReturnValue(false),
    getContentGeneratorConfig: vi.fn().mockReturnValue(undefined),
    setLatestApiRequest: vi.fn(),
    ...overrides,
  } as unknown as Config;
}

/** Create a mock BaseAdapter for non-Gemini providers. */
function createMockAdapter(providerName: string) {
  return {
    providerName,
    capabilities: {
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsImageInput: false,
      supportsImageGeneration: false,
      supportsEmbedding: false,
      supportsTokenCount: true,
      supportsSystemMessage: true,
      supportsThought: false,
      maxContextLength: 200_000,
      maxOutputTokens: 4_096,
    },
    generateContent: vi.fn().mockResolvedValue({
      id: 'resp-1',
      content: [{ type: 'text', text: 'mock response' }],
      model: 'mock-model',
      stopReason: 'end_turn',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    }),
    generateContentStream: vi.fn(),
    countTokens: vi.fn().mockResolvedValue({ totalTokens: 100 }),
    embedContent: vi.fn(),
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Multi-provider selection in createContentGenerator', () => {
  let registry: ProviderRegistry;
  const mockGoogleGenAI = {
    models: {
      generateContent: vi.fn(),
      generateContentStream: vi.fn(),
      countTokens: vi.fn(),
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    clearMultiProviderOverride();
    registry = ProviderRegistry.getInstance();
    registry.clear();

    // Setup GoogleGenAI mock (for Gemini paths)
    vi.mocked(GoogleGenAI).mockImplementation(() => mockGoogleGenAI as never);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearMultiProviderOverride();
    registry.clear();
  });

  // ========================================================================
  // Scenario 1: flag=false, no LLM_PROVIDER, USE_GEMINI → Gemini (legacy)
  // ========================================================================
  it('Scenario 1: flag=false, USE_GEMINI → Gemini via legacy path', async () => {
    setMultiProviderOverride(false);

    const generator = await createContentGenerator(
      { apiKey: 'test-key', authType: AuthType.USE_GEMINI },
      createMockConfig(),
    );

    expect(GoogleGenAI).toHaveBeenCalled();
    expect(generator).toBeInstanceOf(LoggingContentGenerator);
  });

  // ========================================================================
  // Scenario 2: flag=false, LLM_PROVIDER=claude, USE_GEMINI → Gemini
  //             (flag off → legacy path, LLM_PROVIDER ignored)
  // ========================================================================
  it('Scenario 2: flag=false, LLM_PROVIDER=claude → Gemini (flag off ignores LLM_PROVIDER)', async () => {
    setMultiProviderOverride(false);
    vi.stubEnv('LLM_PROVIDER', 'claude');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-claude-key');

    const generator = await createContentGenerator(
      { apiKey: 'test-key', authType: AuthType.USE_GEMINI },
      createMockConfig(),
    );

    // Still uses GoogleGenAI (legacy path)
    expect(GoogleGenAI).toHaveBeenCalled();
    expect(generator).toBeInstanceOf(LoggingContentGenerator);
  });

  // ========================================================================
  // Scenario 3: flag=true, no LLM_PROVIDER, USE_GEMINI → Gemini
  //             (selectProvider returns Gemini → falls through to legacy)
  // ========================================================================
  it('Scenario 3: flag=true, USE_GEMINI → Gemini (falls through to legacy path)', async () => {
    setMultiProviderOverride(true);
    vi.stubEnv('GEMINI_API_KEY', 'test-key');

    const generator = await createContentGenerator(
      { apiKey: 'test-key', authType: AuthType.USE_GEMINI },
      createMockConfig(),
    );

    expect(GoogleGenAI).toHaveBeenCalled();
    expect(generator).toBeInstanceOf(LoggingContentGenerator);
  });

  // ========================================================================
  // Scenario 4: flag=true, LLM_PROVIDER=claude → Claude
  //             (non-Gemini → ProviderFactory path)
  // ========================================================================
  it('Scenario 4: flag=true, LLM_PROVIDER=claude → Claude via ProviderFactory', async () => {
    setMultiProviderOverride(true);
    vi.stubEnv('LLM_PROVIDER', 'claude');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-claude-key');

    // Register mock Claude adapter
    const mockClaudeAdapter = createMockAdapter('claude');
    registry.register('claude', () => mockClaudeAdapter as never);

    const generator = await createContentGenerator({}, createMockConfig());

    // Should NOT use GoogleGenAI
    expect(GoogleGenAI).not.toHaveBeenCalled();
    // Should return LoggingContentGenerator wrapping the adapter
    expect(generator).toBeInstanceOf(LoggingContentGenerator);
    // The wrapped generator should have llm* methods
    expect(isProviderIndependentGenerator(generator)).toBe(true);
  });

  // ========================================================================
  // Scenario 5: flag=true, LLM_PROVIDER=openai, USE_VERTEX_AI → OpenAI
  //             (LLM_PROVIDER takes priority over authType)
  // ========================================================================
  it('Scenario 5: flag=true, LLM_PROVIDER=openai → OpenAI (LLM_PROVIDER priority over authType)', async () => {
    setMultiProviderOverride(true);
    vi.stubEnv('LLM_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');

    // Register mock OpenAI adapter
    const mockOpenAIAdapter = createMockAdapter('openai');
    registry.register('openai', () => mockOpenAIAdapter as never);

    const generator = await createContentGenerator(
      { authType: AuthType.USE_VERTEX_AI },
      createMockConfig(),
    );

    // Should NOT use GoogleGenAI (LLM_PROVIDER=openai overrides authType)
    expect(GoogleGenAI).not.toHaveBeenCalled();
    expect(generator).toBeInstanceOf(LoggingContentGenerator);
    expect(isProviderIndependentGenerator(generator)).toBe(true);
  });

  // ========================================================================
  // Scenario 5b: flag=true, LLM_PROVIDER=openai → auto-bootstrap
  //              (Review fix: OpenAI provider is auto-bootstrapped in contentGenerator)
  // ========================================================================
  it('Scenario 5b: flag=true, LLM_PROVIDER=openai → auto-bootstrap without manual registration', async () => {
    setMultiProviderOverride(true);
    vi.stubEnv('LLM_PROVIDER', 'openai');
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key');

    // Do NOT manually register OpenAI — rely on bootstrapOpenAiProvider() in contentGenerator
    const generator = await createContentGenerator({}, createMockConfig());

    expect(GoogleGenAI).not.toHaveBeenCalled();
    expect(generator).toBeInstanceOf(LoggingContentGenerator);
    expect(isProviderIndependentGenerator(generator)).toBe(true);
  });

  // ========================================================================
  // Scenario 6: flag=true, no LLM_PROVIDER, USE_VERTEX_AI → Gemini
  //             (authType implies Gemini → falls through to legacy)
  // ========================================================================
  it('Scenario 6: flag=true, USE_VERTEX_AI → Gemini (authType implies Gemini)', async () => {
    setMultiProviderOverride(true);
    vi.stubEnv('GEMINI_API_KEY', 'test-key');

    const generator = await createContentGenerator(
      { apiKey: 'test-key', authType: AuthType.USE_VERTEX_AI, vertexai: true },
      createMockConfig(),
    );

    expect(GoogleGenAI).toHaveBeenCalled();
    expect(generator).toBeInstanceOf(LoggingContentGenerator);
  });

  // ========================================================================
  // Scenario 7: flag=true, no LLM_PROVIDER, no authType → Gemini (default)
  //             (selectProvider returns Gemini as default fallback)
  // ========================================================================
  it('Scenario 7: flag=true, no LLM_PROVIDER, no authType → selectProvider defaults to Gemini', async () => {
    setMultiProviderOverride(true);
    // No LLM_PROVIDER, no authType
    // selectProvider({}) → returns { type: ProviderType.Gemini }
    // Falls through to existing code → throws because no authType is set

    // The selection correctly returns Gemini (default), but without authType
    // the existing Gemini code path throws. This is expected behavior —
    // selectProvider correctly identifies Gemini as the default.
    await expect(
      createContentGenerator({}, createMockConfig()),
    ).rejects.toThrow('Unsupported authType');
  });

  // ========================================================================
  // Scenario 8: flag=true, LLM_PROVIDER=gemini, GEMINI_API_KEY, no authType
  //             → authType backfilled to USE_GEMINI, Gemini via legacy path
  //             (Review fix: selectProvider returns Gemini + apiKey → backfill)
  // ========================================================================
  it('Scenario 8: flag=true, LLM_PROVIDER=gemini, API key, no authType → backfill USE_GEMINI', async () => {
    setMultiProviderOverride(true);
    vi.stubEnv('LLM_PROVIDER', 'gemini');
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');

    const generator = await createContentGenerator({}, createMockConfig());

    // Should use GoogleGenAI (Gemini path, not throw Unsupported authType)
    expect(GoogleGenAI).toHaveBeenCalled();
    expect(generator).toBeInstanceOf(LoggingContentGenerator);
  });

  // ========================================================================
  // Scenario 9: flag=true, no LLM_PROVIDER, GEMINI_API_KEY, no authType
  //             → selectProvider detects env key → authType backfilled
  // ========================================================================
  it('Scenario 9: flag=true, GEMINI_API_KEY, no authType → backfill USE_GEMINI from env key', async () => {
    setMultiProviderOverride(true);
    vi.stubEnv('GEMINI_API_KEY', 'test-gemini-key');
    // No LLM_PROVIDER, no authType

    const generator = await createContentGenerator({}, createMockConfig());

    expect(GoogleGenAI).toHaveBeenCalled();
    expect(generator).toBeInstanceOf(LoggingContentGenerator);
  });

  // ========================================================================
  // Scenario 10: flag=true, LLM_PROVIDER=claude, no manual registration
  //              → auto-bootstrap via bootstrapClaudeProvider() in contentGenerator
  //              (Review fix: non-Gemini providers must be bootstrapped at runtime)
  // ========================================================================
  it('Scenario 10: flag=true, LLM_PROVIDER=claude → auto-bootstrap without manual registration', async () => {
    setMultiProviderOverride(true);
    vi.stubEnv('LLM_PROVIDER', 'claude');
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-claude-key');

    // Do NOT manually register Claude — rely on bootstrapClaudeProvider() in contentGenerator
    const generator = await createContentGenerator({}, createMockConfig());

    // Should NOT use GoogleGenAI
    expect(GoogleGenAI).not.toHaveBeenCalled();
    // Should return LoggingContentGenerator wrapping the Claude adapter
    expect(generator).toBeInstanceOf(LoggingContentGenerator);
    // The wrapped generator should have llm* methods
    expect(isProviderIndependentGenerator(generator)).toBe(true);
  });

  // ========================================================================
  // Additional: wrapAdapterAsGenerator provides llm* methods
  // ========================================================================
  describe('wrapAdapterAsGenerator', () => {
    it('should provide llmGenerateContent that delegates to adapter', async () => {
      setMultiProviderOverride(true);
      vi.stubEnv('LLM_PROVIDER', 'claude');
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

      const mockAdapter = createMockAdapter('claude');
      registry.register('claude', () => mockAdapter as never);

      const generator = await createContentGenerator({}, createMockConfig());

      // Call llmGenerateContent through the LoggingContentGenerator
      const response = await generator.llmGenerateContent!(
        {
          model: 'claude-3-sonnet',
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
          ],
        },
        'prompt-1',
      );

      expect(response.content).toBeDefined();
      expect(mockAdapter.generateContent).toHaveBeenCalled();
    });

    it('should throw on legacy generateContent for non-Gemini provider', async () => {
      setMultiProviderOverride(true);
      vi.stubEnv('LLM_PROVIDER', 'claude');
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

      const mockAdapter = createMockAdapter('claude');
      registry.register('claude', () => mockAdapter as never);

      const generator = await createContentGenerator({}, createMockConfig());

      // Legacy generateContent should throw for non-Gemini
      await expect(
        generator.generateContent(
          { model: 'claude-3', contents: 'test' } as never,
          'prompt-1',
        ),
      ).rejects.toThrow('does not support legacy Gemini API');
    });
  });

  // ========================================================================
  // Bootstrap idempotency
  // ========================================================================
  describe('bootstrap idempotency', () => {
    it('should bootstrap Gemini provider on multi-provider path without errors', async () => {
      setMultiProviderOverride(true);
      vi.stubEnv('LLM_PROVIDER', 'claude');
      vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');

      const mockAdapter = createMockAdapter('claude');
      registry.register('claude', () => mockAdapter as never);

      // First call — bootstraps Gemini
      await createContentGenerator({}, createMockConfig());
      // Second call — should not throw (idempotent bootstrap)
      await createContentGenerator({}, createMockConfig());
    });
  });
});
