# Migration Guide: Gemini-Only to Multi-Provider

This guide summarizes practical migration steps for moving from Gemini-only
flows to provider-independent flows.

## 1. Enable Multi-Provider Mode

```bash
export ENABLE_MULTI_PROVIDER=true
```

Without this flag, the runtime follows the legacy Gemini-focused path.

## 2. Set Provider and Credentials

Choose one provider path:

```bash
# Claude
export LLM_PROVIDER=claude
export ANTHROPIC_API_KEY="your-key"

# OpenAI
export LLM_PROVIDER=openai
export OPENAI_API_KEY="your-key"
```

## 3. Update Runtime Call Path

For non-Gemini providers, use provider-independent methods:

- `llmGenerateContent(...)`
- `llmGenerateContentStream(...)`
- `llmCountTokens(...)`

Do not rely on legacy Gemini SDK methods for non-Gemini providers.

## 4. Model Handling

If your configured model is Gemini-specific (`auto`, `pro`, `flash`,
`gemini-*`), non-Gemini providers resolve to provider defaults.

Use `LLM_MODEL` to enforce a concrete provider model:

```bash
export LLM_MODEL=claude-sonnet-4-20250514
```

## 5. Validate

- Confirm startup succeeds with `ENABLE_MULTI_PROVIDER=true`.
- Confirm prompt calls reach the selected provider.
- Confirm no legacy API error appears:
  `Provider "<name>" does not support legacy Gemini API. Use llm* methods.`

## 6. vLLM Migration Path

For vLLM or other OpenAI-compatible local endpoints:

```bash
export ENABLE_MULTI_PROVIDER=true
export LLM_PROVIDER=openai-compatible
export LLM_BASE_URL="http://localhost:8000/v1"
export LLM_MODEL="Qwen/Qwen2.5-7B-Instruct"
```

Then run:

```bash
gemini -m Qwen/Qwen2.5-7B-Instruct
```

If your gateway requires custom auth header semantics:

```bash
export LLM_API_KEY="your-key"
export LLM_API_KEY_HEADER="X-API-Key"
```
