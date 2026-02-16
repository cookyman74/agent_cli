/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import {
  EXTENSION_SETTINGS_FILENAME,
  EXTENSIONS_CONFIG_FILENAME,
} from './variables.js';
import { Storage, homedir, resolveReadPath } from '@didim365/agent-cli-core';

export class ExtensionStorage {
  private readonly extensionName: string;

  constructor(extensionName: string) {
    this.extensionName = extensionName;
  }

  getExtensionDir(): string {
    return resolveReadPath(homedir(), 'extensions', this.extensionName);
  }

  /**
   * Returns the extension directory for write operations.
   * Always returns .didim-based path regardless of legacy .gemini existence.
   */
  getExtensionWriteDir(): string {
    return path.join(
      ExtensionStorage.getUserExtensionsWriteDir(),
      this.extensionName,
    );
  }

  getConfigPath(): string {
    return path.join(this.getExtensionDir(), EXTENSIONS_CONFIG_FILENAME);
  }

  getEnvFilePath(): string {
    // Resolve at file level (not dir level) so that a .didim/extensions/<ext>/
    // directory without .env doesn't shadow .gemini/extensions/<ext>/.env.
    return resolveReadPath(
      homedir(),
      'extensions',
      this.extensionName,
      EXTENSION_SETTINGS_FILENAME,
    );
  }

  /**
   * Returns the .env file path for write operations.
   * Always returns .didim-based path regardless of legacy .gemini existence.
   */
  getEnvFileWritePath(): string {
    return path.join(this.getExtensionWriteDir(), EXTENSION_SETTINGS_FILENAME);
  }

  static getUserExtensionsDir(): string {
    return new Storage(homedir()).getExtensionsDir();
  }

  static getUserExtensionsWriteDir(): string {
    return Storage.getGlobalWritePath('extensions');
  }

  static getUserExtensionsEnablementReadPath(): string {
    return resolveReadPath(
      homedir(),
      'extensions',
      'extension-enablement.json',
    );
  }

  static async createTmpDir(): Promise<string> {
    return fs.promises.mkdtemp(path.join(os.tmpdir(), 'gemini-extension'));
  }
}
