import { CONFIDENCE_BANDS, scoreToband, type ConfidenceBand } from '../../config/features.js';
import { normalizeName, type NormalizedName, type EntityType } from './normalizeName.js';
import type { Confidence } from '../../schemas/shared/confidence.js';

/** Percentage of query tokens found in candidate tokens */
function tokenOverlapCoverage(queryTokens: string[], candidateTokens: string[]): number {
  if (queryTokens.length === 0) return 1;
  const setCandidate = new Set(candidateTokens);
  let intersection = 0;
  for (const token of queryTokens) {
    if (setCandidate.has(token)) intersection++;
  }
  return intersection / queryTokens.length;
}

export type ScoredMatch = {
  confidence: Confidence;
  matchReason: string;
};

export function scoreMatch(
  queryNormalized: NormalizedName,
  candidateName: string,
  entityType: EntityType = 'auto',
  aliasBonus = 0
): ScoredMatch {
  const candidateNormalized = normalizeName(candidateName, entityType);
  const overlap = tokenOverlapCoverage(queryNormalized.tokens, candidateNormalized.tokens);

  let score: number;
  let reason: string;

  if (queryNormalized.canonical === candidateNormalized.canonical) {
    score = 0.9;
    reason = 'exact_canonical_match';
  } else if (overlap >= 0.8) {
    score = 0.8;
    reason = `high_token_overlap (${Math.round(overlap * 100)}%)`;
  } else if (overlap >= 0.6) {
    score = 0.7;
    reason = `medium_token_overlap (${Math.round(overlap * 100)}%)`;
  } else if (overlap >= 0.4) {
    score = 0.62;
    reason = `low_token_overlap (${Math.round(overlap * 100)}%)`;
  } else {
    score = 0.3;
    reason = `weak_match (${Math.round(overlap * 100)}%)`;
  }

  // Suffix-only difference bonus
  const queryCore = queryNormalized.canonical;
  const candidateCore = candidateNormalized.canonical;
  if (
    score < 0.9 &&
    (queryCore.startsWith(candidateCore) || candidateCore.startsWith(queryCore))
  ) {
    score = Math.min(1, score + 0.05);
    reason += '+suffix_variant';
  }

  // Alias bonus
  if (aliasBonus > 0) {
    score = Math.min(1, score + aliasBonus);
    reason += '+alias';
  }

  const band: ConfidenceBand = scoreToband(score);

  return {
    confidence: { score: Math.round(score * 1000) / 1000, band },
    matchReason: reason,
  };
}

export function isAboveThreshold(score: number): boolean {
  return score >= CONFIDENCE_BANDS.EXCLUDE_BELOW;
}
