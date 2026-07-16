import { Router } from "express";
import { authRouter } from "./auth.routes";
import { mfaRouter } from "./mfa.routes";
import { oauthRouter } from "./oauth.routes";
import { wellKnownRouter } from "./wellKnown.routes";

// Aggregates every route group into one router that app.ts mounts.
export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/mfa", mfaRouter);
apiRouter.use("/oauth", oauthRouter);
apiRouter.use("/.well-known", wellKnownRouter);

// Simple health check for load balancers / uptime monitors.
apiRouter.get("/health", (_req, res) => res.json({ status: "ok" }));
