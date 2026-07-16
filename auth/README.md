# Auth Service

A reusable in-house authentication service: **Express + TypeScript API** and a **React** interface.
See [`PLAN.md`](./PLAN.md) for the full architecture and decisions.

## Quick start

```bash
# 1. Install everything (npm workspaces)
npm install

# 2. Start Postgres + Redis
npm run db:up

# 3. Configure the API
cp packages/api/.env.example packages/api/.env
npm run keys --workspace @auth/api      # generate RSA signing keys
npm run db:migrate --workspace @auth/api # create the database tables

# 4. Run the API and the web app (two terminals)
npm run dev:api      # http://localhost:4000
npm run dev:web      # http://localhost:5173
```

## Packages

| Package | What it is |
|---------|------------|
| `packages/shared` | Zod schemas + TypeScript types shared by API and web |
| `packages/api`    | The Express auth server |
| `packages/web`    | The React auth interface |

## How files are organised

Every concern lives in its own small file so it's easy to find and understand:

- `src/lib/*` — pure building blocks (password hashing, JWTs, crypto, cookies).
- `src/middleware/*` — one file per Express middleware (rate limiting, CSRF, auth guard...).
- `src/services/*` — business logic (auth, tokens, MFA, mailer, audit).
- `src/controllers/*` — thin glue between HTTP requests and services.
- `src/routes/*` — wires URLs to controllers.

## Data stores

You can use Docker (`npm run db:up`) **or** point at managed services — just set
`DATABASE_URL` (Postgres) and `REDIS_URL` (Redis) in `packages/api/.env`.
Redis is used **only for refresh tokens** (a few ops per session), so it fits a
free Redis tier comfortably; rate limiting is in-memory.

## Enabling social login (OAuth)

1. **Google** — create OAuth credentials at
   <https://console.cloud.google.com/apis/credentials>, with redirect URI
   `http://localhost:4000/oauth/google/callback`.
2. **GitHub** — create an OAuth app at
   <https://github.com/settings/developers>, callback URL
   `http://localhost:4000/oauth/github/callback`.
3. Put the client id/secret in `packages/api/.env`. The "Continue with…"
   buttons appear automatically; unconfigured providers return a clear error.

## Rotating the JWT signing key (zero downtime)

1. Copy the current `keys/public.pem` somewhere and point
   `JWT_PREVIOUS_PUBLIC_KEY_PATH` at it.
2. Run `npm run keys --workspace @auth/api` to generate a new key pair.
3. Restart. New tokens are signed with the new key; old tokens still verify
   against the previous key, and `/.well-known/jwks.json` serves both.
4. After the old access tokens have all expired, remove
   `JWT_PREVIOUS_PUBLIC_KEY_PATH`.

## Production checklist

- [ ] `NODE_ENV=production`, `COOKIE_SECURE=true` (HTTPS only)
- [ ] Strong random `ENCRYPTION_KEY` (the app refuses the dev default in prod)
- [ ] Real SMTP configured so verification/reset emails actually send
- [ ] `WEB_ORIGIN` / `APP_URL` set to your real domains
- [ ] `keys/private.pem` kept secret (never committed — it's git-ignored)
- [ ] Rotate any credentials that were ever shared in plaintext
