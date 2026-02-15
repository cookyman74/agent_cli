# Model selection (`/model` command)

Select your AI model. The `/model` command lets you configure the model used by
the CLI, giving you more control over your results. The available models depend
on your currently active provider.

> **Note:** The `/model` command (and the `--model` flag) does not override the
> model used by sub-agents. Consequently, even when using the `/model` flag you
> may see other models used in your model usage reports.

## How to use the `/model` command

Use the following command in the CLI:

```
/model
```

Running this command will open a dialog with options specific to your active
provider.

## Provider-specific model selection

### Gemini

| Option            | Description                                                    | Models                                                                 |
| ----------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Auto (Gemini 3)   | Let the system choose the best Gemini 3 model for your task.   | gemini-3-pro-preview (if enabled), gemini-3-flash-preview (if enabled) |
| Auto (Gemini 2.5) | Let the system choose the best Gemini 2.5 model for your task. | gemini-2.5-pro, gemini-2.5-flash                                       |
| Manual            | Select a specific model.                                       | Any available Gemini model.                                            |

We recommend selecting one of the **Auto** options. However, you can select
**Manual** to choose a specific model:

- gemini-3-pro-preview
- gemini-3-flash-preview
- gemini-2.5-pro
- gemini-2.5-flash
- gemini-2.5-flash-lite

#### Gemini 3 and preview features

> **Note:** Gemini 3 is not currently available on all account types. To learn
> more about Gemini 3 access, refer to
> [Gemini 3 on Gemini CLI](../get-started/gemini-3.md).

To enable Gemini 3 Pro and Gemini 3 Flash (if available), enable
[**Preview Features** by using the `settings` command](../cli/settings.md).

### Claude

| Option                        | Description               | Models                                                                 |
| ----------------------------- | ------------------------- | ---------------------------------------------------------------------- |
| Recommended (claude-opus-4-6) | Recommended Claude model. | claude-opus-4-6                                                        |
| Manual                        | Select a specific model.  | claude-opus-4-6, claude-sonnet-4-5-20250929, claude-haiku-4-5-20251001 |

### OpenAI

| Option                | Description               | Models                                                   |
| --------------------- | ------------------------- | -------------------------------------------------------- |
| Recommended (gpt-4.1) | Recommended OpenAI model. | gpt-4.1                                                  |
| Manual                | Select a specific model.  | gpt-4.1, gpt-4.1-mini, gpt-4.1-nano, gpt-4o, o3, o4-mini |

### OpenAI-compatible (sLM)

For local or self-hosted models, the `/model` dialog shows a **freeform text
input** field where you can type any model name served by your endpoint.

```
Enter model name: llama3.1
```

The model name is saved to your user settings and restored on next startup.

### DidimAIStudio

DidimAIStudio uses scenario-based model routing. The `/model` dialog displays an
informational message indicating that individual model selection is not
supported for this provider.

## Model persistence

By default, model selection applies only to the current session. Press **Tab**
in the model dialog to toggle the **"Remember model for future sessions"**
option. When enabled, your selection is persisted per-provider and restored on
next startup.

For sLM (OpenAI-compatible) providers, model selection is always persisted
automatically.

## Using the `--model` flag

You can also use the `--model` flag to specify a particular model on startup:

```bash
# Gemini
gemini -m gemini-2.5-flash

# Claude (requires ANTHROPIC_API_KEY)
gemini -m claude-sonnet-4-5-20250929

# OpenAI (requires OPENAI_API_KEY)
gemini -m gpt-4.1-mini

# sLM (requires LLM_BASE_URL)
gemini -m Qwen/Qwen2.5-7B-Instruct
```

For non-Gemini providers, you can also set the `LLM_MODEL` environment variable.
For more details, refer to the
[configuration documentation](../get-started/configuration.md).

## Per-provider model memory

The CLI remembers your model choice separately for each provider. When switching
between providers, your previous selection is restored:

1. Select Claude → choose claude-haiku-4-5 → switch to OpenAI
2. Select OpenAI → choose o3 → switch back to Claude
3. Claude restores claude-haiku-4-5 automatically

This per-provider memory is stored in your user settings under
`model.byProvider`.

## Best practices for model selection

- **Default to Auto (Gemini) or Recommended (Claude/OpenAI).** For most users,
  the default option provides the best balance for your tasks.

- **Switch to a specific model for specialized tasks.** Use reasoning models
  (o3, claude-opus) for complex tasks, or lighter models (gpt-4.1-nano,
  claude-haiku) for faster results.

- **Use sLM for local development.** OpenAI-compatible providers let you use
  local models for offline or privacy-sensitive work.
