import { z } from 'zod';
import { config } from 'dotenv';

config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  BASE_URL: z.string().url().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),

  // CourtListener
  COURTLISTENER_API_TOKEN: z.string().min(1),
  COURTLISTENER_BASE_URL: z.string().url().default('https://www.courtlistener.com/api/rest/v4'),

  // PACER (optional)
  PACER_USERNAME: z.string().optional(),
  PACER_PASSWORD: z.string().optional(),
  PACER_CLIENT_CODE: z.string().optional(),

  // Database
  DATABASE_URL: z.string().min(1),

  // Redis
  REDIS_URL: z.string().min(1),

  // MCP
  MCP_SERVER_NAME: z.string().default('casesignal-mcp'),
  MCP_SERVER_VERSION: z.string().default('1.0.0'),

  // Context Protocol
  CONTEXT_JWT_AUDIENCE: z.string().optional(),
  CONTEXT_JWT_ISSUER: z.string().optional(),
  CONTEXT_SHARED_SECRET: z.string().optional(),

  // Fetch webhook
  FETCH_WEBHOOK_SECRET: z.string().optional(),

  // Tuning
  COLD_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(25000),
  SNAPSHOT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  WARM_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  DEFAULT_LOOKBACK_MONTHS: z.coerce.number().int().positive().default(60),
  MAX_CASES_PER_QUERY: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(100),

  // Feature flags
  ENABLE_EXECUTE_MODE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),
  ENABLE_FETCH_FALLBACK: z
    .string()
    .transform((v) => v !== 'false')
    .default('true'),

});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `  ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  throw new Error(`Environment validation failed:\n${missing}`);
}

const env = parsed.data;

export default env;
