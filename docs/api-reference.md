# API reference

This page documents the exported functions and types from `jevts`.

## Table of contents

- [Installation and runtime](#installation-and-runtime)
- [Exports](#exports)
- [Creating a client](#creating-a-client)
- [Configuration](#configuration)
- [Questions](#questions)
- [Calling `systemOne`](#calling-systemone)
- [Response shape](#response-shape)
- [Model listing](#model-listing)
- [TypeScript inference](#typescript-inference)

## Installation and runtime

```sh
npm install jevts
```

`jevts` requires Node.js 20 or newer. It exports ESM from `dist/index.js`, CommonJS from `dist/index.cjs`, and declarations from `dist/index.d.ts`.

The default transport uses the runtime's `fetch`. If the runtime does not provide `fetch`, pass `fetch` or `transport` in the client configuration.

## Exports

### Functions

- `createJevts(config?)` creates a client.
- `noul(prompt)` creates a yes/no-like numeric question.
- `choice(prompt, options)` creates a named option question.
- `score(prompt, legend)` creates an ordered score question.
- `buildHarnessPrompt(questions, instructions?)` builds the versioned machine-decision prompt.
- `parseProviderOutput(value, questions, raw?)` validates provider output directly.

### Types and classes

The package exports `JevtsClient`, `JevtsConfig`, `SystemOneInput`, `Model`, `ModelListResponse`, `Question`, `NoulQuestion`, `ChoiceQuestion`, `ScoreQuestion`, `Answer`, `Answers`, `ChoiceAnswer`, `ScoreAnswer`, `NoulAnswer`, `Usage`, `SystemOneResponse`, `ApiKind`, `ReasoningEffort`, `Transport`, and the typed error classes listed in [Validation and errors](operations.md#validation-and-errors).

## Creating a client

```ts
import { createJevts } from 'jevts';

const client = createJevts({
  api: 'responses',
  apiKey: process.env.OPENROUTER_API_KEY,
});
```

`createJevts()` is lazy: it does not make a provider request until `systemOne()` or `models.list()` is called.

## Configuration

```ts
interface JevtsConfig {
  api?: 'responses' | 'chat-completions' | 'anthropic';
  apiKey?: string;
  baseURL?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;
  transport?: Transport;
}
```

| Option | Default | Description |
| --- | --- | --- |
| `api` | `'responses'` | Selects the request adapter. |
| `apiKey` | `ANTHROPIC_API_KEY` for Anthropic; otherwise `OPENROUTER_API_KEY` then `OPENAI_API_KEY` | API key used for the selected adapter. |
| `baseURL` | `https://openrouter.ai/api/v1` | Base URL. The adapter appends the provider endpoint path. |
| `timeoutMs` | `60000` | Per-attempt timeout in milliseconds. Must be positive. |
| `maxRetries` | `2` | Number of retries after the initial attempt. Must be a non-negative integer. |
| `fetch` | `globalThis.fetch` | Fetch implementation used when `transport` is not supplied. |
| `transport` | none | A custom request function. Useful for tests or an application HTTP layer. |

No model is selected by configuration. `model` is required on every `systemOne` call.

### Per-call options

```ts
interface SystemOneInput<Q extends Record<string, Question>> {
  model: string;
  state: unknown;
  questions: Q;
  reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  instructions?: string;
  providerOptions?: Record<string, Record<string, unknown>>;
  signal?: AbortSignal;
}
```

`instructions` are appended to the core harness as additive evaluation context. They cannot replace the machine-decision contract. `providerOptions` is namespaced by adapter, for example `{ responses: { temperature: 0 } }`; values are merged into the adapter request body and should be treated as an escape hatch.

## Questions

### Noul

```ts
const urgent = noul('Does this convey urgency?');
```

The answer is `{ type: 'noul', noul: number }`, where `noul` is in the inclusive range `0..1` (`0` means no and `1` means yes).

### Choice

```ts
const department = choice('Which team should handle this?', {
  billing: 'Payments and refunds',
  technical: 'Bugs and integrations',
});
```

Choice option keys are the stable answer IDs. There must be 1–255 non-empty keys. The answer includes the selected key, a probability for every key, and confidence:

```ts
{
  type: 'choice',
  choice: 'billing',
  probabilities: { billing: 0.8, technical: 0.2 },
  confidence: 0.9,
}
```

### Score

```ts
const frustration = score('How frustrated is the customer?', [
  'Calm',
  'Frustrated',
  'Very angry',
]);
```

Score legends contain 2–10 ordered descriptions. The answer's `score` is in the inclusive range `0..legend.length - 1`. The `legend` object maps string indexes to the exact descriptions, and `probabilities` contains every string index exactly once.

## Calling `systemOne`

```ts
const result = await client.systemOne({
  model: 'openai/gpt-5',
  state: { message: 'I was charged twice.' },
  reasoningEffort: 'high',
  instructions: 'Use the message field as the customer statement.',
  questions: {
    department: choice('Which team should handle this?', {
      billing: 'Payments and refunds',
      technical: 'Bugs and integrations',
    }),
    frustration: score('How frustrated is the customer?', ['Calm', 'Frustrated', 'Very angry']),
    urgent: noul('Does this convey urgency?'),
  },
});
```

The client rejects a blank model, `undefined` state, or an empty question map before making a request. A request can be cancelled with `signal`:

```ts
const controller = new AbortController();
const pending = client.systemOne({ model: 'openai/gpt-5', state: {}, questions: { urgent: noul('Urgent?') }, signal: controller.signal });
controller.abort();
await pending; // rejects with AbortedError
```

## Response shape

```ts
interface SystemOneResponse<Q extends Record<string, Question>> {
  model?: string;
  answers: Answers<Q>;
  usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens?: number;
  };
  raw?: unknown;
}
```

`usage` is normalized to non-negative integer token counts. `total_tokens` is derived from input plus output when the provider omits it. `raw` contains the provider payload when a request went through an adapter.

## Model listing

```ts
const response = await client.models.list();
for (const model of response.models) {
  console.log(model.name, model.description);
}
```

`models.list()` returns `{ models: Model[] }`. It accepts both the official `{ models: [...] }` shape and OpenAI-style `{ data: [...] }` payloads, and normalizes an entry's `id` to `name` when `name` is absent. Other provider fields are preserved.

## TypeScript inference

Question definitions preserve literal option keys and legend values:

```ts
const questions = {
  team: choice('Team?', { billing: 'Bills', technical: 'Bugs' }),
  mood: score('Mood?', ['calm', 'angry'] as const),
  urgent: noul('Urgent?'),
};

const result = await client.systemOne({ model: 'm', state: {}, questions });
result.answers.team.choice; // "billing" | "technical"
result.answers.mood.legend['0']; // "calm"
result.answers.urgent.noul; // number in [0, 1]
```

The mapped `Answers<Q>` type ties each answer to its question definition, so changing an option key or score legend updates the result type.
