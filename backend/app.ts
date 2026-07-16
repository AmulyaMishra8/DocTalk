import fs from 'fs';
import path from 'path';
import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { createProxyMiddleware } from 'http-proxy-middleware';
import axios from 'axios';
import { markdownQueue, defaultJobOptions } from './queue/markdownQueue';
import { streamQuestion } from './services/ask';
import { pool } from './db/pool';
import { requireAuth } from './middleware/requireAuth';
import { logger } from './lib/logger';
import type { JobState } from 'bullmq';
import type { Notebook, DocumentRow, StreamEvent } from './types';

const UPLOAD_DIR = 'uploads/';
const MAX_FILE_BYTES = 200 * 1024 * 1024; // 200 MB
const MARKITDOWN_URL = process.env.MARKITDOWN_URL || 'http://localhost:8000';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: MAX_FILE_BYTES },
});

const app = express();

// ── Auth proxy (single-container mode; see Dockerfile + render.yaml) ─────────
// FIRST, before express.json(). In dev the Vite proxy forwards these (see
// frontend/vite.config.ts); when everything shares one container the API has to,
// so the browser stays on one origin and the auth cookies remain first-party.
//
// Two things this ordering gets right, both of which broke in testing:
//  1. Mounted at the root with pathFilter — NOT app.use('/auth', proxy), which
//     makes Express strip the mount path so the auth service receives /me
//     instead of /auth/me and 404s.
//  2. Above express.json() — a body parser consumes the stream, and the proxy
//     would then forward POSTs (login, register) with an empty body and hang.
if (process.env.AUTH_PROXY_TARGET) {
  const target = process.env.AUTH_PROXY_TARGET;
  // A predicate, not a glob: glob pathFilters silently matched nothing here and
  // every /auth request fell through to requireAuth as a 401. A regex is
  // unambiguous and easy to verify.
  const isAuthPath = (pathname: string) => /^\/(auth|mfa|oauth)(\/|$)/.test(pathname);

  app.use(
    createProxyMiddleware({
      target,
      pathFilter: (pathname: string) => isAuthPath(pathname),
      changeOrigin: false, // same-origin: preserve Host so cookies stay first-party
      xfwd: true,
    }),
  );
  logger.info({ target }, 'proxying /auth, /mfa, /oauth');
}

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ── Rate limiters ───────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
});

const askLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Ask rate limit reached — wait a moment.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Upload rate limit reached — wait a moment.' },
});

app.use(globalLimiter);

// ── Public endpoints (no auth) ──────────────────────────────────────────────

app.get('/hello', (_req: Request, res: Response) => {
  res.json({ msg: 'hello from server' });
});

app.get('/health', async (_req: Request, res: Response) => {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    await pool.query('SELECT 1');
    checks.db = 'ok';
  } catch {
    checks.db = 'error';
    healthy = false;
  }

  try {
    await axios.get(`${MARKITDOWN_URL}/health`, { timeout: 3_000 });
    checks.markitdown = 'ok';
  } catch {
    checks.markitdown = 'degraded';
    // non-fatal: workers can still ingest existing queue
  }

  try {
    const counts = await markdownQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
    checks.queue = 'ok';
    (checks as Record<string, unknown>).queueCounts = counts;
  } catch {
    checks.queue = 'error';
    healthy = false;
  }

  res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', checks });
});

// ── Single-container mode (see Dockerfile + render.yaml at the repo root) ────
// Registered BEFORE requireAuth on purpose: the sign-in screen and the JS
// bundle have to be reachable while logged out. requireAuth stays fail-closed —
// anything added after it is protected by default — so public surface must be
// declared up here explicitly. (The auth proxy is higher still, above the body
// parser.)

// Serve the built frontend from this process.
if (process.env.SERVE_FRONTEND === '1') {
  const dist = path.resolve(__dirname, '../frontend/dist');
  // index: false — the SPA routes below own index.html, so a request for "/"
  // can't bypass them.
  app.use(express.static(dist, { index: false, maxAge: '1h' }));

  // The SPA's client-side routes, listed rather than wildcarded. A catch-all
  // here would either shadow the API routes below or have to sit after
  // requireAuth, where it would 401. These four are every path Root() handles
  // (see frontend/src/main.tsx).
  app.get(['/', '/login', '/verify-email', '/reset-password'], (_req: Request, res: Response) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use(requireAuth);

// ── Notebooks ───────────────────────────────────────────────────────────────

app.get('/notebooks', async (req: Request, res: Response) => {
  const { rows } = await pool.query<Notebook>(
    `SELECT id, user_id AS "userId", name, created_at AS "createdAt"
     FROM notebooks WHERE user_id = $1 ORDER BY created_at ASC`,
    [req.user!.id],
  );
  res.json({ notebooks: rows });
});

app.post('/notebooks', async (req: Request, res: Response) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 100);
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  const { rows } = await pool.query<Notebook>(
    `INSERT INTO notebooks (user_id, name) VALUES ($1, $2)
     RETURNING id, user_id AS "userId", name, created_at AS "createdAt"`,
    [req.user!.id, name],
  );
  res.status(201).json({ notebook: rows[0] });
});

app.patch('/notebooks/:id', async (req: Request, res: Response) => {
  const name = String(req.body?.name ?? '').trim().slice(0, 100);
  if (!name) { res.status(400).json({ error: 'name is required' }); return; }
  const { rowCount } = await pool.query(
    `UPDATE notebooks SET name = $1 WHERE id = $2 AND user_id = $3`,
    [name, req.params.id, req.user!.id],
  );
  if (!rowCount) { res.status(404).json({ error: 'Notebook not found' }); return; }
  res.json({ ok: true });
});

app.delete('/notebooks/:id', async (req: Request, res: Response) => {
  const { rowCount } = await pool.query(
    `DELETE FROM notebooks WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user!.id],
  );
  if (!rowCount) { res.status(404).json({ error: 'Notebook not found' }); return; }
  res.json({ ok: true });
});

// ── Documents ───────────────────────────────────────────────────────────────

app.get('/notebooks/:id/documents', async (req: Request, res: Response) => {
  const nb = await pool.query(
    `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user!.id],
  );
  if (!nb.rowCount) { res.status(404).json({ error: 'Notebook not found' }); return; }

  const limit  = Math.min(Number(req.query.limit  ?? 50), 200);
  const offset = Math.max(Number(req.query.offset ?? 0),  0);

  const { rows } = await pool.query<DocumentRow>(
    `SELECT d.id, d.notebook_id AS "notebookId", d.filename,
            d.created_at AS "createdAt", COUNT(c.id)::int AS chunks
     FROM documents d
     LEFT JOIN chunks c ON c.document_id = d.id
     WHERE d.notebook_id = $1
     GROUP BY d.id ORDER BY d.created_at ASC
     LIMIT $2 OFFSET $3`,
    [req.params.id, limit, offset],
  );

  const { rows: [{ total }] } = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM documents WHERE notebook_id = $1`,
    [req.params.id],
  );

  res.json({ documents: rows, total, limit, offset });
});

app.delete('/documents/:id', async (req: Request, res: Response) => {
  const { rowCount } = await pool.query(
    `DELETE FROM documents d
     USING notebooks nb
     WHERE d.id = $1 AND d.notebook_id = nb.id AND nb.user_id = $2`,
    [req.params.id, req.user!.id],
  );
  if (!rowCount) { res.status(404).json({ error: 'Document not found' }); return; }
  res.json({ ok: true });
});

// ── PDF upload ──────────────────────────────────────────────────────────────

app.post('/pdfs', uploadLimiter, upload.any(), async (req: Request, res: Response) => {
  const notebookId = String(req.body?.notebookId ?? '').trim();
  if (!notebookId) { res.status(400).json({ error: 'notebookId is required' }); return; }

  const nb = await pool.query(
    `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2`,
    [notebookId, req.user!.id],
  );
  if (!nb.rowCount) { res.status(403).json({ error: 'Notebook not found' }); return; }

  const files = req.files as Express.Multer.File[] | undefined;
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No files uploaded.' });
    return;
  }

  const jobs = await Promise.all(
    files.map((file) =>
      markdownQueue.add(
        'convert',
        {
          filePath: file.path,
          originalName: file.originalname,
          notebookId,
          userId: req.user!.id,
          fileHash: '', // computed by worker after reading the file
        },
        defaultJobOptions,
      ),
    ),
  );

  logger.info({ userId: req.user!.id, notebookId, count: jobs.length }, 'queued upload jobs');
  res.json({ queued: jobs.length, jobIds: jobs.map((j) => j.id) });
});

// ── Ask (SSE streaming) ─────────────────────────────────────────────────────

app.post('/ask', askLimiter, async (req: Request, res: Response) => {
  const { question, notebookId, topN, rerank } = req.body ?? {};

  if (typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ error: 'question is required' }); return;
  }
  if (question.length > 2000) {
    res.status(400).json({ error: 'Question too long (max 2000 characters)' }); return;
  }
  if (!notebookId) {
    res.status(400).json({ error: 'notebookId is required' }); return;
  }

  const nb = await pool.query(
    `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2`,
    [notebookId, req.user!.id],
  );
  if (!nb.rowCount) { res.status(403).json({ error: 'Notebook not found' }); return; }

  // Switch to SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (payload: StreamEvent) => res.write(`data: ${JSON.stringify(payload)}\n\n`);

  try {
    for await (const event of streamQuestion(question.trim(), {
      notebookId: String(notebookId),
      topN: typeof topN === 'number' ? topN : undefined,
      rerank: rerank !== false,
    })) {
      send(event);
    }
  } catch (err) {
    logger.error({ err, userId: req.user!.id }, 'stream failed');
    send({ error: 'Failed to generate answer.' });
  } finally {
    res.end();
  }
});

// ── Reset ───────────────────────────────────────────────────────────────────

app.post('/reset', async (req: Request, res: Response) => {
  const notebookId = String(req.body?.notebookId ?? '').trim();
  if (!notebookId) { res.status(400).json({ error: 'notebookId is required' }); return; }

  const nb = await pool.query(
    `SELECT id FROM notebooks WHERE id = $1 AND user_id = $2`,
    [notebookId, req.user!.id],
  );
  if (!nb.rowCount) { res.status(403).json({ error: 'Notebook not found' }); return; }

  await pool.query(`DELETE FROM documents WHERE notebook_id = $1`, [notebookId]);
  res.json({ ok: true, message: 'Notebook cleared.' });
});

// ── Job status ──────────────────────────────────────────────────────────────

app.get('/jobs', async (req: Request, res: Response) => {
  const ids = String(req.query.ids ?? '').split(',').filter(Boolean);
  if (ids.length === 0) {
    const counts = await markdownQueue.getJobCounts('waiting', 'active', 'completed', 'failed');
    res.json({ counts });
    return;
  }
  const jobs = await Promise.all(ids.map((id) => markdownQueue.getJob(id)));
  const details = await Promise.all(
    jobs.map(async (job) => {
      if (!job) return { id: '', state: 'unknown' as JobState | 'unknown' };
      const state = await job.getState();
      return {
        id: job.id,
        name: job.data.originalName as string,
        state,
        progress: job.progress ?? null,
        failedReason: state === 'failed' ? job.failedReason : undefined,
      };
    }),
  );
  res.json({ jobs: details });
});

// ── Error handling ──────────────────────────────────────────────────────────

app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)` });
    } else {
      res.status(400).json({ error: `Upload error: ${err.code} (${err.message})` });
    }
    return;
  }
  logger.error({ err }, 'unhandled error');
  next(err);
});

export default app;
