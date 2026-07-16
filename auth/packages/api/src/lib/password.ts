import argon2 from "argon2";

// ----------------------------------------------------------------------------
// Password hashing. We use Argon2id — the current best-practice algorithm.
// We NEVER store a plain password; only this one-way hash. argon2 also embeds
// the salt and parameters inside the hash string, so verify() needs nothing
// else.
// ----------------------------------------------------------------------------

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}
