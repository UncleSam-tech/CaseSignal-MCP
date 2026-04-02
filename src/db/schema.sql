-- CaseSignal MCP — canonical schema
-- Apply via: npm run db:migrate

CREATE TABLE IF NOT EXISTS snapshots (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_key       TEXT        NOT NULL,
  tool_name        TEXT        NOT NULL,
  payload          JSONB       NOT NULL,
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source_updated_at TIMESTAMPTZ,
  ttl_seconds      INT         NOT NULL DEFAULT 3600,
  UNIQUE (entity_key, tool_name)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_entity_tool ON snapshots (entity_key, tool_name);
CREATE INDEX IF NOT EXISTS idx_snapshots_generated_at ON snapshots (generated_at);

CREATE TABLE IF NOT EXISTS entity_aliases (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT        NOT NULL,
  alias          TEXT        NOT NULL,
  alias_type     TEXT        NOT NULL,  -- 'trade_name' | 'former_name' | 'abbreviation' | 'suffix_variant'
  confidence     NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canonical_name, alias)
);

CREATE INDEX IF NOT EXISTS idx_entity_aliases_alias ON entity_aliases (alias);
CREATE INDEX IF NOT EXISTS idx_entity_aliases_canonical ON entity_aliases (canonical_name);

CREATE TABLE IF NOT EXISTS court_cache (
  court_id   TEXT        PRIMARY KEY,
  full_name  TEXT        NOT NULL,
  jurisdiction TEXT      NOT NULL,
  cached_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
