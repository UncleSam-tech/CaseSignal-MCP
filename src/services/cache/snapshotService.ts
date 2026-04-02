import { getJson, setJson, deleteKey } from './redis.js';
import { query } from '../../db/client.js';
import env from '../../config/env.js';
import { snapshotAgeSeconds } from '../../utils/dates.js';

type SnapshotRow = {
  payload: unknown;
  generated_at: string;
  source_updated_at: string | null;
};

function redisKey(entityKey: string, toolName: string): string {
  return `snapshot:${entityKey}:${toolName}`;
}

export type SnapshotResult<T> = {
  data: T;
  generatedAt: string;
  sourceUpdatedAt: string | null;
  ageSeconds: number;
  cacheLayer: 'redis' | 'postgres';
};

export async function getSnapshot<T>(
  entityKey: string,
  toolName: string
): Promise<SnapshotResult<T> | null> {
  // 1. Redis hot cache
  type CachedEntry = { data: T; generatedAt: string; sourceUpdatedAt: string | null };
  const cached = await getJson<CachedEntry>(redisKey(entityKey, toolName));
  if (cached) {
    return {
      data: cached.data,
      generatedAt: cached.generatedAt,
      sourceUpdatedAt: cached.sourceUpdatedAt,
      ageSeconds: snapshotAgeSeconds(cached.generatedAt),
      cacheLayer: 'redis',
    };
  }

  // 2. Postgres warm cache
  const result = await query<SnapshotRow>(
    `SELECT payload, generated_at, source_updated_at, ttl_seconds
     FROM snapshots
     WHERE entity_key = $1 AND tool_name = $2
       AND (generated_at + (ttl_seconds || ' seconds')::interval) > NOW()`,
    [entityKey, toolName]
  );

  const row = result.rows[0];
  if (!row) return null;

  const data = row.payload as T;
  const generatedAt = new Date(row.generated_at).toISOString();
  const sourceUpdatedAt = row.source_updated_at
    ? new Date(row.source_updated_at).toISOString()
    : null;

  // Backfill Redis from Postgres
  const warmTtl = Math.floor(env.WARM_CACHE_TTL_SECONDS / 4);
  await setJson(redisKey(entityKey, toolName), { data, generatedAt, sourceUpdatedAt }, warmTtl);

  return {
    data,
    generatedAt,
    sourceUpdatedAt,
    ageSeconds: snapshotAgeSeconds(generatedAt),
    cacheLayer: 'postgres',
  };
}

export async function setSnapshot<T>(
  entityKey: string,
  toolName: string,
  data: T,
  sourceUpdatedAt?: Date
): Promise<void> {
  const generatedAt = new Date().toISOString();
  const ttl = env.SNAPSHOT_TTL_SECONDS;
  const warmTtl = Math.floor(ttl / 4);

  // Write Redis
  await setJson(
    redisKey(entityKey, toolName),
    { data, generatedAt, sourceUpdatedAt: sourceUpdatedAt?.toISOString() ?? null },
    warmTtl
  );

  // Upsert Postgres
  await query(
    `INSERT INTO snapshots (entity_key, tool_name, payload, generated_at, source_updated_at, ttl_seconds)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6)
     ON CONFLICT (entity_key, tool_name)
     DO UPDATE SET payload = EXCLUDED.payload,
                   generated_at = EXCLUDED.generated_at,
                   source_updated_at = EXCLUDED.source_updated_at,
                   ttl_seconds = EXCLUDED.ttl_seconds`,
    [
      entityKey,
      toolName,
      JSON.stringify(data),
      generatedAt,
      sourceUpdatedAt?.toISOString() ?? null,
      ttl,
    ]
  );
}

export async function invalidateSnapshot(entityKey: string, toolName?: string): Promise<void> {
  if (toolName) {
    await deleteKey(redisKey(entityKey, toolName));
    await query('DELETE FROM snapshots WHERE entity_key = $1 AND tool_name = $2', [
      entityKey,
      toolName,
    ]);
  } else {
    // Invalidate all tools for entity — Redis keys require per-key delete
    const rows = await query<{ tool_name: string }>(
      'SELECT tool_name FROM snapshots WHERE entity_key = $1',
      [entityKey]
    );
    for (const row of rows.rows) {
      await deleteKey(redisKey(entityKey, row.tool_name));
    }
    await query('DELETE FROM snapshots WHERE entity_key = $1', [entityKey]);
  }
}
