# jevts documentation

`jevts` is a TypeScript client for machine-oriented evaluations. You define named questions, send a state value to a selected model, and receive typed answers with the model's probabilities, confidence, and token usage.

The client is non-streaming and server-side. It uses OpenRouter by default, while supporting OpenAI Responses, OpenAI Chat Completions, and Anthropic Messages request formats.

## Table of contents

- [At a glance](#at-a-glance)
- [Documentation map](#documentation-map)
- [Quick start](#quick-start)
- [Supported runtime](#supported-runtime)
- [Public API](api-reference.md)
- [Questions and typed answers](api-reference.md#questions)
- [Configuration](api-reference.md#configuration)
- [Provider adapters](providers.md)
- [Harness prompt and evaluation contract](contract.md)
- [Validation and errors](operations.md#validation-and-errors)
- [Retries, timeouts, and cancellation](operations.md#retries-timeouts-and-cancellation)
- [Model listing](api-reference.md#model-listing)
- [Testing and custom transports](operations.md#testing-and-custom-transports)
- [Troubleshooting](operations.md#troubleshooting)

## At a glance

```ts
import { choice, createJevts, noul, score } from 'jevts';

const client = createJevts({
  apiKey: process.env.OPENROUTER_API_KEY,
});

const result = await client.systemOne({
  model: 'openai/gpt-5',
  state: { message: 'I was charged twice.' },
  questions: {
    department: choice('Which team should handle this?', {
      billing: 'Payments and refunds',
      technical: 'Bugs and integrations',
    }),
    frustration: score('How frustrated is the customer?', [
      'Calm',
      'Frustrated',
      'Very angry',
    ]),
    urgent: noul('Does this convey urgency?'),
  },
});

result.answers.department.choice; // "billing" | "technical"
result.answers.frustration.score; // number from 0 through 2
result.answers.urgent.noul; // number from 0 through 1
```

Every `systemOne` call must provide a model, state, and at least one question. The response is parsed strictly. Invalid JSON, missing or extra question IDs, malformed distributions, invalid ranges, and invalid usage counts raise typed errors.

## Documentation map

| Page | Covers |
| --- | --- |
| [API reference](api-reference.md) | Installation, client creation, configuration, question builders, answers, `systemOne`, model listing, and TypeScript types |
| [Provider adapters](providers.md) | URLs, headers, request bodies, structured output, reasoning effort mapping, and provider options |
| [Evaluation contract](contract.md) | The built-in harness prompt, input and output JSON, answer semantics, and strictness rules |
| [Operations](operations.md) | Retries, timeouts, cancellation, errors, testing, security, troubleshooting, and current limits |

## Quick start

```sh
npm install jevts
```

The package publishes ESM, CommonJS, and TypeScript declarations. See [Installation and runtime](api-reference.md#installation-and-runtime) for package setup and environment variables, then read [Calling `systemOne`](api-reference.md#calling-systemone) for a complete request and response.

## Supported runtime

- Node.js 20 or newer.
- ESM and CommonJS consumers.
- A server-side runtime with `fetch`, unless a custom `fetch` or `transport` is supplied.

API keys should stay on the server. This package does not provide a browser key-protection layer.
