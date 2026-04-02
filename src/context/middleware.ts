import { randomUUID } from 'crypto';
import { type Request, type Response, type NextFunction } from 'express';
import { createChildLogger } from '../utils/logger.js';

export function createContextMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = randomUUID();
    const startTime = Date.now();
    const childLogger = createChildLogger({ requestId, path: req.path });

    res.locals['requestId'] = requestId;
    res.locals['startTime'] = startTime;
    res.locals['logger'] = childLogger;

    next();
  };
}
