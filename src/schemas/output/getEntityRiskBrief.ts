import { z } from 'zod';
import { FieldOriginSchema } from '../shared/fieldOrigin.js';
import { ConfidenceSchema } from '../shared/confidence.js';
import { FreshnessSchema } from '../shared/freshness.js';
import { ToolMetaSchema } from '../shared/meta.js';
import { RiskBandSchema, ScoreDriverSchema } from '../shared/riskScore.js';

const NotableCaseSchema = z.object({
  caseId: z.string(),
  caseName: z.string(),
  caseNumber: z.string(),
  courtName: z.string(),
  filedDate: z.string().nullable(),
  isOpen: z.boolean(),
  summary: z.string(),
  concern: z.string(),
  origin: FieldOriginSchema,
});

const WatchItemSchema = z.object({
  label: z.string(),
  detail: z.string(),
  date: z.string().nullable(),
  origin: FieldOriginSchema,
});

export const GetEntityRiskBriefOutputSchema = z.object({
    entityName: z.string(),
    entityNameNormalized: z.string(),
    entityType: z.enum(['company', 'person', 'auto']),
    overallAssessment: z.string(),
    riskBand: RiskBandSchema,
    riskScore: z.number().int().min(0).max(100),
    scoreDrivers: z.array(ScoreDriverSchema),
    topConcerns: z.array(z.string()),
    notableCases: z.array(NotableCaseSchema).describe("Array of notable cases. Empty array if no cases matched."),
    recentDevelopments: z.array(z.string()),
    watchItems: z.array(WatchItemSchema),
    totalCasesFound: z.number().int().nonnegative(),
    activeCases: z.number().int().nonnegative(),
    confidence: ConfidenceSchema,
    limitations: z.array(z.string()),
    searchExhausted: z.boolean().optional().describe("True if search returned 0 cases and no more cases exist."),
    noResultsReason: z.string().optional().describe("Reason for empty cases, e.g. 'no_matching_data'."),
  freshness: FreshnessSchema,
  _meta: ToolMetaSchema,
});
export type GetEntityRiskBriefOutput = z.infer<typeof GetEntityRiskBriefOutputSchema>;
