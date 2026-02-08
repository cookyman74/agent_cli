/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for ModelConfigBridge — wraps ModelConfigService to provide
 * provider-independent LlmGenerateConfig resolution.
 *
 * Covers todolist items:
 * - 2.4.1.1 LlmModelConfig interface definition
 * - 2.4.1.3 Merge logic extension
 * - 2.4.1.4 Provider-based config resolution
 */

import { describe, it, expect } from 'vitest';
import { ModelConfigBridge, type LlmModelConfig } from './modelConfigBridge.js';
import { ModelConfigService } from './modelConfigService.js';
import type { ModelConfigServiceConfig } from './modelConfigService.js';

// =================================================================
// Helper: Create a ModelConfigService with test aliases/overrides
// =================================================================

function createTestServiceConfig(): ModelConfigServiceConfig {
  return {
    aliases: {
      base: {
        modelConfig: {
          model: 'gemini-2.0-flash',
          generateContentConfig: {
            temperature: 1,
            topP: 0.95,
            maxOutputTokens: 8192,
          },
        },
      },
      'chat-model': {
        extends: 'base',
        modelConfig: {
          generateContentConfig: {
            temperature: 0.7,
          },
        },
      },
    },
    overrides: [
      {
        match: { model: 'base', isRetry: true },
        modelConfig: {
          generateContentConfig: {
            temperature: 1.5,
          },
        },
      },
    ],
  };
}

// =================================================================
// Tests
// =================================================================

describe('ModelConfigBridge', () => {
  describe('LlmModelConfig type', () => {
    it('should define LlmModelConfig with model, provider, llmConfig', () => {
      const config: LlmModelConfig = {
        model: 'gemini-2.0-flash',
        provider: 'gemini',
        llmConfig: {
          temperature: 0.7,
          maxTokens: 1000,
        },
      };

      expect(config.model).toBe('gemini-2.0-flash');
      expect(config.provider).toBe('gemini');
      expect(config.llmConfig?.temperature).toBe(0.7);
    });

    it('should allow optional fields', () => {
      const config: LlmModelConfig = {};

      expect(config.model).toBeUndefined();
      expect(config.provider).toBeUndefined();
      expect(config.llmConfig).toBeUndefined();
    });
  });

  describe('construction', () => {
    it('should create bridge with ModelConfigService', () => {
      const service = new ModelConfigService(createTestServiceConfig());
      const bridge = new ModelConfigBridge(service);

      expect(bridge).toBeDefined();
    });

    it('should create bridge with empty config', () => {
      const service = new ModelConfigService({});
      const bridge = new ModelConfigBridge(service);

      expect(bridge).toBeDefined();
    });
  });

  describe('Gemini provider resolution', () => {
    it('should resolve Gemini config and convert to LlmGenerateConfig', () => {
      const service = new ModelConfigService(createTestServiceConfig());
      const bridge = new ModelConfigBridge(service);

      const result = bridge.getResolvedLlmConfig({
        model: 'base',
        provider: 'gemini',
      });

      expect(result.model).toBe('gemini-2.0-flash');
      expect(result.provider).toBe('gemini');
      expect(result.llmConfig.temperature).toBe(1);
      expect(result.llmConfig.topP).toBe(0.95);
      expect(result.llmConfig.maxTokens).toBe(8192);
    });

    it('should preserve original generateContentConfig', () => {
      const service = new ModelConfigService(createTestServiceConfig());
      const bridge = new ModelConfigBridge(service);

      const result = bridge.getResolvedLlmConfig({
        model: 'base',
        provider: 'gemini',
      });

      expect(result.generateContentConfig).toBeDefined();
      expect(result.generateContentConfig!['temperature']).toBe(1);
    });

    it('should resolve alias chains', () => {
      const service = new ModelConfigService(createTestServiceConfig());
      const bridge = new ModelConfigBridge(service);

      const result = bridge.getResolvedLlmConfig({
        model: 'chat-model',
        provider: 'gemini',
      });

      // chat-model extends base → temperature overridden to 0.7
      expect(result.model).toBe('gemini-2.0-flash');
      expect(result.llmConfig.temperature).toBe(0.7);
      // topP inherited from base
      expect(result.llmConfig.topP).toBe(0.95);
    });

    it('should apply overrides including retry', () => {
      const service = new ModelConfigService(createTestServiceConfig());
      const bridge = new ModelConfigBridge(service);

      const result = bridge.getResolvedLlmConfig({
        model: 'base',
        provider: 'gemini',
        isRetry: true,
      });

      expect(result.llmConfig.temperature).toBe(1.5);
    });

    it('should default to gemini provider when not specified', () => {
      const service = new ModelConfigService(createTestServiceConfig());
      const bridge = new ModelConfigBridge(service);

      const result = bridge.getResolvedLlmConfig({
        model: 'base',
      });

      expect(result.provider).toBe('gemini');
      expect(result.llmConfig.temperature).toBe(1);
    });
  });

  describe('non-Gemini provider resolution', () => {
    it('should resolve for claude provider with default LlmGenerateConfig', () => {
      const service = new ModelConfigService({});
      const bridge = new ModelConfigBridge(service);

      const result = bridge.getResolvedLlmConfig({
        model: 'claude-sonnet-4-20250514',
        provider: 'claude',
      });

      expect(result.model).toBe('claude-sonnet-4-20250514');
      expect(result.provider).toBe('claude');
      expect(result.llmConfig).toBeDefined();
      expect(result.llmConfig.model).toBe('claude-sonnet-4-20250514');
      expect(result.llmConfig.provider).toBe('claude');
    });

    it('should resolve for openai provider with default LlmGenerateConfig', () => {
      const service = new ModelConfigService({});
      const bridge = new ModelConfigBridge(service);

      const result = bridge.getResolvedLlmConfig({
        model: 'gpt-4o',
        provider: 'openai',
      });

      expect(result.model).toBe('gpt-4o');
      expect(result.provider).toBe('openai');
      expect(result.llmConfig.model).toBe('gpt-4o');
    });

    it('should not have generateContentConfig for non-Gemini', () => {
      const service = new ModelConfigService({});
      const bridge = new ModelConfigBridge(service);

      const result = bridge.getResolvedLlmConfig({
        model: 'claude-sonnet-4-20250514',
        provider: 'claude',
      });

      expect(result.generateContentConfig).toBeUndefined();
    });
  });

  describe('LlmModelConfig registration', () => {
    it('should register and resolve LlmModelConfig for non-Gemini provider', () => {
      const service = new ModelConfigService({});
      const bridge = new ModelConfigBridge(service);

      bridge.registerLlmConfig('claude-fast', {
        model: 'claude-sonnet-4-20250514',
        provider: 'claude',
        llmConfig: {
          temperature: 0.5,
          maxTokens: 4096,
        },
      });

      const result = bridge.getResolvedLlmConfig({
        model: 'claude-fast',
        provider: 'claude',
      });

      expect(result.model).toBe('claude-sonnet-4-20250514');
      expect(result.llmConfig.temperature).toBe(0.5);
      expect(result.llmConfig.maxTokens).toBe(4096);
    });

    it('should merge registered LlmModelConfig with defaults', () => {
      const service = new ModelConfigService({});
      const bridge = new ModelConfigBridge(service);

      bridge.registerLlmConfig('claude-creative', {
        model: 'claude-sonnet-4-20250514',
        provider: 'claude',
        llmConfig: {
          temperature: 1.2,
        },
      });

      const result = bridge.getResolvedLlmConfig({
        model: 'claude-creative',
        provider: 'claude',
      });

      expect(result.llmConfig.temperature).toBe(1.2);
      expect(result.llmConfig.model).toBe('claude-sonnet-4-20250514');
      expect(result.llmConfig.provider).toBe('claude');
    });
  });

  describe('merge logic', () => {
    it('should deep merge llmConfig fields', () => {
      const base: LlmModelConfig = {
        model: 'test-model',
        provider: 'test',
        llmConfig: {
          temperature: 0.5,
          maxTokens: 1000,
        },
      };

      const override: LlmModelConfig = {
        llmConfig: {
          temperature: 0.9,
        },
      };

      const merged = ModelConfigBridge.mergeLlmModelConfig(base, override);

      expect(merged.llmConfig?.temperature).toBe(0.9);
      expect(merged.llmConfig?.maxTokens).toBe(1000);
    });

    it('should override model and provider', () => {
      const base: LlmModelConfig = {
        model: 'model-a',
        provider: 'provider-a',
      };

      const override: LlmModelConfig = {
        model: 'model-b',
      };

      const merged = ModelConfigBridge.mergeLlmModelConfig(base, override);

      expect(merged.model).toBe('model-b');
      expect(merged.provider).toBe('provider-a');
    });

    it('should handle empty base', () => {
      const override: LlmModelConfig = {
        model: 'test-model',
        llmConfig: { temperature: 0.7 },
      };

      const merged = ModelConfigBridge.mergeLlmModelConfig({}, override);

      expect(merged.model).toBe('test-model');
      expect(merged.llmConfig?.temperature).toBe(0.7);
    });

    it('should handle empty override', () => {
      const base: LlmModelConfig = {
        model: 'test-model',
        llmConfig: { temperature: 0.7 },
      };

      const merged = ModelConfigBridge.mergeLlmModelConfig(base, {});

      expect(merged.model).toBe('test-model');
      expect(merged.llmConfig?.temperature).toBe(0.7);
    });
  });

  describe('backward compatibility', () => {
    it('should delegate to ModelConfigService for Gemini resolution', () => {
      const service = new ModelConfigService(createTestServiceConfig());
      const bridge = new ModelConfigBridge(service);

      // Bridge result should match ModelConfigService result
      const bridgeResult = bridge.getResolvedLlmConfig({
        model: 'base',
        provider: 'gemini',
      });

      const directResult = service.getResolvedConfig({ model: 'base' });

      expect(bridgeResult.model).toBe(directResult.model);
      expect(bridgeResult.generateContentConfig).toEqual(
        directResult.generateContentConfig,
      );
    });

    it('should support overrideScope from ModelConfigKey', () => {
      const config: ModelConfigServiceConfig = {
        aliases: {
          base: {
            modelConfig: {
              model: 'gemini-2.0-flash',
              generateContentConfig: { temperature: 0.5 },
            },
          },
        },
        overrides: [
          {
            match: { model: 'base', overrideScope: 'special-agent' },
            modelConfig: {
              generateContentConfig: { temperature: 1.5 },
            },
          },
        ],
      };

      const service = new ModelConfigService(config);
      const bridge = new ModelConfigBridge(service);

      const result = bridge.getResolvedLlmConfig({
        model: 'base',
        provider: 'gemini',
        overrideScope: 'special-agent',
      });

      expect(result.llmConfig.temperature).toBe(1.5);
    });

    it('should provide getResolvedConfig passthrough for legacy code', () => {
      const service = new ModelConfigService(createTestServiceConfig());
      const bridge = new ModelConfigBridge(service);

      // Legacy passthrough
      const result = bridge.getResolvedConfig({ model: 'base' });

      expect(result.model).toBe('gemini-2.0-flash');
      expect(result.generateContentConfig).toBeDefined();
    });
  });
});
