/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { resolveEnv, resolvePromptEnv, isCliEnvVar } from './envResolver.js';

describe('envResolver', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('resolveEnv', () => {
    it('returns DIDIM_ value when only DIDIM_ is set', () => {
      vi.stubEnv('DIDIM_MODEL', 'didim-model');
      expect(resolveEnv('MODEL')).toBe('didim-model');
    });

    it('returns GEMINI_ value when only GEMINI_ is set', () => {
      vi.stubEnv('GEMINI_MODEL', 'gemini-model');
      expect(resolveEnv('MODEL')).toBe('gemini-model');
    });

    it('prefers DIDIM_ over GEMINI_ when both are set', () => {
      vi.stubEnv('DIDIM_MODEL', 'didim-model');
      vi.stubEnv('GEMINI_MODEL', 'gemini-model');
      expect(resolveEnv('MODEL')).toBe('didim-model');
    });

    it('returns undefined when neither is set', () => {
      expect(resolveEnv('MODEL')).toBeUndefined();
    });

    it('treats empty string DIDIM_ as a valid value (no fallback)', () => {
      vi.stubEnv('DIDIM_SANDBOX', '');
      vi.stubEnv('GEMINI_SANDBOX', 'true');
      expect(resolveEnv('SANDBOX')).toBe('');
    });

    it('works with compound suffixes', () => {
      vi.stubEnv('DIDIM_CLI_HOME', '/custom/path');
      expect(resolveEnv('CLI_HOME')).toBe('/custom/path');
    });

    it('falls back for compound suffixes', () => {
      vi.stubEnv('GEMINI_CLI_HOME', '/gemini/path');
      expect(resolveEnv('CLI_HOME')).toBe('/gemini/path');
    });
  });

  describe('resolvePromptEnv', () => {
    it('returns DIDIM_PROMPT_ value when only DIDIM_ is set', () => {
      vi.stubEnv('DIDIM_PROMPT_SAFETY', 'didim-safety-prompt');
      expect(resolvePromptEnv('SAFETY')).toBe('didim-safety-prompt');
    });

    it('returns GEMINI_PROMPT_ value when only GEMINI_ is set', () => {
      vi.stubEnv('GEMINI_PROMPT_SAFETY', 'gemini-safety-prompt');
      expect(resolvePromptEnv('SAFETY')).toBe('gemini-safety-prompt');
    });

    it('prefers DIDIM_PROMPT_ over GEMINI_PROMPT_ when both are set', () => {
      vi.stubEnv('DIDIM_PROMPT_SAFETY', 'didim-safety-prompt');
      vi.stubEnv('GEMINI_PROMPT_SAFETY', 'gemini-safety-prompt');
      expect(resolvePromptEnv('SAFETY')).toBe('didim-safety-prompt');
    });

    it('returns undefined when neither is set', () => {
      expect(resolvePromptEnv('NONEXISTENT')).toBeUndefined();
    });
  });

  describe('isCliEnvVar', () => {
    it('returns true for DIDIM_CLI_ prefix', () => {
      expect(isCliEnvVar('DIDIM_CLI_HOME')).toBe(true);
      expect(isCliEnvVar('DIDIM_CLI_CUSTOM_HEADERS')).toBe(true);
    });

    it('returns true for GEMINI_CLI_ prefix', () => {
      expect(isCliEnvVar('GEMINI_CLI_HOME')).toBe(true);
      expect(isCliEnvVar('GEMINI_CLI_CUSTOM_HEADERS')).toBe(true);
    });

    it('returns false for non-CLI env vars', () => {
      expect(isCliEnvVar('DIDIM_MODEL')).toBe(false);
      expect(isCliEnvVar('GEMINI_MODEL')).toBe(false);
      expect(isCliEnvVar('PATH')).toBe(false);
      expect(isCliEnvVar('HOME')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isCliEnvVar('')).toBe(false);
    });

    it('is case-sensitive', () => {
      expect(isCliEnvVar('didim_cli_home')).toBe(false);
      expect(isCliEnvVar('gemini_cli_home')).toBe(false);
    });
  });
});
