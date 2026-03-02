/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AskUserTool } from './ask-user.js';
import {
  MessageBusType,
  QuestionType,
  type Question,
} from '../confirmation-bus/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

describe('AskUserTool', () => {
  let mockMessageBus: MessageBus;
  let tool: AskUserTool;

  beforeEach(() => {
    mockMessageBus = {
      publish: vi.fn().mockResolvedValue(undefined),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    } as unknown as MessageBus;
    tool = new AskUserTool(mockMessageBus);
  });

  it('should have correct metadata', () => {
    expect(tool.name).toBe('ask_user');
    expect(tool.displayName).toBe('Ask User');
  });

  describe('validateToolParams', () => {
    it('should return error if questions is missing', () => {
      // @ts-expect-error - Intentionally invalid params
      const result = tool.validateToolParams({});
      expect(result).toContain("must have required property 'questions'");
    });

    it('should return error if questions array is empty', () => {
      const result = tool.validateToolParams({ questions: [] });
      expect(result).toContain('must NOT have fewer than 1 items');
    });

    it('should return error if questions array exceeds max', () => {
      const questions = Array(5).fill({
        question: 'Test?',
        header: 'Test',
        options: [
          { label: 'A', description: 'A' },
          { label: 'B', description: 'B' },
        ],
      });
      const result = tool.validateToolParams({ questions });
      expect(result).toContain('must NOT have more than 4 items');
    });

    it('should return error if question field is missing', () => {
      const result = tool.validateToolParams({
        questions: [{ header: 'Test' } as unknown as Question],
      });
      expect(result).toContain("must have required property 'question'");
    });

    it('should return error if header field is missing', () => {
      const result = tool.validateToolParams({
        questions: [{ question: 'Test?' } as unknown as Question],
      });
      expect(result).toContain("must have required property 'header'");
    });

    it('should return error if header exceeds max length', () => {
      const result = tool.validateToolParams({
        questions: [{ question: 'Test?', header: 'This is way too long' }],
      });
      expect(result).toContain('must NOT have more than 12 characters');
    });

    it('should return error if options has fewer than 2 items', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Test?',
            header: 'Test',
            options: [{ label: 'A', description: 'A' }],
          },
        ],
      });
      expect(result).toContain('must NOT have fewer than 2 items');
    });

    it('should return error if options has more than 4 items', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Test?',
            header: 'Test',
            options: [
              { label: 'A', description: 'A' },
              { label: 'B', description: 'B' },
              { label: 'C', description: 'C' },
              { label: 'D', description: 'D' },
              { label: 'E', description: 'E' },
            ],
          },
        ],
      });
      expect(result).toContain('must NOT have more than 4 items');
    });

    it('should return null for valid params', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Which approach?',
            header: 'Approach',
            options: [
              { label: 'A', description: 'Option A' },
              { label: 'B', description: 'Option B' },
            ],
          },
        ],
      });
      expect(result).toBeNull();
    });
  });

  it('should publish ASK_USER_REQUEST and wait for response', async () => {
    const questions = [
      {
        question: 'How should we proceed with this task?',
        header: 'Approach',
        options: [
          {
            label: 'Quick fix (Recommended)',
            description:
              'Apply the most direct solution to resolve the immediate issue.',
          },
          {
            label: 'Comprehensive refactor',
            description:
              'Restructure the affected code for better long-term maintainability.',
          },
        ],
        multiSelect: false,
      },
    ];

    const invocation = tool.build({ questions });
    const executePromise = invocation.execute(new AbortController().signal);

    // Verify publish called with normalized questions (type defaults to CHOICE)
    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.ASK_USER_REQUEST,
        questions: questions.map((q) => ({
          ...q,
          type: QuestionType.CHOICE,
        })),
      }),
    );

    // Get the correlation ID from the published message
    const publishCall = vi.mocked(mockMessageBus.publish).mock.calls[0][0] as {
      correlationId: string;
    };
    const correlationId = publishCall.correlationId;
    expect(correlationId).toBeDefined();

    // Verify subscribe called
    expect(mockMessageBus.subscribe).toHaveBeenCalledWith(
      MessageBusType.ASK_USER_RESPONSE,
      expect.any(Function),
    );

    // Simulate response
    const subscribeCall = vi
      .mocked(mockMessageBus.subscribe)
      .mock.calls.find((call) => call[0] === MessageBusType.ASK_USER_RESPONSE);
    const handler = subscribeCall![1];

    const answers = { '0': 'Quick fix (Recommended)' };
    handler({
      type: MessageBusType.ASK_USER_RESPONSE,
      correlationId,
      answers,
    });

    const result = await executePromise;
    expect(result.returnDisplay).toContain('User answered:');
    expect(result.returnDisplay).toContain(
      '  Approach → Quick fix (Recommended)',
    );
    expect(JSON.parse(result.llmContent as string)).toEqual({ answers });
  });

  describe('schema - markdown field', () => {
    it('should accept markdown in option definition', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Which layout?',
            header: 'Layout',
            options: [
              {
                label: 'Option A',
                description: 'Horizontal layout',
                markdown: '┌─────────┐\n│ A │ B │\n└─────────┘',
              },
              {
                label: 'Option B',
                description: 'Vertical layout',
                markdown: '┌───┐\n│ A │\n├───┤\n│ B │\n└───┘',
              },
            ],
            multiSelect: false,
          },
        ],
      });
      expect(result).toBeNull();
    });

    it('should still work without markdown (backward compatible)', () => {
      const result = tool.validateToolParams({
        questions: [
          {
            question: 'Choose one',
            header: 'Choice',
            options: [
              { label: 'A', description: 'First' },
              { label: 'B', description: 'Second' },
            ],
            multiSelect: false,
          },
        ],
      });
      expect(result).toBeNull();
    });
  });

  it('should handle cancellation', async () => {
    const invocation = tool.build({
      questions: [
        {
          question: 'Which sections of the documentation should be updated?',
          header: 'Docs',
          options: [
            {
              label: 'User Guide',
              description: 'Update the main user-facing documentation.',
            },
            {
              label: 'API Reference',
              description: 'Update the detailed API documentation.',
            },
          ],
          multiSelect: true,
        },
      ],
    });

    const controller = new AbortController();
    const executePromise = invocation.execute(controller.signal);

    controller.abort();

    const result = await executePromise;
    expect(result.error?.message).toBe('Cancelled');
  });

  describe('cancelled response handling (Issue 1)', () => {
    it('should treat cancelled response as cancellation, not success', async () => {
      const invocation = tool.build({
        questions: [
          {
            question: 'Pick one',
            header: 'Test',
            options: [
              { label: 'A', description: 'First' },
              { label: 'B', description: 'Second' },
            ],
          },
        ],
      });

      const executePromise = invocation.execute(new AbortController().signal);

      // Get the response handler registered by subscribe
      const subscribeCall = vi
        .mocked(mockMessageBus.subscribe)
        .mock.calls.find(
          (call) => call[0] === MessageBusType.ASK_USER_RESPONSE,
        );
      const handler = subscribeCall![1];

      // Get correlationId from the published request
      const publishCall = vi.mocked(mockMessageBus.publish).mock
        .calls[0][0] as {
        correlationId: string;
      };

      // Simulate cancelled response (empty answers + cancelled flag)
      handler({
        type: MessageBusType.ASK_USER_RESPONSE,
        correlationId: publishCall.correlationId,
        answers: {},
        cancelled: true,
      });

      const result = await executePromise;
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Cancelled');
      expect(result.llmContent).toContain('cancelled');
    });

    it('should treat empty answers without cancelled flag as valid response', async () => {
      const invocation = tool.build({
        questions: [
          {
            question: 'Pick one',
            header: 'Test',
            options: [
              { label: 'A', description: 'First' },
              { label: 'B', description: 'Second' },
            ],
          },
        ],
      });

      const executePromise = invocation.execute(new AbortController().signal);

      const subscribeCall = vi
        .mocked(mockMessageBus.subscribe)
        .mock.calls.find(
          (call) => call[0] === MessageBusType.ASK_USER_RESPONSE,
        );
      const handler = subscribeCall![1];

      const publishCall = vi.mocked(mockMessageBus.publish).mock
        .calls[0][0] as {
        correlationId: string;
      };

      // Empty answers WITHOUT cancelled flag → still a valid response
      handler({
        type: MessageBusType.ASK_USER_RESPONSE,
        correlationId: publishCall.correlationId,
        answers: {},
      });

      const result = await executePromise;
      expect(result.error).toBeUndefined();
    });
  });

  describe('response timeout (Issue 3)', () => {
    it('should resolve with timeout error when no response received', async () => {
      vi.useFakeTimers();

      const invocation = tool.build({
        questions: [
          {
            question: 'Pick one',
            header: 'Test',
            options: [
              { label: 'A', description: 'First' },
              { label: 'B', description: 'Second' },
            ],
          },
        ],
      });

      const executePromise = invocation.execute(new AbortController().signal);

      // Advance past the timeout (5 minutes)
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      const result = await executePromise;
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('timed out');
      expect(result.llmContent).toContain('timed out');

      vi.useRealTimers();
    });

    it('should clear timeout on successful response', async () => {
      vi.useFakeTimers();

      const invocation = tool.build({
        questions: [
          {
            question: 'Pick one',
            header: 'Test',
            options: [
              { label: 'A', description: 'First' },
              { label: 'B', description: 'Second' },
            ],
          },
        ],
      });

      const executePromise = invocation.execute(new AbortController().signal);

      // Respond before timeout
      const subscribeCall = vi
        .mocked(mockMessageBus.subscribe)
        .mock.calls.find(
          (call) => call[0] === MessageBusType.ASK_USER_RESPONSE,
        );
      const handler = subscribeCall![1];
      const publishCall = vi.mocked(mockMessageBus.publish).mock
        .calls[0][0] as {
        correlationId: string;
      };

      handler({
        type: MessageBusType.ASK_USER_RESPONSE,
        correlationId: publishCall.correlationId,
        answers: { '0': 'A' },
      });

      const result = await executePromise;
      expect(result.error).toBeUndefined();

      vi.useRealTimers();
    });
  });
});
