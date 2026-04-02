import { normalizeName, type EntityType, type NormalizedName } from '../entityResolution/normalizeName.js';
import { scoreMatch, isAboveThreshold } from '../entityResolution/resolutionScorer.js';
import type { InternalDocketSummary } from '../courtlistener/transforms.js';
import type { Confidence } from '../../schemas/shared/confidence.js';

export type ScoredDocket = InternalDocketSummary & {
  matchConfidence: Confidence;
  matchReason: string;
};

export function scoreSearchResults(
  queryNormalized: NormalizedName,
  hits: InternalDocketSummary[],
  entityType: EntityType = 'auto'
): ScoredDocket[] {
  const scored: ScoredDocket[] = [];

  for (const hit of hits) {
    const result = scoreMatch(queryNormalized, hit.caseName, entityType);
    if (!isAboveThreshold(result.confidence.score)) continue;

    scored.push({
      ...hit,
      matchConfidence: result.confidence,
      matchReason: result.matchReason,
    });
  }

  return scored.sort((a, b) => b.matchConfidence.score - a.matchConfidence.score);
}

export function buildQueryNormalized(entityName: string, entityType: EntityType): NormalizedName {
  return normalizeName(entityName, entityType);
}
