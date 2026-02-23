/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  tokenLimit,
  DEFAULT_TOKEN_LIMIT,
  OPENAI_COMPATIBLE_TOKEN_LIMIT,
} from './tokenLimits.js';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL,
} from '../config/models.js';

describe('tokenLimit', () => {
  beforeEach(() => {
    vi.stubEnv('LLM_PROVIDER', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });
  it('should return the correct token limit for default models', () => {
    expect(tokenLimit(DEFAULT_GEMINI_MODEL)).toBe(1_048_576);
    expect(tokenLimit(DEFAULT_GEMINI_FLASH_MODEL)).toBe(1_048_576);
    expect(tokenLimit(DEFAULT_GEMINI_FLASH_LITE_MODEL)).toBe(1_048_576);
  });

  it('should return the correct token limit for preview models', () => {
    expect(tokenLimit(PREVIEW_GEMINI_MODEL)).toBe(1_048_576);
    expect(tokenLimit(PREVIEW_GEMINI_FLASH_MODEL)).toBe(1_048_576);
  });

  it('should return the default token limit for an unknown model', () => {
    expect(tokenLimit('unknown-model')).toBe(DEFAULT_TOKEN_LIMIT);
  });

  it('should return the default token limit if no model is provided', () => {
    // @ts-expect-error testing invalid input
    expect(tokenLimit(undefined)).toBe(DEFAULT_TOKEN_LIMIT);
  });

  it('should have the correct default token limit value', () => {
    expect(DEFAULT_TOKEN_LIMIT).toBe(1_048_576);
  });

  describe('openai-compatible provider', () => {
    it('should return conservative token limit for openai-compatible provider', () => {
      vi.stubEnv('LLM_PROVIDER', 'openai-compatible');
      expect(tokenLimit('any-model')).toBe(OPENAI_COMPATIBLE_TOKEN_LIMIT);
      expect(OPENAI_COMPATIBLE_TOKEN_LIMIT).toBe(32_768);
    });

    it('should return conservative token limit for openai_compatible provider (underscore)', () => {
      vi.stubEnv('LLM_PROVIDER', 'openai_compatible');
      expect(tokenLimit('any-model')).toBe(OPENAI_COMPATIBLE_TOKEN_LIMIT);
    });

    it('should prioritize openai-compatible limit over model-based limit', () => {
      vi.stubEnv('LLM_PROVIDER', 'openai-compatible');
      // Even for Gemini model names, should return sLM limit when provider is openai-compatible
      expect(tokenLimit(DEFAULT_GEMINI_MODEL)).toBe(
        OPENAI_COMPATIBLE_TOKEN_LIMIT,
      );
    });
  });
});
