/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NumericalClassifierStrategy } from './numericalClassifierStrategy.js';
import type { RoutingContext } from '../routingStrategy.js';
import type { Config } from '../../config/config.js';
import type {
  BaseLlmClient,
  LlmGenerateJsonOptions,
} from '../../core/baseLlmClient.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
} from '../../config/models.js';
import { promptIdContext } from '../../utils/promptIdContext.js';
import type { LlmMessage } from '../../providers/types.js';
import type { ResolvedModelConfig } from '../../services/modelConfigService.js';
import { debugLogger } from '../../utils/debugLogger.js';

vi.mock('../../core/baseLlmClient.js');

describe('NumericalClassifierStrategy', () => {
  let strategy: NumericalClassifierStrategy;
  let mockContext: RoutingContext;
  let mockConfig: Config;
  let mockBaseLlmClient: BaseLlmClient;
  let mockResolvedConfig: ResolvedModelConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    strategy = new NumericalClassifierStrategy();
    mockContext = {
      history: [],
      request: [{ type: 'text', text: 'simple task' }],
      signal: new AbortController().signal,
    };

    mockResolvedConfig = {
      model: 'classifier',
      generateContentConfig: {},
    } as unknown as ResolvedModelConfig;
    mockConfig = {
      modelConfigService: {
        getResolvedConfig: vi.fn().mockReturnValue(mockResolvedConfig),
      },
      getModel: () => DEFAULT_GEMINI_MODEL_AUTO,
      getPreviewFeatures: () => false,
      getSessionId: vi.fn().mockReturnValue('control-group-id'), // Default to Control Group (Hash 71 >= 50)
      getNumericalRoutingEnabled: vi.fn().mockResolvedValue(true),
      getClassifierThreshold: vi.fn().mockResolvedValue(undefined),
    } as unknown as Config;
    mockBaseLlmClient = {
      generateJson: vi.fn(),
    } as unknown as BaseLlmClient;

    vi.spyOn(promptIdContext, 'getStore').mockReturnValue('test-prompt-id');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null if numerical routing is disabled', async () => {
    vi.mocked(mockConfig.getNumericalRoutingEnabled).mockResolvedValue(false);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toBeNull();
    expect(mockBaseLlmClient.generateJson).not.toHaveBeenCalled();
  });

  it('should call generateJson with the correct parameters and wrapped user content', async () => {
    const mockApiResponse = {
      complexity_reasoning: 'Simple task',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0] as LlmGenerateJsonOptions;

    expect(generateJsonCall).toMatchObject({
      modelConfigKey: { model: mockResolvedConfig.model },
      promptId: 'test-prompt-id',
    });

    // Verify user content
    const userMessage =
      generateJsonCall.messages[generateJsonCall.messages.length - 1];
    expect(userMessage.content[0]).toEqual({
      type: 'text',
      text: 'simple task',
    });
  });

  describe('A/B Testing Logic (Deterministic)', () => {
    it('Control Group (SessionID "control-group-id" -> Threshold 50): Score 40 -> FLASH', async () => {
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id'); // Hash 71 -> Control
      const mockApiResponse = {
        complexity_reasoning: 'Standard task',
        complexity_score: 40,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL,
        metadata: {
          source: 'Classifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 50'),
        },
      });
    });

    it('Control Group (SessionID "control-group-id" -> Threshold 50): Score 60 -> PRO', async () => {
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id');
      const mockApiResponse = {
        complexity_reasoning: 'Complex task',
        complexity_score: 60,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_MODEL,
        metadata: {
          source: 'Classifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 50'),
        },
      });
    });

    it('Strict Group (SessionID "test-session-1" -> Threshold 80): Score 60 -> FLASH', async () => {
      vi.mocked(mockConfig.getSessionId).mockReturnValue('test-session-1'); // FNV Normalized 18 < 50 -> Strict
      const mockApiResponse = {
        complexity_reasoning: 'Complex task',
        complexity_score: 60,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL, // Routed to Flash because 60 < 80
        metadata: {
          source: 'Classifier (Strict)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 80'),
        },
      });
    });

    it('Strict Group (SessionID "test-session-1" -> Threshold 80): Score 90 -> PRO', async () => {
      vi.mocked(mockConfig.getSessionId).mockReturnValue('test-session-1');
      const mockApiResponse = {
        complexity_reasoning: 'Extreme task',
        complexity_score: 90,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_MODEL,
        metadata: {
          source: 'Classifier (Strict)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 90 / Threshold: 80'),
        },
      });
    });
  });

  describe('Remote Threshold Logic', () => {
    it('should use the remote CLASSIFIER_THRESHOLD if provided (int value)', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(70);
      const mockApiResponse = {
        complexity_reasoning: 'Test task',
        complexity_score: 60,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL, // Score 60 < Threshold 70
        metadata: {
          source: 'Classifier (Remote)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 70'),
        },
      });
    });

    it('should use the remote CLASSIFIER_THRESHOLD if provided (float value)', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(45.5);
      const mockApiResponse = {
        complexity_reasoning: 'Test task',
        complexity_score: 40,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL, // Score 40 < Threshold 45.5
        metadata: {
          source: 'Classifier (Remote)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 45.5'),
        },
      });
    });

    it('should use PRO model if score >= remote CLASSIFIER_THRESHOLD', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(30);
      const mockApiResponse = {
        complexity_reasoning: 'Test task',
        complexity_score: 35,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_MODEL, // Score 35 >= Threshold 30
        metadata: {
          source: 'Classifier (Remote)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 35 / Threshold: 30'),
        },
      });
    });

    it('should fall back to A/B testing if CLASSIFIER_THRESHOLD is not present in experiments', async () => {
      // Mock getClassifierThreshold to return undefined
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(undefined);
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id'); // Should resolve to Control (50)
      const mockApiResponse = {
        complexity_reasoning: 'Test task',
        complexity_score: 40,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL, // Score 40 < Default A/B Threshold 50
        metadata: {
          source: 'Classifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 50'),
        },
      });
    });

    it('should fall back to A/B testing if CLASSIFIER_THRESHOLD is out of range (less than 0)', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(-10);
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id');
      const mockApiResponse = {
        complexity_reasoning: 'Test task',
        complexity_score: 40,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_FLASH_MODEL,
        metadata: {
          source: 'Classifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 40 / Threshold: 50'),
        },
      });
    });

    it('should fall back to A/B testing if CLASSIFIER_THRESHOLD is out of range (greater than 100)', async () => {
      vi.mocked(mockConfig.getClassifierThreshold).mockResolvedValue(110);
      vi.mocked(mockConfig.getSessionId).mockReturnValue('control-group-id');
      const mockApiResponse = {
        complexity_reasoning: 'Test task',
        complexity_score: 60,
      };
      vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
        mockApiResponse,
      );

      const decision = await strategy.route(
        mockContext,
        mockConfig,
        mockBaseLlmClient,
      );

      expect(decision).toEqual({
        model: DEFAULT_GEMINI_MODEL,
        metadata: {
          source: 'Classifier (Control)',
          latencyMs: expect.any(Number),
          reasoning: expect.stringContaining('Score: 60 / Threshold: 50'),
        },
      });
    });
  });

  it('should return null if the classifier API call fails', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    const testError = new Error('API Failure');
    vi.mocked(mockBaseLlmClient.generateJson).mockRejectedValue(testError);

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('should return null if the classifier returns a malformed JSON object', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    const malformedApiResponse = {
      complexity_reasoning: 'This is a simple task.',
      // complexity_score is missing
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      malformedApiResponse,
    );

    const decision = await strategy.route(
      mockContext,
      mockConfig,
      mockBaseLlmClient,
    );

    expect(decision).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('should include tool-related history when sending to classifier', async () => {
    mockContext.history = [
      { role: 'user', content: [{ type: 'text', text: 'call a tool' }] },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_call',
            id: 'call-1',
            name: 'test_tool',
            arguments: {},
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            toolCallId: 'call-1',
            name: 'test_tool',
            content: { ok: true },
          },
        ],
      },
      { role: 'user', content: [{ type: 'text', text: 'another user turn' }] },
    ];
    const mockApiResponse = {
      complexity_reasoning: 'Simple.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0] as LlmGenerateJsonOptions;
    const messages = generateJsonCall.messages;

    const expectedMessages = [
      ...mockContext.history,
      // The last user turn is the request
      {
        role: 'user',
        content: [{ type: 'text', text: 'simple task' }],
      },
    ];

    expect(messages).toEqual(expectedMessages);
  });

  it('should respect HISTORY_TURNS_FOR_CONTEXT', async () => {
    const longHistory: LlmMessage[] = [];
    for (let i = 0; i < 30; i++) {
      longHistory.push({
        role: 'user',
        content: [{ type: 'text', text: `Message ${i}` }],
      });
    }
    mockContext.history = longHistory;
    const mockApiResponse = {
      complexity_reasoning: 'Simple.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0] as LlmGenerateJsonOptions;
    const messages = generateJsonCall.messages;

    // Manually calculate what the history should be
    const HISTORY_TURNS_FOR_CONTEXT = 8;
    const finalHistory = longHistory.slice(-HISTORY_TURNS_FOR_CONTEXT);

    // Last message is the request
    const requestMessage = {
      role: 'user',
      content: [{ type: 'text', text: 'simple task' }],
    };

    expect(messages).toEqual([...finalHistory, requestMessage]);
    expect(messages).toHaveLength(9);
  });

  it('should use a fallback promptId if not found in context', async () => {
    const consoleWarnSpy = vi
      .spyOn(debugLogger, 'warn')
      .mockImplementation(() => {});
    vi.spyOn(promptIdContext, 'getStore').mockReturnValue(undefined);
    const mockApiResponse = {
      complexity_reasoning: 'Simple.',
      complexity_score: 10,
    };
    vi.mocked(mockBaseLlmClient.generateJson).mockResolvedValue(
      mockApiResponse,
    );

    await strategy.route(mockContext, mockConfig, mockBaseLlmClient);

    const generateJsonCall = vi.mocked(mockBaseLlmClient.generateJson).mock
      .calls[0][0];

    expect(generateJsonCall.promptId).toMatch(
      /^classifier-router-fallback-\d+-\w+$/,
    );
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Could not find promptId in context for classifier-router. This is unexpected. Using a fallback ID:',
      ),
    );
  });
});
