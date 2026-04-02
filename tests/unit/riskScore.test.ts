import { describe, it, expect } from 'vitest';
import { computeRiskScore } from '../../src/services/ranking/riskScore.js';
import type { InternalDocket } from '../../src/services/courtlistener/transforms.js';

function makeDocket(overrides: Partial<InternalDocket> = {}): InternalDocket {
  return {
    caseId: '123',
    docketId: 123,
    caseNumber: '1:24-cv-00001',
    caseName: 'Plaintiff v. Defendant Corp',
    courtId: 'nysd',
    courtName: 'S.D.N.Y.',
    filedDate: '2023-01-15',
    terminatedDate: null,
    isOpen: true,
    judge: 'Hon. Jane Doe',
    judgeOrigin: 'observed',
    natureOfSuit: 'Contract',
    sourceUpdatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('computeRiskScore', () => {
  it('returns minimal risk for empty dockets', () => {
    const result = computeRiskScore([], 'Acme');
    expect(result.riskBand).toBe('low');
    expect(result.riskScore).toBe(0);
    expect(result.scoreDrivers.length).toBeGreaterThan(0);
  });

  it('returns higher score for more active cases', () => {
    const few = computeRiskScore([makeDocket()], 'Acme');
    const many = computeRiskScore(
      Array.from({ length: 10 }, (_, i) => makeDocket({ caseId: String(i) })),
      'Acme'
    );
    expect(many.riskScore).toBeGreaterThan(few.riskScore);
  });

  it('detects regulatory enforcement cases', () => {
    const regDocket = makeDocket({ caseName: 'United States v. Acme Corp' });
    const result = computeRiskScore([regDocket], 'Acme');
    const regDriver = result.scoreDrivers.find((d) => d.category === 'regulatory_enforcement');
    expect(regDriver).toBeDefined();
    expect(regDriver?.impact).toBeGreaterThan(0);
  });

  it('risk score is always 0–100', () => {
    const dockets = Array.from({ length: 20 }, (_, i) =>
      makeDocket({
        caseId: String(i),
        caseName: 'United States v. Big Corp Securities Class Action',
        isOpen: true,
      })
    );
    const result = computeRiskScore(dockets, 'Big Corp');
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.riskScore).toBeLessThanOrEqual(100);
  });

  it('returns score drivers sorted by impact descending', () => {
    const dockets = [makeDocket()];
    const result = computeRiskScore(dockets, 'Acme');
    const impacts = result.scoreDrivers.map((d) => d.impact);
    for (let i = 1; i < impacts.length; i++) {
      expect(impacts[i - 1]!).toBeGreaterThanOrEqual(impacts[i]!);
    }
  });
});
