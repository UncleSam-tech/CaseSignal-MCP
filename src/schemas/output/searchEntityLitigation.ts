import { z } from 'zod';
import { FieldOriginSchema } from '../shared/fieldOrigin.js';
import { ConfidenceSchema } from '../shared/confidence.js';
import { FreshnessSchema } from '../shared/freshness.js';
import { ToolMetaSchema } from '../shared/meta.js';

const CaseMatchSchema = z.object({
  caseId: z.string(),
  caseNumber: z.string(),
  caseName: z.string(),
  courtId: z.string(),
  courtName: z.string(),
  filedDate: z.string().nullable(),
  terminatedDate: z.string().nullable(),
  isOpen: z.boolean(),
  partyRole: z.string().nullable(),
  matchConfidence: ConfidenceSchema,
  matchReason: z.string(),
  fieldOrigin: FieldOriginSchema,
  sourceUpdatedAt: z.string().nullable(),
});

export const SearchEntityLitigationOutputSchema = z.object({
  data: z.object({
    normalizedQuery: z.string(),
    entityType: z.enum(['company', 'person', 'auto']),
    totalFound: z.number().int().nonnegative(),
    cases: z.array(CaseMatchSchema),
    limitations: z.array(z.string()),
  }),
  freshness: FreshnessSchema,
  _meta: ToolMetaSchema,
});
export type SearchEntityLitigationOutput = z.infer<typeof SearchEntityLitigationOutputSchema>;
