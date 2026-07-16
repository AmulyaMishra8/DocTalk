import 'dotenv/config';
import app from './app';
import { pool } from './db/pool';
import { logger } from './lib/logger';

const port = process.env.PORT || 3000;

// Render's free tier has no background workers, and the single-container deploy
// has nowhere else to put one, so the worker can run inside the API process.
// Locally it stays a separate process (`npm run worker`) — a slow PDF conversion
// shouldn't compete with request handling unless it has to.
if (process.env.RUN_WORKER === '1') {
  import('./workers/markdownWorker.js')
    .then(() => logger.info('worker running in-process (RUN_WORKER=1)'))
    .catch((err) => logger.error({ err }, 'failed to start in-process worker'));
}

const server = app.listen(port, () => {
  logger.info({ port }, 'server started');
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down gracefully');
  server.close(async () => {
    await pool.end();
    logger.info('server closed');
    process.exit(0);
  });
  // Force exit if drain takes too long
  setTimeout(() => process.exit(1), 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
