/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Stream-level conversion utilities for transforming Gemini event streams
 * to provider-independent LlmEvent streams.
 *
 * These utilities wrap the per-event GeminiEventMapper to provide
 * stream-level (AsyncGenerator) conversion, preserving backpressure
 * and optional return values.
 *
 * @see docs/ai_adapter/03-technical-design.md §3.3.3
 */

import type { ServerGeminiStreamEvent } from './types.js';
import type { LlmEvent, LlmEventStream } from '../events.js';
import { GeminiEventMapper } from './eventMapper.js';

/**
 * Converts a Gemini stream (AsyncGenerator of ServerGeminiStreamEvent)
 * to a provider-independent LlmEventStream.
 *
 * @param stream - Gemini event stream
 * @param mapper - Optional GeminiEventMapper instance (creates one if omitted)
 * @returns LlmEventStream (AsyncGenerator<LlmEvent, void, unknown>)
 */
export function convertGeminiStream(
  stream: AsyncGenerator<ServerGeminiStreamEvent, void, unknown>,
  mapper?: GeminiEventMapper,
): LlmEventStream {
  const eventMapper = mapper ?? new GeminiEventMapper();

  async function* convert(): LlmEventStream {
    for await (const geminiEvent of stream) {
      yield eventMapper.toLlmEvent(geminiEvent);
    }
  }

  return convert();
}

/**
 * Converts a Gemini stream to LlmEvent stream while preserving the
 * generator's return value.
 *
 * This is needed for cases like client.ts where the AsyncGenerator
 * returns a Turn object: `AsyncGenerator<ServerGeminiStreamEvent, Turn>`.
 * The return value must not be lost during conversion.
 *
 * @param stream - Gemini event stream with a return value
 * @param mapper - Optional GeminiEventMapper instance (creates one if omitted)
 * @returns AsyncGenerator<LlmEvent, TReturn, unknown>
 */
export function convertGeminiStreamWithReturn<TReturn>(
  stream: AsyncGenerator<ServerGeminiStreamEvent, TReturn, unknown>,
  mapper?: GeminiEventMapper,
): AsyncGenerator<LlmEvent, TReturn, unknown> {
  const eventMapper = mapper ?? new GeminiEventMapper();

  async function* convert(): AsyncGenerator<LlmEvent, TReturn, unknown> {
    // Manual iteration to capture the return value
    let result = await stream.next();
    while (!result.done) {
      yield eventMapper.toLlmEvent(result.value);
      result = await stream.next();
    }
    // Return the original generator's return value
    return result.value;
  }

  return convert();
}
