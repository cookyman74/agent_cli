/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import {
  ConfigAdapter,
  toProviderConfig,
  fromProviderConfig,
  mergeConfigs,
} from './configAdapter.js';
import type { LlmGenerateConfig } from './types.js';

describe('ConfigAdapter', () => {
  describe('toProviderConfig()', () => {
    it('should convert temperature', () => {
      const llmConfig: Partial<LlmGenerateConfig> = {
        temperature: 0.7,
      };

      const result = toProviderConfig(llmConfig);

      expect(result.temperature).toBe(0.7);
    });

    it('should convert maxTokens to maxOutputTokens', () => {
      const llmConfig: Partial<LlmGenerateConfig> = {
        maxTokens: 1000,
      };

      const result = toProviderConfig(llmConfig);

      expect(result.maxOutputTokens).toBe(1000);
    });

    it('should convert topP and topK', () => {
      const llmConfig: Partial<LlmGenerateConfig> = {
        topP: 0.9,
        topK: 40,
      };

      const result = toProviderConfig(llmConfig);

      expect(result.topP).toBe(0.9);
      expect(result.topK).toBe(40);
    });

    it('should convert stopSequences', () => {
      const llmConfig: Partial<LlmGenerateConfig> = {
        stopSequences: ['STOP', 'END'],
      };

      const result = toProviderConfig(llmConfig);

      expect(result.stopSequences).toEqual(['STOP', 'END']);
    });

    it('should handle empty config', () => {
      const result = toProviderConfig({});

      expect(result).toEqual({});
    });

    it('should preserve all fields', () => {
      const llmConfig: Partial<LlmGenerateConfig> = {
        temperature: 0.7,
        maxTokens: 1000,
        topP: 0.9,
        topK: 40,
        stopSequences: ['STOP'],
      };

      const result = toProviderConfig(llmConfig);

      expect(result.temperature).toBe(0.7);
      expect(result.maxOutputTokens).toBe(1000);
      expect(result.topP).toBe(0.9);
      expect(result.topK).toBe(40);
      expect(result.stopSequences).toEqual(['STOP']);
    });
  });

  describe('fromProviderConfig()', () => {
    it('should convert maxOutputTokens to maxTokens', () => {
      const providerConfig = {
        maxOutputTokens: 2000,
      };

      const result = fromProviderConfig(providerConfig);

      expect(result.maxTokens).toBe(2000);
    });

    it('should convert basic fields', () => {
      const providerConfig = {
        temperature: 0.5,
        topP: 0.8,
        topK: 50,
        stopSequences: ['END'],
      };

      const result = fromProviderConfig(providerConfig);

      expect(result.temperature).toBe(0.5);
      expect(result.topP).toBe(0.8);
      expect(result.topK).toBe(50);
      expect(result.stopSequences).toEqual(['END']);
    });

    it('should handle undefined values', () => {
      const result = fromProviderConfig({});

      expect(result).toEqual({});
    });
  });

  describe('mergeConfigs()', () => {
    it('should merge base and override configs', () => {
      const base: Partial<LlmGenerateConfig> = {
        temperature: 0.7,
        maxTokens: 1000,
      };
      const override: Partial<LlmGenerateConfig> = {
        temperature: 0.9,
      };

      const result = mergeConfigs(base, override);

      expect(result.temperature).toBe(0.9);
      expect(result.maxTokens).toBe(1000);
    });

    it('should override with undefined only from override', () => {
      const base: Partial<LlmGenerateConfig> = {
        temperature: 0.7,
        maxTokens: 1000,
      };
      const override: Partial<LlmGenerateConfig> = {
        topP: 0.5,
      };

      const result = mergeConfigs(base, override);

      expect(result.temperature).toBe(0.7);
      expect(result.maxTokens).toBe(1000);
      expect(result.topP).toBe(0.5);
    });

    it('should handle empty base', () => {
      const override: Partial<LlmGenerateConfig> = {
        temperature: 0.5,
      };

      const result = mergeConfigs({}, override);

      expect(result.temperature).toBe(0.5);
    });

    it('should handle empty override', () => {
      const base: Partial<LlmGenerateConfig> = {
        temperature: 0.7,
      };

      const result = mergeConfigs(base, {});

      expect(result.temperature).toBe(0.7);
    });
  });

  describe('ConfigAdapter class', () => {
    it('should provide instance methods', () => {
      const adapter = new ConfigAdapter();

      expect(adapter.toProvider).toBeDefined();
      expect(adapter.fromProvider).toBeDefined();
      expect(adapter.merge).toBeDefined();
    });

    it('should convert using instance toProvider', () => {
      const adapter = new ConfigAdapter();
      const config: Partial<LlmGenerateConfig> = { temperature: 0.8 };

      const result = adapter.toProvider(config);

      expect(result.temperature).toBe(0.8);
    });

    it('should merge using instance merge', () => {
      const adapter = new ConfigAdapter();
      const base: Partial<LlmGenerateConfig> = { temperature: 0.5 };
      const override: Partial<LlmGenerateConfig> = { maxTokens: 500 };

      const result = adapter.merge(base, override);

      expect(result.temperature).toBe(0.5);
      expect(result.maxTokens).toBe(500);
    });
  });
});
