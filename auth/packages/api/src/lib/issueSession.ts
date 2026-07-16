import type { Request, Response } from "express";
import type { User } from "@prisma/client";
import { signAccessToken } from "./tokens";
import { issueRefreshToken } from "../services/refreshTokenStore";
import { setAccessCookie, setRefreshCookie, setCsrfCookie } from "./cookies";
import { toPublicUser } from "./serializeUser";

// ----------------------------------------------------------------------------
// Creates a fresh session (access + refresh token) for a user and delivers it
// in the right way for the client — the core of the HYBRID model:
//
//  - Browser (default): tokens go into httpOnly cookies + a CSRF cookie.
//  - API client: send header  X-Auth-Mode: bearer  and you get the tokens in
//    the JSON body instead (nothing is stored in cookies).
// ----------------------------------------------------------------------------

function wantsBearer(req: Request): boolean {
  return req.get("x-auth-mode")?.toLowerCase() === "bearer";
}

export async function issueSession(req: Request, res: Response, user: User) {
  const accessToken = await signAccessToken({ id: user.id, email: user.email });
  const refreshToken = await issueRefreshToken(user.id);

  if (wantsBearer(req)) {
    return { status: "ok" as const, user: toPublicUser(user), accessToken, refreshToken };
  }

  setAccessCookie(res, accessToken);
  setRefreshCookie(res, refreshToken);
  setCsrfCookie(res);
  return { status: "ok" as const, user: toPublicUser(user), accessToken };
}
