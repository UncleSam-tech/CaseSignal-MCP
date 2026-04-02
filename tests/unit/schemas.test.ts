import { describe, it, expect } from 'vitest';
import { SearchEntityLitigationInputSchema } from '../../src/schemas/input/searchEntityLitigation.js';
import { GetEntityRiskBriefInputSchema } from '../../src/schemas/input/getEntityRiskBrief.js';
import { CompareEntitiesLitigationInputSchema } from '../../src/schemas/input/compareEntitiesLitigation.js';
import { FreshnessSchema } from '../../src/schemas/shared/freshness.js';
import { RiskOutputSchema } from '../../src/schemas/shared/riskScore.js';

describe('SearchEntityLitigationInputSchema', () => {
  it('accepts valid input with defaults', () => {
    const result = SearchEntityLitigationInputSchema.parse({ entity_name: 'Acme Corp' });
    expect(result.entity_type).toBe('auto');
    expect(result.max_cases).toBe(10);
    expect(result.include_closed_cases).toBe(true);
  });

  it('rejects entity_name shorter than 2 chars', () => {
    expect(() => SearchEntityLitigationInputSchema.parse({ entity_name: 'A' })).toThrow();
  });
});

describe('GetEntityRiskBriefInputSchema', () => {
  it('accepts minimal valid input', () => {
    const result = GetEntityRiskBriefInputSchema.parse({ entity_name: 'Acme Corp' });
    expect(result.lookback_months).toBe(60);
    expect(result.risk_tolerance).toBe('medium');
  });
});

describe('CompareEntitiesLitigationInputSchema', () => {
  it('accepts 2 entities', () => {
    const result = CompareEntitiesLitigationInputSchema.parse({
      entities: ['Acme Corp', 'Widgets LLC'],
    });
    expect(result.entities).toHaveLength(2);
  });

  it('rejects fewer than 2 entities', () => {
    expect(() =>
      CompareEntitiesLitigationInputSchema.parse({ entities: ['Acme Corp'] })
    ).toThrow();
  });

  it('rejects more than 5 entities', () => {
    expect(() =>
      CompareEntitiesLitigationInputSchema.parse({
        entities: ['A', 'B', 'C', 'D', 'E', 'F'],
      })
    ).toThrow();
  });
});

describe('FreshnessSchema', () => {
  it('parses valid freshness object', () => {
    const result = FreshnessSchema.parse({
      generatedAt: new Date().toISOString(),
      sourceUpdatedAt: null,
      snapshotAgeSeconds: 0,
    });
    expect(result.snapshotAgeSeconds).toBe(0);
  });
});

describe('RiskOutputSchema', () => {
  it('parses valid risk output', () => {
    const result = RiskOutputSchema.parse({
      riskBand: 'moderate',
      riskScore: 45,
      scoreDrivers: [
        { category: 'active_case_count', label: 'active case count', impact: 0.12, evidence: '2 active cases' },
      ],
    });
    expect(result.riskBand).toBe('moderate');
  });

  it('rejects riskScore out of range', () => {
    expect(() =>
      RiskOutputSchema.parse({ riskBand: 'low', riskScore: 101, scoreDrivers: [] })
    ).toThrow();
  });
});
