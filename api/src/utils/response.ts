import type { Response } from 'express';
import type { ApiSuccess, ApiError } from '@bazarhq/shared';

export function ok<T>(res: Response, data: T, status = 200): Response {
  return res.status(status).json({ success: true, data } satisfies ApiSuccess<T>);
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, 201);
}

export function fail(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: Record<string, string[]>
): Response {
  return res.status(status).json({
    success: false,
    error: { code, message, ...(details && { details }) },
  } satisfies ApiError);
}
