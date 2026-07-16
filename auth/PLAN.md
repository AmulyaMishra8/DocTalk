# Auth Service — Implementation Plan

A reusable in-house authentication service to drop into every project.

## Locked decisions

- **Stack:** Express + TypeScript API · React + Vite frontend · shared Zod/types package.
- **DB/ORM:** PostgreSQL + Prisma. **Redis for refresh tokens only** — touched a few times per *session* (login/refresh/logout), so it stays inside a free Redis tier. **Rate limiting is in-memory** (per process), because it runs on every request and would otherwise exhaust the free Redis op quota.
- **v1 features:** email + password (Argon2id, email verify, password reset) · **TOTP MFA** · OAuth social login (Google/GitHub). **No SMS/phone auth.**
- **Token delivery — hybrid:**
  - Web (React): tokens in `httpOnly` + `Secure` + `SameSite` cookies, with CSRF protection.
  - Non-browser (mobile/CLI/service): bearer tokens in the `Authorization` header.
  - **Access token:** short-lived (15 min) RS256 JWT, verifiable by any project via the JWKS endpoint.
  - **Refresh token:** opaque random string, stored hashed in Redis, rotated on every use, with reuse-detection (reuse → revoke the whole session family).

## Repository layout

```
auth/
├── docker-compose.yml          # Postgres + Redis for local dev
├── package.json                # npm workspaces root
├── packages/
│   ├── shared/                 # Zod schemas + TS types shared by api & web
│   ├── api/                    # Express + TS auth server
│   │   ├── prisma/schema.prisma
│   │   └── src/
│   │       ├── config/         # env validation
│   │       ├── db/             # prisma client
│   │       ├── lib/            # password, tokens, crypto, redis, cookies, logger
│   │       ├── middleware/     # requireAuth, rateLimit, csrf, validate, errorHandler
│   │       ├── services/       # authService, tokenService, mfaService, mailer, audit
│   │       ├── controllers/    # thin request handlers
│   │       └── routes/         # endpoint wiring
│   └── web/                    # React + Vite auth interface
│       └── src/
│           ├── api/            # typed client
│           ├── context/        # AuthProvider
│           ├── hooks/          # useAuth
│           ├── components/     # AuthLayout, ProtectedRoute, fields
│           └── pages/          # Login, Register, Verify, Forgot/Reset, MFA, Profile
└── PLAN.md
```

## API endpoints

| Group | Method & path | Purpose |
|-------|---------------|---------|
| email+pw | `POST /auth/register` | create user, send verification email |
| | `POST /auth/verify-email` | consume token, mark verified |
| | `POST /auth/login` | verify creds; if MFA on → `mfaRequired` |
| | `POST /auth/refresh` | rotate refresh token, new access token |
| | `POST /auth/logout` | revoke refresh token, clear cookies |
| | `POST /auth/forgot-password` | email a reset link |
| | `POST /auth/reset-password` | set new password, revoke sessions |
| | `GET  /auth/me` | current user |
| MFA | `POST /mfa/totp/setup` | return secret + QR |
| | `POST /mfa/totp/confirm` | verify first code, enable, return recovery codes |
| | `POST /mfa/totp/challenge` | verify code during login |
| | `POST /mfa/disable` | turn off MFA |
| OAuth | `GET  /oauth/:provider` | redirect to provider |
| | `GET  /oauth/:provider/callback` | exchange code, link/create user, issue tokens |
| keys | `GET  /.well-known/jwks.json` | public keys for token verification |

## Build milestones

1. **Scaffold** — workspaces, configs, docker-compose, env validation, Prisma schema.
2. **Core email+password** — register/verify/login/refresh/logout/me + cookie/CSRF/bearer.
3. **React shell** — AuthProvider, client, ProtectedRoute, core pages.
4. **TOTP MFA** — setup/confirm/challenge/disable + UI.
5. **OAuth** — Google + GitHub + callback page.
6. **Hardening** — rate limits, lockout, audit log, key rotation, polish.

## Design principle

Many small single-concern files (rate limiting in its own file, etc.) so the codebase is easy to read and learn from.
