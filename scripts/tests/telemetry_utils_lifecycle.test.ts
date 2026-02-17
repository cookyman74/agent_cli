/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Lifecycle tests for telemetry_utils.js: verifies that
 * manageTelemetrySettings correctly re-resolves the read path
 * after creating .didim/settings.json from a legacy-only (.gemini) start.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// In-memory filesystem state shared between mock and tests
const fsState = new Map<string, string>();

// --- Mocks (hoisted before module evaluation) ---

vi.mock('node:url', () => ({
  fileURLToPath: () => '/fake/project/scripts/telemetry_utils.js',
}));

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/fake/home',
    tmpdir: () => '/tmp',
    platform: () => 'linux',
  },
}));

vi.mock('node:net', () => ({
  default: { Socket: vi.fn() },
}));

vi.mock('node:child_process', () => ({
  spawnSync: vi.fn(),
  execSync: vi.fn(),
}));

vi.mock('node:crypto', () => {
  const hash = { update: () => hash, digest: () => 'abc123' };
  return { default: { createHash: () => hash } };
});

vi.mock('strip-json-comments', () => ({
  default: (s: string) => s,
}));

vi.mock('@didim365/agent-cli-core', () => ({
  GEMINI_DIR: '.didim',
  LEGACY_GEMINI_DIR: '.gemini',
}));

vi.mock('node:fs', () => {
  const impl = {
    existsSync: (p: string) => fsState.has(p),
    readFileSync: (p: string) => {
      if (!fsState.has(p))
        throw Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' });
      return fsState.get(p);
    },
    writeFileSync: (p: string, data: string) => fsState.set(p, data),
    mkdirSync: vi.fn(),
    mkdtempSync: () => '/tmp/test',
    lstatSync: vi.fn(),
    readdirSync: () => [],
    unlinkSync: vi.fn(),
    rmSync: vi.fn(),
    chmodSync: vi.fn(),
    copyFileSync: vi.fn(),
    renameSync: vi.fn(),
    closeSync: vi.fn(),
    openSync: vi.fn(),
  };
  return { default: impl, ...impl };
});

// --- Derived paths (must match telemetry_utils.js internal resolution) ---
// projectRoot = path.resolve('/fake/project/scripts', '..') = '/fake/project'
const PRIMARY_SETTINGS = '/fake/project/.didim/settings.json';
const LEGACY_SETTINGS = '/fake/project/.gemini/settings.json';

describe('manageTelemetrySettings lifecycle', () => {
  beforeEach(() => {
    fsState.clear();
    vi.resetModules();
  });

  it('should clean up .didim settings on disable after legacy-only enable', async () => {
    // Arrange: only .gemini/settings.json exists (legacy-only environment)
    fsState.set(LEGACY_SETTINGS, JSON.stringify({ sandbox: true }));

    const { manageTelemetrySettings } = await import('../telemetry_utils.js');

    // Act 1: Enable telemetry — reads from .gemini (only one available), writes to .didim
    manageTelemetrySettings(true, 'http://localhost:4317', 'local');

    expect(fsState.has(PRIMARY_SETTINGS)).toBe(true);
    const afterEnable = JSON.parse(fsState.get(PRIMARY_SETTINGS)!);
    expect(afterEnable.telemetry.enabled).toBe(true);
    expect(afterEnable.sandbox).toBe(false); // sandbox disabled for telemetry

    // Act 2: Disable telemetry — must re-resolve and find .didim (now exists)
    manageTelemetrySettings(false, null, null, true);

    // Assert: telemetry cleaned up in .didim/settings.json
    const afterDisable = JSON.parse(fsState.get(PRIMARY_SETTINGS)!);
    expect(afterDisable.telemetry).toBeUndefined();
    expect(afterDisable.sandbox).toBe(true); // sandbox restored
  });

  it('should read from .didim when both dirs exist', async () => {
    // Arrange: both exist with different content
    fsState.set(
      PRIMARY_SETTINGS,
      JSON.stringify({ telemetry: { enabled: true, target: 'local' } }),
    );
    fsState.set(LEGACY_SETTINGS, JSON.stringify({}));

    const { manageTelemetrySettings } = await import('../telemetry_utils.js');

    // Act: disable — should read from .didim (primary), not .gemini
    manageTelemetrySettings(false);

    const result = JSON.parse(fsState.get(PRIMARY_SETTINGS)!);
    expect(result.telemetry).toBeUndefined(); // cleaned up
  });

  it('should handle no settings file gracefully', async () => {
    // Arrange: neither .didim nor .gemini settings exist
    const { manageTelemetrySettings } = await import('../telemetry_utils.js');

    // Act: enable creates .didim/settings.json from scratch
    manageTelemetrySettings(true, 'http://localhost:4317', 'local');

    expect(fsState.has(PRIMARY_SETTINGS)).toBe(true);
    const result = JSON.parse(fsState.get(PRIMARY_SETTINGS)!);
    expect(result.telemetry.enabled).toBe(true);
  });
});
