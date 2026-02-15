/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  resolveActiveProvider,
  normalizeProviderKey,
} from './resolveActiveProvider.js';

describe('resolveActiveProvider', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // =========================================================================
  // normalizeProviderKey — UI키/env키 → 레지스트리 키 정규화
  // =========================================================================

  describe('normalizeProviderKey', () => {
    it('normalizes "slm" to "openai-compatible"', () => {
      expect(normalizeProviderKey('slm')).toBe('openai-compatible');
    });

    it('normalizes "vertex-ai" to "gemini"', () => {
      expect(normalizeProviderKey('vertex-ai')).toBe('gemini');
    });

    it('normalizes "didim-studio" to "didim"', () => {
      expect(normalizeProviderKey('didim-studio')).toBe('didim');
    });

    it('passes through known keys unchanged (claude, openai, gemini)', () => {
      expect(normalizeProviderKey('claude')).toBe('claude');
      expect(normalizeProviderKey('openai')).toBe('openai');
      expect(normalizeProviderKey('gemini')).toBe('gemini');
    });

    it('passes through openai-compatible unchanged', () => {
      expect(normalizeProviderKey('openai-compatible')).toBe(
        'openai-compatible',
      );
    });

    it('passes through unknown keys unchanged', () => {
      expect(normalizeProviderKey('some-future-provider')).toBe(
        'some-future-provider',
      );
    });

    // --- 이슈 2+3: Core parseProviderEnv 호환 alias + 대소문자/공백 정규화 ---

    it('normalizes "anthropic" to "claude" (Core alias 호환)', () => {
      expect(normalizeProviderKey('anthropic')).toBe('claude');
    });

    it('normalizes "openai_compatible" (underscore) to "openai-compatible"', () => {
      expect(normalizeProviderKey('openai_compatible')).toBe(
        'openai-compatible',
      );
    });

    it('is case-insensitive', () => {
      expect(normalizeProviderKey('Claude')).toBe('claude');
      expect(normalizeProviderKey('OPENAI')).toBe('openai');
      expect(normalizeProviderKey('SLM')).toBe('openai-compatible');
      expect(normalizeProviderKey('Vertex-AI')).toBe('gemini');
      expect(normalizeProviderKey('Anthropic')).toBe('claude');
    });

    it('trims whitespace', () => {
      expect(normalizeProviderKey('  claude  ')).toBe('claude');
      expect(normalizeProviderKey(' openai_compatible ')).toBe(
        'openai-compatible',
      );
    });
  });

  // =========================================================================
  // resolveActiveProvider — 다중 소스 프로바이더 감지
  // =========================================================================

  describe('selectedProvider 우선순위 (1순위)', () => {
    it('returns normalized key when selectedProvider is "slm"', () => {
      expect(resolveActiveProvider('slm')).toBe('openai-compatible');
    });

    it('returns "gemini" when selectedProvider is "vertex-ai"', () => {
      expect(resolveActiveProvider('vertex-ai')).toBe('gemini');
    });

    it('returns "didim" when selectedProvider is "didim-studio"', () => {
      expect(resolveActiveProvider('didim-studio')).toBe('didim');
    });

    it('returns passthrough for known keys', () => {
      expect(resolveActiveProvider('claude')).toBe('claude');
      expect(resolveActiveProvider('openai')).toBe('openai');
      expect(resolveActiveProvider('gemini')).toBe('gemini');
    });

    it('selectedProvider takes priority over LLM_PROVIDER', () => {
      vi.stubEnv('LLM_PROVIDER', 'openai');
      expect(resolveActiveProvider('claude')).toBe('claude');
    });
  });

  describe('LLM_PROVIDER env fallback (2순위)', () => {
    it('uses LLM_PROVIDER when selectedProvider is undefined', () => {
      vi.stubEnv('LLM_PROVIDER', 'claude');
      expect(resolveActiveProvider()).toBe('claude');
    });

    it('normalizes LLM_PROVIDER value', () => {
      vi.stubEnv('LLM_PROVIDER', 'openai-compatible');
      expect(resolveActiveProvider()).toBe('openai-compatible');
    });
  });

  describe('API key 자동감지 (3순위)', () => {
    it('detects ANTHROPIC_API_KEY → claude', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-xxx');
      expect(resolveActiveProvider()).toBe('claude');
    });

    it('detects OPENAI_API_KEY → openai', () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-xxx');
      expect(resolveActiveProvider()).toBe('openai');
    });

    it('detects DIDIM_API_KEY → didim', () => {
      vi.stubEnv('DIDIM_API_KEY', 'didim-xxx');
      expect(resolveActiveProvider()).toBe('didim');
    });

    it('ANTHROPIC_API_KEY has priority over OPENAI_API_KEY', () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ant-xxx');
      vi.stubEnv('OPENAI_API_KEY', 'sk-xxx');
      expect(resolveActiveProvider()).toBe('claude');
    });
  });

  describe('fallback (4순위)', () => {
    it('falls back to gemini when no source set', () => {
      expect(resolveActiveProvider()).toBe('gemini');
    });

    it('falls back to gemini when selectedProvider is empty string', () => {
      expect(resolveActiveProvider('')).toBe('gemini');
    });
  });
});
