# CaseSignal MCP

Federal court litigation intelligence as a Model Context Protocol server. Turns live CourtListener docket data into decision-useful risk briefs for companies and individuals.

## What It Does

CaseSignal MCP exposes 5 MCP tools that any Claude-compatible client can call:

| Tool | Description |
|------|-------------|
| `search_entity_litigation` | Find federal cases involving a company or person, ranked by match confidence |
| `get_case_digest` | Full brief for a single case — posture, parties, counsel, recent filings |
| `get_entity_risk_brief` | **Flagship.** Risk score (0–100), risk band, score drivers, notable cases |
| `list_case_updates` | Recent docket activity for a case |
| `compare_entities_litigation` | Side-by-side risk comparison of 2–5 entities |

Every response includes:
- **Confidence bands** (`high` / `medium` / `low` / `excluded`) on every match
- **Field origin tags** (`observed` / `normalized` / `inferred` / `unknown`)
- **Freshness metadata** (`generatedAt`, `sourceUpdatedAt`, `snapshotAgeSeconds`)
- **Risk scoring** with weighted score drivers and evidence strings

## Stack

- **Runtime**: Node.js 18+, TypeScript, ESM
- **MCP**: `@modelcontextprotocol/sdk` — Streamable HTTP transport, stateless
- **API**: [CourtListener REST API v4](https://www.courtlistener.com/help/api/rest/)
- **Database**: PostgreSQL (snapshot cache + entity aliases)
- **Cache**: Redis (hot cache + circuit breaker + BullMQ queues)
- **Validation**: Zod on all inputs and outputs
- **Logging**: Winston (JSON in prod, colorized in dev)

## Quick Start

### Prerequisites

- Node.js 18+
- Docker (for local Postgres + Redis)
- CourtListener API token — free at [courtlistener.com/profile](https://www.courtlistener.com/profile/)

### Setup

```bash
# 1. Clone
git clone https://github.com/UncleSam-tech/CaseSignal-MCP.git
cd CaseSignal-MCP

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env — set COURTLISTENER_API_TOKEN, DATABASE_URL, REDIS_URL

# 4. Start Postgres + Redis
docker-compose up -d

# 5. Run database migrations
npm run db:migrate

# 6. Start the server
npm run dev
```

Server starts on `http://localhost:3000`.

### Verify

```bash
curl http://localhost:3000/health
# {"status":"ok","version":"1.0.0","uptime":...}

curl http://localhost:3000/health/ready
# {"status":"ready","checks":{"postgres":"ok","redis":"ok"}}
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `COURTLISTENER_API_TOKEN` | ✅ | From courtlistener.com/profile |
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `PORT` | — | Default `3000` |
| `NODE_ENV` | — | `development` or `production` |
| `SNAPSHOT_TTL_SECONDS` | — | Cache TTL, default `3600` |
| `COLD_FETCH_TIMEOUT_MS` | — | API timeout, default `25000` |
| `ENABLE_FETCH_FALLBACK` | — | PACER fallback, default `false` |

See `.env.example` for the full list.

## MCP Endpoint

```
POST http://localhost:3000/mcp
Content-Type: application/json
```

Stateless JSON-RPC 2.0. No session management required.

### Example — Entity Risk Brief

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_entity_risk_brief",
    "arguments": {
      "entity_name": "Meta Platforms",
      "entity_type": "company",
      "lookback_months": 60
    }
  }
}
```

Response includes:
```json
{
  "data": {
    "entityName": "Meta Platforms",
    "riskBand": "high",
    "riskScore": 72,
    "scoreDrivers": [...],
    "notableCases": [...],
    "totalCasesFound": 14,
    "activeCases": 6
  },
  "freshness": {
    "generatedAt": "2026-04-02T...",
    "snapshotAgeSeconds": 0
  },
  "_meta": {
    "latencyMs": 4200,
    "cacheHit": false
  }
}
```

## Project Structure

```
src/
  app/          → server.ts, health.ts, mcp.ts
  config/       → env.ts, features.ts, pricing.ts
  context/      → middleware.ts, toolMeta.ts
  tools/        → one file per MCP tool (5 tools)
  services/
    briefs/           → caseDigestBuilder, entityRiskBuilder
    courtlistener/    → pacerApi, recapFetchApi, transforms, types
    entityResolution/ → normalizeName, aliasResolver, resolutionScorer
    cache/            → redis, snapshotService
    queues/           → fetchQueue, refreshQueue
    ranking/          → matchConfidence, riskScore
  db/           → client.ts, schema.sql, migrations/
  schemas/      → input/, output/, shared/
  utils/        → dates, errors, logger, retry
tests/
  unit/         → 50 tests, no I/O
scripts/
  migrate.ts    → run DB migrations
  seed-aliases.ts → seed entity alias table
```

## How It Works

### Entity Resolution
Raw entity names are normalized (Unicode → lowercase → strip legal suffixes → tokenize), then scored against CourtListener search results using Jaccard similarity on token sets. Matches below 0.60 confidence are excluded.

### Risk Scoring
Six weighted drivers produce a 0–100 risk score:

| Driver | Weight |
|--------|--------|
| Active case count | 25% |
| Adverse judgment rate | 25% |
| High-value litigation | 20% |
| Regulatory enforcement | 15% |
| Recency (past 2 years) | 10% |
| Jurisdiction breadth | 5% |

### Caching
Two-layer cache: **Redis** (hot, 15-min TTL) → **PostgreSQL** (warm, 1-hr TTL). Cache misses trigger a live CourtListener fetch. Background BullMQ jobs refresh snapshots before expiry.

### Circuit Breaker
Redis-backed circuit breaker on the CourtListener API: 5 consecutive failures opens the circuit for 60 seconds.

## Development

```bash
npm test              # unit tests (50 tests, no I/O)
npm run test:coverage # coverage report
npm run lint          # TypeScript type check
npm run build         # compile to dist/
npm run db:migrate    # run pending migrations
npm run db:seed       # seed entity alias table
```

## Deployment

See `docker-compose.yml` for local services. For production deployment to Render, set all required environment variables in the Render dashboard and run `npm run db:migrate` after first deploy.

## Data Source

Powered by [CourtListener](https://www.courtlistener.com/) — the free law project's federal court database covering PACER/RECAP filings. REST API v4, token authentication required.

## License

MIT
