import { AbortedError, ConfigurationError, HttpError, TransportError } from './errors.js';
import { requestAdapter, type AdapterRequest, type ApiKind, type ReasoningEffort, type Transport } from './adapters.js';
import { parseProviderOutput, type SystemOneResponse } from './parser.js';
import type { Question } from './questions.js';
import { withRetry } from './retry.js';

export interface JevtsConfig {
  api?: ApiKind;
  apiKey?: string;
  baseURL?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof globalThis.fetch;
  transport?: Transport;
}
export interface SystemOneInput<Q extends Record<string, Question>> {
  model: string;
  state: unknown;
  questions: Q;
  reasoningEffort?: ReasoningEffort;
  instructions?: string;
  providerOptions?: Record<string, Record<string, unknown>>;
  signal?: AbortSignal;
}
export interface Model {
  name: string;
  description?: string;
  release_date?: string;
  id?: string;
  [key: string]: unknown;
}
export interface ModelListResponse { models: Model[]; [key: string]: unknown; }
export interface JevtsClient {
  systemOne<Q extends Record<string, Question>>(input: SystemOneInput<Q>): Promise<SystemOneResponse<Q>>;
  models: { list(options?: { signal?: AbortSignal }): Promise<ModelListResponse> };
}

const defaultBase = 'https://openrouter.ai/api/v1';
const env = (name: string) => typeof process !== 'undefined' ? process.env[name] : undefined;
export function createJevts(config: JevtsConfig = {}): JevtsClient {
  const api = config.api ?? 'responses';
  const apiKey = config.apiKey ?? (api === 'anthropic' ? env('ANTHROPIC_API_KEY') : env('OPENROUTER_API_KEY') ?? env('OPENAI_API_KEY'));
  const baseURL = config.baseURL ?? defaultBase;
  const timeoutMs = config.timeoutMs ?? 60_000;
  const maxRetries = config.maxRetries ?? 2;
  const fetchImpl = config.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function' && !config.transport) throw new ConfigurationError('A fetch implementation or transport is required.');
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new ConfigurationError('timeoutMs must be positive.');
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new ConfigurationError('maxRetries must be a non-negative integer.');
  const call = async <Q extends Record<string, Question>>(input: SystemOneInput<Q>) => {
    if (!input.model?.trim()) throw new ConfigurationError('model is required for systemOne.');
    if (input.state === undefined) throw new ConfigurationError('state is required for systemOne.');
    if (!input.questions || Object.keys(input.questions).length === 0) throw new ConfigurationError('At least one question is required.');
    const request: AdapterRequest = { model: input.model, state: input.state, questions: input.questions, ...(input.instructions === undefined ? {} : { instructions: input.instructions }), ...(input.reasoningEffort === undefined ? {} : { reasoningEffort: input.reasoningEffort }), ...(input.providerOptions === undefined ? {} : { providerOptions: input.providerOptions }) };
    try {
      const context = { baseURL, fetch: fetchImpl, timeoutMs, ...(apiKey === undefined ? {} : { apiKey }), ...(input.signal === undefined ? {} : { signal: input.signal }), ...(config.transport === undefined ? {} : { transport: config.transport }) };
      const retryOptions = { maxRetries, ...(input.signal === undefined ? {} : { signal: input.signal }) };
      const result = await withRetry(() => requestAdapter(api, request, context), retryOptions);
      const parsed = parseProviderOutput(result.value, input.questions, result.raw);
      return parsed.model ? parsed : { ...parsed, model: input.model };
    } catch (e) {
      if (input.signal?.aborted || (e instanceof Error && e.name === 'AbortError')) throw new AbortedError();
      throw e;
    }
  };
  const list = async (options: { signal?: AbortSignal } = {}): Promise<ModelListResponse> => {
    const doList = async (): Promise<ModelListResponse> => {
      const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), timeoutMs);
      if (options.signal) options.signal.addEventListener('abort', () => controller.abort(), { once: true });
      try {
      const requestFn = config.transport?.request ?? ((u: string, init: RequestInit) => fetchImpl(u, init));
      let response: Response;
      try { response = await requestFn(`${baseURL.replace(/\/$/, '')}/models`, { method: 'GET', headers: { accept: 'application/json', ...(api === 'anthropic' ? { 'x-api-key': apiKey ?? '', 'anthropic-version': '2023-06-01' } : apiKey ? { authorization: `Bearer ${apiKey}` } : {}) }, signal: controller.signal }, options.signal ? { signal: options.signal } : undefined); }
      catch (e) { throw new TransportError('The model list request failed.', e); }
      const text = await response.text(); let payload: unknown; try { payload = text ? JSON.parse(text) : undefined; } catch { payload = undefined; }
      if (!response.ok) throw new HttpError(response.status, `Provider returned HTTP ${response.status}.`, payload);
      if (!payload || typeof payload !== 'object') throw new TransportError('Provider returned an invalid model list.');
      const p = payload as Record<string, unknown>; const models = Array.isArray(p.models) ? p.models : Array.isArray(p.data) ? p.data : undefined;
      if (!models) throw new TransportError('Provider returned an invalid model list.');
      const normalized = models.map((model: unknown) => {
        if (!model || typeof model !== 'object') throw new TransportError('Provider returned an invalid model entry.');
        const entry = model as Record<string, unknown>;
        const name = typeof entry.name === 'string' ? entry.name : entry.id;
        if (typeof name !== 'string' || !name) throw new TransportError('Provider returned a model without a name or id.');
        return { ...entry, name } as Model;
      });
      return { ...p, models: normalized };
      } finally { clearTimeout(timeout); }
    };
    try {
      return await withRetry(doList, { maxRetries, ...(options.signal === undefined ? {} : { signal: options.signal }) });
    } catch (e) {
      if (options.signal?.aborted || (e instanceof Error && e.name === 'AbortError')) throw new AbortedError();
      throw e;
    }
  };
  return { systemOne: call, models: { list } };
}
