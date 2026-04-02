import { z } from 'zod';

export const ConfidenceBandSchema = z.enum(['high', 'medium', 'low', 'excluded']);
export type ConfidenceBand = z.infer<typeof ConfidenceBandSchema>;

export const ConfidenceScoreSchema = z.number().min(0).max(1);

export const ConfidenceSchema = z.object({
  score: ConfidenceScoreSchema,
  band: ConfidenceBandSchema,
});
export type Confidence = z.infer<typeof ConfidenceSchema>;
