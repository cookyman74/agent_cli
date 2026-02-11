# Provider Adapter API

This page summarizes the provider-independent adapter contract used by the
multi-provider runtime.

## Core Interface

All adapters implement:

- `providerName: string`
- `capabilities: LlmProviderCapabilities`
- `generateContent(request, userPromptId, options?)`
- `generateContentStream(request, userPromptId, options?)`
- `countTokens(request)` (optional by capability)
- `embedContent(request)` (optional by capability)

## Request and Response Types

Main request type:

- `LlmGenerateRequest`
  - `model`
  - `messages`
  - optional: `systemInstruction`, `tools`, `toolChoice`, sampling options

Main response type:

- `LlmGenerateResponse`
  - `id`, `content`, `model`, `stopReason`
  - optional `usage`

Streaming:

- `LlmEventStream` (`AsyncGenerator<LlmEvent, void, unknown>`)
- Event enum: `LlmEventType`

## Adapter Registry and Factory

Runtime creation flow:

1. Provider bootstrap registers factories into `ProviderRegistry`.
2. `ProviderFactory.create(provider, config)` returns the adapter.
3. Legacy generator wrapper exposes `llm*` methods for non-Gemini providers.

## Provider Notes

- Gemini: supports legacy and `llm*` paths.
- Claude/OpenAI/OpenAI-compatible: intended for `llm*` path.
- OpenAI-compatible runtime config:
  - `LLM_PROVIDER=openai-compatible`
  - `LLM_BASE_URL=<openai-compatible-endpoint>`
  - `LLM_API_KEY` optional (gateway dependent)
  - `LLM_API_KEY_HEADER` optional (custom auth header name)
- OpenAI-compatible default capability profile:
  - streaming/tool calls enabled
  - image input, embedding, token count disabled by default
