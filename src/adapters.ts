import { ConfigurationError, HttpError, TransportError, UnsupportedReasoningEffortError } from './errors.js';
import { buildHarnessPrompt } from './prompt.js';
import type { Question } from './questions.js';

export type ApiKind = 'responses' | 'chat-completions' | 'anthropic';
export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export interface AdapterRequest { model: string; state: unknown; questions: Record<string, Question>; instructions?: string; reasoningEffort?: ReasoningEffort; providerOptions?: Record<string, unknown>; }
export interface AdapterResult { value: unknown; raw: unknown; }
export interface Transport { request(url: string, init: RequestInit, context?: { signal?: AbortSignal }): Promise<Response>; }
export interface AdapterContext { baseURL: string; apiKey?: string; fetch: typeof globalThis.fetch; timeoutMs: number; signal?: AbortSignal; transport?: Transport; }

const efforts: Record<ApiKind, readonly ReasoningEffort[]> = {
  responses: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  'chat-completions': ['none', 'low', 'medium', 'high'],
  anthropic: ['none', 'low', 'medium', 'high'],
};
export function assertReasoningEffort(api: ApiKind, effort?: ReasoningEffort): void {
  if (effort && !efforts[api].includes(effort)) throw new UnsupportedReasoningEffortError(effort, api);
}
const join = (base: string, path: string) => `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
const headers = (api: ApiKind, key?: string): Record<string, string> => {
  const h: Record<string, string> = { 'content-type': 'application/json' };
  if (key) h.authorization = `Bearer ${key}`;
  if (api === 'anthropic') { delete h.authorization; if (key) h['x-api-key'] = key; h['anthropic-version'] = '2023-06-01'; }
  return h;
};
function outputSchema(questions: Record<string, Question>) {
  const entries = Object.entries(questions).map(([id, q]) => {
    const common = { type: { type: 'string', enum: [q.type] } };
    if (q.type === 'noul') return [id, { type: 'object', additionalProperties: false, properties: { ...common, noul: { type: 'number', minimum: 0, maximum: 1 } }, required: ['type', 'noul'] }];
    if (q.type === 'choice') {
      const keys = Object.keys(q.options);
      return [id, { type: 'object', additionalProperties: false, properties: { ...common, choice: { type: 'string', enum: keys }, probabilities: { type: 'object', additionalProperties: false, properties: Object.fromEntries(keys.map(key => [key, { type: 'number', minimum: 0, maximum: 1 }])), required: keys }, confidence: { type: 'number', minimum: 0, maximum: 1 } }, required: ['type', 'choice', 'probabilities', 'confidence'] }];
    }
    const levels = q.legend.map((_, i) => String(i));
    return [id, { type: 'object', additionalProperties: false, properties: { ...common, score: { type: 'number', minimum: 0, maximum: q.legend.length - 1 }, legend: { type: 'object', additionalProperties: false, properties: Object.fromEntries(levels.map((key, i) => [key, { type: 'string', enum: [q.legend[i]] }])), required: levels }, probabilities: { type: 'object', additionalProperties: false, properties: Object.fromEntries(levels.map(key => [key, { type: 'number', minimum: 0, maximum: 1 }])), required: levels }, confidence: { type: 'number', minimum: 0, maximum: 1 } }, required: ['type', 'score', 'legend', 'probabilities', 'confidence'] }];
  });
  return { type: 'object', additionalProperties: false, properties: { answers: { type: 'object', additionalProperties: false, properties: Object.fromEntries(entries), required: Object.keys(questions) } }, required: ['answers'] };
}
function structuredOptions(api: ApiKind, questions: Record<string, Question>) {
  return api === 'responses' ? { text: { format: { type: 'json_schema', name: 'jevts_result', strict: true, schema: outputSchema(questions) } } } : { type: 'json_object' };
}

export async function requestAdapter(api: ApiKind, request: AdapterRequest, context: AdapterContext): Promise<AdapterResult> {
  assertReasoningEffort(api, request.reasoningEffort);
  const prompt = buildHarnessPrompt(request.questions, request.instructions);
  const officialQuestions = Object.fromEntries(Object.entries(request.questions).map(([id, q]) => [id, q.type === 'noul' ? { type: 'noul', instructions: q.prompt } : q.type === 'choice' ? { type: 'choice', instructions: q.prompt, criteria: q.options } : { type: 'score', instructions: q.prompt, criteria: q.legend }]));
  const options = request.providerOptions?.[api];
  if (options !== undefined && (!options || typeof options !== 'object' || Array.isArray(options))) throw new ConfigurationError(`providerOptions.${api} must be an object.`);
  let url: string; let body: Record<string, unknown>; let h = headers(api, context.apiKey);
  if (api === 'responses') {
    url = join(context.baseURL, 'responses');
    body = { model: request.model, input: [{ role: 'system', content: [{ type: 'input_text', text: prompt }] }, { role: 'user', content: [{ type: 'input_text', text: JSON.stringify({ state: request.state, model: request.model, questions: officialQuestions }) }] }], ...structuredOptions(api, request.questions) };
    if (request.reasoningEffort && request.reasoningEffort !== 'none') body.reasoning = { effort: request.reasoningEffort };
  } else if (api === 'chat-completions') {
    url = join(context.baseURL, 'chat/completions');
    body = { model: request.model, messages: [{ role: 'system', content: prompt }, { role: 'user', content: JSON.stringify({ state: request.state, model: request.model, questions: officialQuestions }) }], response_format: structuredOptions(api, request.questions) };
    if (request.reasoningEffort && request.reasoningEffort !== 'none') body.reasoning_effort = request.reasoningEffort;
  } else {
    url = join(context.baseURL, 'messages'); h = { ...h, 'content-type': 'application/json' };
    body = { model: request.model, max_tokens: 4096, system: prompt, messages: [{ role: 'user', content: JSON.stringify({ state: request.state, model: request.model, questions: officialQuestions }) }] };
    if (request.reasoningEffort && request.reasoningEffort !== 'none') { body.thinking = { type: 'adaptive' }; body.output_config = { effort: request.reasoningEffort }; }
  }
  body = { ...body, ...(options as Record<string, unknown> | undefined) };
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), context.timeoutMs);
  if (context.signal) context.signal.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const requestFn = context.transport?.request ?? ((u, init) => context.fetch(u, init));
    let response: Response;
    try {
      const requestContext = context.signal ? { signal: context.signal } : undefined;
      response = await requestFn(url, { method: 'POST', headers: h, body: JSON.stringify(body), signal: controller.signal }, requestContext);
    }
    catch (e) { if (context.signal?.aborted) throw e; throw new TransportError(controller.signal.aborted ? 'The provider request timed out.' : 'The provider request failed.', e); }
    const text = await response.text(); let payload: unknown;
    try { payload = text ? JSON.parse(text) : undefined; } catch { payload = text; }
    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter && payload && typeof payload === 'object') (payload as Record<string, unknown>).retryAfterMs = /^\d+(\.\d+)?$/.test(retryAfter) ? Number(retryAfter) * 1000 : undefined;
      throw new HttpError(response.status, `Provider returned HTTP ${response.status}.`, payload);
    }
    return { value: extractOutput(api, payload), raw: payload };
  } finally { clearTimeout(timeout); }
}

function extractOutput(api: ApiKind, payload: unknown): unknown {
  if (!payload || typeof payload !== 'object') throw new TransportError('Provider returned an empty response.');
  const p = payload as Record<string, unknown>;
  let text: unknown;
  let usage: unknown = p.usage;
  if (api === 'responses') {
    text = p.output_text;
    if (typeof text !== 'string' && Array.isArray(p.output)) {
      const block = (p.output as unknown[]).flatMap(x => x && typeof x === 'object' && Array.isArray((x as Record<string, unknown>).content) ? (x as Record<string, unknown>).content as unknown[] : []).find(x => x && typeof x === 'object' && typeof (x as Record<string, unknown>).text === 'string');
      text = block && typeof block === 'object' ? (block as Record<string, unknown>).text : undefined;
    }
  } else if (api === 'chat-completions') {
    const choice = Array.isArray(p.choices) ? p.choices[0] : undefined; const message = choice && typeof choice === 'object' ? (choice as Record<string, unknown>).message : undefined;
    text = message && typeof message === 'object' ? (message as Record<string, unknown>).content : undefined;
  } else {
    const block = Array.isArray(p.content) ? (p.content as unknown[]).find(x => x && typeof x === 'object' && (x as Record<string, unknown>).type === 'text') : undefined;
    text = block && typeof block === 'object' ? (block as Record<string, unknown>).text : undefined;
  }
  if (typeof text !== 'string') throw new TransportError('Provider response did not contain text output.');
  let parsed: unknown; try { parsed = JSON.parse(text); } catch { parsed = text; }
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const result = { ...(parsed as Record<string, unknown>) };
    if (!('usage' in result)) result.usage = normalizeUsage(usage);
    return result;
  }
  return parsed;
}
function normalizeUsage(value: unknown): { inputTokens: number; outputTokens: number; totalTokens: number } {
  const u = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const inputTokens = Number(u.inputTokens ?? u.input_tokens ?? u.inputTokensUsed ?? 0); const outputTokens = Number(u.outputTokens ?? u.output_tokens ?? 0); const totalTokens = Number(u.totalTokens ?? u.total_tokens ?? inputTokens + outputTokens);
  return { inputTokens, outputTokens, totalTokens };
}
