# Authentication setup

This CLI supports multiple AI providers. This guide helps you find the best way
to authenticate based on your provider and account type.

## Choose your authentication method <a id="auth-methods"></a>

Select the authentication method that matches your situation in the table below:

| Provider / Scenario                                                    | Recommended Authentication Method                                | Google Cloud Project Required                               |
| :--------------------------------------------------------------------- | :--------------------------------------------------------------- | :---------------------------------------------------------- |
| Individual Google accounts (Gemini)                                    | [Login with Google](#login-google)                               | No, with exceptions                                         |
| Organization users with a company, school, or Google Workspace account | [Login with Google](#login-google)                               | [Yes](#set-gcp)                                             |
| AI Studio user with a Gemini API key                                   | [Use Gemini API Key](#gemini-api)                                | No                                                          |
| Google Cloud Vertex AI user                                            | [Vertex AI](#vertex-ai)                                          | [Yes](#set-gcp)                                             |
| Anthropic Claude user                                                  | [Use Claude API Key](#claude-api)                                | No                                                          |
| OpenAI user                                                            | [Use OpenAI API Key](#openai-api)                                | No                                                          |
| Local/self-hosted model (sLM)                                          | [OpenAI-compatible endpoint](#openai-compatible)                 | No                                                          |
| DidimAIStudio user                                                     | [DidimAIStudio JWT](#didim-aistudio)                             | No                                                          |
| [Headless mode](#headless)                                             | [Use Gemini API Key](#gemini-api) or<br> [Vertex AI](#vertex-ai) | No (for Gemini API Key)<br> [Yes](#set-gcp) (for Vertex AI) |

### What is my Google account type?

- **Individual Google accounts:** Includes all
  [free tier accounts](../quota-and-pricing/#free-usage) such as Gemini Code
  Assist for individuals, as well as paid subscriptions for
  [Google AI Pro and Ultra](https://gemini.google/subscriptions/).

- **Organization accounts:** Accounts using paid licenses through an
  organization such as a company, school, or
  [Google Workspace](https://workspace.google.com/). Includes
  [Google AI Ultra for Business](https://support.google.com/a/answer/16345165)
  subscriptions.

## (Recommended) Login with Google <a id="login-google"></a>

If you run Gemini CLI on your local machine, the simplest authentication method
is logging in with your Google account. This method requires a web browser on a
machine that can communicate with the terminal running Gemini CLI (e.g., your
local machine).

> **Important:** If you are a **Google AI Pro** or **Google AI Ultra**
> subscriber, use the Google account associated with your subscription.

To authenticate and use Gemini CLI:

1. Start the CLI:

   ```bash
   didim
   ```

2. Select **Login with Google**. Gemini CLI opens a login prompt using your web
   browser. Follow the on-screen instructions. Your credentials will be cached
   locally for future sessions.

### Do I need to set my Google Cloud project?

Most individual Google accounts (free and paid) don't require a Google Cloud
project for authentication. However, you'll need to set a Google Cloud project
when you meet at least one of the following conditions:

- You are using a company, school, or Google Workspace account.
- You are using a Gemini Code Assist license from the Google Developer Program.
- You are using a license from a Gemini Code Assist subscription.

For instructions, see [Set your Google Cloud Project](#set-gcp).

## Use Gemini API key <a id="gemini-api"></a>

If you don't want to authenticate using your Google account, you can use an API
key from Google AI Studio.

To authenticate and use Gemini CLI with a Gemini API key:

1. Obtain your API key from
   [Google AI Studio](https://aistudio.google.com/app/apikey).

2. Set the `GEMINI_API_KEY` environment variable to your key. For example:

   ```bash
   # Replace YOUR_GEMINI_API_KEY with the key from AI Studio
   export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
   ```

   To make this setting persistent, see
   [Persisting Environment Variables](#persisting-vars).

3. Start the CLI:

   ```bash
   didim
   ```

4. Select **Use Gemini API key**.

> **Warning:** Treat API keys, especially for services like Gemini, as sensitive
> credentials. Protect them to prevent unauthorized access and potential misuse
> of the service under your account.

## Use Claude API key <a id="claude-api"></a>

To use this CLI with Anthropic's Claude models:

1. Obtain your API key from [Anthropic Console](https://console.anthropic.com/).

2. Set the `ANTHROPIC_API_KEY` environment variable:

   ```bash
   export ANTHROPIC_API_KEY="YOUR_ANTHROPIC_API_KEY"
   ```

   To make this setting persistent, see
   [Persisting Environment Variables](#persisting-vars).

3. Start the CLI:

   ```bash
   didim
   ```

4. The CLI automatically detects your Anthropic API key and selects Claude as
   the active provider. Use `/model` to choose between Claude models
   (claude-opus-4-6, claude-sonnet-4-5, claude-haiku-4-5).

### Using `/auth login` for Claude

Alternatively, you can use the interactive auth flow:

1. Start the CLI and run `/auth login`.
2. Select **Claude** from the provider list.
3. Enter your Anthropic API key when prompted.
4. The key is saved to your user settings for future sessions.

## Use OpenAI API key <a id="openai-api"></a>

To use this CLI with OpenAI models:

1. Obtain your API key from
   [OpenAI Platform](https://platform.openai.com/api-keys).

2. Set the `OPENAI_API_KEY` environment variable:

   ```bash
   export OPENAI_API_KEY="YOUR_OPENAI_API_KEY"
   ```

   To make this setting persistent, see
   [Persisting Environment Variables](#persisting-vars).

3. Start the CLI:

   ```bash
   didim
   ```

4. The CLI automatically detects your OpenAI API key and selects OpenAI as the
   active provider. Use `/model` to choose between OpenAI models (gpt-5.4,
   gpt-5.4-pro, gpt-5.3-codex, gpt-5-mini, o3, o4-mini, etc.).

### Using `/auth login` for OpenAI

Alternatively, you can use the interactive auth flow:

1. Start the CLI and run `/auth login`.
2. Select **OpenAI** from the provider list.
3. Enter your OpenAI API key when prompted.
4. The key is saved to your user settings for future sessions.

## Use OpenAI-compatible endpoint (sLM) <a id="openai-compatible"></a>

For local or self-hosted models (vLLM, Ollama, LM Studio, GPUStack, etc.) that
expose an OpenAI-compatible API.

### Option A: Using `/auth login` (Recommended)

The interactive `/auth login` command provides a guided 4-step configuration
wizard:

1. Start the CLI and run `/auth login`.
2. Select **sLM (OpenAI-compatible endpoint)** from the provider list.
3. Follow the 4-step wizard:
   - **Step 1: API Endpoint URL** — Enter your server's base URL (e.g.,
     `http://localhost:8000/v1`, `http://localhost:11434/v1`)
   - **Step 2: Server Type** — Select your server type for provider-specific
     guidance:
     - **GPUStack** — Use deployment name from GPUStack dashboard
     - **vLLM** — Use the model name passed to `--model` when starting vLLM
     - **Ollama** — Use the model name from `ollama list`
     - **LM Studio** — Check loaded model name in LM Studio UI
     - **Other** — Generic OpenAI-compatible server
   - **Step 3: Credentials** — Enter API key (optional) and model name
     (**required**)
   - **Step 4: Advanced Settings** — Configure custom API key header name and
     custom headers (optional)

4. The configuration is saved to your user settings for future sessions.

### Option B: Using environment variables

Set the required environment variables:

```bash
export ENABLE_MULTI_PROVIDER=true
export LLM_PROVIDER=openai-compatible
export LLM_BASE_URL="http://localhost:8000/v1"
export LLM_MODEL="your-model-name"  # Required
```

If your endpoint requires authentication:

```bash
export LLM_API_KEY="your-key"
```

If your gateway requires a non-standard API key header:

```bash
export LLM_API_KEY_HEADER="X-API-Key"
```

Start the CLI:

```bash
didim
```

### Limiting tools for context-constrained sLM

Small language models often have limited context windows. To reduce the system
prompt size, you can limit which built-in tools are enabled using the
`tools.core` setting in `settings.json`:

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

Available tool names:

| Tool Name             | Description                         |
| --------------------- | ----------------------------------- |
| `read_file`           | Read file contents                  |
| `search_file_content` | Search for patterns in files (grep) |
| `glob`                | Find files matching patterns        |
| `replace`             | Edit/replace content in files       |
| `write_file`          | Write new files                     |
| `run_shell_command`   | Execute shell commands              |
| `list_directory`      | List directory contents             |
| `web_fetch`           | Fetch content from URLs             |
| `google_web_search`   | Search the web via Google           |
| `save_memory`         | Save context to memory              |
| `activate_skill`      | Activate agent skills               |
| `task_create`         | Create structured tasks             |
| `task_get`            | Get task details                    |
| `task_update`         | Update task status                  |
| `task_list`           | List all tasks                      |

> **Note:** For context overflow issues, the recommended root solution is to
> increase `--max-model-len` on your serving side (vLLM, GPUStack, etc.) rather
> than limiting tools.

For detailed setup and troubleshooting, see the
[Provider Guide](../providers.md).

## Use DidimAIStudio <a id="didim-aistudio"></a>

To use this CLI with DidimAIStudio's scenario-based gateway:

### Option A: Using `/auth login` (Recommended)

1. Start the CLI and run `/auth login`.
2. Select **DidimAIStudio** from the provider list.
3. Follow the 3-step wizard:
   - **Step 1: Server Address** — Enter the DidimAIStudio server domain (e.g.,
     `aistudio.didim365.com`)
   - **Step 2: JWT Token** — Enter your JWT authentication token (input is
     masked for security)
   - **Step 3: Stream Mode** — Select `sse` (standard) or `improved` (enhanced
     event format)
4. The configuration is saved to your user settings for future sessions.

### Option B: Using environment variables

```bash
export DIDIM_API_KEY="your-jwt-token"
export DIDIM_SERVER_ADDRESS="aistudio.didim365.com"
export DIDIM_STREAM_MODE="sse"  # or "improved"
```

To make these settings persistent, see
[Persisting Environment Variables](#persisting-vars).

Start the CLI:

```bash
didim
```

> **Note:** DidimAIStudio uses a scenario-based model routing system. Individual
> model selection via `/model` is not available. The server automatically routes
> requests to the appropriate model based on the configured scenario.

## Use Vertex AI <a id="vertex-ai"></a>

To use Gemini CLI with Google Cloud's Vertex AI platform, choose from the
following authentication options:

- A. Application Default Credentials (ADC) using `gcloud`.
- B. Service account JSON key.
- C. Google Cloud API key.

Regardless of your authentication method for Vertex AI, you'll need to set
`GOOGLE_CLOUD_PROJECT` to your Google Cloud project ID with the Vertex AI API
enabled, and `GOOGLE_CLOUD_LOCATION` to the location of your Vertex AI resources
or the location where you want to run your jobs.

For example:

```bash
# Replace with your project ID and desired location (e.g., us-central1)
export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
export GOOGLE_CLOUD_LOCATION="YOUR_PROJECT_LOCATION"
```

To make any Vertex AI environment variable settings persistent, see
[Persisting Environment Variables](#persisting-vars).

#### A. Vertex AI - application default credentials (ADC) using `gcloud`

Consider this authentication method if you have Google Cloud CLI installed.

> **Note:** If you have previously set `GOOGLE_API_KEY` or `GEMINI_API_KEY`, you
> must unset them to use ADC:
>
> ```bash
> unset GOOGLE_API_KEY GEMINI_API_KEY
> ```

1. Verify you have a Google Cloud project and Vertex AI API is enabled.

2. Log in to Google Cloud:

   ```bash
   gcloud auth application-default login
   ```

3. [Configure your Google Cloud Project](#set-gcp).

4. Start the CLI:

   ```bash
   didim
   ```

5. Select **Vertex AI**.

#### B. Vertex AI - service account JSON key

Consider this method of authentication in non-interactive environments, CI/CD
pipelines, or if your organization restricts user-based ADC or API key creation.

> **Note:** If you have previously set `GOOGLE_API_KEY` or `GEMINI_API_KEY`, you
> must unset them:
>
> ```bash
> unset GOOGLE_API_KEY GEMINI_API_KEY
> ```

1.  [Create a service account and key](https://cloud.google.com/iam/docs/keys-create-delete)
    and download the provided JSON file. Assign the "Vertex AI User" role to the
    service account.

2.  Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the JSON
    file's absolute path. For example:

    ```bash
    # Replace /path/to/your/keyfile.json with the actual path
    export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/keyfile.json"
    ```

3.  [Configure your Google Cloud Project](#set-gcp).

4.  Start the CLI:

    ```bash
    didim
    ```

5.  Select **Vertex AI**.
    > **Warning:** Protect your service account key file as it gives access to
    > your resources.

#### C. Vertex AI - Google Cloud API key

1.  Obtain a Google Cloud API key:
    [Get an API Key](https://cloud.google.com/vertex-ai/generative-ai/docs/start/api-keys?usertype=newuser).

2.  Set the `GOOGLE_API_KEY` environment variable:

    ```bash
    # Replace YOUR_GOOGLE_API_KEY with your Vertex AI API key
    export GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY"
    ```

    > **Note:** If you see errors like
    > `"API keys are not supported by this API..."`, your organization might
    > restrict API key usage for this service. Try the other Vertex AI
    > authentication methods instead.

3.  [Configure your Google Cloud Project](#set-gcp).

4.  Start the CLI:

    ```bash
    didim
    ```

5.  Select **Vertex AI**.

## Set your Google Cloud project <a id="set-gcp"></a>

> **Important:** Most individual Google accounts (free and paid) don't require a
> Google Cloud project for authentication.

When you sign in using your Google account, you may need to configure a Google
Cloud project for Gemini CLI to use. This applies when you meet at least one of
the following conditions:

- You are using a Company, School, or Google Workspace account.
- You are using a Gemini Code Assist license from the Google Developer Program.
- You are using a license from a Gemini Code Assist subscription.

To configure Gemini CLI to use a Google Cloud project, do the following:

1.  [Find your Google Cloud Project ID](https://support.google.com/googleapi/answer/7014113).

2.  [Enable the Gemini for Cloud API](https://cloud.google.com/gemini/docs/discover/set-up-gemini#enable-api).

3.  [Configure necessary IAM access permissions](https://cloud.google.com/gemini/docs/discover/set-up-gemini#grant-iam).

4.  Configure your environment variables. Set either the `GOOGLE_CLOUD_PROJECT`
    or `GOOGLE_CLOUD_PROJECT_ID` variable to the project ID to use with Gemini
    CLI. Gemini CLI checks for `GOOGLE_CLOUD_PROJECT` first, then falls back to
    `GOOGLE_CLOUD_PROJECT_ID`.

    For example, to set the `GOOGLE_CLOUD_PROJECT_ID` variable:

    ```bash
    # Replace YOUR_PROJECT_ID with your actual Google Cloud project ID
    export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"
    ```

    To make this setting persistent, see
    [Persisting Environment Variables](#persisting-vars).

## Persisting environment variables <a id="persisting-vars"></a>

To avoid setting environment variables for every terminal session, you can
persist them with the following methods:

1.  **Add your environment variables to your shell configuration file:** Append
    the `export ...` commands to your shell's startup file (e.g., `~/.bashrc`,
    `~/.zshrc`, or `~/.profile`) and reload your shell (e.g.,
    `source ~/.bashrc`).

    ```bash
    # Example for .bashrc
    echo 'export GOOGLE_CLOUD_PROJECT="YOUR_PROJECT_ID"' >> ~/.bashrc
    source ~/.bashrc
    ```

    > **Warning:** Be aware that when you export API keys or service account
    > paths in your shell configuration file, any process launched from that
    > shell can read them.

2.  **Use a `.env` file:** Create a `.didim/.env` file in your project directory
    or home directory. Gemini CLI automatically loads variables from the first
    `.env` file it finds, searching up from the current directory, then in
    `~/.didim/.env` or `~/.env`. `.didim/.env` is recommended.

    Example for user-wide settings:

    ```bash
    mkdir -p ~/.didim
    cat >> ~/.didim/.env <<'EOF'
    GOOGLE_CLOUD_PROJECT="your-project-id"
    # Add other variables like GEMINI_API_KEY as needed
    EOF
    ```

Variables are loaded from the first file found, not merged.

## Running in Google Cloud environments <a id="cloud-env"></a>

When running Gemini CLI within certain Google Cloud environments, authentication
is automatic.

In a Google Cloud Shell environment, Gemini CLI typically authenticates
automatically using your Cloud Shell credentials. In Compute Engine
environments, Gemini CLI automatically uses Application Default Credentials
(ADC) from the environment's metadata server.

If automatic authentication fails, use one of the interactive methods described
on this page.

## Running in headless mode <a id="headless"></a>

[Headless mode](../cli/headless) will use your existing authentication method,
if an existing authentication credential is cached.

If you have not already logged in with an authentication credential, you must
configure authentication using environment variables:

- [Use Gemini API Key](#gemini-api)
- [Vertex AI](#vertex-ai)

## What's next?

Your authentication method affects your quotas, pricing, Terms of Service, and
privacy notices. Review the following pages to learn more:

- [Gemini CLI: Quotas and Pricing](../quota-and-pricing.md).
- [Gemini CLI: Terms of Service and Privacy Notice](../tos-privacy.md).
