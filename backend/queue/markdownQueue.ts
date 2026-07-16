import { Queue, type JobsOptions, type ConnectionOptions } from 'bullmq';
import { connection } from './connection';

// PDFs are enqueued here and processed one-by-one into Markdown by the worker.
export const MARKDOWN_QUEUE = 'pdf-to-markdown';

// bullmq bundles its own ioredis copy, so our Redis instance is structurally
// identical but a nominally different type — cast to bullmq's ConnectionOptions.
export const markdownQueue = new Queue(MARKDOWN_QUEUE, {
  connection: connection as ConnectionOptions,
});

// Default job options: retry transient failures with exponential backoff, and
// keep the queue from growing unbounded.
//
// The retry window has to outlast a cold start. MarkItDown spends ~30s loading
// the embedding model before it answers, and on a free host that sleeps
// (Spaces after 48h, Render after 15min) the first upload after a wake-up
// always lands in that window. The previous 3 attempts from a 2s base gave up
// after ~14s — every retry burned while the model was still loading, so the
// very first upload a visitor tried was silently lost.
//
// 5 attempts from a 5s base spans 5 + 10 + 20 + 40 ≈ 75s, which covers the
// model load and one 30s opening of the MarkItDown circuit breaker
// (see lib/circuit.ts).
export const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};
