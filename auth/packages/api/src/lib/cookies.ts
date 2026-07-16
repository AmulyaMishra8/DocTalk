import type { Response } from "express";
import { env } from "../config/env";
import { randomToken } from "./crypto";

// ----------------------------------------------------------------------------
// Cookie helpers for the BROWSER half of our hybrid auth.
//
//  - access_token  : httpOnly  -> JS can't read it (XSS-safe), sent automatically
//  - refresh_token : httpOnly  -> only used to get new access tokens
//  - csrf_token    : NOT httpOnly -> JS reads it and echoes it back in a header
//                    so we can prove the request came from our own app
//                    (the "double-submit cookie" CSRF defense).
// ----------------------------------------------------------------------------

export const ACCESS_COOKIE = "access_token";
export const REFRESH_COOKIE = "refresh_token";
export const CSRF_COOKIE = "csrf_token";

const base = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: "lax" as const,
  domain: env.COOKIE_DOMAIN || undefined,
  path: "/",
};

export function setAccessCookie(res: Response, token: string) {
  res.cookie(ACCESS_COOKIE, token, { ...base, maxAge: env.ACCESS_TOKEN_TTL * 1000 });
}

export function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, { ...base, maxAge: env.REFRESH_TOKEN_TTL * 1000 });
}

// Issue a fresh CSRF token, store it in a JS-readable cookie, and return it.
export function setCsrfCookie(res: Response): string {
  const token = randomToken(24);
  res.cookie(CSRF_COOKIE, token, {
    ...base,
    httpOnly: false, // the frontend must be able to read this one
    maxAge: env.REFRESH_TOKEN_TTL * 1000,
  });
  return token;
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, { ...base });
  res.clearCookie(REFRESH_COOKIE, { ...base });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
}
