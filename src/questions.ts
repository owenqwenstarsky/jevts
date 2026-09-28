export interface NoulQuestion { readonly type: 'noul'; readonly prompt: string; }
export interface ChoiceQuestion<Options extends Record<string, string> = Record<string, string>> {
  readonly type: 'choice'; readonly prompt: string; readonly options: Options;
}
export interface ScoreQuestion<Legend extends readonly string[] = readonly string[]> {
  readonly type: 'score'; readonly prompt: string; readonly legend: Legend;
}
export type Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;

export const noul = (prompt: string): NoulQuestion => {
  if (!prompt.trim()) throw new Error('A question prompt is required.');
  return { type: 'noul', prompt };
};
export const choice = <const Options extends Record<string, string>>(prompt: string, options: Options): ChoiceQuestion<Options> => {
  if (!prompt.trim()) throw new Error('A question prompt is required.');
  if (Object.keys(options).length === 0) throw new Error('A choice question needs at least one option.');
  if (Object.keys(options).length > 255 || Object.keys(options).some(key => !key)) throw new Error('A choice question must have 1 to 255 non-empty option keys.');
  return { type: 'choice', prompt, options };
};
export const score = <const Legend extends readonly string[]>(prompt: string, legend: Legend): ScoreQuestion<Legend> => {
  if (!prompt.trim()) throw new Error('A question prompt is required.');
  if (legend.length < 2 || legend.length > 10) throw new Error('A score question needs 2 to 10 legend values.');
  return { type: 'score', prompt, legend };
};

export type ChoiceAnswer<Q extends ChoiceQuestion> = {
  type: 'choice'; choice: keyof Q['options'] & string; probabilities: Record<keyof Q['options'] & string, number>; confidence: number;
};
export type ScoreAnswer<Q extends ScoreQuestion> = {
  type: 'score'; score: number; probabilities: Record<string, number>; confidence: number; legend: Record<string, Q['legend'][number]>;
};
export type NoulAnswer = { type: 'noul'; noul: number };
export type Answer<Q extends Question> = Q extends ChoiceQuestion ? ChoiceAnswer<Q> : Q extends ScoreQuestion ? ScoreAnswer<Q> : NoulAnswer;
export type Answers<Q extends Record<string, Question>> = { [K in keyof Q]: Answer<Q[K]> };
