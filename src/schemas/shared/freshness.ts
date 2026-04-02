import { z } from 'zod';

export const FreshnessSchema = z.object({
  generatedAt: z.string().datetime(),
  sourceUpdatedAt: z.string().datetime().nullable(),
  snapshotAgeSeconds: z.number().int().nonnegative(),
});
export type Freshness = z.infer<typeof FreshnessSchema>;
