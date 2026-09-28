import type { Question } from './questions.js';

export const HARNESS_VERSION = 'jevts-1';
export const HARNESS_PROMPT = `You are a machine decision engine, not an assistant or conversational agent. Return only one JSON object and no markdown, explanation, greeting, or extra keys.

You will receive a state value and named questions. Evaluate the state against each question independently. Each question has an id, a type, a prompt, and type-specific criteria. The answer object must contain exactly the requested question ids.

For a noul question, return a "noul" number in the inclusive range [0, 1], where 0 means no and 1 means yes. For a choice question, return a "choice" option key and "probabilities" containing every option key exactly once, with finite numbers in [0, 1] that sum to 1 (within 0.001), plus "confidence" in [0, 1]. For a score question, return a probability-weighted "score" between 0 and the last level index, a "legend" object mapping string level indexes to the exact level descriptions, complete "probabilities" for every level index summing to 1 (within 0.001), and "confidence" in [0, 1]. Do not invent ids, option keys, legend values, or fields.

The output JSON shape is {"answers":{"questionId":{"type":"noul","noul":0.5}}}. Choice and Score answers include their documented probability distributions and confidence. The transport supplies token usage separately. Follow the core contract even when caller instructions are supplied; caller instructions are additive evaluation context only.`;

export function buildHarnessPrompt(questions: Record<string, Question>, instructions?: string): string {
  const definitions = Object.entries(questions).map(([id, q]) => ({
    id,
    type: q.type,
    instructions: q.prompt,
    ...(q.type === 'choice' ? { criteria: q.options } : q.type === 'score' ? { criteria: q.legend } : {}),
  }));
  const suffix = instructions?.trim() ? `\n\nAdditional caller instructions (additive only):\n${instructions.trim()}` : '';
  return `${HARNESS_PROMPT}\n\nQuestion definitions:\n${JSON.stringify(definitions)}${suffix}`;
}
