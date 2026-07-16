import type { Request, Response } from "express";
import * as mfa from "../services/mfaService";
import { getUserById } from "../services/authService";
import { verifyMfaToken } from "../lib/tokens";
import { issueSession } from "../lib/issueSession";
import { recordEvent } from "../services/auditService";
import { Errors } from "../lib/AppError";

// Step 1 (logged-in): begin setup — returns a QR code to scan.
export async function setup(req: Request, res: Response) {
  const user = await getUserById(req.user!.id);
  if (!user) throw Errors.unauthorized();
  const { otpauth, qrDataUrl, secret } = await mfa.setupTotp(user.id, user.email);
  res.json({ otpauth, qrDataUrl, secret });
}

// Step 2 (logged-in): confirm the first code, enable MFA, return recovery codes.
export async function confirm(req: Request, res: Response) {
  const recoveryCodes = await mfa.confirmTotp(req.user!.id, req.body.code);
  await recordEvent("mfa.enabled", { req, userId: req.user!.id });
  res.json({ ok: true, recoveryCodes });
}

// Step 3 (NOT logged in yet): complete login after the password step. The
// client sends the mfaToken it received from /auth/login plus the 6-digit code.
export async function challenge(req: Request, res: Response) {
  const { mfaToken, code } = req.body;

  const { sub: userId } = await verifyMfaToken(mfaToken).catch(() => {
    throw Errors.unauthorized("Your MFA session expired — please log in again");
  });

  const valid = await mfa.verifyMfaCode(userId, code);
  if (!valid) {
    await recordEvent("mfa.challenge_failed", { req, userId });
    throw Errors.unauthorized("Incorrect code");
  }

  const user = await getUserById(userId);
  if (!user) throw Errors.unauthorized();

  await recordEvent("login.success", { req, userId, metadata: { mfa: true } });
  const session = await issueSession(req, res, user);
  res.json(session);
}

// Turn MFA off (logged-in).
export async function disable(req: Request, res: Response) {
  await mfa.disableMfa(req.user!.id);
  await recordEvent("mfa.disabled", { req, userId: req.user!.id });
  res.json({ ok: true });
}
