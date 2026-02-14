/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { DEFAULT_CONTEXT_FILENAME, GEMINI_DIR } from '@didim365/agent-cli-core';
import { loadExtensions, EXTENSIONS_CONFIG_FILENAME } from './extension.js';

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock homedir to prevent loading from real home directory
const mockHomedir = vi.hoisted(() => vi.fn());

vi.mock('@didim365/agent-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@didim365/agent-cli-core')>();
  return {
    ...actual,
    homedir: mockHomedir,
  };
});

describe('extension loading', () => {
  let tempDir: string;
  let extensionsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a2a-ext-test-'));
    extensionsDir = path.join(tempDir, GEMINI_DIR, 'extensions');
    // homedir returns a non-existent path to avoid interference
    mockHomedir.mockReturnValue(path.join(tempDir, 'fake-home'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createExtensionDir(
    name: string,
    config: Record<string, unknown>,
    contextFiles?: Array<{ name: string; content: string }>,
  ): string {
    const extDir = path.join(extensionsDir, name);
    fs.mkdirSync(extDir, { recursive: true });
    fs.writeFileSync(
      path.join(extDir, EXTENSIONS_CONFIG_FILENAME),
      JSON.stringify(config),
    );
    if (contextFiles) {
      for (const file of contextFiles) {
        fs.writeFileSync(path.join(extDir, file.name), file.content);
      }
    }
    return extDir;
  }

  describe('context file fallback (AGENTS.md → GEMINI.md)', () => {
    it('should load only AGENTS.md when both AGENTS.md and GEMINI.md exist', () => {
      createExtensionDir('dual-ext', { name: 'dual-ext', version: '1.0.0' }, [
        { name: DEFAULT_CONTEXT_FILENAME, content: 'agents context' },
        { name: 'GEMINI.md', content: 'gemini context' },
      ]);

      const extensions = loadExtensions(tempDir);

      expect(extensions).toHaveLength(1);
      expect(extensions[0].contextFiles).toEqual([
        path.join(extensionsDir, 'dual-ext', DEFAULT_CONTEXT_FILENAME),
      ]);
      expect(extensions[0].contextFiles).toHaveLength(1);
    });

    it('should load GEMINI.md when only GEMINI.md exists (legacy fallback)', () => {
      createExtensionDir(
        'legacy-ext',
        { name: 'legacy-ext', version: '1.0.0' },
        [{ name: 'GEMINI.md', content: 'gemini context' }],
      );

      const extensions = loadExtensions(tempDir);

      expect(extensions).toHaveLength(1);
      expect(extensions[0].contextFiles).toEqual([
        path.join(extensionsDir, 'legacy-ext', 'GEMINI.md'),
      ]);
    });

    it('should load AGENTS.md when only AGENTS.md exists (primary path)', () => {
      createExtensionDir(
        'agents-ext',
        { name: 'agents-ext', version: '1.0.0' },
        [{ name: DEFAULT_CONTEXT_FILENAME, content: 'agents context' }],
      );

      const extensions = loadExtensions(tempDir);

      expect(extensions).toHaveLength(1);
      expect(extensions[0].contextFiles).toEqual([
        path.join(extensionsDir, 'agents-ext', DEFAULT_CONTEXT_FILENAME),
      ]);
    });

    it('should return empty contextFiles when neither file exists', () => {
      createExtensionDir('no-context-ext', {
        name: 'no-context-ext',
        version: '1.0.0',
      });

      const extensions = loadExtensions(tempDir);

      expect(extensions).toHaveLength(1);
      expect(extensions[0].contextFiles).toEqual([]);
    });

    it('should use custom contextFileName when configured', () => {
      createExtensionDir(
        'custom-ext',
        {
          name: 'custom-ext',
          version: '1.0.0',
          contextFileName: 'CUSTOM.md',
        },
        [{ name: 'CUSTOM.md', content: 'custom context' }],
      );

      const extensions = loadExtensions(tempDir);

      expect(extensions).toHaveLength(1);
      expect(extensions[0].contextFiles).toEqual([
        path.join(extensionsDir, 'custom-ext', 'CUSTOM.md'),
      ]);
    });
  });
});
