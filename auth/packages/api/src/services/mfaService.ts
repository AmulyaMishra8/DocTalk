import { authenticator } from "otplib";
import QRCode from "qrcode";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { encrypt, decrypt, randomToken, sha256, safeEqual } from "../lib/crypto";
import { Errors } from "../lib/AppError";

// ----------------------------------------------------------------------------
// TOTP (Time-based One-Time Password) multi-factor auth — the 6-digit codes
// from apps like Google Authenticator / Authy.
//
// Flow:
//  1. setup    -> we generate a secret, store it ENCRYPTED, return a QR code.
//  2. confirm  -> user types the first code; if valid we ENABLE MFA and hand
//                 back one-time recovery codes (shown only once).
//  3. verify   -> at each login we check the code (or a recovery code).
// ----------------------------------------------------------------------------

const RECOVERY_CODE_COUNT = 10;

// Step 1: create a secret (not yet enabled) and return the QR to scan.
export async function setupTotp(userId: string, email: string) {
  const secret = authenticator.generateSecret();
  await prisma.user.update({ where: { id: userId }, data: { mfaSecret: encrypt(secret) } });

  const otpauth = authenticator.keyuri(email, env.MFA_ISSUER, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauth);
  // We also return the raw secret so users can type it in manually if needed.
  return { secret, otpauth, qrDataUrl };
}

// Step 2: confirm the first code, enable MFA, return recovery codes.
export async function confirmTotp(userId: string, code: string): Promise<string[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.mfaSecret) throw Errors.badRequest("Start MFA setup first");

  const secret = decrypt(user.mfaSecret);
  if (!authenticator.check(code, secret)) throw Errors.badRequest("That code is incorrect");

  // Generate human-friendly recovery codes; store only their hashes.
  const plainCodes = Array.from({ length: RECOVERY_CODE_COUNT }, () => randomToken(6));
  const hashed = plainCodes.map(sha256);

  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: true, mfaRecoveryCodes: JSON.stringify(hashed) },
  });

  return plainCodes; // shown to the user exactly once
}

// Step 3: verify a code during login. Accepts a TOTP code OR a recovery code.
export async function verifyMfaCode(userId: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.mfaEnabled || !user.mfaSecret) return false;

  // Try the time-based code first.
  if (authenticator.check(code, decrypt(user.mfaSecret))) return true;

  // Otherwise try (and burn) a recovery code.
  const codes: string[] = user.mfaRecoveryCodes ? JSON.parse(user.mfaRecoveryCodes) : [];
  const incomingHash = sha256(code.trim());
  const match = codes.find((stored) => safeEqual(stored, incomingHash));
  if (!match) return false;

  await prisma.user.update({
    where: { id: userId },
    data: { mfaRecoveryCodes: JSON.stringify(codes.filter((c) => c !== match)) },
  });
  return true;
}

export async function disableMfa(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { mfaEnabled: false, mfaSecret: null, mfaRecoveryCodes: null },
  });
}
