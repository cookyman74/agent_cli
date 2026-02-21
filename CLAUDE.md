# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Gemini CLI is an open-source AI agent that brings Gemini directly into the
terminal. It's a TypeScript monorepo using npm workspaces with a React-based
terminal UI (Ink).

## Build & Development Commands

**IMPORTANT: Never run `tsc` or `tsc --build` directly from the project root.**
The root `tsconfig.json` has no `outDir` setting (it exists only for shared
compiler option inheritance). Running `tsc` at the root will emit `.js`, `.d.ts`,
and `.js.map` files alongside every `.ts` source file (~4,500 artifacts),
polluting the source directories. Always use the npm scripts below or run
`tsc --build` from within a specific package directory.

```bash
# Install dependencies
npm install

# Build all packages (correct way)
npm run build

# Build a specific package only
npm run build -w @didim365/agent-cli-core
npm run build -w @didim365/agent-cli

# Build with sandbox container and VS Code extension
npm run build:all

# Run in development mode
npm run start

# Debug with Node.js inspector
npm run debug

# Bundle for release
npm run bundle

# Clean build artifacts
npm run clean
```

## Testing Commands

```bash
# Run all unit tests
npm run test

# Run tests for a specific workspace
npm test -w @didim365/agent-cli-core -- src/path/to/file.test.ts

# Run integration/E2E tests (requires bundle first)
npm run bundle && npm run test:e2e

# Run specific integration test by file
npm run test:e2e list_directory write_file

# Run specific integration test by name
npm run test:e2e -- --test-name-pattern "reads a file"

# Full preflight check (clean, install, build, lint, typecheck, test)
npm run preflight
```

## Linting & Formatting

```bash
npm run lint          # Check linting
npm run lint:fix      # Auto-fix linting issues
npm run format        # Format with Prettier
npm run typecheck     # TypeScript type checking
```

## Architecture

### Package Structure

- **`packages/cli`**: Terminal UI (React/Ink), input processing, display
  rendering, user configuration
- **`packages/core`**: Backend logic, Gemini API orchestration, prompt
  construction, tool execution
- **`packages/core/src/tools/`**: Built-in tools (file system, shell, web fetch,
  grep, glob, etc.)
- **`packages/a2a-server`**: Experimental Agent-to-Agent server
- **`packages/vscode-ide-companion`**: VS Code extension companion

### Interaction Flow

1. User input → `packages/cli` → `packages/core`
2. Core constructs prompt → Gemini API
3. API may request tool execution → core executes tool → result back to API
4. Final response → CLI renders output

### Key Design Principles

- **Modularity**: CLI (frontend) separated from Core (backend)
- **Extensibility**: Tool system allows new capabilities via MCP servers
- **User experience**: Rich terminal interface with React/Ink

## Development Conventions

### Node.js Version

- **Development**: Use Node.js `~20.19.0` (specific version required for dev
  dependencies)
- **Production**: Node.js `>=20`

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat(cli): Add --json flag to 'config get' command`
- `fix(core): Resolve timeout issue in shell tool`

### Import Rules

ESLint enforces restrictions on relative imports between packages. Use package
imports for cross-package dependencies.

### Testing Environment Variables

Use Vitest's stubbing for environment variables:

```typescript
beforeEach(() => {
  vi.stubEnv('NAME', 'value');
});
afterEach(() => {
  vi.unstubAllEnvs();
});
```

### React/Ink Patterns

The CLI uses Ink for terminal rendering. Follow existing component patterns in
`packages/cli/src/`.

## Integration Test Diagnostics

```bash
# Keep test output for inspection
KEEP_OUTPUT=true npm run test:e2e

# Verbose output with console streaming
VERBOSE=true KEEP_OUTPUT=true npm run test:e2e

# Regenerate model response goldens (review for personal info)
REGENERATE_MODEL_GOLDENS=true npm run test:e2e

# Deflake a new test (run 5+ times before adding)
npm run deflake -- --runs=5 --command="npm run test:e2e -- -- --test-name-pattern '<test-name>'"
```

## Sandboxing

For development with sandboxing enabled:

```bash
# Set in ~/.env or environment
GEMINI_SANDBOX=true  # Uses docker or podman
# Or explicitly: GEMINI_SANDBOX=docker|podman

# Build with sandbox
npm run build:all
```

macOS uses Seatbelt (`sandbox-exec`) by default. Configure with
`SEATBELT_PROFILE`.

## Development Tracing

Enable OpenTelemetry traces for debugging:

```bash
# Start telemetry collector
npm run telemetry -- --target=local  # or --target=genkit

# Run with tracing
GEMINI_DEV_TRACING=true gemini
```

## Key Files

- `GEMINI.md`: Project context for the Gemini model (similar to this file)
- `CONTRIBUTING.md`: Contribution guidelines and PR requirements
- `docs/architecture.md`: Architecture overview
- `docs/integration-tests.md`: Integration testing guide
