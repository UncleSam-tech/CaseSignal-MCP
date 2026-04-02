import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SearchEntityLitigationInputSchema } from '../schemas/input/searchEntityLitigation.js';
import { SearchEntityLitigationOutputSchema } from '../schemas/output/searchEntityLitigation.js';
import { normalizeName } from '../services/entityResolution/normalizeName.js';
import { searchDocketsByParty } from '../services/courtlistener/pacerApi.js';
import { transformSearchHit } from '../services/courtlistener/transforms.js';
import { scoreSearchResults } from '../services/ranking/matchConfidence.js';
import { buildMeta } from '../context/toolMeta.js';
import { snapshotAgeSeconds } from '../utils/dates.js';
import type { Freshness } from '../schemas/shared/freshness.js';

const TOOL_NAME = 'search_entity_litigation';

export function registerSearchEntityLitigation(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      title: 'Search Entity Litigation',
      description:
        'Find likely federal cases involving a company or person. Returns ranked case matches with confidence scores.',
      inputSchema: SearchEntityLitigationInputSchema,
      outputSchema: SearchEntityLitigationOutputSchema,
    },
    async (input) => {
      const startTime = Date.now();
      const entityType = input.entity_type === 'auto' ? 'auto' : input.entity_type;
      const normalized = normalizeName(input.entity_name, entityType);

      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - input.lookback_months);
      const dateAfter = cutoff.toISOString().split('T')[0]!;

      const raw = await searchDocketsByParty({
        partyName: normalized.canonical,
        dateFiledAfter: dateAfter,
        limit: input.max_cases,
      });

      const summaries = raw.results.map(transformSearchHit);
      const scored = scoreSearchResults(normalized, summaries, entityType);
      const filtered = input.include_closed_cases ? scored : scored.filter((s) => s.isOpen);

      const now = new Date().toISOString();
      const freshness: Freshness = {
        generatedAt: now,
        sourceUpdatedAt: null,
        snapshotAgeSeconds: 0,
      };

      const output = SearchEntityLitigationOutputSchema.parse({
        data: {
          normalizedQuery: normalized.canonical,
          entityType: input.entity_type,
          totalFound: filtered.length,
          cases: filtered.map((s) => ({
            caseId: s.caseId,
            caseNumber: s.caseNumber,
            caseName: s.caseName,
            courtId: s.courtId,
            courtName: s.courtName,
            filedDate: s.filedDate,
            terminatedDate: s.terminatedDate,
            isOpen: s.isOpen,
            partyRole: null,
            matchConfidence: s.matchConfidence,
            matchReason: s.matchReason,
            fieldOrigin: 'observed' as const,
            sourceUpdatedAt: null,
          })),
          limitations:
            raw.count > input.max_cases
              ? [`Showing ${input.max_cases} of ${raw.count} total results. Increase max_cases to retrieve more.`]
              : [],
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
