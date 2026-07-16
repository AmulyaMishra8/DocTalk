import IORedis from 'ioredis';

// Shared Redis connection for both the queue (producer) and the worker.
// BullMQ requires `maxRetriesPerRequest: null` on the connection it uses.
export const connection = new IORedis(
  process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  { maxRetriesPerRequest: null },
);

connection.on('error', (err) => {
  console.error('[redis] connection error:', err.message);
});
