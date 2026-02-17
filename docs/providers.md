# Provider Guide

This guide describes the current multi-provider behavior in this repository.

## Scope

- `ENABLE_MULTI_PROVIDER=true` enables provider selection.
- Providers covered here: `gemini`, `claude`, `openai`, `openai-compatible`.
- `openai-compatible` can be used for vLLM, LM Studio, Ollama-compatible
  gateways, and other OpenAI-compatible endpoints.

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
export LLM_API_KEY="optional-key"
didim --model default
```

## vLLM Quick Start

### 1) Start vLLM server

Example (Docker):

```bash
docker run --rm -it \
  -p 8000:8000 \
  vllm/vllm-openai:latest \
  --model Qwen/Qwen2.5-7B-Instruct
```

### 2) Configure Gemini CLI for vLLM

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

## vLLM Troubleshooting

- If startup fails with missing env error, set `LLM_BASE_URL`.
- If requests fail with 404, verify `LLM_BASE_URL` includes the API prefix
  (typically `/v1`).
- If model errors occur, set `LLM_MODEL` or pass `-m` with a model name served
  by your vLLM instance.
