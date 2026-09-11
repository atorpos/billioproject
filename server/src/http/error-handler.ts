import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { ApiErrorBody } from '@billio/shared';
import { ApiError } from './errors.js';

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`No route matches ${req.method} ${req.path}.`));
};

/**
 * Terminal error handler. Anything unexpected becomes a 500 with a generic
 * message — internal details are logged, never returned to the client.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ApiError) {
    res.status(error.status).json(error.toBody());
    return;
  }

  console.error('[api] unhandled error', error);
  const body: ApiErrorBody = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong while handling the request.',
      issues: [],
    },
  };
  res.status(500).json(body);
};
