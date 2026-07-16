import type { Request, Response } from "express";
import { env } from "../config/env";
import { randomToken } from "../lib/crypto";
import { issueSession } from "../lib/issueSession";
import { getProvider, buildAuthorizeUrl, completeOAuth } from "../services/oauthService";
import { recordEvent } from "../services/auditService";

const STATE_COOKIE = "oauth_state";

// Step 1: redirect the user to the provider's consent screen. We attach a
// random `state` and remember it in a short-lived cookie to prevent CSRF on
// the callback.
export async function start(req: Request, res: Response) {
  const { provider } = getProvider(req.params.provider);
  const state = randomToken(16);

  res.cookie(STATE_COOKIE, state, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/",
  });

  res.redirect(buildAuthorizeUrl(provider, state));
}

// Step 2: the provider redirects back here with ?code & ?state. We verify the
// state, exchange the code, start a session (cookies), then bounce the user
// into the web app.
export async function callback(req: Request, res: Response) {
  const { provider } = getProvider(req.params.provider);
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const expected = req.cookies?.[STATE_COOKIE];

  res.clearCookie(STATE_COOKIE, { path: "/" });

  // Reject if state is missing or doesn't match what we issued.
  if (!code || !state || !expected || state !== expected) {
    return res.redirect(`${env.WEB_ORIGIN}/login?error=oauth_state`);
  }

  try {
    const user = await completeOAuth(provider, code);
    await issueSession(req, res, user); // sets the auth cookies on this response
    await recordEvent("login.success", { req, userId: user.id, metadata: { oauth: provider } });
    res.redirect(`${env.WEB_ORIGIN}/`);
  } catch (err) {
    await recordEvent("oauth.failure", { req, metadata: { provider } });
    res.redirect(`${env.WEB_ORIGIN}/login?error=oauth_failed`);
  }
}
