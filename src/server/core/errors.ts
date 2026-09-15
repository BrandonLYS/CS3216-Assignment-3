export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "forbidden" | "validation" | "conflict",
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  constructor(what: string) {
    super(`${what} not found`, "not_found");
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "You do not have access to this resource") {
    super(message, "forbidden");
  }
}

export class ValidationError extends DomainError {
  constructor(
    message: string,
    readonly fieldErrors: Record<string, string[]> = {},
  ) {
    super(message, "validation");
  }
}

export class ConflictError extends DomainError {
  constructor(message: string) {
    super(message, "conflict");
  }
}
