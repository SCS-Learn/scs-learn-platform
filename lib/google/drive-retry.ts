const RETRYABLE_CODES = new Set([403, 429, 500, 503]);

/**
 * Retries a Drive API call up to twice (3 attempts total, with backoff) before
 * giving up - a 403/429 from Drive's per-user rate limit is transient, but
 * every caller here treats any thrown error the same as "this file is
 * unreadable" and permanently excludes it. Logs the real reason on final
 * failure instead of letting callers swallow it into a generic message.
 */
export async function withDriveRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const code = (error as { code?: number })?.code;
      if (!RETRYABLE_CODES.has(code ?? 0) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  console.warn(`Drive API call failed (${label}):`, lastError);
  throw lastError;
}
