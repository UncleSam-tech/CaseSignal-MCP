import { Router, type Request, type Response } from 'express';

let dbCheck: (() => Promise<void>) | null = null;
let redisCheck: (() => Promise<void>) | null = null;

export function registerHealthChecks(
  checkDb: () => Promise<void>,
  checkRedis: () => Promise<void>
): void {
  dbCheck = checkDb;
  redisCheck = checkRedis;
}

const router = Router();

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version: process.env['npm_package_version'] ?? '1.0.0',
    uptime: process.uptime(),
  });
});

router.get('/health/ready', async (_req: Request, res: Response) => {
  const checks: Record<string, 'ok' | string> = {};

  if (dbCheck) {
    try {
      await dbCheck();
      checks['postgres'] = 'ok';
    } catch (err) {
      checks['postgres'] = err instanceof Error ? err.message : 'failed';
    }
  }

  if (redisCheck) {
    try {
      await redisCheck();
      checks['redis'] = 'ok';
    } catch (err) {
      checks['redis'] = err instanceof Error ? err.message : 'failed';
    }
  }

  const allOk = Object.values(checks).every((v) => v === 'ok');
  res.status(allOk ? 200 : 503).json({ status: allOk ? 'ready' : 'not_ready', checks });
});

export default router;
