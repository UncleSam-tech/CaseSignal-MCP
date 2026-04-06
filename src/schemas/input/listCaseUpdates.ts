import { z } from 'zod';

export const ListCaseUpdatesInputSchema = z.object({
  case_id: z.string().describe('CaseSignal case ID or CourtListener docket ID'),
  days_back: z.number().int().min(1).max(3650).optional().describe("Number of days back to search. Omit to fetch latest updates regardless of date."),
  max_updates: z.number().int().min(1).max(50).default(20),
});
export type ListCaseUpdatesInput = z.infer<typeof ListCaseUpdatesInputSchema>;
