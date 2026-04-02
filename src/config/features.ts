export const CONFIDENCE_BANDS = {
  HIGH: 0.9,
  MEDIUM: 0.75,
  LOW: 0.6,
  EXCLUDE_BELOW: 0.6,
} as const;

export type ConfidenceBand = 'high' | 'medium' | 'low' | 'excluded';

export function scoreToband(score: number): ConfidenceBand {
  if (score >= CONFIDENCE_BANDS.HIGH) return 'high';
  if (score >= CONFIDENCE_BANDS.MEDIUM) return 'medium';
  if (score >= CONFIDENCE_BANDS.LOW) return 'low';
  return 'excluded';
}

export const RISK_SCORE_WEIGHTS = {
  active_case_count: 0.25,
  adverse_judgment_rate: 0.25,
  high_value_litigation: 0.2,
  regulatory_enforcement: 0.15,
  recency: 0.1,
  jurisdiction_breadth: 0.05,
} as const;

export type RiskDriverKey = keyof typeof RISK_SCORE_WEIGHTS;

export const RISK_BANDS = {
  HIGH: 80,
  ELEVATED: 60,
  MODERATE: 40,
} as const;

export type RiskBand = 'high' | 'elevated' | 'moderate' | 'low';

export function scoreToriskBand(score: number): RiskBand {
  if (score >= RISK_BANDS.HIGH) return 'high';
  if (score >= RISK_BANDS.ELEVATED) return 'elevated';
  if (score >= RISK_BANDS.MODERATE) return 'moderate';
  return 'low';
}

export const MAX_ENTITIES_COMPARE = 5;

export const CIRCUIT_BREAKER = {
  FAILURE_THRESHOLD: 5,
  OPEN_TTL_SECONDS: 60,
} as const;

export const COURTLISTENER_RATE_LIMIT = {
  REQUESTS_PER_MINUTE: 100,
  REQUESTS_PER_DAY: 5000,
} as const;
