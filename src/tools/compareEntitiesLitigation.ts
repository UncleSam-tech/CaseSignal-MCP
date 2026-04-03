import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CompareEntitiesLitigationInputSchema } from '../schemas/input/compareEntitiesLitigation.js';
import { CompareEntitiesLitigationOutputSchema } from '../schemas/output/compareEntitiesLitigation.js';
import { buildEntityRiskBrief } from '../services/briefs/entityRiskBuilder.js';
import { buildMeta } from '../context/toolMeta.js';
import type { Freshness } from '../schemas/shared/freshness.js';

const TOOL_NAME = 'compare_entities_litigation';

export function registerCompareEntitiesLitigation(server: McpServer): void {
  server.registerTool(
    TOOL_NAME,
    {
      title: 'Compare Entities Litigation',
      description:
        'Compare federal litigation exposure across 2–5 companies or people side-by-side. Returns per-entity risk summaries and a comparison narrative.',
      inputSchema: CompareEntitiesLitigationInputSchema,
      outputSchema: CompareEntitiesLitigationOutputSchema,
    },
    async (input) => {
      const startTime = Date.now();

      // Run risk briefs in parallel for all entities
      const results = await Promise.allSettled(
        input.entities.map((name) =>
          buildEntityRiskBrief(
            {
              entity_name: name,
              entity_type: input.entity_type,
              lookback_months: input.lookback_months,
              risk_tolerance: 'medium',
              max_cases: 8,
            },
            buildMeta(TOOL_NAME, startTime, 'none')
          )
        )
      );

      const summaries = input.entities.map((name, i) => {
        const result = results[i];
        if (!result || result.status === 'rejected') {
          return {
            entityName: name,
            entityNameNormalized: name.toLowerCase(),
            riskBand: 'minimal' as const,
            riskScore: 0,
            scoreDrivers: [],
            totalCases: 0,
            activeCases: 0,
            mostRecentActivity: null,
            topConcern: null,
            confidence: { score: 0, band: 'excluded' as const },
            limitations: [`Failed to retrieve data for "${name}"`],
          };
        }

        const brief = result.value;
        const mostRecent = brief.notableCases[0]?.filedDate ?? null;

        return {
          entityName: brief.entityName,
          entityNameNormalized: brief.entityNameNormalized,
          riskBand: brief.riskBand,
          riskScore: brief.riskScore,
          scoreDrivers: brief.scoreDrivers,
          totalCases: brief.totalCasesFound,
          activeCases: brief.activeCases,
          mostRecentActivity: mostRecent,
          topConcern: brief.topConcerns[0] ?? null,
          confidence: brief.confidence,
          limitations: brief.limitations,
        };
      });

      const sorted = [...summaries].sort((a, b) => b.riskScore - a.riskScore);
      const highest = sorted[0];

      const now = new Date().toISOString();
      const freshness: Freshness = {
        generatedAt: now,
        sourceUpdatedAt: null,
        snapshotAgeSeconds: 0,
      };

      const output = CompareEntitiesLitigationOutputSchema.parse({
        entities: summaries,
        comparisonSummary: buildComparisonSummary(sorted),
        highestRiskEntity: highest?.entityName ?? null,
        limitations: [
          'Comparison is based on available federal court data only.',
          'Risk scores are heuristic indicators, not legal assessments.',
        ],
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

function buildComparisonSummary(
  sorted: Array<{ entityName: string; riskBand: string; riskScore: number; activeCases: number }>
): string {
  if (sorted.length === 0) return 'No entities to compare.';
  const top = sorted[0]!;
  const bottom = sorted[sorted.length - 1]!;
  if (top.entityName === bottom.entityName) {
    return `Only one entity assessed. ${top.entityName} shows ${top.riskBand} risk (score ${top.riskScore}).`;
  }
  return `Among the entities compared, ${top.entityName} shows the highest litigation risk (${top.riskBand}, score ${top.riskScore}) with ${top.activeCases} active case(s). ${bottom.entityName} shows the lowest risk (${bottom.riskBand}, score ${bottom.riskScore}).`;
}
