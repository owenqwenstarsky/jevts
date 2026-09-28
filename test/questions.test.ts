import { describe, expect, it } from 'vitest';
import { choice, noul, score } from '../src/index.js';
import type { Answer } from '../src/index.js';

describe('question definitions', () => {
  it('preserve literal answer types', () => {
    const q = choice('team', { billing: 'Bills', technical: 'Bugs' });
    const answer: Answer<typeof q> = { type: 'choice', choice: 'billing', probabilities: { billing: 1, technical: 0 }, confidence: 1 };
    expect(answer.choice).toBe('billing');
    expect(noul('urgent').type).toBe('noul');
    expect(score('mood', ['calm', 'angry'] as const).legend).toEqual(['calm', 'angry']);
  });
});
