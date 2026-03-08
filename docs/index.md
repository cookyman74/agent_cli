# Welcome to Didim Agent CLI documentation

This documentation provides a comprehensive guide to installing, using, and
developing Didim Agent CLI, a multi-provider AI agent tool that lets you
interact with Gemini, Claude, OpenAI, and OpenAI-compatible models through a
command-line interface.

## Overview

Didim Agent CLI brings the capabilities of multiple AI providers to your
terminal in an interactive Read-Eval-Print Loop (REPL) environment. The CLI
consists of a client-side application (`packages/cli`) that communicates with a
local server (`packages/core`), which manages requests to the configured LLM
provider through a unified **provider adapter architecture**. The CLI also
contains a variety of tools for tasks such as performing file system operations,
running shells, and web fetching, which are managed by `packages/core`.

### Supported providers

| Provider          | Models                                                       | Auth                             |
| ----------------- | ------------------------------------------------------------ | -------------------------------- |
| Gemini            | gemini-2.5-pro, gemini-2.5-flash, gemini-3.1-pro-preview     | Google Login / `GEMINI_API_KEY`  |
| Claude            | claude-opus-4-6, claude-sonnet-4-5, claude-haiku-4-5         | `ANTHROPIC_API_KEY`              |
| OpenAI            | gpt-5.4, gpt-5.4-pro, gpt-5.3-codex, gpt-5-mini, o3, o4-mini | `OPENAI_API_KEY`                 |
| OpenAI-compatible | Any (vLLM, Ollama, LM Studio)                                | `LLM_BASE_URL` + optional key    |
| Vertex AI         | Gemini models via Vertex                                     | `GOOGLE_API_KEY` + Vertex config |

## Navigating the documentation

This documentation is organized into the following sections:

### Overview

- **[Architecture overview](./architecture.md):** Understand the high-level
  design including the provider adapter layer, MCP tool registration, and
  interaction flow.
- **[Contribution guide](../CONTRIBUTING.md):** Information for contributors and
  developers, including setup, building, testing, and coding conventions.

### Get started

- **[Quick Manual (한국어)](./short_manual.md):** 빠르게 시작하기 위한 간편
  매뉴얼.
- **[Quickstart](./get-started/index.md):** Get started with the CLI.
- **[Gemini 3 Pro](./get-started/gemini-3.md):** Learn how to enable and use
  Gemini 3.
- **[Authentication](./get-started/authentication.md):** Authenticate to the
  CLI. Use `/auth login` for interactive provider selection.
- **[Configuration](./get-started/configuration.md):** Learn how to configure
  the CLI.
- **[Installation](./get-started/installation.md):** Install and run the CLI.
- **[Examples](./get-started/examples.md):** Example usage.

### CLI

- **[Introduction](./cli/index.md):** Overview of the command-line interface.
- **[Commands](./cli/commands.md):** Description of available CLI commands.
- **[Checkpointing](./cli/checkpointing.md):** Save and resume conversations.
- **[Custom commands](./cli/custom-commands.md):** Create your own commands and
  shortcuts for frequently used prompts.
- **[Enterprise](./cli/enterprise.md):** Enterprise deployment guide.
- **[Headless mode](./cli/headless.md):** Use the CLI programmatically for
  scripting and automation.
- **[Keyboard shortcuts](./cli/keyboard-shortcuts.md):** A reference for all
  keyboard shortcuts.
- **[Model selection](./cli/model.md):** Select the model and provider with
  `/model`. Supports all providers.
- **[Sandbox](./cli/sandbox.md):** Isolate tool execution in a secure,
  containerized environment.
- **[Agent Skills](./cli/skills.md):** (Experimental) Extend the CLI with
  specialized expertise and procedural workflows.
- **[Settings](./cli/settings.md):** Configure the CLI's behavior and appearance
  with `/settings`.
- **[Telemetry](./cli/telemetry.md):** Overview of telemetry in the CLI.
- **[Themes](./cli/themes.md):** Themes for the CLI.
- **[Token caching](./cli/token-caching.md):** Token caching and optimization.
- **[Trusted Folders](./cli/trusted-folders.md):** Trusted Folders security
  feature.
- **[Tutorials](./cli/tutorials.md):** Tutorials.
- **[Uninstall](./cli/uninstall.md):** Methods for uninstalling the CLI.

### Core

- **[Introduction](./core/index.md):** Information about the core package.
- **[Memport](./core/memport.md):** Using the Memory Import Processor.
- **[Long-term memory proposal](./core/long-term-memory-proposal.md):**
  PostgreSQL-based long-term memory proposal.
- **[Long-term memory design](./core/long-term-memory-design.md):** Long-term
  memory storage/retrieval design.
- **[Tools API](./core/tools-api.md):** Information on how the core manages and
  exposes tools.
- **[System Prompt Override](./cli/system-prompt.md):** Replace built-in system
  instructions using `DIDIM_SYSTEM_MD` (or `GEMINI_SYSTEM_MD`).
- **[Policy Engine](./core/policy-engine.md):** Use the Policy Engine for
  fine-grained control over tool execution.

### Multi-Provider

- **[Provider Guide](./providers.md):** Multi-provider runtime usage (`gemini`,
  `claude`, `openai`, `openai-compatible` including vLLM).
- **[Multi-Provider Configuration](./configuration.md):** Environment variables
  and precedence for provider/model resolution.
- **[Migration Guide](./migration.md):** Move from Gemini-only to
  provider-independent (`llm*`) call paths.

### Tools

- **[Introduction](./tools/index.md):** Information about the CLI's tools.
- **[File system tools](./tools/file-system.md):** Documentation for the
  `read_file` and `write_file` tools.
- **[Shell tool](./tools/shell.md):** Documentation for the `run_shell_command`
  tool.
- **[Web fetch tool](./tools/web-fetch.md):** Documentation for the `web_fetch`
  tool.
- **[Web search tool](./tools/web-search.md):** Documentation for the
  `google_web_search` tool.
- **[Memory tool](./tools/memory.md):** Documentation for the `save_memory`
  tool.
- **[Task tools](./tools/todos.md):** Documentation for the `task_create`,
  `task_get`, `task_update`, and `task_list` tools.
- **[MCP servers](./tools/mcp-server.md):** Using MCP servers with the CLI.
  Includes deterministic tool naming and sLM-compatible parameter normalization.

### Extensions

- **[Introduction](./extensions/index.md):** How to extend the CLI with new
  functionality.
- **[Writing extensions](./extensions/writing-extensions.md):** Learn how to
  build your own extension.
- **[Extension releasing](./extensions/releasing.md):** How to release
  extensions.

### Hooks

- **[Hooks](./hooks/index.md):** Intercept and customize CLI behavior at key
  lifecycle points.
- **[Writing Hooks](./hooks/writing-hooks.md):** Learn how to create your first
  hook with a comprehensive example.
- **[Best Practices](./hooks/best-practices.md):** Security, performance, and
  debugging guidelines for hooks.

### IDE integration

- **[Introduction](./ide-integration/index.md):** Connect the CLI to your
  editor.
- **[IDE companion extension spec](./ide-integration/ide-companion-spec.md):**
  Spec for building IDE companion extensions.

### Development

- **[NPM](./npm.md):** Details on how the project's packages are structured.
- **[Releases](./releases.md):** Information on the project's releases and
  deployment cadence.
- **[Changelog](./changelogs/index.md):** Highlights and notable changes.
- **[Integration tests](./integration-tests.md):** Information about the
  integration testing framework.
- **[Issue and PR automation](./issue-and-pr-automation.md):** Automated
  processes for managing issues and pull requests.

### Support

- **[FAQ](./faq.md):** Frequently asked questions.
- **[Troubleshooting guide](./troubleshooting.md):** Find solutions to common
  problems.
- **[Quota and pricing](./quota-and-pricing.md):** Learn about the free tier and
  paid options.
- **[Terms of service and privacy notice](./tos-privacy.md):** Information on
  the terms of service and privacy notices.

We hope this documentation helps you make the most of Didim Agent CLI!
