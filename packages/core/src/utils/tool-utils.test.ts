/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import {
  coerceParamTypes,
  doesToolInvocationMatch,
  fuzzyMatchToolName,
  getToolSuggestion,
  normalizeToolParams,
  normalizeToolParamsBySchema,
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
    expect(result['old_string']).toBe('correct');
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
    expect(result['dir_path']).toBe('/correct');
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
    expect(result['prompt']).toBe('Summarize https://example.com');
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

  // --- Issue #7 대응: alias map 존재 시 불필요 copy 방지 ---

  it('should return original args reference when alias map exists but no aliases match', () => {
    // read_file has an alias map (path, filepath, filePath, file → file_path)
    // but these args already use canonical name → no alias applied
    const args = { file_path: '/tmp/test.txt' };
    const result = normalizeToolParams('read_file', args);
    expect(result).toBe(args); // same reference — no aliases applied
  });

  it('should normalize filePath to path for get_internal_docs', () => {
    const result = normalizeToolParams('get_internal_docs', {
      filePath: 'cli/commands.md',
    });
    expect(result).toEqual({ path: 'cli/commands.md' });
  });
});

describe('normalizeToolParamsBySchema', () => {
  const schema = {
    type: 'object',
    properties: {
      file_path: { type: 'string' },
      content: { type: 'string' },
      line_number: { type: 'number' },
    },
    required: ['file_path', 'content'],
  };

  // --- camelCase → snake_case 변환 ---

  it('should normalize camelCase to snake_case when schema property exists', () => {
    const args = { filePath: '/tmp/test.txt', content: 'hello' };
    const result = normalizeToolParamsBySchema(args, schema);
    expect(result).toEqual({ file_path: '/tmp/test.txt', content: 'hello' });
  });

  it('should not overwrite canonical param when it already exists', () => {
    const args = {
      file_path: '/correct.txt',
      filePath: '/wrong.txt',
      content: 'hello',
    };
    const result = normalizeToolParamsBySchema(args, schema);
    expect(result['file_path']).toBe('/correct.txt');
  });

  it('should handle multiple camelCase conversions', () => {
    const args = { filePath: '/tmp/f.ts', lineNumber: 42, content: 'hello' };
    const result = normalizeToolParamsBySchema(args, schema);
    expect(result).toEqual({
      file_path: '/tmp/f.ts',
      line_number: 42,
      content: 'hello',
    });
  });

  it('should return args unchanged when all params match schema', () => {
    const args = { file_path: '/tmp/test.txt', content: 'hello' };
    const result = normalizeToolParamsBySchema(args, schema);
    expect(result).toEqual(args);
  });

  it('should return args unchanged when schema is undefined', () => {
    const args = { foo: 'bar' };
    const result = normalizeToolParamsBySchema(args, undefined);
    expect(result).toBe(args); // same reference
  });

  it('should not mutate original args', () => {
    const original = { filePath: '/tmp/test.txt', content: 'hello' };
    normalizeToolParamsBySchema(original, schema);
    expect(original).toEqual({ filePath: '/tmp/test.txt', content: 'hello' });
  });

  // --- 접미사 매칭 (Option B) ---

  it('should normalize suffix alias to required param (e.g., path → file_path)', () => {
    const args = { path: '/tmp/test.txt', content: 'hello' };
    const result = normalizeToolParamsBySchema(args, schema);
    expect(result).toEqual({ file_path: '/tmp/test.txt', content: 'hello' });
  });

  it('should prefer exact camelCase match over suffix match', () => {
    const args = {
      filePath: '/camel.txt',
      path: '/suffix.txt',
      content: 'hello',
    };
    const result = normalizeToolParamsBySchema(args, schema);
    expect(result['file_path']).toBe('/camel.txt');
  });

  it('should not apply suffix match for optional params when ambiguous', () => {
    // schema has both dir_path and file_path → 'path' is ambiguous
    const ambiguousSchema = {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        dir_path: { type: 'string' },
      },
      required: ['file_path'],
    };
    const args = { path: '/tmp' };
    const result = normalizeToolParamsBySchema(args, ambiguousSchema);
    // 'path' matches file_path (required) → resolves ambiguity
    expect(result['file_path']).toBe('/tmp');
  });

  it('should skip suffix match when ambiguous and no required resolution', () => {
    const ambiguousSchema = {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        dir_path: { type: 'string' },
      },
      required: [],
    };
    const args = { path: '/tmp' };
    const result = normalizeToolParamsBySchema(args, ambiguousSchema);
    // ambiguous, both optional → skip normalization
    expect(result).toEqual({ path: '/tmp' });
  });

  // --- Issue #7 대응: required 복수 시 오매핑 방지 ---

  it('should skip suffix match when ambiguous and multiple required candidates', () => {
    const ambiguousSchema = {
      type: 'object',
      properties: {
        source_path: { type: 'string' },
        dest_path: { type: 'string' },
      },
      required: ['source_path', 'dest_path'],
    };
    const args = { path: '/tmp/file.txt' };
    const result = normalizeToolParamsBySchema(args, ambiguousSchema);
    // ambiguous — 'path' matches both *_path, both required → skip (no mapping)
    expect(result).toEqual({ path: '/tmp/file.txt' });
  });

  it('should skip suffix match for *_id when multiple id fields exist', () => {
    const multiIdSchema = {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        task_id: { type: 'string' },
        project_id: { type: 'string' },
      },
      required: ['user_id', 'task_id'],
    };
    const args = { id: '12345' };
    const result = normalizeToolParamsBySchema(args, multiIdSchema);
    // ambiguous — 'id' matches 3 *_id fields, 2 required → skip
    expect(result).toEqual({ id: '12345' });
  });

  // --- Issue #2 대응: 비정상 schema 방어 ---

  it('should return args unchanged when required is not an array', () => {
    const badSchema = {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
      },
      required: 42, // 비정상: 숫자
    };
    const args = { filePath: '/tmp/test.txt' };
    // 예외 없이 camelCase 정규화 수행 (required가 비정상이어도 camelCase는 동작)
    const result = normalizeToolParamsBySchema(
      args,
      badSchema as unknown as Record<string, unknown>,
    );
    expect(result).toEqual({ file_path: '/tmp/test.txt' });
  });

  it('should filter non-string entries in required array', () => {
    const badSchema = {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        dir_path: { type: 'string' },
      },
      required: ['file_path', 123, null], // 비정상 항목 포함
    };
    const args = { path: '/tmp' };
    const result = normalizeToolParamsBySchema(
      args,
      badSchema as unknown as Record<string, unknown>,
    );
    // 'path' → file_path(required) vs dir_path(optional) → 모호성 해소
    expect(result['file_path']).toBe('/tmp');
  });

  // --- Issue #3 대응: allOf 조합형 schema ---

  it('should merge properties from allOf sub-schemas', () => {
    const compositeSchema = {
      allOf: [
        {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
          },
          required: ['file_path'],
        },
        {
          type: 'object',
          properties: {
            content: { type: 'string' },
            line_number: { type: 'number' },
          },
        },
      ],
    };
    const args = { filePath: '/tmp/f.ts', lineNumber: 10, content: 'hello' };
    const result = normalizeToolParamsBySchema(
      args,
      compositeSchema as unknown as Record<string, unknown>,
    );
    expect(result).toEqual({
      file_path: '/tmp/f.ts',
      line_number: 10,
      content: 'hello',
    });
  });

  it('should handle allOf with overlapping properties', () => {
    const compositeSchema = {
      allOf: [
        {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
          },
          required: ['file_path'],
        },
        {
          type: 'object',
          properties: {
            file_path: { type: 'string', description: 'overridden' },
            dir_path: { type: 'string' },
          },
          required: ['dir_path'],
        },
      ],
    };
    const args = { path: '/tmp' };
    const result = normalizeToolParamsBySchema(
      args,
      compositeSchema as unknown as Record<string, unknown>,
    );
    // 'path' → file_path(required) + dir_path(required) → 모호, both required → skip
    expect(result).toEqual({ path: '/tmp' });
  });

  // --- Issue #6 대응: PascalCase 선행 underscore 방지 ---

  it('should normalize PascalCase to snake_case (leading uppercase)', () => {
    const pascalSchema = {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
        line_number: { type: 'number' },
      },
      required: ['file_path'],
    };
    const args = { FilePath: '/tmp/test.txt', LineNumber: 10 };
    const result = normalizeToolParamsBySchema(args, pascalSchema);
    expect(result['file_path']).toBe('/tmp/test.txt');
    expect(result['line_number']).toBe(10);
  });

  // --- Issue #8 대응: properties + allOf 공존 시 allOf 병합 ---

  it('should merge top-level properties with allOf sub-schema properties', () => {
    const mixedSchema = {
      type: 'object',
      properties: {
        file_path: { type: 'string' },
      },
      required: ['file_path'],
      allOf: [
        {
          type: 'object',
          properties: {
            line_number: { type: 'number' },
          },
          required: ['line_number'],
        },
      ],
    };
    const args = { filePath: '/tmp/f.ts', lineNumber: 10 };
    const result = normalizeToolParamsBySchema(
      args,
      mixedSchema as unknown as Record<string, unknown>,
    );
    // file_path from top-level, line_number from allOf — both camelCase→snake_case
    expect(result['file_path']).toBe('/tmp/f.ts');
    expect(result['line_number']).toBe(10);
  });

  it('should return args unchanged for schema with only $ref (no properties/allOf)', () => {
    const refSchema = {
      $ref: '#/definitions/SomeType',
    };
    const args = { filePath: '/tmp/test.txt' };
    const result = normalizeToolParamsBySchema(
      args,
      refSchema as unknown as Record<string, unknown>,
    );
    // $ref만 있고 properties/allOf 없음 → 정규화 불가 → args 반환
    expect(result).toBe(args);
  });
});

describe('coerceParamTypes', () => {
  const schema = {
    type: 'object',
    properties: {
      count: { type: 'number' },
      enabled: { type: 'boolean' },
      name: { type: 'string' },
      offset: { type: 'integer' },
      tags: { type: 'array', items: { type: 'string' } },
    },
    required: ['count', 'name'],
  };

  // --- string → number 변환 ---

  it('should coerce string "42" to number 42 when schema expects number', () => {
    const args = { count: '42', name: 'test' };
    const result = coerceParamTypes(args, schema);
    expect(result['count']).toBe(42);
    expect(typeof result['count']).toBe('number');
  });

  it('should coerce string "3.14" to float when schema expects number', () => {
    const args = { count: '3.14', name: 'test' };
    const result = coerceParamTypes(args, schema);
    expect(result['count']).toBe(3.14);
  });

  it('should not coerce non-numeric string to number', () => {
    const args = { count: 'abc', name: 'test' };
    const result = coerceParamTypes(args, schema);
    expect(result['count']).toBe('abc');
  });

  it('should not coerce empty string to number 0', () => {
    const args = { count: '', name: 'test' };
    const result = coerceParamTypes(args, schema);
    expect(result['count']).toBe('');
  });

  it('should not coerce whitespace-only string to number 0', () => {
    const args = { count: '   ', name: 'test' };
    const result = coerceParamTypes(args, schema);
    expect(result['count']).toBe('   ');
  });

  // --- string → boolean 변환 ---

  it('should coerce string "true" to boolean true', () => {
    const args = { count: 1, name: 'test', enabled: 'true' };
    const result = coerceParamTypes(args, schema);
    expect(result['enabled']).toBe(true);
  });

  it('should coerce string "false" to boolean false', () => {
    const args = { count: 1, name: 'test', enabled: 'false' };
    const result = coerceParamTypes(args, schema);
    expect(result['enabled']).toBe(false);
  });

  // --- string → integer 변환 ---

  it('should coerce string "10" to integer when schema expects integer', () => {
    const args = { count: 1, name: 'test', offset: '10' };
    const result = coerceParamTypes(args, schema);
    expect(result['offset']).toBe(10);
    expect(Number.isInteger(result['offset'])).toBe(true);
  });

  it('should not coerce float string to integer', () => {
    const args = { count: 1, name: 'test', offset: '3.14' };
    const result = coerceParamTypes(args, schema);
    expect(result['offset']).toBe('3.14');
  });

  // --- 변환 불필요 케이스 ---

  it('should not modify args when types already match', () => {
    const args = { count: 42, name: 'test', enabled: true };
    const result = coerceParamTypes(args, schema);
    expect(result).toEqual(args);
  });

  it('should return args unchanged when schema is undefined', () => {
    const args = { foo: 'bar' };
    const result = coerceParamTypes(args, undefined);
    expect(result).toBe(args);
  });

  it('should not mutate original args', () => {
    const original = { count: '42', name: 'test' };
    coerceParamTypes(original, schema);
    expect(original['count']).toBe('42');
  });

  // --- number → string 변환 (역방향) ---

  it('should coerce number 42 to string "42" when schema expects string', () => {
    const args = { count: 1, name: 42 };
    const result = coerceParamTypes(args, schema);
    expect(result['name']).toBe('42');
  });
});

describe('fuzzyMatchToolName', () => {
  const allToolNames = [
    'read_file',
    'write_file',
    'list_directory',
    'search_file_content',
  ];

  it('should return exact match as-is', () => {
    expect(fuzzyMatchToolName('read_file', allToolNames)).toBe('read_file');
  });

  it('should auto-correct typo with distance 1', () => {
    expect(fuzzyMatchToolName('read_fil', allToolNames)).toBe('read_file');
  });

  it('should auto-correct typo with distance 2', () => {
    expect(fuzzyMatchToolName('raed_file', allToolNames)).toBe('read_file');
  });

  it('should return null when distance > 2 (too different)', () => {
    expect(fuzzyMatchToolName('completely_wrong', allToolNames)).toBeNull();
  });

  it('should return null when multiple candidates at same minimum distance', () => {
    // 'write_fil' → only 'write_file' is within distance 2
    // Actually this should match since only one is close
    const tools = ['file_a', 'file_b'];
    // 'file_c' → distance 1 to both 'file_a' and 'file_b' → ambiguous
    expect(fuzzyMatchToolName('file_c', tools)).toBeNull();
  });

  it('should return null when name is empty', () => {
    expect(fuzzyMatchToolName('', allToolNames)).toBeNull();
  });

  it('should handle qualified MCP tool name typo', () => {
    const mcpTools = ['myserver__custom_tool', 'myserver__other_tool'];
    expect(fuzzyMatchToolName('myserver__cusom_tool', mcpTools)).toBe(
      'myserver__custom_tool',
    );
  });

  // --- 서버 경계 보호 ---

  it('should not cross server boundary in qualified name fuzzy match', () => {
    const tools = ['serverA__custom_tool', 'serverB__custom_tool'];
    expect(fuzzyMatchToolName('serverA__cusom_tool', tools)).toBe(
      'serverA__custom_tool',
    );
  });

  it('should reject qualified name when prefix does not match any registered server', () => {
    const tools = ['serverA__custom_tool'];
    expect(fuzzyMatchToolName('serverX__custom_tool', tools)).toBeNull();
  });

  it('should not match qualified name against unqualified tools', () => {
    const tools = ['custom_tool', 'read_file'];
    expect(fuzzyMatchToolName('server__custom_tool', tools)).toBeNull();
  });
});
