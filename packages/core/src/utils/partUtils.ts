/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentResponse,
  PartListUnion,
  Part,
  PartUnion,
} from '@google/genai';
import type {
  LlmContent,
  LlmTextContent,
  LlmMessage,
} from '../providers/types.js';
import { isTextContent } from './llmUtils.js';

/**
 * Converts a PartListUnion into a string.
 * If verbose is true, includes summary representations of non-text parts.
 *
 * @deprecated Use {@link contentToString} for provider-independent conversion.
 */
export function partToString(
  value: PartListUnion,
  options?: { verbose?: boolean },
): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((part) => partToString(part, options)).join('');
  }

  // Cast to Part, assuming it might contain project-specific fields
  const part = value as Part & {
    videoMetadata?: unknown;
    thought?: string;
    codeExecutionResult?: unknown;
    executableCode?: unknown;
  };

  if (options?.verbose) {
    if (part.videoMetadata !== undefined) {
      return `[Video Metadata]`;
    }
    if (part.thought !== undefined) {
      return `[Thought: ${part.thought}]`;
    }
    if (part.codeExecutionResult !== undefined) {
      return `[Code Execution Result]`;
    }
    if (part.executableCode !== undefined) {
      return `[Executable Code]`;
    }

    // Standard Part fields
    if (part.fileData !== undefined) {
      return `[File Data]`;
    }
    if (part.functionCall !== undefined) {
      return `[Function Call: ${part.functionCall.name}]`;
    }
    if (part.functionResponse !== undefined) {
      return `[Function Response: ${part.functionResponse.name}]`;
    }
    if (part.inlineData !== undefined) {
      return `<${part.inlineData.mimeType}>`;
    }
  }

  return part.text ?? '';
}

/**
 * @deprecated Use {@link getMessageText} for provider-independent text extraction.
 */
export function getResponseText(
  response: GenerateContentResponse,
): string | null {
  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];

    if (
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts.length > 0
    ) {
      return candidate.content.parts
        .filter((part) => part.text && !part.thought)
        .map((part) => part.text)
        .join('');
    }
  }
  return null;
}

/**
 * Asynchronously maps over a PartListUnion, applying a transformation function
 * to the text content of each text-based part.
 *
 * @param parts The PartListUnion to process.
 * @param transform A function that takes a string of text and returns a Promise
 *   resolving to an array of new PartUnions.
 * @returns A Promise that resolves to a new array of PartUnions with the
 *   transformations applied.
 *
 * @deprecated Use {@link flatMapLlmTextContents} for provider-independent transformation.
 */
export async function flatMapTextParts(
  parts: PartListUnion,
  transform: (text: string) => Promise<PartUnion[]>,
): Promise<PartUnion[]> {
  const result: PartUnion[] = [];
  const partArray = Array.isArray(parts)
    ? parts
    : typeof parts === 'string'
      ? [{ text: parts }]
      : [parts];

  for (const part of partArray) {
    let textToProcess: string | undefined;
    if (typeof part === 'string') {
      textToProcess = part;
    } else if ('text' in part) {
      textToProcess = part.text;
    }

    if (textToProcess !== undefined) {
      const transformedParts = await transform(textToProcess);
      result.push(...transformedParts);
    } else {
      // Pass through non-text parts unmodified.
      result.push(part);
    }
  }
  return result;
}

/**
 * Appends a string of text to the last text part of a prompt, or adds a new
 * text part if the last part is not a text part.
 *
 * @param prompt The prompt to modify.
 * @param textToAppend The text to append to the prompt.
 * @param separator The separator to add between existing text and the new text.
 * @returns The modified prompt.
 *
 * @deprecated Use {@link appendToLastLlmTextContent} for provider-independent operation.
 */
export function appendToLastTextPart(
  prompt: PartUnion[],
  textToAppend: string,
  separator = '\n\n',
): PartUnion[] {
  if (!textToAppend) {
    return prompt;
  }

  if (prompt.length === 0) {
    return [{ text: textToAppend }];
  }

  const newPrompt = [...prompt];
  const lastPart = newPrompt.at(-1);

  if (typeof lastPart === 'string') {
    newPrompt[newPrompt.length - 1] = `${lastPart}${separator}${textToAppend}`;
  } else if (lastPart && 'text' in lastPart) {
    newPrompt[newPrompt.length - 1] = {
      ...lastPart,
      text: `${lastPart.text}${separator}${textToAppend}`,
    };
  } else {
    newPrompt.push({ text: `${separator}${textToAppend}` });
  }

  return newPrompt;
}

// ============================================================================
// Provider-independent content utilities (LlmContent)
// ============================================================================

/**
 * Convert LlmContent or LlmContent[] to a string representation.
 * Provider-independent version of partToString.
 *
 * In verbose mode, includes descriptive summaries for non-text content.
 */
export function contentToString(
  content: LlmContent | LlmContent[],
  options?: { verbose?: boolean },
): string {
  if (Array.isArray(content)) {
    return content.map((c) => contentToString(c, options)).join('');
  }

  if (isTextContent(content)) {
    return content.text;
  }

  if (!options?.verbose) {
    return '';
  }

  // Verbose mode: descriptive summaries
  switch (content.type) {
    case 'image':
      return `[Image: ${content.source.mediaType}]`;
    case 'tool_call':
      return `[Tool Call: ${content.name}]`;
    case 'tool_result':
      return `[Tool Result]`;
    case 'thought':
      return `[Thought: ${content.thought}]`;
    default:
      return '';
  }
}

/**
 * Extract concatenated text from an LlmMessage.
 * Provider-independent version of getResponseText.
 *
 * Skips non-text and thought contents.
 * Returns null if no text content found.
 */
export function getMessageText(message: LlmMessage): string | null {
  if (!message.content || message.content.length === 0) {
    return null;
  }

  const textParts = message.content
    .filter((c): c is LlmTextContent => isTextContent(c))
    .map((c) => c.text);

  return textParts.length > 0 ? textParts.join('') : null;
}

/**
 * Async flat-map over LlmContent[], transforming text contents.
 * Provider-independent version of flatMapTextParts.
 *
 * Non-text contents are passed through unmodified.
 */
export async function flatMapLlmTextContents(
  contents: LlmContent[],
  transform: (text: string) => Promise<LlmContent[]>,
): Promise<LlmContent[]> {
  const result: LlmContent[] = [];

  for (const content of contents) {
    if (isTextContent(content)) {
      const transformed = await transform(content.text);
      result.push(...transformed);
    } else {
      result.push(content);
    }
  }

  return result;
}

/**
 * Append text to the last text content in an LlmContent array.
 * Provider-independent version of appendToLastTextPart.
 *
 * If the last content is not text, a new text content is added.
 */
export function appendToLastLlmTextContent(
  contents: LlmContent[],
  textToAppend: string,
  separator = '\n\n',
): LlmContent[] {
  if (!textToAppend) {
    return contents;
  }

  if (contents.length === 0) {
    return [{ type: 'text', text: textToAppend }];
  }

  const newContents = [...contents];
  const last = newContents.at(-1);

  if (last && isTextContent(last)) {
    newContents[newContents.length - 1] = {
      type: 'text',
      text: `${last.text}${separator}${textToAppend}`,
    };
  } else {
    newContents.push({ type: 'text', text: `${separator}${textToAppend}` });
  }

  return newContents;
}
