/**
 * Canonical domain types for CaseSignal MCP.
 * These types flow through the entire pipeline from tool input → entity
 * resolution → CourtListener fetch → brief builder → tool output.
 */

// ─── Entity Query ─────────────────────────────────────────────

/**
 * Raw query as received from a tool call, before any normalization.
 */
export type EntityQuery = {
  /** Raw entity name string as provided by the caller */
  rawInput: string;
  /** Normalized canonical form (Unicode NFKC → lowercase → suffix-stripped) */
  normalizedInput: string;
  /** Whether this entity is a company, person, or auto-detected */
  entityType: 'company' | 'person' | 'auto';
  /** Optional domain/industry hint to improve resolution accuracy */
  domainHint?: string;
  /** ISO timestamp when this query was initiated */
  requestedAt: string;
};

// ─── Resolved Entity ──────────────────────────────────────────

/**
 * The result of running entity resolution against the alias table
 * and CourtListener search results. Carries confidence metadata.
 */
export type ResolvedEntity = {
  /** Internal entity UUID (from the entities table, if persisted) */
  entityId?: string;
  /** Display name as it should appear in responses */
  displayName: string;
  /** Canonical normalized name used for cache keys and DB lookups */
  normalizedName: string;
  /** Resolved entity type (never 'auto' after resolution) */
  entityType: 'company' | 'person';
  /** All known aliases, including the canonical name */
  aliases: ResolvedAlias[];
  /** Hints used during resolution (e.g. from domain_hint or alias table) */
  sourceHints: string[];
  /** Overall resolution confidence score (0–1) */
  confidence: number;
  /** Human-readable confidence band */
  confidenceBand: 'high' | 'medium' | 'low' | 'excluded';
};

export type ResolvedAlias = {
  /** The alias string */
  alias: string;
  /** How this alias was obtained */
  aliasType: 'direct' | 'normalized' | 'suffix_variant' | 'db_alias';
  /** Confidence contribution of this alias */
  confidence: number;
};

// ─── Cache Layer ──────────────────────────────────────────────

/** Identifies which caching layer served a response */
export type CacheLayer = 'redis' | 'postgres' | 'none';

// ─── Field Origin ─────────────────────────────────────────────

/** Provenance tag for individual output fields */
export type FieldOrigin = 'observed' | 'normalized' | 'inferred' | 'unknown';

// ─── Tool Meta ────────────────────────────────────────────────

/** Standard metadata attached to every tool response */
export type ToolMeta = {
  toolName: string;
  toolVersion: string;
  requestId: string;
  latencyMs: number;
  cacheHit: boolean;
  cacheLayer: CacheLayer;
};

// ─── Freshness ────────────────────────────────────────────────

/** Freshness metadata describing when data was generated and sourced */
export type Freshness = {
  generatedAt: string;
  sourceUpdatedAt: string | null;
  snapshotAgeSeconds: number;
};
