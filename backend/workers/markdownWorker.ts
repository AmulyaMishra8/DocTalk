import 'dotenv/config';

import fs from 'fs';
import crypto from 'crypto';
import axios from 'axios';
import FormData from 'form-data';
import { Worker, type Job, type ConnectionOptions } from 'bullmq';
import { connection } from '../queue/connection';
import { MARKDOWN_QUEUE } from '../queue/markdownQueue';
import { ingestMarkdown } from '../services/ingest';
import { pool } from '../db/pool';
import { logger } from '../lib/logger';
import { withCircuit } from '../lib/circuit';
import type { MarkdownJobData, IngestResult, ConvertResult } from '../types';

const MARKITDOWN_URL = process.env.MARKITDOWN_URL || 'http://localhost:8000';

async function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash   = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end',  ()  => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function validatePdf(filePath: string): Promise<boolean> {
  const fd  = await fs.promises.open(filePath, 'r');
  try {
    const buf = Buffer.alloc(4);
    await fd.read(buf, 0, 4, 0);
    return buf.toString('ascii', 0, 4) === '%PDF';
  } finally {
    await fd.close();
  }
}

async function convertPdfToMarkdown(filePath: string, originalName: string): Promise<ConvertResult> {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), originalName);
  const target = `${MARKITDOWN_URL}/convert`;
  try {
    const { data } = await withCircuit('markitdown', () =>
      axios.post<ConvertResult>(target, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 600_000,
        proxy: false,
      }),
    );
    return data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      logger.error(
        { originalName, status: err.response?.status, body: err.response?.data },
        'markitdown convert failed',
      );
    }
    throw err;
  }
}

const worker = new Worker<MarkdownJobData, IngestResult>(
  MARKDOWN_QUEUE,
  async (job: Job<MarkdownJobData, IngestResult>) => {
    const { filePath, originalName, notebookId, userId } = job.data;
    logger.info({ originalName, jobId: job.id }, 'ingesting file');

    let keepFile = false;
    try {
      // 1. Validate it's actually a PDF
      const isPdf = await validatePdf(filePath);
      if (!isPdf) throw new Error(`"${originalName}" is not a valid PDF file`);

      // 2. Deduplication check
      await job.updateProgress({ step: 'converting', current: 0, total: 0, chunks: 0 });
      const fileHash = await computeFileHash(filePath);

      const { rowCount: isDup } = await pool.query(
        'SELECT 1 FROM documents WHERE notebook_id = $1 AND file_hash = $2',
        [notebookId, fileHash],
      );
      if (isDup) {
        logger.info({ originalName, notebookId }, 'duplicate file, skipping');
        await job.updateProgress({ step: 'done', current: 0, total: 0, chunks: 0 });
        return { filename: originalName, documentId: null, chunks: 0, duplicate: true };
      }

      // 3. PDF → Markdown
      const result = await convertPdfToMarkdown(filePath, originalName);

      // 4. Markdown → chunks → embeddings → vectors
      await job.updateProgress({ step: 'chunking', current: 0, total: 0, chunks: 0 });
      const ingested = await ingestMarkdown(
        result.filename,
        result.markdown || '',
        notebookId,
        userId,
        fileHash,
        async (step, current, total) => {
          await job.updateProgress({ step, current, total, chunks: total });
        },
      );

      if (ingested.chunks === 0) {
        logger.warn({ originalName }, 'file produced no text chunks');
      } else {
        logger.info({ originalName, docId: ingested.documentId, chunks: ingested.chunks }, 'stored');
      }

      await job.updateProgress({
        step: 'done',
        current: ingested.chunks,
        total: ingested.chunks,
        chunks: ingested.chunks,
      });
      return ingested;
    } catch (err) {
      const attemptsLeft = (job.opts.attempts || 1) - (job.attemptsMade + 1);
      keepFile = attemptsLeft > 0;
      throw err;
    } finally {
      if (!keepFile) {
        fs.promises.unlink(filePath).catch(() => {});
      }
    }
  },
  { connection: connection as ConnectionOptions, concurrency: 3 },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id }, 'job completed');
});

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'job failed');
});

logger.info({ queue: MARKDOWN_QUEUE, markitdown: MARKITDOWN_URL }, 'worker started');

async function shutdown(signal: string) {
  logger.info({ signal }, 'worker shutting down');
  await worker.close();
  await pool.end();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

export { worker };
