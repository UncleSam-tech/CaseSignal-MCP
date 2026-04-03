import { normalizeName } from '../entityResolution/normalizeName.js';
import { resolveAliases } from '../entityResolution/aliasResolver.js';
import { searchDocketsByParty, getDocket } from '../courtlistener/pacerApi.js';
import { transformDocket, transformSearchHit } from '../courtlistener/transforms.js';
import { scoreSearchResults } from '../ranking/matchConfidence.js';
import { computeRiskScore } from '../ranking/riskScore.js';
import { getSnapshot, setSnapshot } from '../cache/snapshotService.js';
import { enqueueRefresh } from '../queues/refreshQueue.js';
import env from '../../config/env.js';
import { snapshotAgeSeconds } from '../../utils/dates.js';
import type { GetEntityRiskBriefInput } from '../../schemas/input/getEntityRiskBrief.js';
import type { GetEntityRiskBriefOutput } from '../../schemas/output/getEntityRiskBrief.js';
import type { Freshness } from '../../schemas/shared/freshness.js';
import type { ToolMeta } from '../../schemas/shared/meta.js';
import type { InternalDocket } from '../courtlistener/transforms.js';
import { scoreToband } from '../../config/features.js';

const TOOL_NAME = 'get_entity_risk_brief';

export async function buildEntityRiskBrief(
  input: GetEntityRiskBriefInput,
  meta: ToolMeta
): Promise<GetEntityRiskBriefOutput> {
  const entityType = input.entity_type === 'auto' ? 'auto' : input.entity_type;
  const normalized = normalizeName(input.entity_name, entityType);
  const entityKey = normalized.canonical;

  // 1. Check snapshot cache
  const cached = await getSnapshot<GetEntityRiskBriefOutput>(entityKey, TOOL_NAME);
  if (cached) {
    const output = { ...cached.data, _meta: { ...cached.data._meta, ...meta, cacheHit: true, cacheLayer: cached.cacheLayer as 'redis' | 'postgres' } };
    return output;
  }

  // 2. Resolve aliases
  const aliases = await resolveAliases(normalized);
  const searchTerms = [normalized.canonical, ...aliases.map((a) => a.canonical)].slice(0, 3);

  // 3. Search CourtListener for each search term
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - input.lookback_months);
  const dateAfter = cutoffDate.toISOString().split('T')[0]!;

  const allHits = (
    await Promise.all(
      searchTerms.map((term) =>
        searchDocketsByParty({
          partyName: term,
          dateFiledAfter: dateAfter,
          limit: input.max_cases,
        }).catch(() => ({ count: 0, next: null, previous: null, results: [] }))
      )
    )
  ).flatMap((r) => r.results);

  // Deduplicate by docket ID
  const seen = new Set<number>();
  const uniqueHits = allHits.filter((h) => {
    if (seen.has(h.docket_id)) return false;
    seen.add(h.docket_id);
    return true;
  });

  // 4. Score and filter
  const summaries = uniqueHits.map(transformSearchHit);
  const scored = scoreSearchResults(normalized, summaries, entityType);
  const topScored = scored.slice(0, input.max_cases);

  // 5. Fetch full docket details (parallel, max 10 concurrent)
  const dockets: InternalDocket[] = [];
  const batchSize = 10;
  for (let i = 0; i < topScored.length; i += batchSize) {
    const batch = topScored.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((s) => getDocket(s.docketId).then(transformDocket))
    );
    for (const r of results) {
      if (r.status === 'fulfilled') dockets.push(r.value);
    }
  }

  // 6. Compute risk score
  const riskOutput = computeRiskScore(dockets, input.entity_name);

  // 7. Build notable cases
  const notableCases = topScored.slice(0, 5).map((s) => {
    const docket = dockets.find((d) => d.caseId === s.caseId);
    return {
      caseId: s.caseId,
      caseName: s.caseName,
      caseNumber: s.caseNumber,
      courtName: s.courtName,
      filedDate: s.filedDate,
      isOpen: s.isOpen,
      summary: `${s.caseName} — match confidence ${Math.round(s.matchConfidence.score * 100)}% (${s.matchConfidence.band})`,
      concern: s.matchReason,
      origin: 'observed' as const,
    };
  });

  // 8. Build output
  const now = new Date().toISOString();
  const latestSourceUpdate = dockets
    .map((d) => d.sourceUpdatedAt)
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? null;

  const overallConfidenceScore = topScored.length > 0
    ? topScored.reduce((sum, s) => sum + s.matchConfidence.score, 0) / topScored.length
    : 0;

  const limitations: string[] = [];
  if (topScored.length === 0) {
    limitations.push('No federal cases found matching this entity above confidence threshold');
  }
  if (dockets.length < topScored.length) {
    limitations.push(`Full docket details unavailable for ${topScored.length - dockets.length} case(s)`);
  }
  limitations.push(
    'Risk score is a heuristic indicator, not a legal assessment. Adverse judgment data requires document review.'
  );

  const freshness: Freshness = {
    generatedAt: now,
    sourceUpdatedAt: latestSourceUpdate,
    snapshotAgeSeconds: 0,
  };

  const searchExhausted = topScored.length === 0;

  const output: GetEntityRiskBriefOutput = {
    entityName: input.entity_name,
    entityNameNormalized: normalized.canonical,
    entityType: input.entity_type,
    overallAssessment: buildAssessment(riskOutput.riskBand, dockets.length, input.entity_name),
    riskBand: riskOutput.riskBand,
    riskScore: riskOutput.riskScore,
    scoreDrivers: riskOutput.scoreDrivers,
    topConcerns: riskOutput.scoreDrivers
      .filter((d) => d.impact > 0.05)
      .map((d) => `${d.label}: ${d.evidence}`),
    notableCases,
    recentDevelopments: buildRecentDevelopments(dockets),
    watchItems: [],
    totalCasesFound: topScored.length,
    activeCases: dockets.filter((d) => d.isOpen).length,
    confidence: {
      score: Math.round(overallConfidenceScore * 1000) / 1000,
      band: scoreToband(overallConfidenceScore),
    },
    limitations,
    searchExhausted,
    noResultsReason: searchExhausted ? 'no_matching_data' : undefined,
    freshness,
    _meta: { ...meta, cacheHit: false, cacheLayer: 'none' },
  };

  // 9. Cache result and schedule refresh
  await setSnapshot(entityKey, TOOL_NAME, output, latestSourceUpdate ? new Date(latestSourceUpdate) : undefined);
  await enqueueRefresh({ entityKey, toolName: TOOL_NAME }, env.SNAPSHOT_TTL_SECONDS * 1000);

  return output;
}

function buildAssessment(
  riskBand: string,
  caseCount: number,
  entityName: string
): string {
  if (caseCount === 0) {
    return `No federal litigation found for "${entityName}" above confidence threshold. This may indicate low litigation exposure or require manual verification with different name variants.`;
  }
  const bandLabel: Record<string, string> = {
    critical: 'Critical risk — significant active federal litigation identified.',
    high: 'Elevated risk — multiple notable federal cases identified.',
    medium: 'Moderate risk — some federal litigation activity identified.',
    low: 'Low risk — limited federal litigation activity identified.',
    minimal: 'Minimal risk — very limited or no significant federal litigation.',
  };
  return `${bandLabel[riskBand] ?? 'Risk level assessed.'} ${caseCount} case(s) matched.`;
}

function buildRecentDevelopments(dockets: InternalDocket[]): string[] {
  return dockets
    .filter((d) => d.isOpen)
    .sort((a, b) => (b.sourceUpdatedAt > a.sourceUpdatedAt ? 1 : -1))
    .slice(0, 3)
    .map((d) => `${d.caseName} (${d.courtName}) — last updated ${d.sourceUpdatedAt.split('T')[0]}`);
}
