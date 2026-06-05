import type { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { fail } from '../utils/response';

export function validate(schema: ZodSchema, target: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const details = formatZodError(result.error);
      return fail(res, 422, 'VALIDATION_ERROR', 'Validation failed', details);
    }
    req[target] = result.data;
    next();
  };
}

function formatZodError(error: ZodError): Record<string, string[]> {
  return error.errors.reduce<Record<string, string[]>>((acc, issue) => {
    const key = issue.path.join('.') || '_root';
    if (!acc[key]) acc[key] = [];
    acc[key].push(issue.message);
    return acc;
  }, {});
}
