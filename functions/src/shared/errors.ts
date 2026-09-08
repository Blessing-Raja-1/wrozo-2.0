import { HttpsError, FunctionsErrorCode } from "firebase-functions/v2/https";
import { logger } from "./logger";

/**
 * Base Application Error class for controlled domain errors.
 */
export class AppError extends Error {
  public readonly code: FunctionsErrorCode;
  public readonly clientMessage: string;
  public readonly internalDetails?: unknown;

  constructor(
    code: FunctionsErrorCode,
    clientMessage: string,
    internalDetails?: unknown
  ) {
    super(clientMessage);
    this.name = "AppError";
    this.code = code;
    this.clientMessage = clientMessage;
    this.internalDetails = internalDetails;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AuthError extends AppError {
  constructor(message = "Authentication required.", internalDetails?: unknown) {
    super("unauthenticated", message, internalDetails);
    this.name = "AuthError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Permission denied.", internalDetails?: unknown) {
    super("permission-denied", message, internalDetails);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, internalDetails?: unknown) {
    super("not-found", `${resource} not found.`, internalDetails);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, internalDetails?: unknown) {
    super("invalid-argument", message, internalDetails);
    this.name = "ValidationError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, internalDetails?: unknown) {
    super("failed-precondition", message, internalDetails);
    this.name = "ConflictError";
  }
}

/**
 * Sanitizes and converts any thrown error into a safe client-facing HttpsError.
 *
 * CRITICAL SECURITY INVARIANTS:
 * 1. Stack traces are NEVER returned to the client.
 * 2. Unchecked internal error messages are logged privately to the server console
 *    and replaced with a generic message for the client.
 * 3. Secrets, internal database IDs, and raw system exceptions are never exposed.
 */
export function handleFunctionError(
  error: unknown,
  actionName: string,
  callerUid?: string
): HttpsError {
  if (error instanceof HttpsError) {
    return error;
  }

  if (error instanceof AppError) {
    logger.warn(`Controlled domain error in [${actionName}]`, {
      action: actionName,
      callerUid: callerUid ?? "anonymous",
      code: error.code,
      clientMessage: error.clientMessage,
      internalDetails: error.internalDetails,
    });
    return new HttpsError(error.code, error.clientMessage);
  }

  // Unhandled / system error — log detailed stack trace server-side only
  logger.error(`Unhandled system error in [${actionName}]`, {
    action: actionName,
    callerUid: callerUid ?? "anonymous",
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  return new HttpsError(
    "internal",
    "An internal error occurred. Please try again later."
  );
}
