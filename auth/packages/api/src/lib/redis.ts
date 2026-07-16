import Redis from "ioredis";
import { env } from "../config/env";

// One shared Redis connection. We use Redis ONLY for refresh tokens — they're
// short-lived, benefit from automatic TTL expiry, and are touched just a few
// times per session (login/refresh/logout), so this stays within a free Redis
// tier. (Rate limiting lives in-memory; see middleware/rateLimit.ts.)
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
});

redis.on("error", (err) => {
  // Don't crash the process on a transient Redis hiccup; just log it.
  console.error("Redis error:", err.message);
});
