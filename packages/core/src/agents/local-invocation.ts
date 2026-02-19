/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { LocalAgentExecutor } from './local-executor.js';
import type { AnsiOutput } from '../utils/terminalSerializer.js';
import { BaseToolInvocation, type ToolResult } from '../tools/tools.js';
import { ToolErrorType } from '../tools/tool-error.js';
import type {
  ChatSessionFactory,
  LocalAgentDefinition,
  AgentInputs,
  SubagentActivityEvent,
} from './types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { isProviderIndependentGenerator } from '../core/contentGenerator.js';
import { resolveProviderModel } from '../providers/providerSelector.js';
import { convertContentsToLlmMessages } from '../providers/gemini/typeConversion.js';
import { convertGeminiToolsToLlm } from '../providers/gemini/requestBuilder.js';
import { fixToolResultRoles } from '../core/llmMessageUtils.js';
import { LlmAgentChatSession } from './llmAgentChatSession.js';
import type { LlmGenerateRequest } from '../providers/types.js';

const INPUT_PREVIEW_MAX_LENGTH = 50;
const DESCRIPTION_MAX_LENGTH = 200;

/**
 * Represents a validated, executable instance of a subagent tool.
 *
 * This class orchestrates the execution of a defined agent by:
 * 1. Initializing the {@link LocalAgentExecutor}.
 * 2. Running the agent's execution loop.
 * 3. Bridging the agent's streaming activity (e.g., thoughts) to the tool's
 * live output stream.
 * 4. Formatting the final result into a {@link ToolResult}.
 */
export class LocalSubagentInvocation extends BaseToolInvocation<
  AgentInputs,
  ToolResult
> {
  /**
   * @param definition The definition object that configures the agent.
   * @param config The global runtime configuration.
   * @param params The validated input parameters for the agent.
   * @param messageBus Message bus for policy enforcement.
   */
  constructor(
    private readonly definition: LocalAgentDefinition,
    private readonly config: Config,
    params: AgentInputs,
    messageBus: MessageBus,
    _toolName?: string,
    _toolDisplayName?: string,
  ) {
    super(
      params,
      messageBus,
      _toolName ?? definition.name,
      _toolDisplayName ?? definition.displayName,
    );
  }

  /**
   * Returns a concise, human-readable description of the invocation.
   * Used for logging and display purposes.
   */
  getDescription(): string {
    const inputSummary = Object.entries(this.params)
      .map(
        ([key, value]) =>
          `${key}: ${String(value).slice(0, INPUT_PREVIEW_MAX_LENGTH)}`,
      )
      .join(', ');

    const description = `Running subagent '${this.definition.name}' with inputs: { ${inputSummary} }`;
    return description.slice(0, DESCRIPTION_MAX_LENGTH);
  }

  /**
   * Executes the subagent.
   *
   * @param signal An `AbortSignal` to cancel the agent's execution.
   * @param updateOutput A callback to stream intermediate output, such as the
   * agent's thoughts, to the user interface.
   * @returns A `Promise` that resolves with the final `ToolResult`.
   */
  async execute(
    signal: AbortSignal,
    updateOutput?: (output: string | AnsiOutput) => void,
  ): Promise<ToolResult> {
    try {
      if (updateOutput) {
        updateOutput('Subagent starting...\n');
      }

      // Create an activity callback to bridge the executor's events to the
      // tool's streaming output.
      const onActivity = (activity: SubagentActivityEvent): void => {
        if (!updateOutput) return;

        if (
          activity.type === 'THOUGHT_CHUNK' &&
          typeof activity.data['text'] === 'string'
        ) {
          updateOutput(`🤖💭 ${activity.data['text']}`);
        }
      };

      // Detect non-Gemini provider and inject LlmAgentChatSession factory
      const chatFactory = this.buildChatFactoryIfNonGemini();

      const executor = chatFactory
        ? await LocalAgentExecutor.create(
            this.definition,
            this.config,
            onActivity,
            chatFactory,
          )
        : await LocalAgentExecutor.create(
            this.definition,
            this.config,
            onActivity,
          );

      const output = await executor.run(this.params, signal);

      const resultContent = `Subagent '${this.definition.name}' finished.
Termination Reason: ${output.terminate_reason}
Result:
${output.result}`;

      const displayContent = `
Subagent ${this.definition.name} Finished

Termination Reason:\n ${output.terminate_reason}

Result:
${output.result}
`;

      return {
        llmContent: [{ text: resultContent }],
        returnDisplay: displayContent,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        llmContent: `Subagent '${this.definition.name}' failed. Error: ${errorMessage}`,
        returnDisplay: `Subagent Failed: ${this.definition.name}\nError: ${errorMessage}`,
        error: {
          message: errorMessage,
          type: ToolErrorType.EXECUTION_FAILED,
        },
      };
    }
  }

  /**
   * Returns a ChatSessionFactory for non-Gemini providers with llm* methods,
   * or undefined for Gemini (which uses the default GeminiChat factory).
   *
   * Throws eagerly for non-Gemini providers that lack llm* methods [리뷰 #3].
   */
  private buildChatFactoryIfNonGemini(): ChatSessionFactory | undefined {
    let generator;
    try {
      generator = this.config.getContentGenerator();
    } catch {
      return undefined;
    }
    if (!generator) return undefined;

    const providerName = generator.providerName;

    // Gemini (or unknown) → use default GeminiChat factory
    if (providerName == null || providerName === 'gemini') {
      return undefined;
    }

    // Non-Gemini without llm* methods → fail fast [리뷰 #3]
    if (!isProviderIndependentGenerator(generator)) {
      throw new Error(
        `Provider "${providerName}" is non-Gemini but does not support ` +
          `provider-independent API (llm* methods). Subagent execution cannot proceed.`,
      );
    }

    return (config, systemInstruction, tools, history) =>
      new LlmAgentChatSession({
        generator,
        providerName,
        systemInstruction,
        tools,
        initialHistory: history,
        resolveProviderModelFn: resolveProviderModel,
        buildLlmRequestFn: ({
          history: msgs,
          systemInstruction: si,
          tools: t,
        }) => {
          const request: LlmGenerateRequest = {
            model: 'placeholder', // overridden by LlmAgentChatSession
            messages: msgs,
          };
          if (si !== undefined) {
            request.systemInstruction = si;
          }
          if (t.length > 0) {
            request.tools = convertGeminiToolsToLlm(t);
          }
          return request;
        },
        fixToolResultRolesFn: fixToolResultRoles,
        convertContentsToLlmMessagesFn: convertContentsToLlmMessages,
        // Propagate generation config (temperature/topP/maxOutputTokens etc.) [리뷰 #1]
        resolveGenerateConfigFn: (key) => {
          try {
            const resolved = config.modelConfigService.getResolvedConfig(key);
            return resolved.generateContentConfig;
          } catch {
            return undefined;
          }
        },
      });
  }
}
