import type { Request } from "express";
import type { User } from "@prisma/client";
import type { RegisterInput, LoginInput } from "@auth/shared";
import { prisma } from "../db/prisma";
import { hashPassword, verifyPassword } from "../lib/password";
import { Errors } from "../lib/AppError";
import { env } from "../config/env";
import {
  createVerificationToken,
  consumeVerificationToken,
} from "./verificationService";
import { revokeAllForUser } from "./refreshTokenStore";
import { sendVerificationEmail, sendPasswordResetEmail } from "./mailer";
import { recordEvent } from "./auditService";

// Lockout policy: after this many consecutive failures, lock for a while.
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

// Result of a login attempt — either fully done, or "now do MFA".
export type LoginResult =
  | { kind: "ok"; user: User }
  | { kind: "mfa"; userId: string };

// --- Registration ---------------------------------------------------------
// To avoid leaking which emails are registered, we ALWAYS report success.
// If the email is new we create the account and send a verification link.
export async function register(input: RegisterInput, req: Request): Promise<void> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    await recordEvent("register.duplicate", { req, userId: existing.id });
    return; // silently succeed — don't reveal the email exists
  }

  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      displayName: input.displayName ?? null,
    },
  });

  const token = await createVerificationToken(user.id, "EMAIL_VERIFICATION", 60 * 60 * 24);
  const link = `${env.WEB_ORIGIN}/verify-email?token=${token}`;
  await sendVerificationEmail(user.email, link);
  await recordEvent("register.success", { req, userId: user.id });
}

// --- Email verification ---------------------------------------------------
export async function verifyEmail(token: string, req: Request): Promise<void> {
  const userId = await consumeVerificationToken(token, "EMAIL_VERIFICATION");
  if (!userId) throw Errors.badRequest("This verification link is invalid or has expired");
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: true } });
  await recordEvent("email.verified", { req, userId });
}

// --- Resend verification --------------------------------------------------
// Issues a fresh verification link. Like register/forgot-password, it stays
// silent if the email is unknown or already verified (no enumeration).
export async function resendVerification(email: string, req: Request): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.emailVerified) return;

  const token = await createVerificationToken(user.id, "EMAIL_VERIFICATION", 60 * 60 * 24);
  const link = `${env.WEB_ORIGIN}/verify-email?token=${token}`;
  await sendVerificationEmail(user.email, link);
  await recordEvent("email.verification_resent", { req, userId: user.id });
}

// --- Login ----------------------------------------------------------------
export async function login(input: LoginInput, req: Request): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Unknown email OR an OAuth-only account (no password) -> generic failure.
  if (!user || !user.passwordHash) {
    await recordEvent("login.failure", { req, metadata: { email: input.email } });
    throw Errors.invalidCredentials();
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw Errors.tooMany("Account temporarily locked. Try again later.");
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    await registerFailedLogin(user);
    await recordEvent("login.failure", { req, userId: user.id });
    throw Errors.invalidCredentials();
  }

  // Success — clear the failure counter.
  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  if (user.mfaEnabled) {
    await recordEvent("login.password_ok_mfa_required", { req, userId: user.id });
    return { kind: "mfa", userId: user.id };
  }

  await recordEvent("login.success", { req, userId: user.id });
  return { kind: "ok", user };
}

async function registerFailedLogin(user: User) {
  const failedLoginCount = user.failedLoginCount + 1;
  const lock = failedLoginCount >= MAX_FAILED_LOGINS;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: lock ? 0 : failedLoginCount,
      lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000) : user.lockedUntil,
    },
  });
}

// --- Password reset -------------------------------------------------------
// Always returns success (no enumeration). Sends a link only if the user exists.
export async function forgotPassword(email: string, req: Request): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return;
  const token = await createVerificationToken(user.id, "PASSWORD_RESET", 60 * 60);
  const link = `${env.WEB_ORIGIN}/reset-password?token=${token}`;
  await sendPasswordResetEmail(user.email, link);
  await recordEvent("password.reset_requested", { req, userId: user.id });
}

export async function resetPassword(token: string, password: string, req: Request): Promise<void> {
  const userId = await consumeVerificationToken(token, "PASSWORD_RESET");
  if (!userId) throw Errors.badRequest("This reset link is invalid or has expired");

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null },
  });

  // Changing the password kills every existing session everywhere.
  await revokeAllForUser(userId);
  await recordEvent("password.reset_completed", { req, userId });
}

export async function getUserById(id: string): Promise<User | null> {
  return prisma.user.findUnique({ where: { id } });
}
