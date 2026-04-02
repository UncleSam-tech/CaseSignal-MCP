import { z } from 'zod';

export const RiskBandSchema = z.enum(['critical', 'high', 'medium', 'low', 'minimal']);
export type RiskBand = z.infer<typeof RiskBandSchema>;

export const ScoreDriverSchema = z.object({
  category: z.string(),
  label: z.string(),
  impact: z.number().min(-1).max(1),
  evidence: z.string(),
});
export type ScoreDriver = z.infer<typeof ScoreDriverSchema>;

export const RiskOutputSchema = z.object({
  riskBand: RiskBandSchema,
  riskScore: z.number().int().min(0).max(100),
  scoreDrivers: z.array(ScoreDriverSchema),
});
export type RiskOutput = z.infer<typeof RiskOutputSchema>;
