# ─────────────────────────────────────────────────────────────────────────────
# DocTalk — Hugging Face Spaces image (the recommended free host).
#
# Spaces free hardware is 2 vCPU / 16 GB / 50 GB disk, so unlike the 512 MB
# Render free instance (see Dockerfile.render) everything fits as designed:
#
#   :7860           Node    API + BullMQ worker (in-process) + built frontend
#   127.0.0.1:8000  Python  MarkItDown + all-mpnet-base-v2 embeddings (LOCAL)
#   127.0.0.1:4000  Node    Auth service (RS256 JWTs, JWKS)
#   127.0.0.1:6379  Redis   BullMQ queue
#
# Embeddings run locally here. No API key, nothing leaves the container, and the
# vectors match what your laptop produces — so an existing database keeps working
# with no re-ingest. (The Render image can't do this: PyTorch alone won't fit.)
#
# Spaces facts baked in below:
#   - The container runs as user 1000, so a matching user is created and every
#     COPY uses --chown. Without this, writing keys/ and uploads/ fails.
#   - Only app_port is routed in; 8000/4000/6379 stay private to the container.
#   - Disk is wiped on restart, which is fine: Postgres is external (Neon) and
#     uploads are deleted after ingestion anyway.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build the frontend ──────────────────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: build the auth service ──────────────────────────────────────────
# Debian, not alpine: argon2 is native and Prisma's engines want glibc+openssl.
FROM node:20-slim AS auth
WORKDIR /build/auth
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*
COPY auth/package.json auth/package-lock.json ./
COPY auth/packages/shared/package.json packages/shared/package.json
COPY auth/packages/api/package.json packages/api/package.json
COPY auth/packages/web/package.json packages/web/package.json
RUN npm install --omit=optional
COPY auth/packages/shared packages/shared
RUN npm run build --workspace @auth/shared
COPY auth/packages/api packages/api
RUN npm run db:generate --workspace @auth/api
RUN npm run build --workspace @auth/api
RUN rm -rf packages/web

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:20-slim

# redis-server for the queue, python3 for MarkItDown, openssl for Prisma,
# tini to reap children.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv openssl tini redis-server \
    && rm -rf /var/lib/apt/lists/*

# Spaces runs the container as uid 1000. Do NOT `useradd -m -u 1000 user` as the
# HF docs suggest — node:20-slim already ships a `node` user at uid 1000, so that
# fails the build with "UID already in use" (exit 4). Reuse the built-in one:
# Spaces cares about the uid, not the name.
USER node
ENV HOME=/home/node PATH=/home/node/.local/bin:$PATH
WORKDIR /home/node/app

# MarkItDown WITH sentence-transformers (the full requirements). The model is
# baked in at build time so the Space starts without a cold download.
#
# torch comes from PyTorch's CPU index FIRST, before sentence-transformers can
# pull the default build: that default bundles CUDA libraries, and Spaces free
# hardware has no GPU. Installing them anyway took the image from ~4 GB to
# 10.3 GB of files that could never be used.
COPY --chown=node:node markitdown-service/requirements.txt ./markitdown-service/
RUN python3 -m venv /home/node/venv \
    && /home/node/venv/bin/pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && /home/node/venv/bin/pip install --no-cache-dir -r ./markitdown-service/requirements.txt
ENV PATH="/home/node/venv/bin:$PATH"
RUN python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-mpnet-base-v2')"
COPY --chown=node:node markitdown-service/ ./markitdown-service/

# Backend — tsx and TypeScript are runtime deps; the API runs .ts directly.
COPY --chown=node:node backend/package*.json ./backend/
RUN cd backend && (npm ci || npm install)
COPY --chown=node:node backend/ ./backend/

COPY --chown=node:node --from=frontend /build/frontend/dist ./frontend/dist
COPY --chown=node:node --from=auth /build/auth ./auth

COPY --chown=node:node start.sh ./start.sh
RUN chmod +x ./start.sh

# Spaces routes traffic to app_port (see the YAML block in README.md).
ENV PORT=7860 \
    APP_ROOT=/home/node/app \
    START_REDIS=1 \
    RUN_WORKER=1 \
    SERVE_FRONTEND=1 \
    EMBED_PROVIDER=local \
    MARKITDOWN_URL=http://127.0.0.1:8000 \
    AUTH_PROXY_TARGET=http://127.0.0.1:4000 \
    AUTH_JWKS_URL=http://127.0.0.1:4000/.well-known/jwks.json \
    AUTH_ISSUER=auth-service \
    AUTH_AUDIENCE=auth-clients \
    JWT_ISSUER=auth-service \
    JWT_AUDIENCE=auth-clients \
    REDIS_URL=redis://127.0.0.1:6379 \
    COOKIE_SECURE=true \
    NODE_ENV=production

EXPOSE 7860

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["./start.sh"]
