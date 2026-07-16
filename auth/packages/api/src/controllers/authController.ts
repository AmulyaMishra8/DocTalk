import type { Request, Response } from "express";
import * as authService from "../services/authService";
import { issueSession } from "../lib/issueSession";
import { signAccessToken, signMfaToken } from "../lib/tokens";
import { rotateRefreshToken, revokeRefreshToken } from "../services/refreshTokenStore";
import {
  REFRESH_COOKIE,
  setAccessCookie,
  setRefreshCookie,
  setCsrfCookie,
  clearAuthCookies,
} from "../lib/cookies";
import { getUserById } from "../services/authService";
import { Errors } from "../lib/AppError";

export async function register(req: Request, res: Response) {
  await authService.register(req.body, req);
  res.status(201).json({ ok: true, message: "Check your email to verify your account." });
}

export async function verifyEmail(req: Request, res: Response) {
  await authService.verifyEmail(req.body.token, req);
  res.json({ ok: true });
}

export async function resendVerification(req: Request, res: Response) {
  await authService.resendVerification(req.body.email, req);
  // Same response whether or not the account exists / is already verified.
  res.json({ ok: true, message: "If that account needs verifying, a new link has been sent." });
}

export async function login(req: Request, res: Response) {
  const result = await authService.login(req.body, req);

  // Password was correct but the account has MFA on: hand back a short-lived
  // mfaToken; the client must finish at POST /mfa/totp/challenge.
  if (result.kind === "mfa") {
    const mfaToken = await signMfaToken(result.userId);
    return res.json({ status: "mfaRequired", mfaToken });
  }

  const session = await issueSession(req, res, result.user);
  res.json(session);
}

// Exchange a refresh token for a new access token (and a rotated refresh token).
export async function refresh(req: Request, res: Response) {
  const fromCookie = req.cookies?.[REFRESH_COOKIE];
  const token = fromCookie ?? req.body?.refreshToken;
  if (!token) throw Errors.unauthorized("Missing refresh token");

  const { token: newRefresh, userId } = await rotateRefreshToken(token).catch(() => {
    throw Errors.unauthorized("Invalid refresh token");
  });

  const user = await getUserById(userId);
  if (!user) throw Errors.unauthorized();

  const accessToken = await signAccessToken({ id: user.id, email: user.email });

  if (fromCookie) {
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, newRefresh);
    setCsrfCookie(res);
    return res.json({ status: "ok", accessToken });
  }
  // Bearer client: return both tokens in the body.
  res.json({ status: "ok", accessToken, refreshToken: newRefresh });
}

export async function logout(req: Request, res: Response) {
  const token = req.cookies?.[REFRESH_COOKIE] ?? req.body?.refreshToken;
  if (token) await revokeRefreshToken(token);
  clearAuthCookies(res);
  res.json({ ok: true });
}

export async function forgotPassword(req: Request, res: Response) {
  await authService.forgotPassword(req.body.email, req);
  // Always the same response, whether or not the email exists.
  res.json({ ok: true, message: "If that email exists, a reset link has been sent." });
}

export async function resetPassword(req: Request, res: Response) {
  await authService.resetPassword(req.body.token, req.body.password, req);
  res.json({ ok: true });
}
