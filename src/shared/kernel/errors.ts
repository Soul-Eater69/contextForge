export class AppError extends Error {
  constructor(
    message: string,
    readonly code = "app_error",
    readonly statusCode = 400,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, identifier: string) {
    super(`${resource} not found: ${identifier}`, "not_found", 404, {
      resource,
      identifier,
    });
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "conflict", 409, details);
  }
}

export class PolicyError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "policy_violation", 403, details);
  }
}

export const invariant: (
  condition: unknown,
  message: string,
  code?: string,
  statusCode?: number,
) => asserts condition = (
  condition: unknown,
  message: string,
  code = "invalid_request",
  statusCode = 400,
): asserts condition => {
  if (!condition) {
    throw new AppError(message, code, statusCode);
  }
};
