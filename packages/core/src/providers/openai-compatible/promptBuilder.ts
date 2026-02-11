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
 * as a hook for raw /v1/completions support or custom formatting.
 *
 * Note: This module is intentionally exposed as an extension point and is not
 * currently wired into the default /v1/chat/completions runtime path.
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

type PromptMessage = { role: string; content: string };

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
  formatPrompt(messages: readonly PromptMessage[]): string {
    let prompt = '';
    for (const msg of messages) {
      prompt += `<|im_start|>${msg.role}\n${msg.content}<|im_end|>\n`;
    }
    prompt += '<|im_start|>assistant\n';
    return prompt;
  }
}

/**
 * Llama 3 Instruct-style template.
 *
 * Example:
 * ```
 * <|begin_of_text|><|start_header_id|>user<|end_header_id|>
 *
 * Hello<|eot_id|><|start_header_id|>assistant<|end_header_id|>
 * ```
 */
export class Llama3PromptBuilder implements PromptBuilder {
  formatPrompt(messages: readonly PromptMessage[]): string {
    let prompt = '<|begin_of_text|>';
    for (const msg of messages) {
      prompt += `<|start_header_id|>${msg.role}<|end_header_id|>\n\n${msg.content}<|eot_id|>`;
    }
    prompt += '<|start_header_id|>assistant<|end_header_id|>\n\n';
    return prompt;
  }
}

/**
 * Mistral Instruct-style template.
 *
 * - User turns are wrapped in `[INST] ... [/INST]`.
 * - Assistant turns are appended after the instruction and closed with `</s>`.
 * - Leading system message is prepended as plain text to the first user turn.
 *
 * This intentionally avoids `<<SYS>> ... <</SYS>>` (Llama 2 style markers).
 * For raw completion mode this is a heuristic fallback, not an official
 * tokenizer-aware template for every Mistral-family variant.
 */
export class MistralPromptBuilder implements PromptBuilder {
  formatPrompt(messages: readonly PromptMessage[]): string {
    if (messages.length === 0) {
      return '<s>[INST]  [/INST]';
    }

    const remaining: PromptMessage[] = [...messages];
    const systemParts: string[] = [];
    while (remaining[0]?.role === 'system') {
      systemParts.push(remaining.shift()!.content);
    }
    const systemPrompt = systemParts.join('\n');

    // If only system messages were provided, create a primed instruction turn.
    if (remaining.length === 0) {
      if (!systemPrompt) {
        return '<s>[INST]  [/INST]';
      }
      return `<s>[INST] ${systemPrompt} [/INST]`;
    }

    let prompt = '';
    let firstUserSeen = false;

    for (const msg of remaining) {
      if (msg.role === 'assistant') {
        prompt += ` ${msg.content}</s>`;
        continue;
      }

      if (msg.role === 'tool') {
        // Mistral instruct templates do not define a dedicated tool role.
        // Treat tool output as user-provided context for the next turn.
        prompt += `<s>[INST] Tool result:\n${msg.content} [/INST]`;
        firstUserSeen = true;
        continue;
      }

      let userContent = msg.content;
      if (!firstUserSeen && systemPrompt) {
        userContent = `${systemPrompt}\n\n${msg.content}`;
      }
      prompt += `<s>[INST] ${userContent} [/INST]`;
      firstUserSeen = true;
    }

    return prompt;
  }
}

/**
 * Select a prompt builder based on model name.
 *
 * Defaults to ChatML for unknown models.
 *
 * Heuristic mapping only. Model vendors can ship custom templates that differ
 * by checkpoint/revision.
 */
export function createPromptBuilderForModel(modelName?: string): PromptBuilder {
  const model = (modelName ?? '').toLowerCase();

  if (model.includes('mixtral') || model.includes('mistral')) {
    return new MistralPromptBuilder();
  }

  // Keep Llama 3 detection strict to avoid mismatching Llama 2/Guard families.
  if (model.includes('llama-3') || model.includes('llama3')) {
    return new Llama3PromptBuilder();
  }

  return new ChatMLPromptBuilder();
}
