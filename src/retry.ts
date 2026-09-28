import { AbortedError, HttpError, TransportError } from './errors.js';

export interface RetryOptions { maxRetries: number; signal?: AbortSignal; sleep?: (ms: number) => Promise<void>; }
const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
export const isRetryableStatus = (status: number) => status === 408 || status === 409 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504 || status === 529;
export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const sleep = options.sleep ?? wait;
  for (let attempt = 0; ; attempt++) {
    if (options.signal?.aborted) throw new AbortedError();
    try { return await operation(); }
    catch (error) {
      const retryable = error instanceof TransportError || (error instanceof HttpError && isRetryableStatus(error.status));
      if (!retryable || attempt >= options.maxRetries) throw error;
      const retryAfter = error instanceof HttpError && error.body && typeof error.body === 'object' && 'retryAfterMs' in error.body && typeof error.body.retryAfterMs === 'number' ? error.body.retryAfterMs : undefined;
      const delay = retryAfter ?? Math.min(30_000, 250 * 2 ** attempt);
      await sleep(delay);
    }
  }
}
