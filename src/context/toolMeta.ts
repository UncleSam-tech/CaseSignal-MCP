import { randomUUID } from 'crypto';
import env from '../config/env.js';
import type { ToolMeta } from '../schemas/shared/meta.js';

export function buildMeta(
  toolName: string,
  startTime: number,
  cacheLayer: 'redis' | 'postgres' | 'none'
): ToolMeta {
  return {
    toolName,
    toolVersion: env.MCP_SERVER_VERSION,
    requestId: randomUUID(),
    latencyMs: Date.now() - startTime,
    cacheHit: cacheLayer !== 'none',
    cacheLayer,
  };
}
