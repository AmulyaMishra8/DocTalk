import type { User } from "@prisma/client";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { Errors } from "../lib/AppError";

// ----------------------------------------------------------------------------
// OAuth social login (Google + GitHub), using the standard Authorization Code
// flow:
//   1. We send the user to the provider with our client_id + a random `state`.
//   2. The provider sends them back to /oauth/:provider/callback with a `code`.
//   3. We exchange that code for an access token, then fetch the user's profile.
//   4. We find/create/link a local user and start a normal session.
// ----------------------------------------------------------------------------

export type Provider = "google" | "github";

// A provider's profile, normalised to the few fields we care about.
interface OAuthProfile {
  providerAccountId: string;
  email: string | null;
  name: string | null;
}

interface ProviderConfig {
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  scope: string;
  exchangeAndFetch: (code: string, redirectUri: string) => Promise<OAuthProfile>;
}

const redirectUri = (provider: Provider) => `${env.APP_URL}/oauth/${provider}/callback`;

const providers: Record<Provider, ProviderConfig> = {
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    scope: "openid email profile",
    async exchangeAndFetch(code, redirect) {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID!,
          client_secret: env.GOOGLE_CLIENT_SECRET!,
          code,
          grant_type: "authorization_code",
          redirect_uri: redirect,
        }),
      });
      const token = (await tokenRes.json()) as { access_token?: string };
      if (!token.access_token) throw Errors.badRequest("Google token exchange failed");

      const userRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const profile = (await userRes.json()) as { sub: string; email?: string; name?: string };
      return { providerAccountId: profile.sub, email: profile.email ?? null, name: profile.name ?? null };
    },
  },

  github: {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
    authorizeUrl: "https://github.com/login/oauth/authorize",
    scope: "read:user user:email",
    async exchangeAndFetch(code, redirect) {
      const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_CLIENT_ID,
          client_secret: env.GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: redirect,
        }),
      });
      const token = (await tokenRes.json()) as { access_token?: string };
      if (!token.access_token) throw Errors.badRequest("GitHub token exchange failed");

      const headers = { Authorization: `Bearer ${token.access_token}`, "User-Agent": "auth-service" };
      const userRes = await fetch("https://api.github.com/user", { headers });
      const profile = (await userRes.json()) as { id: number; name?: string; email?: string };

      // GitHub may hide the email on the profile; fetch it explicitly.
      let email = profile.email ?? null;
      if (!email) {
        const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
        const emails = (await emailsRes.json()) as { email: string; primary: boolean; verified: boolean }[];
        email = emails.find((e) => e.primary && e.verified)?.email ?? null;
      }
      return { providerAccountId: String(profile.id), email, name: profile.name ?? null };
    },
  },
};

// Validate a provider name from the URL and ensure it's configured.
export function getProvider(name: string): { provider: Provider; config: ProviderConfig } {
  if (name !== "google" && name !== "github") throw Errors.notFound("Unknown provider");
  const config = providers[name];
  if (!config.clientId || !config.clientSecret) {
    throw Errors.badRequest(`${name} login is not configured on the server`);
  }
  return { provider: name, config };
}

// Build the URL we redirect the user to in step 1.
export function buildAuthorizeUrl(provider: Provider, state: string): string {
  const config = providers[provider];
  const params = new URLSearchParams({
    client_id: config.clientId!,
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: config.scope,
    state,
  });
  return `${config.authorizeUrl}?${params.toString()}`;
}

// Steps 3–4: exchange the code, then find/create/link the local user.
export async function completeOAuth(provider: Provider, code: string): Promise<User> {
  const profile = await providers[provider].exchangeAndFetch(code, redirectUri(provider));

  // Already linked? Return that user.
  const existingLink = await prisma.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } },
    include: { user: true },
  });
  if (existingLink) return existingLink.user;

  if (!profile.email) {
    throw Errors.badRequest("Your provider account has no usable email address");
  }

  // Same email already registered? Link the social account to it.
  const byEmail = await prisma.user.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    await prisma.oAuthAccount.create({
      data: { provider, providerAccountId: profile.providerAccountId, userId: byEmail.id },
    });
    if (!byEmail.emailVerified) {
      await prisma.user.update({ where: { id: byEmail.id }, data: { emailVerified: true } });
    }
    return byEmail;
  }

  // Brand-new user — no password, email already verified by the provider.
  return prisma.user.create({
    data: {
      email: profile.email,
      displayName: profile.name,
      emailVerified: true,
      oauthAccounts: { create: { provider, providerAccountId: profile.providerAccountId } },
    },
  });
}
