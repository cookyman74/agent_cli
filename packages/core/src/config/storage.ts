/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as os from 'node:os';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import { DIDIM_DIR, LEGACY_GEMINI_DIR, homedir } from '../utils/paths.js';

export const GOOGLE_ACCOUNTS_FILENAME = 'google_accounts.json';
export const OAUTH_FILE = 'oauth_creds.json';
const TMP_DIR_NAME = 'tmp';
const BIN_DIR_NAME = 'bin';

/**
 * Resolves the config directory for reading.
 * Priority: .didim (primary) > .gemini (legacy fallback).
 * Returns .didim path if neither exists (new user).
 */
export function resolveReadDir(base: string): string {
  const primary = path.join(base, DIDIM_DIR);
  if (fs.existsSync(primary)) return primary;
  const legacy = path.join(base, LEGACY_GEMINI_DIR);
  if (fs.existsSync(legacy)) return legacy;
  return primary;
}

/**
 * Resolves the config directory for writing.
 * Always returns .didim path.
 */
export function resolveWriteDir(base: string): string {
  return path.join(base, DIDIM_DIR);
}

/**
 * Resolves a specific config file/dir path for reading.
 * Checks .didim path first, then .gemini fallback.
 * Returns .didim path if neither exists (new user).
 *
 * Unlike resolveReadDir (directory-level), this resolves at file level,
 * preventing empty .didim/ directory from shadowing .gemini/ files.
 */
export function resolveReadPath(base: string, ...subPaths: string[]): string {
  const primary = path.join(base, DIDIM_DIR, ...subPaths);
  if (fs.existsSync(primary)) return primary;
  const legacy = path.join(base, LEGACY_GEMINI_DIR, ...subPaths);
  if (fs.existsSync(legacy)) return legacy;
  return primary;
}

export class Storage {
  private readonly targetDir: string;

  constructor(targetDir: string) {
    this.targetDir = targetDir;
  }

  private static getHomeBase(): string {
    return homedir() || os.tmpdir();
  }

  static getGlobalGeminiDir(): string {
    const homeDir = homedir();
    if (!homeDir) {
      return resolveReadDir(os.tmpdir());
    }
    return resolveReadDir(homeDir);
  }

  /**
   * Returns the global config directory for write operations.
   * Always returns .didim path regardless of legacy .gemini existence.
   */
  static getGlobalWriteDir(): string {
    const homeDir = homedir();
    if (!homeDir) {
      return resolveWriteDir(os.tmpdir());
    }
    return resolveWriteDir(homeDir);
  }

  /**
   * Returns the global settings path for write operations.
   * Always returns .didim path regardless of legacy .gemini existence.
   */
  static getGlobalWriteSettingsPath(): string {
    return path.join(Storage.getGlobalWriteDir(), 'settings.json');
  }

  static getMcpOAuthTokensPath(): string {
    return resolveReadPath(Storage.getHomeBase(), 'mcp-oauth-tokens.json');
  }

  static getGlobalSettingsPath(): string {
    return resolveReadPath(Storage.getHomeBase(), 'settings.json');
  }

  static getInstallationIdPath(): string {
    return resolveReadPath(Storage.getHomeBase(), 'installation_id');
  }

  static getGoogleAccountsPath(): string {
    return resolveReadPath(Storage.getHomeBase(), GOOGLE_ACCOUNTS_FILENAME);
  }

  static getUserCommandsDir(): string {
    return resolveReadPath(Storage.getHomeBase(), 'commands');
  }

  static getUserSkillsDir(): string {
    return resolveReadPath(Storage.getHomeBase(), 'skills');
  }

  static getGlobalMemoryFilePath(): string {
    return resolveReadPath(Storage.getHomeBase(), 'memory.md');
  }

  static getUserPoliciesDir(): string {
    return resolveReadPath(Storage.getHomeBase(), 'policies');
  }

  static getUserAgentsDir(): string {
    return resolveReadPath(Storage.getHomeBase(), 'agents');
  }

  static getAcknowledgedAgentsPath(): string {
    return resolveReadPath(
      Storage.getHomeBase(),
      'acknowledgments',
      'agents.json',
    );
  }

  private static getSystemConfigDir(): string {
    if (os.platform() === 'darwin') {
      return '/Library/Application Support/GeminiCli';
    } else if (os.platform() === 'win32') {
      return 'C:\\ProgramData\\gemini-cli';
    } else {
      return '/etc/gemini-cli';
    }
  }

  static getSystemSettingsPath(): string {
    if (process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH']) {
      return process.env['GEMINI_CLI_SYSTEM_SETTINGS_PATH'];
    }
    return path.join(Storage.getSystemConfigDir(), 'settings.json');
  }

  static getSystemPoliciesDir(): string {
    return path.join(Storage.getSystemConfigDir(), 'policies');
  }

  static getGlobalTempDir(): string {
    return path.join(Storage.getGlobalWriteDir(), TMP_DIR_NAME);
  }

  static getGlobalBinDir(): string {
    return path.join(Storage.getGlobalTempDir(), BIN_DIR_NAME);
  }

  getGeminiDir(): string {
    return resolveReadDir(this.targetDir);
  }

  /**
   * Returns the workspace config directory for write operations.
   * Always returns .didim path regardless of legacy .gemini existence.
   */
  getWriteDir(): string {
    return resolveWriteDir(this.targetDir);
  }

  getProjectTempDir(): string {
    const hash = this.getFilePathHash(this.getProjectRoot());
    const tempDir = Storage.getGlobalTempDir();
    return path.join(tempDir, hash);
  }

  ensureProjectTempDirExists(): void {
    fs.mkdirSync(this.getProjectTempDir(), { recursive: true });
  }

  static getOAuthCredsPath(): string {
    return resolveReadPath(Storage.getHomeBase(), OAUTH_FILE);
  }

  getProjectRoot(): string {
    return this.targetDir;
  }

  private getFilePathHash(filePath: string): string {
    return crypto.createHash('sha256').update(filePath).digest('hex');
  }

  getHistoryDir(): string {
    const hash = this.getFilePathHash(this.getProjectRoot());
    const historyDir = path.join(Storage.getGlobalWriteDir(), 'history');
    return path.join(historyDir, hash);
  }

  getWorkspaceSettingsPath(): string {
    return resolveReadPath(this.targetDir, 'settings.json');
  }

  /**
   * Returns the workspace settings path for write operations.
   * Always returns .didim path regardless of legacy .gemini existence.
   */
  getWriteSettingsPath(): string {
    return path.join(this.getWriteDir(), 'settings.json');
  }

  getProjectCommandsDir(): string {
    return resolveReadPath(this.targetDir, 'commands');
  }

  getProjectSkillsDir(): string {
    return resolveReadPath(this.targetDir, 'skills');
  }

  getProjectAgentsDir(): string {
    return resolveReadPath(this.targetDir, 'agents');
  }

  getProjectTempCheckpointsDir(): string {
    return path.join(this.getProjectTempDir(), 'checkpoints');
  }

  getProjectTempLogsDir(): string {
    return path.join(this.getProjectTempDir(), 'logs');
  }

  getProjectTempPlansDir(): string {
    return path.join(this.getProjectTempDir(), 'plans');
  }

  getExtensionsDir(): string {
    return resolveReadPath(this.targetDir, 'extensions');
  }

  getExtensionsConfigPath(): string {
    return resolveReadPath(
      this.targetDir,
      'extensions',
      'gemini-extension.json',
    );
  }

  getHistoryFilePath(): string {
    return path.join(this.getProjectTempDir(), 'shell_history');
  }
}
