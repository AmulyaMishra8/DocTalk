import fs from "node:fs";
import crypto from "node:crypto";
import {
  SignJWT,
  jwtVerify,
  importPKCS8,
  importSPKI,
  exportJWK,
  type JWTPayload,
  type KeyLike,
} from "jose";
import { env } from "../config/env";

// ----------------------------------------------------------------------------
// JWT primitives. We sign tokens with an RSA *private* key and anyone can
// verify them with the matching *public* key. That's the whole point of the
// hybrid design: every other project you build can verify a user's access
// token by fetching the public key from /.well-known/jwks.json — without ever
// touching this service's database.
// ----------------------------------------------------------------------------

const ALG = "RS256";

// A "kid" (key id) is derived from each public key so clients/JWKS can tell
// keys apart. This is what makes zero-downtime key rotation possible.
function kidFor(pem: string) {
  return crypto.createHash("sha256").update(pem).digest("hex").slice(0, 16);
}

const privatePem = fs.readFileSync(env.JWT_PRIVATE_KEY_PATH, "utf8");
const publicPem = fs.readFileSync(env.JWT_PUBLIC_KEY_PATH, "utf8");
const kid = kidFor(publicPem);

// Optional previous public key: while rotating, we still ACCEPT tokens signed
// by the old key (we only ever SIGN with the new one).
const previousPublicPem = env.JWT_PREVIOUS_PUBLIC_KEY_PATH
  ? fs.readFileSync(env.JWT_PREVIOUS_PUBLIC_KEY_PATH, "utf8")
  : null;
const previousKid = previousPublicPem ? kidFor(previousPublicPem) : null;

let privateKey: KeyLike;
const publicKeys: { kid: string; key: KeyLike; pem: string }[] = [];

async function getPrivateKey() {
  if (!privateKey) privateKey = await importPKCS8(privatePem, ALG);
  return privateKey;
}

// All public keys we trust, current first.
async function getPublicKeys() {
  if (publicKeys.length === 0) {
    publicKeys.push({ kid, key: await importSPKI(publicPem, ALG), pem: publicPem });
    if (previousPublicPem && previousKid) {
      publicKeys.push({ kid: previousKid, key: await importSPKI(previousPublicPem, ALG), pem: previousPublicPem });
    }
  }
  return publicKeys;
}

// Verify against each trusted key in turn (current, then previous).
async function verifyWithAnyKey(token: string) {
  const keys = await getPublicKeys();
  let lastError: unknown;
  for (const k of keys) {
    try {
      return await jwtVerify(token, k.key, { issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Token verification failed");
}

interface AccessClaims extends JWTPayload {
  email: string;
  type: "access";
}

// Issue a short-lived access token for an authenticated user.
export async function signAccessToken(user: { id: string; email: string }): Promise<string> {
  const privateKey = await getPrivateKey();
  return new SignJWT({ email: user.email, type: "access" })
    .setProtectedHeader({ alg: ALG, kid })
    .setSubject(user.id)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.ACCESS_TOKEN_TTL}s`)
    .sign(privateKey);
}

// Issue the temporary "you passed the password step, now do MFA" token.
export async function signMfaToken(userId: string): Promise<string> {
  const privateKey = await getPrivateKey();
  return new SignJWT({ type: "mfa" })
    .setProtectedHeader({ alg: ALG, kid })
    .setSubject(userId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.MFA_TOKEN_TTL}s`)
    .sign(privateKey);
}

export async function verifyAccessToken(token: string): Promise<AccessClaims> {
  const { payload } = await verifyWithAnyKey(token);
  if (payload.type !== "access") throw new Error("Wrong token type");
  return payload as AccessClaims;
}

export async function verifyMfaToken(token: string): Promise<{ sub: string }> {
  const { payload } = await verifyWithAnyKey(token);
  if (payload.type !== "mfa" || !payload.sub) throw new Error("Wrong token type");
  return { sub: payload.sub };
}

// All trusted public keys in JWKS format, for /.well-known/jwks.json. During
// rotation this returns both the current and previous key so verifiers can
// validate tokens signed by either.
export async function getJwks() {
  const keys = await getPublicKeys();
  const jwks = await Promise.all(
    keys.map(async ({ kid, key }) => ({ ...(await exportJWK(key)), kid, alg: ALG, use: "sig" })),
  );
  return { keys: jwks };
}
