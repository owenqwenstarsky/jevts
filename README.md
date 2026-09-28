# jevts

Typed, non-streaming Jev-like evaluations for Node.js 20+. The client sends a machine-decision harness to OpenRouter by default and supports OpenAI Responses, OpenAI Chat Completions, and Anthropic Messages transports.

```ts
import { choice, createJevts, noul, score } from 'jevts';

const client = createJevts({ apiKey: process.env.OPENROUTER_API_KEY });
const result = await client.systemOne({
  model: 'openai/gpt-5',
  state: { message: 'I was charged twice.' },
  questions: {
    department: choice('Which team should handle this?', {
      billing: 'Payments and refunds', technical: 'Bugs and integrations',
    }),
    frustration: score('How frustrated is the customer?', ['Calm', 'Frustrated', 'Very angry']),
    urgent: noul('Does this convey urgency?'),
  },
});
```

`result.answers.department.choice` is inferred as `"billing" | "technical"`. Model output is validated strictly; malformed output raises a typed `JevtsError`.

## Documentation

See the [full documentation](docs/README.md) for installation, configuration, question and answer types, provider behavior, validation, retries, errors, model listing, and testing.
