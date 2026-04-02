import winston from 'winston';

const { combine, timestamp, errors, json, colorize, simple } = winston.format;

const isDev = process.env['NODE_ENV'] !== 'production';

const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: combine(
    errors({ stack: true }),
    timestamp(),
    isDev ? combine(colorize(), simple()) : json()
  ),
  transports: [new winston.transports.Console()],
});

export function createChildLogger(context: Record<string, unknown>): winston.Logger {
  return logger.child(context);
}

export default logger;
