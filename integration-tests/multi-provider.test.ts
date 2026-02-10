/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * M3.4.2 Multi-Provider E2E Tests
 *
 * Verifies end-to-end CLI flow for each provider:
 *   3.4.2.1 Gemini (legacy generateContentStream path)
 *   3.4.2.2 Claude (llmGenerateContentStream via processLlmTurn)
 *   3.4.2.3 OpenAI (llmGenerateContentStream via processLlmTurn)
 *
 * Each provider tests 4 scenarios: basic, streaming, tool-call, error.
 * Uses FakeContentGenerator with golden .responses files.
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import {
  TestRig,
  poll,
  printDebugInfo,
  validateModelOutput,
} from './test-helper.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const RESPONSES_DIR = join(import.meta.dirname, 'multi-provider');

// =============================================
// 3.4.2.1 Gemini
// =============================================
describe('Multi-Provider E2E: Gemini', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should handle basic conversation', async () => {
    await rig.setup('gemini-basic', {
      fakeResponsesPath: join(RESPONSES_DIR, 'gemini-basic.responses'),
    });

    const result = await rig.run({ args: 'Hello' });

    validateModelOutput(
      result,
      ['Gemini', 'assistant'],
      'Gemini basic conversation',
    );
  });

  it('should handle streaming multi-chunk response', async () => {
    await rig.setup('gemini-streaming', {
      fakeResponsesPath: join(RESPONSES_DIR, 'gemini-streaming.responses'),
    });

    const result = await rig.run({ args: 'Explain this concept' });

    validateModelOutput(
      result,
      ['step by step', 'components'],
      'Gemini streaming',
    );
  });

  it('should handle tool call flow', async () => {
    await rig.setup('gemini-tool-call', {
      fakeResponsesPath: join(RESPONSES_DIR, 'gemini-tool-call.responses'),
      settings: { tools: { core: ['list_directory'] } },
    });
    rig.createFile('test-file.txt', 'content');
    rig.sync();

    await poll(() => existsSync(join(rig.testDir!, 'test-file.txt')), 1000, 50);

    const result = await rig.run({
      args: 'List the current directory',
    });

    try {
      await rig.expectToolCallSuccess(['list_directory']);
    } catch (e) {
      printDebugInfo(rig, result, {
        'Found tool call': false,
        'Contains test-file.txt': result.includes('test-file.txt'),
      });
      throw e;
    }

    validateModelOutput(result, ['test-file'], 'Gemini tool call');
  });

  it('should handle error response gracefully', async () => {
    await rig.setup('gemini-error', {
      fakeResponsesPath: join(RESPONSES_DIR, 'gemini-error.responses'),
    });

    // Gemini error golden returns a text response (not an error event),
    // so the CLI should exit normally.
    const result = await rig.run({ args: 'Hello' });

    validateModelOutput(
      result,
      ['issue', 'try again'],
      'Gemini error response',
    );
  });
});

// =============================================
// 3.4.2.2 Claude
// =============================================
describe('Multi-Provider E2E: Claude', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should handle basic conversation', async () => {
    await rig.setup('claude-basic', {
      fakeResponsesPath: join(RESPONSES_DIR, 'claude-basic.responses'),
    });

    const result = await rig.run({
      args: 'Hello',
      env: { LLM_PROVIDER: 'claude' },
    });

    validateModelOutput(
      result,
      ['Claude', 'assistant'],
      'Claude basic conversation',
    );
  });

  it('should handle streaming multi-chunk response', async () => {
    await rig.setup('claude-streaming', {
      fakeResponsesPath: join(RESPONSES_DIR, 'claude-streaming.responses'),
    });

    const result = await rig.run({
      args: 'Explain this concept',
      env: { LLM_PROVIDER: 'claude' },
    });

    validateModelOutput(
      result,
      ['step by step', 'components'],
      'Claude streaming',
    );
  });

  it('should handle tool call flow', async () => {
    await rig.setup('claude-tool-call', {
      fakeResponsesPath: join(RESPONSES_DIR, 'claude-tool-call.responses'),
      settings: { tools: { core: ['list_directory'] } },
    });
    rig.createFile('test-file.txt', 'content');
    rig.sync();

    await poll(() => existsSync(join(rig.testDir!, 'test-file.txt')), 1000, 50);

    const result = await rig.run({
      args: 'List the current directory',
      env: { LLM_PROVIDER: 'claude' },
    });

    try {
      await rig.expectToolCallSuccess(['list_directory']);
    } catch (e) {
      printDebugInfo(rig, result, {
        'Found tool call': false,
        'Contains test-file.txt': result.includes('test-file.txt'),
      });
      throw e;
    }

    validateModelOutput(result, ['test-file'], 'Claude tool call');
  });

  it('should handle error gracefully', async () => {
    await rig.setup('claude-error', {
      fakeResponsesPath: join(RESPONSES_DIR, 'claude-error.responses'),
    });

    // LlmEvent.Error causes nonInteractiveCli to throw → non-zero exit code
    let thrown: Error | undefined;
    try {
      await rig.run({
        args: 'Hello',
        env: { LLM_PROVIDER: 'claude' },
      });
    } catch (e) {
      thrown = e as Error;
    }

    // CLI should exit with non-zero code, not hang or timeout
    expect(thrown).toBeDefined();
  });
});

// =============================================
// 3.4.2.3 OpenAI
// =============================================
describe('Multi-Provider E2E: OpenAI', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should handle basic conversation', async () => {
    await rig.setup('openai-basic', {
      fakeResponsesPath: join(RESPONSES_DIR, 'openai-basic.responses'),
    });

    const result = await rig.run({
      args: 'Hello',
      env: { LLM_PROVIDER: 'openai' },
    });

    validateModelOutput(
      result,
      ['OpenAI', 'assistant'],
      'OpenAI basic conversation',
    );
  });

  it('should handle streaming multi-chunk response', async () => {
    await rig.setup('openai-streaming', {
      fakeResponsesPath: join(RESPONSES_DIR, 'openai-streaming.responses'),
    });

    const result = await rig.run({
      args: 'Explain this concept',
      env: { LLM_PROVIDER: 'openai' },
    });

    validateModelOutput(
      result,
      ['step by step', 'components'],
      'OpenAI streaming',
    );
  });

  it('should handle tool call flow', async () => {
    await rig.setup('openai-tool-call', {
      fakeResponsesPath: join(RESPONSES_DIR, 'openai-tool-call.responses'),
      settings: { tools: { core: ['list_directory'] } },
    });
    rig.createFile('test-file.txt', 'content');
    rig.sync();

    await poll(() => existsSync(join(rig.testDir!, 'test-file.txt')), 1000, 50);

    const result = await rig.run({
      args: 'List the current directory',
      env: { LLM_PROVIDER: 'openai' },
    });

    try {
      await rig.expectToolCallSuccess(['list_directory']);
    } catch (e) {
      printDebugInfo(rig, result, {
        'Found tool call': false,
        'Contains test-file.txt': result.includes('test-file.txt'),
      });
      throw e;
    }

    validateModelOutput(result, ['test-file'], 'OpenAI tool call');
  });

  it('should handle error gracefully', async () => {
    await rig.setup('openai-error', {
      fakeResponsesPath: join(RESPONSES_DIR, 'openai-error.responses'),
    });

    // LlmEvent.Error causes nonInteractiveCli to throw → non-zero exit code
    let thrown: Error | undefined;
    try {
      await rig.run({
        args: 'Hello',
        env: { LLM_PROVIDER: 'openai' },
      });
    } catch (e) {
      thrown = e as Error;
    }

    // CLI should exit with non-zero code, not hang or timeout
    expect(thrown).toBeDefined();
  });
});
