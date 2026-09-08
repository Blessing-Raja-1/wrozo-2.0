import { onCall, CallableRequest } from "firebase-functions/v2/https";
import { getBackendConfig } from "./config/environment";
import { handleFunctionError } from "./shared/errors";
import { logger } from "./shared/logger";

// Export services and configuration for backend modularity
export * from "./config/firebase";
export * from "./config/environment";
export * from "./shared/types";
export * from "./shared/errors";
export * from "./shared/logger";
export * from "./auth/auth_helpers";
export * from "./users/user_service";
export * from "./jobs/job_service";
export * from "./applications/application_service";
export * from "./chat/chat_service";
export * from "./payments/payment_service";

/**
 * Authoritative Backend Status / Healthcheck Callable Function
 *
 * Provides safe verification of server connectivity, configuration, and auth context
 * without exposing internal keys, credentials, or environment secrets.
 */
export const getBackendStatus = onCall(
  {
    region: "asia-south1",
    cors: true,
  },
  async (request: CallableRequest) => {
    try {
      const config = getBackendConfig();
      const callerUid = request.auth?.uid ?? null;

      logger.info("Backend status checked", {
        action: "getBackendStatus",
        callerUid: callerUid ?? "anonymous",
      });

      return {
        status: "ONLINE",
        version: "2.0.0",
        environment: config.deploymentEnv,
        region: config.region,
        timestamp: new Date().toISOString(),
        authenticated: callerUid !== null,
        callerUid: callerUid,
      };
    } catch (error) {
      throw handleFunctionError(error, "getBackendStatus", request.auth?.uid);
    }
  }
);
