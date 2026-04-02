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

app.use(helmet());
app.use(express.json({ limit: '1mb' }));

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
    await transport.handleRequest(req, res, req.body);
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
