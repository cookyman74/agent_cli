/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { coreEvents } from '../utils/events.js';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { Storage } from '../config/storage.js';
import { getErrorMessage } from '../utils/errors.js';
import { LEGACY_GEMINI_DIR, homedir } from '../utils/paths.js';
import type {
  OAuthToken,
  OAuthCredentials,
  TokenStorage,
} from './token-storage/types.js';
import { HybridTokenStorage } from './token-storage/hybrid-token-storage.js';
import { DEFAULT_SERVICE_NAME } from './token-storage/index.js';
import { resolveEnv } from '../utils/envResolver.js';

/**
 * Class for managing MCP OAuth token storage and retrieval.
 */
export class MCPOAuthTokenStorage implements TokenStorage {
  private readonly hybridTokenStorage = new HybridTokenStorage(
    DEFAULT_SERVICE_NAME,
  );
  private readonly useEncryptedFile =
    resolveEnv('FORCE_ENCRYPTED_FILE_STORAGE') === 'true';

  /**
   * Get the read path to the token storage file (with .gemini fallback).
   */
  private getTokenReadPath(): string {
    return Storage.getMcpOAuthTokensPath();
  }

  /**
   * Get the write path to the token storage file (always .didim).
   */
  private getTokenWritePath(): string {
    return Storage.getGlobalWritePath('mcp-oauth-tokens.json');
  }

  /**
   * Ensure the config directory exists for writing.
   */
  private async ensureConfigDir(): Promise<void> {
    const configDir = path.dirname(this.getTokenWritePath());
    await fs.mkdir(configDir, { recursive: true });
  }

  /**
   * Load all stored MCP OAuth tokens.
   *
   * @returns A map of server names to credentials
   */
  async getAllCredentials(): Promise<Map<string, OAuthCredentials>> {
    if (this.useEncryptedFile) {
      return this.hybridTokenStorage.getAllCredentials();
    }
    const tokenMap = new Map<string, OAuthCredentials>();

    try {
      const tokenFile = this.getTokenReadPath();
      const data = await fs.readFile(tokenFile, 'utf-8');
      const tokens = JSON.parse(data) as OAuthCredentials[];

      for (const credential of tokens) {
        tokenMap.set(credential.serverName, credential);
      }
    } catch (error) {
      // File doesn't exist or is invalid, return empty map
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        coreEvents.emitFeedback(
          'error',
          `Failed to load MCP OAuth tokens: ${getErrorMessage(error)}`,
          error,
        );
      }
    }

    return tokenMap;
  }

  async listServers(): Promise<string[]> {
    if (this.useEncryptedFile) {
      return this.hybridTokenStorage.listServers();
    }
    const tokens = await this.getAllCredentials();
    return Array.from(tokens.keys());
  }

  async setCredentials(credentials: OAuthCredentials): Promise<void> {
    if (this.useEncryptedFile) {
      return this.hybridTokenStorage.setCredentials(credentials);
    }
    const tokens = await this.getAllCredentials();
    tokens.set(credentials.serverName, credentials);

    const tokenArray = Array.from(tokens.values());
    const tokenFile = this.getTokenWritePath();

    try {
      await fs.writeFile(
        tokenFile,
        JSON.stringify(tokenArray, null, 2),
        { mode: 0o600 }, // Restrict file permissions
      );
    } catch (error) {
      coreEvents.emitFeedback(
        'error',
        `Failed to save MCP OAuth token: ${getErrorMessage(error)}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Save a token for a specific MCP server.
   *
   * @param serverName The name of the MCP server
   * @param token The OAuth token to save
   * @param clientId Optional client ID used for this token
   * @param tokenUrl Optional token URL used for this token
   * @param mcpServerUrl Optional MCP server URL
   */
  async saveToken(
    serverName: string,
    token: OAuthToken,
    clientId?: string,
    tokenUrl?: string,
    mcpServerUrl?: string,
  ): Promise<void> {
    await this.ensureConfigDir();

    const credential: OAuthCredentials = {
      serverName,
      token,
      clientId,
      tokenUrl,
      mcpServerUrl,
      updatedAt: Date.now(),
    };

    if (this.useEncryptedFile) {
      return this.hybridTokenStorage.setCredentials(credential);
    }
    await this.setCredentials(credential);
  }

  /**
   * Get a token for a specific MCP server.
   *
   * @param serverName The name of the MCP server
   * @returns The stored credentials or null if not found
   */
  async getCredentials(serverName: string): Promise<OAuthCredentials | null> {
    if (this.useEncryptedFile) {
      return this.hybridTokenStorage.getCredentials(serverName);
    }
    const tokens = await this.getAllCredentials();
    return tokens.get(serverName) || null;
  }

  /**
   * Remove a token for a specific MCP server.
   *
   * @param serverName The name of the MCP server
   */
  async deleteCredentials(serverName: string): Promise<void> {
    if (this.useEncryptedFile) {
      return this.hybridTokenStorage.deleteCredentials(serverName);
    }
    const tokens = await this.getAllCredentials();

    if (tokens.delete(serverName)) {
      const tokenArray = Array.from(tokens.values());

      try {
        if (tokenArray.length === 0) {
          // Remove both primary and legacy files if no tokens left
          await this.deleteTokenFiles();
        } else {
          const tokenFile = this.getTokenWritePath();
          await fs.writeFile(tokenFile, JSON.stringify(tokenArray, null, 2), {
            mode: 0o600,
          });
        }
      } catch (error) {
        coreEvents.emitFeedback(
          'error',
          `Failed to remove MCP OAuth token: ${getErrorMessage(error)}`,
          error,
        );
      }
    }
  }

  /**
   * Check if a token is expired.
   *
   * @param token The token to check
   * @returns True if the token is expired
   */
  isTokenExpired(token: OAuthToken): boolean {
    if (!token.expiresAt) {
      return false; // No expiry, assume valid
    }

    // Add a 5-minute buffer to account for clock skew
    const bufferMs = 5 * 60 * 1000;
    return Date.now() + bufferMs >= token.expiresAt;
  }

  /**
   * Delete both primary (.didim) and legacy (.gemini) token files
   * to prevent legacy file re-exposure after clearing.
   */
  private async deleteTokenFiles(): Promise<void> {
    const paths = new Set([
      this.getTokenWritePath(),
      path.join(homedir(), LEGACY_GEMINI_DIR, 'mcp-oauth-tokens.json'),
    ]);
    for (const tokenPath of paths) {
      try {
        await fs.unlink(tokenPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }
    }
  }

  /**
   * Clear all stored MCP OAuth tokens.
   */
  async clearAll(): Promise<void> {
    if (this.useEncryptedFile) {
      return this.hybridTokenStorage.clearAll();
    }
    try {
      await this.deleteTokenFiles();
    } catch (error) {
      coreEvents.emitFeedback(
        'error',
        `Failed to clear MCP OAuth tokens: ${getErrorMessage(error)}`,
        error,
      );
    }
  }
}
