import { z } from 'zod';
import { FieldOriginSchema } from '../shared/fieldOrigin.js';
import { ConfidenceSchema } from '../shared/confidence.js';
import { FreshnessSchema } from '../shared/freshness.js';
import { ToolMetaSchema } from '../shared/meta.js';

const PartySchema = z.object({
  name: z.string(),
  role: z.string(),
  origin: FieldOriginSchema,
});

const CounselSchema = z.object({
  name: z.string(),
  firm: z.string().nullable(),
  party: z.string().nullable(),
  origin: FieldOriginSchema,
});

const DocketEntrySchema = z.object({
  entryNumber: z.number().nullable(),
  dateFiled: z.string().nullable(),
  description: z.string(),
  documentCount: z.number().int().nonnegative(),
  origin: FieldOriginSchema,
});

const DeadlineSchema = z.object({
  label: z.string(),
  date: z.string(),
  origin: FieldOriginSchema,
});

export const GetCaseDigestOutputSchema = z.object({
  data: z.object({
    caseId: z.string(),
    caseNumber: z.string(),
    caseName: z.string(),
    courtId: z.string(),
    courtName: z.string(),
    summary: z.string(),
    currentPosture: z.string(),
    currentPostureOrigin: FieldOriginSchema,
    venue: z.string().nullable(),
    judge: z.string().nullable(),
    judgeOrigin: FieldOriginSchema,
    natureOfSuit: z.string().nullable(),
    filedDate: z.string().nullable(),
    terminatedDate: z.string().nullable(),
    isOpen: z.boolean(),
    latestActivityDate: z.string().nullable(),
    latestActivitySummary: z.string().nullable(),
    recentEntries: z.array(DocketEntrySchema),
    deadlines: z.array(DeadlineSchema),
    parties: z.array(PartySchema),
    counsel: z.array(CounselSchema),
    inferredFields: z.array(z.string()),
    confidence: ConfidenceSchema,
    limitations: z.array(z.string()),
  }),
  freshness: FreshnessSchema,
  _meta: ToolMetaSchema,
});
export type GetCaseDigestOutput = z.infer<typeof GetCaseDigestOutputSchema>;
