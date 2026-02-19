/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import {
  doesToolInvocationMatch,
  getToolSuggestion,
  normalizeToolParams,
} from './tool-utils.js';
import type { AnyToolInvocation, Config } from '../index.js';
import { ReadFileTool } from '../tools/read-file.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

describe('getToolSuggestion', () => {
  it('should suggest the top N closest tool names for a typo', () => {
    const allToolNames = ['list_files', 'read_file', 'write_file'];

    // Test that the right tool is selected, with only 1 result, for typos
    const misspelledTool = getToolSuggestion('list_fils', allToolNames, 1);
    expect(misspelledTool).toBe(' Did you mean "list_files"?');

    // Test that the right tool is selected, with only 1 result, for prefixes
    const prefixedTool = getToolSuggestion(
      'github.list_files',
      allToolNames,
      1,
    );
    expect(prefixedTool).toBe(' Did you mean "list_files"?');

    // Test that the right tool is first
    const suggestionMultiple = getToolSuggestion('list_fils', allToolNames);
    expect(suggestionMultiple).toBe(
      ' Did you mean one of: "list_files", "read_file", "write_file"?',
    );
  });
});

describe('doesToolInvocationMatch', () => {
  it('should not match a partial command prefix', () => {
    const invocation = {
      params: { command: 'git commitsomething' },
    } as AnyToolInvocation;
    const patterns = ['ShellTool(git commit)'];
    const result = doesToolInvocationMatch(
      'run_shell_command',
      invocation,
      patterns,
    );
    expect(result).toBe(false);
  });

  it('should match an exact command', () => {
    const invocation = {
      params: { command: 'git status' },
    } as AnyToolInvocation;
    const patterns = ['ShellTool(git status)'];
    const result = doesToolInvocationMatch(
      'run_shell_command',
      invocation,
      patterns,
    );
    expect(result).toBe(true);
  });

  it('should match a command with an alias', () => {
    const invocation = {
      params: { command: 'wc -l' },
    } as AnyToolInvocation;
    const patterns = ['ShellTool(wc)'];
    const result = doesToolInvocationMatch('ShellTool', invocation, patterns);
    expect(result).toBe(true);
  });

  it('should match a command that is a prefix', () => {
    const invocation = {
      params: { command: 'git status -v' },
    } as AnyToolInvocation;
    const patterns = ['ShellTool(git status)'];
    const result = doesToolInvocationMatch(
      'run_shell_command',
      invocation,
      patterns,
    );
    expect(result).toBe(true);
  });

  describe('for non-shell tools', () => {
    const readFileTool = new ReadFileTool({} as Config, createMockMessageBus());
    const invocation = {
      params: { file: 'test.txt' },
    } as AnyToolInvocation;

    it('should match by tool name', () => {
      const patterns = ['read_file'];
      const result = doesToolInvocationMatch(
        readFileTool,
        invocation,
        patterns,
      );
      expect(result).toBe(true);
    });

    it('should match by tool class name', () => {
      const patterns = ['ReadFileTool'];
      const result = doesToolInvocationMatch(
        readFileTool,
        invocation,
        patterns,
      );
      expect(result).toBe(true);
    });

    it('should not match if neither name is in the patterns', () => {
      const patterns = ['some_other_tool', 'AnotherToolClass'];
      const result = doesToolInvocationMatch(
        readFileTool,
        invocation,
        patterns,
      );
      expect(result).toBe(false);
    });

    it('should match by tool name when passed as a string', () => {
      const patterns = ['read_file'];
      const result = doesToolInvocationMatch('read_file', invocation, patterns);
      expect(result).toBe(true);
    });
  });
});

describe('normalizeToolParams', () => {
  it('should return args unchanged when tool has no alias rules', () => {
    const args = { foo: 'bar' };
    const result = normalizeToolParams('unknown_tool', args);
    expect(result).toEqual({ foo: 'bar' });
    expect(result).toBe(args); // same reference — no copy needed
  });

  it('should normalize path to file_path for read_file', () => {
    const result = normalizeToolParams('read_file', {
      path: '/tmp/test.txt',
    });
    expect(result).toEqual({ file_path: '/tmp/test.txt' });
  });

  it('should normalize query to pattern for search_file_content', () => {
    const result = normalizeToolParams('search_file_content', {
      query: 'foo.*bar',
    });
    expect(result).toEqual({ pattern: 'foo.*bar' });
  });

  it('should not overwrite canonical param when it already exists', () => {
    const result = normalizeToolParams('read_file', {
      file_path: '/correct.txt',
      path: '/wrong.txt',
    });
    expect(result).toEqual({
      file_path: '/correct.txt',
      path: '/wrong.txt',
    });
  });

  it('should normalize path to dir_path for list_directory', () => {
    const result = normalizeToolParams('list_directory', { path: '/tmp' });
    expect(result).toEqual({ dir_path: '/tmp' });
  });

  it('should preserve non-aliased params alongside normalization', () => {
    const result = normalizeToolParams('read_file', {
      path: '/tmp/test.txt',
      offset: 10,
    });
    expect(result).toEqual({ file_path: '/tmp/test.txt', offset: 10 });
  });

  it('should handle camelCase alias (filePath → file_path)', () => {
    const result = normalizeToolParams('read_file', {
      filePath: '/tmp/test.txt',
    });
    expect(result).toEqual({ file_path: '/tmp/test.txt' });
  });

  it('should return args unchanged for tool with aliases but correct params', () => {
    const result = normalizeToolParams('read_file', {
      file_path: '/tmp/test.txt',
    });
    expect(result).toEqual({ file_path: '/tmp/test.txt' });
  });

  it('should handle empty args object', () => {
    const result = normalizeToolParams('read_file', {});
    expect(result).toEqual({});
  });

  it('should normalize cmd to command for run_shell_command', () => {
    const result = normalizeToolParams('run_shell_command', {
      cmd: 'ls -la',
    });
    expect(result).toEqual({ command: 'ls -la' });
  });

  it('should remove alias key after normalization', () => {
    const result = normalizeToolParams('search_file_content', {
      query: 'test',
      include: '*.ts',
    });
    expect(result).toEqual({ pattern: 'test', include: '*.ts' });
    expect(result).not.toHaveProperty('query');
  });

  it('should not mutate the original args object', () => {
    const original = { path: '/tmp/test.txt' };
    normalizeToolParams('read_file', original);
    expect(original).toEqual({ path: '/tmp/test.txt' });
    expect(original).not.toHaveProperty('file_path');
  });

  // --- P0: replace tool — old_string / new_string / instruction aliases ---

  it('should normalize old_text to old_string for replace', () => {
    const result = normalizeToolParams('replace', {
      file_path: '/tmp/f.ts',
      old_text: 'foo',
      new_string: 'bar',
      instruction: 'fix',
    });
    expect(result).toEqual({
      file_path: '/tmp/f.ts',
      old_string: 'foo',
      new_string: 'bar',
      instruction: 'fix',
    });
    expect(result).not.toHaveProperty('old_text');
  });

  it('should normalize new_text to new_string for replace', () => {
    const result = normalizeToolParams('replace', {
      file_path: '/tmp/f.ts',
      old_string: 'foo',
      new_text: 'bar',
      instruction: 'fix',
    });
    expect(result).toEqual({
      file_path: '/tmp/f.ts',
      old_string: 'foo',
      new_string: 'bar',
      instruction: 'fix',
    });
    expect(result).not.toHaveProperty('new_text');
  });

  it('should normalize camelCase oldText/newText for replace', () => {
    const result = normalizeToolParams('replace', {
      file_path: '/tmp/f.ts',
      oldText: 'foo',
      newText: 'bar',
      instruction: 'fix',
    });
    expect(result).toEqual({
      file_path: '/tmp/f.ts',
      old_string: 'foo',
      new_string: 'bar',
      instruction: 'fix',
    });
  });

  it('should normalize description to instruction for replace', () => {
    const result = normalizeToolParams('replace', {
      file_path: '/tmp/f.ts',
      old_string: 'a',
      new_string: 'b',
      description: 'Fix bug',
    });
    expect(result).toEqual({
      file_path: '/tmp/f.ts',
      old_string: 'a',
      new_string: 'b',
      instruction: 'Fix bug',
    });
  });

  it('should not overwrite old_string when both alias and canonical exist', () => {
    const result = normalizeToolParams('replace', {
      file_path: '/tmp/f.ts',
      old_string: 'correct',
      old_text: 'wrong',
      new_string: 'bar',
      instruction: 'fix',
    });
    expect(result.old_string).toBe('correct');
  });

  // --- P0: search_file_content / glob — dir_path aliases ---

  it('should normalize path to dir_path for search_file_content', () => {
    const result = normalizeToolParams('search_file_content', {
      pattern: 'TODO',
      path: '/src',
    });
    expect(result).toEqual({ pattern: 'TODO', dir_path: '/src' });
    expect(result).not.toHaveProperty('path');
  });

  it('should normalize directory to dir_path for search_file_content', () => {
    const result = normalizeToolParams('search_file_content', {
      pattern: 'TODO',
      directory: '/src',
    });
    expect(result).toEqual({ pattern: 'TODO', dir_path: '/src' });
  });

  it('should normalize path to dir_path for glob', () => {
    const result = normalizeToolParams('glob', {
      pattern: '**/*.ts',
      path: '/src',
    });
    expect(result).toEqual({ pattern: '**/*.ts', dir_path: '/src' });
    expect(result).not.toHaveProperty('path');
  });

  it('should not overwrite dir_path when canonical already exists for glob', () => {
    const result = normalizeToolParams('glob', {
      pattern: '**/*.ts',
      dir_path: '/correct',
      path: '/wrong',
    });
    expect(result.dir_path).toBe('/correct');
  });

  // --- P1: web_fetch — url → prompt alias ---

  it('should normalize url to prompt for web_fetch', () => {
    const result = normalizeToolParams('web_fetch', {
      url: 'https://example.com',
    });
    expect(result).toEqual({ prompt: 'https://example.com' });
    expect(result).not.toHaveProperty('url');
  });

  it('should not overwrite prompt when canonical already exists for web_fetch', () => {
    const result = normalizeToolParams('web_fetch', {
      prompt: 'Summarize https://example.com',
      url: 'https://other.com',
    });
    expect(result.prompt).toBe('Summarize https://example.com');
  });

  // --- P1: read_many_files — files → include alias ---

  it('should normalize files to include for read_many_files', () => {
    const result = normalizeToolParams('read_many_files', {
      files: ['src/**/*.ts'],
    });
    expect(result).toEqual({ include: ['src/**/*.ts'] });
    expect(result).not.toHaveProperty('files');
  });

  it('should normalize paths to include for read_many_files', () => {
    const result = normalizeToolParams('read_many_files', {
      paths: ['README.md', 'docs/'],
    });
    expect(result).toEqual({ include: ['README.md', 'docs/'] });
  });

  // --- P1: get_internal_docs — file_path → path alias ---

  it('should normalize file_path to path for get_internal_docs', () => {
    const result = normalizeToolParams('get_internal_docs', {
      file_path: 'cli/commands.md',
    });
    expect(result).toEqual({ path: 'cli/commands.md' });
    expect(result).not.toHaveProperty('file_path');
  });

  it('should normalize filePath to path for get_internal_docs', () => {
    const result = normalizeToolParams('get_internal_docs', {
      filePath: 'cli/commands.md',
    });
    expect(result).toEqual({ path: 'cli/commands.md' });
  });
});
