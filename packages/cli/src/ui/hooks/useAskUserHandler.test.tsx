/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '../../test-utils/render.js';
import { useAskUserHandler } from './useAskUserHandler.js';
import {
  MessageBusType,
  QuestionType,
  type AskUserRequest,
  type Config,
} from '@didim365/agent-cli-core';

describe('useAskUserHandler', () => {
  let mockMessageBus: {
    subscribe: ReturnType<typeof vi.fn>;
    unsubscribe: ReturnType<typeof vi.fn>;
    publish: ReturnType<typeof vi.fn>;
  };
  let mockConfig: Config;

  beforeEach(() => {
    mockMessageBus = {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      publish: vi.fn().mockResolvedValue(undefined),
    };
    mockConfig = {
      getMessageBus: () => mockMessageBus,
    } as unknown as Config;
  });

  it('should return null when no request is active', () => {
    const { result } = renderHook(() => useAskUserHandler(mockConfig));
    expect(result.current).toBeNull();
  });

  it('should return null when config is null', () => {
    const { result } = renderHook(() => useAskUserHandler(null));
    expect(result.current).toBeNull();
  });

  describe('subscribe/unsubscribe lifecycle', () => {
    it('should subscribe to ASK_USER_REQUEST on mount', () => {
      renderHook(() => useAskUserHandler(mockConfig));

      expect(mockMessageBus.subscribe).toHaveBeenCalledWith(
        MessageBusType.ASK_USER_REQUEST,
        expect.any(Function),
      );
    });

    it('should unsubscribe on unmount', () => {
      const { unmount } = renderHook(() => useAskUserHandler(mockConfig));

      unmount();

      expect(mockMessageBus.unsubscribe).toHaveBeenCalledWith(
        MessageBusType.ASK_USER_REQUEST,
        expect.any(Function),
      );
    });

    it('should not subscribe when config is null', () => {
      renderHook(() => useAskUserHandler(null));

      expect(mockMessageBus.subscribe).not.toHaveBeenCalled();
    });
  });

  describe('correlation roundtrip', () => {
    const testRequest: AskUserRequest = {
      type: MessageBusType.ASK_USER_REQUEST,
      correlationId: 'test-correlation-id-123',
      questions: [
        {
          question: 'Which approach?',
          header: 'Approach',
          type: QuestionType.CHOICE,
          options: [
            { label: 'A', description: 'First' },
            { label: 'B', description: 'Second' },
          ],
        },
      ],
    };

    it('should set dialog state when request is received', () => {
      const { result } = renderHook(() => useAskUserHandler(mockConfig));

      // Get the handler registered via subscribe
      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call: unknown[]) => call[0] === MessageBusType.ASK_USER_REQUEST,
      )![1];

      act(() => {
        handler(testRequest);
      });

      expect(result.current).not.toBeNull();
      expect(result.current!.questions).toEqual(testRequest.questions);
      expect(typeof result.current!.onSubmit).toBe('function');
      expect(typeof result.current!.onCancel).toBe('function');
    });

    it('should publish ASK_USER_RESPONSE with correct correlationId on submit', () => {
      const { result } = renderHook(() => useAskUserHandler(mockConfig));

      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call: unknown[]) => call[0] === MessageBusType.ASK_USER_REQUEST,
      )![1];

      act(() => {
        handler(testRequest);
      });

      const answers = { '0': 'A' };
      act(() => {
        result.current!.onSubmit(answers);
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith({
        type: MessageBusType.ASK_USER_RESPONSE,
        correlationId: 'test-correlation-id-123',
        answers,
      });
      // Dialog should be cleared after submit
      expect(result.current).toBeNull();
    });

    it('should publish cancelled ASK_USER_RESPONSE on cancel (Issue 1)', () => {
      const { result } = renderHook(() => useAskUserHandler(mockConfig));

      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call: unknown[]) => call[0] === MessageBusType.ASK_USER_REQUEST,
      )![1];

      act(() => {
        handler(testRequest);
      });

      act(() => {
        result.current!.onCancel();
      });

      expect(mockMessageBus.publish).toHaveBeenCalledWith({
        type: MessageBusType.ASK_USER_RESPONSE,
        correlationId: 'test-correlation-id-123',
        answers: {},
        cancelled: true,
      });
      // Dialog should be cleared after cancel
      expect(result.current).toBeNull();
    });
  });

  describe('concurrent request handling (Issue 2)', () => {
    it('should auto-cancel previous request when new request arrives', () => {
      const { result } = renderHook(() => useAskUserHandler(mockConfig));

      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call: unknown[]) => call[0] === MessageBusType.ASK_USER_REQUEST,
      )![1];

      // First request
      const request1: AskUserRequest = {
        type: MessageBusType.ASK_USER_REQUEST,
        correlationId: 'first-request',
        questions: [
          {
            question: 'First?',
            header: 'Q1',
            type: QuestionType.CHOICE,
            options: [
              { label: 'A', description: 'A' },
              { label: 'B', description: 'B' },
            ],
          },
        ],
      };

      act(() => {
        handler(request1);
      });

      expect(result.current).not.toBeNull();

      // Second request arrives while first is active
      const request2: AskUserRequest = {
        type: MessageBusType.ASK_USER_REQUEST,
        correlationId: 'second-request',
        questions: [
          {
            question: 'Second?',
            header: 'Q2',
            type: QuestionType.CHOICE,
            options: [
              { label: 'C', description: 'C' },
              { label: 'D', description: 'D' },
            ],
          },
        ],
      };

      act(() => {
        handler(request2);
      });

      // First request should have been auto-cancelled
      expect(mockMessageBus.publish).toHaveBeenCalledWith({
        type: MessageBusType.ASK_USER_RESPONSE,
        correlationId: 'first-request',
        answers: {},
        cancelled: true,
      });

      // Current dialog should be the second request
      expect(result.current!.questions[0].question).toBe('Second?');
    });

    it('should not auto-cancel when no previous request exists', () => {
      const { result } = renderHook(() => useAskUserHandler(mockConfig));

      const handler = mockMessageBus.subscribe.mock.calls.find(
        (call: unknown[]) => call[0] === MessageBusType.ASK_USER_REQUEST,
      )![1];

      const request: AskUserRequest = {
        type: MessageBusType.ASK_USER_REQUEST,
        correlationId: 'only-request',
        questions: [
          {
            question: 'Only?',
            header: 'Q',
            type: QuestionType.CHOICE,
            options: [
              { label: 'A', description: 'A' },
              { label: 'B', description: 'B' },
            ],
          },
        ],
      };

      act(() => {
        handler(request);
      });

      // No auto-cancel should have been published
      expect(mockMessageBus.publish).not.toHaveBeenCalled();
      expect(result.current).not.toBeNull();
    });
  });
});
