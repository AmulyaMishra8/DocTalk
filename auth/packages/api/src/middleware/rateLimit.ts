import type { Request, Response, NextFunction } from "express";
import { Errors } from "../lib/AppError";

// ----------------------------------------------------------------------------
// In-memory rate limiter (fixed window).
//
// Why in-memory instead of Redis? Rate limiting runs on EVERY request, so
// putting it on a free-tier Redis (≈100 ops/s) would exhaust the quota almost
// immediately. Keeping the counters in this process costs nothing and is
// plenty for abuse-prevention.
//
// Trade-off: counters are per-process. If you run several copies of the API
// behind a load balancer, each keeps its own count, so the effective limit is
// (instances × max). That's fine for throttling brute-force attempts; switch to
// a shared store only if you need globally-strict limits.
// ----------------------------------------------------------------------------

interface Bucket {
  count: number;
  resetAt: number; // epoch ms when the window rolls over
}

const buckets = new Map<string, Bucket>();

// Periodically drop expired buckets so the map can't grow without bound.
// unref() lets the process exit even though this timer is pending.
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) if (b.resetAt <= now) buckets.delete(key);
}, 60_000).unref();

interface Options {
  windowSeconds: number;
  max: number;
  // What to count by. Defaults to client IP; some routes also key by email.
  keyBy?: (req: Request) => string;
}

export function rateLimit({ windowSeconds, max, keyBy }: Options) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = keyBy ? keyBy(req) : req.ip ?? "unknown";
    const key = `${req.baseUrl}${req.path}:${id}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowSeconds * 1000 };
      buckets.set(key, bucket);
    }
    bucket.count++;

    res.setHeader("X-RateLimit-Limit", max);
    res.setHeader("X-RateLimit-Remaining", Math.max(0, max - bucket.count));
    res.setHeader("X-RateLimit-Reset", Math.ceil((bucket.resetAt - now) / 1000));

    if (bucket.count > max) {
      throw Errors.tooMany("Too many requests, please try again later.");
    }
    next();
  };
}

// Handy key functions reused across routes.
export const ipKey = (req: Request) => req.ip ?? "unknown";
export const emailKey = (req: Request) =>
  `${req.ip ?? "unknown"}:${(req.body?.email ?? "").toLowerCase()}`;
