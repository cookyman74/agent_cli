/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for provider-independent Hook system type conversion.
 *
 * M2.1.5: Hook system type conversion to support multi-provider.
 */
import { describe, it, expect } from 'vitest';
import { HookAggregator } from './hookAggregator.js';
import {
  BeforeModelHookOutput,
  AfterModelHookOutput,
  BeforeToolSelectionHookOutput,
  DefaultHookOutput,
  HookType,
  HookEventName,
} from './types.js';
import type {
  HookExecutionResult,
  BeforeToolSelectionOutput,
  HookOutput,
} from './types.js';
import type { LLMRequest, LLMResponse } from './hookTranslator.js';

// Helper to create HookExecutionResult
function createHookResult(
  output?: HookOutput,
  success = true,
): HookExecutionResult {
  return {
    success,
    output,
    duration: 100,
    hookConfig: {
      type: HookType.Command,
      command: 'test-command',
      timeout: 30000,
    },
    eventName: HookEventName.BeforeTool,
  };
}

describe('M2.1.5 Hook System - Provider-Independent Types', () => {
  describe('2.1.5.2 - hookAggregator string literal compatibility', () => {
    it('should merge tool selection outputs using string literals instead of FunctionCallingConfigMode', () => {
      const aggregator = new HookAggregator();

      const results: HookExecutionResult[] = [
        createHookResult({
          hookSpecificOutput: {
            hookEventName: 'BeforeToolSelection',
            toolConfig: {
              mode: 'NONE',
              allowedFunctionNames: [],
            },
          },
        } as BeforeToolSelectionOutput),
      ];

      const aggregated = aggregator.aggregateResults(
        results,
        HookEventName.BeforeToolSelection,
      );

      expect(aggregated.finalOutput).toBeDefined();
      // The mode should be a string 'NONE', not FunctionCallingConfigMode.NONE
      const output = aggregated.finalOutput as BeforeToolSelectionHookOutput;
      const config = output.getHookToolConfig();
      expect(config).toBeDefined();
      expect(config!.mode).toBe('NONE');
    });
  });

  describe('2.1.5.2 - BeforeModelHookOutput new methods', () => {
    it('should return LLMResponse directly via getSyntheticLLMResponse()', () => {
      const mockLLMResponse: LLMResponse = {
        text: 'synthetic response',
        candidates: [
          {
            content: {
              role: 'model',
              parts: ['synthetic response'],
            },
            finishReason: 'STOP',
          },
        ],
      };

      const output = new BeforeModelHookOutput({
        hookSpecificOutput: {
          hookEventName: 'BeforeModel',
          llm_response: mockLLMResponse,
        },
      });

      const result = output.getSyntheticLLMResponse();
      expect(result).toBeDefined();
      expect(result!.text).toBe('synthetic response');
      expect(result!.candidates[0].content.parts).toEqual([
        'synthetic response',
      ]);
    });

    it('should return undefined when no llm_response in hookSpecificOutput', () => {
      const output = new BeforeModelHookOutput({
        hookSpecificOutput: {
          hookEventName: 'BeforeModel',
        },
      });

      expect(output.getSyntheticLLMResponse()).toBeUndefined();
    });
  });

  describe('2.1.5.2 - AfterModelHookOutput new methods', () => {
    it('should return LLMResponse directly via getModifiedLLMResponse()', () => {
      const mockLLMResponse: LLMResponse = {
        text: 'modified response',
        candidates: [
          {
            content: {
              role: 'model',
              parts: ['modified response'],
            },
            finishReason: 'STOP',
          },
        ],
      };

      const output = new AfterModelHookOutput({
        hookSpecificOutput: {
          hookEventName: 'AfterModel',
          llm_response: mockLLMResponse,
        },
      });

      const result = output.getModifiedLLMResponse();
      expect(result).toBeDefined();
      expect(result!.text).toBe('modified response');
    });

    it('should return undefined when no valid llm_response', () => {
      const output = new AfterModelHookOutput({
        hookSpecificOutput: {
          hookEventName: 'AfterModel',
        },
      });

      expect(output.getModifiedLLMResponse()).toBeUndefined();
    });
  });

  describe('2.1.5.2 - BeforeToolSelectionHookOutput new methods', () => {
    it('should return HookToolConfig directly via getHookToolConfig()', () => {
      const output = new BeforeToolSelectionHookOutput({
        hookSpecificOutput: {
          hookEventName: 'BeforeToolSelection',
          toolConfig: {
            mode: 'ANY',
            allowedFunctionNames: ['read_file', 'write_file'],
          },
        },
      });

      const config = output.getHookToolConfig();
      expect(config).toBeDefined();
      expect(config!.mode).toBe('ANY');
      expect(config!.allowedFunctionNames).toEqual(['read_file', 'write_file']);
    });

    it('should return undefined when no toolConfig in hookSpecificOutput', () => {
      const output = new BeforeToolSelectionHookOutput({
        hookSpecificOutput: {
          hookEventName: 'BeforeToolSelection',
        },
      });

      expect(output.getHookToolConfig()).toBeUndefined();
    });
  });

  describe('2.1.5.2 - applyLLMRequestModifications with LLMRequest', () => {
    it('should handle LLMRequest input in BeforeModelHookOutput', () => {
      const hookLLMRequest: Partial<LLMRequest> = {
        model: 'modified-model',
        messages: [{ role: 'user', content: 'modified prompt' }],
        config: { temperature: 0.5 },
      };

      const output = new BeforeModelHookOutput({
        hookSpecificOutput: {
          hookEventName: 'BeforeModel',
          llm_request: hookLLMRequest,
        },
      });

      const target: LLMRequest = {
        model: 'original-model',
        messages: [{ role: 'user', content: 'original prompt' }],
      };

      const result = output.applyLLMRequestModifications(target);

      // Should return modified LLMRequest with merged fields
      expect(result).toBeDefined();
      expect((result as LLMRequest).model).toBe('modified-model');
      expect((result as LLMRequest).config?.temperature).toBe(0.5);
    });

    it('should pass through LLMRequest in base DefaultHookOutput', () => {
      const output = new DefaultHookOutput({});

      const target: LLMRequest = {
        model: 'test-model',
        messages: [{ role: 'user', content: 'test' }],
      };

      const result = output.applyLLMRequestModifications(target);
      expect(result).toBe(target); // Base impl is passthrough
    });
  });

  describe('2.1.5.3 - hookEventHandler V2 methods', () => {
    it('should have fireBeforeModelEventV2 method that accepts LLMRequest', async () => {
      const { HookEventHandler } = await import('./hookEventHandler.js');

      // V2 method should be defined on the prototype
      expect(HookEventHandler.prototype.fireBeforeModelEventV2).toBeDefined();
      expect(typeof HookEventHandler.prototype.fireBeforeModelEventV2).toBe(
        'function',
      );
    });

    it('should have fireAfterModelEventV2 method that accepts LLMRequest + LLMResponse', async () => {
      const { HookEventHandler } = await import('./hookEventHandler.js');

      expect(HookEventHandler.prototype.fireAfterModelEventV2).toBeDefined();
      expect(typeof HookEventHandler.prototype.fireAfterModelEventV2).toBe(
        'function',
      );
    });

    it('should have fireBeforeToolSelectionEventV2 method that accepts LLMRequest', async () => {
      const { HookEventHandler } = await import('./hookEventHandler.js');

      expect(
        HookEventHandler.prototype.fireBeforeToolSelectionEventV2,
      ).toBeDefined();
      expect(
        typeof HookEventHandler.prototype.fireBeforeToolSelectionEventV2,
      ).toBe('function');
    });
  });

  describe('2.1.5.4 - Legacy GenerateContentParameters compatibility', () => {
    it('should still accept GenerateContentParameters in applyLLMRequestModifications', () => {
      // Simulating GenerateContentParameters-like object
      const legacyTarget = {
        model: 'gemini-1.5-flash',
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
        config: { temperature: 0.7 },
      };

      const output = new BeforeModelHookOutput({
        hookSpecificOutput: {
          hookEventName: 'BeforeModel',
          llm_request: {
            model: 'modified-model',
            messages: [{ role: 'user', content: 'modified' }],
          },
        },
      });

      // Legacy path should still work (GenerateContentParameters has 'contents')
      const result = output.applyLLMRequestModifications(
        legacyTarget as unknown as import('@google/genai').GenerateContentParameters,
      );
      expect(result).toBeDefined();
    });

    it('should still accept legacy toolConfig format in applyToolConfigModifications', () => {
      const output = new BeforeToolSelectionHookOutput({
        hookSpecificOutput: {
          hookEventName: 'BeforeToolSelection',
          toolConfig: {
            mode: 'AUTO',
            allowedFunctionNames: ['test_tool'],
          },
        },
      });

      // Legacy format with GenAIToolConfig shape
      const legacyTarget = {
        toolConfig: {
          functionCallingConfig: {
            mode: 'AUTO',
            allowedFunctionNames: [],
          },
        },
        tools: [],
      };

      const result = output.applyToolConfigModifications(
        legacyTarget as unknown as {
          toolConfig?: import('@google/genai').ToolConfig;
          tools?: import('@google/genai').ToolListUnion;
        },
      );
      expect(result).toBeDefined();
    });
  });
});
