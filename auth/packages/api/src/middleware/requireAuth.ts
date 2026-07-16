import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/tokens";
import { ACCESS_COOKIE } from "../lib/cookies";
import { Errors } from "../lib/AppError";
import { asyncHandler } from "./asyncHandler";

// Guards routes that require a logged-in user. Implements the HYBRID lookup:
//   1. Authorization: Bearer <token>   (API / mobile clients)
//   2. access_token cookie              (browsers)
// On success it attaches req.user and remembers how they authenticated.
//
// NOTE: this is async, so it MUST be wrapped in asyncHandler (below) — otherwise
// a thrown 401 becomes an unhandled promise rejection and the request hangs
// instead of returning a clean JSON error.
async function requireAuthImpl(req: Request, _res: Response, next: NextFunction) {
  let token: string | undefined;
  let via: "cookie" | "bearer" | undefined;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    token = header.slice("Bearer ".length);
    via = "bearer";
  } else if (req.cookies?.[ACCESS_COOKIE]) {
    token = req.cookies[ACCESS_COOKIE];
    via = "cookie";
  }

  if (!token) throw Errors.unauthorized();

  try {
    const claims = await verifyAccessToken(token);
    req.user = { id: claims.sub!, email: claims.email };
    req.authVia = via;
    next();
  } catch {
    throw Errors.unauthorized("Invalid or expired token");
  }
}

export const requireAuth = asyncHandler(requireAuthImpl);
