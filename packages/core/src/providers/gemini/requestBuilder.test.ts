/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  buildLlmRequestFromGeminiState,
  convertGeminiToolsToLlm,
  reconcileFunctionCallIds,
} from './requestBuilder.js';
import { Type } from '@google/genai';
import type { Content, GenerateContentConfig, Tool } from '@google/genai';

describe('requestBuilder', () => {
  // ============================================================================
  // convertGeminiToolsToLlm — Gemini Tool[] → LlmToolDefinition[]
  // ============================================================================

  describe('convertGeminiToolsToLlm', () => {
    it('should return empty array for empty tools', () => {
      expect(convertGeminiToolsToLlm([])).toEqual([]);
    });

    it('should return empty array for tools without functionDeclarations', () => {
      const tools: Tool[] = [{}];
      expect(convertGeminiToolsToLlm(tools)).toEqual([]);
    });

    it('should convert a single tool with function declaration', () => {
      const tools: Tool[] = [
        {
          functionDeclarations: [
            {
              name: 'read_file',
              description: 'Read a file',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  path: { type: Type.STRING, description: 'File path' },
                },
                required: ['path'],
              },
            },
          ],
        },
      ];

      const result = convertGeminiToolsToLlm(tools);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: 'read_file',
        description: 'Read a file',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
          },
          required: ['path'],
        },
      });
    });

    it('should convert multiple function declarations across Tool entries', () => {
      const tools: Tool[] = [
        {
          functionDeclarations: [
            {
              name: 'tool_a',
              description: 'Tool A',
              parameters: {
                type: Type.OBJECT,
                properties: {},
              },
            },
            {
              name: 'tool_b',
              description: 'Tool B',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  count: { type: Type.NUMBER },
                },
                required: ['count'],
              },
            },
          ],
        },
      ];

      const result = convertGeminiToolsToLlm(tools);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('tool_a');
      expect(result[1].name).toBe('tool_b');
    });

    it('should handle nested object properties', () => {
      const tools: Tool[] = [
        {
          functionDeclarations: [
            {
              name: 'complex_tool',
              description: 'Complex',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  config: {
                    type: Type.OBJECT,
                    properties: {
                      enabled: { type: Type.BOOLEAN },
                    },
                  },
                  tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
              },
            },
          ],
        },
      ];

      const result = convertGeminiToolsToLlm(tools);
      expect(result[0].parameters.properties['config']).toEqual({
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
        },
      });
      expect(result[0].parameters.properties['tags']).toEqual({
        type: 'array',
        items: { type: 'string' },
      });
    });

    it('should default missing description to empty string', () => {
      const tools: Tool[] = [
        {
          functionDeclarations: [
            {
              name: 'no_desc',
              parameters: {
                type: Type.OBJECT,
                properties: {},
              },
            },
          ],
        },
      ];

      const result = convertGeminiToolsToLlm(tools);
      expect(result[0].description).toBe('');
    });
  });

  // ============================================================================
  // buildLlmRequestFromGeminiState — full request assembly
  // ============================================================================

  describe('buildLlmRequestFromGeminiState', () => {
    it('should build minimal request with model and empty history', () => {
      const result = buildLlmRequestFromGeminiState({
        model: 'claude-3-sonnet',
        history: [],
        currentRequest: [{ text: 'Hello' }],
      });

      expect(result.model).toBe('claude-3-sonnet');
      expect(result.messages).toHaveLength(1); // current request only
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toEqual([
        { type: 'text', text: 'Hello' },
      ]);
    });

    it('should include history messages before current request', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hi' }] },
        { role: 'model', parts: [{ text: 'Hello!' }] },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [{ text: 'How are you?' }],
      });

      expect(result.messages).toHaveLength(3);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[2].role).toBe('user');
    });

    it('should set systemInstruction', () => {
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
        systemInstruction: 'You are a helpful assistant.',
      });

      expect(result.systemInstruction).toBe('You are a helpful assistant.');
    });

    it('should map config temperature', () => {
      const config: GenerateContentConfig = { temperature: 0.7 };
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
        config,
      });

      expect(result.temperature).toBe(0.7);
    });

    it('should map config maxOutputTokens to maxTokens', () => {
      const config: GenerateContentConfig = { maxOutputTokens: 1024 };
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
        config,
      });

      expect(result.maxTokens).toBe(1024);
    });

    it('should map config topP and stopSequences', () => {
      const config: GenerateContentConfig = {
        topP: 0.9,
        stopSequences: ['END', 'STOP'],
      };
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
        config,
      });

      expect(result.topP).toBe(0.9);
      expect(result.stopSequences).toEqual(['END', 'STOP']);
    });

    it('should map config topK', () => {
      const config: GenerateContentConfig = { topK: 40 };
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
        config,
      });

      expect(result.topK).toBe(40);
    });

    it('should convert tools when provided', () => {
      const tools: Tool[] = [
        {
          functionDeclarations: [
            {
              name: 'search',
              description: 'Search the web',
              parameters: {
                type: Type.OBJECT,
                properties: {
                  query: { type: Type.STRING, description: 'Search query' },
                },
                required: ['query'],
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
        tools,
      });

      expect(result.tools).toHaveLength(1);
      expect(result.tools![0].name).toBe('search');
    });

    it('should not include undefined optional fields', () => {
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: [{ text: 'test' }],
      });

      expect(result.systemInstruction).toBeUndefined();
      expect(result.tools).toBeUndefined();
      expect(result.temperature).toBeUndefined();
      expect(result.maxTokens).toBeUndefined();
      expect(result.topP).toBeUndefined();
      expect(result.topK).toBeUndefined();
      expect(result.stopSequences).toBeUndefined();
    });

    it('should handle string currentRequest', () => {
      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history: [],
        currentRequest: 'Hello world',
      });

      const lastMsg = result.messages[result.messages.length - 1];
      expect(lastMsg.content).toEqual([{ type: 'text', text: 'Hello world' }]);
    });

    it('should handle history with tool calls and tool results', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Search for cats' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-search-1',
                name: 'search',
                args: { q: 'cats' },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call-search-1',
                name: 'search',
                response: { result: 'Found cats' },
              },
            },
          ],
        },
        { role: 'model', parts: [{ text: 'I found cats!' }] },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history,
        currentRequest: [{ text: 'More details' }],
      });

      expect(result.messages).toHaveLength(5);
      // tool call message
      const toolCallMsg = result.messages[1];
      expect(toolCallMsg.role).toBe('assistant');
      expect(toolCallMsg.content[0].type).toBe('tool_call');
      // tool result message — fixToolResultRoles converts role:'user' → 'tool'
      const toolResultMsg = result.messages[2];
      expect(toolResultMsg.role).toBe('tool');
      expect(toolResultMsg.content[0].type).toBe('tool_result');
    });

    it('should preserve callId through functionCall.id and functionResponse.id', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Do something' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-abc-123',
                name: 'my_tool',
                args: { x: 1 },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'call-abc-123',
                name: 'my_tool',
                response: { output: 'done' },
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'test',
        history,
        currentRequest: [{ text: 'Next' }],
      });

      // tool_call should have id preserved
      const toolCallContent = result.messages[1].content[0];
      expect(toolCallContent.type).toBe('tool_call');
      if (toolCallContent.type === 'tool_call') {
        expect(toolCallContent.id).toBe('call-abc-123');
      }

      // tool_result should have toolCallId preserved and role fixed to 'tool'
      expect(result.messages[2].role).toBe('tool');
      const toolResultContent = result.messages[2].content[0];
      expect(toolResultContent.type).toBe('tool_result');
      if (toolResultContent.type === 'tool_result') {
        expect(toolResultContent.toolCallId).toBe('call-abc-123');
      }
    });

    it('should convert functionResponse in currentRequest to role:tool', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Do something' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-xyz-789',
                name: 'run_tool',
                args: { input: 'test' },
              },
            },
          ],
        },
      ];

      // currentRequest contains a tool response (functionResponse)
      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [
          {
            functionResponse: {
              id: 'call-xyz-789',
              name: 'run_tool',
              response: { output: 'result' },
            },
          },
        ],
      });

      // The last message (currentRequest) should be role:'tool', not 'user'
      const lastMsg = result.messages[result.messages.length - 1];
      expect(lastMsg.role).toBe('tool');
      expect(lastMsg.content[0].type).toBe('tool_result');
      if (lastMsg.content[0].type === 'tool_result') {
        expect(lastMsg.content[0].toolCallId).toBe('call-xyz-789');
      }
    });

    it('should split multiple functionResponses into individual tool-role messages', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Do both' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'call-1',
                name: 'tool_a',
                args: {},
              },
            },
            {
              functionCall: {
                id: 'call-2',
                name: 'tool_b',
                args: {},
              },
            },
          ],
        },
      ];

      // currentRequest contains two tool responses
      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [
          {
            functionResponse: {
              id: 'call-1',
              name: 'tool_a',
              response: { result: 'a' },
            },
          },
          {
            functionResponse: {
              id: 'call-2',
              name: 'tool_b',
              response: { result: 'b' },
            },
          },
        ],
      });

      // fixToolResultRoles splits multi-tool_result user messages into individual tool messages
      const toolMsgs = result.messages.filter((m) => m.role === 'tool');
      expect(toolMsgs).toHaveLength(2);
      expect(toolMsgs[0].content[0].type).toBe('tool_result');
      expect(toolMsgs[1].content[0].type).toBe('tool_result');
    });

    it('should keep text-only currentRequest as role:user (regression)', () => {
      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history: [],
        currentRequest: [{ text: 'Hello' }],
      });

      // Plain text message should remain role:'user'
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
    });
  });

  // ============================================================================
  // Provider switching: Gemini history → non-Gemini request (ID reconciliation)
  // ============================================================================
  describe('functionCall/functionResponse ID reconciliation', () => {
    it('should reconcile when functionCall.id is undefined but functionResponse.id is set', () => {
      // Gemini native path: functionCall.id is undefined (Gemini API doesn't set it),
      // but functionResponse.id is set by Turn.handlePendingFunctionCall via crypto.randomUUID()
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'List files' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                // id is undefined — Gemini API didn't set it
                name: 'list_directory',
                args: { dir_path: '/tmp' },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'uuid-from-turn-handler',
                name: 'list_directory',
                response: { output: 'file1.txt' },
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [{ text: 'What did you find?' }],
      });

      // The tool_call should use the functionResponse's id (not a random UUID)
      const assistantMsg = result.messages[1];
      expect(assistantMsg.role).toBe('assistant');
      const toolCallContent = assistantMsg.content[0];
      expect(toolCallContent.type).toBe('tool_call');
      if (toolCallContent.type === 'tool_call') {
        expect(toolCallContent.id).toBe('uuid-from-turn-handler');
      }

      // The tool_result should have matching id and role:'tool'
      const toolMsg = result.messages[2];
      expect(toolMsg.role).toBe('tool');
      const toolResultContent = toolMsg.content[0];
      if (toolResultContent.type === 'tool_result') {
        expect(toolResultContent.toolCallId).toBe('uuid-from-turn-handler');
      }
    });

    it('should reconcile when both functionCall.id and functionResponse.id are undefined', () => {
      // Both IDs missing — generate a consistent ID for the pair
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Do something' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'shell',
                args: { command: 'ls' },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: 'shell',
                response: { output: 'result' },
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [{ text: 'Next' }],
      });

      // Both should have the same generated ID
      const assistantMsg = result.messages[1];
      const toolCallContent = assistantMsg.content[0];
      expect(toolCallContent.type).toBe('tool_call');

      const toolMsg = result.messages[2];
      expect(toolMsg.role).toBe('tool');
      const toolResultContent = toolMsg.content[0];
      expect(toolResultContent.type).toBe('tool_result');

      if (
        toolCallContent.type === 'tool_call' &&
        toolResultContent.type === 'tool_result'
      ) {
        // IDs must match each other
        expect(toolCallContent.id).toBe(toolResultContent.toolCallId);
        // IDs must be non-empty
        expect(toolCallContent.id.length).toBeGreaterThan(0);
      }
    });

    it('should reconcile multiple tool calls with missing IDs', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Do both' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'tool_a',
                args: {},
              },
            },
            {
              functionCall: {
                name: 'tool_b',
                args: {},
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'resp-id-a',
                name: 'tool_a',
                response: { result: 'a' },
              },
            },
            {
              functionResponse: {
                id: 'resp-id-b',
                name: 'tool_b',
                response: { result: 'b' },
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [{ text: 'Next' }],
      });

      const assistantMsg = result.messages[1];
      expect(assistantMsg.content).toHaveLength(2);

      const toolMsgs = result.messages.filter((m) => m.role === 'tool');
      expect(toolMsgs).toHaveLength(2);

      // Each tool_call ID should match corresponding tool_result toolCallId
      if (
        assistantMsg.content[0].type === 'tool_call' &&
        toolMsgs[0].content[0].type === 'tool_result'
      ) {
        expect(assistantMsg.content[0].id).toBe('resp-id-a');
        expect(toolMsgs[0].content[0].toolCallId).toBe('resp-id-a');
      }
      if (
        assistantMsg.content[1].type === 'tool_call' &&
        toolMsgs[1].content[0].type === 'tool_result'
      ) {
        expect(assistantMsg.content[1].id).toBe('resp-id-b');
        expect(toolMsgs[1].content[0].toolCallId).toBe('resp-id-b');
      }
    });

    it('should not modify history when functionCall.id is already set', () => {
      // When IDs are already consistent, nothing should change
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hi' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'existing-id',
                name: 'my_tool',
                args: {},
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'existing-id',
                name: 'my_tool',
                response: { output: 'ok' },
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [{ text: 'Next' }],
      });

      const assistantMsg = result.messages[1];
      if (assistantMsg.content[0].type === 'tool_call') {
        expect(assistantMsg.content[0].id).toBe('existing-id');
      }
    });

    // ---- Issue #1: Mixed case — first call has ID, second doesn't ----
    it('should correctly match when first functionCall has ID and second does not', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Do both' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'id-a', // ← already has ID
                name: 'tool_a',
                args: {},
              },
            },
            {
              functionCall: {
                // id is undefined ← needs reconciliation
                name: 'tool_b',
                args: {},
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'id-a',
                name: 'tool_a',
                response: { result: 'a' },
              },
            },
            {
              functionResponse: {
                id: 'id-b',
                name: 'tool_b',
                response: { result: 'b' },
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [{ text: 'Next' }],
      });

      const assistantMsg = result.messages[1];
      expect(assistantMsg.content).toHaveLength(2);

      // First tool_call should keep its existing 'id-a'
      if (assistantMsg.content[0].type === 'tool_call') {
        expect(assistantMsg.content[0].id).toBe('id-a');
      }
      // Second tool_call should get 'id-b' from matching functionResponse (NOT 'id-a')
      if (assistantMsg.content[1].type === 'tool_call') {
        expect(assistantMsg.content[1].id).toBe('id-b');
      }

      const toolMsgs = result.messages.filter((m) => m.role === 'tool');
      expect(toolMsgs).toHaveLength(2);
      if (toolMsgs[0].content[0].type === 'tool_result') {
        expect(toolMsgs[0].content[0].toolCallId).toBe('id-a');
      }
      if (toolMsgs[1].content[0].type === 'tool_result') {
        expect(toolMsgs[1].content[0].toolCallId).toBe('id-b');
      }
    });

    // ---- Issue #2: Name-based fallback when response order differs ----
    it('should use name-based matching when response order differs from call order', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Do both' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'tool_a',
                args: {},
              },
            },
            {
              functionCall: {
                name: 'tool_b',
                args: {},
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              // Response order is swapped vs call order
              functionResponse: {
                id: 'id-b',
                name: 'tool_b',
                response: { result: 'b' },
              },
            },
            {
              functionResponse: {
                id: 'id-a',
                name: 'tool_a',
                response: { result: 'a' },
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [{ text: 'Next' }],
      });

      const assistantMsg = result.messages[1];
      // tool_a call should get id-a (by name), not id-b (by position)
      if (assistantMsg.content[0].type === 'tool_call') {
        expect(assistantMsg.content[0].id).toBe('id-a');
        expect(assistantMsg.content[0].name).toBe('tool_a');
      }
      // tool_b call should get id-b (by name)
      if (assistantMsg.content[1].type === 'tool_call') {
        expect(assistantMsg.content[1].id).toBe('id-b');
        expect(assistantMsg.content[1].name).toBe('tool_b');
      }
    });

    // ---- Issue #3: Non-adjacent functionResponse (intervening content) ----
    it('should find functionResponse even when not immediately after functionCall', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Do it' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'my_tool',
                args: {},
              },
            },
          ],
        },
        // Intervening user content (e.g., from history compression/reconstruction)
        { role: 'user', parts: [{ text: 'intermediate message' }] },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'fr-id',
                name: 'my_tool',
                response: { output: 'ok' },
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [{ text: 'Next' }],
      });

      const assistantMsg = result.messages.find((m) => m.role === 'assistant');
      expect(assistantMsg).toBeDefined();
      if (assistantMsg?.content[0].type === 'tool_call') {
        expect(assistantMsg.content[0].id).toBe('fr-id');
      }
    });

    // ---- Issue #4: Early return optimization ----
    it('should return same reference when no reconciliation is needed', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hi' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'already-set',
                name: 'my_tool',
                args: {},
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'already-set',
                name: 'my_tool',
                response: {},
              },
            },
          ],
        },
      ];

      const result = reconcileFunctionCallIds(history);

      // Should return the same array reference (no clone) when no reconciliation needed
      expect(result).toBe(history);
    });

    // ---- Review #2 Issue #1: Same-name calls, mixed IDs, swapped response order ----
    it('should not produce duplicate tool_call IDs when same-name calls have mixed IDs', () => {
      // call[0] has id-a, call[1] has no id — both named 'tool_x'
      // responses are in swapped order: [id-b, id-a]
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Go' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                id: 'id-a',
                name: 'tool_x',
                args: { n: 1 },
              },
            },
            {
              functionCall: {
                // id is undefined
                name: 'tool_x',
                args: { n: 2 },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'id-b',
                name: 'tool_x',
                response: { r: 2 },
              },
            },
            {
              functionResponse: {
                id: 'id-a',
                name: 'tool_x',
                response: { r: 1 },
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [{ text: 'Next' }],
      });

      const assistantMsg = result.messages[1];
      expect(assistantMsg.content).toHaveLength(2);

      // call[0] keeps id-a, call[1] must get id-b (NOT id-a)
      if (assistantMsg.content[0].type === 'tool_call') {
        expect(assistantMsg.content[0].id).toBe('id-a');
      }
      if (assistantMsg.content[1].type === 'tool_call') {
        expect(assistantMsg.content[1].id).toBe('id-b');
      }

      // tool_call IDs must all be unique
      const toolCallIds: string[] = [];
      for (const c of assistantMsg.content) {
        if (c.type === 'tool_call') toolCallIds.push(c.id);
      }
      expect(new Set(toolCallIds).size).toBe(toolCallIds.length);

      // tool results must match
      const toolMsgs = result.messages.filter((m) => m.role === 'tool');
      const toolResultIds: string[] = [];
      for (const m of toolMsgs) {
        const c = m.content[0];
        if (c.type === 'tool_result') toolResultIds.push(c.toolCallId);
      }
      // Every tool_result.toolCallId must appear in tool_call IDs
      for (const tid of toolResultIds) {
        expect(toolCallIds).toContain(tid);
      }
    });

    // ---- Review #2 Issue #2: Used-response tracking prevents duplicate mapping ----
    it('should not map multiple calls to the same response when names are identical', () => {
      // Both calls have the same name, both missing IDs
      // Only 2 responses available — each call must get a unique one
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Go' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'tool_x',
                args: { n: 1 },
              },
            },
            {
              functionCall: {
                name: 'tool_x',
                args: { n: 2 },
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'resp-1',
                name: 'tool_x',
                response: { r: 1 },
              },
            },
            {
              functionResponse: {
                id: 'resp-2',
                name: 'tool_x',
                response: { r: 2 },
              },
            },
          ],
        },
      ];

      const result = buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [{ text: 'Next' }],
      });

      const assistantMsg = result.messages[1];
      expect(assistantMsg.content).toHaveLength(2);

      if (
        assistantMsg.content[0].type === 'tool_call' &&
        assistantMsg.content[1].type === 'tool_call'
      ) {
        // IDs must be different (no duplicate mapping)
        expect(assistantMsg.content[0].id).not.toBe(assistantMsg.content[1].id);
        // Positional: call[0] → resp-1, call[1] → resp-2
        expect(assistantMsg.content[0].id).toBe('resp-1');
        expect(assistantMsg.content[1].id).toBe('resp-2');
      }
    });

    it('should not mutate the original history array', () => {
      const history: Content[] = [
        { role: 'user', parts: [{ text: 'Hi' }] },
        {
          role: 'model',
          parts: [
            {
              functionCall: {
                name: 'tool1',
                args: {},
              },
            },
          ],
        },
        {
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: 'resp-id-1',
                name: 'tool1',
                response: {},
              },
            },
          ],
        },
      ];

      // Capture original state
      const originalFcId = history[1].parts![0].functionCall!.id;

      buildLlmRequestFromGeminiState({
        model: 'gpt-4',
        history,
        currentRequest: [{ text: 'Next' }],
      });

      // Original history should not be mutated
      expect(history[1].parts![0].functionCall!.id).toBe(originalFcId);
    });
  });
});
