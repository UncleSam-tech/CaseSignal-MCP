import env from '../config/env.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import healthRouter, { registerHealthChecks } from './health.js';
import { createMcpServer } from './mcp.js';
import logger from '../utils/logger.js';
import { isAppError } from '../utils/errors.js';

// Conditionally load CTP middleware — absent in pure local dev
let ctxMiddleware: ReturnType<typeof import('@ctxprotocol/sdk').createContextMiddleware> | null = null;
try {
  const { createContextMiddleware } = await import('@ctxprotocol/sdk');
  ctxMiddleware = createContextMiddleware();
} catch {
  logger.warn('createContextMiddleware not available — running without CTP auth layer');
}

const app = express();

// Trust Render's load balancer so express-rate-limit reads the real client IP
// from X-Forwarded-For instead of the internal proxy IP.
app.set('trust proxy', 1);

app.use(helmet());

// Apply JSON body parsing everywhere EXCEPT /mcp and /messages.
// The StreamableHTTPServerTransport must read the raw request stream itself —
// if express.json() consumes it first the transport throws "stream is not readable".
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/mcp' || req.path === '/messages') return next();
  express.json({ limit: '1mb' })(req, res, next);
});

// ─── Rate limiter ──────────────────────────────────────────────
const mcpLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many requests' },
});

// ─── Request logging ───────────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.http('request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      latencyMs: Date.now() - start,
    });
  });
  next();
});

// ─── Health routes (no rate limit, no CTP auth) ───────────────
app.use(healthRouter);

// ─── Debug route — lists registered tools ─────────────────────
app.get('/debug', (_req: Request, res: Response) => {
  res.json({
    name: env.MCP_SERVER_NAME,
    version: env.MCP_SERVER_VERSION,
    transport: ['sse', 'streamable-http'],
    ctpMiddlewareActive: ctxMiddleware !== null,
    tools: [
      'search_entity_litigation',
      'get_case_digest',
      'get_entity_risk_brief',
      'list_case_updates',
      'compare_entities_litigation',
    ],
  });
});

// ─── SSE transport (primary — Context Protocol standard) ───────
const sseTransports = new Map<string, SSEServerTransport>();

// Apply CTP middleware to SSE endpoint when available
if (ctxMiddleware) {
  app.use('/sse', ctxMiddleware);
}

app.get('/sse', mcpLimiter, async (_req: Request, res: Response) => {
  try {
    const transport = new SSEServerTransport('/messages', res);
    const server = createMcpServer();
    sseTransports.set(transport.sessionId, transport);
    res.on('close', () => {
      sseTransports.delete(transport.sessionId);
    });
    await server.connect(transport);
  } catch (err) {
    logger.error('SSE handler error', { err });
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error' });
    }
  }
});

app.post('/messages', async (req: Request, res: Response) => {
  const sessionId = req.query['sessionId'] as string | undefined;
  if (!sessionId) {
    res.status(400).json({ error: 'missing_session_id' });
    return;
  }
  const transport = sseTransports.get(sessionId);
  if (!transport) {
    res.status(400).json({ error: 'no_active_session', sessionId });
    return;
  }
  try {
    await transport.handlePostMessage(req, res);
  } catch (err) {
    logger.error('SSE message handler error', { err, sessionId });
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error' });
    }
  }
});

// ─── Streamable HTTP transport (fallback) ─────────────────────
if (ctxMiddleware) {
  app.use('/mcp', ctxMiddleware);
}

app.post('/mcp', mcpLimiter, async (req: Request, res: Response) => {
  try {
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    // Do NOT pass req.body — let the transport read the raw stream directly.
    // express.json() is excluded from /mcp so the stream is still readable here.
    await transport.handleRequest(req, res);
  } catch (err) {
    logger.error('MCP handler error', { err });
    if (!res.headersSent) {
      res.status(500).json({ error: 'internal_error' });
    }
  }
});

// MCP protocol compliance — reject non-POST/GET
app.get('/mcp', (_req: Request, res: Response) => {
  res.status(405).json({ error: 'method_not_allowed' });
});
app.delete('/mcp', (_req: Request, res: Response) => {
  res.status(405).json({ error: 'method_not_allowed' });
});

// ─── Global error handler ──────────────────────────────────────
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (isAppError(err)) {
    res.status(err.statusCode).json({ error: err.code, message: err.message });
    return;
  }
  logger.error('Unhandled error', { err });
  res.status(500).json({ error: 'internal_error', message: 'An unexpected error occurred' });
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', { reason });
  process.exit(1);
});

// ─── Keep-alive ping (required by Context Protocol) ───────────
// Prevents the CTP platform from marking the server as inactive
setInterval(() => {
  fetch(`http://localhost:${env.PORT}/health`).catch(() => {
    // Intentionally swallowed — server may not be fully ready yet
  });
}, 600_000); // 10 minutes

export async function startServer(): Promise<void> {
  // Run DB migrations on every startup — idempotent, safe to re-run.
  // This guarantees tables exist whether deploying fresh or restarting.
  try {
    const { runMigrations } = await import('../db/migrate.js');
    logger.info('Running database migrations...');
    await runMigrations(process.env['DATABASE_URL'] ?? '');
    logger.info('Database migrations complete');
  } catch (err) {
    // Log but don't crash — DB might be temporarily unavailable at cold start
    logger.error('Migration error on startup (non-fatal)', { err });
  }

  try {
    const { testDbConnection } = await import('../db/client.js');
    const { testRedisConnection } = await import('../services/cache/redis.js');
    registerHealthChecks(testDbConnection, testRedisConnection);
  } catch {
    logger.warn('DB/Redis health checks not yet available — skipping registration');
  }

  app.listen(env.PORT, () => {
    logger.info('CaseSignal MCP listening', {
      port: env.PORT,
      env: env.NODE_ENV,
      transport: 'sse+streamable-http',
      ctpMiddleware: ctxMiddleware !== null,
    });
  });
}

startServer();

export default app;
