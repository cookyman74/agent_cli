/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import {
  type ModelSpec,
  type ModelCapabilities,
  createModelSpec,
  getDefaultModelSpecs,
  hasCapability,
} from './modelSpec.js';

describe('ModelSpec', () => {
  describe('createModelSpec()', () => {
    it('should create a model spec with required fields', () => {
      const spec = createModelSpec({
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        provider: 'gemini',
      });

      expect(spec.id).toBe('gemini-2.0-flash');
      expect(spec.name).toBe('Gemini 2.0 Flash');
      expect(spec.provider).toBe('gemini');
    });

    it('should apply default capabilities when not specified', () => {
      const spec = createModelSpec({
        id: 'test-model',
        name: 'Test Model',
        provider: 'test',
      });

      expect(spec.capabilities).toBeDefined();
      expect(spec.capabilities.streaming).toBe(true);
    });

    it('should merge custom capabilities with defaults', () => {
      const spec = createModelSpec({
        id: 'test-model',
        name: 'Test Model',
        provider: 'test',
        capabilities: {
          vision: true,
          toolUse: true,
        },
      });

      expect(spec.capabilities.vision).toBe(true);
      expect(spec.capabilities.toolUse).toBe(true);
      expect(spec.capabilities.streaming).toBe(true);
    });

    it('should include context window settings', () => {
      const spec = createModelSpec({
        id: 'test-model',
        name: 'Test Model',
        provider: 'test',
        contextWindow: 128000,
        maxOutputTokens: 8192,
      });

      expect(spec.contextWindow).toBe(128000);
      expect(spec.maxOutputTokens).toBe(8192);
    });
  });

  describe('getDefaultModelSpecs()', () => {
    it('should return an array of model specs', () => {
      const specs = getDefaultModelSpecs();

      expect(Array.isArray(specs)).toBe(true);
      expect(specs.length).toBeGreaterThan(0);
    });

    it('should include Gemini models', () => {
      const specs = getDefaultModelSpecs();
      const geminiModels = specs.filter(
        (s: ModelSpec) => s.provider === 'gemini',
      );

      expect(geminiModels.length).toBeGreaterThan(0);
    });

    it('should have valid capabilities for each model', () => {
      const specs = getDefaultModelSpecs();

      specs.forEach((spec: ModelSpec) => {
        expect(spec.capabilities).toBeDefined();
        expect(typeof spec.capabilities.streaming).toBe('boolean');
      });
    });
  });

  describe('hasCapability()', () => {
    it('should return true if model has capability', () => {
      const spec = createModelSpec({
        id: 'test',
        name: 'Test',
        provider: 'test',
        capabilities: { vision: true },
      });

      expect(hasCapability(spec, 'vision')).toBe(true);
    });

    it('should return false if model lacks capability', () => {
      const spec = createModelSpec({
        id: 'test',
        name: 'Test',
        provider: 'test',
        capabilities: { vision: false },
      });

      expect(hasCapability(spec, 'vision')).toBe(false);
    });

    it('should return false for undefined capability', () => {
      const spec = createModelSpec({
        id: 'test',
        name: 'Test',
        provider: 'test',
      });

      expect(hasCapability(spec, 'codeExecution')).toBe(false);
    });
  });

  describe('ModelCapabilities', () => {
    it('should support standard capability flags', () => {
      const capabilities: ModelCapabilities = {
        streaming: true,
        vision: true,
        toolUse: true,
        codeExecution: false,
        thinking: true,
      };

      expect(capabilities.streaming).toBe(true);
      expect(capabilities.vision).toBe(true);
      expect(capabilities.toolUse).toBe(true);
      expect(capabilities.codeExecution).toBe(false);
      expect(capabilities.thinking).toBe(true);
    });
  });
});
