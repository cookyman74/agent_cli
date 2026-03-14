/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * E2E integration tests for DidimAdapter against real DidimAIStudio server.
 *
 * Requires environment variables:
 *   DIDIM_API_KEY     — JWT token
 *   DIDIM_SERVER_ADDRESS — server domain (e.g., aistudio.didim365.com)
 *
 * Run:
 *   DIDIM_API_KEY=... DIDIM_SERVER_ADDRESS=aistudio.didim365.com \
 *     npm test -w @didim365/agent-cli-core -- --run src/providers/didim/adapter.e2e.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { DidimAdapter } from './adapter.js';
import { LlmEventType } from '../events.js';
import type { LlmGenerateRequest } from '../types.js';
import type { AdapterConfig } from '../baseAdapter.js';

const API_KEY = process.env['DIDIM_API_KEY'] ?? '';
const SERVER_ADDRESS = process.env['DIDIM_SERVER_ADDRESS'] ?? '';

const isConfigured = API_KEY.length > 0 && SERVER_ADDRESS.length > 0;

function createRequest(text: string): LlmGenerateRequest {
  return {
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text }],
      },
    ],
    model: 'didim-default',
  } as unknown as LlmGenerateRequest;
}

const adapterConfig: AdapterConfig = {
  model: 'didim-default',
  maxOutputTokens: 8192,
  temperature: 0.7,
};

async function collectEvents(
  gen: AsyncGenerator<unknown>,
): Promise<Array<{ type: string; [key: string]: unknown }>> {
  const events: Array<{ type: string; [key: string]: unknown }> = [];
  for await (const event of gen) {
    events.push(event as { type: string; [key: string]: unknown });
  }
  return events;
}

describe.skipIf(!isConfigured)('DidimAdapter E2E', () => {
  let sseAdapter: DidimAdapter;
  let improvedAdapter: DidimAdapter;

  beforeAll(() => {
    sseAdapter = new DidimAdapter(
      adapterConfig,
      globalThis.fetch,
      API_KEY,
      SERVER_ADDRESS,
      'sse',
    );
    improvedAdapter = new DidimAdapter(
      adapterConfig,
      globalThis.fetch,
      API_KEY,
      SERVER_ADDRESS,
      'improved',
    );
  });

  // =========================================================================
  // E2E-06: 일반 채팅 (non-streaming)
  // =========================================================================

  describe('E2E-06: generateContent (non-streaming)', () => {
    it('should receive a response from invoke endpoint', async () => {
      const response = await sseAdapter.generateContent(
        createRequest('안녕하세요, 간단히 인사해주세요.'),
        'e2e-prompt-01',
      );

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.content.length).toBeGreaterThan(0);
      expect(response.content[0]?.type).toBe('text');
      expect(
        (response.content[0] as { text: string }).text.length,
      ).toBeGreaterThan(0);
      expect(response.stopReason).toBe('end_turn');
      expect(response.id).toMatch(/^didim-/);
    }, 30000);
  });

  // =========================================================================
  // E2E-07: SSE sse 모드
  // =========================================================================

  describe('E2E-07: generateContentStream (sse mode)', () => {
    it('should stream response via SSE', async () => {
      const events = await collectEvents(
        sseAdapter.generateContentStream(
          createRequest('hello, briefly greet me'),
          'e2e-prompt-02',
        ),
      );

      // Should have at least TextDelta + Finished + MessageEnd
      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      const finished = events.filter((e) => e.type === LlmEventType.Finished);
      const messageEnd = events.filter(
        (e) => e.type === LlmEventType.MessageEnd,
      );

      expect(textDeltas.length).toBeGreaterThanOrEqual(1);
      expect(finished).toHaveLength(1);
      expect(messageEnd).toHaveLength(1);

      // TextDelta should have non-empty text
      const firstDelta = textDeltas[0] as { text: string };
      expect(firstDelta.text.length).toBeGreaterThan(0);

      // Finished should have end_turn
      expect(finished[0]).toMatchObject({
        type: LlmEventType.Finished,
        finishReason: 'end_turn',
      });

      // No error events
      const errors = events.filter((e) => e.type === LlmEventType.Error);
      expect(errors).toHaveLength(0);
    }, 30000);
  });

  // =========================================================================
  // E2E-08: SSE improved 모드
  // =========================================================================

  describe('E2E-08: generateContentStream (improved mode)', () => {
    it('should stream token deltas and suppress final_message', async () => {
      const events = await collectEvents(
        improvedAdapter.generateContentStream(
          createRequest('hello, briefly greet me'),
          'e2e-prompt-03',
        ),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      const finished = events.filter((e) => e.type === LlmEventType.Finished);
      const messageEnd = events.filter(
        (e) => e.type === LlmEventType.MessageEnd,
      );

      // Improved mode should produce at least one token delta
      expect(textDeltas.length).toBeGreaterThanOrEqual(1);
      // Server sends both 'complete' and 'done' events → ≥1 Finished/MessageEnd
      expect(finished.length).toBeGreaterThanOrEqual(1);
      expect(messageEnd.length).toBeGreaterThanOrEqual(1);

      // Concatenated text should form a coherent response
      const fullText = textDeltas
        .map((d) => (d as { text: string }).text)
        .join('');
      expect(fullText.length).toBeGreaterThan(10);

      // No error events
      const errors = events.filter((e) => e.type === LlmEventType.Error);
      expect(errors).toHaveLength(0);
    }, 30000);

    it('should NOT produce duplicate text from final_message after deltas', async () => {
      const events = await collectEvents(
        improvedAdapter.generateContentStream(
          createRequest('say "hello world" exactly'),
          'e2e-prompt-04',
        ),
      );

      const textDeltas = events.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      const fullText = textDeltas
        .map((d) => (d as { text: string }).text)
        .join('');

      // The text should NOT contain duplicated content
      // If dedup is broken, fullText would contain the response twice
      // A rough check: the text should not be longer than 2x a reasonable response
      expect(fullText.length).toBeLessThan(2000);

      // More precise: count how many times the first delta appears
      const firstChunk = (textDeltas[0] as { text: string }).text;
      if (firstChunk.length > 5) {
        const occurrences = fullText.split(firstChunk).length - 1;
        expect(occurrences).toBe(1);
      }
    }, 30000);
  });

  // =========================================================================
  // E2E-09: thread_id 유지
  // =========================================================================

  describe('E2E-09: thread_id continuity', () => {
    it('should store thread_id and send it on subsequent requests', async () => {
      // Create a fresh adapter to ensure clean thread state
      const adapter = new DidimAdapter(
        adapterConfig,
        globalThis.fetch,
        API_KEY,
        SERVER_ADDRESS,
        'sse',
      );

      // First request — should receive thread_id
      const events1 = await collectEvents(
        adapter.generateContentStream(createRequest('hello'), 'e2e-thread-01'),
      );
      expect(events1.some((e) => e.type === LlmEventType.Finished)).toBe(true);

      // Second request — thread_id should be sent
      // (We can't directly observe the header, but the server should accept it)
      const events2 = await collectEvents(
        adapter.generateContentStream(
          createRequest('what did I just say?'),
          'e2e-thread-02',
        ),
      );

      const textDeltas2 = events2.filter(
        (e) => e.type === LlmEventType.TextDelta,
      );
      expect(textDeltas2.length).toBeGreaterThanOrEqual(1);
      expect(events2.some((e) => e.type === LlmEventType.Finished)).toBe(true);
    }, 60000);
  });

  // =========================================================================
  // E2E-10: 401 에러 처리
  // =========================================================================

  describe('E2E-10: authentication error handling', () => {
    it('should yield Error event for invalid JWT', async () => {
      const badAdapter = new DidimAdapter(
        adapterConfig,
        globalThis.fetch,
        'invalid-jwt-token',
        SERVER_ADDRESS,
        'sse',
      );

      const events = await collectEvents(
        badAdapter.generateContentStream(
          createRequest('test'),
          'e2e-auth-error',
        ),
      );

      const errors = events.filter((e) => e.type === LlmEventType.Error);
      expect(errors.length).toBeGreaterThanOrEqual(1);
    }, 30000);
  });
});
