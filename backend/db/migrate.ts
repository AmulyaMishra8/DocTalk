import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pool } from './pool';

async function migrate(): Promise<void> {
  // Versioned migration tracker — created once, never dropped.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const { rows } = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations ORDER BY version',
  );
  const applied = new Set(rows.map((r) => r.version));

  // First run on a DB that was created before versioned migrations were
  // introduced: tables already exist, so seed v001 as applied and skip it.
  if (applied.size === 0) {
    const { rowCount } = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notebooks'",
    );
    if (rowCount) {
      await pool.query(
        "INSERT INTO schema_migrations (version) VALUES ('001_initial.sql') ON CONFLICT DO NOTHING",
      );
      applied.add('001_initial.sql');
      console.log('[migrate] seeded 001_initial.sql (pre-existing DB)');
    }
  }

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] skip  ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (version) VALUES ($1)', [file]);
    console.log(`[migrate] apply ${file}`);
  }

  console.log('[migrate] done');
  await pool.end();
}

migrate().catch((err: unknown) => {
  console.error('[migrate] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
