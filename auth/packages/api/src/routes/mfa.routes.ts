import { Router } from "express";
import { mfaConfirmSchema, mfaChallengeSchema } from "@auth/shared";
import * as mfa from "../controllers/mfaController";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/asyncHandler";
import { rateLimit } from "../middleware/rateLimit";

export const mfaRouter = Router();

// Limit code guessing during the login challenge.
const challengeLimiter = rateLimit({ windowSeconds: 15 * 60, max: 10 });

// Setup + confirm require an already-logged-in user.
mfaRouter.post("/totp/setup", requireAuth, asyncHandler(mfa.setup));
mfaRouter.post("/totp/confirm", requireAuth, validate(mfaConfirmSchema), asyncHandler(mfa.confirm));

// Challenge happens DURING login (no full session yet) — it uses the mfaToken.
mfaRouter.post(
  "/totp/challenge",
  challengeLimiter,
  validate(mfaChallengeSchema),
  asyncHandler(mfa.challenge),
);

mfaRouter.post("/disable", requireAuth, asyncHandler(mfa.disable));
