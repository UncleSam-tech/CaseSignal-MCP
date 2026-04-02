import {
  RISK_SCORE_WEIGHTS,
  scoreToriskBand,
  type RiskDriverKey,
} from '../../config/features.js';
import type { InternalDocket } from '../courtlistener/transforms.js';
import type { RiskOutput, ScoreDriver } from '../../schemas/shared/riskScore.js';

const REGULATORY_FILERS = [
  'united states',
  'u.s.',
  'department of justice',
  'doj',
  'securities and exchange commission',
  'sec',
  'federal trade commission',
  'ftc',
  'consumer financial protection bureau',
  'cfpb',
  'commodity futures trading commission',
  'cftc',
  'office of the comptroller',
  'occ',
  'federal reserve',
  'fdic',
];

function isRegulatoryCase(docket: InternalDocket): boolean {
  const name = docket.caseName.toLowerCase();
  return REGULATORY_FILERS.some((f) => name.includes(f));
}

function isRecentlyFiled(docket: InternalDocket, cutoffYears = 2): boolean {
  if (!docket.filedDate) return false;
  const filed = new Date(docket.filedDate);
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - cutoffYears);
  return filed >= cutoff;
}

function computeDriverScore(key: RiskDriverKey, dockets: InternalDocket[]): {
  rawScore: number;
  evidence: string;
} {
  const total = dockets.length;
  if (total === 0) return { rawScore: 0, evidence: 'no cases found' };

  switch (key) {
    case 'active_case_count': {
      const active = dockets.filter((d) => d.isOpen).length;
      const rawScore = Math.min(1, active / 5); // 5+ active cases = max score
      return { rawScore, evidence: `${active} active case(s)` };
    }

    case 'adverse_judgment_rate': {
      // Without document analysis we can't determine outcomes reliably — flag as uncertain
      return {
        rawScore: 0.2,
        evidence: 'outcome data not available without document review (inferred)',
      };
    }

    case 'high_value_litigation': {
      // Proxy: class action language or large-scale nature
      const highValue = dockets.filter((d) => {
        const name = d.caseName.toLowerCase();
        return (
          name.includes('class action') ||
          name.includes('securities') ||
          name.includes('antitrust') ||
          name.includes('mass tort')
        );
      }).length;
      const rawScore = Math.min(1, highValue / 3);
      return { rawScore, evidence: `${highValue} high-value case indicator(s)` };
    }

    case 'regulatory_enforcement': {
      const regulatory = dockets.filter(isRegulatoryCase).length;
      const rawScore = Math.min(1, regulatory / 2);
      return { rawScore, evidence: `${regulatory} regulatory/enforcement case(s)` };
    }

    case 'recency': {
      const recent = dockets.filter((d) => isRecentlyFiled(d, 2)).length;
      const rawScore = Math.min(1, recent / 3);
      return { rawScore, evidence: `${recent} case(s) filed in past 2 years` };
    }

    case 'jurisdiction_breadth': {
      const courts = new Set(dockets.map((d) => d.courtId)).size;
      const rawScore = Math.min(1, (courts - 1) / 4); // 5+ distinct courts = max
      return { rawScore, evidence: `${courts} distinct court(s)` };
    }
  }
}

export function computeRiskScore(
  dockets: InternalDocket[],
  _entityName: string
): RiskOutput {
  if (dockets.length === 0) {
    return {
      riskBand: 'minimal',
      riskScore: 0,
      scoreDrivers: [
        {
          category: 'overall',
          label: 'No cases found',
          impact: 0,
          evidence: 'No federal litigation matched for this entity',
        },
      ],
    };
  }

  let weightedSum = 0;
  const drivers: ScoreDriver[] = [];

  for (const [key, weight] of Object.entries(RISK_SCORE_WEIGHTS) as [RiskDriverKey, number][]) {
    const { rawScore, evidence } = computeDriverScore(key, dockets);
    const contribution = rawScore * weight;
    weightedSum += contribution;

    drivers.push({
      category: key,
      label: key.replace(/_/g, ' '),
      impact: Math.round(contribution * 100) / 100,
      evidence,
    });
  }

  const riskScore = Math.round(Math.min(100, weightedSum * 100));
  const riskBand = scoreToriskBand(riskScore);

  return {
    riskBand,
    riskScore,
    scoreDrivers: drivers.sort((a, b) => b.impact - a.impact),
  };
}
