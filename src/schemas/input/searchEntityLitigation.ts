import { z } from 'zod';

export const SearchEntityLitigationInputSchema = z.object({
  entity_name: z.string().min(2).max(200).describe('Name of the company or person to search'),
  entity_type: z
    .enum(['company', 'person', 'auto'])
    .default('auto')
    .describe('Entity type — auto attempts to detect'),
  jurisdiction: z.literal('federal').default('federal'),
  lookback_months: z.number().int().min(1).max(240).default(60),
  max_cases: z.number().int().min(1).max(50).default(10),
  include_closed_cases: z.boolean().default(true),
  domain_hint: z.string().optional().describe('Domain name hint for disambiguation'),
});
export type SearchEntityLitigationInput = z.infer<typeof SearchEntityLitigationInputSchema>;
