import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GetCaseDigestInputSchema } from '../schemas/input/getCaseDigest.js';
import { GetCaseDigestOutputSchema } from '../schemas/output/getCaseDigest.js';
import { buildCaseDigest } from '../services/briefs/caseDigestBuilder.js';
import { getSnapshot, setSnapshot } from '../services/cache/snapshotService.js';
import { buildMeta } from '../context/toolMeta.js';
import { snapshotAgeSeconds } from '../utils/dates.js';
import type { Freshness } from '../schemas/shared/freshness.js';
import type { GetCaseDigestOutput } from '../schemas/output/getCaseDigest.js';

const TOOL_NAME = 'get_case_digest';

export function registerGetCaseDigest(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      title: 'Get Case Digest',
      description:
        'Return a litigation digest for a single federal case — docket summary, posture, recent filings, parties, and counsel.',
      inputSchema: GetCaseDigestInputSchema,
      outputSchema: GetCaseDigestOutputSchema,
    },
    async (input) => {
      const startTime = Date.now();
      const docketId = parseInt(input.case_id, 10);
      const entityKey = `case:${docketId}`;

      // Check cache
      const cached = await getSnapshot<GetCaseDigestOutput>(entityKey, TOOL_NAME);
      if (cached) {
        const meta = buildMeta(TOOL_NAME, startTime, cached.cacheLayer);
        const output = { ...cached.data, _meta: meta };
        return {
          content: [{ type: 'text', text: JSON.stringify(output) }],
          structuredContent: output,
        };
      }

      const now = new Date().toISOString();
      const freshness: Freshness = {
        generatedAt: now,
        sourceUpdatedAt: null,
        snapshotAgeSeconds: 0,
      };
      const meta = buildMeta(TOOL_NAME, startTime, 'none');

      const output = await buildCaseDigest({
        docketId,
        maxRecentEntries: input.max_recent_entries,
        includeParties: input.include_parties,
        includeCounsel: input.include_counsel,
        freshness,
        meta,
      });

      await setSnapshot(entityKey, TOOL_NAME, output);

      const validated = GetCaseDigestOutputSchema.parse(output);
      return {
        content: [{ type: 'text', text: JSON.stringify(validated) }],
        structuredContent: validated,
      };
    }
  );
}
