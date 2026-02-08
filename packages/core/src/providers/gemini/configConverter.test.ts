/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for GeminiConfigConverter — bidirectional conversion between
 * GenerateContentConfig (@google/genai) and LlmGenerateConfig (provider-independent).
 *
 * Covers todolist items 2.4.1.1 (type definition) and 2.4.1.2 (wrapper implementation).
 */

import { describe, it, expect } from 'vitest';
import type { GenerateContentConfig } from '@google/genai';
import {
  fromGenerateContentConfig,
  toGenerateContentConfig,
} from './configConverter.js';
import type { LlmGenerateConfig } from '../types.js';

describe('GeminiConfigConverter', () => {
  describe('fromGenerateContentConfig()', () => {
    it('should convert basic numeric fields', () => {
      const gc: GenerateContentConfig = {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 2048,
      };

      const result = fromGenerateContentConfig(gc, 'gemini-2.0-flash');

      expect(result.temperature).toBe(0.7);
      expect(result.topP).toBe(0.9);
      expect(result.topK).toBe(40);
      expect(result.maxTokens).toBe(2048);
    });

    it('should set model and provider', () => {
      const gc: GenerateContentConfig = {};

      const result = fromGenerateContentConfig(gc, 'gemini-2.5-pro');

      expect(result.model).toBe('gemini-2.5-pro');
      expect(result.provider).toBe('gemini');
    });

    it('should convert stopSequences', () => {
      const gc: GenerateContentConfig = {
        stopSequences: ['STOP', 'END'],
      };

      const result = fromGenerateContentConfig(gc, 'gemini-2.0-flash');

      expect(result.stopSequences).toEqual(['STOP', 'END']);
    });

    it('should convert responseMimeType to responseFormat', () => {
      const gc: GenerateContentConfig = {
        responseMimeType: 'application/json',
      };

      const result = fromGenerateContentConfig(gc, 'gemini-2.0-flash');

      expect(result.responseFormat).toBe('json');
    });

    it('should convert text/plain responseMimeType to text', () => {
      const gc: GenerateContentConfig = {
        responseMimeType: 'text/plain',
      };

      const result = fromGenerateContentConfig(gc, 'gemini-2.0-flash');

      expect(result.responseFormat).toBe('text');
    });

    it('should convert string systemInstruction', () => {
      const gc: GenerateContentConfig = {
        systemInstruction: 'Be concise' as never,
      };

      const result = fromGenerateContentConfig(gc, 'gemini-2.0-flash');

      expect(result.systemInstruction).toBe('Be concise');
    });

    it('should convert Content object systemInstruction', () => {
      const gc: GenerateContentConfig = {
        systemInstruction: {
          role: 'system',
          parts: [{ text: 'Be helpful' }],
        } as never,
      };

      const result = fromGenerateContentConfig(gc, 'gemini-2.0-flash');

      expect(result.systemInstruction).toBe('Be helpful');
    });

    it('should convert Part[] systemInstruction', () => {
      const gc: GenerateContentConfig = {
        systemInstruction: [
          { text: 'Be concise. ' },
          { text: 'Be helpful.' },
        ] as never,
      };

      const result = fromGenerateContentConfig(gc, 'gemini-2.0-flash');

      expect(result.systemInstruction).toBe('Be concise. Be helpful.');
    });

    it('should store Gemini-specific fields in providerOptions', () => {
      const gc: GenerateContentConfig = {
        temperature: 0.5,
        presencePenalty: 0.3,
        frequencyPenalty: 0.2,
        seed: 42,
        candidateCount: 2,
      };

      const result = fromGenerateContentConfig(gc, 'gemini-2.0-flash');

      expect(result.providerOptions).toBeDefined();
      expect(result.providerOptions!['presencePenalty']).toBe(0.3);
      expect(result.providerOptions!['frequencyPenalty']).toBe(0.2);
      expect(result.providerOptions!['seed']).toBe(42);
      expect(result.providerOptions!['candidateCount']).toBe(2);
    });

    it('should store thinkingConfig in providerOptions', () => {
      const gc: GenerateContentConfig = {
        thinkingConfig: { thinkingBudget: 10000 },
      };

      const result = fromGenerateContentConfig(gc, 'gemini-2.0-flash');

      expect(result.providerOptions!['thinkingConfig']).toEqual({
        thinkingBudget: 10000,
      });
    });

    it('should store safetySettings in providerOptions', () => {
      const gc: GenerateContentConfig = {
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH' as never,
            threshold: 'BLOCK_NONE' as never,
          },
        ],
      };

      const result = fromGenerateContentConfig(gc, 'gemini-2.0-flash');

      expect(result.providerOptions!['safetySettings']).toBeDefined();
    });

    it('should handle empty config', () => {
      const result = fromGenerateContentConfig({}, 'gemini-2.0-flash');

      expect(result.model).toBe('gemini-2.0-flash');
      expect(result.provider).toBe('gemini');
      expect(result.temperature).toBeUndefined();
    });
  });

  describe('toGenerateContentConfig()', () => {
    it('should convert basic numeric fields', () => {
      const llmConfig: Partial<LlmGenerateConfig> = {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxTokens: 2048,
      };

      const result = toGenerateContentConfig(llmConfig);

      expect(result.temperature).toBe(0.7);
      expect(result.topP).toBe(0.9);
      expect(result.topK).toBe(40);
      expect(result.maxOutputTokens).toBe(2048);
    });

    it('should convert stopSequences', () => {
      const llmConfig: Partial<LlmGenerateConfig> = {
        stopSequences: ['STOP'],
      };

      const result = toGenerateContentConfig(llmConfig);

      expect(result.stopSequences).toEqual(['STOP']);
    });

    it('should convert responseFormat to responseMimeType', () => {
      const llmConfig: Partial<LlmGenerateConfig> = {
        responseFormat: 'json',
      };

      const result = toGenerateContentConfig(llmConfig);

      expect(result.responseMimeType).toBe('application/json');
    });

    it('should convert text responseFormat', () => {
      const llmConfig: Partial<LlmGenerateConfig> = {
        responseFormat: 'text',
      };

      const result = toGenerateContentConfig(llmConfig);

      expect(result.responseMimeType).toBe('text/plain');
    });

    it('should convert systemInstruction to string', () => {
      const llmConfig: Partial<LlmGenerateConfig> = {
        systemInstruction: 'Be helpful',
      };

      const result = toGenerateContentConfig(llmConfig);

      expect(result.systemInstruction).toBe('Be helpful');
    });

    it('should restore providerOptions to native fields', () => {
      const llmConfig: Partial<LlmGenerateConfig> = {
        temperature: 0.5,
        providerOptions: {
          presencePenalty: 0.3,
          frequencyPenalty: 0.2,
          seed: 42,
        },
      };

      const result = toGenerateContentConfig(llmConfig);

      expect(result.temperature).toBe(0.5);
      expect(result.presencePenalty).toBe(0.3);
      expect(result.frequencyPenalty).toBe(0.2);
      expect(result.seed).toBe(42);
    });

    it('should handle empty config', () => {
      const result = toGenerateContentConfig({});

      expect(result).toEqual({});
    });
  });

  describe('round-trip conversion', () => {
    it('should preserve basic fields in round-trip', () => {
      const original: GenerateContentConfig = {
        temperature: 0.7,
        topP: 0.9,
        topK: 40,
        maxOutputTokens: 2048,
        stopSequences: ['STOP'],
      };

      const llmConfig = fromGenerateContentConfig(original, 'gemini-2.0-flash');
      const roundTripped = toGenerateContentConfig(llmConfig);

      expect(roundTripped.temperature).toBe(original.temperature);
      expect(roundTripped.topP).toBe(original.topP);
      expect(roundTripped.topK).toBe(original.topK);
      expect(roundTripped.maxOutputTokens).toBe(original.maxOutputTokens);
      expect(roundTripped.stopSequences).toEqual(original.stopSequences);
    });

    it('should preserve Gemini-specific fields in round-trip via providerOptions', () => {
      const original: GenerateContentConfig = {
        temperature: 0.5,
        presencePenalty: 0.3,
        seed: 42,
      };

      const llmConfig = fromGenerateContentConfig(original, 'gemini-2.0-flash');
      const roundTripped = toGenerateContentConfig(llmConfig);

      expect(roundTripped.presencePenalty).toBe(0.3);
      expect(roundTripped.seed).toBe(42);
    });
  });
});
