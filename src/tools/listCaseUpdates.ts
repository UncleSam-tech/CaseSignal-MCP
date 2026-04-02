import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ListCaseUpdatesInputSchema } from '../schemas/input/listCaseUpdates.js';
import { ListCaseUpdatesOutputSchema } from '../schemas/output/listCaseUpdates.js';
import { getDocket, getDocketEntries } from '../services/courtlistener/pacerApi.js';
import { transformDocket, transformDocketEntry, classifyEntryType } from '../services/courtlistener/transforms.js';
import { buildMeta } from '../context/toolMeta.js';
import type { Freshness } from '../schemas/shared/freshness.js';

const TOOL_NAME = 'list_case_updates';

export function registerListCaseUpdates(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      title: 'List Case Updates',
      description:
        'Show recent docket activity for a federal case — ordered entries with type labels and short digests.',
      inputSchema: ListCaseUpdatesInputSchema,
      outputSchema: ListCaseUpdatesOutputSchema,
    },
    async (input) => {
      const startTime = Date.now();
      const docketId = parseInt(input.case_id, 10);

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.days_back);
      const afterDate = cutoff.toISOString().split('T')[0]!;

      const [rawDocket, entriesRes] = await Promise.all([
        getDocket(docketId),
        getDocketEntries(docketId, {
          orderBy: '-date_filed',
          limit: input.max_updates,
          after: afterDate,
        }),
      ]);

      const docket = transformDocket(rawDocket);
      const entries = entriesRes.results.map(transformDocketEntry);

      const now = new Date().toISOString();
      const freshness: Freshness = {
        generatedAt: now,
        sourceUpdatedAt: rawDocket.date_modified,
        snapshotAgeSeconds: 0,
      };

      const limitations: string[] = [];
      if (entriesRes.count > input.max_updates) {
        limitations.push(
          `Showing ${input.max_updates} of ${entriesRes.count} entries in the last ${input.days_back} days`
        );
      }

      const output = ListCaseUpdatesOutputSchema.parse({
        data: {
          caseId: docket.caseId,
          caseName: docket.caseName,
          caseNumber: docket.caseNumber,
          courtName: docket.courtName,
          updates: entries.map((e) => ({
            entryNumber: e.entryNumber,
            dateFiled: e.dateFiled,
            updateType: classifyEntryType(e.description),
            digest: e.description.slice(0, 300),
            documentCount: e.documentCount,
            origin: e.origin,
          })),
          totalUpdates: entries.length,
          daysBack: input.days_back,
          limitations,
        },
        freshness,
        _meta: buildMeta(TOOL_NAME, startTime, 'none'),
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(output) }],
        structuredContent: output,
      };
    }
  );
}
