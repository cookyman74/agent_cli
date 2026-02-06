/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AdapterConfig } from './types.js';
import type { BaseAdapter } from './baseAdapter.js';
import { ProviderRegistry } from './registry.js';
import { LlmError, LlmErrorType } from './errors.js';

/**
 * Factory for creating LLM provider adapter instances.
 *
 * This class provides a high-level API for creating adapters without
 * directly interacting with the registry. It also provides validation
 * and convenience methods.
 *
 * @example
 * ```ts
 * const factory = new ProviderFactory();
 *
 * // Check if provider is available
 * if (factory.canCreate('gemini')) {
 *   const adapter = factory.create('gemini', { apiKey: 'xxx' });
 * }
 *
 * // List available providers
 * console.log(factory.getAvailableProviders());
 * ```
 *
 * @see docs/ai_adapter/03-technical-design.md §3.6
 */
export class ProviderFactory {
  private readonly registry: ProviderRegistry;

  /**
   * Create a new ProviderFactory.
   *
   * @param registry - Optional registry instance. Defaults to singleton.
   */
  constructor(registry?: ProviderRegistry) {
    this.registry = registry ?? ProviderRegistry.getInstance();
  }

  /**
   * Create an adapter instance for the specified provider.
   *
   * @param providerName - Provider name (e.g., 'gemini', 'claude', 'openai')
   * @param config - Adapter configuration
   * @returns Adapter instance
   * @throws {LlmError} If provider is not registered (PROVIDER_NOT_FOUND)
   */
  create(providerName: string, config: AdapterConfig): BaseAdapter {
    return this.registry.createAdapter(providerName, config);
  }

  /**
   * Create an adapter instance with config validation.
   *
   * **Error Priority**: PROVIDER_NOT_FOUND is checked first, then config validation.
   * This ensures callers get the most actionable error message.
   *
   * **Authentication Flexibility**: `requireApiKey` defaults to `false` to support
   * multiple authentication scenarios:
   * - OAuth 2.0 (Vertex AI, Azure OpenAI)
   * - Application Default Credentials (ADC)
   * - Environment-based authentication
   * - Local/keyless development modes
   *
   * Use `{ requireApiKey: true }` when the adapter strictly requires an API key.
   *
   * @param providerName - Provider name (e.g., 'gemini', 'claude', 'openai')
   * @param config - Adapter configuration
   * @param options - Validation options
   * @param options.requireApiKey - If true, validates that apiKey is present (default: false)
   * @returns Adapter instance
   * @throws {LlmError} PROVIDER_NOT_FOUND if provider is not registered
   * @throws {LlmError} VALIDATION if requireApiKey is true and apiKey is missing
   *
   * @example
   * ```ts
   * // OAuth/ADC scenario (no apiKey validation)
   * factory.createWithValidation('vertex-ai', { projectId: 'my-project' });
   *
   * // API key required scenario
   * factory.createWithValidation('openai', { apiKey: 'sk-xxx' }, { requireApiKey: true });
   * ```
   */
  createWithValidation(
    providerName: string,
    config: AdapterConfig,
    options?: { requireApiKey?: boolean },
  ): BaseAdapter {
    // Check provider availability first (PROVIDER_NOT_FOUND takes precedence)
    if (!this.canCreate(providerName)) {
      throw new LlmError(
        LlmErrorType.PROVIDER_NOT_FOUND,
        `Provider "${providerName}" is not registered`,
      );
    }

    // Validate config only if requireApiKey is explicitly set
    if (options?.requireApiKey) {
      this.validateConfig(config);
    }

    return this.create(providerName, config);
  }

  /**
   * Check if a provider can be created.
   *
   * @param providerName - Provider name
   * @returns true if provider is registered
   */
  canCreate(providerName: string): boolean {
    return this.registry.has(providerName);
  }

  /**
   * Get list of available provider names.
   *
   * @returns Array of provider names
   */
  getAvailableProviders(): string[] {
    return this.registry.list();
  }

  /**
   * Validate adapter configuration.
   *
   * @param config - Configuration to validate
   * @throws {LlmError} If configuration is invalid
   */
  private validateConfig(config: AdapterConfig): void {
    if (!config.apiKey) {
      throw new LlmError(
        LlmErrorType.VALIDATION,
        'apiKey is required in adapter configuration',
      );
    }
  }
}
