import crypto from "node:crypto";
import { env } from "../config/env";

// ----------------------------------------------------------------------------
// Small cryptographic helpers used across the app.
// ----------------------------------------------------------------------------

// A URL-safe random string — used for email-verification and reset tokens,
// and for refresh tokens. 32 bytes = 256 bits of entropy.
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

// SHA-256 hex digest. We store hashes of tokens (never the raw token) so a
// database/Redis leak can't be used to impersonate anyone.
export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Constant-time comparison to avoid timing attacks when comparing secrets.
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

// Symmetric encryption (AES-256-GCM) for data we must read back later — namely
// the TOTP secret. We derive a fixed 32-byte key from ENCRYPTION_KEY by hashing
// it, so the env value can be any length.
const ENC_KEY = crypto.createHash("sha256").update(env.ENCRYPTION_KEY).digest();

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // store iv:tag:ciphertext, all base64url
  return [iv, tag, enc].map((b) => b.toString("base64url")).join(":");
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  const iv = Buffer.from(ivB64, "base64url");
  const tag = Buffer.from(tagB64, "base64url");
  const data = Buffer.from(dataB64, "base64url");
  const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
