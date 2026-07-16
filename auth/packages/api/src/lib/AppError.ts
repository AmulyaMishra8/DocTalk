// A typed error we throw on purpose. The global error handler turns it into a
// clean JSON response with the right HTTP status. Anything that ISN'T an
// AppError is treated as an unexpected bug and returned as a generic 500.

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

// Convenience constructors for the cases we hit a lot.
export const Errors = {
  badRequest: (msg = "Bad request", details?: unknown) =>
    new AppError(400, "bad_request", msg, details),
  unauthorized: (msg = "Not authenticated") => new AppError(401, "unauthorized", msg),
  forbidden: (msg = "Forbidden") => new AppError(403, "forbidden", msg),
  notFound: (msg = "Not found") => new AppError(404, "not_found", msg),
  conflict: (msg = "Already exists") => new AppError(409, "conflict", msg),
  tooMany: (msg = "Too many requests") => new AppError(429, "too_many_requests", msg),
  // Deliberately vague — we never tell an attacker WHICH part was wrong.
  invalidCredentials: () => new AppError(401, "invalid_credentials", "Invalid email or password"),
};
