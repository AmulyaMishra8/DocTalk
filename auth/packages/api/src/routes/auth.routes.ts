import { Router } from "express";
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@auth/shared";
import * as auth from "../controllers/authController";
import { me } from "../controllers/userController";
import { validate } from "../middleware/validate";
import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../middleware/asyncHandler";
import { rateLimit, emailKey } from "../middleware/rateLimit";

export const authRouter = Router();

// Throttle the abuse-prone endpoints. Login is keyed by IP+email so one
// attacker can't lock out everyone, and guessing one account is slow.
const loginLimiter = rateLimit({ windowSeconds: 15 * 60, max: 10, keyBy: emailKey });
const registerLimiter = rateLimit({ windowSeconds: 60 * 60, max: 20 });
const forgotLimiter = rateLimit({ windowSeconds: 60 * 60, max: 5, keyBy: emailKey });
const resendLimiter = rateLimit({ windowSeconds: 60 * 60, max: 5, keyBy: emailKey });

authRouter.post("/register", registerLimiter, validate(registerSchema), asyncHandler(auth.register));
authRouter.post("/verify-email", validate(verifyEmailSchema), asyncHandler(auth.verifyEmail));
authRouter.post(
  "/resend-verification",
  resendLimiter,
  validate(resendVerificationSchema),
  asyncHandler(auth.resendVerification),
);
authRouter.post("/login", loginLimiter, validate(loginSchema), asyncHandler(auth.login));
authRouter.post("/refresh", asyncHandler(auth.refresh));
authRouter.post("/logout", asyncHandler(auth.logout));
authRouter.post(
  "/forgot-password",
  forgotLimiter,
  validate(forgotPasswordSchema),
  asyncHandler(auth.forgotPassword),
);
authRouter.post("/reset-password", validate(resetPasswordSchema), asyncHandler(auth.resetPassword));

authRouter.get("/me", requireAuth, asyncHandler(me));
