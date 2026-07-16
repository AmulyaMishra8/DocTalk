import crypto from "node:crypto";
import { redis } from "../lib/redis";
import { randomToken, sha256 } from "../lib/crypto";
import { env } from "../config/env";

// ----------------------------------------------------------------------------
// Refresh tokens, stored in Redis.
//
// Key ideas:
//  - The refresh token itself is a long random string we hand to the client.
//    We only ever store its SHA-256 HASH, so a Redis leak can't be replayed.
//  - Tokens belong to a "family" (one family per login/device). Rotating a
//    token issues a new one in the SAME family and invalidates the old one.
//  - REUSE DETECTION: if an already-rotated (old) token is presented again, it
//    means someone copied it — we revoke the entire family as a precaution.
//
// Redis keys:
//   rt:<hash>        -> JSON { userId, familyId }   (one per live token)
//   rtfam:<familyId> -> SET of live token hashes
//   rtuser:<userId>  -> SET of that user's familyIds
//   rtused:<hash>    -> familyId  (marker that this token was already rotated;
//                                  the value lets us nuke the family on reuse)
//
// Note: Redis is only touched at login / refresh / logout — a few ops per
// SESSION, not per request — so it stays well within a free Redis tier.
// ----------------------------------------------------------------------------

const TTL = env.REFRESH_TOKEN_TTL;

interface TokenData {
  userId: string;
  familyId: string;
}

async function store(hash: string, data: TokenData) {
  const pipe = redis.multi();
  pipe.set(`rt:${hash}`, JSON.stringify(data), "EX", TTL);
  pipe.sadd(`rtfam:${data.familyId}`, hash);
  pipe.expire(`rtfam:${data.familyId}`, TTL);
  pipe.sadd(`rtuser:${data.userId}`, data.familyId);
  pipe.expire(`rtuser:${data.userId}`, TTL);
  await pipe.exec();
}

// Create a brand-new token + family (called at login).
export async function issueRefreshToken(userId: string): Promise<string> {
  const familyId = crypto.randomUUID();
  const token = randomToken(32);
  await store(sha256(token), { userId, familyId });
  return token;
}

// Exchange an old token for a new one (called at /auth/refresh).
export async function rotateRefreshToken(
  oldToken: string,
): Promise<{ token: string; userId: string }> {
  const hash = sha256(oldToken);
  const raw = await redis.get(`rt:${hash}`);

  if (!raw) {
    // Not a live token. Was it a token we already rotated? -> reuse attack.
    const reusedFamily = await redis.get(`rtused:${hash}`);
    if (reusedFamily) {
      // We can't trust this family anymore; nuke all of it.
      await revokeFamily(reusedFamily);
    }
    throw new Error("invalid_refresh_token");
  }

  const data = JSON.parse(raw) as TokenData;

  // Invalidate the old token and mark it as "used" (storing its family) so a
  // later replay of this same token is detected as reuse.
  const pipe = redis.multi();
  pipe.del(`rt:${hash}`);
  pipe.srem(`rtfam:${data.familyId}`, hash);
  pipe.set(`rtused:${hash}`, data.familyId, "EX", TTL);
  await pipe.exec();

  // Issue the replacement in the same family.
  const token = randomToken(32);
  await store(sha256(token), { userId: data.userId, familyId: data.familyId });
  return { token, userId: data.userId };
}

// Revoke a single token (normal logout of one device).
export async function revokeRefreshToken(token: string): Promise<void> {
  const hash = sha256(token);
  const raw = await redis.get(`rt:${hash}`);
  if (!raw) return;
  const data = JSON.parse(raw) as TokenData;
  await redis
    .multi()
    .del(`rt:${hash}`)
    .srem(`rtfam:${data.familyId}`, hash)
    .set(`rtused:${hash}`, data.familyId, "EX", TTL)
    .exec();
}

// Revoke every token in a family.
export async function revokeFamily(familyId: string): Promise<void> {
  const hashes = await redis.smembers(`rtfam:${familyId}`);
  const pipe = redis.multi();
  for (const h of hashes) {
    pipe.del(`rt:${h}`);
    pipe.set(`rtused:${h}`, familyId, "EX", TTL);
  }
  pipe.del(`rtfam:${familyId}`);
  await pipe.exec();
}

// Revoke EVERY session for a user (used after a password reset).
export async function revokeAllForUser(userId: string): Promise<void> {
  const families = await redis.smembers(`rtuser:${userId}`);
  for (const fam of families) await revokeFamily(fam);
  await redis.del(`rtuser:${userId}`);
}
