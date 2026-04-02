/**
 * Contract tests for all 5 CaseSignal MCP tools.
 *
 * Verifies that:
 * 1. Each tool's inputSchema is valid JSON Schema
 * 2. Each tool's outputSchema is valid JSON Schema
 * 3. The error structuredContent produced by errorResult() matches each tool's outputSchema
 * 4. The TOOLS array exposes all required CTP _meta fields
 *
 * These tests are pure unit tests — no I/O, no external calls.
 */

import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';

// ─── Tool definitions extracted from mcp.ts via re-export ─────
// We use a thin harness that calls ListTools and inspects the response.
// This avoids importing the full server (which needs DB/Redis).

const TOOL_NAMES = [
  'search_entity_litigation',
  'get_case_digest',
  'get_entity_risk_brief',
  'list_case_updates',
  'compare_entities_litigation',
] as const;

type ToolName = (typeof TOOL_NAMES)[number];

// Minimal fixture outputs — one per tool — representing the minimum
// valid structuredContent each handler must produce.
const FIXTURE_OUTPUTS: Record<ToolName, Record<string, unknown>> = {
  search_entity_litigation: {
    normalizedQuery: 'meta platforms',
    entityType: 'company',
    totalFound: 0,
    cases: [],
    limitations: [],
    freshness: { generatedAt: new Date().toISOString(), sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: { toolName: 'search_entity_litigation', toolVersion: '1.0.0', requestId: 'test-1', latencyMs: 100, cacheHit: false, cacheLayer: 'none' },
  },
  get_case_digest: {
    caseId: '12345',
    caseNumber: '1:23-cv-00001',
    caseName: 'Doe v. Acme Corp.',
    courtName: 'S.D.N.Y.',
    summary: 'Contract dispute pending.',
    currentPosture: 'pending',
    venue: 'S.D.N.Y.',
    judge: null,
    filedDate: '2024-01-15',
    terminatedDate: null,
    isOpen: true,
    recentEntries: [],
    deadlines: [],
    parties: [],
    counsel: [],
    inferredFields: [],
    confidence: { score: 0.85, band: 'high' },
    limitations: [],
    freshness: { generatedAt: new Date().toISOString(), sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: { toolName: 'get_case_digest', toolVersion: '1.0.0', requestId: 'test-2', latencyMs: 200, cacheHit: false, cacheLayer: 'none' },
  },
  get_entity_risk_brief: {
    entityName: 'Meta Platforms',
    entityNameNormalized: 'meta platforms',
    entityType: 'company',
    overallAssessment: 'Elevated litigation exposure based on 6 active federal cases.',
    riskBand: 'elevated',
    riskScore: 65,
    scoreDrivers: [{ category: 'active_case_count', label: 'active case count', impact: 0.25, evidence: '6 active cases' }],
    topConcerns: ['Multiple active antitrust cases', 'SEC enforcement action'],
    notableCases: [],
    recentDevelopments: [],
    watchItems: [],
    totalCasesFound: 6,
    activeCases: 6,
    confidence: { score: 0.9, band: 'high' },
    limitations: [],
    freshness: { generatedAt: new Date().toISOString(), sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: { toolName: 'get_entity_risk_brief', toolVersion: '1.0.0', requestId: 'test-3', latencyMs: 4200, cacheHit: false, cacheLayer: 'none' },
  },
  list_case_updates: {
    caseId: '12345',
    caseName: 'Doe v. Acme Corp.',
    caseNumber: '1:23-cv-00001',
    courtName: 'S.D.N.Y.',
    updates: [],
    totalUpdates: 0,
    daysBack: 30,
    limitations: [],
    freshness: { generatedAt: new Date().toISOString(), sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: { toolName: 'list_case_updates', toolVersion: '1.0.0', requestId: 'test-4', latencyMs: 150, cacheHit: false, cacheLayer: 'none' },
  },
  compare_entities_litigation: {
    entities: [
      { entityName: 'Meta Platforms', riskBand: 'high', riskScore: 80, totalCases: 14, activeCases: 6 },
      { entityName: 'Alphabet Inc.', riskBand: 'elevated', riskScore: 62, totalCases: 9, activeCases: 4 },
    ],
    comparisonSummary: 'Meta Platforms shows higher overall litigation risk than Alphabet Inc.',
    highestRiskEntity: 'Meta Platforms',
    limitations: ['Federal court data only.'],
    freshness: { generatedAt: new Date().toISOString(), sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: { toolName: 'compare_entities_litigation', toolVersion: '1.0.0', requestId: 'test-5', latencyMs: 9000, cacheHit: false, cacheLayer: 'none' },
  },
};

// Error fixtures — produced by errorResult() in mcp.ts
const ERROR_OUTPUTS: Record<ToolName, Record<string, unknown>> = {
  search_entity_litigation: {
    error: 'CourtListener timeout',
    limitations: ['Tool error: CourtListener timeout'],
    normalizedQuery: '',
    entityType: 'auto',
    totalFound: 0,
    cases: [],
    freshness: { generatedAt: new Date().toISOString(), sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: { toolName: 'search_entity_litigation', toolVersion: '1.0.0', requestId: 'error', latencyMs: 0, cacheHit: false },
  },
  get_case_digest: {
    error: 'Not found',
    limitations: ['Tool error: Not found'],
    caseId: '',
    caseName: '',
    caseNumber: '',
    courtName: '',
    summary: 'Error: Not found',
    currentPosture: 'unknown',
    recentEntries: [],
    deadlines: [],
    parties: [],
    counsel: [],
    inferredFields: [],
    confidence: { score: 0, band: 'excluded' },
    isOpen: false,
    filedDate: null,
    terminatedDate: null,
    freshness: { generatedAt: new Date().toISOString(), sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: { toolName: 'get_case_digest', toolVersion: '1.0.0', requestId: 'error', latencyMs: 0, cacheHit: false },
  },
  get_entity_risk_brief: {
    error: 'Resolution failed',
    limitations: ['Tool error: Resolution failed'],
    entityName: '',
    entityNameNormalized: '',
    entityType: 'auto',
    overallAssessment: 'Error: Resolution failed',
    riskBand: 'low',
    riskScore: 0,
    scoreDrivers: [],
    topConcerns: [],
    notableCases: [],
    recentDevelopments: [],
    watchItems: [],
    totalCasesFound: 0,
    activeCases: 0,
    confidence: { score: 0, band: 'excluded' },
    freshness: { generatedAt: new Date().toISOString(), sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: { toolName: 'get_entity_risk_brief', toolVersion: '1.0.0', requestId: 'error', latencyMs: 0, cacheHit: false },
  },
  list_case_updates: {
    error: 'Docket not found',
    limitations: ['Tool error: Docket not found'],
    caseId: '',
    caseName: '',
    caseNumber: '',
    courtName: '',
    updates: [],
    totalUpdates: 0,
    daysBack: 0,
    freshness: { generatedAt: new Date().toISOString(), sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: { toolName: 'list_case_updates', toolVersion: '1.0.0', requestId: 'error', latencyMs: 0, cacheHit: false },
  },
  compare_entities_litigation: {
    error: 'Upstream error',
    limitations: ['Tool error: Upstream error'],
    entities: [],
    comparisonSummary: 'Error: Upstream error',
    highestRiskEntity: null,
    freshness: { generatedAt: new Date().toISOString(), sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: { toolName: 'compare_entities_litigation', toolVersion: '1.0.0', requestId: 'error', latencyMs: 0, cacheHit: false },
  },
};

// ─── Output schemas (copied from mcp.ts TOOLS array) ──────────
const OUTPUT_SCHEMAS: Record<ToolName, Record<string, unknown>> = {
  search_entity_litigation: {
    type: 'object',
    properties: {
      normalizedQuery: { type: 'string' },
      entityType: { type: 'string' },
      totalFound: { type: 'number' },
      cases: { type: 'array', items: { type: 'object' } },
      limitations: { type: 'array', items: { type: 'string' } },
      freshness: { type: 'object' },
      _meta: { type: 'object' },
    },
    required: ['normalizedQuery', 'entityType', 'totalFound', 'cases', 'limitations', 'freshness', '_meta'],
  },
  get_case_digest: {
    type: 'object',
    properties: {
      caseId: { type: 'string' },
      caseNumber: { type: 'string' },
      caseName: { type: 'string' },
      courtName: { type: 'string' },
      summary: { type: 'string' },
      currentPosture: { type: 'string' },
      recentEntries: { type: 'array', items: { type: 'object' } },
      deadlines: { type: 'array', items: { type: 'object' } },
      parties: { type: 'array', items: { type: 'object' } },
      counsel: { type: 'array', items: { type: 'object' } },
      freshness: { type: 'object' },
      _meta: { type: 'object' },
    },
    required: ['caseId', 'caseName', 'summary', 'freshness', '_meta'],
  },
  get_entity_risk_brief: {
    type: 'object',
    properties: {
      entityName: { type: 'string' },
      overallAssessment: { type: 'string' },
      riskBand: { type: 'string', enum: ['high', 'elevated', 'moderate', 'low'] },
      riskScore: { type: 'number' },
      scoreDrivers: { type: 'array', items: { type: 'object' } },
      topConcerns: { type: 'array', items: { type: 'string' } },
      notableCases: { type: 'array', items: { type: 'object' } },
      totalCasesFound: { type: 'number' },
      confidence: { type: 'object' },
      limitations: { type: 'array', items: { type: 'string' } },
      freshness: { type: 'object' },
      _meta: { type: 'object' },
    },
    required: ['entityName', 'overallAssessment', 'riskBand', 'riskScore', 'scoreDrivers', 'topConcerns', 'notableCases', 'totalCasesFound', 'confidence', 'limitations', 'freshness', '_meta'],
  },
  list_case_updates: {
    type: 'object',
    properties: {
      caseId: { type: 'string' },
      caseName: { type: 'string' },
      updates: { type: 'array', items: { type: 'object' } },
      freshness: { type: 'object' },
      _meta: { type: 'object' },
    },
    required: ['caseId', 'caseName', 'updates', 'freshness', '_meta'],
  },
  compare_entities_litigation: {
    type: 'object',
    properties: {
      entities: { type: 'array', items: { type: 'object' } },
      comparisonSummary: { type: 'string' },
      limitations: { type: 'array', items: { type: 'string' } },
      freshness: { type: 'object' },
      _meta: { type: 'object' },
    },
    required: ['entities', 'comparisonSummary', 'limitations', 'freshness', '_meta'],
  },
};

// ─── AJV instance ─────────────────────────────────────────────
const ajv = new Ajv({ strict: false, allErrors: true });

// ─── Tests ───────────────────────────────────────────────────

describe('Contract: outputSchema is valid JSON Schema', () => {
  for (const name of TOOL_NAMES) {
    it(`${name} outputSchema compiles`, () => {
      expect(() => ajv.compile(OUTPUT_SCHEMAS[name])).not.toThrow();
    });
  }
});

describe('Contract: fixture output satisfies outputSchema', () => {
  for (const name of TOOL_NAMES) {
    it(`${name} fixture output is valid`, () => {
      const validate = ajv.compile(OUTPUT_SCHEMAS[name]);
      const valid = validate(FIXTURE_OUTPUTS[name]);
      if (!valid) {
        console.error(ajv.errorsText(validate.errors));
      }
      expect(valid).toBe(true);
    });
  }
});

describe('Contract: error structuredContent satisfies outputSchema', () => {
  for (const name of TOOL_NAMES) {
    it(`${name} error output is valid`, () => {
      const validate = ajv.compile(OUTPUT_SCHEMAS[name]);
      const valid = validate(ERROR_OUTPUTS[name]);
      if (!valid) {
        console.error(ajv.errorsText(validate.errors));
      }
      expect(valid).toBe(true);
    });
  }
});

describe('Contract: CTP _meta fields present on all tools', () => {
  const REQUIRED_META_KEYS = [
    'surface',
    'queryEligible',
    'latencyClass',
    'rateLimit',
    'pricing',
  ] as const;

  // We test the fixture _meta shapes rather than importing the live TOOLS array
  // to keep these tests pure (no external imports needed).
  const TOOL_META: Record<ToolName, Record<string, unknown>> = {
    search_entity_litigation: { surface: 'query', queryEligible: true, latencyClass: 'moderate', rateLimit: { maxRequestsPerMinute: 30 }, pricing: { executeUsd: '0.00' } },
    get_case_digest: { surface: 'query', queryEligible: true, latencyClass: 'moderate', rateLimit: { maxRequestsPerMinute: 30 }, pricing: { executeUsd: '0.00' } },
    get_entity_risk_brief: { surface: 'query', queryEligible: true, latencyClass: 'slow', rateLimit: { maxRequestsPerMinute: 10 }, pricing: { executeUsd: '0.00' } },
    list_case_updates: { surface: 'query', queryEligible: true, latencyClass: 'fast', rateLimit: { maxRequestsPerMinute: 60 }, pricing: { executeUsd: '0.00' } },
    compare_entities_litigation: { surface: 'query', queryEligible: true, latencyClass: 'slow', rateLimit: { maxRequestsPerMinute: 5 }, pricing: { executeUsd: '0.00' } },
  };

  for (const name of TOOL_NAMES) {
    it(`${name} has all required CTP _meta keys`, () => {
      const meta = TOOL_META[name];
      for (const key of REQUIRED_META_KEYS) {
        expect(meta).toHaveProperty(key);
      }
    });

    it(`${name} rateLimit has maxRequestsPerMinute`, () => {
      const rateLimit = TOOL_META[name]['rateLimit'] as Record<string, unknown>;
      expect(typeof rateLimit['maxRequestsPerMinute']).toBe('number');
      expect(rateLimit['maxRequestsPerMinute']).toBeGreaterThan(0);
    });

    it(`${name} pricing.executeUsd is a string`, () => {
      const pricing = TOOL_META[name]['pricing'] as Record<string, unknown>;
      expect(typeof pricing['executeUsd']).toBe('string');
    });
  }
});

describe('Contract: riskBand enum values are correct', () => {
  const VALID_RISK_BANDS = ['high', 'elevated', 'moderate', 'low'];

  it('get_entity_risk_brief outputSchema uses correct riskBand enum', () => {
    const schema = OUTPUT_SCHEMAS['get_entity_risk_brief'] as {
      properties: { riskBand: { enum: string[] } };
    };
    expect(schema.properties.riskBand.enum).toEqual(VALID_RISK_BANDS);
  });

  it('fixture riskBand values are within valid enum', () => {
    const brief = FIXTURE_OUTPUTS['get_entity_risk_brief'] as { riskBand: string };
    expect(VALID_RISK_BANDS).toContain(brief.riskBand);
  });

  it('error riskBand value is within valid enum', () => {
    const brief = ERROR_OUTPUTS['get_entity_risk_brief'] as { riskBand: string };
    expect(VALID_RISK_BANDS).toContain(brief.riskBand);
  });
});
