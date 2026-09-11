import type { ApiErrorBody, ApiErrorCode, FieldIssue } from '@billio/shared';

/** One error type for the whole API, so every failure serialises identically. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly issues: FieldIssue[] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static validation(issues: FieldIssue[]): ApiError {
    const summary =
      issues.length === 1
        ? (issues[0]?.message ?? 'Invalid search parameters.')
        : `${issues.length} search parameters are invalid.`;
    return new ApiError(400, 'VALIDATION_ERROR', summary, issues);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, issues: this.issues } };
  }
}
