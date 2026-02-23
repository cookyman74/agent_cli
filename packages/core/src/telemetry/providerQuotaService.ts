/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session-scoped service that stores provider rate-limit quota data.
 *
 * Data source: adapter response headers (LlmMessageEndEvent.rateLimits)
 * bridged via LoggingContentGenerator.
 *
 * Lifecycle: created once per session, shared between
 * LoggingContentGenerator (writer) and CommandContext (reader).
 */

import type { ProviderQuota } from './types.js';

export class ProviderQuotaService {
  private readonly quotas = new Map<string, ProviderQuota>();

  /**
   * Update rate-limit quota for a provider.
   * Latest value wins (no merging).
   */
  update(
    provider: string,
    quota: Omit<ProviderQuota, 'provider' | 'updatedAt'>,
  ): void {
    this.quotas.set(provider, {
      ...quota,
      provider,
      updatedAt: new Date(),
    });
  }

  /** Get quota for a specific provider. */
  get(provider: string): ProviderQuota | undefined {
    return this.quotas.get(provider);
  }

  /** Get all provider quotas as a plain object. */
  getAll(): Record<string, ProviderQuota> {
    return Object.fromEntries(this.quotas);
  }
}
