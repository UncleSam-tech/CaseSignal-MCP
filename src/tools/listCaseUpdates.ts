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

      let afterDate: string | undefined;
      if (input.days_back !== undefined) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - input.days_back);
        afterDate = cutoff.toISOString().split('T')[0]!;
      }

      const [rawDocket, entriesRes] = await Promise.all([
        getDocket(docketId),
        getDocketEntries(docketId, {
          orderBy: '-date_filed',
          limit: input.max_updates,
          after: afterDate,
        }).catch((err: any) => {
          if (err?.upstreamStatus === 403 || err?.message?.includes('403')) {
            return { count: 0, next: null, results: [], isRestricted: true };
          }
          throw err;
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
      const isRestricted = (entriesRes as any).isRestricted === true;
      if (isRestricted) {
        limitations.push('Docket entries restricted by CourtListener (403)');
      } else if (entriesRes.count > input.max_updates) {
        if (input.days_back !== undefined) {
          limitations.push(`Showing ${input.max_updates} of ${entriesRes.count} entries in the last ${input.days_back} days`);
        } else {
          limitations.push(`Showing newest ${input.max_updates} of ${entriesRes.count} total entries`);
        }
      }

      const output = ListCaseUpdatesOutputSchema.parse({
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
        daysBack: input.days_back ?? 0,
        searchExhausted: isRestricted ? true : undefined,
        noResultsReason: isRestricted ? 'access_restricted' : undefined,
        limitations,
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
