/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { appendFileSync } from 'node:fs';
import type { ContentGenerator } from './contentGenerator.js';
import type { FakeResponse } from './fakeContentGenerator.js';
import type { UserTierId } from '../code_assist/types.js';
import { safeJsonStringify } from '../utils/safeJsonStringify.js';
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmTokenCount,
  GenerateOptions,
} from '../providers/types.js';
import type { LlmEvent, LlmEventStream } from '../providers/events.js';

// A ContentGenerator that wraps another content generator and records all the
// responses, with the ability to write them out to a file. These files are
// intended to be consumed later on by a FakeContentGenerator, given the
// `--fake-responses` CLI argument.
//
// Note that only the "interesting" bits of the responses are actually kept.
export class RecordingContentGenerator implements ContentGenerator {
  constructor(
    private readonly realGenerator: ContentGenerator,
    private readonly filePath: string,
  ) {}

  get userTier(): UserTierId | undefined {
    return this.realGenerator.userTier;
  }

  get userTierName(): string | undefined {
    return this.realGenerator.userTierName;
  }

  get providerName(): string | undefined {
    return this.realGenerator.providerName;
  }

  async generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse> {
    const response = await this.realGenerator.generateContent(
      request,
      userPromptId,
    );
    const recordedResponse: FakeResponse = {
      method: 'generateContent',
      response: {
        candidates: response.candidates,
        usageMetadata: response.usageMetadata,
      } as GenerateContentResponse,
    };
    appendFileSync(this.filePath, `${safeJsonStringify(recordedResponse)}\n`);
    return response;
  }

  async generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const recordedResponse: FakeResponse = {
      method: 'generateContentStream',
      response: [],
    };

    const realResponses = await this.realGenerator.generateContentStream(
      request,
      userPromptId,
    );

    async function* stream(filePath: string) {
      for await (const response of realResponses) {
        (recordedResponse.response as GenerateContentResponse[]).push({
          candidates: response.candidates,
          usageMetadata: response.usageMetadata,
        } as GenerateContentResponse);
        yield response;
      }
      appendFileSync(filePath, `${safeJsonStringify(recordedResponse)}\n`);
    }

    return Promise.resolve(stream(this.filePath));
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    const response = await this.realGenerator.countTokens(request);
    const recordedResponse: FakeResponse = {
      method: 'countTokens',
      response: {
        totalTokens: response.totalTokens,
        cachedContentTokenCount: response.cachedContentTokenCount,
      },
    };
    appendFileSync(this.filePath, `${safeJsonStringify(recordedResponse)}\n`);
    return response;
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    const response = await this.realGenerator.embedContent(request);

    const recordedResponse: FakeResponse = {
      method: 'embedContent',
      response: {
        embeddings: response.embeddings,
        metadata: response.metadata,
      },
    };
    appendFileSync(this.filePath, `${safeJsonStringify(recordedResponse)}\n`);
    return response;
  }

  // Provider-independent methods

  async llmGenerateContent(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    if (!this.realGenerator.llmGenerateContent) {
      throw new Error(
        'Wrapped generator does not support provider-independent API',
      );
    }
    const response = await this.realGenerator.llmGenerateContent(
      request,
      userPromptId,
      options,
    );
    const recordedResponse: FakeResponse = {
      method: 'llmGenerateContent',
      response: {
        id: response.id,
        content: response.content,
        model: response.model,
        stopReason: response.stopReason,
        usage: response.usage,
      },
    };
    appendFileSync(this.filePath, `${safeJsonStringify(recordedResponse)}\n`);
    return response;
  }

  llmGenerateContentStream(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): LlmEventStream {
    if (!this.realGenerator.llmGenerateContentStream) {
      throw new Error(
        'Wrapped generator does not support provider-independent API',
      );
    }
    const realStream = this.realGenerator.llmGenerateContentStream(
      request,
      userPromptId,
      options,
    );
    const filePath = this.filePath;

    const recordedResponse: FakeResponse = {
      method: 'llmGenerateContentStream',
      response: [],
    };

    async function* recordingStream(): LlmEventStream {
      for await (const event of realStream) {
        (recordedResponse.response as LlmEvent[]).push(event);
        yield event;
      }
      appendFileSync(filePath, `${safeJsonStringify(recordedResponse)}\n`);
    }

    return recordingStream();
  }

  async llmCountTokens(request: LlmGenerateRequest): Promise<LlmTokenCount> {
    if (!this.realGenerator.llmCountTokens) {
      throw new Error(
        'Wrapped generator does not support provider-independent API',
      );
    }
    const response = await this.realGenerator.llmCountTokens(request);
    const recordedResponse: FakeResponse = {
      method: 'llmCountTokens',
      response: {
        totalTokens: response.totalTokens,
        breakdown: response.breakdown,
      },
    };
    appendFileSync(this.filePath, `${safeJsonStringify(recordedResponse)}\n`);
    return response;
  }
}
