/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AnyDeclarativeTool, AnyToolInvocation } from '../index.js';
import { isTool } from '../index.js';
import { SHELL_TOOL_NAMES } from './shell-utils.js';
import levenshtein from 'fast-levenshtein';

/**
 * Generates a suggestion string for a tool name that was not found in the registry.
 * It finds the closest matches based on Levenshtein distance.
 * @param unknownToolName The tool name that was not found.
 * @param allToolNames The list of all available tool names.
 * @param topN The number of suggestions to return. Defaults to 3.
 * @returns A suggestion string like " Did you mean 'tool'?" or " Did you mean one of: 'tool1', 'tool2'?", or an empty string if no suggestions are found.
 */
export function getToolSuggestion(
  unknownToolName: string,
  allToolNames: string[],
  topN = 3,
): string {
  const matches = allToolNames.map((toolName) => ({
    name: toolName,
    distance: levenshtein.get(unknownToolName, toolName),
  }));

  matches.sort((a, b) => a.distance - b.distance);

  const topNResults = matches.slice(0, topN);

  if (topNResults.length === 0) {
    return '';
  }

  const suggestedNames = topNResults
    .map((match) => `"${match.name}"`)
    .join(', ');

  if (topNResults.length > 1) {
    return ` Did you mean one of: ${suggestedNames}?`;
  } else {
    return ` Did you mean ${suggestedNames}?`;
  }
}

/**
 * Checks if a tool invocation matches any of a list of patterns.
 *
 * @param toolOrToolName The tool object or the name of the tool being invoked.
 * @param invocation The invocation object for the tool or the command invoked.
 * @param patterns A list of patterns to match against.
 *   Patterns can be:
 *   - A tool name (e.g., "ReadFileTool") to match any invocation of that tool.
 *   - A tool name with a prefix (e.g., "ShellTool(git status)") to match
 *     invocations where the arguments start with that prefix.
 * @returns True if the invocation matches any pattern, false otherwise.
 */
export function doesToolInvocationMatch(
  toolOrToolName: AnyDeclarativeTool | string,
  invocation: AnyToolInvocation | string,
  patterns: string[],
): boolean {
  let toolNames: string[];
  if (isTool(toolOrToolName)) {
    toolNames = [toolOrToolName.name, toolOrToolName.constructor.name];
  } else {
    toolNames = [toolOrToolName];
  }

  if (toolNames.some((name) => SHELL_TOOL_NAMES.includes(name))) {
    toolNames = [...new Set([...toolNames, ...SHELL_TOOL_NAMES])];
  }

  for (const pattern of patterns) {
    const openParen = pattern.indexOf('(');

    if (openParen === -1) {
      // No arguments, just a tool name
      if (toolNames.includes(pattern)) {
        return true;
      }
      continue;
    }

    const patternToolName = pattern.substring(0, openParen);
    if (!toolNames.includes(patternToolName)) {
      continue;
    }

    if (!pattern.endsWith(')')) {
      continue;
    }

    const argPattern = pattern.substring(openParen + 1, pattern.length - 1);

    let command: string;
    if (typeof invocation === 'string') {
      command = invocation;
    } else {
      if (!('command' in invocation.params)) {
        // This invocation has no command - nothing to check.
        continue;
      }
      command = String((invocation.params as { command: string }).command);
    }

    if (toolNames.some((name) => SHELL_TOOL_NAMES.includes(name))) {
      if (command === argPattern || command.startsWith(argPattern + ' ')) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// Tool parameter alias normalization
// ============================================================================

/**
 * Maps tool API names to their parameter alias normalization rules.
 * Each entry maps an alias name (sent by non-Gemini LLMs) to the canonical
 * parameter name expected by the tool's JSON schema.
 *
 * Non-Gemini models (OpenAI, Claude) may send alternative parameter names
 * on their first tool call (e.g., 'path' instead of 'file_path') because
 * of training data conventions. This map enables transparent normalization
 * before AJV schema validation.
 */
const TOOL_PARAM_ALIASES: Record<string, Record<string, string>> = {
  read_file: {
    path: 'file_path',
    filepath: 'file_path',
    filePath: 'file_path',
    file: 'file_path',
  },
  search_file_content: {
    query: 'pattern',
    search_query: 'pattern',
    regex: 'pattern',
    search: 'pattern',
    // dir_path aliases — optional param, silent failure if ignored
    path: 'dir_path',
    directory: 'dir_path',
    dirPath: 'dir_path',
    dir: 'dir_path',
  },
  list_directory: {
    path: 'dir_path',
    directory: 'dir_path',
    dirPath: 'dir_path',
    dir: 'dir_path',
  },
  glob: {
    glob_pattern: 'pattern',
    search_pattern: 'pattern',
    // dir_path aliases — optional param, silent failure if ignored
    path: 'dir_path',
    directory: 'dir_path',
    dirPath: 'dir_path',
    dir: 'dir_path',
  },
  write_file: {
    path: 'file_path',
    filepath: 'file_path',
    filePath: 'file_path',
  },
  replace: {
    path: 'file_path',
    filepath: 'file_path',
    filePath: 'file_path',
    // old_string / new_string aliases — required params
    old_text: 'old_string',
    oldText: 'old_string',
    original: 'old_string',
    original_string: 'old_string',
    new_text: 'new_string',
    newText: 'new_string',
    replacement: 'new_string',
    replacement_string: 'new_string',
    // instruction aliases
    description: 'instruction',
    reason: 'instruction',
    change_description: 'instruction',
  },
  run_shell_command: {
    cmd: 'command',
    shell_command: 'command',
  },
  google_web_search: {
    search_query: 'query',
    search: 'query',
    q: 'query',
  },
  web_fetch: {
    url: 'prompt',
    input: 'prompt',
    request: 'prompt',
  },
  read_many_files: {
    files: 'include',
    paths: 'include',
    file_paths: 'include',
    patterns: 'include',
    glob_patterns: 'include',
  },
  get_internal_docs: {
    file_path: 'path',
    filepath: 'path',
    filePath: 'path',
    doc_path: 'path',
  },
};

/**
 * Normalizes tool parameter names by applying known aliases.
 *
 * Rules:
 * - If the canonical parameter already exists in args, no aliasing occurs
 *   (protects correct calls from Gemini or properly-learned non-Gemini models)
 * - If an alias is found AND the canonical param is missing, the alias value
 *   is moved to the canonical key
 * - The original alias key is removed to avoid AJV additionalProperties errors
 * - If the tool has no alias rules, args are returned unchanged (reference identity)
 * - Original args object is never mutated (shallow copy)
 *
 * @param toolName The API name of the tool (e.g., 'read_file')
 * @param args The raw arguments from the LLM
 * @returns A new args object with normalized parameter names, or the original if unchanged
 */
export function normalizeToolParams(
  toolName: string,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const aliasMap = TOOL_PARAM_ALIASES[toolName];
  if (!aliasMap) {
    return args;
  }

  const normalized = { ...args };
  for (const [alias, canonical] of Object.entries(aliasMap)) {
    if (
      normalized[canonical] === undefined &&
      normalized[alias] !== undefined
    ) {
      normalized[canonical] = normalized[alias];
      delete normalized[alias];
    }
  }
  return normalized;
}
