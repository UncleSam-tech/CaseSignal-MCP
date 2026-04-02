import { z } from 'zod';

export const GetEntityRiskBriefInputSchema = z.object({
  entity_name: z.string().min(2).max(200),
  entity_type: z.enum(['company', 'person', 'auto']).default('auto'),
  lookback_months: z.number().int().min(1).max(240).default(60),
  domain_hint: z.string().optional(),
  risk_tolerance: z.enum(['low', 'medium', 'high']).default('medium'),
  max_cases: z.number().int().min(1).max(50).default(8),
});
export type GetEntityRiskBriefInput = z.infer<typeof GetEntityRiskBriefInputSchema>;
