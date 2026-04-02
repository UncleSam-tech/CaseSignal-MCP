import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import env from '../config/env.js';
import { normalizeName } from '../services/entityResolution/normalizeName.js';
import { searchDocketsByParty } from '../services/courtlistener/pacerApi.js';
import { transformSearchHit, transformDocket } from '../services/courtlistener/transforms.js';
import { scoreSearchResults } from '../services/ranking/matchConfidence.js';
import { buildEntityRiskBrief } from '../services/briefs/entityRiskBuilder.js';
import { buildCaseDigest } from '../services/briefs/caseDigestBuilder.js';
import { getDocket, getDocketEntries } from '../services/courtlistener/pacerApi.js';
import { classifyEntryType } from '../services/courtlistener/transforms.js';
import { getSnapshot, setSnapshot } from '../services/cache/snapshotService.js';
import { buildMeta } from '../context/toolMeta.js';
import { snapshotAgeSeconds } from '../utils/dates.js';
import logger from '../utils/logger.js';

// ─── Tool definitions with CTP _meta ──────────────────────────

const TOOLS = [
  {
    name: 'search_entity_litigation',
    description:
      'Find likely federal cases involving a company or person. Returns ranked case matches with confidence scores, match reasons, and freshness metadata.',
    _meta: {
      surface: 'query',
      queryEligible: true,
      latencyClass: 'moderate',
      rateLimit: {
        maxRequestsPerMinute: 30,
        cooldownMs: 2000,
        maxConcurrency: 5,
        notes: 'Limited by CourtListener API rate limits.',
      },
      pricing: { executeUsd: '0.00' },
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        entity_name: { type: 'string', description: 'Company or person name to search' },
        entity_type: {
          type: 'string',
          enum: ['company', 'person', 'auto'],
          default: 'auto',
        },
        jurisdiction: { type: 'string', enum: ['federal'], default: 'federal' },
        lookback_months: { type: 'number', default: 60 },
        max_cases: { type: 'number', default: 10 },
        include_closed_cases: { type: 'boolean', default: true },
        domain_hint: { type: 'string' },
      },
      required: ['entity_name'],
    },
    outputSchema: {
      type: 'object' as const,
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
  },
  {
    name: 'get_case_digest',
    description:
      'Return a full litigation digest for a single federal case — docket summary, current posture, venue, judge, recent filings, parties, and counsel.',
    _meta: {
      surface: 'query',
      queryEligible: true,
      latencyClass: 'moderate',
      rateLimit: {
        maxRequestsPerMinute: 30,
        cooldownMs: 2000,
        maxConcurrency: 5,
      },
      pricing: { executeUsd: '0.00' },
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        case_id: { type: 'string', description: 'CourtListener docket ID' },
        include_recent_entries: { type: 'boolean', default: true },
        max_recent_entries: { type: 'number', default: 10 },
        include_parties: { type: 'boolean', default: true },
        include_counsel: { type: 'boolean', default: true },
      },
      required: ['case_id'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        caseId: { type: 'string' },
        caseNumber: { type: 'string' },
        caseName: { type: 'string' },
        courtName: { type: 'string' },
        summary: { type: 'string' },
        currentPosture: { type: 'string' },
        venue: { type: 'string' },
        judge: { type: 'string', nullable: true },
        filedDate: { type: 'string', nullable: true },
        terminatedDate: { type: 'string', nullable: true },
        isOpen: { type: 'boolean' },
        recentEntries: { type: 'array', items: { type: 'object' } },
        deadlines: { type: 'array', items: { type: 'object' } },
        parties: { type: 'array', items: { type: 'object' } },
        counsel: { type: 'array', items: { type: 'object' } },
        inferredFields: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'object' },
        limitations: { type: 'array', items: { type: 'string' } },
        freshness: { type: 'object' },
        _meta: { type: 'object' },
      },
      required: ['caseId', 'caseName', 'summary', 'freshness', '_meta'],
    },
  },
  {
    name: 'get_entity_risk_brief',
    description:
      'Flagship tool. Returns a complete federal litigation risk brief for a company or person — risk band, risk score (0-100), score drivers, top concerns, notable cases, recent developments, watch items, confidence, and freshness. Replaces manual PACER/CourtListener workflow.',
    _meta: {
      surface: 'query',
      queryEligible: true,
      latencyClass: 'slow',
      rateLimit: {
        maxRequestsPerMinute: 10,
        cooldownMs: 6000,
        maxConcurrency: 2,
        notes: 'Runs full entity resolution + multi-docket fetch pipeline.',
      },
      pricing: { executeUsd: '0.00' },
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        entity_name: { type: 'string', description: 'Company or person name' },
        entity_type: {
          type: 'string',
          enum: ['company', 'person', 'auto'],
          default: 'auto',
        },
        lookback_months: { type: 'number', default: 60 },
        domain_hint: { type: 'string' },
        risk_tolerance: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          default: 'medium',
        },
        max_cases: { type: 'number', default: 8 },
      },
      required: ['entity_name'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        entityName: { type: 'string' },
        entityNameNormalized: { type: 'string' },
        entityType: { type: 'string' },
        overallAssessment: { type: 'string' },
        riskBand: {
          type: 'string',
          enum: ['high', 'elevated', 'moderate', 'low'],
        },
        riskScore: { type: 'number' },
        scoreDrivers: { type: 'array', items: { type: 'object' } },
        topConcerns: { type: 'array', items: { type: 'string' } },
        notableCases: { type: 'array', items: { type: 'object' } },
        recentDevelopments: { type: 'array', items: { type: 'string' } },
        watchItems: { type: 'array', items: { type: 'object' } },
        totalCasesFound: { type: 'number' },
        activeCases: { type: 'number' },
        confidence: { type: 'object' },
        limitations: { type: 'array', items: { type: 'string' } },
        freshness: { type: 'object' },
        _meta: { type: 'object' },
      },
      required: [
        'entityName',
        'overallAssessment',
        'riskBand',
        'riskScore',
        'scoreDrivers',
        'topConcerns',
        'notableCases',
        'totalCasesFound',
        'confidence',
        'limitations',
        'freshness',
        '_meta',
      ],
    },
  },
  {
    name: 'list_case_updates',
    description:
      'Show recent docket activity for a federal case — ordered entries with type labels (filing, order, judgment, hearing, settlement) and short digests.',
    _meta: {
      surface: 'query',
      queryEligible: true,
      latencyClass: 'fast',
      rateLimit: {
        maxRequestsPerMinute: 60,
        cooldownMs: 1000,
        maxConcurrency: 10,
      },
      pricing: { executeUsd: '0.00' },
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        case_id: { type: 'string', description: 'CourtListener docket ID' },
        days_back: { type: 'number', default: 30 },
        max_updates: { type: 'number', default: 20 },
      },
      required: ['case_id'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        caseId: { type: 'string' },
        caseName: { type: 'string' },
        caseNumber: { type: 'string' },
        courtName: { type: 'string' },
        updates: { type: 'array', items: { type: 'object' } },
        totalUpdates: { type: 'number' },
        daysBack: { type: 'number' },
        limitations: { type: 'array', items: { type: 'string' } },
        freshness: { type: 'object' },
        _meta: { type: 'object' },
      },
      required: ['caseId', 'caseName', 'updates', 'freshness', '_meta'],
    },
  },
  {
    name: 'compare_entities_litigation',
    description:
      'Compare federal litigation exposure across 2–5 companies or people side-by-side. Returns per-entity risk summaries and a plain-English comparison narrative.',
    _meta: {
      surface: 'query',
      queryEligible: true,
      latencyClass: 'slow',
      rateLimit: {
        maxRequestsPerMinute: 5,
        cooldownMs: 12000,
        maxConcurrency: 1,
        notes: 'Runs a full risk brief pipeline per entity in parallel.',
      },
      pricing: { executeUsd: '0.00' },
    },
    inputSchema: {
      type: 'object' as const,
      properties: {
        entities: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 5,
          description: '2–5 entity names to compare',
        },
        lookback_months: { type: 'number', default: 60 },
        entity_type: {
          type: 'string',
          enum: ['company', 'person', 'auto'],
          default: 'auto',
        },
      },
      required: ['entities'],
    },
    outputSchema: {
      type: 'object' as const,
      properties: {
        entities: { type: 'array', items: { type: 'object' } },
        comparisonSummary: { type: 'string' },
        highestRiskEntity: { type: 'string', nullable: true },
        limitations: { type: 'array', items: { type: 'string' } },
        freshness: { type: 'object' },
        _meta: { type: 'object' },
      },
      required: ['entities', 'comparisonSummary', 'limitations', 'freshness', '_meta'],
    },
  },
];

// ─── Error structuredContent helpers ──────────────────────────

function errorResult(toolName: string, message: string): Record<string, unknown> {
  const now = new Date().toISOString();
  const base = {
    error: message,
    limitations: [`Tool error: ${message}`],
    freshness: { generatedAt: now, sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: { toolName, toolVersion: env.MCP_SERVER_VERSION, requestId: 'error', latencyMs: 0, cacheHit: false },
  };

  switch (toolName) {
    case 'search_entity_litigation':
      return { ...base, normalizedQuery: '', entityType: 'auto', totalFound: 0, cases: [] };
    case 'get_case_digest':
      return { ...base, caseId: '', caseName: '', caseNumber: '', courtName: '', summary: `Error: ${message}`, currentPosture: 'unknown', recentEntries: [], deadlines: [], parties: [], counsel: [], inferredFields: [], confidence: { score: 0, band: 'excluded' }, isOpen: false, filedDate: null, terminatedDate: null };
    case 'get_entity_risk_brief':
      return { ...base, entityName: '', entityNameNormalized: '', entityType: 'auto', overallAssessment: `Error: ${message}`, riskBand: 'low', riskScore: 0, scoreDrivers: [], topConcerns: [], notableCases: [], recentDevelopments: [], watchItems: [], totalCasesFound: 0, activeCases: 0, confidence: { score: 0, band: 'excluded' } };
    case 'list_case_updates':
      return { ...base, caseId: '', caseName: '', caseNumber: '', courtName: '', updates: [], totalUpdates: 0, daysBack: 0 };
    case 'compare_entities_litigation':
      return { ...base, entities: [], comparisonSummary: `Error: ${message}`, highestRiskEntity: null };
    default:
      return base;
  }
}

// ─── MCP Server factory ────────────────────────────────────────

export function createMcpServer(): Server {
  const server = new Server(
    { name: env.MCP_SERVER_NAME, version: env.MCP_SERVER_VERSION },
    { capabilities: { tools: {} } }
  );

  // List tools — returns all tools with CTP _meta
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    try {
      switch (name) {
        case 'search_entity_litigation':
          return await handleSearchEntityLitigation(args ?? {}, startTime);
        case 'get_case_digest':
          return await handleGetCaseDigest(args ?? {}, startTime);
        case 'get_entity_risk_brief':
          return await handleGetEntityRiskBrief(args ?? {}, startTime);
        case 'list_case_updates':
          return await handleListCaseUpdates(args ?? {}, startTime);
        case 'compare_entities_litigation':
          return await handleCompareEntitiesLitigation(args ?? {}, startTime);
        default:
          return {
            content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
            structuredContent: errorResult(name, `Unknown tool: ${name}`),
            isError: true,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Tool handler error', { tool: name, err });
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        structuredContent: errorResult(name, message),
        isError: true,
      };
    }
  });

  return server;
}

// ─── Tool handlers ────────────────────────────────────────────

async function handleSearchEntityLitigation(
  args: Record<string, unknown>,
  startTime: number
) {
  const entityName = String(args['entity_name'] ?? '');
  const entityType = (args['entity_type'] as 'company' | 'person' | 'auto') ?? 'auto';
  const lookbackMonths = Number(args['lookback_months'] ?? 60);
  const maxCases = Number(args['max_cases'] ?? 10);
  const includeClosedCases = args['include_closed_cases'] !== false;

  const normalized = normalizeName(entityName, entityType);
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - lookbackMonths);
  const dateAfter = cutoff.toISOString().split('T')[0]!;

  const raw = await searchDocketsByParty({
    partyName: normalized.canonical,
    dateFiledAfter: dateAfter,
    limit: maxCases,
  });

  const summaries = raw.results.map(transformSearchHit);
  const scored = scoreSearchResults(normalized, summaries, entityType);
  const filtered = includeClosedCases ? scored : scored.filter((s) => s.isOpen);
  const now = new Date().toISOString();

  const result = {
    normalizedQuery: normalized.canonical,
    entityType,
    totalFound: filtered.length,
    cases: filtered.map((s) => ({
      caseId: s.caseId,
      caseNumber: s.caseNumber,
      caseName: s.caseName,
      courtId: s.courtId,
      courtName: s.courtName,
      filedDate: s.filedDate,
      terminatedDate: s.terminatedDate,
      isOpen: s.isOpen,
      partyRole: null,
      matchConfidence: s.matchConfidence,
      matchReason: s.matchReason,
      fieldOrigin: 'observed' as const,
      sourceUpdatedAt: null,
    })),
    limitations:
      raw.count > maxCases
        ? [`Showing ${maxCases} of ${raw.count} total results`]
        : [],
    freshness: { generatedAt: now, sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: buildMeta('search_entity_litigation', startTime, 'none'),
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}

async function handleGetCaseDigest(args: Record<string, unknown>, startTime: number) {
  const caseId = String(args['case_id'] ?? '');
  const docketId = parseInt(caseId, 10);
  const entityKey = `case:${docketId}`;
  const toolName = 'get_case_digest';

  type DigestResult = ReturnType<typeof buildCaseDigest> extends Promise<infer T> ? T : never;
  const cached = await getSnapshot<DigestResult>(entityKey, toolName);
  if (cached) {
    const out = { ...cached.data, _meta: buildMeta(toolName, startTime, cached.cacheLayer) };
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(out) }],
      structuredContent: out as unknown as Record<string, unknown>,
    };
  }

  const now = new Date().toISOString();
  const freshness = { generatedAt: now, sourceUpdatedAt: null, snapshotAgeSeconds: 0 };
  const meta = buildMeta(toolName, startTime, 'none');

  const output = await buildCaseDigest({
    docketId,
    maxRecentEntries: Number(args['max_recent_entries'] ?? 10),
    includeParties: args['include_parties'] !== false,
    includeCounsel: args['include_counsel'] !== false,
    freshness,
    meta,
  });

  await setSnapshot(entityKey, toolName, output);

  // Flatten for structuredContent
  const result = { ...output.data, freshness: output.freshness, _meta: output._meta };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}

async function handleGetEntityRiskBrief(args: Record<string, unknown>, startTime: number) {
  const meta = buildMeta('get_entity_risk_brief', startTime, 'none');

  const output = await buildEntityRiskBrief(
    {
      entity_name: String(args['entity_name'] ?? ''),
      entity_type: (args['entity_type'] as 'company' | 'person' | 'auto') ?? 'auto',
      lookback_months: Number(args['lookback_months'] ?? 60),
      domain_hint: args['domain_hint'] as string | undefined,
      risk_tolerance: (args['risk_tolerance'] as 'low' | 'medium' | 'high') ?? 'medium',
      max_cases: Number(args['max_cases'] ?? 8),
    },
    meta
  );

  const result = { ...output.data, freshness: output.freshness, _meta: output._meta };
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}

async function handleListCaseUpdates(args: Record<string, unknown>, startTime: number) {
  const caseId = String(args['case_id'] ?? '');
  const docketId = parseInt(caseId, 10);
  const daysBack = Number(args['days_back'] ?? 30);
  const maxUpdates = Number(args['max_updates'] ?? 20);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  const afterDate = cutoff.toISOString().split('T')[0]!;

  const [rawDocket, entriesRes] = await Promise.all([
    getDocket(docketId),
    getDocketEntries(docketId, { orderBy: '-date_filed', limit: maxUpdates, after: afterDate }),
  ]);

  const docket = transformDocket(rawDocket);
  const now = new Date().toISOString();

  const result = {
    caseId: docket.caseId,
    caseName: docket.caseName,
    caseNumber: docket.caseNumber,
    courtName: docket.courtName,
    updates: entriesRes.results.map((e) => ({
      entryNumber: e.entry_number,
      dateFiled: e.date_filed,
      updateType: classifyEntryType(e.description),
      digest: e.description.slice(0, 300),
      documentCount: e.recap_documents.length,
      origin: 'observed' as const,
    })),
    totalUpdates: entriesRes.results.length,
    daysBack,
    limitations:
      entriesRes.count > maxUpdates
        ? [`Showing ${maxUpdates} of ${entriesRes.count} entries`]
        : [],
    freshness: {
      generatedAt: now,
      sourceUpdatedAt: rawDocket.date_modified,
      snapshotAgeSeconds: 0,
    },
    _meta: buildMeta('list_case_updates', startTime, 'none'),
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}

async function handleCompareEntitiesLitigation(
  args: Record<string, unknown>,
  startTime: number
) {
  const entities = (args['entities'] as string[]) ?? [];
  const entityType = (args['entity_type'] as 'company' | 'person' | 'auto') ?? 'auto';
  const lookbackMonths = Number(args['lookback_months'] ?? 60);

  const results = await Promise.allSettled(
    entities.map((name) =>
      buildEntityRiskBrief(
        { entity_name: name, entity_type: entityType, lookback_months: lookbackMonths, risk_tolerance: 'medium', max_cases: 8 },
        buildMeta('compare_entities_litigation', startTime, 'none')
      )
    )
  );

  const summaries = entities.map((name, i) => {
    const r = results[i];
    if (!r || r.status === 'rejected') {
      return {
        entityName: name,
        entityNameNormalized: name.toLowerCase(),
        riskBand: 'low',
        riskScore: 0,
        scoreDrivers: [],
        totalCases: 0,
        activeCases: 0,
        mostRecentActivity: null,
        topConcern: null,
        confidence: { score: 0, band: 'excluded' },
        limitations: [`Failed to retrieve data for "${name}"`],
      };
    }
    const b = r.value.data;
    return {
      entityName: b.entityName,
      entityNameNormalized: b.entityNameNormalized,
      riskBand: b.riskBand,
      riskScore: b.riskScore,
      scoreDrivers: b.scoreDrivers,
      totalCases: b.totalCasesFound,
      activeCases: b.activeCases,
      mostRecentActivity: b.notableCases[0]?.filedDate ?? null,
      topConcern: b.topConcerns[0] ?? null,
      confidence: b.confidence,
      limitations: b.limitations,
    };
  });

  const sorted = [...summaries].sort((a, b) => b.riskScore - a.riskScore);
  const highest = sorted[0];
  const lowest = sorted[sorted.length - 1];
  const now = new Date().toISOString();

  const comparisonSummary =
    highest && lowest && highest.entityName !== lowest.entityName
      ? `${highest.entityName} shows the highest litigation risk (${highest.riskBand}, score ${highest.riskScore}) with ${highest.activeCases} active case(s). ${lowest.entityName} shows the lowest risk (${lowest.riskBand}, score ${lowest.riskScore}).`
      : `${highest?.entityName ?? 'Entity'} shows ${highest?.riskBand ?? 'low'} risk (score ${highest?.riskScore ?? 0}).`;

  const result = {
    entities: summaries,
    comparisonSummary,
    highestRiskEntity: highest?.entityName ?? null,
    limitations: [
      'Comparison covers federal court data only.',
      'Risk scores are heuristic indicators, not legal assessments.',
    ],
    freshness: { generatedAt: now, sourceUpdatedAt: null, snapshotAgeSeconds: 0 },
    _meta: buildMeta('compare_entities_litigation', startTime, 'none'),
  };

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}
