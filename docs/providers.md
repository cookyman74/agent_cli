# Provider Guide

This guide describes the current multi-provider behavior in Didim Agent CLI.

> **Note:** Both `DIDIM_*` and `GEMINI_*` environment variable prefixes are
> supported throughout the CLI. The central `resolveEnv()` utility checks
> `DIDIM_*` first, then falls back to `GEMINI_*` for backward compatibility.

## Scope

- `ENABLE_MULTI_PROVIDER=true` enables provider selection.
- Providers covered here: `gemini`, `claude`, `openai`, `openai-compatible`.
- `openai-compatible` can be used for vLLM, LM Studio, Ollama-compatible
  gateways, and other OpenAI-compatible endpoints.
- All built-in tools (file system, shell, web fetch, etc.) and MCP tools work
  across all providers.
- Sub-agents work with all providers via the provider-independent `llm*`
  pipeline.

## Provider Matrix

| Provider          | `LLM_PROVIDER` value                       | Required env                                                    | Notes                                                      |
| ----------------- | ------------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------- |
| Gemini            | `gemini`                                   | `GEMINI_API_KEY` or `GOOGLE_API_KEY` (unless OAuth/Vertex flow) | Legacy Gemini APIs and `llm*` APIs both available          |
| Claude            | `claude` or `anthropic`                    | `ANTHROPIC_API_KEY`                                             | Uses provider-independent `llm*` pipeline                  |
| OpenAI            | `openai`                                   | `OPENAI_API_KEY`                                                | Uses provider-independent `llm*` pipeline                  |
| OpenAI-compatible | `openai-compatible` or `openai_compatible` | `LLM_BASE_URL`                                                  | OpenAI-compatible endpoint (`/v1`) for vLLM/local gateways |

## Quick Start

Run with the `didim` CLI command.

### Gemini

```bash
export ENABLE_MULTI_PROVIDER=true
export LLM_PROVIDER=gemini
export GEMINI_API_KEY="your-key"
didim --model gemini-2.5-pro
```

### Claude

```bash
export ENABLE_MULTI_PROVIDER=true
export LLM_PROVIDER=claude
export ANTHROPIC_API_KEY="your-key"
didim --model claude-sonnet-4-20250514
```

### OpenAI

```bash
export ENABLE_MULTI_PROVIDER=true
export LLM_PROVIDER=openai
export OPENAI_API_KEY="your-key"
didim --model gpt-4o
```

### OpenAI-compatible (vLLM)

```bash
export ENABLE_MULTI_PROVIDER=true
export LLM_PROVIDER=openai-compatible
export LLM_BASE_URL="http://localhost:8000/v1"
export LLM_MODEL="Qwen/Qwen2.5-7B-Instruct"
export LLM_API_KEY="optional-key"
didim --model Qwen/Qwen2.5-7B-Instruct
```

## sLM Interactive Configuration

The `/auth login` command provides a 4-step wizard for configuring
OpenAI-compatible endpoints:

### Step 1: API Endpoint URL

Enter your server's base URL:

- **vLLM**: `http://localhost:8000/v1`
- **Ollama**: `http://localhost:11434/v1`
- **LM Studio**: `http://localhost:1234/v1`
- **GPUStack**: `http://your-gpustack-server/v1`

### Step 2: Server Type Selection

Select your server type to receive provider-specific guidance:

| Server Type | Model Name Guidance                                    |
| ----------- | ------------------------------------------------------ |
| GPUStack    | Use the deployment name from GPUStack dashboard        |
| vLLM        | Use the model name passed to `--model` when starting   |
| Ollama      | Use model name from `ollama list` (e.g., `llama3:70b`) |
| LM Studio   | Check the loaded model name in LM Studio UI            |
| Other       | Refer to your server's documentation                   |

### Step 3: Credentials

- **API Key** (optional): Required for authenticated endpoints
- **Model Name** (required): The exact model identifier your server expects

### Step 4: Advanced Settings

- **API Key Header Name** (optional): Custom header for API key (default:
  `Authorization`)
- **Custom Headers** (optional): Additional headers in `Key: Value` format or
  JSON

## vLLM Quick Start

### 1) Start vLLM server

Example (Docker):

```bash
docker run --rm -it \
  -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-7B-Instruct
```

### 2) Configure Didim Agent CLI for vLLM

```bash
export ENABLE_MULTI_PROVIDER=true
export LLM_PROVIDER=openai-compatible
export LLM_BASE_URL="http://localhost:8000/v1"
export LLM_MODEL="Qwen/Qwen2.5-7B-Instruct"
```

If your vLLM endpoint requires auth:

```bash
export LLM_API_KEY="your-key"
```

If your gateway requires a non-standard key header:

```bash
export LLM_API_KEY_HEADER="X-API-Key"
```

### 3) Run

```bash
didim -m Qwen/Qwen2.5-7B-Instruct
```

## Model Resolution Rules

When a Gemini-specific model is configured with a non-Gemini provider, the
runtime resolves a provider-appropriate model:

| Provider          | Default resolved model | Available via `/model`                                                        |
| ----------------- | ---------------------- | ----------------------------------------------------------------------------- |
| Gemini            | `gemini-2.5-pro`       | gemini-3-pro-preview, gemini-3-flash-preview, gemini-2.5-pro/flash/flash-lite |
| Claude            | `claude-opus-4-6`      | claude-opus-4-6, claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001        |
| OpenAI            | `gpt-4.1`              | gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-4o, o3, o4-mini                      |
| OpenAI-compatible | `default`              | Freeform text input (any model name)                                          |

Override with `LLM_MODEL` for non-Gemini providers when needed.

## Important Runtime Behavior

- Non-Gemini providers do not support legacy Gemini SDK methods
  (`generateContent`, `generateContentStream`, `countTokens`, `embedContent`) on
  the legacy interface.
- Use provider-independent methods (`llmGenerateContent`,
  `llmGenerateContentStream`, `llmCountTokens`) for
  Claude/OpenAI/OpenAI-compatible paths.
- If you call legacy methods on non-Gemini providers, runtime throws:
  `Provider "<name>" does not support legacy Gemini API. Use llm* methods.`

## MCP Tool Compatibility

MCP tools from external servers work with all providers. Tool naming is
**deterministic** — tools are registered with consistent names regardless of
server discovery order. Tool parameters are automatically normalized via
schema-based coercion (`normalizeToolParamsBySchema`), with enhanced tolerance
for sLM (small Language Model) tool call formatting.

See the [MCP Server Integration guide](./tools/mcp-server.md) for setup
instructions.

## sLM Tool Configuration

Small language models (sLM) often have limited context windows. To reduce system
prompt size and improve reliability, you can limit enabled tools using the
`tools.core` setting in `~/.didim/settings.json`:

### Minimal Tool Set (6 tools)

```json
{
  "tools": {
    "core": [
      "read_file",
      "search_file_content",
      "glob",
      "replace",
      "write_file",
      "run_shell_command"
    ]
  }
}
```

### Available Built-in Tools

| Tool Name             | Description                                 |
| --------------------- | ------------------------------------------- |
| `read_file`           | Read file contents                          |
| `search_file_content` | Search for patterns in files (grep/ripgrep) |
| `glob`                | Find files matching glob patterns           |
| `replace`             | Edit/replace content in files               |
| `write_file`          | Create or overwrite files                   |
| `run_shell_command`   | Execute shell commands                      |
| `list_directory`      | List directory contents                     |
| `web_fetch`           | Fetch content from URLs                     |
| `google_web_search`   | Search the web via Google                   |
| `save_memory`         | Save context to memory (AGENTS.md)          |
| `activate_skill`      | Activate agent skills                       |
| `task_create`         | Create structured tasks                     |
| `task_get`            | Get task details                            |
| `task_update`         | Update task status                          |
| `task_list`           | List all tasks                              |

> **Tip:** For context overflow errors (e.g., `max_tokens` negative), the
> recommended solution is to increase `--max-model-len` on your serving side
> rather than reducing tools. For example:
>
> ```bash
> # vLLM with increased context
> vllm serve your-model --max-model-len 16384
>
> # GPUStack: Configure in deployment settings
> ```

## vLLM Troubleshooting

- If startup fails with missing env error, set `LLM_BASE_URL`.
- If requests fail with 404, verify `LLM_BASE_URL` includes the API prefix
  (typically `/v1`).
- If model errors occur, set `LLM_MODEL` or pass `-m` with a model name served
  by your vLLM instance.
- If you see `403 Model Not Found`, ensure your `LLM_MODEL` matches the exact
  model name on your server.
