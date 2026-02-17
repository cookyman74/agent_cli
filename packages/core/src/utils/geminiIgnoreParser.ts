/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import ignore from 'ignore';
import { DIDIM_IGNORE_FILE, LEGACY_GEMINI_IGNORE_FILE } from './paths.js';

export interface GeminiIgnoreFilter {
  isIgnored(filePath: string): boolean;
  getPatterns(): string[];
  getIgnoreFilePath(): string | null;
  hasPatterns(): boolean;
}

/** Neutral alias for GeminiIgnoreFilter. New code should use this. */
export type IgnoreFilter = GeminiIgnoreFilter;

export class GeminiIgnoreParser implements GeminiIgnoreFilter {
  private projectRoot: string;
  private patterns: string[] = [];
  private ig = ignore();
  private loadedIgnoreFile: string | null = null;

  constructor(projectRoot: string) {
    this.projectRoot = path.resolve(projectRoot);
    this.loadPatterns();
  }

  private loadPatterns(): void {
    const candidates = [
      path.join(this.projectRoot, DIDIM_IGNORE_FILE),
      path.join(this.projectRoot, LEGACY_GEMINI_IGNORE_FILE),
    ];
    for (const candidatePath of candidates) {
      let content: string;
      try {
        content = fs.readFileSync(candidatePath, 'utf-8');
      } catch (_error) {
        continue;
      }
      const parsed = (content ?? '')
        .split('\n')
        .map((p) => p.trim())
        .filter((p) => p !== '' && !p.startsWith('#'));
      if (parsed.length > 0) {
        this.patterns = parsed;
        this.loadedIgnoreFile = candidatePath;
        this.ig.add(this.patterns);
        return;
      }
    }
  }

  isIgnored(filePath: string): boolean {
    if (this.patterns.length === 0) {
      return false;
    }

    if (!filePath || typeof filePath !== 'string') {
      return false;
    }

    if (
      filePath.startsWith('\\') ||
      filePath === '/' ||
      filePath.includes('\0')
    ) {
      return false;
    }

    const resolved = path.resolve(this.projectRoot, filePath);
    const relativePath = path.relative(this.projectRoot, resolved);

    if (relativePath === '' || relativePath.startsWith('..')) {
      return false;
    }

    // Even in windows, Ignore expects forward slashes.
    const normalizedPath = relativePath.replace(/\\/g, '/');

    if (normalizedPath.startsWith('/') || normalizedPath === '') {
      return false;
    }

    return this.ig.ignores(normalizedPath);
  }

  getPatterns(): string[] {
    return this.patterns;
  }

  /**
   * Returns the path to the loaded ignore file if it exists and has patterns.
   * Checks .didimignore first, falls back to .geminiignore.
   * Useful for tools like ripgrep that support --ignore-file flag.
   */
  getIgnoreFilePath(): string | null {
    if (!this.hasPatterns()) {
      return null;
    }
    return this.loadedIgnoreFile;
  }

  /**
   * Returns true if an ignore file was loaded and still exists with patterns.
   */
  hasPatterns(): boolean {
    if (this.patterns.length === 0) {
      return false;
    }
    return (
      this.loadedIgnoreFile !== null && fs.existsSync(this.loadedIgnoreFile)
    );
  }
}

/** Neutral alias for GeminiIgnoreParser. New code should use this. */
export { GeminiIgnoreParser as IgnoreParser };
