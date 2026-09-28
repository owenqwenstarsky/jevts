# Provider adapters

`jevts` has one evaluation contract and three wire-format adapters. Set `api` when creating the client:

```ts
createJevts({ api: 'responses' });
createJevts({ api: 'chat-completions' });
createJevts({ api: 'anthropic' });
```

## Table of contents

- [Common request behavior](#common-request-behavior)
- [OpenAI Responses](#openai-responses)
- [OpenAI Chat Completions](#openai-chat-completions)
- [Anthropic Messages](#anthropic-messages)
- [Reasoning effort](#reasoning-effort)
- [Provider options](#provider-options)
- [Custom base URLs](#custom-base-urls)

## Common request behavior

Each adapter sends the model, a system harness prompt, and a JSON user payload containing:

```json
{
  "state": { "...": "caller state" },
  "model": "selected-model",
  "questions": {
    "questionId": {
      "type": "choice",
      "instructions": "question prompt",
      "criteria": { "option": "description" }
    }
  }
}
```

Question builders are serialized to the official field names: `instructions` for the prompt and `criteria` for choice options or score levels. Noul questions have no criteria field.

Requests use `content-type: application/json`. Bearer authentication is used for Responses and Chat Completions. Anthropic uses `x-api-key` and `anthropic-version: 2023-06-01`. The client does not add OpenRouter app or referrer headers.

## OpenAI Responses

The adapter sends `POST {baseURL}/responses` with a system message and a user message. It requests strict JSON Schema output using `text.format`:

```json
{
  "text": {
    "format": {
      "type": "json_schema",
      "name": "jevts_result",
      "strict": true,
      "schema": "generated from the question definitions"
    }
  }
}
```

For a non-`none` reasoning effort, the body includes `reasoning: { "effort": "high" }` (with the selected value). Output text is read from `output_text`, or from a text content block in `output` when `output_text` is absent.

## OpenAI Chat Completions

The adapter sends `POST {baseURL}/chat/completions` with `messages` containing the system harness and user JSON payload. It requests JSON mode with `response_format: { "type": "json_object" }`.

For a non-`none` reasoning effort, the body includes `reasoning_effort: "high"` (with the selected value). Output text is read from `choices[0].message.content`.

## Anthropic Messages

The adapter sends `POST {baseURL}/messages` with `max_tokens: 4096`, a `system` prompt, and one user message containing the JSON payload. Output text is read from the first text block in `content`.

For a non-`none` reasoning effort, the body includes:

```json
{
  "thinking": { "type": "adaptive" },
  "output_config": { "effort": "high" }
}
```

## Reasoning effort

The public values are `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`.

| Adapter | Accepted values | Native field |
| --- | --- | --- |
| `responses` | `none`, `minimal`, `low`, `medium`, `high`, `xhigh` | `reasoning.effort` |
| `chat-completions` | `none`, `low`, `medium`, `high` | `reasoning_effort` |
| `anthropic` | `none`, `low`, `medium`, `high` | adaptive `thinking` plus `output_config.effort` |

`minimal` and `xhigh` are rejected for Chat Completions and Anthropic with `UnsupportedReasoningEffortError`. `none` leaves reasoning fields out of the request.

## Provider options

Use namespaced options to add adapter-specific request fields:

```ts
const client = createJevts({
  api: 'responses',
});

await client.systemOne({
  model: 'openai/gpt-5',
  state: {},
  questions: { urgent: noul('Urgent?') },
  providerOptions: {
    responses: { temperature: 0 },
  },
});
```

Only the selected adapter's namespace is applied. The value must be a plain object. It is merged into the request body after the built-in fields, so an option can override a built-in field; use this escape hatch only when you own the provider contract.

## Custom base URLs

The default base URL is `https://openrouter.ai/api/v1`. The adapter appends `/responses`, `/chat/completions`, or `/messages` as appropriate. For direct providers, pass the provider's API root explicitly, for example:

```ts
createJevts({
  api: 'anthropic',
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: 'https://api.anthropic.com/v1',
});
```

Verify the selected provider's model names, authentication, and endpoint compatibility before using a direct base URL.
