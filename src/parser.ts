import { ParseError, ValidationError } from './errors.js';
import type { Answer, Answers, Question } from './questions.js';

export interface Usage { input_tokens: number; output_tokens: number; total_tokens?: number; }
export interface SystemOneResponse<Q extends Record<string, Question>> { model?: string; answers: Answers<Q>; usage: Usage; raw?: unknown; }

const object = (v: unknown, path: string): Record<string, unknown> => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ValidationError(`${path} must be an object.`);
  return v as Record<string, unknown>;
};
const number = (v: unknown, path: string, min = -Infinity, max = Infinity): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new ValidationError(`${path} must be a finite number in [${min}, ${max}].`);
  return v;
};
const probabilities = (v: unknown, expected: string[], path: string): Record<string, number> => {
  const p = object(v, path); const keys = Object.keys(p);
  if (keys.length !== expected.length || keys.some(k => !expected.includes(k))) throw new ValidationError(`${path} must contain exactly: ${expected.join(', ')}.`);
  let total = 0; const out: Record<string, number> = {};
  for (const k of expected) { out[k] = number(p[k], `${path}.${k}`, 0, 1); total += out[k]!; }
  if (Math.abs(total - 1) > 0.001) throw new ValidationError(`${path} must sum to 1.`);
  return out;
};
const exactKeys = (value: Record<string, unknown>, expected: string[], path: string) => {
  const actual = Object.keys(value).sort(); const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, i) => key !== wanted[i])) throw new ValidationError(`${path} contains unexpected or missing fields.`);
};
const parseJson = (text: string): unknown => {
  try { return JSON.parse(text); } catch (e) { throw new ParseError('The provider returned malformed JSON.', e); }
};

export function parseProviderOutput<Q extends Record<string, Question>>(value: unknown, questions: Q, raw?: unknown): SystemOneResponse<Q> {
  const root = typeof value === 'string' ? object(parseJson(value), 'response') : object(value, 'response');
  const answers = object(root.answers ?? root, 'answers');
  const ids = Object.keys(questions); const actual = Object.keys(answers);
  if (actual.length !== ids.length || actual.some(id => !ids.includes(id))) throw new ValidationError('Answers must contain exactly the requested question ids.');
  const parsed: Record<string, Answer<Question>> = {};
  for (const id of ids) {
    const q = questions[id]!; const a = object(answers[id], `answers.${id}`);
    if (a.type !== q.type) throw new ValidationError(`answers.${id}.type must be ${q.type}.`);
    if (q.type === 'noul') { exactKeys(a, ['type', 'noul'], `answers.${id}`); parsed[id] = { type: 'noul', noul: number(a.noul, `answers.${id}.noul`, 0, 1) }; }
    else if (q.type === 'choice') {
      exactKeys(a, ['type', 'choice', 'probabilities', 'confidence'], `answers.${id}`);
      const confidence = number(a.confidence, `answers.${id}.confidence`, 0, 1);
      const keys = Object.keys(q.options); if (typeof a.choice !== 'string' || !keys.includes(a.choice)) throw new ValidationError(`answers.${id}.choice is not a valid option.`);
      parsed[id] = { type: 'choice', choice: a.choice, probabilities: probabilities(a.probabilities, keys, `answers.${id}.probabilities`), confidence } as Answer<Question>;
    } else {
      exactKeys(a, ['type', 'score', 'legend', 'probabilities', 'confidence'], `answers.${id}`);
      const confidence = number(a.confidence, `answers.${id}.confidence`, 0, 1);
      const levels = q.legend.map((_, i) => String(i)); const probs = probabilities(a.probabilities, levels, `answers.${id}.probabilities`);
      const expectedLegend = Object.fromEntries(q.legend.map((value, i) => [String(i), value]));
      if (!a.legend || JSON.stringify(a.legend) !== JSON.stringify(expectedLegend)) throw new ValidationError(`answers.${id}.legend must match the question legend.`);
      parsed[id] = { type: 'score', score: number(a.score, `answers.${id}.score`, 0, q.legend.length - 1), probabilities: probs, confidence, legend: expectedLegend } as Answer<Question>;
    }
  }
  const u = object(root.usage, 'usage');
  const inputTokens = number(u.input_tokens ?? u.inputTokens, 'usage.input_tokens', 0); const outputTokens = number(u.output_tokens ?? u.outputTokens, 'usage.output_tokens', 0); const totalTokens = number(u.total_tokens ?? u.totalTokens ?? inputTokens + outputTokens, 'usage.total_tokens', 0);
  if (![inputTokens, outputTokens, totalTokens].every(Number.isInteger) || totalTokens < inputTokens + outputTokens) throw new ValidationError('usage token counts must be non-negative integers and total_tokens must cover input and output.');
  return { ...(typeof root.model === 'string' ? { model: root.model } : {}), answers: parsed as Answers<Q>, usage: { input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens }, raw };
}
