import { describe, expect, it, vi } from 'vitest';
import { choice, createJevts, HttpError, UnsupportedReasoningEffortError } from '../src/index.js';

const output = JSON.stringify({ answers: { team: { type: 'choice', choice: 'billing', probabilities: { billing: 1 }, confidence: 1 } }, usage: { input_tokens: 1, output_tokens: 1 } });
function response(body: unknown, status = 200) { return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }); }

describe('adapters', () => {
  it.each(['responses', 'chat-completions', 'anthropic'] as const)('builds %s request without app headers', async api => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => { expect(init?.headers).not.toHaveProperty('HTTP-Referer'); return response(api === 'responses' ? { output_text: output, usage: { input_tokens: 1, output_tokens: 1 } } : api === 'chat-completions' ? { choices: [{ message: { content: output } }] } : { content: [{ type: 'text', text: output }] }); });
    const c = createJevts({ api, apiKey: 'key', fetch, maxRetries: 0 });
    const result = await c.systemOne({ model: 'm', state: {}, questions: { team: choice('team', { billing: 'Bills' }) } });
    expect(result.answers.team.choice).toBe('billing'); expect(fetch).toHaveBeenCalledOnce();
  });
  it('maps reasoning effort and rejects unsupported combinations', async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => { const body = JSON.parse(String(init?.body)); expect(body.reasoning_effort).toBe('high'); return response({ choices: [{ message: { content: output } }] }); });
    await createJevts({ api: 'chat-completions', fetch, maxRetries: 0 }).systemOne({ model: 'm', state: {}, reasoningEffort: 'high', questions: { team: choice('team', { billing: 'Bills' }) } });
    await expect(createJevts({ api: 'chat-completions', fetch, maxRetries: 0 }).systemOne({ model: 'm', state: {}, reasoningEffort: 'xhigh', questions: { team: choice('team', { billing: 'Bills' }) } })).rejects.toBeInstanceOf(UnsupportedReasoningEffortError);
  });
  it('retries rate limits with bounded backoff', async () => {
    let calls = 0; const fetch = vi.fn(async () => ++calls < 3 ? response({ error: 'busy' }, 429) : response({ choices: [{ message: { content: output } }] }));
    const result = await createJevts({ api: 'chat-completions', fetch, maxRetries: 2 }).systemOne({ model: 'm', state: {}, questions: { team: choice('team', { billing: 'Bills' }) } });
    expect(result.answers.team.choice).toBe('billing'); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('requires a model', async () => { await expect(createJevts({ fetch: vi.fn() }).systemOne({ model: '', state: {}, questions: { team: choice('team', { billing: 'Bills' }) } })).rejects.toThrow(); });
  it('normalizes the official model-list response', async () => {
    const fetch = vi.fn(async () => response({ models: [{ name: 'jev-latest', description: 'latest', release_date: '2026-01-01' }] }));
    await expect(createJevts({ fetch, maxRetries: 0 }).models.list()).resolves.toMatchObject({ models: [{ name: 'jev-latest' }] });
  });
});
