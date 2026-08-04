export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  invalidCredentials: () =>
    new AppError(401, "invalid_credentials", "Invalid email or password."),
  emailTaken: () => new AppError(409, "email_taken", "An account with that email already exists."),
  unauthorized: () => new AppError(401, "unauthorized", "Authentication required."),
  accountDisabled: () => new AppError(403, "account_disabled", "This account is disabled."),
  invalidRefreshToken: () =>
    new AppError(401, "invalid_refresh_token", "Refresh token is invalid or expired."),
  validation: (message: string) => new AppError(400, "validation_error", message),
  forbidden: () => new AppError(403, "forbidden", "You don't have access to this."),
  notFound: (what: string) => new AppError(404, "not_found", `${what} not found.`),
  noRelationship: () =>
    new AppError(
      400,
      "no_relationship",
      "You can only grant access to someone you have an active buddy or coach relationship with.",
    ),
  conflict: (message: string) => new AppError(409, "conflict", message),
};
