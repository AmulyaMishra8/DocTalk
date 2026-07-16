import { Queue, type JobsOptions, type ConnectionOptions } from 'bullmq';
import { connection } from './connection';

// PDFs are enqueued here and processed one-by-one into Markdown by the worker.
export const MARKDOWN_QUEUE = 'pdf-to-markdown';

// bullmq bundles its own ioredis copy, so our Redis instance is structurally
// identical but a nominally different type — cast to bullmq's ConnectionOptions.
export const markdownQueue = new Queue(MARKDOWN_QUEUE, {
  connection: connection as ConnectionOptions,
});

// Default job options: retry transient failures (e.g. MarkItDown briefly down)
// with exponential backoff, and keep the queue from growing unbounded.
export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: 100,
  removeOnFail: 500,
};
