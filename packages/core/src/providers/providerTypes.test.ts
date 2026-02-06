/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, it, expect } from 'vitest';
import {
  ProviderType,
  AuthType,
  getAuthTypesForProvider,
  getProviderForAuthType,
  isGeminiAuthType,
  PROVIDER_AUTH_MAPPING,
} from './providerTypes.js';

describe('ProviderTypes', () => {
  describe('ProviderType enum', () => {
    it('should define Gemini provider', () => {
      expect(ProviderType.Gemini).toBe('gemini');
    });

    it('should define Claude provider', () => {
      expect(ProviderType.Claude).toBe('claude');
    });

    it('should define OpenAI provider', () => {
      expect(ProviderType.OpenAI).toBe('openai');
    });

    it('should define OpenAI Compatible provider', () => {
      expect(ProviderType.OpenAICompatible).toBe('openai-compatible');
    });

    it('should define Didim provider', () => {
      expect(ProviderType.Didim).toBe('didim');
    });
  });

  describe('AuthType enum', () => {
    it('should define OAuth personal auth', () => {
      expect(AuthType.LOGIN_WITH_GOOGLE).toBe('oauth-personal');
    });

    it('should define Gemini API key auth', () => {
      expect(AuthType.USE_GEMINI).toBe('gemini-api-key');
    });

    it('should define Vertex AI auth', () => {
      expect(AuthType.USE_VERTEX_AI).toBe('vertex-ai');
    });

    it('should define Cloud Shell auth', () => {
      expect(AuthType.LEGACY_CLOUD_SHELL).toBe('cloud-shell');
    });

    it('should define Compute ADC auth', () => {
      expect(AuthType.COMPUTE_ADC).toBe('compute-default-credentials');
    });
  });

  describe('PROVIDER_AUTH_MAPPING', () => {
    it('should map Gemini to all auth types', () => {
      const geminiAuthTypes = PROVIDER_AUTH_MAPPING[ProviderType.Gemini];

      expect(geminiAuthTypes).toContain(AuthType.LOGIN_WITH_GOOGLE);
      expect(geminiAuthTypes).toContain(AuthType.USE_GEMINI);
      expect(geminiAuthTypes).toContain(AuthType.USE_VERTEX_AI);
      expect(geminiAuthTypes).toContain(AuthType.LEGACY_CLOUD_SHELL);
      expect(geminiAuthTypes).toContain(AuthType.COMPUTE_ADC);
    });

    it('should not have auth types for non-Gemini providers', () => {
      expect(PROVIDER_AUTH_MAPPING[ProviderType.Claude]).toEqual([]);
      expect(PROVIDER_AUTH_MAPPING[ProviderType.OpenAI]).toEqual([]);
      expect(PROVIDER_AUTH_MAPPING[ProviderType.Didim]).toEqual([]);
    });
  });

  describe('getAuthTypesForProvider()', () => {
    it('should return auth types for Gemini', () => {
      const authTypes = getAuthTypesForProvider(ProviderType.Gemini);

      expect(authTypes.length).toBe(5);
      expect(authTypes).toContain(AuthType.USE_GEMINI);
    });

    it('should return empty array for Claude', () => {
      const authTypes = getAuthTypesForProvider(ProviderType.Claude);

      expect(authTypes).toEqual([]);
    });
  });

  describe('getProviderForAuthType()', () => {
    it('should return Gemini for USE_GEMINI auth type', () => {
      const provider = getProviderForAuthType(AuthType.USE_GEMINI);

      expect(provider).toBe(ProviderType.Gemini);
    });

    it('should return Gemini for LOGIN_WITH_GOOGLE auth type', () => {
      const provider = getProviderForAuthType(AuthType.LOGIN_WITH_GOOGLE);

      expect(provider).toBe(ProviderType.Gemini);
    });

    it('should return Gemini for Vertex AI auth type', () => {
      const provider = getProviderForAuthType(AuthType.USE_VERTEX_AI);

      expect(provider).toBe(ProviderType.Gemini);
    });
  });

  describe('isGeminiAuthType()', () => {
    it('should return true for Gemini auth types', () => {
      expect(isGeminiAuthType(AuthType.USE_GEMINI)).toBe(true);
      expect(isGeminiAuthType(AuthType.LOGIN_WITH_GOOGLE)).toBe(true);
      expect(isGeminiAuthType(AuthType.USE_VERTEX_AI)).toBe(true);
    });

    it('should return true for all defined auth types (all are Gemini)', () => {
      expect(isGeminiAuthType(AuthType.LEGACY_CLOUD_SHELL)).toBe(true);
      expect(isGeminiAuthType(AuthType.COMPUTE_ADC)).toBe(true);
    });
  });
});
