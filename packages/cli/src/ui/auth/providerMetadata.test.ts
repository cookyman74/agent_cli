/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  PROVIDER_DISPLAY_MAP,
  PROVIDER_SELECT_ITEMS,
  getProviderDisplayInfo,
} from './providerMetadata.js';

describe('providerMetadata', () => {
  describe('PROVIDER_DISPLAY_MAP didim-studio entry', () => {
    const entry = PROVIDER_DISPLAY_MAP['didim-studio'];

    it('has providerType didim-studio', () => {
      expect(entry.providerType).toBe('didim-studio');
    });

    it('has label DidimAIStudio', () => {
      expect(entry.label).toBe('DidimAIStudio');
    });

    it('has description Scenario', () => {
      expect(entry.description).toBe('Scenario');
    });

    it('has envVarName DIDIM_API_KEY', () => {
      expect(entry.envVarName).toBe('DIDIM_API_KEY');
    });

    it('has keychainEntry didim-api-key', () => {
      expect(entry.keychainEntry).toBe('didim-api-key');
    });

    it('has apiKeyUrl https://aistudio.didim365.com/', () => {
      expect(entry.apiKeyUrl).toBe('https://aistudio.didim365.com/');
    });
  });

  describe('PROVIDER_SELECT_ITEMS', () => {
    it('includes didim-studio', () => {
      expect(PROVIDER_SELECT_ITEMS).toContain('didim-studio');
    });
  });

  describe('getProviderDisplayInfo', () => {
    it('returns correct metadata for didim-studio', () => {
      const info = getProviderDisplayInfo('didim-studio');
      expect(info).toBe(PROVIDER_DISPLAY_MAP['didim-studio']);
    });

    it('falls back to gemini when provider is undefined', () => {
      const info = getProviderDisplayInfo(undefined);
      expect(info).toBe(PROVIDER_DISPLAY_MAP['gemini']);
    });
  });
});
