import axios from 'axios';

// Retry a call on transient Gemini failures (429 rate-limit, 503 overloaded)
// with exponential backoff + jitter. Other errors propagate immediately.
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 6,
  baseDelay = 3000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status !== 429 && status !== 503) throw err;
      if (attempt === retries) break;
      const wait = baseDelay * 2 ** attempt + Math.random() * 500;
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  throw lastErr;
}
