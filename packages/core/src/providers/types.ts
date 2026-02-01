/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Provider-independent type system for multi-LLM support.
 *
 * These types abstract away provider-specific details (Gemini, Claude, OpenAI, vLLM)
 * to enable a unified interface for the Gemini CLI.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.1
 */

// ============================================================================
// Role & Content Types
// ============================================================================

/**
 * Message role types supported across all providers.
 */
export type LlmRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Text content block.
 */
export interface LlmTextContent {
  type: 'text';
  text: string;
}

/**
 * Image content block with support for base64 and URL sources.
 */
export interface LlmImageContent {
  type: 'image';
  source: {
    type: 'base64' | 'url';
    mediaType: string;
    data: string;
  };
}

/**
 * Tool call content block - represents a function call request.
 */
export interface LlmToolCallContent {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Tool result content block - represents a function call response.
 */
export interface LlmToolResultContent {
  type: 'tool_result';
  toolCallId: string;
  name?: string; // Required by some providers (e.g., Gemini)
  content: string;
  isError?: boolean;
}

/**
 * Thought content block - represents reasoning/planning output.
 * Supported by Gemini's thinking mode and Claude's extended thinking.
 */
export interface LlmThoughtContent {
  type: 'thought';
  thought: string;
  metadata?: {
    step?: number;
    phase?: string; // 'planning' | 'reasoning' | 'reflection'
    provider?: string;
    [key: string]: unknown;
  };
}

/**
 * Union type for all content block types.
 */
export type LlmContent =
  | LlmTextContent
  | LlmImageContent
  | LlmToolCallContent
  | LlmToolResultContent
  | LlmThoughtContent;

/**
 * A single message in a conversation.
 */
export interface LlmMessage {
  role: LlmRole;
  content: LlmContent[];
  name?: string; // Tool name when role is 'tool'
  toolCallId?: string; // Tool call ID when role is 'tool'
}

// ============================================================================
// Request Types
// ============================================================================

/**
 * Tool choice options for controlling tool usage.
 */
export type LlmToolChoice = 'auto' | 'none' | 'required' | { name: string };

/**
 * Response format options.
 */
export type LlmResponseFormat = 'text' | 'json';

/**
 * Content generation request.
 */
export interface LlmGenerateRequest {
  /** Model identifier (e.g., 'gemini-2.0-flash', 'claude-3-sonnet') */
  model: string;

  /** Conversation messages */
  messages: LlmMessage[];

  /** System instruction (prepended to conversation) */
  systemInstruction?: string;

  /** Available tools/functions */
  tools?: LlmToolDefinition[];

  /** Tool usage behavior */
  toolChoice?: LlmToolChoice;

  /** Sampling temperature (0.0 - 2.0) */
  temperature?: number;

  /** Maximum output tokens */
  maxTokens?: number;

  /** Stop sequences */
  stopSequences?: string[];

  /** Top-p sampling */
  topP?: number;

  /** Top-k sampling */
  topK?: number;

  /** Response format */
  responseFormat?: LlmResponseFormat;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Reasons why generation stopped.
 */
export type LlmStopReason =
  | 'end_turn' // Normal completion
  | 'max_tokens' // Token limit reached
  | 'stop_sequence' // Stop sequence encountered
  | 'tool_use' // Tool call required
  | 'content_filter' // Content filtered
  | 'error'; // Error occurred

/**
 * Token usage statistics.
 */
export interface LlmTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}

/**
 * Content generation response.
 */
export interface LlmGenerateResponse {
  /** Response ID (provider-generated or random UUID) */
  id: string;

  /** Generated content */
  content: LlmContent[];

  /** Model that generated the response */
  model: string;

  /** Reason for stopping */
  stopReason: LlmStopReason;

  /** Token usage statistics */
  usage: LlmTokenUsage;

  /** Raw provider response (for debugging) */
  rawResponse?: unknown;
}

// ============================================================================
// Tool Definition Types
// ============================================================================

/**
 * Property types supported in tool parameters.
 */
export type LlmToolPropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'array'
  | 'object';

/**
 * Tool parameter property definition.
 */
export interface LlmToolProperty {
  type: LlmToolPropertyType;
  description?: string;
  enum?: string[];
  items?: LlmToolProperty; // For array type
  properties?: Record<string, LlmToolProperty>; // For object type
}

/**
 * Tool parameters schema (JSON Schema subset).
 */
export interface LlmToolParameters {
  type: 'object';
  properties: Record<string, LlmToolProperty>;
  required?: string[];
}

/**
 * Tool/function definition.
 */
export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: LlmToolParameters;
}

// ============================================================================
// Stream Event Types
// ============================================================================

/**
 * Stream event types.
 */
export type LlmStreamEventType =
  | 'content_delta' // Text chunk
  | 'tool_call_delta' // Tool call chunk
  | 'thought_delta' // Thought/reasoning chunk
  | 'message_end' // Message complete
  | 'error'; // Error occurred

/**
 * Stream event delta content.
 */
export interface LlmStreamDelta {
  text?: string;
  toolCall?: Partial<LlmToolCallContent>;
  thought?: string;
}

/**
 * Streaming event from content generation.
 */
export interface LlmStreamEvent {
  type: LlmStreamEventType;
  delta?: LlmStreamDelta;
  usage?: LlmTokenUsage;
  error?: Error;

  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;

  /** Didim integration: conversation tracking */
  threadId?: string;
  qaId?: string;
}

/**
 * Async generator type for streaming responses.
 */
export type LlmStream = AsyncGenerator<LlmStreamEvent, void, unknown>;

// ============================================================================
// Provider Capabilities
// ============================================================================

/**
 * Provider capability flags.
 */
export interface LlmProviderCapabilities {
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsImageInput: boolean;
  supportsImageGeneration: boolean;
  supportsEmbedding: boolean;
  supportsTokenCount: boolean;
  supportsSystemMessage: boolean;
  supportsThought: boolean; // Extended thinking / reasoning
  maxContextLength: number;
  maxOutputTokens: number;
}

// ============================================================================
// Generate Options
// ============================================================================

/**
 * Options for content generation.
 */
export interface LlmGenerateOptions {
  signal?: AbortSignal;
  timeout?: number;
  traceId?: string;
}

// ============================================================================
// Token Count Types
// ============================================================================

/**
 * Token count result.
 */
export interface LlmTokenCount {
  totalTokens: number;
  breakdown?: {
    messages: number;
    tools: number;
    system: number;
  };
}
