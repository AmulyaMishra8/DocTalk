import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';

// ----------------------------------------------------------------------------
// NeuralHire is a RESOURCE SERVER. It does not store users or passwords — that
// lives in the separate Auth microservice. This guard verifies the short-lived
// RS256 access token the Auth service issues, using ONLY its public keys
// (fetched from /.well-known/jwks.json). No database call, no shared secret.
//
// Hybrid lookup, mirroring the Auth service's own guard:
//   1. Authorization: Bearer <token>   (API / curl / Postman clients)
//   2. access_token cookie              (the browser, via the Vite proxy)
// ----------------------------------------------------------------------------

const JWKS_URL =
  process.env.AUTH_JWKS_URL ?? 'http://localhost:4000/.well-known/jwks.json';
const ISSUER = process.env.AUTH_ISSUER ?? 'auth-service';
const AUDIENCE = process.env.AUTH_AUDIENCE ?? 'auth-clients';

// createRemoteJWKSet fetches the keys lazily on first use and caches them
// (with its own refresh/cooldown), so this is cheap per request and survives
// the Auth service's zero-downtime key rotation automatically.
const jwks = createRemoteJWKSet(new URL(JWKS_URL));

function extractToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
  return req.cookies?.access_token;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    // The Auth service tags access tokens with type:"access"; reject the
    // short-lived "mfa" interstitial token so it can't be used as a session.
    if (payload.type !== 'access') throw new Error('Wrong token type');

    req.user = { id: String(payload.sub), email: String(payload.email ?? '') };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
}
