/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  Storage,
  debugLogger,
  resolveReadPath,
  homedir,
} from '@didim365/agent-cli-core';
import { PersistentState } from './persistentState.js';

const mockDir = '/mock/dir';
const mockReadPath = path.join(mockDir, 'state.json');
const mockWritePath = path.join('/mock/write-dir', 'state.json');

vi.mock('node:fs');
vi.mock('@didim365/agent-cli-core', () => ({
  Storage: {
    getGlobalGeminiDir: vi.fn(),
    getGlobalWritePath: vi.fn(),
  },
  resolveReadPath: vi.fn(),
  homedir: vi.fn(),
  debugLogger: {
    warn: vi.fn(),
  },
}));

describe('PersistentState', () => {
  let persistentState: PersistentState;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(resolveReadPath).mockReturnValue(mockReadPath);
    vi.mocked(homedir).mockReturnValue('/mock/home');
    vi.mocked(Storage.getGlobalWritePath).mockReturnValue(mockWritePath);
    persistentState = new PersistentState();
  });

  it('should load state from file if it exists', () => {
    const mockData = { defaultBannerShownCount: { banner1: 1 } };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockData));

    const value = persistentState.get('defaultBannerShownCount');
    expect(value).toEqual(mockData.defaultBannerShownCount);
    expect(fs.readFileSync).toHaveBeenCalledWith(mockReadPath, 'utf-8');
  });

  it('should return undefined if key does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const value = persistentState.get('defaultBannerShownCount');
    expect(value).toBeUndefined();
  });

  it('should save state to file', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    persistentState.set('defaultBannerShownCount', { banner1: 1 });

    expect(fs.mkdirSync).toHaveBeenCalledWith(
      path.normalize(path.dirname(mockWritePath)),
      { recursive: true },
    );
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      mockWritePath,
      JSON.stringify({ defaultBannerShownCount: { banner1: 1 } }, null, 2),
    );
  });

  it('should handle load errors and start fresh', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('Read error');
    });

    const value = persistentState.get('defaultBannerShownCount');
    expect(value).toBeUndefined();
    expect(debugLogger.warn).toHaveBeenCalled();
  });

  it('should handle save errors', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.writeFileSync).mockImplementation(() => {
      throw new Error('Write error');
    });

    persistentState.set('defaultBannerShownCount', { banner1: 1 });
    expect(debugLogger.warn).toHaveBeenCalled();
  });
});
