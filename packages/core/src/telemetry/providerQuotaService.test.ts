/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * RED Phase tests for ProviderQuota type and ProviderQuotaService.
 *
 * These tests will FAIL because:
 * - ProviderQuota does not exist in types.ts yet (RED-2)
 * - ProviderQuotaService module does not exist yet (RED-5)
 *
 * @see docs/00_project/command_for_multi_provider/phase_plan/phase3_quota_integration.md RED-2, RED-5
 */

import { describe, it, expect } from 'vitest';
import type { ProviderQuota } from './types.js'; // RED-2: does not export ProviderQuota yet
import { ProviderQuotaService } from './providerQuotaService.js'; // RED-5: module does not exist yet

// ============================================================================
// RED-2: ProviderQuota type tests
// ============================================================================

describe('ProviderQuota type', () => {
  it('should be importable and constructable', () => {
    const quota: ProviderQuota = {
      provider: 'claude',
      requestsLimit: 100,
      requestsRemaining: 50,
      tokensLimit: 100000,
      tokensRemaining: 80000,
      updatedAt: new Date(),
    };
    expect(quota.provider).toBe('claude');
    expect(quota.requestsRemaining).toBe(50);
  });

  it('should allow optional rate-limit fields', () => {
    const quota: ProviderQuota = {
      provider: 'openai',
      updatedAt: new Date(),
    };
    expect(quota.requestsLimit).toBeUndefined();
    expect(quota.tokensLimit).toBeUndefined();
  });

  it('should support resetTime field', () => {
    const quota: ProviderQuota = {
      provider: 'claude',
      resetTime: new Date('2026-02-21T12:00:00Z'),
      updatedAt: new Date(),
    };
    expect(quota.resetTime).toBeInstanceOf(Date);
  });
});

// ============================================================================
// RED-5: ProviderQuotaService tests
// ============================================================================

describe('ProviderQuotaService', () => {
  it('should store and retrieve quota for a provider', () => {
    const service = new ProviderQuotaService();
    service.update('claude', {
      requestsLimit: 100,
      requestsRemaining: 50,
      tokensLimit: 100000,
      tokensRemaining: 80000,
    });
    const quota = service.get('claude');
    expect(quota).toBeDefined();
    expect(quota!.provider).toBe('claude');
    expect(quota!.requestsRemaining).toBe(50);
    expect(quota!.updatedAt).toBeInstanceOf(Date);
  });

  it('should update existing quota (latest value wins)', () => {
    const service = new ProviderQuotaService();
    service.update('claude', {
      requestsLimit: 100,
      requestsRemaining: 50,
    });
    service.update('claude', {
      requestsLimit: 100,
      requestsRemaining: 30,
    });
    expect(service.get('claude')?.requestsRemaining).toBe(30);
  });

  it('should return all provider quotas via getAll()', () => {
    const service = new ProviderQuotaService();
    service.update('claude', { requestsLimit: 100 });
    service.update('openai', { requestsLimit: 200 });
    const all = service.getAll();
    expect(Object.keys(all)).toEqual(
      expect.arrayContaining(['claude', 'openai']),
    );
    expect(Object.keys(all)).toHaveLength(2);
  });

  it('should return undefined for unknown provider', () => {
    const service = new ProviderQuotaService();
    expect(service.get('unknown')).toBeUndefined();
  });

  it('should return empty object from getAll() when no quotas stored', () => {
    const service = new ProviderQuotaService();
    expect(service.getAll()).toEqual({});
  });
});
