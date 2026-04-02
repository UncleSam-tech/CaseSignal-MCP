import { z } from 'zod';
import { FieldOriginSchema } from '../shared/fieldOrigin.js';
import { FreshnessSchema } from '../shared/freshness.js';
import { ToolMetaSchema } from '../shared/meta.js';

const CaseUpdateSchema = z.object({
  entryNumber: z.number().nullable(),
  dateFiled: z.string().nullable(),
  updateType: z.enum(['filing', 'order', 'judgment', 'hearing', 'settlement', 'other']),
  digest: z.string(),
  documentCount: z.number().int().nonnegative(),
  origin: FieldOriginSchema,
});

export const ListCaseUpdatesOutputSchema = z.object({
  data: z.object({
    caseId: z.string(),
    caseName: z.string(),
    caseNumber: z.string(),
    courtName: z.string(),
    updates: z.array(CaseUpdateSchema),
    totalUpdates: z.number().int().nonnegative(),
    daysBack: z.number().int().positive(),
    limitations: z.array(z.string()),
  }),
  freshness: FreshnessSchema,
  _meta: ToolMetaSchema,
});
export type ListCaseUpdatesOutput = z.infer<typeof ListCaseUpdatesOutputSchema>;
