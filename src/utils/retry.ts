export type RetryOptions = {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  shouldRetry?: (err: unknown) => boolean;
};

function jitteredDelay(base: number, attempt: number, max: number): number {
  const exponential = base * Math.pow(2, attempt);
  const capped = Math.min(exponential, max);
  return capped * (0.5 + Math.random() * 0.5);
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  opts: RetryOptions
): Promise<T> {
  const { attempts, baseDelayMs, maxDelayMs, shouldRetry } = opts;

  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (shouldRetry && !shouldRetry(err)) throw err;
      if (attempt < attempts - 1) {
        const delay = jitteredDelay(baseDelayMs, attempt, maxDelayMs);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
