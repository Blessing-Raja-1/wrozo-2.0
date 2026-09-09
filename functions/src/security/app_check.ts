import { getBackendConfig } from "../config/environment";
import { AuthContext } from "../auth/auth_helpers";
import { AuthError, ConflictError } from "../shared/errors";
import { logger } from "../shared/logger";

/**
 * App Check Security & Abuse-Protection Module
 *
 * CRITICAL ARCHITECTURAL PRINCIPLES:
 * 1. Firebase Authentication proves WHO the user is.
 * 2. Cloud Functions & Firestore Rules enforce WHAT the user can do (Capabilities/Roles).
 * 3. Firebase App Check verifies that traffic originates from an authentic Wrozo app.
 * 4. App Check must NEVER replace authentication or capability authorization.
 * 5. App Check attestation alone grants zero permissions or administrative elevation.
 */

/**
 * Evaluates whether Firebase App Check should be strictly enforced on callable endpoints.
 *
 * Logic:
 * - If `ENFORCE_APP_CHECK` env var is explicitly set ("true" or "false"), respect it.
 * - In production (`getBackendConfig().isProduction === true`), enforce by default.
 * - In local emulator / development / test suites, defaults to `false` to prevent blocking
 *   local integration tests and administrative tasks without Play Integrity hardware tokens.
 */
export function shouldEnforceAppCheck(): boolean {
  if (process.env.ENFORCE_APP_CHECK === "true") return true;
  if (process.env.ENFORCE_APP_CHECK === "false") return false;
  return getBackendConfig().isProduction;
}

export interface AppCheckVerificationResult {
  verified: boolean;
  appId?: string;
  alreadyConsumed?: boolean;
}

/**
 * Validates App Check attestation on an incoming callable request context.
 *
 * @param context The CallableRequest or AuthContext containing `app` metadata.
 * @param options Optional overrides for strictness and token replay rejection.
 *
 * @throws {AuthError} If App Check is required and token is missing or invalid.
 * @throws {ConflictError} If replay rejection is enabled and token was already consumed.
 */
export function verifyAppCheck(
  context: AuthContext | undefined,
  options?: {
    required?: boolean;
    rejectReplay?: boolean;
  }
): AppCheckVerificationResult {
  const isRequired = options?.required ?? shouldEnforceAppCheck();
  const appData = context?.app;

  if (isRequired && !appData) {
    throw new AuthError(
      "App Check verification failed. Request must originate from an authentic Wrozo application."
    );
  }

  if (appData?.alreadyConsumed && options?.rejectReplay) {
    throw new ConflictError(
      "App Check token has already been consumed. Replay attempt rejected."
    );
  }

  const tokenObj = appData?.token as Record<string, unknown> | undefined;
  const appId = (tokenObj?.app_id || tokenObj?.sub) as string | undefined;

  return {
    verified: Boolean(appData),
    appId,
    alreadyConsumed: Boolean(appData?.alreadyConsumed),
  };
}

/**
 * Structured logger helper to record App Check attestation state on sensitive operations.
 */
export function logAppCheckStatus(
  action: string,
  context: AuthContext | undefined
): void {
  const isVerified = Boolean(context?.app);
  const tokenObj = context?.app?.token as Record<string, unknown> | undefined;
  const appId = tokenObj?.app_id || tokenObj?.sub || "none";

  logger.info(`App Check attestation [${action}]: ${isVerified ? "VERIFIED" : "UNVERIFIED/DEV"}`, {
    action,
    callerUid: context?.auth?.uid ?? "anonymous",
    appCheckVerified: isVerified,
    appId: typeof appId === "string" ? appId : "unknown",
    alreadyConsumed: Boolean(context?.app?.alreadyConsumed),
  });
}
