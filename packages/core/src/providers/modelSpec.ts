/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Model capability flags.
 *
 * Indicates what features a model supports.
 */
export interface ModelCapabilities {
  /** Supports streaming responses */
  streaming?: boolean;
  /** Supports image/vision input */
  vision?: boolean;
  /** Supports function/tool calling */
  toolUse?: boolean;
  /** Supports code execution */
  codeExecution?: boolean;
  /** Supports thinking/reasoning mode */
  thinking?: boolean;
  /** Supports JSON response format */
  jsonMode?: boolean;
  /** Supports structured output */
  structuredOutput?: boolean;
}

/**
 * Model specification and metadata.
 *
 * Contains information about a model including its capabilities,
 * context limits, and provider details.
 */
export interface ModelSpec {
  /** Model identifier (e.g., 'gemini-2.0-flash') */
  id: string;
  /** Human-readable model name */
  name: string;
  /** Provider identifier (e.g., 'gemini', 'openai', 'anthropic') */
  provider: string;
  /** Model capabilities */
  capabilities: ModelCapabilities;
  /** Maximum context window size in tokens */
  contextWindow?: number;
  /** Maximum output tokens */
  maxOutputTokens?: number;
  /** Model description */
  description?: string;
  /** Model aliases (alternative names) */
  aliases?: string[];
}

/**
 * Input for creating a model spec.
 */
export interface ModelSpecInput {
  id: string;
  name: string;
  provider: string;
  capabilities?: Partial<ModelCapabilities>;
  contextWindow?: number;
  maxOutputTokens?: number;
  description?: string;
  aliases?: string[];
}

/**
 * Default capabilities for models.
 */
const DEFAULT_CAPABILITIES: ModelCapabilities = {
  streaming: true,
  vision: false,
  toolUse: false,
  codeExecution: false,
  thinking: false,
  jsonMode: false,
  structuredOutput: false,
};

/**
 * Create a model specification with default values.
 *
 * @param input - Model specification input
 * @returns Complete model specification
 *
 * @example
 * ```ts
 * const spec = createModelSpec({
 *   id: 'gemini-2.0-flash',
 *   name: 'Gemini 2.0 Flash',
 *   provider: 'gemini',
 *   capabilities: { vision: true, toolUse: true }
 * });
 * ```
 */
export function createModelSpec(input: ModelSpecInput): ModelSpec {
  return {
    id: input.id,
    name: input.name,
    provider: input.provider,
    capabilities: {
      ...DEFAULT_CAPABILITIES,
      ...input.capabilities,
    },
    contextWindow: input.contextWindow,
    maxOutputTokens: input.maxOutputTokens,
    description: input.description,
    aliases: input.aliases,
  };
}

/**
 * Get default model specifications.
 *
 * Returns a list of pre-configured model specs for common models.
 *
 * @returns Array of model specifications
 */
export function getDefaultModelSpecs(): ModelSpec[] {
  return [
    createModelSpec({
      id: 'gemini-2.0-flash',
      name: 'Gemini 2.0 Flash',
      provider: 'gemini',
      capabilities: {
        streaming: true,
        vision: true,
        toolUse: true,
        codeExecution: true,
        thinking: true,
      },
      contextWindow: 1048576,
      maxOutputTokens: 8192,
      description: 'Fast, efficient model for most tasks',
    }),
    createModelSpec({
      id: 'gemini-2.5-pro-preview',
      name: 'Gemini 2.5 Pro Preview',
      provider: 'gemini',
      capabilities: {
        streaming: true,
        vision: true,
        toolUse: true,
        codeExecution: true,
        thinking: true,
      },
      contextWindow: 1048576,
      maxOutputTokens: 65536,
      description: 'Most capable Gemini model',
    }),
  ];
}

/**
 * Check if a model has a specific capability.
 *
 * @param spec - Model specification
 * @param capability - Capability name to check
 * @returns True if capability is enabled
 *
 * @example
 * ```ts
 * if (hasCapability(modelSpec, 'vision')) {
 *   // Model supports image input
 * }
 * ```
 */
export function hasCapability(
  spec: ModelSpec,
  capability: keyof ModelCapabilities,
): boolean {
  return spec.capabilities[capability] === true;
}

// Re-export types for convenience
export type { ModelSpec as ModelSpecType };
