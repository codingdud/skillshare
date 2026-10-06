import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
function errorCode(error: unknown): string | undefined {
  return typeof error === 'object' && error && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}
export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION',
        message: 'Check the highlighted fields.',
        details: error.issues,
      },
    });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
    res.status(409).json({
      error: { code: 'CONFLICT', message: 'This name, email, or version already exists.' },
    });
    return;
  }
  if (
    typeof error === 'object' &&
    error &&
    'type' in error &&
    (error.type === 'entity.parse.failed' || error.type === 'entity.too.large')
  ) {
    res.status(error.type === 'entity.too.large' ? 413 : 400).json({
      error: {
        code: error.type === 'entity.too.large' ? 'PAYLOAD_TOO_LARGE' : 'BAD_REQUEST',
        message:
          error.type === 'entity.too.large'
            ? 'JSON request exceeds the permitted transport limit.'
            : 'Invalid JSON request.',
      },
    });
    return;
  }
  const causes = error instanceof AggregateError ? error.errors.map(errorCode).filter(Boolean) : [];
  const code = errorCode(error);
  console.error('Request failed', {
    method: req.method,
    path: req.path,
    name: error instanceof Error ? error.name : 'UnknownError',
    code,
    causes,
  });
  const unavailableCodes = [
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    '57P01',
    '57P02',
    '57P03',
    '53300',
    '08006',
  ];
  if ([code, ...causes].some((value) => value && unavailableCodes.includes(value))) {
    res.status(503).json({
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'The service is temporarily unavailable. Please try again shortly.',
      },
    });
    return;
  }
  res.status(500).json({
    error: {
      code: 'INTERNAL',
      message: 'Something went wrong. Your draft has not been discarded.',
    },
  });
};
