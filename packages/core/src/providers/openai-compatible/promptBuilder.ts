/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * PromptBuilder — extension point for client-side prompt formatting.
 *
 * Modern servers (vLLM, TGI, Ollama, LM Studio) handle chat templates
 * server-side when using /v1/chat/completions. This interface is provided
 * as a hook for future raw /v1/completions support or custom formatting.
 *
 * @see docs/ai_adapter/todolist/phase3_provider_extension_todolist.md §3.3.2
 */

/**
 * Interface for client-side prompt formatting.
 *
 * Implementations convert a sequence of chat messages into a single
 * prompt string suitable for raw text completion endpoints.
 */
export interface PromptBuilder {
  /** Format messages into a single prompt string. */
  formatPrompt(
    messages: ReadonlyArray<{ role: string; content: string }>,
  ): string;
}

/**
 * ChatML format — universal fallback chat template.
 *
 * Used by many models (e.g., OpenHermes, Qwen) as a default chat format.
 * Each message is wrapped in `<|im_start|>role\ncontent<|im_end|>` tokens.
 *
 * Example output:
 * ```
 * <|im_start|>system
 * You are helpful<|im_end|>
 * <|im_start|>user
 * Hello<|im_end|>
 * <|im_start|>assistant
 * ```
 */
export class ChatMLPromptBuilder implements PromptBuilder {
  formatPrompt(
    messages: ReadonlyArray<{ role: string; content: string }>,
  ): string {
    let prompt = '';
    for (const msg of messages) {
      prompt += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
    }
    prompt += '<|im_start|>assistant\n';
    return prompt;
  }
}
