/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  type Config,
  MessageBusType,
  type AskUserRequest,
  type Question,
} from '@didim365/agent-cli-core';

/**
 * State for the AskUser dialog in the CLI.
 * Holds the questions and callbacks needed by AskUserDialog.
 */
export interface AskUserDialogRequest {
  questions: Question[];
  onSubmit: (answers: { [questionIndex: string]: string }) => void;
  onCancel: () => void;
}

/**
 * Hook that subscribes to ASK_USER_REQUEST events from Core's MessageBus
 * and provides the dialog state for DialogManager to render AskUserDialog.
 *
 * Flow: Core publishes ASK_USER_REQUEST → this hook sets state →
 * DialogManager renders AskUserDialog → user responds →
 * this hook publishes ASK_USER_RESPONSE back to MessageBus.
 *
 * Issue 1: onCancel sends `cancelled: true` so Core distinguishes cancellation from empty answers.
 * Issue 2: Single-slot design — when a new request arrives while one is active, the previous
 *   request is auto-cancelled via previousCancelRef. This is intentional: the terminal can only
 *   display one dialog at a time, so the latest request takes precedence. The cancelled request
 *   receives a `cancelled: true` response, allowing the Core's AskUserTool to report the
 *   cancellation gracefully to the LLM.
 */
export function useAskUserHandler(
  config: Config | null,
): AskUserDialogRequest | null {
  const [askUserRequest, setAskUserRequest] =
    useState<AskUserDialogRequest | null>(null);

  // Issue 2: Single-slot auto-cancel — track previous request's cancel callback.
  // When a new ASK_USER_REQUEST arrives, the previous dialog is programmatically cancelled
  // so only one dialog is ever active. This is a deliberate design choice for terminal UIs
  // that cannot render concurrent dialogs.
  const previousCancelRef = useRef<(() => void) | null>(null);

  const messageBus = useMemo(() => config?.getMessageBus() ?? null, [config]);

  const handleRequest = useCallback(
    (request: AskUserRequest) => {
      if (!messageBus) return;

      // Issue 2: Auto-cancel previous request if one is still active
      if (previousCancelRef.current) {
        previousCancelRef.current();
      }

      const { correlationId, questions } = request;

      const onSubmit = (answers: { [questionIndex: string]: string }) => {
        previousCancelRef.current = null;
        setAskUserRequest(null);
        messageBus
          .publish({
            type: MessageBusType.ASK_USER_RESPONSE,
            correlationId,
            answers,
          })
          .catch(() => {
            // Publish failure is non-fatal; the tool will eventually timeout or be cancelled
          });
      };

      const onCancel = () => {
        previousCancelRef.current = null;
        setAskUserRequest(null);
        // Issue 1: Send cancelled flag so Core can distinguish cancellation from empty answers
        messageBus
          .publish({
            type: MessageBusType.ASK_USER_RESPONSE,
            correlationId,
            answers: {},
            cancelled: true,
          })
          .catch(() => {
            // Publish failure is non-fatal
          });
      };

      previousCancelRef.current = onCancel;
      setAskUserRequest({ questions, onSubmit, onCancel });
    },
    [messageBus],
  );

  useEffect(() => {
    if (!messageBus) return;

    messageBus.subscribe(MessageBusType.ASK_USER_REQUEST, handleRequest);
    return () => {
      messageBus.unsubscribe(MessageBusType.ASK_USER_REQUEST, handleRequest);
    };
  }, [messageBus, handleRequest]);

  return askUserRequest;
}
