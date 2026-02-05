/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AdapterConfig } from './types.js';
import type { BaseAdapter } from './baseAdapter.js';
import { LlmError, LlmErrorType } from './errors.js';

/**
 * Factory function type for creating adapter instances.
 */
export type AdapterFactory = (config: AdapterConfig) => BaseAdapter;

/**
 * Options for registering a provider.
 */
export interface RegisterOptions {
  /** If true, allows overwriting an existing registration */
  force?: boolean;
}

/**
 * Registry for LLM provider adapters.
 * Implements singleton pattern for global provider management.
 *
 * Provider names are normalized to lowercase for consistent lookup.
 *
 * @example
 * ```ts
 * const registry = ProviderRegistry.getInstance();
 * registry.register('gemini', (config) => new GeminiAdapter(config));
 * registry.register('claude', (config) => new ClaudeAdapter(config));
 *
 * const adapter = registry.createAdapter('gemini', { apiKey: 'xxx' });
 * ```
 *
 * @see docs/ai_adapter/03-technical-design.md §3.6
 */
export class ProviderRegistry {
  private static instance: ProviderRegistry | null = null;
  private readonly providers = new Map<string, AdapterFactory>();

  /**
   * Private constructor to enforce singleton pattern.
   */
  private constructor() {}

  /**
   * Get the singleton instance of ProviderRegistry.
   */
  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * Normalize provider name for consistent lookup.
   */
  private normalizeName(name: string): string {
    return name.toLowerCase();
  }

  /**
   * Register a provider adapter factory.
   *
   * @param name - Provider name (e.g., 'gemini', 'claude', 'openai')
   * @param factory - Factory function that creates adapter instances
   * @param options - Registration options
   * @throws {LlmError} If provider is already registered and force is not set
   */
  register(
    name: string,
    factory: AdapterFactory,
    options?: RegisterOptions,
  ): void {
    const normalizedName = this.normalizeName(name);
    if (this.providers.has(normalizedName) && !options?.force) {
      throw new LlmError(
        LlmErrorType.VALIDATION,
        `Provider "${name}" is already registered`,
      );
    }
    this.providers.set(normalizedName, factory);
  }

  /**
   * Get a registered provider factory.
   *
   * @param name - Provider name
   * @returns Factory function or undefined if not found
   */
  get(name: string): AdapterFactory | undefined {
    return this.providers.get(this.normalizeName(name));
  }

  /**
   * Get a registered provider factory, throwing if not found.
   *
   * @param name - Provider name
   * @returns Factory function
   * @throws {LlmError} If provider is not registered
   */
  getOrThrow(name: string): AdapterFactory {
    const normalizedName = this.normalizeName(name);
    const factory = this.providers.get(normalizedName);
    if (!factory) {
      throw new LlmError(
        LlmErrorType.PROVIDER_NOT_FOUND,
        `Provider "${name}" is not registered`,
      );
    }
    return factory;
  }

  /**
   * Check if a provider is registered.
   *
   * @param name - Provider name
   * @returns true if registered
   */
  has(name: string): boolean {
    return this.providers.has(this.normalizeName(name));
  }

  /**
   * List all registered provider names.
   *
   * @returns Array of provider names
   */
  list(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Unregister a provider.
   *
   * @param name - Provider name
   * @returns true if provider was removed, false if not found
   */
  unregister(name: string): boolean {
    return this.providers.delete(this.normalizeName(name));
  }

  /**
   * Clear all registered providers.
   * Useful for testing.
   */
  clear(): void {
    this.providers.clear();
  }

  /**
   * Create an adapter instance using a registered factory.
   *
   * @param name - Provider name
   * @param config - Adapter configuration
   * @returns Adapter instance
   * @throws {LlmError} If provider is not registered
   */
  createAdapter(name: string, config: AdapterConfig): BaseAdapter {
    const factory = this.getOrThrow(name);
    return factory(config);
  }
}
