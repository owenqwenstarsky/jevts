import { describe, expect, it } from 'vitest';
import { choice, noul, parseProviderOutput, score, ValidationError } from '../src/index.js';

const questions = { team: choice('team', { billing: 'Bills', technical: 'Bugs' }), mood: score('mood', ['calm', 'angry'] as const), urgent: noul('urgent') };
const valid = { answers: { team: { type: 'choice', choice: 'billing', probabilities: { billing: 0.8, technical: 0.2 }, confidence: 0.9 }, mood: { type: 'score', score: 0.2, legend: { '0': 'calm', '1': 'angry' }, probabilities: { '0': 0.7, '1': 0.3 }, confidence: 0.8 }, urgent: { type: 'noul', noul: 0.5 } }, usage: { input_tokens: 3, output_tokens: 4 } };

describe('strict output parser', () => {
  it('accepts valid output and snake case usage', () => expect(parseProviderOutput(valid, questions).usage.total_tokens).toBe(7));
  it.each([
    ['missing id', { ...valid, answers: { ...valid.answers, urgent: undefined } }],
    ['extra id', { ...valid, answers: { ...valid.answers, other: valid.answers.urgent } }],
    ['bad probabilities', { ...valid, answers: { ...valid.answers, team: { ...valid.answers.team, probabilities: { billing: 0.5, technical: 0.2 } } } }],
    ['bad confidence', { ...valid, answers: { ...valid.answers, mood: { ...valid.answers.mood, confidence: 2 } } }],
    ['bad legend', { ...valid, answers: { ...valid.answers, mood: { ...valid.answers.mood, legend: { '0': 'wrong', '1': 'angry' } } } }],
  ])('rejects %s', (_, value) => expect(() => parseProviderOutput(value, questions)).toThrow(ValidationError));
  it('rejects malformed JSON', () => expect(() => parseProviderOutput('{oops', questions)).toThrow());
});
