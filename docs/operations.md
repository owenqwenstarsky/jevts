# Operations

This page covers runtime behavior around requests, failures, tests, and deployment.

## Table of contents

- [Validation and errors](#validation-and-errors)
- [Retries, timeouts, and cancellation](#retries-timeouts-and-cancellation)
- [Testing and custom transports](#testing-and-custom-transports)
- [Security and deployment](#security-and-deployment)
- [Troubleshooting](#troubleshooting)
- [Current limits](#current-limits)

## Validation and errors

All library errors extend `JevtsError`, which has a stable `code`, a message, and an optional `cause`.

| Class | `code` | When it is raised |
| --- | --- | --- |
| `ConfigurationError` | `configuration_error` | Invalid client settings, missing model, missing state, empty questions, or invalid provider options |
| `UnsupportedReasoningEffortError` | `unsupported_reasoning_effort` | The selected adapter does not accept the requested effort |
| `TransportError` | `transport_error` | Fetch/transport failures, timeouts, empty provider output, or invalid model-list payloads |
| `HttpError` | `http_error` | A provider responds with a non-2xx status; includes `status` and `body` |
| `ParseError` | `parse_error` | Provider text is malformed JSON |
| `ValidationError` | `validation_error` | Parsed answers or usage violate the evaluation contract |
| `AbortedError` | `aborted` | The caller signal is aborted or a request is cancelled |

Catch by class or by `error.code`:

```ts
try {
  await client.systemOne(input);
} catch (error) {
  if (error instanceof HttpError && error.status === 429) {
    // The built-in retry policy is exhausted.
  }
}
```

Validation errors are not retried by default. This makes malformed model output visible instead of hiding it behind another request.

## Retries, timeouts, and cancellation

The default is two retries after the initial attempt. Retries apply to transport failures and these statuses:

`408`, `409`, `425`, `429`, `500`, `502`, `503`, `504`, and `529`.

The delay is bounded exponential backoff: `250ms × 2^attempt`, capped at 30 seconds. A numeric `Retry-After` response value is used when available. Set `maxRetries: 0` to disable retries.

Each attempt has its own `timeoutMs` timer. Pass an `AbortSignal` in `systemOne()` or `models.list()` to cancel work. Aborts reject with `AbortedError`; an abort does not start another retry.

## Testing and custom transports

### Custom fetch

```ts
const client = createJevts({
  apiKey: 'test-key',
  maxRetries: 0,
  fetch: async (url, init) => {
    console.log(url, init?.body);
    return new Response(JSON.stringify({
      output_text: JSON.stringify({
        answers: { urgent: { type: 'noul', noul: 0.5 } },
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    }), { headers: { 'content-type': 'application/json' } });
  },
});
```

### Custom transport

`transport.request(url, init, context?)` can replace fetch. The optional context carries the caller signal. This is useful for recording request snapshots, injecting a test server, or integrating an existing HTTP client while retaining the adapter and parser.

The repository's checks are:

```sh
npm run lint   # TypeScript checking
npm test       # Vitest tests
npm run build  # ESM, CommonJS, and declarations
npm run check  # all three
```

## Security and deployment

- Keep `apiKey` and provider environment variables on the server.
- Do not put a secret key into browser-bundled code.
- Use `baseURL` explicitly when routing through a controlled gateway.
- Treat `state`, `raw`, and provider error bodies as potentially sensitive application data.
- Set a finite timeout and a retry limit appropriate for the request volume and provider budget.

## Troubleshooting

### `ConfigurationError: model is required`

Pass `model` on every `systemOne()` call. The client intentionally has no default model.

### `ConfigurationError: A fetch implementation or transport is required`

Use Node.js 20+, pass a `fetch` implementation, or provide a `transport` object.

### `UnsupportedReasoningEffortError`

Use `none`, `low`, `medium`, or `high` with Chat Completions or Anthropic. `minimal` and `xhigh` are supported only by the Responses adapter.

### `ValidationError`

Inspect the provider's raw output and the question definitions. Check that every answer ID is present exactly once, every distribution is complete and sums to 1, every score legend matches, and usage counts are non-negative integers.

### `HttpError`

Inspect `status` and `body`. Retryable statuses are retried automatically until `maxRetries` is reached; authentication and other non-retryable 4xx responses are surfaced immediately.

### Model list does not work with a direct provider

Confirm that `{baseURL}/models` exists for the selected gateway and returns either `{ models: [...] }` or `{ data: [...] }`, with each entry containing `name` or `id`.

## Current limits

- Requests are non-streaming to preserve Jev's atomic request/response contract.
- The package does not repair malformed model output.
- Probability and confidence values are validated, not recalibrated.
- Provider-specific features should be passed through `providerOptions` until they become part of the common API.
