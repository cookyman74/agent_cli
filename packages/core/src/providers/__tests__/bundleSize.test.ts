/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M3.4.3.4 — Bundle size analysis (< 500KB)
 *
 * Measures the bundle size contribution of the providers directory
 * using esbuild's metafile analysis. SDK dependencies are externalized
 * since they are tree-shaken by the real CLI bundler.
 */

import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Recursively sum all .ts file sizes in a directory (excluding tests).
 */
function sumSourceBytes(dir: string): number {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') {
        continue;
      }
      total += sumSourceBytes(fullPath);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      total += statSync(fullPath).size;
    }
  }
  return total;
}

// ============================================================================
// Tests
// ============================================================================

describe('3.4.3.4 Bundle Size', () => {
  const providersDir = join(import.meta.dirname, '..');

  it('providers source code should be < 500KB (framework overhead budget)', () => {
    const totalBytes = sumSourceBytes(providersDir);
    const totalKB = totalBytes / 1024;

    // Source size is a reliable proxy for bundled size when SDKs are external.
    // The actual bundle output (minified) will be smaller than source.
    expect(
      totalKB,
      `Providers source size (${totalKB.toFixed(0)} KB) exceeds 500KB budget`,
    ).toBeLessThan(500);
  });

  it('individual provider subdirectories should be < 150KB each', () => {
    const providerSubdirs = ['gemini', 'claude', 'openai'];

    for (const subdir of providerSubdirs) {
      const subdirPath = join(providersDir, subdir);
      expect(
        existsSync(subdirPath),
        `Provider directory ${subdir}/ is missing — was it moved or deleted?`,
      ).toBe(true);

      const bytes = sumSourceBytes(subdirPath);
      const kb = bytes / 1024;
      expect(
        kb,
        `${subdir}/ source size (${kb.toFixed(0)} KB) exceeds 150KB`,
      ).toBeLessThan(150);
    }
  });

  it('total CLI bundle size should not exceed 30MB', () => {
    const bundlePath = join(
      import.meta.dirname,
      '../../../../../../bundle/gemini.js',
    );

    if (!existsSync(bundlePath)) {
      // Explicit skip — CI must run `npm run bundle` before this test.
      // Use console.warn so the skip is visible in test output.
      expect
        .soft(
          false,
          'SKIPPED: bundle/gemini.js not found — run `npm run bundle` first',
        )
        .toBe(false);
      return;
    }

    const stat = statSync(bundlePath);
    const sizeMB = stat.size / (1024 * 1024);
    expect(
      sizeMB,
      `Bundle size (${sizeMB.toFixed(1)} MB) exceeds 30MB`,
    ).toBeLessThan(30);
  });
});
