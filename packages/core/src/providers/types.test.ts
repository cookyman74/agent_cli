/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type {
  LlmMessage,
  LlmContent,
  LlmTextContent,
  LlmImageContent,
  LlmToolCallContent,
  LlmToolResultContent,
  LlmThoughtContent,
  LlmRole,
  LlmGenerateRequest,
  LlmGenerateResponse,
  LlmStopReason,
  LlmTokenUsage,
  LlmToolDefinition,
} from './types.js';

describe('LlmMessage types', () => {
  describe('LlmRole', () => {
    it('should accept valid roles', () => {
      const roles: LlmRole[] = ['user', 'assistant', 'system', 'tool'];
      expect(roles).toHaveLength(4);
    });
  });

  describe('LlmTextContent', () => {
    it('should have correct structure', () => {
      const textContent: LlmTextContent = {
        type: 'text',
        text: 'Hello, world!',
      };
      expect(textContent.type).toBe('text');
      expect(textContent.text).toBe('Hello, world!');
    });
  });

  describe('LlmImageContent', () => {
    it('should support base64 images', () => {
      const imageContent: LlmImageContent = {
        type: 'image',
        source: {
          type: 'base64',
          mediaType: 'image/png',
          data: 'base64encodeddata...',
        },
      };
      expect(imageContent.source.type).toBe('base64');
      if (imageContent.source.type === 'base64') {
        expect(imageContent.source.data).toBe('base64encodeddata...');
      }
    });

    it('should support URL images with url field', () => {
      const imageContent: LlmImageContent = {
        type: 'image',
        source: {
          type: 'url',
          mediaType: 'image/png',
          url: 'https://example.com/image.png',
        },
      };
      expect(imageContent.source.type).toBe('url');
      if (imageContent.source.type === 'url') {
        expect(imageContent.source.url).toBe('https://example.com/image.png');
      }
    });
  });

  describe('LlmToolCallContent', () => {
    it('should have correct structure', () => {
      const toolCall: LlmToolCallContent = {
        type: 'tool_call',
        id: 'call-123',
        name: 'read_file',
        arguments: { path: '/tmp/test.txt' },
      };
      expect(toolCall.type).toBe('tool_call');
      expect(toolCall.name).toBe('read_file');
    });
  });

  describe('LlmToolResultContent', () => {
    it('should have correct structure', () => {
      const toolResult: LlmToolResultContent = {
        type: 'tool_result',
        toolCallId: 'call-123',
        content: 'File contents here',
      };
      expect(toolResult.type).toBe('tool_result');
      expect(toolResult.toolCallId).toBe('call-123');
    });

    it('should support optional error flag', () => {
      const toolResult: LlmToolResultContent = {
        type: 'tool_result',
        toolCallId: 'call-123',
        content: 'Error occurred',
        isError: true,
      };
      expect(toolResult.isError).toBe(true);
    });
  });

  describe('LlmThoughtContent', () => {
    it('should have correct structure', () => {
      const thought: LlmThoughtContent = {
        type: 'thought',
        thought: 'Let me think about this...',
      };
      expect(thought.type).toBe('thought');
    });

    it('should support optional metadata', () => {
      const thought: LlmThoughtContent = {
        type: 'thought',
        thought: 'Planning step',
        metadata: {
          step: 1,
          phase: 'planning',
          provider: 'gemini',
        },
      };
      expect(thought.metadata?.phase).toBe('planning');
    });
  });

  describe('LlmContent union type', () => {
    it('should accept all content types', () => {
      const contents: LlmContent[] = [
        { type: 'text', text: 'Hello' },
        {
          type: 'image',
          source: { type: 'base64', mediaType: 'image/png', data: 'xyz' },
        },
        { type: 'tool_call', id: '1', name: 'test', arguments: {} },
        { type: 'tool_result', toolCallId: '1', content: 'result' },
        {
          type: 'tool_result',
          toolCallId: '2',
          content: { structured: 'data' },
        }, // Extended type
        { type: 'thought', thought: 'thinking...' },
      ];
      expect(contents).toHaveLength(6);
    });
  });

  describe('LlmMessage', () => {
    it('should have correct structure', () => {
      const message: LlmMessage = {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      };
      expect(message.role).toBe('user');
      expect(message.content).toHaveLength(1);
    });

    it('should support optional fields', () => {
      const toolMessage: LlmMessage = {
        role: 'tool',
        content: [
          { type: 'tool_result', toolCallId: 'call-1', content: 'result' },
        ],
        name: 'read_file',
        toolCallId: 'call-1',
      };
      expect(toolMessage.name).toBe('read_file');
    });
  });
});

describe('LlmGenerateRequest types', () => {
  it('should have required fields', () => {
    const request: LlmGenerateRequest = {
      model: 'gemini-2.0-flash',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    };
    expect(request.model).toBeDefined();
    expect(request.messages).toBeDefined();
  });

  it('should support all optional fields', () => {
    const request: LlmGenerateRequest = {
      model: 'gemini-2.0-flash',
      messages: [],
      systemInstruction: 'You are a helpful assistant',
      tools: [],
      toolChoice: 'auto',
      temperature: 0.7,
      maxTokens: 1024,
      stopSequences: ['STOP'],
      topP: 0.9,
      topK: 40,
      responseFormat: 'json',
    };
    expect(request.temperature).toBe(0.7);
  });
});

describe('LlmGenerateResponse types', () => {
  it('should have correct structure', () => {
    const response: LlmGenerateResponse = {
      id: 'resp-123',
      content: [{ type: 'text', text: 'Response' }],
      model: 'gemini-2.0-flash',
      stopReason: 'end_turn',
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };
    expect(response.stopReason).toBe('end_turn');
  });

  it('should allow optional usage for streaming scenarios', () => {
    const response: LlmGenerateResponse = {
      id: 'resp-123',
      content: [{ type: 'text', text: 'Response' }],
      model: 'gemini-2.0-flash',
      stopReason: 'end_turn',
      // usage is optional now
    };
    expect(response.usage).toBeUndefined();
  });
});

describe('LlmStopReason', () => {
  it('should accept all valid stop reasons', () => {
    const reasons: LlmStopReason[] = [
      'end_turn',
      'max_tokens',
      'stop_sequence',
      'tool_use',
      'content_filter',
      'error',
    ];
    expect(reasons).toHaveLength(6);
  });
});

describe('LlmTokenUsage', () => {
  it('should have required fields', () => {
    const usage: LlmTokenUsage = {
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
    };
    expect(usage.totalTokens).toBe(300);
  });

  it('should support optional cachedTokens', () => {
    const usage: LlmTokenUsage = {
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
      cachedTokens: 50,
    };
    expect(usage.cachedTokens).toBe(50);
  });
});

describe('LlmToolDefinition', () => {
  it('should have correct structure', () => {
    const tool: LlmToolDefinition = {
      name: 'read_file',
      description: 'Reads a file from disk',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path to read',
          },
        },
        required: ['path'],
      },
    };
    expect(tool.name).toBe('read_file');
    expect(tool.parameters.properties['path'].type).toBe('string');
  });
});
