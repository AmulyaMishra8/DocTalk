#!/bin/bash
# Boot every runtime in one container. Shared by both deploy images:
#
#   Dockerfile.render  Render free (0.1 CPU / 512 MB) — the free path. No room
#                      for PyTorch, so it needs EMBED_PROVIDER=gemini + an
#                      external Key Value.
#   Dockerfile         Hugging Face Spaces (2 vCPU / 16 GB). Local embeddings,
#                      Redis in-container. Needs a paid HF plan since July 2026.
#
# bash, not sh: `wait -n` (exit as soon as ANY child dies) is a bash builtin.
# Under Debian's /bin/sh (dash) it fails with "Illegal option -n", which killed
# the container a second after boot.
#
# MEMORY — measured in the Render image under `docker run --memory=512m`, after
# a real signup + login + API queries: ~200 MB idle, ~188 MB busy. The Node
# heaps are capped below because an uncapped heap grows toward the container
# limit under pressure. On Spaces (16 GB) the caps are far from binding, and the
# embedding model adds roughly 500 MB — still a rounding error there.
#
# argon2's memoryCost is deliberately NOT lowered. It's what makes password
# hashes expensive to crack, and a login's ~64 MB spike fits even in 512 MB.

set -e

APP_ROOT="${APP_ROOT:-/app}"
PORT="${PORT:-3000}"

echo "==> starting DocTalk (single container) from $APP_ROOT"

# The public URL. Render sets RENDER_EXTERNAL_URL; Spaces sets SPACE_HOST (the
# bare *.hf.space hostname, no scheme). A blueprint's `fromService: property:
# host` would only give a bare hostname too, which isn't a valid origin — hence
# deriving it here rather than in render.yaml.
if [ -n "$RENDER_EXTERNAL_URL" ]; then
  export WEB_ORIGIN="$RENDER_EXTERNAL_URL"
elif [ -n "$SPACE_HOST" ]; then
  export WEB_ORIGIN="https://${SPACE_HOST}"
else
  export WEB_ORIGIN="http://localhost:${PORT}"
fi
export APP_URL="$WEB_ORIGIN"
echo "==> public origin: $WEB_ORIGIN"

if [ -z "$AUTH_DATABASE_URL" ]; then
  echo "!!! AUTH_DATABASE_URL is not set — the auth service needs its own schema."
  echo "!!! Use the same database as DATABASE_URL with ?schema=auth appended."
  exit 1
fi

PIDS=""

term() {
  echo "==> shutting down"
  kill 0
  exit 0
}
trap term TERM INT

# ── Redis (Spaces only; Render supplies a managed Key Value) ─────────────────
if [ "${START_REDIS:-0}" = "1" ]; then
  echo "==> redis on 127.0.0.1:6379"
  # noeviction is required by BullMQ — under any eviction policy Redis may drop
  # job keys mid-flight and the queue silently loses work. Persistence is off:
  # the container's disk is wiped on restart anyway, and the queue is transient.
  redis-server --port 6379 --bind 127.0.0.1 \
    --save '' --appendonly no \
    --maxmemory 512mb --maxmemory-policy noeviction \
    --loglevel warning &
  PIDS="$PIDS $!"
fi

# ── MarkItDown (+ local embeddings, when installed) ─────────────────────────
# Loopback only: it must not be reachable from outside the container.
echo "==> markitdown on 127.0.0.1:8000"
(
  cd "$APP_ROOT/markitdown-service"
  exec uvicorn main:app --host 127.0.0.1 --port 8000 --log-level warning
) &
PIDS="$PIDS $!"

# ── Auth service ────────────────────────────────────────────────────────────
# RSA keys are generated per boot: neither host gives this container persistent
# disk, so they can't survive a restart. Consequence — every deploy invalidates
# existing tokens and users sign in again. Fine for a demo, not for production.
echo "==> auth api on 127.0.0.1:4000"
(
  cd "$APP_ROOT/auth/packages/api"
  export NODE_OPTIONS="--max-old-space-size=160"
  export PORT=4000
  # Where generate-keys.ts writes and the service reads. Normally supplied by
  # auth's own .env, which isn't in these images.
  export JWT_PRIVATE_KEY_PATH="$APP_ROOT/auth/packages/api/keys/private.pem"
  export JWT_PUBLIC_KEY_PATH="$APP_ROOT/auth/packages/api/keys/public.pem"
  test -f keys/private.pem || npm run keys
  # The auth tables live in the same database, kept apart by ?schema=auth.
  # Migrations are idempotent; don't kill the boot if it's already migrated.
  DATABASE_URL="$AUTH_DATABASE_URL" npx prisma migrate deploy || echo "==> migrate skipped"
  DATABASE_URL="$AUTH_DATABASE_URL" exec node dist/src/index.js
) &
PIDS="$PIDS $!"

# ── DocTalk API + worker + frontend ─────────────────────────────────────────
# Last, because it owns $PORT — this is what the host's health check hits.
echo "==> doctalk api on 0.0.0.0:${PORT}"
(
  cd "$APP_ROOT/backend"
  export NODE_OPTIONS="--max-old-space-size=400"
  exec npm start
) &
PIDS="$PIDS $!"

# Exit as soon as ANY child dies, rather than sitting half-broken. Otherwise a
# dead auth service looks "up" until someone tries to sign in.
# shellcheck disable=SC2086
wait -n $PIDS
EXIT=$?
echo "==> a process exited (status $EXIT) — stopping the container"
kill 0
exit "$EXIT"
