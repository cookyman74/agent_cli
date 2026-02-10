/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';

// Re-export Gemini SDK types for consumers that need interface method types
// without importing @google/genai directly (e.g., LoggingContentGenerator).
export type {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
};
import type {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmTokenCount,
  GenerateOptions,
} from '../providers/types.js';
import type { LlmEventStream } from '../providers/events.js';
import { GoogleGenAI } from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import type { Config } from '../config/config.js';
import { loadApiKey } from './apiKeyCredentialStorage.js';

import type { UserTierId } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';
import { InstallationManager } from '../utils/installationManager.js';
import { FakeContentGenerator } from './fakeContentGenerator.js';
import { parseCustomHeaders } from '../utils/customHeaderUtils.js';
import { RecordingContentGenerator } from './recordingContentGenerator.js';
import { getVersion, resolveModel } from '../../index.js';
import {
  createAdapterBridge,
  type BridgeableGenerator,
} from '../providers/gemini/adapterBridge.js';
import { isMultiProviderEnabled } from '../providers/gemini/featureFlag.js';
import {
  selectProvider,
  resolveProviderModel,
} from '../providers/providerSelector.js';
import { ProviderType } from '../providers/providerTypes.js';
import { ProviderFactory } from '../providers/factory.js';
import { bootstrapGeminiProvider } from '../providers/gemini/bootstrap.js';
import { bootstrapClaudeProvider } from '../providers/claude/bootstrap.js';
import { bootstrapOpenAiProvider } from '../providers/openai/bootstrap.js';
import { bootstrapOpenAiCompatibleProvider } from '../providers/openai-compatible/bootstrap.js';
import type { BaseAdapter } from '../providers/baseAdapter.js';
import type { AuthType as ProviderAuthType } from '../providers/providerTypes.js';

/**
 * Gemini-specific content generator interface.
 * Uses @google/genai types directly for Gemini API integration.
 *
 * @deprecated For new multi-provider code, use ContentGenerator from '../providers/types.js'
 * which uses provider-independent types (LlmGenerateRequest, LlmGenerateResponse).
 */
export interface GeminiContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;

  userTierName?: string;

  // Provider-independent methods (optional for backward compatibility)
  llmGenerateContent?(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse>;

  llmGenerateContentStream?(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): LlmEventStream;

  llmCountTokens?(request: LlmGenerateRequest): Promise<LlmTokenCount>;

  /** Provider identifier (e.g., 'gemini', 'claude', 'openai'). */
  readonly providerName?: string;
}

/**
 * Type guard to check if a GeminiContentGenerator supports provider-independent methods.
 */
export function isProviderIndependentGenerator(
  gen: GeminiContentGenerator,
): gen is GeminiContentGenerator &
  Required<
    Pick<
      GeminiContentGenerator,
      'llmGenerateContent' | 'llmGenerateContentStream' | 'llmCountTokens'
    >
  > {
  return (
    typeof gen.llmGenerateContent === 'function' &&
    typeof gen.llmGenerateContentStream === 'function' &&
    typeof gen.llmCountTokens === 'function'
  );
}

/**
 * @deprecated Use GeminiContentGenerator for Gemini-specific code,
 * or ContentGenerator from '../providers/types.js' for multi-provider code.
 */
export type ContentGenerator = GeminiContentGenerator;

/**
 * Wrap a provider-independent BaseAdapter as a GeminiContentGenerator.
 *
 * Legacy methods (generateContent, etc.) throw because non-Gemini providers
 * do not support Gemini SDK types. Provider-independent llm* methods
 * delegate to the adapter.
 *
 * Callers should use `isProviderIndependentGenerator()` to detect llm*
 * availability before calling legacy methods.
 */
function wrapAdapterAsGenerator(adapter: BaseAdapter): GeminiContentGenerator {
  return {
    providerName: adapter.providerName,
    generateContent: () => {
      throw new Error(
        `Provider "${adapter.providerName}" does not support legacy Gemini API. Use llm* methods.`,
      );
    },
    generateContentStream: () => {
      throw new Error(
        `Provider "${adapter.providerName}" does not support legacy Gemini API. Use llm* methods.`,
      );
    },
    countTokens: () => {
      throw new Error(
        `Provider "${adapter.providerName}" does not support legacy Gemini API. Use llm* methods.`,
      );
    },
    embedContent: () => {
      throw new Error(
        `Provider "${adapter.providerName}" does not support legacy Gemini API. Use llm* methods.`,
      );
    },
    llmGenerateContent: (
      request: LlmGenerateRequest,
      userPromptId: string,
      options?: GenerateOptions,
    ) => adapter.generateContent(request, userPromptId, options),
    llmGenerateContentStream: (
      request: LlmGenerateRequest,
      userPromptId: string,
      options?: GenerateOptions,
    ) => adapter.generateContentStream(request, userPromptId, options),
    llmCountTokens: (request: LlmGenerateRequest) =>
      adapter.countTokens(request),
  };
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  LEGACY_CLOUD_SHELL = 'cloud-shell',
  COMPUTE_ADC = 'compute-default-credentials',
}

export type ContentGeneratorConfig = {
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType;
  proxy?: string;
};

export async function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): Promise<ContentGeneratorConfig> {
  const geminiApiKey =
    process.env['GEMINI_API_KEY'] || (await loadApiKey()) || undefined;
  const googleApiKey = process.env['GOOGLE_API_KEY'] || undefined;
  const googleCloudProject =
    process.env['GOOGLE_CLOUD_PROJECT'] ||
    process.env['GOOGLE_CLOUD_PROJECT_ID'] ||
    undefined;
  const googleCloudLocation = process.env['GOOGLE_CLOUD_LOCATION'] || undefined;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    authType,
    proxy: config?.getProxy(),
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.COMPUTE_ADC
  ) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    (googleApiKey || (googleCloudProject && googleCloudLocation))
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;

    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<GeminiContentGenerator> {
  const generator = await (async () => {
    if (gcConfig.fakeResponses) {
      const fakeGenerator = await FakeContentGenerator.fromFile(
        gcConfig.fakeResponses,
      );

      // Non-Gemini E2E tests: set providerName so that client.ts routes
      // through processLlmTurn (llm* methods) instead of Gemini legacy path.
      const llmProvider = process.env['LLM_PROVIDER'];
      if (llmProvider && llmProvider !== 'gemini') {
        fakeGenerator.providerName = llmProvider;
        // Resolve model for status bar (mirrors real non-Gemini path at line 303)
        const providerModel = resolveProviderModel(
          gcConfig.getModel(),
          llmProvider,
        );
        gcConfig.setModel(providerModel, true);
      }

      return new LoggingContentGenerator(fakeGenerator, gcConfig);
    }
    const version = await getVersion();
    const model = resolveModel(
      gcConfig.getModel(),
      gcConfig.getPreviewFeatures(),
    );
    const customHeadersEnv =
      process.env['GEMINI_CLI_CUSTOM_HEADERS'] || undefined;
    const userAgent = `GeminiCLI/${version}/${model} (${process.platform}; ${process.arch})`;
    const customHeadersMap = parseCustomHeaders(customHeadersEnv);
    const apiKeyAuthMechanism =
      process.env['GEMINI_API_KEY_AUTH_MECHANISM'] || 'x-goog-api-key';

    const baseHeaders: Record<string, string> = {
      ...customHeadersMap,
      'User-Agent': userAgent,
    };

    if (
      apiKeyAuthMechanism === 'bearer' &&
      (config.authType === AuthType.USE_GEMINI ||
        config.authType === AuthType.USE_VERTEX_AI) &&
      config.apiKey
    ) {
      baseHeaders['Authorization'] = `Bearer ${config.apiKey}`;
    }

    // ====================================================================
    // Multi-provider selection (ENABLE_MULTI_PROVIDER=true)
    // When a non-Gemini provider is selected, route through ProviderFactory
    // instead of the hardcoded GoogleGenAI path below.
    // ====================================================================
    if (isMultiProviderEnabled()) {
      const selection = selectProvider({
        authType: config.authType as unknown as ProviderAuthType,
      });

      if (selection.type !== ProviderType.Gemini) {
        // Non-Gemini provider: use ProviderFactory
        // Bootstrap all known providers so the factory can resolve any selection.
        bootstrapGeminiProvider();
        bootstrapClaudeProvider();
        bootstrapOpenAiProvider();
        bootstrapOpenAiCompatibleProvider();
        const factory = new ProviderFactory();
        const adapter = factory.create(selection.type, {
          apiKey: selection.apiKey,
          baseUrl: selection.baseUrl,
        });

        // Resolve provider-appropriate model and update config for status bar.
        // e.g., 'auto' → 'claude-sonnet-4-20250514' for Claude provider.
        const providerModel = resolveProviderModel(
          gcConfig.getModel(),
          selection.type,
        );
        gcConfig.setModel(providerModel, true);

        return new LoggingContentGenerator(
          wrapAdapterAsGenerator(adapter),
          gcConfig,
        );
      }
      // Gemini selected: backfill authType if missing so the legacy
      // Gemini path below doesn't throw "Unsupported authType".
      // selectProvider() already resolved the API key from env vars.
      if (!config.authType && selection.apiKey) {
        config = {
          ...config,
          authType: AuthType.USE_GEMINI,
          apiKey: selection.apiKey,
        };
      }
      // fall through to existing Gemini paths below
    }

    if (
      config.authType === AuthType.LOGIN_WITH_GOOGLE ||
      config.authType === AuthType.COMPUTE_ADC
    ) {
      const httpOptions = { headers: baseHeaders };
      return new LoggingContentGenerator(
        await createCodeAssistContentGenerator(
          httpOptions,
          config.authType,
          gcConfig,
          sessionId,
        ),
        gcConfig,
      );
    }

    if (
      config.authType === AuthType.USE_GEMINI ||
      config.authType === AuthType.USE_VERTEX_AI
    ) {
      let headers: Record<string, string> = { ...baseHeaders };
      if (gcConfig?.getUsageStatisticsEnabled()) {
        const installationManager = new InstallationManager();
        const installationId = installationManager.getInstallationId();
        headers = {
          ...headers,
          'x-gemini-api-privileged-user-id': `${installationId}`,
        };
      }
      const httpOptions = { headers };

      const googleGenAI = new GoogleGenAI({
        apiKey: config.apiKey === '' ? undefined : config.apiKey,
        vertexai: config.vertexai,
        httpOptions,
      });
      const bridgedModels = createAdapterBridge(
        googleGenAI.models as unknown as BridgeableGenerator,
        { apiKey: config.apiKey },
      );
      return new LoggingContentGenerator(
        bridgedModels as ContentGenerator,
        gcConfig,
      );
    }
    throw new Error(
      `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
    );
  })();

  if (gcConfig.recordResponses) {
    return new RecordingContentGenerator(generator, gcConfig.recordResponses);
  }

  return generator;
}
