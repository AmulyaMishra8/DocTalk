import type { Request, Response, NextFunction } from "express";
import { CSRF_COOKIE, ACCESS_COOKIE, REFRESH_COOKIE } from "../lib/cookies";
import { safeEqual } from "../lib/crypto";
import { Errors } from "../lib/AppError";

// ----------------------------------------------------------------------------
// CSRF protection (double-submit cookie pattern).
//
// Only browsers using our cookies are vulnerable to CSRF — a pure bearer-token
// API client is not, because the attacker's site can't read or set the
// Authorization header. So we ONLY enforce CSRF when the request arrives with
// our auth cookies. The frontend reads the csrf_token cookie and sends it back
// in the X-CSRF-Token header; we check the two match.
// ----------------------------------------------------------------------------

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrf(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();

  const usesCookies = Boolean(req.cookies?.[ACCESS_COOKIE] || req.cookies?.[REFRESH_COOKIE]);
  if (!usesCookies) return next(); // bearer client — nothing to protect against

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get("x-csrf-token");

  if (!cookieToken || !headerToken || !safeEqual(cookieToken, headerToken)) {
    throw Errors.forbidden("Invalid CSRF token");
  }
  next();
}
