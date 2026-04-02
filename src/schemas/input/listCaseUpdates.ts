import { z } from 'zod';

export const ListCaseUpdatesInputSchema = z.object({
  case_id: z.string().describe('CaseSignal case ID or CourtListener docket ID'),
  days_back: z.number().int().min(1).max(365).default(30),
  max_updates: z.number().int().min(1).max(50).default(20),
});
export type ListCaseUpdatesInput = z.infer<typeof ListCaseUpdatesInputSchema>;
