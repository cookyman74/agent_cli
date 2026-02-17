/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createPolicyUpdater } from './config.js';
import { PolicyEngine } from './policy-engine.js';
import { MessageBus } from '../confirmation-bus/message-bus.js';
import { MessageBusType } from '../confirmation-bus/types.js';
import { Storage } from '../config/storage.js';
import { ApprovalMode } from './types.js';
import { LEGACY_GEMINI_DIR } from '../utils/paths.js';

vi.mock('node:fs/promises');
vi.mock('../config/storage.js');
vi.mock('../utils/paths.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/paths.js')>();
  return {
    ...actual,
    homedir: vi.fn(() => '/mock/home'),
  };
});

describe('createPolicyUpdater', () => {
  let policyEngine: PolicyEngine;
  let messageBus: MessageBus;

  beforeEach(() => {
    policyEngine = new PolicyEngine({
      rules: [],
      checkers: [],
      approvalMode: ApprovalMode.DEFAULT,
    });
    messageBus = new MessageBus(policyEngine);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should persist policy when persist flag is true', async () => {
    createPolicyUpdater(policyEngine, messageBus);

    const userPoliciesDir = '/mock/user/policies';
    vi.spyOn(Storage, 'getUserPoliciesWriteDir').mockReturnValue(
      userPoliciesDir,
    );
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      new Error('File not found'),
    ); // Simulate new file
    (fs.writeFile as unknown as Mock).mockResolvedValue(undefined);
    (fs.rename as unknown as Mock).mockResolvedValue(undefined);

    const toolName = 'test_tool';
    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName,
      persist: true,
    });

    // Wait for async operations (microtasks)
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(Storage.getUserPoliciesWriteDir).toHaveBeenCalled();
    expect(fs.mkdir).toHaveBeenCalledWith(userPoliciesDir, {
      recursive: true,
    });

    // Check written content
    const expectedContent = expect.stringContaining(`toolName = "test_tool"`);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      expectedContent,
      'utf-8',
    );
    expect(fs.rename).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      path.join(userPoliciesDir, 'auto-saved.toml'),
    );
  });

  it('should not persist policy when persist flag is false or undefined', async () => {
    createPolicyUpdater(policyEngine, messageBus);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'test_tool',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(fs.writeFile).not.toHaveBeenCalled();
    expect(fs.rename).not.toHaveBeenCalled();
  });

  it('should persist policy with commandPrefix when provided', async () => {
    createPolicyUpdater(policyEngine, messageBus);

    const userPoliciesDir = '/mock/user/policies';
    vi.spyOn(Storage, 'getUserPoliciesWriteDir').mockReturnValue(
      userPoliciesDir,
    );
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      new Error('File not found'),
    );
    (fs.writeFile as unknown as Mock).mockResolvedValue(undefined);
    (fs.rename as unknown as Mock).mockResolvedValue(undefined);

    const toolName = 'run_shell_command';
    const commandPrefix = 'git status';

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName,
      persist: true,
      commandPrefix,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // In-memory rule check (unchanged)
    const rules = policyEngine.getRules();
    const addedRule = rules.find((r) => r.toolName === toolName);
    expect(addedRule).toBeDefined();
    expect(addedRule?.priority).toBe(2.95);
    expect(addedRule?.argsPattern).toEqual(
      new RegExp(`"command":"git\\ status(?:[\\s"]|\\\\")`),
    );

    // Verify file written
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/\.tmp$/),
      expect.stringContaining(`commandPrefix = "git status"`),
      'utf-8',
    );
  });

  it('should persist policy with mcpName and toolName when provided', async () => {
    createPolicyUpdater(policyEngine, messageBus);

    const userPoliciesDir = '/mock/user/policies';
    vi.spyOn(Storage, 'getUserPoliciesWriteDir').mockReturnValue(
      userPoliciesDir,
    );
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      new Error('File not found'),
    );
    (fs.writeFile as unknown as Mock).mockResolvedValue(undefined);
    (fs.rename as unknown as Mock).mockResolvedValue(undefined);

    const mcpName = 'my-jira-server';
    const simpleToolName = 'search';
    const toolName = `${mcpName}__${simpleToolName}`;

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName,
      persist: true,
      mcpName,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Verify file written
    const writeCall = (fs.writeFile as unknown as Mock).mock.calls[0];
    const writtenContent = writeCall[1] as string;
    expect(writtenContent).toContain(`mcpName = "${mcpName}"`);
    expect(writtenContent).toContain(`toolName = "${simpleToolName}"`);
    expect(writtenContent).toContain('priority = 200');
  });

  it('should escape special characters in toolName and mcpName', async () => {
    createPolicyUpdater(policyEngine, messageBus);

    const userPoliciesDir = '/mock/user/policies';
    vi.spyOn(Storage, 'getUserPoliciesWriteDir').mockReturnValue(
      userPoliciesDir,
    );
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);
    (fs.readFile as unknown as Mock).mockRejectedValue(
      new Error('File not found'),
    );
    (fs.writeFile as unknown as Mock).mockResolvedValue(undefined);
    (fs.rename as unknown as Mock).mockResolvedValue(undefined);

    const mcpName = 'my"jira"server';
    const toolName = `my"jira"server__search"tool"`;

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName,
      persist: true,
      mcpName,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const writeCall = (fs.writeFile as unknown as Mock).mock.calls[0];
    const writtenContent = writeCall[1] as string;

    // Verify escaping - should be valid TOML
    // Note: @iarna/toml optimizes for shortest representation, so it may use single quotes 'foo"bar'
    // instead of "foo\"bar\"" if there are no single quotes in the string.
    try {
      expect(writtenContent).toContain(`mcpName = "my\\"jira\\"server"`);
    } catch {
      expect(writtenContent).toContain(`mcpName = 'my"jira"server'`);
    }

    try {
      expect(writtenContent).toContain(`toolName = "search\\"tool\\""`);
    } catch {
      expect(writtenContent).toContain(`toolName = 'search"tool"'`);
    }
  });

  // Issue 26: legacy auto-saved.toml merge on first write to .didim
  // Updated for Issue 29: code now uses explicit homedir() + LEGACY_GEMINI_DIR
  // instead of Storage.getUserPoliciesDir() to avoid mkdir race condition.
  it('should merge rules from legacy auto-saved.toml when write path file is missing', async () => {
    createPolicyUpdater(policyEngine, messageBus);

    const userPoliciesDir = '/mock/user/policies';
    vi.spyOn(Storage, 'getUserPoliciesWriteDir').mockReturnValue(
      userPoliciesDir,
    );
    (fs.mkdir as unknown as Mock).mockResolvedValue(undefined);

    // Legacy path is now computed as homedir() + LEGACY_GEMINI_DIR + 'policies'
    // homedir() is mocked to return '/mock/home'
    const legacyFile = path.join(
      '/mock/home',
      LEGACY_GEMINI_DIR,
      'policies',
      'auto-saved.toml',
    );

    // Write path ENOENT, legacy path has existing rules
    const enoentError = new Error('ENOENT') as NodeJS.ErrnoException;
    enoentError.code = 'ENOENT';
    (fs.readFile as unknown as Mock).mockImplementation((filePath: string) => {
      if (filePath === path.join(userPoliciesDir, 'auto-saved.toml')) {
        return Promise.reject(enoentError);
      }
      if (filePath === legacyFile) {
        return Promise.resolve(
          '[[rule]]\ntoolName = "existing_tool"\ndecision = "allow"\npriority = 100\n',
        );
      }
      return Promise.reject(new Error('Unknown file'));
    });
    (fs.writeFile as unknown as Mock).mockResolvedValue(undefined);
    (fs.rename as unknown as Mock).mockResolvedValue(undefined);

    await messageBus.publish({
      type: MessageBusType.UPDATE_POLICY,
      toolName: 'new_tool',
      persist: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    // Verify written content includes BOTH legacy and new rules
    const writeCall = (fs.writeFile as unknown as Mock).mock.calls[0];
    const writtenContent2 = writeCall[1] as string;
    expect(writtenContent2).toContain('existing_tool');
    expect(writtenContent2).toContain('new_tool');
  });
});
