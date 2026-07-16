# ─────────────────────────────────────────────────────────────────────────────
# DocTalk — single-container image (Render free tier, see render.yaml).
#
# Everything the app needs in ONE web service, because Render's free plan has no
# background workers and only one free instance is wanted:
#
#   :$PORT      Node   DocTalk API + BullMQ worker (in-process) + built frontend
#   127.0.0.1:8000  Python  MarkItDown (PDF → Markdown)
#   127.0.0.1:4000  Node    Auth service (RS256 JWTs, JWKS)
#
# Only $PORT is exposed; the API proxies /auth, /mfa and /oauth to the auth
# service so the browser sees one origin and auth cookies stay first-party.
#
# THE CONSTRAINT: a free instance is 512 MB total for all three runtimes. That's
# why the MarkItDown layer installs requirements-slim.txt (no sentence-transformers
# → no PyTorch) and the backend runs EMBED_PROVIDER=gemini instead. It is still
# tight — see the memory notes in start.sh.
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build the frontend ──────────────────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci || npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: build the auth service ──────────────────────────────────────────
# Debian (not alpine): argon2 is native and Prisma's engines want glibc+openssl.
FROM node:20-slim AS auth
WORKDIR /app/auth
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
# Drop the web workspace's deps — the auth web app isn't served here.
RUN rm -rf packages/web

# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM node:20-slim
WORKDIR /app

# python3 for MarkItDown, openssl for Prisma, tini to reap the child processes.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 python3-pip python3-venv openssl tini \
    && rm -rf /var/lib/apt/lists/*

# MarkItDown, without PyTorch. See requirements-slim.txt for why.
COPY markitdown-service/requirements-slim.txt /app/markitdown-service/
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir -r /app/markitdown-service/requirements-slim.txt
ENV PATH="/opt/venv/bin:$PATH"
COPY markitdown-service/ /app/markitdown-service/

# Backend. tsx and TypeScript are runtime deps here — the API runs .ts directly.
COPY backend/package*.json /app/backend/
RUN cd /app/backend && (npm ci --omit=dev --include=dev || npm install)
COPY backend/ /app/backend/

# Built artefacts from the earlier stages.
COPY --from=frontend /app/frontend/dist /app/frontend/dist
COPY --from=auth /app/auth /app/auth

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Render sets PORT; 3000 is the local default.
ENV PORT=3000
EXPOSE 3000

# tini as PID 1 so signals reach every child and nothing is left zombied.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/app/start.sh"]
