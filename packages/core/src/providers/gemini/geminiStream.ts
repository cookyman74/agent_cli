/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Gemini stream processing pipeline combining EventMapper and StreamAssembler.
 *
 * Converts a raw Gemini event stream into provider-independent LlmEvents
 * while accumulating them into an AssembledMessage. Provides both real-time
 * event streaming and mid-stream state querying via the assembler.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.3
 */

import type { ServerGeminiStreamEvent } from './types.js';
import type { LlmEvent } from '../events.js';
import { GeminiEventMapper } from './eventMapper.js';
import { StreamAssembler, type AssembledMessage } from '../streamAssembler.js';

/**
 * Result of creating a Gemini stream processing pipeline.
 *
 * Provides both the converted event stream (for real-time consumption)
 * and the assembler instance (for mid-stream or post-stream state queries).
 */
export interface GeminiStreamPipeline {
  /** LlmEvent stream — yields converted events, returns AssembledMessage on completion */
  readonly stream: AsyncGenerator<LlmEvent, AssembledMessage, unknown>;
  /** StreamAssembler instance for mid-stream state queries (e.g., getText()) */
  readonly assembler: StreamAssembler;
}

/**
 * Creates a full Gemini stream processing pipeline.
 *
 * Converts each ServerGeminiStreamEvent to LlmEvent via EventMapper,
 * feeds it into StreamAssembler for accumulation, and yields the LlmEvent
 * for real-time consumption (loop detection, UI rendering, etc.).
 *
 * When the source stream completes, returns the AssembledMessage.
 *
 * @param geminiStream - Source Gemini event stream
 * @param options - Optional mapper and assembler instances (for testing/reuse)
 * @returns GeminiStreamPipeline with stream and assembler access
 *
 * @example
 * ```ts
 * const { stream, assembler } = createGeminiStreamPipeline(turnStream);
 *
 * for await (const event of stream) {
 *   // Real-time event handling (loop detection, UI, etc.)
 *   loopDetector.addAndCheck(event);
 * }
 *
 * const message = assembler.getAssembledMessage();
 * console.log(message.text);
 * ```
 */
export function createGeminiStreamPipeline(
  geminiStream: AsyncGenerator<ServerGeminiStreamEvent, void, unknown>,
  options?: {
    mapper?: GeminiEventMapper;
    assembler?: StreamAssembler;
  },
): GeminiStreamPipeline {
  const mapper = options?.mapper ?? new GeminiEventMapper();
  const assembler = options?.assembler ?? new StreamAssembler();

  async function* process(): AsyncGenerator<
    LlmEvent,
    AssembledMessage,
    unknown
  > {
    for await (const geminiEvent of geminiStream) {
      const llmEvent = mapper.toLlmEvent(geminiEvent);
      assembler.processEvent(llmEvent);
      yield llmEvent;
    }
    return assembler.getAssembledMessage();
  }

  return {
    stream: process(),
    assembler,
  };
}
