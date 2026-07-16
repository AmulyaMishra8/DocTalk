import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pinoHttp } from "pino-http";
import { env } from "./config/env";
import { logger } from "./lib/logger";
import { apiRouter } from "./routes";
import { csrf } from "./middleware/csrf";
import { rateLimit } from "./middleware/rateLimit";
import { errorHandler } from "./middleware/errorHandler";
import { notFound } from "./middleware/notFound";

export function createApp() {
  const app = express();

  // We sit behind a proxy/load balancer in prod; this makes req.ip correct.
  app.set("trust proxy", 1);

  // Security headers (CSP, HSTS, etc.).
  app.use(helmet());

  // Allow the React app's origin AND send/receive cookies cross-origin.
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));

  // Cap request bodies — auth payloads are tiny, so this blocks abuse.
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger }));

  // A broad backstop limiter for every route (per IP). The per-route limiters
  // on login/register are stricter; this just caps overall traffic.
  app.use(rateLimit({ windowSeconds: 60, max: 300 }));

  // CSRF guard runs globally but self-skips for safe methods and for pure
  // bearer-token clients (see middleware/csrf.ts).
  app.use(csrf);

  app.use("/", apiRouter);

  // Must be last: unknown routes, then the catch-all error handler.
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
