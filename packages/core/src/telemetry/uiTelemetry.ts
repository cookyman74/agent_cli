/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import {
  EVENT_API_ERROR,
  EVENT_API_RESPONSE,
  EVENT_TOOL_CALL,
} from './types.js';

import { ToolCallDecision } from './tool-call-decision.js';
import type {
  ApiErrorEvent,
  ApiResponseEvent,
  ToolCallEvent,
} from './types.js';
import type {
  ProviderApiResponseEvent,
  ProviderApiErrorEvent,
} from '../providers/telemetryBridge.js';

export type UiEvent =
  | (ApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE })
  | (ApiErrorEvent & { 'event.name': typeof EVENT_API_ERROR })
  | (ToolCallEvent & { 'event.name': typeof EVENT_TOOL_CALL })
  | (ProviderApiResponseEvent & { 'event.name': typeof EVENT_API_RESPONSE })
  | (ProviderApiErrorEvent & { 'event.name': typeof EVENT_API_ERROR });

export interface ToolCallStats {
  count: number;
  success: number;
  fail: number;
  durationMs: number;
  decisions: {
    [ToolCallDecision.ACCEPT]: number;
    [ToolCallDecision.REJECT]: number;
    [ToolCallDecision.MODIFY]: number;
    [ToolCallDecision.AUTO_ACCEPT]: number;
  };
}

export interface ModelMetrics {
  provider?: string;
  api: {
    totalRequests: number;
    totalErrors: number;
    totalLatencyMs: number;
  };
  tokens: {
    input: number;
    prompt: number;
    candidates: number;
    total: number;
    cached: number;
    cacheCreation: number;
    thoughts: number;
    tool: number;
  };
}

export interface SessionMetrics {
  models: Record<string, ModelMetrics>;
  tools: {
    totalCalls: number;
    totalSuccess: number;
    totalFail: number;
    totalDurationMs: number;
    totalDecisions: {
      [ToolCallDecision.ACCEPT]: number;
      [ToolCallDecision.REJECT]: number;
      [ToolCallDecision.MODIFY]: number;
      [ToolCallDecision.AUTO_ACCEPT]: number;
    };
    byName: Record<string, ToolCallStats>;
  };
  files: {
    totalLinesAdded: number;
    totalLinesRemoved: number;
  };
}

const createInitialModelMetrics = (): ModelMetrics => ({
  api: {
    totalRequests: 0,
    totalErrors: 0,
    totalLatencyMs: 0,
  },
  tokens: {
    input: 0,
    prompt: 0,
    candidates: 0,
    total: 0,
    cached: 0,
    cacheCreation: 0,
    thoughts: 0,
    tool: 0,
  },
});

const createInitialMetrics = (): SessionMetrics => ({
  models: {},
  tools: {
    totalCalls: 0,
    totalSuccess: 0,
    totalFail: 0,
    totalDurationMs: 0,
    totalDecisions: {
      [ToolCallDecision.ACCEPT]: 0,
      [ToolCallDecision.REJECT]: 0,
      [ToolCallDecision.MODIFY]: 0,
      [ToolCallDecision.AUTO_ACCEPT]: 0,
    },
    byName: {},
  },
  files: {
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
  },
});

export interface ProviderSummary {
  provider: string;
  totalRequests: number;
  totalErrors: number;
  totalTokens: number;
  totalLatencyMs: number;
}

export class UiTelemetryService extends EventEmitter {
  #metrics: SessionMetrics = createInitialMetrics();
  #lastPromptTokenCount = 0;

  addEvent(event: UiEvent) {
    switch (event['event.name']) {
      case EVENT_API_RESPONSE:
        this.processApiResponse(event);
        break;
      case EVENT_API_ERROR:
        this.processApiError(event);
        break;
      case EVENT_TOOL_CALL:
        this.processToolCall(event);
        break;
      default:
        // We should not emit update for any other event metric.
        return;
    }

    this.emit('update', {
      metrics: this.#metrics,
      lastPromptTokenCount: this.#lastPromptTokenCount,
    });
  }

  getMetrics(): SessionMetrics {
    return this.#metrics;
  }

  getLastPromptTokenCount(): number {
    return this.#lastPromptTokenCount;
  }

  setLastPromptTokenCount(lastPromptTokenCount: number): void {
    this.#lastPromptTokenCount = lastPromptTokenCount;
    this.emit('update', {
      metrics: this.#metrics,
      lastPromptTokenCount: this.#lastPromptTokenCount,
    });
  }

  getProviderSummary(): Record<string, ProviderSummary> {
    const summary: Record<string, ProviderSummary> = {};
    for (const [key, metrics] of Object.entries(this.#metrics.models)) {
      const { provider } = parseCompositeKey(key);
      if (!summary[provider]) {
        summary[provider] = {
          provider,
          totalRequests: 0,
          totalErrors: 0,
          totalTokens: 0,
          totalLatencyMs: 0,
        };
      }
      summary[provider].totalRequests += metrics.api.totalRequests;
      summary[provider].totalErrors += metrics.api.totalErrors;
      summary[provider].totalTokens += metrics.tokens.total;
      summary[provider].totalLatencyMs += metrics.api.totalLatencyMs;
    }
    return summary;
  }

  private getOrCreateModelMetrics(modelName: string): ModelMetrics {
    if (!this.#metrics.models[modelName]) {
      this.#metrics.models[modelName] = createInitialModelMetrics();
    }
    return this.#metrics.models[modelName];
  }

  /**
   * Extract provider from event. ProviderApi*Event has explicit 'provider' field;
   * legacy Api*Event defaults to 'gemini'.
   */
  private extractProviderAndMetrics(event: { model: string }): {
    provider: string;
    modelMetrics: ModelMetrics;
  } {
    const provider =
      ((event as unknown as Record<string, unknown>)['provider'] as
        | string
        | undefined) ?? 'gemini';
    const compositeKey = buildCompositeKey(provider, event.model);
    const modelMetrics = this.getOrCreateModelMetrics(compositeKey);
    modelMetrics.provider = provider;
    return { provider, modelMetrics };
  }

  private processApiResponse(event: ApiResponseEvent) {
    const { modelMetrics } = this.extractProviderAndMetrics(event);

    modelMetrics.api.totalRequests++;
    modelMetrics.api.totalLatencyMs += event.duration_ms;

    modelMetrics.tokens.prompt += event.usage.input_token_count;
    modelMetrics.tokens.candidates += event.usage.output_token_count;
    modelMetrics.tokens.total += event.usage.total_token_count;
    modelMetrics.tokens.cached += event.usage.cached_content_token_count;
    modelMetrics.tokens.cacheCreation +=
      event.usage.cache_creation_token_count ?? 0;
    modelMetrics.tokens.thoughts += event.usage.thoughts_token_count;
    modelMetrics.tokens.tool += event.usage.tool_token_count;
    modelMetrics.tokens.input = Math.max(
      0,
      modelMetrics.tokens.prompt - modelMetrics.tokens.cached,
    );
  }

  private processApiError(event: ApiErrorEvent) {
    const { modelMetrics } = this.extractProviderAndMetrics(event);

    modelMetrics.api.totalRequests++;
    modelMetrics.api.totalErrors++;
    modelMetrics.api.totalLatencyMs += event.duration_ms;
  }

  private processToolCall(event: ToolCallEvent) {
    const { tools, files } = this.#metrics;
    tools.totalCalls++;
    tools.totalDurationMs += event.duration_ms;

    if (event.success) {
      tools.totalSuccess++;
    } else {
      tools.totalFail++;
    }

    if (!tools.byName[event.function_name]) {
      tools.byName[event.function_name] = {
        count: 0,
        success: 0,
        fail: 0,
        durationMs: 0,
        decisions: {
          [ToolCallDecision.ACCEPT]: 0,
          [ToolCallDecision.REJECT]: 0,
          [ToolCallDecision.MODIFY]: 0,
          [ToolCallDecision.AUTO_ACCEPT]: 0,
        },
      };
    }

    const toolStats = tools.byName[event.function_name];
    toolStats.count++;
    toolStats.durationMs += event.duration_ms;
    if (event.success) {
      toolStats.success++;
    } else {
      toolStats.fail++;
    }

    if (event.decision) {
      tools.totalDecisions[event.decision]++;
      toolStats.decisions[event.decision]++;
    }

    // Aggregate line count data from metadata
    if (event.metadata) {
      if (event.metadata['model_added_lines'] !== undefined) {
        files.totalLinesAdded += event.metadata['model_added_lines'];
      }
      if (event.metadata['model_removed_lines'] !== undefined) {
        files.totalLinesRemoved += event.metadata['model_removed_lines'];
      }
    }
  }
}

export const uiTelemetryService = new UiTelemetryService();

/** provider::model 형식의 복합 키 생성 */
export function buildCompositeKey(provider: string, model: string): string {
  return `${provider}::${model}`;
}

/** 복합 키를 provider와 model로 파싱. 레거시 키(:: 미포함)는 gemini 기본값 */
export function parseCompositeKey(key: string): {
  provider: string;
  model: string;
} {
  const separatorIndex = key.indexOf('::');
  if (separatorIndex === -1) {
    return { provider: 'gemini', model: key };
  }
  return {
    provider: key.slice(0, separatorIndex),
    model: key.slice(separatorIndex + 2),
  };
}

/** 복합 키 파싱 기반 모델 그룹핑 */
export function groupModelsByProvider(
  models: Record<string, ModelMetrics>,
): Record<string, Array<[string, ModelMetrics]>> {
  const groups: Record<string, Array<[string, ModelMetrics]>> = {};
  for (const [key, metrics] of Object.entries(models)) {
    const { provider } = parseCompositeKey(key);
    if (!groups[provider]) {
      groups[provider] = [];
    }
    groups[provider].push([key, metrics]);
  }
  return groups;
}
