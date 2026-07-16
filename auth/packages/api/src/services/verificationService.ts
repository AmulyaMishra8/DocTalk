import { prisma } from "../db/prisma";
import { randomToken, sha256 } from "../lib/crypto";
import type { VerificationTokenType } from "@prisma/client";

// ----------------------------------------------------------------------------
// One-time tokens for "email verification" and "password reset" links.
// We email the RAW token to the user but only store its HASH, so a database
// leak can't be turned into working links.
// ----------------------------------------------------------------------------

export async function createVerificationToken(
  userId: string,
  type: VerificationTokenType,
  ttlSeconds: number,
): Promise<string> {
  const token = randomToken(32);
  await prisma.verificationToken.create({
    data: {
      type,
      tokenHash: sha256(token),
      userId,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    },
  });
  return token;
}

// Validates a raw token, marks it consumed, and returns the userId it belongs
// to. Returns null if the token is unknown, wrong type, expired, or used.
export async function consumeVerificationToken(
  rawToken: string,
  type: VerificationTokenType,
): Promise<string | null> {
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: sha256(rawToken) },
  });

  if (!record || record.type !== type) return null;
  if (record.consumedAt) return null;
  if (record.expiresAt < new Date()) return null;

  await prisma.verificationToken.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  });
  return record.userId;
}
