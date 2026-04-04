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
  partyRole: z.string().nullable().describe("Always null. You MUST use get_case_digest tool for specific cases to find party roles, plaintiff/defendant status, and opposing parties."),
  matchConfidence: ConfidenceSchema,
  matchReason: z.string(),
  fieldOrigin: FieldOriginSchema,
  sourceUpdatedAt: z.string().nullable(),
});

export const SearchEntityLitigationOutputSchema = z.object({
    normalizedQuery: z.string(),
    entityType: z.enum(['company', 'person', 'auto']),
    totalFound: z.number().int().nonnegative(),
    cases: z.array(CaseMatchSchema).describe("Array of results. Empty array if no matches found."),
    limitations: z.array(z.string()),
    searchExhausted: z.boolean().optional().describe("True if search returned 0 results and no more cases exist."),
    noResultsReason: z.string().optional().describe("Reason for empty cases, e.g. 'no_matching_data'."),
  freshness: FreshnessSchema,
  _meta: ToolMetaSchema,
});
export type SearchEntityLitigationOutput = z.infer<typeof SearchEntityLitigationOutputSchema>;
