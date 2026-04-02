import { z } from 'zod';

export const ToolMetaSchema = z.object({
  toolName: z.string(),
  toolVersion: z.string(),
  requestId: z.string().uuid(),
  latencyMs: z.number().int().nonnegative(),
  cacheHit: z.boolean(),
  cacheLayer: z.enum(['redis', 'postgres', 'none']).optional(),
});
export type ToolMeta = z.infer<typeof ToolMetaSchema>;
