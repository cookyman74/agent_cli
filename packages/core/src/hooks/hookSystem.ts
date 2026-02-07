/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { HookRegistry } from './hookRegistry.js';
import { HookRunner } from './hookRunner.js';
import { HookAggregator } from './hookAggregator.js';
import { HookPlanner } from './hookPlanner.js';
import { HookEventHandler } from './hookEventHandler.js';
import type { HookRegistryEntry } from './hookRegistry.js';
import { debugLogger } from '../utils/debugLogger.js';
import type {
  SessionStartSource,
  SessionEndReason,
  PreCompressTrigger,
  DefaultHookOutput,
  BeforeModelHookOutput,
  AfterModelHookOutput,
  BeforeToolSelectionHookOutput,
  McpToolContext,
} from './types.js';
import { NotificationType } from './types.js';
import type { AggregatedHookResult } from './hookAggregator.js';
import type {
  GenerateContentParameters,
  GenerateContentResponse,
  GenerateContentConfig,
  ContentListUnion,
  ToolConfig,
  ToolListUnion,
} from '@google/genai';
import type {
  LLMRequest,
  LLMResponse,
  HookToolConfig,
} from './hookTranslator.js';
import type { ToolCallConfirmationDetails } from '../tools/tools.js';

/**
 * Main hook system that coordinates all hook-related functionality
 */

export interface BeforeModelHookResult {
  /** Whether the model call was blocked */
  blocked: boolean;
  /** Whether the execution should be stopped entirely */
  stopped?: boolean;
  /** Reason for blocking (if blocked) */
  reason?: string;
  /** @deprecated Use syntheticLLMResponse for provider-independent code. */
  syntheticResponse?: GenerateContentResponse;
  /** Provider-independent synthetic response */
  syntheticLLMResponse?: LLMResponse;
  /** @deprecated Use modifiedLLMConfig for provider-independent code. */
  modifiedConfig?: GenerateContentConfig;
  /** Provider-independent modified config */
  modifiedLLMConfig?: LLMRequest['config'];
  /** @deprecated Use modifiedMessages for provider-independent code. */
  modifiedContents?: ContentListUnion;
  /** Provider-independent modified messages */
  modifiedMessages?: LLMRequest['messages'];
}

/**
 * Result from firing the BeforeToolSelection hook.
 */
export interface BeforeToolSelectionHookResult {
  /** @deprecated Use hookToolConfig for provider-independent code. */
  toolConfig?: ToolConfig;
  /** @deprecated Use hookTools for provider-independent code. */
  tools?: ToolListUnion;
  /** Provider-independent tool config */
  hookToolConfig?: HookToolConfig;
}

/**
 * Result from firing the AfterModel hook.
 * Contains either a modified response or indicates to use the original chunk.
 */
export interface AfterModelHookResult {
  /** @deprecated Use llmResponse for provider-independent code. Undefined when called via LLMRequest path. */
  response?: GenerateContentResponse;
  /** Provider-independent response */
  llmResponse?: LLMResponse;
  /** Whether the execution should be stopped entirely */
  stopped?: boolean;
  /** Whether the model call was blocked */
  blocked?: boolean;
  /** Reason for blocking or stopping */
  reason?: string;
}

/**
 * Converts ToolCallConfirmationDetails to a serializable format for hooks.
 * Excludes function properties (onConfirm, ideConfirmation) that can't be serialized.
 */
function toSerializableDetails(
  details: ToolCallConfirmationDetails,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    type: details.type,
    title: details.title,
  };

  switch (details.type) {
    case 'edit':
      return {
        ...base,
        fileName: details.fileName,
        filePath: details.filePath,
        fileDiff: details.fileDiff,
        originalContent: details.originalContent,
        newContent: details.newContent,
        isModifying: details.isModifying,
      };
    case 'exec':
      return {
        ...base,
        command: details.command,
        rootCommand: details.rootCommand,
      };
    case 'mcp':
      return {
        ...base,
        serverName: details.serverName,
        toolName: details.toolName,
        toolDisplayName: details.toolDisplayName,
      };
    case 'info':
      return {
        ...base,
        prompt: details.prompt,
        urls: details.urls,
      };
    default:
      return base;
  }
}

/**
 * Gets the message to display in the notification hook for tool confirmation.
 */
function getNotificationMessage(
  confirmationDetails: ToolCallConfirmationDetails,
): string {
  switch (confirmationDetails.type) {
    case 'edit':
      return `Tool ${confirmationDetails.title} requires editing`;
    case 'exec':
      return `Tool ${confirmationDetails.title} requires execution`;
    case 'mcp':
      return `Tool ${confirmationDetails.title} requires MCP`;
    case 'info':
      return `Tool ${confirmationDetails.title} requires information`;
    default:
      return `Tool requires confirmation`;
  }
}

export class HookSystem {
  private readonly hookRegistry: HookRegistry;
  private readonly hookRunner: HookRunner;
  private readonly hookAggregator: HookAggregator;
  private readonly hookPlanner: HookPlanner;
  private readonly hookEventHandler: HookEventHandler;

  constructor(config: Config) {
    // Initialize components
    this.hookRegistry = new HookRegistry(config);
    this.hookRunner = new HookRunner(config);
    this.hookAggregator = new HookAggregator();
    this.hookPlanner = new HookPlanner(this.hookRegistry);
    this.hookEventHandler = new HookEventHandler(
      config,
      this.hookPlanner,
      this.hookRunner,
      this.hookAggregator,
    );
  }

  /**
   * Initialize the hook system
   */
  async initialize(): Promise<void> {
    await this.hookRegistry.initialize();
    debugLogger.debug('Hook system initialized successfully');
  }

  /**
   * Get the hook event bus for firing events
   */
  getEventHandler(): HookEventHandler {
    return this.hookEventHandler;
  }

  /**
   * Get hook registry for management operations
   */
  getRegistry(): HookRegistry {
    return this.hookRegistry;
  }

  /**
   * Enable or disable a hook
   */
  setHookEnabled(hookName: string, enabled: boolean): void {
    this.hookRegistry.setHookEnabled(hookName, enabled);
  }

  /**
   * Get all registered hooks for display/management
   */
  getAllHooks(): HookRegistryEntry[] {
    return this.hookRegistry.getAllHooks();
  }

  /**
   * Fire hook events directly
   */
  async fireSessionStartEvent(
    source: SessionStartSource,
  ): Promise<DefaultHookOutput | undefined> {
    const result = await this.hookEventHandler.fireSessionStartEvent(source);
    return result.finalOutput;
  }

  async fireSessionEndEvent(
    reason: SessionEndReason,
  ): Promise<AggregatedHookResult | undefined> {
    return this.hookEventHandler.fireSessionEndEvent(reason);
  }

  async firePreCompressEvent(
    trigger: PreCompressTrigger,
  ): Promise<AggregatedHookResult | undefined> {
    return this.hookEventHandler.firePreCompressEvent(trigger);
  }

  async fireBeforeAgentEvent(
    prompt: string,
  ): Promise<DefaultHookOutput | undefined> {
    const result = await this.hookEventHandler.fireBeforeAgentEvent(prompt);
    return result.finalOutput;
  }

  async fireAfterAgentEvent(
    prompt: string,
    response: string,
    stopHookActive: boolean = false,
  ): Promise<DefaultHookOutput | undefined> {
    const result = await this.hookEventHandler.fireAfterAgentEvent(
      prompt,
      response,
      stopHookActive,
    );
    return result.finalOutput;
  }

  async fireBeforeModelEvent(
    llmRequest: GenerateContentParameters | LLMRequest,
  ): Promise<BeforeModelHookResult> {
    const isLegacy = 'contents' in llmRequest;
    try {
      const result = isLegacy
        ? await this.hookEventHandler.fireBeforeModelEvent(
            llmRequest,
          )
        : await this.hookEventHandler.fireBeforeModelEventV2(
            llmRequest,
          );
      const hookOutput = result.finalOutput;

      if (hookOutput?.shouldStopExecution()) {
        return {
          blocked: true,
          stopped: true,
          reason: hookOutput.getEffectiveReason(),
        };
      }

      const blockingError = hookOutput?.getBlockingError();
      if (blockingError?.blocked) {
        const beforeModelOutput = hookOutput as BeforeModelHookOutput;
        const syntheticResponse = beforeModelOutput.getSyntheticResponse();
        const syntheticLLMResponse =
          beforeModelOutput.getSyntheticLLMResponse();
        return {
          blocked: true,
          reason:
            hookOutput?.getEffectiveReason() || 'Model call blocked by hook',
          syntheticResponse,
          syntheticLLMResponse,
        };
      }

      if (hookOutput) {
        const beforeModelOutput = hookOutput as BeforeModelHookOutput;
        const modifiedRequest =
          beforeModelOutput.applyLLMRequestModifications(llmRequest);

        if (isLegacy) {
          const sdkRequest = modifiedRequest as GenerateContentParameters;
          return {
            blocked: false,
            modifiedConfig: sdkRequest?.config,
            modifiedContents: sdkRequest?.contents,
          };
        } else {
          const llmReq = modifiedRequest as LLMRequest;
          return {
            blocked: false,
            modifiedLLMConfig: llmReq?.config,
            modifiedMessages: llmReq?.messages,
          };
        }
      }

      return { blocked: false };
    } catch (error) {
      debugLogger.debug(`BeforeModelHookEvent failed:`, error);
      return { blocked: false };
    }
  }

  async fireAfterModelEvent(
    originalRequest: GenerateContentParameters | LLMRequest,
    chunk: GenerateContentResponse | LLMResponse,
  ): Promise<AfterModelHookResult> {
    const isLegacy = 'contents' in originalRequest;
    try {
      const result = isLegacy
        ? await this.hookEventHandler.fireAfterModelEvent(
            originalRequest,
            chunk as GenerateContentResponse,
          )
        : await this.hookEventHandler.fireAfterModelEventV2(
            originalRequest,
            chunk as LLMResponse,
          );
      const hookOutput = result.finalOutput;

      if (hookOutput?.shouldStopExecution()) {
        return {
          response: isLegacy ? (chunk as GenerateContentResponse) : undefined,
          llmResponse: isLegacy ? undefined : (chunk as LLMResponse),
          stopped: true,
          reason: hookOutput.getEffectiveReason(),
        };
      }

      const blockingError = hookOutput?.getBlockingError();
      if (blockingError?.blocked) {
        return {
          response: isLegacy ? (chunk as GenerateContentResponse) : undefined,
          llmResponse: isLegacy ? undefined : (chunk as LLMResponse),
          blocked: true,
          reason: hookOutput?.getEffectiveReason(),
        };
      }

      if (hookOutput) {
        const afterModelOutput = hookOutput as AfterModelHookOutput;

        if (isLegacy) {
          const modifiedResponse = afterModelOutput.getModifiedResponse();
          if (modifiedResponse) {
            return { response: modifiedResponse };
          }
        } else {
          const modifiedLLMResponse = afterModelOutput.getModifiedLLMResponse();
          if (modifiedLLMResponse) {
            return {
              llmResponse: modifiedLLMResponse,
            };
          }
        }
      }

      return {
        response: isLegacy ? (chunk as GenerateContentResponse) : undefined,
        llmResponse: isLegacy ? undefined : (chunk as LLMResponse),
      };
    } catch (error) {
      debugLogger.debug(`AfterModelHookEvent failed:`, error);
      return {
        response: isLegacy ? (chunk as GenerateContentResponse) : undefined,
        llmResponse: isLegacy ? undefined : (chunk as LLMResponse),
      };
    }
  }

  async fireBeforeToolSelectionEvent(
    llmRequest: GenerateContentParameters | LLMRequest,
  ): Promise<BeforeToolSelectionHookResult> {
    const isLegacy = 'contents' in llmRequest;
    try {
      const result = isLegacy
        ? await this.hookEventHandler.fireBeforeToolSelectionEvent(
            llmRequest,
          )
        : await this.hookEventHandler.fireBeforeToolSelectionEventV2(
            llmRequest,
          );
      const hookOutput = result.finalOutput;

      if (hookOutput) {
        const toolSelectionOutput = hookOutput as BeforeToolSelectionHookOutput;

        if (isLegacy) {
          const sdkRequest = llmRequest;
          const modifiedConfig =
            toolSelectionOutput.applyToolConfigModifications({
              toolConfig: sdkRequest.config?.toolConfig,
              tools: sdkRequest.config?.tools,
            });
          return {
            toolConfig: modifiedConfig.toolConfig as ToolConfig | undefined,
            tools: modifiedConfig.tools as ToolListUnion | undefined,
          };
        } else {
          const hookToolConfig = toolSelectionOutput.getHookToolConfig();
          return {
            hookToolConfig,
          };
        }
      }
      return {};
    } catch (error) {
      debugLogger.debug(`BeforeToolSelectionEvent failed:`, error);
      return {};
    }
  }

  async fireBeforeToolEvent(
    toolName: string,
    toolInput: Record<string, unknown>,
    mcpContext?: McpToolContext,
  ): Promise<DefaultHookOutput | undefined> {
    try {
      const result = await this.hookEventHandler.fireBeforeToolEvent(
        toolName,
        toolInput,
        mcpContext,
      );
      return result.finalOutput;
    } catch (error) {
      debugLogger.debug(`BeforeToolEvent failed for ${toolName}:`, error);
      return undefined;
    }
  }

  async fireAfterToolEvent(
    toolName: string,
    toolInput: Record<string, unknown>,
    toolResponse: {
      llmContent: unknown;
      returnDisplay: unknown;
      error: unknown;
    },
    mcpContext?: McpToolContext,
  ): Promise<DefaultHookOutput | undefined> {
    try {
      const result = await this.hookEventHandler.fireAfterToolEvent(
        toolName,
        toolInput,
        toolResponse as Record<string, unknown>,
        mcpContext,
      );
      return result.finalOutput;
    } catch (error) {
      debugLogger.debug(`AfterToolEvent failed for ${toolName}:`, error);
      return undefined;
    }
  }

  async fireToolNotificationEvent(
    confirmationDetails: ToolCallConfirmationDetails,
  ): Promise<void> {
    try {
      const message = getNotificationMessage(confirmationDetails);
      const serializedDetails = toSerializableDetails(confirmationDetails);

      await this.hookEventHandler.fireNotificationEvent(
        NotificationType.ToolPermission,
        message,
        serializedDetails,
      );
    } catch (error) {
      debugLogger.debug(
        `NotificationEvent failed for ${confirmationDetails.title}:`,
        error,
      );
    }
  }
}
