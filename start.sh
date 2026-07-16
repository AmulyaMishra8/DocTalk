#!/bin/bash
# Boot all three runtimes in one container. See the Dockerfile for the layout.
#
# bash, not sh: `wait -n` (exit as soon as ANY child dies) is a bash builtin.
# Under Debian's /bin/sh (dash) it fails with "Illegal option -n", which killed
# the container a second after boot.
#
# MEMORY BUDGET — a Render free instance is 512 MB for all three runtimes.
#
# Measured in this exact image under `docker run --memory=512m`, after a real
# signup + login + API queries:
#
#   idle                    200 MB / 512 MB   (39%)
#   after argon2 + queries  188 MB / 512 MB   (37%)
#
# So it fits with room to spare, largely because the slim MarkItDown layer drops
# PyTorch. The Node heaps are still capped below as insurance: the default heap
# grows toward the container limit under pressure, and two unbounded Node
# processes plus Python would race each other into the OOM killer.
#
# argon2's memoryCost is deliberately NOT lowered — it's what makes password
# hashes expensive to crack, and a login's ~64 MB spike clearly fits. If this
# ever does OOM, the fix is a bigger instance, not weaker hashing.

set -e

echo "==> starting DocTalk (single container)"

# The public URL. Render sets RENDER_EXTERNAL_URL to the full https:// URL for
# web services; a blueprint's `fromService: property: host` would only give the
# bare hostname, which isn't a valid origin. Fall back to localhost so the image
# also runs locally (docker run -e PORT=3000 -p 3000:3000 ...).
export WEB_ORIGIN="${RENDER_EXTERNAL_URL:-http://localhost:${PORT:-3000}}"
export APP_URL="$WEB_ORIGIN"
echo "==> public origin: $WEB_ORIGIN"

if [ -z "$AUTH_DATABASE_URL" ]; then
  echo "!!! AUTH_DATABASE_URL is not set — the auth service needs its own schema."
  echo "!!! Use the same database as DATABASE_URL with ?schema=auth appended."
  exit 1
fi

# Any child dying should take the container down, so Render restarts it and the
# health check fails loudly. Otherwise a dead auth service looks "up" until
# someone tries to sign in.
term() {
  echo "==> shutting down"
  kill 0
  exit 0
}
trap term TERM INT

# ── MarkItDown ───────────────────────────────────────────────────────────────
# Bound to loopback: it must not be reachable from outside the container.
echo "==> markitdown on 127.0.0.1:8000"
(
  cd /app/markitdown-service
  exec uvicorn main:app --host 127.0.0.1 --port 8000 --log-level warning
) &
MARKITDOWN_PID=$!

# ── Auth service ─────────────────────────────────────────────────────────────
# RSA keys are generated per boot: Render's free tier has no persistent disk, so
# they can't survive a restart. Consequence — every deploy invalidates existing
# tokens and users sign in again. Acceptable for a demo, not for production.
echo "==> auth api on 127.0.0.1:4000"
(
  cd /app/auth/packages/api
  export NODE_OPTIONS="--max-old-space-size=160"
  export PORT=4000
  # Where generate-keys.ts writes, and where the service expects to read them.
  # Normally supplied by auth's own .env, which isn't in this image.
  export JWT_PRIVATE_KEY_PATH=/app/auth/packages/api/keys/private.pem
  export JWT_PUBLIC_KEY_PATH=/app/auth/packages/api/keys/public.pem
  test -f keys/private.pem || npm run keys
  # The auth schema lives in the same database, kept apart by ?schema=auth in
  # AUTH_DATABASE_URL. Migrations are idempotent; don't kill the boot if the
  # database is already migrated.
  DATABASE_URL="$AUTH_DATABASE_URL" npx prisma migrate deploy || echo "==> migrate skipped"
  DATABASE_URL="$AUTH_DATABASE_URL" exec node dist/src/index.js
) &
AUTH_PID=$!

# ── DocTalk API + worker + frontend ──────────────────────────────────────────
# Last, and in the foreground, because it owns $PORT — Render's health check
# hits this one.
echo "==> doctalk api on 0.0.0.0:${PORT}"
cd /app/backend
export NODE_OPTIONS="--max-old-space-size=200"
npm start &
API_PID=$!

# Exit as soon as ANY of the three dies, rather than sitting half-broken.
wait -n "$MARKITDOWN_PID" "$AUTH_PID" "$API_PID"
EXIT=$?
echo "==> a process exited (status $EXIT) — stopping the container"
kill 0
exit "$EXIT"
