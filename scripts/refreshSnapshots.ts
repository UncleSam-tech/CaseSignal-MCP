#!/usr/bin/env tsx
/**
 * scripts/refreshSnapshots.ts
 *
 * Manually trigger a snapshot refresh for stale entries.
 * Usage:
 *   npm run db:refresh-snapshots
 *   npx tsx scripts/refreshSnapshots.ts [--stale-only] [--dry-run] [--limit 50]
 *
 * Finds snapshots older than SNAPSHOT_TTL_SECONDS and re-enqueues them
 * via the BullMQ refresh queue for background re-fetch.
 */

import { config } from 'dotenv';
config();

import { Pool } from 'pg';
import { enqueueRefresh } from '../src/services/queues/refreshQueue.js';
import { closeRefreshQueue } from '../src/services/queues/refreshQueue.js';

const DATABASE_URL = process.env['DATABASE_URL'];
const SNAPSHOT_TTL_SECONDS = parseInt(process.env['SNAPSHOT_TTL_SECONDS'] ?? '3600', 10);

if (!DATABASE_URL) {
  console.error('❌  DATABASE_URL not set');
  process.exit(1);
}

// ─── CLI args ─────────────────────────────────────────────────
const args = process.argv.slice(2);
const staleOnly = args.includes('--stale-only');
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1] ?? '100', 10) : 100;

console.log(`🔄  refreshSnapshots starting`, {
  staleOnly,
  dryRun,
  limit,
  ttlSeconds: SNAPSHOT_TTL_SECONDS,
});

// ─── Main ─────────────────────────────────────────────────────
const pool = new Pool({ connectionString: DATABASE_URL });

async function run(): Promise<void> {
  const client = await pool.connect();

  try {
    // Select snapshots that are stale (older than TTL) or all if not stale-only
    const query = staleOnly
      ? `
          SELECT entity_key, tool_name, generated_at, ttl_seconds
          FROM snapshots
          WHERE generated_at < NOW() - (ttl_seconds || ' seconds')::INTERVAL
          ORDER BY generated_at ASC
          LIMIT $1
        `
      : `
          SELECT entity_key, tool_name, generated_at, ttl_seconds
          FROM snapshots
          ORDER BY generated_at ASC
          LIMIT $1
        `;

    const { rows } = await client.query<{
      entity_key: string;
      tool_name: string;
      generated_at: Date;
      ttl_seconds: number;
    }>(query, [limit]);

    console.log(`📋  Found ${rows.length} snapshot(s) to refresh`);

    if (dryRun) {
      for (const row of rows) {
        const ageSeconds = Math.floor((Date.now() - row.generated_at.getTime()) / 1000);
        console.log(`  [dry-run] would enqueue: ${row.entity_key} / ${row.tool_name}  (age: ${ageSeconds}s)`);
      }
      console.log('✅  Dry run complete — no jobs enqueued');
      return;
    }

    let enqueued = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        await enqueueRefresh({
          entityKey: row.entity_key,
          toolName: row.tool_name,
        });
        enqueued++;
        console.log(`  ✓ enqueued: ${row.entity_key} / ${row.tool_name}`);
      } catch (err) {
        skipped++;
        console.warn(`  ✗ failed to enqueue: ${row.entity_key} / ${row.tool_name}`, err);
      }
    }

    console.log(`\n✅  Done — enqueued: ${enqueued}, skipped: ${skipped}`);
  } finally {
    client.release();
    await pool.end();
    await closeRefreshQueue();
  }
}

run().catch((err) => {
  console.error('❌  refreshSnapshots failed:', err);
  process.exit(1);
});
