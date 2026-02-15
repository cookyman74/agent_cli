# Multi-Provider Configuration

This page documents environment variables for provider selection and routing.

## Core Flags

| Variable                | Required                      | Description                                          |
| ----------------------- | ----------------------------- | ---------------------------------------------------- |
| `ENABLE_MULTI_PROVIDER` | Yes (for multi-provider mode) | Enables provider routing in `createContentGenerator` |
| `LLM_PROVIDER`          | Recommended                   | Explicit provider selection                          |
| `LLM_MODEL`             | Optional                      | Provider model override for non-Gemini providers     |

`LLM_PROVIDER` supported values:

- `gemini`
- `claude` or `anthropic`
- `openai`
- `openai-compatible` or `openai_compatible`
- `didim`

## Provider Credentials

| Provider          | Required env                                        |
| ----------------- | --------------------------------------------------- |
| Gemini            | `GEMINI_API_KEY` or `GOOGLE_API_KEY`                |
| Claude            | `ANTHROPIC_API_KEY`                                 |
| OpenAI            | `OPENAI_API_KEY`                                    |
| OpenAI-compatible | `LLM_BASE_URL` (required), `LLM_API_KEY` (optional) |
| Didim             | `DIDIM_API_KEY`                                     |

## OpenAI-Compatible Header Options

For OpenAI-compatible endpoints, you can customize outbound headers:

| Variable             | Description                              |
| -------------------- | ---------------------------------------- |
| `LLM_CUSTOM_HEADERS` | JSON object merged into default headers  |
| `LLM_API_KEY_HEADER` | Custom header name for API key injection |

Example:

```bash
export LLM_PROVIDER=openai-compatible
export LLM_BASE_URL="http://localhost:8000/v1"
export LLM_API_KEY="my-secret"
export LLM_API_KEY_HEADER="X-API-Key"
export LLM_CUSTOM_HEADERS='{"X-Tenant":"dev"}'
```

When `LLM_API_KEY_HEADER` is set, the OpenAI SDK `Authorization` header is
suppressed and the key is sent via the custom header.

## Selection and Precedence

Provider selection precedence:

1. `LLM_PROVIDER`
2. `authType` (Gemini-only path)
3. Gemini key fallback (`GEMINI_API_KEY` or `GOOGLE_API_KEY`)

Model resolution precedence:

1. `--model` flag (argv).
2. `LLM_MODEL` environment variable.
3. `GEMINI_MODEL` environment variable.
4. Per-provider saved model (`model.byProvider[provider]` in user settings).
5. Global saved model (`model.name` in user settings).
6. Provider default model (`claude-opus-4-6`, `gpt-4.1`, `default`).

## Notes

- For vLLM and similar gateways, use `openai-compatible` with `LLM_BASE_URL` and
  a served model name.

## vLLM / OpenAI-Compatible Details

### `LLM_BASE_URL` format

- Set the full API base URL that exposes OpenAI-compatible routes.
- Most vLLM deployments use: `http://<host>:<port>/v1`

Examples:

```bash
export LLM_BASE_URL="http://localhost:8000/v1"
export LLM_BASE_URL="https://vllm.company.internal/v1"
```

### Recommended variables for vLLM

```bash
export ENABLE_MULTI_PROVIDER=true
export LLM_PROVIDER=openai-compatible
export LLM_BASE_URL="http://localhost:8000/v1"
export LLM_MODEL="Qwen/Qwen2.5-7B-Instruct"
```

Optional auth variables:

```bash
export LLM_API_KEY="optional-or-required-by-gateway"
export LLM_API_KEY_HEADER="X-API-Key"
export LLM_CUSTOM_HEADERS='{"X-Tenant":"dev"}'
```

### Runtime notes

- `LLM_MODEL` is useful when the configured model is Gemini-specific (`auto`,
  `pro`, `flash`, `gemini-*`).
- If `LLM_MODEL` is not set and a Gemini-specific model is configured, the
  runtime resolves to `default` for `openai-compatible`.
