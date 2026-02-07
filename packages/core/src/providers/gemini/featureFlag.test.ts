/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * TDD tests for multi-provider feature flag — controls the migration
 * from legacy Gemini-only path to new BaseAdapter-based multi-provider path.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isMultiProviderEnabled,
  setMultiProviderOverride,
  clearMultiProviderOverride,
  withFallback,
} from './featureFlag.js';

describe('Multi-Provider Feature Flag', () => {
  beforeEach(() => {
    clearMultiProviderOverride();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    clearMultiProviderOverride();
    vi.unstubAllEnvs();
  });

  // ==============================================================
  // 2.3.4.1 — ENABLE_MULTI_PROVIDER flag implementation
  // ==============================================================

  describe('2.3.4.1 ENABLE_MULTI_PROVIDER flag', () => {
    it('should default to false when env var is not set', () => {
      vi.stubEnv('ENABLE_MULTI_PROVIDER', '');
      expect(isMultiProviderEnabled()).toBe(false);
    });

    it('should return true when env var is "true"', () => {
      vi.stubEnv('ENABLE_MULTI_PROVIDER', 'true');
      expect(isMultiProviderEnabled()).toBe(true);
    });

    it('should return true when env var is "1"', () => {
      vi.stubEnv('ENABLE_MULTI_PROVIDER', '1');
      expect(isMultiProviderEnabled()).toBe(true);
    });

    it('should return false when env var is "false"', () => {
      vi.stubEnv('ENABLE_MULTI_PROVIDER', 'false');
      expect(isMultiProviderEnabled()).toBe(false);
    });

    it('should return false when env var is "0"', () => {
      vi.stubEnv('ENABLE_MULTI_PROVIDER', '0');
      expect(isMultiProviderEnabled()).toBe(false);
    });

    it('should be case-insensitive for "TRUE"', () => {
      vi.stubEnv('ENABLE_MULTI_PROVIDER', 'TRUE');
      expect(isMultiProviderEnabled()).toBe(true);
    });
  });

  // ==============================================================
  // 2.3.4.2 — Flag-based route branching
  // ==============================================================

  describe('2.3.4.2 flag-based route branching', () => {
    it('should execute legacy path when disabled', () => {
      vi.stubEnv('ENABLE_MULTI_PROVIDER', 'false');

      const legacyFn = vi.fn().mockReturnValue('legacy');
      const newFn = vi.fn().mockReturnValue('new');

      const result = isMultiProviderEnabled() ? newFn() : legacyFn();

      expect(result).toBe('legacy');
      expect(legacyFn).toHaveBeenCalled();
      expect(newFn).not.toHaveBeenCalled();
    });

    it('should execute new path when enabled', () => {
      vi.stubEnv('ENABLE_MULTI_PROVIDER', 'true');

      const legacyFn = vi.fn().mockReturnValue('legacy');
      const newFn = vi.fn().mockReturnValue('new');

      const result = isMultiProviderEnabled() ? newFn() : legacyFn();

      expect(result).toBe('new');
      expect(newFn).toHaveBeenCalled();
      expect(legacyFn).not.toHaveBeenCalled();
    });
  });

  // ==============================================================
  // 2.3.4.3 — Runtime switch test
  // ==============================================================

  describe('2.3.4.3 runtime switch', () => {
    it('should support programmatic override (true)', () => {
      vi.stubEnv('ENABLE_MULTI_PROVIDER', 'false');
      expect(isMultiProviderEnabled()).toBe(false);

      setMultiProviderOverride(true);
      expect(isMultiProviderEnabled()).toBe(true);
    });

    it('should support programmatic override (false)', () => {
      vi.stubEnv('ENABLE_MULTI_PROVIDER', 'true');
      expect(isMultiProviderEnabled()).toBe(true);

      setMultiProviderOverride(false);
      expect(isMultiProviderEnabled()).toBe(false);
    });

    it('should restore env-based behavior after clear', () => {
      vi.stubEnv('ENABLE_MULTI_PROVIDER', 'true');

      setMultiProviderOverride(false);
      expect(isMultiProviderEnabled()).toBe(false);

      clearMultiProviderOverride();
      expect(isMultiProviderEnabled()).toBe(true);
    });

    it('override takes precedence over env var', () => {
      vi.stubEnv('ENABLE_MULTI_PROVIDER', 'true');
      setMultiProviderOverride(false);

      expect(isMultiProviderEnabled()).toBe(false);
    });
  });

  // ==============================================================
  // 2.3.4.4 — Fallback logic
  // ==============================================================

  describe('2.3.4.4 fallback logic', () => {
    it('should return primary result when it succeeds', async () => {
      const primary = vi.fn().mockResolvedValue('adapter result');
      const fallback = vi.fn().mockResolvedValue('legacy result');

      const result = await withFallback(primary, fallback);

      expect(result).toBe('adapter result');
      expect(primary).toHaveBeenCalledTimes(1);
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should return fallback result when primary throws', async () => {
      const primary = vi.fn().mockRejectedValue(new Error('adapter failed'));
      const fallback = vi.fn().mockResolvedValue('legacy result');

      const result = await withFallback(primary, fallback);

      expect(result).toBe('legacy result');
      expect(primary).toHaveBeenCalledTimes(1);
      expect(fallback).toHaveBeenCalledTimes(1);
    });

    it('should throw when both primary and fallback fail', async () => {
      const primary = vi.fn().mockRejectedValue(new Error('adapter failed'));
      const fallback = vi.fn().mockRejectedValue(new Error('legacy failed'));

      await expect(withFallback(primary, fallback)).rejects.toThrow(
        'legacy failed',
      );
    });

    it('should pass error context to fallback', async () => {
      const error = new Error('specific error');
      const primary = vi.fn().mockRejectedValue(error);
      const fallback = vi.fn().mockResolvedValue('recovered');

      await withFallback(primary, fallback);

      // fallback receives the error from primary
      expect(fallback).toHaveBeenCalledWith(error);
    });
  });
});
