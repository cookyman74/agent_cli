/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  isValidToolName,
  ALL_BUILTIN_TOOL_NAMES,
  DISCOVERED_TOOL_PREFIX,
  LS_TOOL_NAME,
  TASK_CREATE_TOOL_NAME,
  TASK_GET_TOOL_NAME,
  TASK_UPDATE_TOOL_NAME,
  TASK_LIST_TOOL_NAME,
} from './tool-names.js';

describe('tool-names', () => {
  // RED-1: Task* 상수 존재 + ALL_BUILTIN 포함 검증
  describe('Task tool name constants', () => {
    it('should export TASK_CREATE_TOOL_NAME as "task_create"', () => {
      expect(TASK_CREATE_TOOL_NAME).toBe('task_create');
    });

    it('should export TASK_GET_TOOL_NAME as "task_get"', () => {
      expect(TASK_GET_TOOL_NAME).toBe('task_get');
    });

    it('should export TASK_UPDATE_TOOL_NAME as "task_update"', () => {
      expect(TASK_UPDATE_TOOL_NAME).toBe('task_update');
    });

    it('should export TASK_LIST_TOOL_NAME as "task_list"', () => {
      expect(TASK_LIST_TOOL_NAME).toBe('task_list');
    });

    it('should include all Task* tools in ALL_BUILTIN_TOOL_NAMES', () => {
      expect(ALL_BUILTIN_TOOL_NAMES).toContain('task_create');
      expect(ALL_BUILTIN_TOOL_NAMES).toContain('task_get');
      expect(ALL_BUILTIN_TOOL_NAMES).toContain('task_update');
      expect(ALL_BUILTIN_TOOL_NAMES).toContain('task_list');
    });
  });

  describe('isValidToolName', () => {
    it('should validate built-in tool names', () => {
      expect(isValidToolName(LS_TOOL_NAME)).toBe(true);
      for (const name of ALL_BUILTIN_TOOL_NAMES) {
        expect(isValidToolName(name)).toBe(true);
      }
    });

    it('should validate discovered tool names', () => {
      expect(isValidToolName(`${DISCOVERED_TOOL_PREFIX}my_tool`)).toBe(true);
    });

    it('should validate MCP tool names (server__tool)', () => {
      expect(isValidToolName('server__tool')).toBe(true);
      expect(isValidToolName('my-server__my-tool')).toBe(true);
    });

    // Cross-phase review: generateValidName preserves '.' but slugRegex must match
    it('should validate MCP tool names containing dots', () => {
      // generateValidName('my.tool') → 'my.tool' (dot preserved)
      // isValidToolName must accept this for policy rule consistency
      expect(isValidToolName('server__my.tool')).toBe(true);
      expect(isValidToolName('my.server__my.tool')).toBe(true);
      expect(isValidToolName('server__v1.2.3_tool')).toBe(true);
    });

    it('should reject invalid tool names', () => {
      expect(isValidToolName('')).toBe(false);
      expect(isValidToolName('invalid-name')).toBe(false);
      expect(isValidToolName('server__')).toBe(false);
      expect(isValidToolName('__tool')).toBe(false);
      expect(isValidToolName('server__tool__extra')).toBe(false);
    });

    it('should handle wildcards when allowed', () => {
      // Default: not allowed
      expect(isValidToolName('*')).toBe(false);
      expect(isValidToolName('server__*')).toBe(false);

      // Explicitly allowed
      expect(isValidToolName('*', { allowWildcards: true })).toBe(true);
      expect(isValidToolName('server__*', { allowWildcards: true })).toBe(true);

      // Invalid wildcards
      expect(isValidToolName('__*', { allowWildcards: true })).toBe(false);
      expect(isValidToolName('server__tool*', { allowWildcards: true })).toBe(
        false,
      );
    });
  });
});
