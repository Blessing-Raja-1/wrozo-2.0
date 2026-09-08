import { logger as fbLogger } from "firebase-functions";

/**
 * List of sensitive key names that must be redacted automatically from logs.
 */
const SENSITIVE_KEYS = new Set([
  "password",
  "token",
  "idtoken",
  "refreshtoken",
  "accesstoken",
  "secret",
  "keysecret",
  "webhooksecret",
  "otp",
  "authcode",
  "verificationcode",
  "passcode",
  "secretcode",
  "authorization",
  "auth",
  "signature",
  "razorpaysignature",
  "pan",
  "aadhaar",
  "bankaccount",
  "accountnumber",
  "credential",
  "credentials",
  "privatekey",
]);

/**
 * Recursively redacts sensitive keys from any metadata object before logging.
 */
export function sanitizeLogData(data: unknown, depth = 0): unknown {
  if (depth > 5 || data === null || data === undefined) {
    return data;
  }

  if (typeof data !== "object") {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item, depth + 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeLogData(value, depth + 1);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export interface StructuredLogPayload {
  action: string;
  callerUid?: string;
  [key: string]: unknown;
}

/**
 * Structured Logger for Wrozo Cloud Functions.
 * Enforces sanitization of sensitive values before emission.
 */
export const logger = {
  info: (message: string, payload?: StructuredLogPayload): void => {
    fbLogger.info(message, payload ? (sanitizeLogData(payload) as object) : undefined);
  },
  warn: (message: string, payload?: StructuredLogPayload): void => {
    fbLogger.warn(message, payload ? (sanitizeLogData(payload) as object) : undefined);
  },
  error: (message: string, payload?: StructuredLogPayload): void => {
    fbLogger.error(message, payload ? (sanitizeLogData(payload) as object) : undefined);
  },
  debug: (message: string, payload?: StructuredLogPayload): void => {
    fbLogger.debug(message, payload ? (sanitizeLogData(payload) as object) : undefined);
  },
};
