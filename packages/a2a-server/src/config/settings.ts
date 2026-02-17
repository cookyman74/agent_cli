/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import type { MCPServerConfig } from '@didim365/agent-cli-core';
import {
  debugLogger,
  GEMINI_DIR,
  LEGACY_GEMINI_DIR,
  getErrorMessage,
  type TelemetrySettings,
  homedir,
} from '@didim365/agent-cli-core';
import stripJsonComments from 'strip-json-comments';

export const USER_SETTINGS_DIR = path.join(homedir(), GEMINI_DIR);
export const USER_SETTINGS_PATH = path.join(USER_SETTINGS_DIR, 'settings.json');

// Legacy fallback paths for existing users with .gemini config
const LEGACY_USER_SETTINGS_PATH = path.join(
  homedir(),
  LEGACY_GEMINI_DIR,
  'settings.json',
);

// TODO: Ensure full compatibility with V2 nested settings structure (settings.schema.json).
// This involves updating the interface and implementing migration logic to support legacy V1 (flat) settings,
// similar to how packages/cli/src/config/settings.ts handles it.
export interface Settings {
  mcpServers?: Record<string, MCPServerConfig>;
  coreTools?: string[];
  excludeTools?: string[];
  telemetry?: TelemetrySettings;
  showMemoryUsage?: boolean;
  checkpointing?: CheckpointingSettings;
  folderTrust?: boolean;
  general?: {
    previewFeatures?: boolean;
  };

  // Git-aware file filtering settings
  fileFiltering?: {
    respectGitIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
  };
}

export interface SettingsError {
  message: string;
  path: string;
}

export interface CheckpointingSettings {
  enabled?: boolean;
}

/**
 * Loads settings from user and workspace directories.
 * Project settings override user settings.
 *
 * How is it different to gemini-cli/cli: Returns already merged settings rather
 * than `LoadedSettings` (unnecessary since we are not modifying users
 * settings.json).
 */
export function loadSettings(workspaceDir: string): Settings {
  let userSettings: Settings = {};
  let workspaceSettings: Settings = {};
  const settingsErrors: SettingsError[] = [];

  // Load user settings — .didim first, .gemini fallback
  const userSettingsPath = fs.existsSync(USER_SETTINGS_PATH)
    ? USER_SETTINGS_PATH
    : LEGACY_USER_SETTINGS_PATH;
  try {
    if (fs.existsSync(userSettingsPath)) {
      const userContent = fs.readFileSync(userSettingsPath, 'utf-8');
      const parsedUserSettings = JSON.parse(
        stripJsonComments(userContent),
      ) as Settings;
      userSettings = resolveEnvVarsInObject(parsedUserSettings);
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: userSettingsPath,
    });
  }

  const workspaceSettingsPath = path.join(
    workspaceDir,
    GEMINI_DIR,
    'settings.json',
  );
  const legacyWorkspaceSettingsPath = path.join(
    workspaceDir,
    LEGACY_GEMINI_DIR,
    'settings.json',
  );

  // Load workspace settings — .didim first, .gemini fallback
  const resolvedWorkspacePath = fs.existsSync(workspaceSettingsPath)
    ? workspaceSettingsPath
    : legacyWorkspaceSettingsPath;
  try {
    if (fs.existsSync(resolvedWorkspacePath)) {
      const projectContent = fs.readFileSync(resolvedWorkspacePath, 'utf-8');
      const parsedWorkspaceSettings = JSON.parse(
        stripJsonComments(projectContent),
      ) as Settings;
      workspaceSettings = resolveEnvVarsInObject(parsedWorkspaceSettings);
    }
  } catch (error: unknown) {
    settingsErrors.push({
      message: getErrorMessage(error),
      path: resolvedWorkspacePath,
    });
  }

  if (settingsErrors.length > 0) {
    debugLogger.error('Errors loading settings:');
    for (const error of settingsErrors) {
      debugLogger.error(`  Path: ${error.path}`);
      debugLogger.error(`  Message: ${error.message}`);
    }
  }

  // If there are overlapping keys, the values of workspaceSettings will
  // override values from userSettings
  return {
    ...userSettings,
    ...workspaceSettings,
  };
}

function resolveEnvVarsInString(value: string): string {
  const envVarRegex = /\$(?:(\w+)|{([^}]+)})/g; // Find $VAR_NAME or ${VAR_NAME}
  return value.replace(envVarRegex, (match, varName1, varName2) => {
    const varName = varName1 || varName2;
    if (process && process.env && typeof process.env[varName] === 'string') {
      return process.env[varName];
    }
    return match;
  });
}

function resolveEnvVarsInObject<T>(obj: T): T {
  if (
    obj === null ||
    obj === undefined ||
    typeof obj === 'boolean' ||
    typeof obj === 'number'
  ) {
    return obj;
  }

  if (typeof obj === 'string') {
    return resolveEnvVarsInString(obj) as unknown as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVarsInObject(item)) as unknown as T;
  }

  if (typeof obj === 'object') {
    const newObj = { ...obj } as T;
    for (const key in newObj) {
      if (Object.prototype.hasOwnProperty.call(newObj, key)) {
        newObj[key] = resolveEnvVarsInObject(newObj[key]);
      }
    }
    return newObj;
  }

  return obj;
}
