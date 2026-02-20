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
 * Note: For URL type, use the 'url' field. For base64 type, use the 'data' field.
 */
export interface LlmImageContent {
  type: 'image';
  source: LlmImageSource;
}

/**
 * Image source - either base64 encoded data or a URL.
 */
export type LlmImageSource =
  | { type: 'base64'; mediaType: string; data: string }
  | { type: 'url'; mediaType: string; url: string };

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
 * content can be a string or structured data (for compatibility with Part[] based results).
 */
export interface LlmToolResultContent {
  type: 'tool_result';
  toolCallId: string;
  name?: string; // Required by some providers (e.g., Gemini)
  content: string | Record<string, unknown>; // Extended from string-only for Part[] compatibility
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
 *
 * Provider-agnostic usage reporting.
 * Maps to GenAIUsageDetails (telemetry) and provider-specific usage types.
 */
export interface LlmTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
  /** Tokens used when creating a new cache entry (e.g. Anthropic prompt caching) */
  cacheCreationTokens?: number;
  /** Tokens used for extended thinking / chain-of-thought (Gemini thoughts, Claude thinking) */
  thoughtTokens?: number;
  /** Tokens used for tool call prompts */
  toolTokens?: number;
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

  /** Token usage statistics (optional - may not be available during streaming) */
  usage?: LlmTokenUsage;

  /** Rate-limit information from provider response headers */
  rateLimits?: import('./events.js').RateLimitInfo;

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
// Stream Types (use events.ts for detailed event types)
// NOTE: For detailed stream events (LlmEventType, LlmEvent, etc.), import from './events.js'
// This section provides simplified stream types for basic streaming scenarios.
// ============================================================================

/**
 * @deprecated Use LlmEventStream from events.ts instead.
 * Async generator type for streaming responses.
 */
export type LlmStream = AsyncGenerator<LlmStreamEvent, void, unknown>;

/**
 * @deprecated Use LlmEvent from events.ts instead.
 * Simplified stream event for basic content streaming.
 */
export interface LlmStreamEvent {
  type:
    | 'text_delta'
    | 'tool_call_delta'
    | 'thought_delta'
    | 'message_end'
    | 'error';
  delta?: LlmStreamDelta;
  usage?: LlmTokenUsage;
  error?: Error;
  metadata?: Record<string, unknown>;
  threadId?: string;
  qaId?: string;
}

/**
 * Stream event delta content.
 */
export interface LlmStreamDelta {
  text?: string;
  toolCall?: Partial<LlmToolCallContent>;
  thought?: string;
}

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
 * @deprecated Use GenerateOptions instead.
 * Options for content generation.
 */
export interface LlmGenerateOptions {
  signal?: AbortSignal;
  timeout?: number;
  traceId?: string;
}

/**
 * Configuration for adapter instantiation (API keys, endpoints, etc).
 */
export interface AdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  [key: string]: unknown;
}

/**
 * Options for a single generation request.
 */
export interface GenerateOptions {
  signal?: AbortSignal;
  timeout?: number;
  traceId?: string;
}

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

/**
 * Common interface for all LLM providers (provider-independent).
 *
 * NOTE: This is distinct from `core/contentGenerator.ts` which is the legacy
 * Gemini-specific interface using @google/genai types. This interface is
 * designed for multi-provider support with provider-independent types.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.2.1
 */
export interface ContentGenerator {
  readonly providerName: string;
  readonly capabilities: LlmProviderCapabilities;

  generateContent(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse>;

  generateContentStream(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): import('./events.js').LlmEventStream;

  countTokens(request: LlmGenerateRequest): Promise<LlmTokenCount>;

  /**
   * Embed content (optional). Providers that don't support embedding
   * should throw an UnsupportedFeatureError.
   */
  embedContent?(request: unknown): Promise<unknown>;
}

/**
 * Configuration for content generation (defaults/presets).
 */
export interface LlmGenerateConfig {
  provider: string; // Target provider identifier
  model: string; // Target model identifier
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stopSequences?: string[];
  responseFormat?: LlmResponseFormat;
  systemInstruction?: string;
  providerOptions?: Record<string, unknown>;
  [key: string]: unknown;
}

// NOTE: LlmTokenCount is defined above (lines 349-356). This duplicate removed.

// ============================================================================
// TODO: Embedding Types (M1.3 or Phase 2)
// ============================================================================

/**
 * TODO: LlmEmbedRequest - embedContent API 지원용
 * TODO: LlmEmbedResponse - embedContent API 응답용
 * @see docs/ai_adapter/03-technical-design.md §3.2.1
 */
