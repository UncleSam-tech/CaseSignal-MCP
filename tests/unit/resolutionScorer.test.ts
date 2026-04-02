import { describe, it, expect } from 'vitest';
import { scoreMatch, isAboveThreshold } from '../../src/services/entityResolution/resolutionScorer.js';
import { normalizeName } from '../../src/services/entityResolution/normalizeName.js';

describe('scoreMatch', () => {
  it('gives high confidence for exact match', () => {
    const query = normalizeName('Meta Platforms', 'company');
    const result = scoreMatch(query, 'Meta Platforms Inc', 'company');
    expect(result.confidence.score).toBeGreaterThanOrEqual(0.85);
    expect(result.confidence.band).toBe('high');
  });

  it('gives medium confidence for high token overlap', () => {
    const query = normalizeName('Apple Computer', 'company');
    const result = scoreMatch(query, 'Apple Computer Corp', 'company');
    expect(result.confidence.score).toBeGreaterThanOrEqual(0.75);
  });

  it('excludes weak matches below threshold', () => {
    const query = normalizeName('Microsoft', 'company');
    const result = scoreMatch(query, 'Totally Different Name', 'company');
    expect(isAboveThreshold(result.confidence.score)).toBe(false);
  });

  it('includes alias bonus in score', () => {
    const query = normalizeName('IBM', 'company');
    const withBonus = scoreMatch(query, 'IBM Corporation', 'company', 0.15);
    const withoutBonus = scoreMatch(query, 'IBM Corporation', 'company', 0);
    expect(withBonus.confidence.score).toBeGreaterThanOrEqual(withoutBonus.confidence.score);
  });

  it('match reason is non-empty', () => {
    const query = normalizeName('Tesla', 'company');
    const result = scoreMatch(query, 'Tesla Motors', 'company');
    expect(result.matchReason.length).toBeGreaterThan(0);
  });
});

describe('isAboveThreshold', () => {
  it('returns true for score >= 0.60', () => {
    expect(isAboveThreshold(0.6)).toBe(true);
    expect(isAboveThreshold(0.75)).toBe(true);
    expect(isAboveThreshold(0.95)).toBe(true);
  });

  it('returns false for score < 0.60', () => {
    expect(isAboveThreshold(0.59)).toBe(false);
    expect(isAboveThreshold(0)).toBe(false);
  });
});
