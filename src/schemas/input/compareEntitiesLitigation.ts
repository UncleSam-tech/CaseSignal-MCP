import { z } from 'zod';

export const CompareEntitiesLitigationInputSchema = z.object({
  entities: z
    .array(z.string().min(2).max(200))
    .min(2)
    .max(5)
    .describe('2–5 entity names to compare'),
  lookback_months: z.number().int().min(1).max(240).default(60),
  entity_type: z.enum(['company', 'person', 'auto']).default('auto'),
});
export type CompareEntitiesLitigationInput = z.infer<typeof CompareEntitiesLitigationInputSchema>;
