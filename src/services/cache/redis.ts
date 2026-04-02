import { Redis } from 'ioredis';
import env from '../../config/env.js';
import logger from '../../utils/logger.js';

const KEY_PREFIX = 'cs:';

let client: Redis | null = null;

export function getRedisClient(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => Math.min(times * 100, 2000),
    });

    client.on('error', (err: Error) => {
      logger.error('Redis error', { err });
    });
  }
  return client;
}

function prefixKey(key: string): string {
  return `${KEY_PREFIX}${key}`;
}

export async function getJson<T>(key: string): Promise<T | null> {
  const raw = await getRedisClient().get(prefixKey(key));
  if (!raw) return null;
  return JSON.parse(raw) as T;
}

export async function setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  await getRedisClient().set(prefixKey(key), JSON.stringify(value), 'EX', ttlSeconds);
}

export async function deleteKey(key: string): Promise<void> {
  await getRedisClient().del(prefixKey(key));
}

export async function incrementKey(key: string, ttlSeconds: number): Promise<number> {
  const r = getRedisClient();
  const count = await r.incr(prefixKey(key));
  if (count === 1) await r.expire(prefixKey(key), ttlSeconds);
  return count;
}

export async function testRedisConnection(): Promise<void> {
  await getRedisClient().ping();
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
  }
}
