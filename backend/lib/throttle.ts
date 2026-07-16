// Serialize async calls and enforce a minimum gap between consecutive starts,
// to stay under provider rate limits (free-tier requests-per-minute). Calls
// run in submission order; each waits until minGapMs after the previous start.
let tail: Promise<unknown> = Promise.resolve();
let lastStart = 0;

export function rateLimited<T>(fn: () => Promise<T>, minGapMs: number): Promise<T> {
  const run = async (): Promise<T> => {
    const wait = Math.max(0, lastStart + minGapMs - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastStart = Date.now();
    return fn();
  };
  const result = tail.then(run, run);
  tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
