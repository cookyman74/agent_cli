# 03. 상세 기술 설계

## 3.1 프로바이더 독립적 타입 시스템

### 3.1.1 핵심 타입 정의

```typescript
// packages/core/src/providers/types.ts

/**
 * 프로바이더 독립적 메시지 타입
 */
export interface LlmMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: LlmContent[];
  name?: string; // 도구 호출 시 도구 이름
  toolCallId?: string; // 도구 응답 시 호출 ID
}

export type LlmContent =
  | LlmTextContent
  | LlmImageContent
  | LlmToolCallContent
  | LlmToolResultContent
  | LlmThoughtContent; // Gemini 사고 과정 데이터 지원

export interface LlmTextContent {
  type: 'text';
  text: string;
}

export interface LlmImageContent {
  type: 'image';
  source: LlmImageSource;
}

// URL 타입과 base64 타입의 필드를 명확히 분리
export type LlmImageSource =
  | { type: 'base64'; mediaType: string; data: string }
  | { type: 'url'; mediaType: string; url: string };

export interface LlmToolCallContent {
  type: 'tool_call';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LlmToolResultContent {
  type: 'tool_result';
  toolCallId: string;
  name?: string; // Gemini 등 일부 프로바이더를 위해 필요
  content: string | Record<string, unknown>; // Part[] 호환성을 위해 확장
  isError?: boolean;
}

/**
 * Gemini Thought (사고 과정) 데이터 지원
 * Gemini의 추론/계획 단계 출력을 저장하기 위한 타입
 * 다른 프로바이더에서도 유사 기능 지원 시 활용 가능
 */
export interface LlmThoughtContent {
  type: 'thought';
  thought: string;
  metadata?: {
    step?: number; // 사고 단계 번호
    phase?: string; // 'planning' | 'reasoning' | 'reflection'
    provider?: string; // 프로바이더별 확장 가능
    [key: string]: unknown;
  };
}
```

### 3.1.2 요청/응답 타입

```typescript
// packages/core/src/providers/types.ts

/**
 * 콘텐츠 생성 요청
 */
export interface LlmGenerateRequest {
  model: string;
  messages: LlmMessage[];
  systemInstruction?: string;
  tools?: LlmToolDefinition[];
  toolChoice?: 'auto' | 'none' | 'required' | { name: string };
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  topP?: number;
  topK?: number;
  responseFormat?: 'text' | 'json';
}

/**
 * 콘텐츠 생성 응답
 */
export interface LlmGenerateResponse {
  id: string;
  content: LlmContent[];
  model: string;
  stopReason: LlmStopReason;
  usage: LlmTokenUsage;

  // 원본 응답 (디버깅용)
  rawResponse?: unknown;
}

export type LlmStopReason =
  | 'end_turn' // 정상 종료
  | 'max_tokens' // 토큰 한도 도달
  | 'stop_sequence' // 중지 시퀀스 발견
  | 'tool_use' // 도구 호출 필요
  | 'content_filter' // 콘텐츠 필터링
  | 'error'; // 에러

export interface LlmTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}
```

### 3.1.3 도구 정의 타입

```typescript
// packages/core/src/providers/types.ts

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: LlmToolParameters;
}

export interface LlmToolParameters {
  type: 'object';
  properties: Record<string, LlmToolProperty>;
  required?: string[];
}

export interface LlmToolProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: LlmToolProperty; // array인 경우
  properties?: Record<string, LlmToolProperty>; // object인 경우
}
```

```typescript
// packages/core/src/providers/types.ts

export interface LlmStreamEvent {
  type: 'content_delta' | 'tool_call_delta' | 'message_end' | 'error';
  delta?: {
    text?: string;
    toolCall?: Partial<LlmToolCallContent>;
  };
  usage?: LlmTokenUsage;
  error?: LlmError;

  // Provider-specific metadata (optional)
  metadata?: Record<string, unknown>;

  // Didim integration: conversation tracking
  threadId?: string; // 대화 스레드 ID (multi-turn)
  qaId?: string; // 개별 Q&A 세션 ID
}

export type LlmStream = AsyncGenerator<LlmStreamEvent, void, unknown>;
```

## 3.2 ContentGenerator 인터페이스 재정의

### 3.2.1 새 인터페이스

```typescript
// packages/core/src/providers/types.ts

export interface ContentGenerator {
  /**
   * 프로바이더 정보
   */
  readonly providerName: string;
  readonly capabilities: ProviderCapabilities;

  /**
   * 콘텐츠 생성 (비스트리밍)
   */
  generateContent(
    request: LlmGenerateRequest,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse>;

  /**
   * 콘텐츠 생성 (스트리밍)
   */
  generateContentStream(
    request: LlmGenerateRequest,
    options?: GenerateOptions,
  ): Promise<LlmStream>;

  /**
   * 토큰 수 계산
   */
  countTokens(request: LlmGenerateRequest): Promise<LlmTokenCount>;

  /**
   * 임베딩 생성 (선택적)
   */
  embedContent?(request: LlmEmbedRequest): Promise<LlmEmbedResponse>;
}

export interface GenerateOptions {
  signal?: AbortSignal;
  timeout?: number;
  traceId?: string;
}

export interface LlmTokenCount {
  totalTokens: number;
  breakdown?: {
    messages: number;
    tools: number;
    system: number;
  };
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsToolCalls: boolean;
  supportsImageInput: boolean;
  supportsImageGeneration: boolean;
  supportsEmbedding: boolean;
  supportsTokenCount: boolean;
  supportsSystemMessage: boolean;
  maxContextLength: number;
  maxOutputTokens: number;
}
```

## 3.3 어댑터 구현

### 3.3.1 기본 어댑터 추상 클래스

```typescript
// packages/core/src/providers/baseAdapter.ts

export abstract class BaseAdapter implements ContentGenerator {
  abstract readonly providerName: string;
  abstract readonly capabilities: ProviderCapabilities;

  constructor(protected config: AdapterConfig) {}

  abstract generateContent(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse>;

  abstract generateContentStream(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmStream>;

  abstract countTokens(request: LlmGenerateRequest): Promise<LlmTokenCount>;

  // 기본 구현: 지원하지 않음
  embedContent(request: LlmEmbedRequest): Promise<LlmEmbedResponse> {
    throw new UnsupportedFeatureError(
      `Embedding is not supported by ${this.providerName}`,
    );
  }

  // 공통 유틸리티 메서드
  protected validateRequest(request: LlmGenerateRequest): void {
    if (!request.model) {
      throw new ValidationError('Model is required');
    }
    if (!request.messages || request.messages.length === 0) {
      throw new ValidationError('At least one message is required');
    }
  }

  protected handleError(error: unknown): never {
    if (error instanceof LlmError) {
      throw error;
    }
    throw new LlmError(
      LlmErrorType.UNKNOWN,
      `${this.providerName} error: ${error}`,
    );
  }
}

export interface AdapterConfig {
  apiKey?: string; // ADC 등 사용 시 선택적
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  // 프로바이더별 추가 설정 (예: googleAuthOptions)
  [key: string]: unknown;
}
```

### 3.3.2 Gemini 어댑터

```typescript
// packages/core/src/providers/gemini/adapter.ts

import { GoogleGenAI, GenerateContentParameters } from '@google/genai';
import { BaseAdapter, AdapterConfig } from '../baseAdapter';
import {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmStream,
  ProviderCapabilities,
} from '../types';
import { GeminiTypeConverter } from './converter';

export class GeminiAdapter extends BaseAdapter {
  readonly providerName = 'gemini';
  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsImageInput: true,
    supportsImageGeneration: true,
    supportsEmbedding: true,
    supportsTokenCount: true,
    supportsSystemMessage: true,
    maxContextLength: 1_000_000, // 모델별로 다를 수 있음 (구현 시 동적 처리 권장)
    maxOutputTokens: 8_192,
  };

  private client: GoogleGenAI;
  private converter: GeminiTypeConverter;

  constructor(config: AdapterConfig) {
    super(config);
    // apiKey가 없으면 ADC 등을 사용한다고 가정 (SDK 버전에 따라 처리)
    this.client = new GoogleGenAI({
      apiKey: config.apiKey || '',
      apiVersion: 'v1beta', // 예시
    });
    this.converter = new GeminiTypeConverter();
  }

  async generateContent(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    this.validateRequest(request);

    try {
      const geminiRequest = this.converter.toGeminiRequest(request);

      const modelParams = {
        model: request.model,
        ...this.config, // baseUrl 등 전달 가능한 경우
      };

      const response = await this.client
        .getGenerativeModel(modelParams)
        .generateContent(geminiRequest);

      return this.converter.fromGeminiResponse(response, request.model);
    } catch (error) {
      throw this.mapGeminiError(error);
    }
  }

  async generateContentStream(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmStream> {
    this.validateRequest(request);

    const geminiRequest = this.converter.toGeminiRequest(request);
    const model = this.client.getGenerativeModel({ model: request.model });

    return this.createStream(model, geminiRequest, options);
  }

  // countTokens, embedContent ...

  private async *createStream(
    model: GenerativeModel,
    request: GenerateContentParameters,
    options?: GenerateOptions,
  ): LlmStream {
    const stream = await model.generateContentStream(request);

    // 스트리밍 중 도구 호출 ID 유지를 위한 상태
    let currentToolCallId: string | null = null;
    let currentFunctionName: string | null = null;

    for await (const chunk of stream) {
      // Chunk 내에 함수 호출이 있는지 확인하여 ID 관리
      const parts = chunk.candidates?.[0]?.content?.parts || [];
      const functionCallPart = parts.find((p) => 'functionCall' in p);

      if (functionCallPart && 'functionCall' in functionCallPart) {
        // 새로운 함수 호출 시작으로 간주하거나, 기존 호출의 연속일 수 있음
        // Gemini 스트림에서 functionCall이 나뉘어 오는지 확인 필요
        // 여기서는 단순화를 위해 매 호출마다 새로운 ID를 부여하지 않고,
        // 스트림 컨텍스트 내에서 관리하는 로직을 예시로 듦.
        if (
          !currentToolCallId ||
          currentFunctionName !== functionCallPart.functionCall.name
        ) {
          currentToolCallId = crypto.randomUUID();
          currentFunctionName = functionCallPart.functionCall.name;
        }
      } else {
        // 텍스트 청크나 기타 이벤트
        if (parts.some((p) => 'text' in p)) {
          // 텍스트 전환 시 도구 호출 컨텍스트 초기화 여부 결정
        }
      }

      yield this.converter.fromGeminiStreamChunk(chunk, currentToolCallId);
    }
  }

  // ... mapGeminiError
}
```

### 3.3.3 Gemini 타입 변환기

```typescript
// packages/core/src/providers/gemini/converter.ts

import {
  GenerateContentParameters,
  GenerateContentResponse,
  Content,
  Part
} from '@google/genai';
import {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmMessage,
  LlmContent,
  LlmStreamEvent
} from '../types';

export class GeminiTypeConverter {
  /**
   * 공통 요청 → Gemini 요청
   */
  toGeminiRequest(request: LlmGenerateRequest): GenerateContentParameters {
    const { contents, systemInstruction } = this.toGeminiContents(request.messages);

    // 요청의 systemInstruction이 있으면 우선 사용, 없으면 메시지에서 추출한 것 사용
    const finalSystemInstruction = request.systemInstruction
      ? (systemInstruction.length > 0 ? { parts: [{ text: `${request.systemInstruction}\n${systemInstruction}` }] } : { parts: [{ text: request.systemInstruction }] })
      : (systemInstruction.length > 0 ? { parts: [{ text: systemInstruction }] } : undefined);

    return {
      contents,
      systemInstruction: finalSystemInstruction,
      tools: request.tools
        ? this.toGeminiTools(request.tools)
        : undefined,
      toolConfig: request.toolChoice
        ? this.toGeminiToolConfig(request.toolChoice)
        : undefined,
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.maxTokens,
        topP: request.topP,
        topK: request.topK,
        stopSequences: request.stopSequences,
        responseMimeType: request.responseFormat === 'json' ? 'application/json' : 'text/plain',
      },
    };
  }

  /**
   * Gemini 응답 → 공통 응답
   */
  fromGeminiResponse(response: GenerateContentResponse, model: string = 'unknown'): LlmGenerateResponse {
    const candidate = response.candidates?.[0];

    return {
      id: response.responseId || crypto.randomUUID(),
      content: this.fromGeminiParts(candidate?.content?.parts || []),
      model: response.modelVersion || model,
      stopReason: this.mapStopReason(candidate?.finishReason),
      usage: {
        promptTokens: response.usageMetadata?.promptTokenCount || 0,
        completionTokens: response.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata?.totalTokenCount || 0,
      },
      rawResponse: response,
    };
  }

  /**
   * Gemini 스트림 청크 → 공통 스트림 이벤트
   */
  fromGeminiStreamChunk(chunk: GenerateContentResponse, forcedToolCallId?: string | null): LlmStreamEvent {
    const candidate = chunk.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    // 텍스트 델타
    const textPart = parts.find(p => 'text' in p);
    if (textPart && 'text' in textPart) {
      return {
        type: 'content_delta',
        delta: { text: textPart.text },
      };
    }

    // 도구 호출 델타
    const functionPart = parts.find(p => 'functionCall' in p);
    if (functionPart && 'functionCall' in functionPart) {
      return {
        type: 'tool_call_delta',
        delta: {
          toolCall: {
            type: 'tool_call',
            id: forcedToolCallId || crypto.randomUUID(), // 외부에서 관리된 ID 사용 권장
            name: functionPart.functionCall.name,
            arguments: functionPart.functionCall.args,
          },
        },
      };
    }

    // 종료
    if (candidate?.finishReason) {
      return {
        type: 'message_end',
        usage: {
          promptTokens: chunk.usageMetadata?.promptTokenCount || 0,
          completionTokens: chunk.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: chunk.usageMetadata?.totalTokenCount || 0,
        },
        // stopReason 추가 필요 (types.ts 정의 확인)
      };
    }

    return { type: 'content_delta', delta: {} };
  }

  private toGeminiContents(messages: LlmMessage[]): { contents: Content[], systemInstruction: string } {
    const contents: Content[] = [];
    let systemInstruction = '';

    for (const msg of messages) {
      if (msg.role === 'system') {
        const textParts = msg.content.filter(c => c.type === 'text') as LlmTextContent[];
        systemInstruction += textParts.map(c => c.text).join('\n') + '\n';
        continue;
      }

      const role = msg.role === 'assistant' ? 'model' : 'user';
      // tool role 메시지도 Gemini에서는 user role에 functionResponse Parts로 포함됨

      contents.push({
        role,
        parts: this.toGeminiParts(msg.content),
      });
    }

    return { contents, systemInstruction };
  }

  private toGeminiParts(contents: LlmContent[]): Part[] {
    return contents.map(content => {
      switch (content.type) {
        case 'text':
          return { text: content.text };
        case 'image':
          if (content.source.type === 'url') {
             // URL 이미지는 fileData로 처리 (Gemini File API가 지원하는 URI여야 함)
             // 일반 HTTP URL인 경우 Adapter 레벨에서 다운로드 후 base64 변환하거나
             // 5.x 버전 SDK의 fileData 처리 확인 필요.
             // 여기서는 설계를 위해 fileData로 매핑
             return {
               fileData: {
                 mimeType: content.source.mediaType,
                 fileUri: content.source.data,
               }
             };
          }
          return {
            inlineData: {
              mimeType: content.source.mediaType,
              data: content.source.data,
            },
          };
        case 'tool_call':
          return {
            functionCall: {
              name: content.name,
              args: content.arguments,
            },
          };
        case 'tool_result':
          return {
            functionResponse: {
              name: content.name || content.toolCallId, // name 필수
              response: { result: content.content },
            },
          };
      }
    });
  }

  private fromGeminiParts(parts: Part[]): LlmContent[] {
    return parts.map(part => {
      if ('text' in part) {
        return { type: 'text', text: part.text };
      }
      if ('functionCall' in part) {
        return {
          type: 'tool_call',
          id: crypto.randomUUID(), // 응답 객체에서 복원할 수 없는 경우 랜덤 생성 (Stateful 관리 필요하면 상위에서 처리)
          name: part.functionCall.name,
          arguments: part.functionCall.args,
        };
      }
      if ('inlineData' in part) {
        return {
           type: 'image',
           source: {
             type: 'base64',
             mediaType: part.inlineData.mimeType,
             data: part.inlineData.data
           }
        };
      }
      // 기타 타입 처리
      return { type: 'text', text: '' };
    });
  }

  // ... mapStopReason, toGeminiTools ...

  private toGeminiToolConfig(choice: any): ToolConfig {
     // 구현 필요
     return {};
  }
}

  private mapStopReason(reason?: string): LlmStopReason {
    switch (reason) {
      case 'STOP': return 'end_turn';
      case 'MAX_TOKENS': return 'max_tokens';
      case 'SAFETY': return 'content_filter';
      case 'TOOL_USE': return 'tool_use';
      default: return 'end_turn';
    }
  }

  private toGeminiTools(tools: LlmToolDefinition[]): Tool[] {
    return [{
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      })),
    }];
  }
}
```

### 3.3.4 Claude 어댑터

```typescript
// packages/core/src/providers/claude/adapter.ts

import Anthropic from '@anthropic-ai/sdk';
import { BaseAdapter, AdapterConfig } from '../baseAdapter';
import {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmStream,
  ProviderCapabilities,
} from '../types';
import { ClaudeTypeConverter } from './converter';

export class ClaudeAdapter extends BaseAdapter {
  readonly providerName = 'claude';
  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsImageInput: true, // URL 이미지는 Converter에서 다운로드 처리 필요
    supportsImageGeneration: false,
    supportsEmbedding: false,
    supportsTokenCount: false,
    supportsSystemMessage: true,
    maxContextLength: 200_000,
    maxOutputTokens: 8_192,
  };

  private client: Anthropic;
  private converter: ClaudeTypeConverter;

  constructor(config: AdapterConfig) {
    super(config);
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.converter = new ClaudeTypeConverter();
  }

  async generateContent(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    this.validateRequest(request);

    // 이미지 등 비동기 리소스 해결 (URL 다운로드)
    const resolvedRequest = await this.converter.resolveResources(request);
    const claudeRequest = this.converter.toClaudeRequest(
      resolvedRequest,
      false,
    );

    try {
      const response = await this.client.messages.create(claudeRequest);
      return this.converter.fromClaudeResponse(response);
    } catch (error) {
      throw this.mapClaudeError(error);
    }
  }

  async generateContentStream(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmStream> {
    this.validateRequest(request);

    const resolvedRequest = await this.converter.resolveResources(request);
    const claudeRequest = this.converter.toClaudeRequest(resolvedRequest, true);

    return this.createStream(claudeRequest, options);
  }

  // ... (countTokens, createStream, mapClaudeError 구현은 기존과 동일하되 createStream 로직 보완 필요)

  private async *createStream(
    request: Anthropic.MessageCreateParams,
    options?: GenerateOptions,
  ): LlmStream {
    const stream = await this.client.messages.stream(request);

    // 스트림 어셈블러: 델타를 모아 완전한 툴 호출 등을 구성하는데 도움을 줄 수 있음
    // 여기서는 Converter가 Delta 이벤트를 직접 처리하도록 위임
    for await (const event of stream) {
      yield this.converter.fromClaudeStreamEvent(event);
    }
  }

  private mapClaudeError(error: unknown): LlmError {
    // ... (기존 에러 매핑 로직)
    return new LlmError(LlmErrorType.UNKNOWN, String(error));
  }
}
```

### 3.3.5 Claude 타입 변환기 (추가)

```typescript
// packages/core/src/providers/claude/converter.ts

import Anthropic from '@anthropic-ai/sdk';
import {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmMessage,
  LlmContent,
  LlmStreamEvent,
  LlmStopReason,
} from '../types';

export class ClaudeTypeConverter {
  /**
   * 외부 리소스(이미지 URL 등) 다운로드 및 포맷팅
   */
  async resolveResources(
    request: LlmGenerateRequest,
  ): Promise<LlmGenerateRequest> {
    // 실제 구현 시:
    // 1. 메시지 내의 모든 Image Content 스캔
    // 2. URL 타입인 경우 fetch 후 base64 변환
    // 3. 변환된 데이터로 교체된 새 request 반환
    return request; // Placeholder
  }

  toClaudeRequest(
    request: LlmGenerateRequest,
    stream: boolean,
  ): Anthropic.MessageCreateParams {
    // System Instruction 병합 정책: Request 우선 + 메시지 내 System은 Prepend
    const { system, messages } = this.splitSystemMessage(request.messages);
    const finalSystem = request.systemInstruction
      ? system
        ? `${request.systemInstruction}\n${system}`
        : request.systemInstruction
      : system;

    return {
      model: request.model,
      system: finalSystem,
      messages: this.toClaudeMessages(messages),
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature,
      top_p: request.topP,
      top_k: request.topK,
      stop_sequences: request.stopSequences,
      tools: request.tools ? this.toClaudeTools(request.tools) : undefined,
      tool_choice: request.toolChoice
        ? this.toClaudeToolChoice(request.toolChoice)
        : undefined,
      stream,
    } as any; // stream 타입 호환성 위해 any 캐스팅 혹은 분기 처리
  }

  // ... (fromClaudeResponse, splitSystemMessage, toClaudeMessages, toClaudeContent 기존 유지)

  fromClaudeStreamEvent(event: Anthropic.MessageStreamEvent): LlmStreamEvent {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      return {
        type: 'content_delta',
        delta: { text: event.delta.text },
      };
    }

    // Tool Call Stream 지원
    if (
      event.type === 'content_block_start' &&
      event.content_block.type === 'tool_use'
    ) {
      return {
        type: 'tool_call_delta',
        delta: {
          toolCall: {
            type: 'tool_call',
            id: event.content_block.id,
            name: event.content_block.name,
            arguments: {}, // 시작 시점엔 빈 객체
          },
        },
      };
    }

    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'input_json_delta'
    ) {
      // 부분 JSON 전달.
      // 주의: 공통 인터페이스가 'arguments 문자열 델타'를 받는지 '파싱된 객체'를 받는지 정의 필요.
      // 여기서는 문자열 델타를 전달하거나, 상위에서 조립해야 함.
      // 임시적으로 arguments 필드에 partial string을 넣는 방식 사용 가능 (타입 정의 확인 필요)
      return {
        type: 'tool_call_delta',
        delta: {
          toolCall: {
            // 부분 문자열 전달 (LlmToolCallContent 정의가 string args 지원 시)
            // 현재 정의는 Record<string, unknown>이므로,
            // **StreamAssembler**가 필수적임.
            // 이 단계에서는 raw string 델타를 보낼 방법이 마땅치 않으므로
            // 임시로 무시하거나 별도 이벤트 타입 필요.
          },
        },
      };
    }

    if (event.type === 'message_stop') {
      // usage 정보가 event 내에 없을 수 있음 (message_delta 등에서 확인 필요)
      return { type: 'message_end' };
    }

    return { type: 'content_delta', delta: {} };
  }

  private toClaudeToolChoice(
    choice: NonNullable<LlmGenerateRequest['toolChoice']>,
  ): Anthropic.MessageCreateParams.ToolChoice {
    if (choice === 'auto') return { type: 'auto' };
    if (choice === 'none') return { type: 'any' }; // 주의: Claude는 'none' 명시가 없음, 툴을 안 보내거나 auto
    if (choice === 'required') return { type: 'any' };
    if (typeof choice === 'object' && choice.name) {
      return { type: 'tool', name: choice.name };
    }
    return { type: 'auto' };
  }

  // ... (기타 메서드)
}
```

### 3.3.6 Claude 어댑터 (추가)

```typescript
// packages/core/src/providers/claude/adapter.ts

import Anthropic from '@anthropic-ai/sdk';
import { BaseAdapter, AdapterConfig } from '../baseAdapter';
import {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmStream,
  ProviderCapabilities,
  LlmError,
  LlmErrorType,
  LlmTokenCount,
} from '../types';
import { ClaudeTypeConverter } from './converter';
import { GenerateOptions } from '../contentGenerator';

export class ClaudeAdapter extends BaseAdapter {
  readonly providerName = 'claude';
  readonly capabilities: ProviderCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsImageInput: true,
    supportsImageGeneration: false, // Claude는 이미지 생성 미지원
    supportsEmbedding: false, // Claude는 임베딩 미지원
    supportsTokenCount: false, // 토큰 카운트는 추정만 가능
    supportsSystemMessage: true,
    maxContextLength: 200_000,
    maxOutputTokens: 8_192,
  };

  private client: Anthropic;
  private converter: ClaudeTypeConverter;

  constructor(config: AdapterConfig) {
    super(config);
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.converter = new ClaudeTypeConverter();
  }

  async generateContent(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmGenerateResponse> {
    this.validateRequest(request);

    try {
      const claudeRequest = this.converter.toClaudeRequest(request, false);
      const response = await this.client.messages.create(claudeRequest);
      return this.converter.fromClaudeResponse(response);
    } catch (error) {
      throw this.mapClaudeError(error);
    }
  }

  async generateContentStream(
    request: LlmGenerateRequest,
    userPromptId: string,
    options?: GenerateOptions,
  ): Promise<LlmStream> {
    this.validateRequest(request);

    const claudeRequest = this.converter.toClaudeRequest(request, true);

    return this.createStream(claudeRequest, options);
  }

  async countTokens(request: LlmGenerateRequest): Promise<LlmTokenCount> {
    // Claude는 공식 토큰 카운트 API가 없으므로 추정
    // tiktoken 또는 간단한 휴리스틱 사용
    const text = request.messages
      .map((m) => m.content.map((c) => ('text' in c ? c.text : '')).join(''))
      .join('');

    // 대략적인 추정: 4자당 1토큰
    const estimatedTokens = Math.ceil(text.length / 4);

    return {
      totalTokens: estimatedTokens,
    };
  }

  private async *createStream(
    request: Anthropic.MessageCreateParams,
    options?: GenerateOptions,
  ): LlmStream {
    const stream = await this.client.messages.stream(request);

    for await (const event of stream) {
      yield this.converter.fromClaudeStreamEvent(event);
    }
  }

  private mapClaudeError(error: unknown): LlmError {
    if (error instanceof Anthropic.APIError) {
      switch (error.status) {
        case 429:
          return new LlmError(LlmErrorType.RATE_LIMIT, error.message);
        case 401:
        case 403:
          return new LlmError(LlmErrorType.AUTHENTICATION, error.message);
        case 400:
          return new LlmError(LlmErrorType.INVALID_REQUEST, error.message);
        case 529:
          return new LlmError(LlmErrorType.MODEL_OVERLOADED, error.message);
      }
    }
    return new LlmError(LlmErrorType.UNKNOWN, String(error));
  }
}
```

### 3.3.7 OpenAI 어댑터 (구조 예시)

```typescript
// packages/core/src/providers/openai/adapter.ts

import OpenAI from 'openai';
import { BaseAdapter, AdapterConfig } from '../baseAdapter';
import {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmStream,
  ProviderCapabilities,
  LlmTokenCount,
} from '../types';
import { OpenAITypeConverter } from './converter';
import { GenerateOptions } from '../contentGenerator';

export class OpenAIAdapter extends BaseAdapter {
  // ... (implementation as previously shown)
}
```

### 3.3.8 OpenAI 타입 변환기 (추가)

```typescript
// packages/core/src/providers/openai/converter.ts

import OpenAI from 'openai';
import {
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmMessage,
  LlmContent,
  LlmStreamEvent,
  LlmStopReason,
} from '../types';

export class OpenAITypeConverter {
  toOpenAIRequest(
    request: LlmGenerateRequest,
  ): OpenAI.Chat.ChatCompletionCreateParamsNonStreaming {
    // OpenAI는 system role을 messages 배열 내에서 지원
    const messages = this.toOpenAIMessages(
      request.messages,
      request.systemInstruction,
    );

    return {
      model: request.model,
      messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      top_p: request.topP,
      stop: request.stopSequences,
      tools: request.tools ? this.toOpenAITools(request.tools) : undefined,
      tool_choice: request.toolChoice
        ? this.toOpenAIToolChoice(request.toolChoice)
        : undefined,
      response_format:
        request.responseFormat === 'json' ? { type: 'json_object' } : undefined,
    };
  }

  fromOpenAIResponse(
    response: OpenAI.Chat.ChatCompletion,
  ): LlmGenerateResponse {
    const choice = response.choices[0];

    return {
      id: response.id,
      content: this.fromOpenAIMessage(choice.message),
      model: response.model,
      stopReason: this.mapStopReason(choice.finish_reason),
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      rawResponse: response,
    };
  }

  private toOpenAIMessages(
    messages: LlmMessage[],
    systemInstruction?: string,
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (systemInstruction) {
      openaiMessages.push({ role: 'system', content: systemInstruction });
    }

    for (const msg of messages) {
      if (msg.role === 'system') {
        // 이미 systemInstruction으로 처리되었거나, 별도 system 메시지로 추가
        const content = msg.content
          .map((c) => ('text' in c ? c.text : ''))
          .join('\n');
        openaiMessages.push({ role: 'system', content });
        continue;
      }

      if (msg.role === 'tool') {
        // role: tool -> tool result
        for (const content of msg.content) {
          if (content.type === 'tool_result') {
            openaiMessages.push({
              role: 'tool',
              tool_call_id: content.toolCallId,
              content: content.content,
            });
          }
        }
        continue;
      }

      openaiMessages.push({
        role: msg.role as 'user' | 'assistant',
        content: this.toOpenAIContent(msg.content),
        // assistant tool calls 처리 필요
        tool_calls:
          msg.role === 'assistant'
            ? this.extractToolCalls(msg.content)
            : undefined,
      } as any);
    }

    return openaiMessages;
  }

  private toOpenAIContent(contents: LlmContent[]): any {
    // 텍스트만 있는 경우 문자열로 반환 가능
    const textOnly = contents.every((c) => c.type === 'text');
    if (textOnly) {
      return contents.map((c) => (c as any).text).join('');
    }

    return contents
      .map((content) => {
        switch (content.type) {
          case 'text':
            return { type: 'text', text: content.text };
          case 'image':
            return {
              type: 'image_url',
              image_url: {
                url:
                  content.source.type === 'url'
                    ? content.source.data
                    : `data:${content.source.mediaType};base64,${content.source.data}`,
              },
            };
          // tool_call, tool_result는 message level에서 처리 (위 loop 참조)
        }
      })
      .filter(Boolean);
  }

  private extractToolCalls(
    contents: LlmContent[],
  ): OpenAI.Chat.ChatCompletionMessageToolCall[] | undefined {
    const toolCalls = contents
      .filter((c) => c.type === 'tool_call')
      .map((c) => ({
        id: (c as any).id,
        type: 'function',
        function: {
          name: (c as any).name,
          arguments: JSON.stringify((c as any).arguments),
        },
      }));
    return toolCalls.length > 0 ? (toolCalls as any) : undefined;
  }

  private fromOpenAIMessage(
    message: OpenAI.Chat.ChatCompletionMessage,
  ): LlmContent[] {
    const contents: LlmContent[] = [];

    if (message.content) {
      contents.push({ type: 'text', text: message.content });
    }

    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        contents.push({
          type: 'tool_call',
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        });
      }
    }

    return contents;
  }

  // ... mapStopReason, toOpenAITools ...
  private toOpenAITools(tools: any[]): any[] {
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  private toOpenAIToolChoice(choice: any): any {
    return choice;
  }

  private mapStopReason(reason: any): LlmStopReason {
    if (reason === 'stop') return 'end_turn';
    if (reason === 'length') return 'max_tokens';
    if (reason === 'tool_calls') return 'tool_use';
    return 'end_turn';
  }
}
```

````

### 3.4 vLLM 및 기타 OpenAI 호환 프로바이더 확장

vLLM, LM Studio 등 OpenAI API 규격을 따르는 다양한 sLM(small Language Models)을 지원하기 위해 `OpenAICompatibleAdapter`를 도입합니다.

```typescript
// packages/core/src/providers/openai/compatibleAdapter.ts

import { OpenAIAdapter } from './adapter';
import { AdapterConfig } from '../baseAdapter';
import { ModelSpecification } from '../types';

export interface OpenAICompatibleConfig extends AdapterConfig {
  baseUrl: string; // 필수
  modelSpec?: ModelSpecification; // 모델별 기능 명세
}

export class OpenAICompatibleAdapter extends OpenAIAdapter {
    constructor(config: OpenAICompatibleConfig) {
        super(config);
        // BaseUrl 등 오버라이딩 처리
    }
}
````

## 3.5 프로바이더 레지스트리 (제거됨)

`ProviderRegistry`는 `Config` 시스템과의 충돌로 인해 제거되었습니다. 대신
`createContentGenerator` 팩토리를 확장하여 사용합니다.

```typescript
// packages/core/src/providers/registry.ts
// 파일 삭제
```

### 3.6 통합 팩토리 (createContentGenerator 확장)

기존 `createContentGenerator` 함수를 확장하여 `LLM_PROVIDER` 설정에 따라 적절한
어댑터를 인스턴스화하고, 로깅/레코딩/헤더 처리를 공통으로 적용합니다.

```typescript
// packages/core/src/core/contentGenerator.ts

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
    const providerName = process.env['LLM_PROVIDER'] || 'gemini';

    let generator: ContentGenerator;

    if (providerName === 'gemini') {
        // 기존 Gemini 로직
        const googleGenAI = new GoogleGenAI({ ... });
        generator = new GeminiAdapter(googleGenAI, config);
    } else if (providerName === 'claude') {
        const apiKey = process.env['ANTHROPIC_API_KEY'];
        if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');
        generator = new ClaudeAdapter({ apiKey });
    } else if (providerName === 'openai') {
        const apiKey = process.env['OPENAI_API_KEY'];
        if (!apiKey) throw new Error('OPENAI_API_KEY required');
        generator = new OpenAIAdapter({ apiKey });
    } else {
        throw new Error(`Unsupported provider: ${providerName}`);
    }

    // Apply Common Wrappers
    if (gcConfig.recordResponses) {
        generator = new RecordingContentGenerator(generator, gcConfig.recordResponses);
    }

    return generator;
}
```

## 3.7 에러 처리

```typescript
// packages/core/src/providers/errors.ts

export enum LlmErrorType {
  RATE_LIMIT = 'rate_limit',
  AUTHENTICATION = 'authentication',
  INVALID_REQUEST = 'invalid_request',
  MODEL_OVERLOADED = 'model_overloaded',
  CONTEXT_LENGTH_EXCEEDED = 'context_length_exceeded',
  CONTENT_FILTER = 'content_filter',
  NETWORK = 'network',
  TIMEOUT = 'timeout',
  UNSUPPORTED_FEATURE = 'unsupported_feature',
  UNKNOWN = 'unknown',
}

export class LlmError extends Error {
  constructor(
    public readonly type: LlmErrorType,
    message: string,
    public readonly provider?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'LlmError';
  }

  get isRetryable(): boolean {
    return [
      LlmErrorType.RATE_LIMIT,
      LlmErrorType.MODEL_OVERLOADED,
      LlmErrorType.NETWORK,
      LlmErrorType.TIMEOUT,
    ].includes(this.type);
  }
}

export class UnsupportedFeatureError extends LlmError {
  constructor(message: string, provider?: string) {
    super(LlmErrorType.UNSUPPORTED_FEATURE, message, provider);
    this.name = 'UnsupportedFeatureError';
  }
}

export class ValidationError extends LlmError {
  constructor(message: string) {
    super(LlmErrorType.INVALID_REQUEST, message);
    this.name = 'ValidationError';
  }
}
```

## 3.8 기존 코드 마이그레이션

### 3.7.1 GeminiClient 수정

```typescript
// packages/core/src/core/client.ts

// Before
import { GoogleGenAI } from '@google/genai';

export class GeminiClient {
  private generator: GoogleGenAI;

  constructor(apiKey: string) {
    this.generator = new GoogleGenAI({ apiKey });
  }
}

// After
import { ContentGenerator } from '../providers/types';
import { ProviderRegistry } from '../providers/registry';

export class GeminiClient {
  private generator: ContentGenerator;

  constructor(generator?: ContentGenerator) {
    // 의존성 주입이 없으면 활성 프로바이더 조회 시도, 없으면 기본값으로 초기화하거나 오류 발생
    const registry = ProviderRegistry.getInstance();

    if (generator) {
      this.generator = generator;
    } else {
      try {
        this.generator = registry.getActive();
      } catch (e) {
        // Fallback: 환경 변수로 초기화 시도
        this.generator = ProviderFactory.createFromEnv();
      }
    }
  }
}
```

### 3.7.2 하위 호환성 유지

````typescript
// packages/core/src/index.ts

// 기존 API 유지 (deprecated 마킹)
// GoogleGenAI 내보내기 제거 또는 래퍼 제공
// export { GeminiAdapter as GoogleGenAI } from './providers/gemini/adapter'; // 삭제: Breaking Change


// 새 API
export {
  ContentGenerator,
  LlmGenerateRequest,
  LlmGenerateResponse,
  ProviderRegistry,
  ProviderFactory,
} from './providers';

### 3.7.3 ModelRouterService 수정

`ModelRouterService`는 이제 `ProviderRegistry`를 사용하여 동적으로 프로바이더를 선택해야 합니다.

```typescript
// packages/core/src/routing/modelRouterService.ts

import { ProviderRegistry } from '../providers/registry';
import { detectProvider } from '../providers/utils'; // 새로 추가 (5.6.1 참조)

export class ModelRouterService {
  async route(request: LlmGenerateRequest): Promise<LlmGenerateResponse> {
    // 1. 모델 이름으로 프로바이더 감지
    const providerName = detectProvider(request.model);

    // 2. 레지스트리에서 프로바이더 조회 (없으면 활성 프로바이더 사용)
    const registry = ProviderRegistry.getInstance();
    let provider;

    try {
      provider = registry.get(providerName);
    } catch {
      provider = registry.getActive();
    }

    // 3. 요청 위임
    return provider.generateContent(request);
  }
}
````

```

```
