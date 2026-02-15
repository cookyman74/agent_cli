/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { saveModelForProvider, SettingScope } from './settings.js';

// ============================================================================
// Lightweight LoadedSettings mock (no fs/os dependency)
// ============================================================================

function createMockLoadedSettings(userByProvider?: Record<string, string>) {
  const userSettings = {
    model: userByProvider
      ? { byProvider: { ...userByProvider } }
      : ({} as Record<string, unknown>),
  };

  const setValueCalls: Array<{
    scope: string;
    key: string;
    value: unknown;
  }> = [];

  const mockLoaded = {
    forScope: vi.fn((scope: string) => ({
      settings: scope === SettingScope.User ? userSettings : {},
    })),
    setValue: vi.fn((scope: string, key: string, value: unknown) => {
      setValueCalls.push({ scope, key, value });
    }),
  };

  return { mockLoaded, setValueCalls, userSettings };
}

describe('saveModelForProvider', () => {
  it('saves model.name and model.byProvider[provider]', () => {
    const { mockLoaded, setValueCalls } = createMockLoadedSettings();

    saveModelForProvider(
      mockLoaded as never,
      'claude',
      'claude-haiku-4-5-20251001',
    );

    // model.name 저장 확인
    expect(setValueCalls).toContainEqual({
      scope: SettingScope.User,
      key: 'model.name',
      value: 'claude-haiku-4-5-20251001',
    });

    // model.byProvider 저장 확인
    const byProviderCall = setValueCalls.find(
      (c) => c.key === 'model.byProvider',
    );
    expect(byProviderCall).toBeDefined();
    expect(byProviderCall?.value).toEqual({
      claude: 'claude-haiku-4-5-20251001',
    });
  });

  it('preserves existing byProvider entries for other providers', () => {
    const { mockLoaded, setValueCalls } = createMockLoadedSettings({
      openai: 'gpt-4.1',
    });

    saveModelForProvider(mockLoaded as never, 'claude', 'claude-opus-4-6');

    const byProviderCall = setValueCalls.find(
      (c) => c.key === 'model.byProvider',
    );
    expect(byProviderCall?.value).toEqual({
      openai: 'gpt-4.1',
      claude: 'claude-opus-4-6',
    });
  });

  it('reads from user scope only (not merged) — scope 오염 방지', () => {
    // user scope에는 byProvider 없음 (빈 model)
    const { mockLoaded, setValueCalls } = createMockLoadedSettings();

    saveModelForProvider(mockLoaded as never, 'claude', 'claude-opus-4-6');

    // forScope(User) 호출 확인
    expect(mockLoaded.forScope).toHaveBeenCalledWith(SettingScope.User);

    // workspace의 gemini가 user에 복사되지 않아야 함
    const byProviderCall = setValueCalls.find(
      (c) => c.key === 'model.byProvider',
    );
    expect(byProviderCall?.value).toEqual({ claude: 'claude-opus-4-6' });
  });

  it('overwrites existing entry for same provider', () => {
    const { mockLoaded, setValueCalls } = createMockLoadedSettings({
      claude: 'claude-sonnet-4-5-20250929',
    });

    saveModelForProvider(mockLoaded as never, 'claude', 'claude-opus-4-6');

    const byProviderCall = setValueCalls.find(
      (c) => c.key === 'model.byProvider',
    );
    expect(byProviderCall?.value).toEqual({ claude: 'claude-opus-4-6' });
  });

  it('handles error gracefully without throwing', () => {
    const mockLoaded = {
      forScope: vi.fn(() => ({ settings: {} })),
      setValue: vi.fn(() => {
        throw new Error('write failed');
      }),
    };

    // Should not throw
    expect(() =>
      saveModelForProvider(mockLoaded as never, 'claude', 'claude-opus-4-6'),
    ).not.toThrow();
  });
});
