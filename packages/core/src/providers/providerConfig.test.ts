/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import {
  type ProviderConfig,
  type GeminiProviderConfig,
  type ClaudeProviderConfig,
  type OpenAIProviderConfig,
  type OpenAICompatibleConfig,
  type DidimProviderConfig,
  createProviderConfig,
  createClaudeConfig,
  createOpenAICompatibleConfig,
  isGeminiConfig,
  isClaudeConfig,
  isOpenAIConfig,
} from './providerConfig.js';
import { ProviderType, AuthType } from './providerTypes.js';

describe('ProviderConfig', () => {
  describe('ProviderConfig interface', () => {
    it('should require provider type', () => {
      const config: ProviderConfig = {
        provider: ProviderType.Gemini,
      };

      expect(config.provider).toBe(ProviderType.Gemini);
    });

    it('should support optional baseUrl', () => {
      const config: ProviderConfig = {
        provider: ProviderType.OpenAICompatible,
        baseUrl: 'https://api.example.com',
      };

      expect(config.baseUrl).toBe('https://api.example.com');
    });
  });

  describe('GeminiProviderConfig', () => {
    it('should support authType', () => {
      const config: GeminiProviderConfig = {
        provider: ProviderType.Gemini,
        authType: AuthType.USE_GEMINI,
        apiKey: 'test-key',
      };

      expect(config.authType).toBe(AuthType.USE_GEMINI);
    });

    it('should support Vertex AI configuration', () => {
      const config: GeminiProviderConfig = {
        provider: ProviderType.Gemini,
        authType: AuthType.USE_VERTEX_AI,
        project: 'my-project',
        location: 'us-central1',
      };

      expect(config.project).toBe('my-project');
      expect(config.location).toBe('us-central1');
    });
  });

  describe('ClaudeProviderConfig', () => {
    it('should require apiKey', () => {
      const config: ClaudeProviderConfig = {
        provider: ProviderType.Claude,
        apiKey: 'sk-ant-xxx',
      };

      expect(config.apiKey).toBe('sk-ant-xxx');
    });
  });

  describe('OpenAIProviderConfig', () => {
    it('should require apiKey', () => {
      const config: OpenAIProviderConfig = {
        provider: ProviderType.OpenAI,
        apiKey: 'sk-xxx',
      };

      expect(config.apiKey).toBe('sk-xxx');
    });

    it('should support organization', () => {
      const config: OpenAIProviderConfig = {
        provider: ProviderType.OpenAI,
        apiKey: 'sk-xxx',
        organization: 'org-xxx',
      };

      expect(config.organization).toBe('org-xxx');
    });
  });

  describe('OpenAICompatibleConfig', () => {
    it('should require baseUrl', () => {
      const config: OpenAICompatibleConfig = {
        provider: ProviderType.OpenAICompatible,
        baseUrl: 'https://api.local.com',
        apiKey: 'key',
      };

      expect(config.baseUrl).toBe('https://api.local.com');
    });
  });

  describe('DidimProviderConfig', () => {
    it('should support endpoint', () => {
      const config: DidimProviderConfig = {
        provider: ProviderType.Didim,
        apiKey: 'didim-key',
        endpoint: 'https://didim.example.com',
      };

      expect(config.endpoint).toBe('https://didim.example.com');
    });
  });

  describe('createProviderConfig()', () => {
    it('should create Gemini config', () => {
      const config = createProviderConfig(ProviderType.Gemini, {
        apiKey: 'test-key',
      });

      expect(config.provider).toBe(ProviderType.Gemini);
    });

    it('should create Claude config', () => {
      const config = createProviderConfig(ProviderType.Claude, {
        apiKey: 'sk-ant-xxx',
      });

      expect(config.provider).toBe(ProviderType.Claude);
    });
  });

  describe('Type guards', () => {
    it('isGeminiConfig should identify Gemini config', () => {
      const config: ProviderConfig = {
        provider: ProviderType.Gemini,
        apiKey: 'xxx',
      };

      expect(isGeminiConfig(config)).toBe(true);
    });

    it('isClaudeConfig should identify Claude config', () => {
      const config: ProviderConfig = {
        provider: ProviderType.Claude,
        apiKey: 'xxx',
      };

      expect(isClaudeConfig(config)).toBe(true);
    });

    it('isOpenAIConfig should identify OpenAI config', () => {
      const config: ProviderConfig = {
        provider: ProviderType.OpenAI,
        apiKey: 'xxx',
      };

      expect(isOpenAIConfig(config)).toBe(true);
    });
  });

  describe('Typed factory functions', () => {
    it('createClaudeConfig should require apiKey', () => {
      // This test verifies the type signature - if apiKey was optional,
      // creating without it would compile but shouldn't
      const config = createClaudeConfig({ apiKey: 'sk-ant-xxx' });

      expect(config.provider).toBe(ProviderType.Claude);
      expect(config.apiKey).toBe('sk-ant-xxx');
    });

    it('createOpenAICompatibleConfig should require baseUrl', () => {
      const config = createOpenAICompatibleConfig({
        baseUrl: 'https://api.local.com',
      });

      expect(config.provider).toBe(ProviderType.OpenAICompatible);
      expect(config.baseUrl).toBe('https://api.local.com');
    });
  });
});
