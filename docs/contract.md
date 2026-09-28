# Evaluation contract

The client turns ordinary model calls into a strict machine-decision request. The core prompt is exported as `HARNESS_PROMPT`, its version is exported as `HARNESS_VERSION`, and `buildHarnessPrompt()` appends serialized question definitions and optional caller instructions.

## Table of contents

- [Machine role](#machine-role)
- [Input contract](#input-contract)
- [Output contract](#output-contract)
- [Question semantics](#question-semantics)
- [Strictness rules](#strictness-rules)
- [Caller instructions](#caller-instructions)
- [Prompt versioning](#prompt-versioning)

## Machine role

The harness tells the model it is a machine decision engine, not an assistant or conversational agent. It requires one JSON object with no markdown, explanation, greeting, or extra keys.

This role is deliberately explicit: the result is intended for application code, not for display as a chat response.

## Input contract

The user payload contains `state`, the selected `model`, and named `questions`. Each question definition contains an ID, a type, a prompt under `instructions`, and type-specific criteria:

```json
{
  "state": { "message": "I was charged twice." },
  "model": "openai/gpt-5",
  "questions": {
    "department": {
      "type": "choice",
      "instructions": "Which team should handle this?",
      "criteria": {
        "billing": "Payments and refunds",
        "technical": "Bugs and integrations"
      }
    }
  }
}
```

Question IDs and choice keys are application-owned identifiers. They must be returned exactly as requested.

## Output contract

The normal response is an object with `answers` and `usage`:

```json
{
  "answers": {
    "urgent": { "type": "noul", "noul": 0.5 }
  },
  "usage": {
    "input_tokens": 120,
    "output_tokens": 42,
    "total_tokens": 162
  }
}
```

The adapters can also receive provider usage and add it to the parsed object when model text omits `usage`. The parser accepts the official snake_case names and the corresponding camelCase aliases when parsing direct values.

## Question semantics

### Noul

Return `noul` as a finite number from `0` through `1`.

### Choice

Return:

- `type: "choice"`;
- `choice`, one of the requested option keys;
- `probabilities`, containing every requested key exactly once;
- each probability in `0..1`, with the sum equal to `1` within `0.001`;
- `confidence` in `0..1`.

### Score

Return:

- `type: "score"`;
- `score` from `0` through the last legend index;
- `legend`, mapping string indexes (`"0"`, `"1"`, and so on) to the exact requested descriptions;
- `probabilities`, containing every legend index exactly once and summing to `1` within `0.001`;
- `confidence` in `0..1`.

The model supplies probabilities and confidence. `jevts` validates these values and returns them; it does not recalibrate or replace them locally.

## Strictness rules

The parser rejects:

- malformed JSON;
- a non-object response;
- missing or extra answer IDs;
- an answer whose `type` differs from its question;
- missing or extra fields in an answer object;
- unknown choice keys;
- incomplete, out-of-range, or non-summing probability maps;
- confidence outside `0..1`;
- score values outside the legend range;
- score legends that differ from the requested legend;
- missing, fractional, negative, or inconsistent token counts.

There is no automatic repair or silent removal of fields. Parse and validation failures are surfaced as typed errors.

## Caller instructions

`systemOne({ instructions })` adds text after the core contract:

```ts
const prompt = buildHarnessPrompt(questions, 'Treat the message field as the customer statement.');
```

Caller instructions can add evaluation context, but the harness tells the model to preserve the required JSON shape and answer rules.

## Prompt versioning

`HARNESS_VERSION` is currently `jevts-1`. Pin or snapshot this value if prompt changes affect your evaluation data. The full built-in prompt is available as `HARNESS_PROMPT` for inspection and testing.
