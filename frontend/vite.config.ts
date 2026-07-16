import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In Docker the API is reachable as http://api:3000 (BACKEND_URL); locally it
// defaults to http://localhost:3000. Proxying these paths keeps the browser on
// one origin, so no CORS setup is needed. Applies to both dev and preview.
const backend = process.env.BACKEND_URL || 'http://localhost:3000';
// The Auth microservice. Proxying /auth (and /mfa) through the same origin lets
// the browser share the Auth service's httpOnly cookies with NeuralHire without
// any cross-origin/CORS setup. In Docker, set AUTH_URL to the auth container.
const auth = process.env.AUTH_URL || 'http://localhost:4000';
// Exact-match (^…$) the NeuralHire API paths so SPA routes that merely share a
// prefix — e.g. /reset-password and /verify-email (the Auth email links) — are
// NOT proxied to the backend and instead fall through to index.html. /auth and
// /mfa stay prefix matches so sub-paths like /auth/login are forwarded.
const proxy = {
  '^/ask$':       backend,
  '^/pdfs$':      backend,
  '^/reset$':     backend,
  '^/hello$':     backend,
  '^/jobs':       backend,
  '^/notebooks':  backend,
  '^/documents':  backend,
  '^/auth':       auth,
  '^/mfa':        auth,
  '^/oauth':      auth,
};

export default defineConfig({
  plugins: [react()],
  server: { host: true, proxy },
  preview: { host: true, proxy },
});
