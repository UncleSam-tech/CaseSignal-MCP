import env from '../config/env.js';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import healthRouter, { registerHealthChecks } from './health.js';
import { createMcpServer } from './mcp.js';
import logger from '../utils/logger.js';
import { isAppError } from '../utils/errors.js';

const app = express();

app.use(helmet());
app.use(express.json({ limit: '1mb' }));

// Rate limiting on MCP endpoint
const mcpLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Too many requests' },
});

// Request logging
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

// Health routes (no rate limit)
app.use(healthRouter);

// MCP endpoint — stateless, one server instance per request
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

// MCP protocol compliance — reject non-POST
app.get('/mcp', (_req: Request, res: Response) => {
  res.status(405).json({ error: 'method_not_allowed' });
});
app.delete('/mcp', (_req: Request, res: Response) => {
  res.status(405).json({ error: 'method_not_allowed' });
});

// Global error handler
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

export async function startServer(): Promise<void> {
  // Lazy-load DB and Redis to register health checks after infra is initialized
  try {
    const { testDbConnection } = await import('../db/client.js');
    const { testRedisConnection } = await import('../services/cache/redis.js');
    registerHealthChecks(testDbConnection, testRedisConnection);
  } catch {
    logger.warn('DB/Redis health checks not yet available — skipping registration');
  }

  app.listen(env.PORT, () => {
    logger.info(`CaseSignal MCP listening`, { port: env.PORT, env: env.NODE_ENV });
  });
}

startServer();

export default app;
