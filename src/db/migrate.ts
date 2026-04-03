import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Workaround for `dist` builds running from /opt/render/project/src/dist/ ...
const migrationsDir = join(process.cwd(), 'src/db/migrations');

/**
 * Run all pending migrations against the given connection string.
 * Idempotent — safe to call on every server startup.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new pg.Pool({ connectionString });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [file]);
      if (rows.length > 0) {
        console.log(`  skip  ${file}`);
        continue;
      }

      const sql = await readFile(join(migrationsDir, file), 'utf8');
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      console.log(`  apply ${file}`);
    }

    console.log('Migrations complete.');
  } finally {
    await pool.end();
  }
}
