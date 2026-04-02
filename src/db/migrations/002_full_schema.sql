-- Migration 002: full production schema
-- Idempotent — safe to re-run
-- Adds 11 tables beyond the 3 created in 001_initial.sql

-- ─────────────────────────────────────────────────────────────
-- Canonical entity registry
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entities (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name      TEXT        NOT NULL,
  normalized_name   TEXT        NOT NULL,
  entity_type       TEXT        NOT NULL CHECK (entity_type IN ('company', 'person', 'auto')),
  domain_hint       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (normalized_name, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_entities_normalized ON entities (normalized_name);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities (entity_type);

-- ─────────────────────────────────────────────────────────────
-- Entity resolution rules (alias boost/penalty overrides)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entity_resolution_rules (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  rule_type       TEXT        NOT NULL CHECK (rule_type IN ('alias_boost', 'alias_penalty', 'exact_match', 'exclude')),
  pattern         TEXT        NOT NULL,
  confidence_delta NUMERIC(4,3) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_entity_resolution_rules_entity ON entity_resolution_rules (entity_id);

-- ─────────────────────────────────────────────────────────────
-- Federal cases (docket-level records)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cases (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cl_docket_id        BIGINT      NOT NULL UNIQUE,
  case_number         TEXT,
  case_name           TEXT        NOT NULL,
  court_id            TEXT        NOT NULL,
  court_name          TEXT,
  judge               TEXT,
  filed_date          DATE,
  terminated_date     DATE,
  is_open             BOOLEAN     NOT NULL DEFAULT TRUE,
  nature_of_suit      TEXT,
  cause               TEXT,
  jurisdiction_type   TEXT,
  cl_url              TEXT,
  source_updated_at   TIMESTAMPTZ,
  fetched_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cl_docket_id)
);

CREATE INDEX IF NOT EXISTS idx_cases_court ON cases (court_id);
CREATE INDEX IF NOT EXISTS idx_cases_filed_date ON cases (filed_date);
CREATE INDEX IF NOT EXISTS idx_cases_is_open ON cases (is_open);
CREATE INDEX IF NOT EXISTS idx_cases_fetched_at ON cases (fetched_at);

-- ─────────────────────────────────────────────────────────────
-- Case parties
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_parties (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  party_name    TEXT        NOT NULL,
  party_type    TEXT,
  party_role    TEXT,
  cl_party_id   BIGINT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_parties_case ON case_parties (case_id);
CREATE INDEX IF NOT EXISTS idx_case_parties_name ON case_parties (party_name);

-- ─────────────────────────────────────────────────────────────
-- Case attorneys
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_attorneys (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  attorney_name   TEXT        NOT NULL,
  firm_name       TEXT,
  email           TEXT,
  phone           TEXT,
  cl_attorney_id  BIGINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_attorneys_case ON case_attorneys (case_id);
CREATE INDEX IF NOT EXISTS idx_case_attorneys_name ON case_attorneys (attorney_name);

-- ─────────────────────────────────────────────────────────────
-- Docket entries (filings, orders, etc.)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_entries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  cl_entry_id     BIGINT,
  entry_number    INT,
  date_filed      DATE,
  description     TEXT,
  entry_type      TEXT,
  document_count  INT         NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_entries_case ON case_entries (case_id);
CREATE INDEX IF NOT EXISTS idx_case_entries_date ON case_entries (date_filed DESC);

-- ─────────────────────────────────────────────────────────────
-- Case deadlines / hearing dates
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_deadlines (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id         UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  deadline_type   TEXT        NOT NULL,
  deadline_date   DATE        NOT NULL,
  label           TEXT,
  inferred        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_case_deadlines_case ON case_deadlines (case_id);
CREATE INDEX IF NOT EXISTS idx_case_deadlines_date ON case_deadlines (deadline_date);

-- ─────────────────────────────────────────────────────────────
-- Entity ↔ Case links with confidence scores
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entity_case_links (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id           UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  case_id             UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  match_confidence    NUMERIC(4,3) NOT NULL CHECK (match_confidence BETWEEN 0 AND 1),
  confidence_band     TEXT        NOT NULL CHECK (confidence_band IN ('high', 'medium', 'low', 'excluded')),
  match_reason        TEXT,
  linked_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (entity_id, case_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_case_links_entity ON entity_case_links (entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_case_links_case ON entity_case_links (case_id);
CREATE INDEX IF NOT EXISTS idx_entity_case_links_confidence ON entity_case_links (match_confidence DESC);

-- ─────────────────────────────────────────────────────────────
-- Entity-level risk brief snapshots
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entity_brief_snapshots (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id         UUID        NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  risk_band         TEXT        NOT NULL CHECK (risk_band IN ('high', 'elevated', 'moderate', 'low')),
  risk_score        INT         NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  total_cases       INT         NOT NULL DEFAULT 0,
  active_cases      INT         NOT NULL DEFAULT 0,
  payload           JSONB       NOT NULL,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ,
  UNIQUE (entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_brief_snapshots_entity ON entity_brief_snapshots (entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_brief_snapshots_risk ON entity_brief_snapshots (risk_score DESC);

-- ─────────────────────────────────────────────────────────────
-- Case digest snapshots
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS case_digest_snapshots (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID        NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  payload       JSONB       NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ,
  UNIQUE (case_id)
);

CREATE INDEX IF NOT EXISTS idx_case_digest_snapshots_case ON case_digest_snapshots (case_id);

-- ─────────────────────────────────────────────────────────────
-- Background fetch jobs (PACER / RECAP fallback)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fetch_jobs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type        TEXT        NOT NULL CHECK (job_type IN ('pacer_fetch', 'recap_fetch', 'refresh')),
  entity_key      TEXT        NOT NULL,
  tool_name       TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts        INT         NOT NULL DEFAULT 0,
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fetch_jobs_status ON fetch_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_fetch_jobs_entity ON fetch_jobs (entity_key);

-- ─────────────────────────────────────────────────────────────
-- Audit log for inferred / normalized field labels
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_inference_labels (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table    TEXT        NOT NULL,
  source_id       UUID        NOT NULL,
  field_name      TEXT        NOT NULL,
  origin          TEXT        NOT NULL CHECK (origin IN ('observed', 'normalized', 'inferred', 'unknown')),
  reasoning       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_inference_source ON audit_inference_labels (source_table, source_id);

-- ─────────────────────────────────────────────────────────────
-- Tool call logs (for billing, analytics, and debugging)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tool_call_logs (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name       TEXT        NOT NULL,
  request_id      TEXT,
  entity_name     TEXT,
  latency_ms      INT,
  cache_hit       BOOLEAN     NOT NULL DEFAULT FALSE,
  cache_layer     TEXT,
  error_code      TEXT,
  called_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tool_call_logs_tool ON tool_call_logs (tool_name, called_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_call_logs_entity ON tool_call_logs (entity_name);
