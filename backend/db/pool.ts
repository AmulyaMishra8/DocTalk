import { Pool } from 'pg';

// Shared Postgres (pgvector) connection pool.
export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://neuralhire:neuralhire@127.0.0.1:5432/neuralhire',
});

pool.on('error', (err) => {
  console.error('[pg] pool error:', err.message);
});
