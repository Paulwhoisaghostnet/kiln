import type { ZodError } from 'zod';

export function validationErrorMessage(error: ZodError): string {
  return error.issues.map((issue) => issue.message).join('; ');
}

export function asMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
