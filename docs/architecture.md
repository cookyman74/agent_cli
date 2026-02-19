# Architecture Overview

This document provides a high-level overview of the Didim Agent CLI's
architecture.

## Core components

The CLI is primarily composed of two main packages, a provider adapter layer,
and a suite of tools:

1.  **CLI package (`packages/cli`):**
    - **Purpose:** This contains the user-facing portion of the CLI, such as
      handling the initial user input, presenting the final output, and managing
      the overall user experience.
    - **Key functions contained in the package:**
      - [Input processing](/docs/cli/commands)
      - History management
      - Display rendering
      - [Theme and UI customization](/docs/cli/themes)
      - [CLI configuration settings](/docs/get-started/configuration)
      - Provider selection via `/auth login` and `/model` dialogs

2.  **Core package (`packages/core`):**
    - **Purpose:** This acts as the backend for the CLI. It receives requests
      sent from `packages/cli`, orchestrates interactions with the configured
      LLM provider, and manages the execution of available tools.
    - **Key functions contained in the package:**
      - Provider-independent LLM client (`BaseLlmClient` with `llm*` methods)
      - Legacy Gemini API client (backward compatible)
      - Prompt construction and management
      - Tool registration and execution logic
      - State management for conversations or sessions
      - Server-side configuration
      - Sub-agent execution via `LlmAgentChatSession`

3.  **Provider Adapter Layer (`packages/core/src/providers/`):**
    - **Purpose:** Abstracts LLM provider differences behind a unified
      `BaseAdapter` interface, enabling provider-independent code paths.
    - **Providers:** Gemini, Claude (Anthropic), OpenAI, OpenAI-compatible
      (vLLM, Ollama, LM Studio).
    - **Key components:**
      - `BaseAdapter` — Abstract class defining the adapter contract
        (`llmGenerateContentStream`, `llmGenerateContent`, `llmCountTokens`)
      - `GeminiAdapter` — Wraps `@google/genai` SDK, supports both legacy and
        `llm*` paths
      - `ClaudeAdapter` — Wraps `@anthropic-ai/sdk`, handles alternating role
        merging, thinking blocks, and stream state management
      - `OpenAIAdapter` — Wraps `openai` SDK, maps to OpenAI chat completions
      - `OpenAICompatibleAdapter` — Extends `OpenAIAdapter` for custom
        endpoints, custom headers, and local model gateways
      - `StreamAssembler` — Normalizes provider-specific stream events into
        unified `LlmStreamEvent` types
      - `ContentResolver` — Converts provider-independent `LlmMessage` to/from
        provider-native message formats
      - `ProviderRegistry` / `ProviderFactory` — Runtime provider selection and
        instantiation

4.  **Tools (`packages/core/src/tools/`):**
    - **Purpose:** These are individual modules that extend the capabilities of
      the LLM model, allowing it to interact with the local environment (e.g.,
      file system, shell commands, web fetching).
    - **Interaction:** `packages/core` invokes these tools based on requests
      from the LLM model.
    - **MCP Tools:** External tools discovered via MCP (Model Context Protocol)
      servers are registered through a deterministic 2-pass batch algorithm that
      ensures consistent naming regardless of server discovery order.

## Interaction flow

A typical interaction follows this flow:

1.  **User input:** The user types a prompt or command into the terminal, which
    is managed by `packages/cli`.
2.  **Request to core:** `packages/cli` sends the user's input to
    `packages/core`.
3.  **Provider routing:** The core determines which LLM provider to use based on
    configuration (`LLM_PROVIDER`, `authType`, or API key detection).
4.  **Request processed:** The core package:
    - Constructs an appropriate prompt, possibly including conversation history
      and available tool definitions.
    - Routes the request through the appropriate provider adapter.
    - The adapter converts provider-independent types (`LlmMessage`,
      `LlmContent`) to provider-native format and calls the provider API.
5.  **LLM API response:** The provider returns a response. The adapter converts
    the response back to provider-independent `LlmStreamEvent` types. This
    response might be a direct answer or a request to use one of the available
    tools.
6.  **Tool execution (if applicable):**
    - When the LLM requests a tool, the core package prepares to execute it.
    - Tool parameters are normalized via schema-based coercion
      (`normalizeToolParamsBySchema`) to handle sLM formatting variations.
    - If the requested tool can modify the file system or execute shell
      commands, the user is first given details of the tool and its arguments,
      and the user must approve the execution.
    - Read-only operations may not require explicit user confirmation.
    - The core package executes the relevant tool, and the result is sent back
      to the LLM through the adapter.
    - The LLM processes the tool result and generates a final response.
7.  **Response to CLI:** The core package sends the final response back to the
    CLI package.
8.  **Display to user:** The CLI package formats and displays the response to
    the user in the terminal.

## Provider adapter architecture

```
                         ┌─────────────────────────────────────┐
                         │          BaseLlmClient              │
                         │  (llmGenerateContentStream, etc.)   │
                         └──────────────┬──────────────────────┘
                                        │
                         ┌──────────────▼──────────────────────┐
                         │        ProviderFactory               │
                         │  (selects adapter by LLM_PROVIDER)   │
                         └──┬─────────┬─────────┬──────────┬───┘
                            │         │         │          │
                 ┌──────────▼┐ ┌──────▼───┐ ┌───▼─────┐ ┌─▼──────────────┐
                 │  Gemini   │ │  Claude   │ │ OpenAI  │ │ OpenAI-compat  │
                 │  Adapter  │ │  Adapter  │ │ Adapter │ │ Adapter        │
                 └──────┬────┘ └────┬──────┘ └────┬────┘ └───────┬────────┘
                        │          │             │              │
                 ┌──────▼────┐ ┌───▼──────┐ ┌───▼─────┐ ┌─────▼────────┐
                 │ @google/  │ │@anthropic│ │ openai  │ │ openai SDK   │
                 │ genai SDK │ │ -ai/sdk  │ │ SDK     │ │ + custom URL │
                 └───────────┘ └──────────┘ └─────────┘ └──────────────┘
```

Each adapter implements:

- **Type conversion:** `LlmMessage` ↔ provider-native message format
- **Stream normalization:** Provider stream events → `LlmStreamEvent`
- **Error classification:** Provider errors → `LlmError` with typed categories
  (authentication, rate limit, invalid request, model not found, etc.)
- **Token counting:** Provider-specific or local fallback estimation

## MCP tool registration

MCP tools from external servers are registered through a deterministic 2-pass
batch algorithm:

1.  **Pass 1:** Group all tools by sanitized base name, detect naming conflicts
    across servers.
2.  **Pass 2:** Register tools — unqualified for unique names, fully qualified
    (`server__tool`) for conflicts, with hash+counter disambiguation for
    same-server collisions.

Tool names are capped at 63 characters. The `__` separator is protected during
sanitization. Policy engine wildcards (`server__*`) validate both server name
prefix and extracted tool prefix for security.

## Key design principles

- **Modularity:** Separating the CLI (frontend) from the Core (backend) allows
  for independent development and potential future extensions.
- **Provider independence:** The adapter pattern enables adding new LLM
  providers without modifying core business logic.
- **Extensibility:** The tool system is designed to be extensible, supporting
  both built-in tools and MCP server integrations.
- **Backward compatibility:** Legacy Gemini API paths remain functional.
  Configuration paths (`~/.didim/` with `~/.gemini/` fallback) and environment
  variables (`DIDIM_*` with `GEMINI_*` fallback) maintain backward
  compatibility.
- **User experience:** The CLI focuses on providing a rich and interactive
  terminal experience.
