export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly isOperational: boolean;

  constructor(message: string, code: string, statusCode: number, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  static readonly code = 'VALIDATION_ERROR';
  constructor(message: string) {
    super(message, ValidationError.code, 400);
  }
}

export class NotFoundError extends AppError {
  static readonly code = 'NOT_FOUND';
  constructor(message: string) {
    super(message, NotFoundError.code, 404);
  }
}

export class RateLimitError extends AppError {
  static readonly code = 'RATE_LIMIT_EXCEEDED';
  constructor(message = 'Rate limit exceeded') {
    super(message, RateLimitError.code, 429);
  }
}

export class ExternalApiError extends AppError {
  static readonly code = 'EXTERNAL_API_ERROR';
  readonly source: string;
  readonly upstreamStatus?: number;

  constructor(message: string, source: string, upstreamStatus?: number) {
    super(message, ExternalApiError.code, 502);
    this.source = source;
    this.upstreamStatus = upstreamStatus;
  }
}

export class CircuitOpenError extends AppError {
  static readonly code = 'CIRCUIT_OPEN';
  readonly source: string;

  constructor(source: string) {
    super(`Circuit breaker open for ${source}`, CircuitOpenError.code, 503);
    this.source = source;
  }
}

export class TimeoutError extends AppError {
  static readonly code = 'TIMEOUT';
  constructor(message = 'Request timed out') {
    super(message, TimeoutError.code, 504);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
