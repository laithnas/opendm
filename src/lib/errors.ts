// Predictable error handling: a small typed error class hierarchy mapped to
// HTTP status codes at the API boundary.

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status = 500,
    public readonly code = "INTERNAL_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do this") {
    super(message, 403, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, "VALIDATION_ERROR", details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Rate limit exceeded") {
    super(message, 429, "RATE_LIMITED");
  }
}

/** Provider (Meta) rejected the request — e.g. outside messaging window. */
export class ProviderError extends AppError {
  constructor(message: string, public readonly providerCode?: string) {
    super(message, 502, "PROVIDER_ERROR", { providerCode });
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}