/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(false),
  };
});

import { Storage, resolveReadDir, resolveWriteDir } from './storage.js';
import { GEMINI_DIR, DIDIM_DIR, LEGACY_GEMINI_DIR } from '../utils/paths.js';

const mockExistsSync = vi.mocked(fs.existsSync);

describe('Storage – getGlobalSettingsPath', () => {
  it('returns path to ~/.didim/settings.json', () => {
    const expected = path.join(os.homedir(), GEMINI_DIR, 'settings.json');
    expect(Storage.getGlobalSettingsPath()).toBe(expected);
  });
});

describe('Storage – additional helpers', () => {
  const projectRoot = '/tmp/project';
  const storage = new Storage(projectRoot);

  it('getWorkspaceSettingsPath returns project/.didim/settings.json', () => {
    const expected = path.join(projectRoot, GEMINI_DIR, 'settings.json');
    expect(storage.getWorkspaceSettingsPath()).toBe(expected);
  });

  it('getUserCommandsDir returns ~/.didim/commands', () => {
    const expected = path.join(os.homedir(), GEMINI_DIR, 'commands');
    expect(Storage.getUserCommandsDir()).toBe(expected);
  });

  it('getProjectCommandsDir returns project/.didim/commands', () => {
    const expected = path.join(projectRoot, GEMINI_DIR, 'commands');
    expect(storage.getProjectCommandsDir()).toBe(expected);
  });

  it('getUserSkillsDir returns ~/.didim/skills', () => {
    const expected = path.join(os.homedir(), GEMINI_DIR, 'skills');
    expect(Storage.getUserSkillsDir()).toBe(expected);
  });

  it('getProjectSkillsDir returns project/.didim/skills', () => {
    const expected = path.join(projectRoot, GEMINI_DIR, 'skills');
    expect(storage.getProjectSkillsDir()).toBe(expected);
  });

  it('getUserAgentsDir returns ~/.didim/agents', () => {
    const expected = path.join(os.homedir(), GEMINI_DIR, 'agents');
    expect(Storage.getUserAgentsDir()).toBe(expected);
  });

  it('getProjectAgentsDir returns project/.didim/agents', () => {
    const expected = path.join(projectRoot, GEMINI_DIR, 'agents');
    expect(storage.getProjectAgentsDir()).toBe(expected);
  });

  it('getMcpOAuthTokensPath returns ~/.didim/mcp-oauth-tokens.json', () => {
    const expected = path.join(
      os.homedir(),
      GEMINI_DIR,
      'mcp-oauth-tokens.json',
    );
    expect(Storage.getMcpOAuthTokensPath()).toBe(expected);
  });

  it('getGlobalBinDir returns ~/.didim/tmp/bin', () => {
    const expected = path.join(os.homedir(), GEMINI_DIR, 'tmp', 'bin');
    expect(Storage.getGlobalBinDir()).toBe(expected);
  });

  it('getProjectTempPlansDir returns ~/.didim/tmp/<hash>/plans', () => {
    const tempDir = storage.getProjectTempDir();
    const expected = path.join(tempDir, 'plans');
    expect(storage.getProjectTempPlansDir()).toBe(expected);
  });
});

describe('Storage - System Paths', () => {
  const originalEnv = process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] = originalEnv;
    } else {
      delete process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
    }
  });

  it('getSystemSettingsPath returns correct path based on platform (default)', () => {
    delete process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];

    const platform = os.platform();
    const result = Storage.getSystemSettingsPath();

    if (platform === 'darwin') {
      expect(result).toBe(
        '/Library/Application Support/GeminiCli/settings.json',
      );
    } else if (platform === 'win32') {
      expect(result).toBe('C:\\ProgramData\\gemini-cli\\settings.json');
    } else {
      expect(result).toBe('/etc/gemini-cli/settings.json');
    }
  });

  it('getSystemSettingsPath follows GEMINI_CLI_SYSTEM_SETTINGS_PATH if set', () => {
    const customPath = '/custom/path/settings.json';
    process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] = customPath;
    expect(Storage.getSystemSettingsPath()).toBe(customPath);
  });

  it('getSystemPoliciesDir returns correct path based on platform and ignores env var', () => {
    process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'] =
      '/custom/path/settings.json';
    const platform = os.platform();
    const result = Storage.getSystemPoliciesDir();

    expect(result).not.toContain('/custom/path');

    if (platform === 'darwin') {
      expect(result).toBe('/Library/Application Support/GeminiCli/policies');
    } else if (platform === 'win32') {
      expect(result).toBe('C:\\ProgramData\\gemini-cli\\policies');
    } else {
      expect(result).toBe('/etc/gemini-cli/policies');
    }
  });
});

// ============================================================
// New tests: resolvers, write methods, read fallback
// ============================================================

describe('resolveReadDir', () => {
  const base = '/home/user';

  beforeEach(() => {
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(false);
  });

  it('returns .didim path when .didim directory exists', () => {
    mockExistsSync.mockImplementation(
      (p: fs.PathLike) => String(p) === path.join(base, DIDIM_DIR),
    );
    expect(resolveReadDir(base)).toBe(path.join(base, DIDIM_DIR));
  });

  it('returns .gemini path when only .gemini exists (legacy fallback)', () => {
    mockExistsSync.mockImplementation(
      (p: fs.PathLike) => String(p) === path.join(base, LEGACY_GEMINI_DIR),
    );
    expect(resolveReadDir(base)).toBe(path.join(base, LEGACY_GEMINI_DIR));
  });

  it('returns .didim path when neither directory exists (new user)', () => {
    mockExistsSync.mockReturnValue(false);
    expect(resolveReadDir(base)).toBe(path.join(base, DIDIM_DIR));
  });

  it('returns .didim path when both directories exist (.didim priority)', () => {
    mockExistsSync.mockReturnValue(true);
    expect(resolveReadDir(base)).toBe(path.join(base, DIDIM_DIR));
  });
});

describe('resolveWriteDir', () => {
  const base = '/home/user';

  it('always returns .didim path', () => {
    expect(resolveWriteDir(base)).toBe(path.join(base, DIDIM_DIR));
  });

  it('returns .didim path even when only .gemini exists', () => {
    // No filesystem dependency — always .didim
    expect(resolveWriteDir(base)).toBe(path.join(base, DIDIM_DIR));
  });
});

describe('Storage – write methods', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(false);
  });

  it('getGlobalWriteDir always contains .didim', () => {
    const result = Storage.getGlobalWriteDir();
    expect(result).toContain(DIDIM_DIR);
    expect(result).not.toContain(LEGACY_GEMINI_DIR);
  });

  it('getWriteDir (instance) always contains .didim', () => {
    const storage = new Storage('/tmp/project');
    const result = storage.getWriteDir();
    expect(result).toBe(path.join('/tmp/project', DIDIM_DIR));
  });

  it('getGlobalTempDir uses .didim even when .gemini is read fallback', () => {
    // Setup: only .gemini exists → read methods would resolve to .gemini
    // But write-only getGlobalTempDir should still use .didim
    mockExistsSync.mockImplementation((p: fs.PathLike) =>
      String(p).includes(LEGACY_GEMINI_DIR),
    );
    const result = Storage.getGlobalTempDir();
    expect(result).toContain(DIDIM_DIR);
    expect(result).not.toContain(LEGACY_GEMINI_DIR);
  });

  it('getHistoryDir uses .didim even when .gemini is read fallback', () => {
    mockExistsSync.mockImplementation((p: fs.PathLike) =>
      String(p).includes(LEGACY_GEMINI_DIR),
    );
    const storage = new Storage('/tmp/project');
    const result = storage.getHistoryDir();
    expect(result).toContain(DIDIM_DIR);
    expect(result).not.toContain(LEGACY_GEMINI_DIR);
  });
});

describe('Storage – read fallback', () => {
  beforeEach(() => {
    mockExistsSync.mockReset();
    mockExistsSync.mockReturnValue(false);
  });

  it('getGlobalGeminiDir falls back to .gemini when .didim does not exist', () => {
    mockExistsSync.mockImplementation(
      (p: fs.PathLike) =>
        String(p) === path.join(os.homedir(), LEGACY_GEMINI_DIR),
    );
    const result = Storage.getGlobalGeminiDir();
    expect(result).toBe(path.join(os.homedir(), LEGACY_GEMINI_DIR));
  });

  it('getGeminiDir (instance) falls back to .gemini when .didim does not exist', () => {
    const projectRoot = '/tmp/project';
    mockExistsSync.mockImplementation(
      (p: fs.PathLike) =>
        String(p) === path.join(projectRoot, LEGACY_GEMINI_DIR),
    );
    const storage = new Storage(projectRoot);
    const result = storage.getGeminiDir();
    expect(result).toBe(path.join(projectRoot, LEGACY_GEMINI_DIR));
  });

  it('getGlobalGeminiDir returns .didim when both exist', () => {
    mockExistsSync.mockReturnValue(true);
    const result = Storage.getGlobalGeminiDir();
    expect(result).toBe(path.join(os.homedir(), DIDIM_DIR));
  });

  it('getGlobalGeminiDir returns .didim when neither exists (new user)', () => {
    mockExistsSync.mockReturnValue(false);
    const result = Storage.getGlobalGeminiDir();
    expect(result).toBe(path.join(os.homedir(), DIDIM_DIR));
  });
});
