import { z } from 'zod';

export const GetCaseDigestInputSchema = z
  .object({
    case_id: z.string().describe('CaseSignal case ID or CourtListener docket ID'),
    include_recent_entries: z.boolean().default(true),
    max_recent_entries: z.number().int().min(1).max(50).default(10),
    include_parties: z.boolean().default(true),
    include_counsel: z.boolean().default(true),
  });
export type GetCaseDigestInput = z.infer<typeof GetCaseDigestInputSchema>;
