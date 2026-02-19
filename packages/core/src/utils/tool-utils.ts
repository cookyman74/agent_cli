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
 * Fuzzy-matches a tool name against registered tool names.
 *
 * If exact match exists, returns it immediately.
 * Otherwise, finds the closest match using Levenshtein distance.
 * Auto-corrects only when:
 * - Distance ≤ 2 (typo threshold)
 * - Single unique candidate at minimum distance
 *
 * Server boundary protection: qualified names (containing '__') are only
 * matched against tools with the same server prefix.
 *
 * @returns The matched tool name, or null if no suitable match
 */
export function fuzzyMatchToolName(
  name: string,
  allToolNames: string[],
): string | null {
  if (!name || allToolNames.length === 0) return null;

  // Exact match — fast path
  if (allToolNames.includes(name)) return name;

  const MAX_DISTANCE = 2;

  // Server boundary protection: qualified name → filter by same prefix
  let candidates = allToolNames;
  if (name.includes('__')) {
    const separatorIndex = name.indexOf('__');
    const prefix = name.slice(0, separatorIndex);
    candidates = allToolNames.filter((t) => t.startsWith(prefix + '__'));
    if (candidates.length === 0) return null;
  }

  const matches = candidates
    .map((toolName) => ({
      name: toolName,
      distance: levenshtein.get(name, toolName),
    }))
    .filter((m) => m.distance <= MAX_DISTANCE)
    .sort((a, b) => a.distance - b.distance);

  if (matches.length === 0) return null;

  // Ambiguity check: top candidate must be strictly closer than second
  if (matches.length > 1 && matches[0].distance === matches[1].distance) {
    return null;
  }

  return matches[0].name;
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

// ============================================================================
// Parameter type coercion (sLM fault tolerance — Phase 5)
// ============================================================================

/**
 * Coerces parameter values to match the types declared in the JSON schema.
 *
 * Handles common sLM type mismatches:
 * - string "42" → number 42 (when schema expects 'number' or 'integer')
 * - string "true"/"false" → boolean (when schema expects 'boolean')
 * - number 42 → string "42" (when schema expects 'string')
 *
 * Rules:
 * - Only converts when the target type is unambiguous (single type in schema)
 * - Conversion failure (e.g., "abc" → number) → original value preserved
 * - Original args never mutated (shallow copy)
 * - No conversion for 'object' or 'array' types (too risky)
 */
export function coerceParamTypes(
  args: Record<string, unknown>,
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!schema) return args;

  const properties = (schema as { properties?: Record<string, unknown> })
    .properties;
  if (!properties) return args;

  let changed = false;
  const coerced = { ...args };

  for (const [key, value] of Object.entries(coerced)) {
    const propSchema = properties[key] as { type?: string } | undefined;
    if (!propSchema?.type || value === undefined || value === null) continue;

    const targetType = propSchema.type;
    const actualType = typeof value;

    // string → number/integer
    if (
      actualType === 'string' &&
      (targetType === 'number' || targetType === 'integer')
    ) {
      const strValue = value as string;
      if (strValue.trim() === '') continue; // 빈/공백 문자열 → 0 변환 방지

      const num = Number(strValue);
      if (
        !Number.isNaN(num) &&
        (targetType === 'number' || Number.isInteger(num))
      ) {
        coerced[key] = num;
        changed = true;
      }
    }
    // string → boolean
    else if (actualType === 'string' && targetType === 'boolean') {
      if (value === 'true') {
        coerced[key] = true;
        changed = true;
      } else if (value === 'false') {
        coerced[key] = false;
        changed = true;
      }
    }
    // number/boolean → string
    else if (
      (actualType === 'number' || actualType === 'boolean') &&
      targetType === 'string'
    ) {
      coerced[key] = String(value);
      changed = true;
    }
  }

  return changed ? coerced : args;
}

// ============================================================================
// Schema-based parameter normalization (MCP tools)
// ============================================================================

/**
 * Converts a camelCase string to snake_case.
 * e.g., 'filePath' → 'file_path', 'lineNumber' → 'line_number'
 */
function toSnakeCase(str: string): string {
  return str.replace(
    /[A-Z]/g,
    (letter, offset: number) =>
      (offset === 0 ? '' : '_') + letter.toLowerCase(),
  );
}

/**
 * Extracts merged properties and required keys from a JSON Schema.
 * Supports top-level properties and allOf composition.
 * Returns undefined if no properties are found.
 */
function extractSchemaInfo(
  schema: Record<string, unknown>,
): { properties: Record<string, unknown>; required: string[] } | undefined {
  type SchemaLike = {
    properties?: Record<string, unknown>;
    required?: unknown;
    allOf?: Array<Record<string, unknown>>;
  };
  const s = schema as SchemaLike;
  const mergedProperties: Record<string, unknown> = {};
  const mergedRequired: string[] = [];

  // Collect top-level properties
  if (s.properties) {
    Object.assign(mergedProperties, s.properties);
    if (Array.isArray(s.required)) {
      for (const r of s.required) {
        if (typeof r === 'string') mergedRequired.push(r);
      }
    }
  }

  // Collect allOf sub-schema properties (additive — merges with top-level)
  if (Array.isArray(s.allOf) && s.allOf.length > 0) {
    for (const sub of s.allOf) {
      const subSchema = sub as SchemaLike;
      if (subSchema.properties) {
        Object.assign(mergedProperties, subSchema.properties);
      }
      if (Array.isArray(subSchema.required)) {
        for (const r of subSchema.required) {
          if (typeof r === 'string') mergedRequired.push(r);
        }
      }
    }
  }

  if (Object.keys(mergedProperties).length > 0) {
    return { properties: mergedProperties, required: mergedRequired };
  }

  return undefined;
}

/**
 * Schema-based parameter normalization for MCP tools.
 *
 * Strategy (priority order):
 * 1. Exact match: arg name exists in schema → no change
 * 2. camelCase→snake_case: arg 'filePath' → schema 'file_path' → rename
 * 3. Suffix match: arg 'path' → schema 'file_path' (required param preferred)
 *
 * Rules:
 * - Canonical param already exists → no aliasing (protects correct calls)
 * - Original args never mutated (shallow copy)
 * - Ambiguous suffix matches skipped unless exactly one required candidate
 * - Supports top-level properties and allOf composition
 * - Gracefully handles malformed schema (non-array required, etc.)
 */
export function normalizeToolParamsBySchema(
  args: Record<string, unknown>,
  schema: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!schema) return args;

  const info = extractSchemaInfo(schema);
  if (!info) return args;

  const schemaKeys = new Set(Object.keys(info.properties));
  const requiredKeys = new Set(info.required);

  // Check if any normalization is needed
  const argKeys = Object.keys(args);
  const unknownKeys = argKeys.filter((k) => !schemaKeys.has(k));
  if (unknownKeys.length === 0) return args;

  const normalized = { ...args };

  for (const argKey of unknownKeys) {
    if (normalized[argKey] === undefined) continue;

    // Strategy 1: camelCase → snake_case exact match
    const snakeKey = toSnakeCase(argKey);
    if (
      snakeKey !== argKey &&
      schemaKeys.has(snakeKey) &&
      normalized[snakeKey] === undefined
    ) {
      normalized[snakeKey] = normalized[argKey];
      delete normalized[argKey];
      continue;
    }

    // Strategy 2: Suffix match (e.g., 'path' → 'file_path')
    const suffix = argKey; // The arg key itself is the suffix
    const candidates = [...schemaKeys].filter(
      (sk) => sk !== argKey && sk.endsWith(`_${suffix}`),
    );

    if (candidates.length === 1 && normalized[candidates[0]] === undefined) {
      // Unambiguous suffix match
      normalized[candidates[0]] = normalized[argKey];
      delete normalized[argKey];
    } else if (candidates.length > 1) {
      // Ambiguous — resolve ONLY when exactly one required candidate
      const requiredCandidates = candidates.filter((c) => requiredKeys.has(c));
      if (
        requiredCandidates.length === 1 &&
        normalized[requiredCandidates[0]] === undefined
      ) {
        normalized[requiredCandidates[0]] = normalized[argKey];
        delete normalized[argKey];
      }
      // else: skip (ambiguous — required 0개 또는 2개 이상이면 매핑하지 않음)
    }
  }

  return normalized;
}

// ============================================================================
// Static alias normalization (built-in tools)
// ============================================================================

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

  let changed = false;
  const normalized = { ...args };
  for (const [alias, canonical] of Object.entries(aliasMap)) {
    if (
      normalized[canonical] === undefined &&
      normalized[alias] !== undefined
    ) {
      normalized[canonical] = normalized[alias];
      delete normalized[alias];
      changed = true;
    }
  }
  return changed ? normalized : args;
}
