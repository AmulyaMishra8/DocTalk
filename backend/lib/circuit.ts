const THRESHOLD = 5;   // failures before opening
const RESET_MS  = 30_000; // ms before half-open retry

interface State { failures: number; openAt: number | null; }
const states = new Map<string, State>();

export async function withCircuit<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const s = states.get(key) ?? { failures: 0, openAt: null };

  if (s.openAt !== null) {
    if (Date.now() - s.openAt < RESET_MS)
      throw new Error(`Service "${key}" unavailable (circuit open)`);
    // half-open: let one request through to probe
    s.openAt = null;
    s.failures = 0;
  }

  try {
    const result = await fn();
    s.failures = 0;
    s.openAt = null;
    states.set(key, s);
    return result;
  } catch (err) {
    s.failures++;
    if (s.failures >= THRESHOLD) s.openAt = Date.now();
    states.set(key, s);
    throw err;
  }
}
