import { z } from 'zod';
import { ConfidenceSchema } from '../shared/confidence.js';
import { FreshnessSchema } from '../shared/freshness.js';
import { ToolMetaSchema } from '../shared/meta.js';
import { RiskBandSchema, ScoreDriverSchema } from '../shared/riskScore.js';

const EntitySummarySchema = z.object({
  entityName: z.string(),
  entityNameNormalized: z.string(),
  riskBand: RiskBandSchema,
  riskScore: z.number().int().min(0).max(100),
  scoreDrivers: z.array(ScoreDriverSchema),
  totalCases: z.number().int().nonnegative(),
  activeCases: z.number().int().nonnegative(),
  mostRecentActivity: z.string().nullable(),
  topConcern: z.string().nullable(),
  confidence: ConfidenceSchema,
  limitations: z.array(z.string()),
});

export const CompareEntitiesLitigationOutputSchema = z.object({
  data: z.object({
    entities: z.array(EntitySummarySchema),
    comparisonSummary: z.string(),
    highestRiskEntity: z.string().nullable(),
    limitations: z.array(z.string()),
  }),
  freshness: FreshnessSchema,
  _meta: ToolMetaSchema,
});
export type CompareEntitiesLitigationOutput = z.infer<typeof CompareEntitiesLitigationOutputSchema>;
