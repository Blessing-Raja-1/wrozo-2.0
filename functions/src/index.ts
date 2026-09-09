import { onCall, onRequest, CallableRequest } from "firebase-functions/v2/https";
import {
  getBackendConfig,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET,
} from "./config/environment";
import {
  handleFunctionError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from "./shared/errors";
import { logger } from "./shared/logger";
import { jobService } from "./jobs/job_service";
import { applicationService } from "./applications/application_service";
import { paymentService } from "./payments/payment_service";
import {
  CreateJobInput,
  TransitionJobStatusInput,
  ApplyForJobInput,
  AcceptApplicationInput,
  RejectApplicationInput,
  WithdrawApplicationInput,
  CreatePaymentOrderInput,
} from "./shared/types";

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
export * from "./payments/razorpay_gateway";
export * from "./payments/payment_service";


const REGION = "asia-south1";

/**
 * Authoritative Backend Status / Healthcheck Callable Function
 */
export const getBackendStatus = onCall(
  { region: REGION, cors: true },
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

/**
 * Authoritative Job Creation Callable
 */
export const createJob = onCall(
  { region: REGION, cors: true },
  async (request: CallableRequest<CreateJobInput>) => {
    try {
      return await jobService.createJob(request, request.data);
    } catch (error) {
      throw handleFunctionError(error, "createJob", request.auth?.uid);
    }
  }
);

/**
 * Authoritative Job Lifecycle State Transition Callable
 */
export const transitionJobStatus = onCall(
  { region: REGION, cors: true },
  async (request: CallableRequest<TransitionJobStatusInput>) => {
    try {
      await jobService.transitionJobStatus(request, request.data);
      return { success: true };
    } catch (error) {
      throw handleFunctionError(error, "transitionJobStatus", request.auth?.uid);
    }
  }
);

/**
 * Authoritative Worker Job Application Callable
 */
export const applyForJob = onCall(
  { region: REGION, cors: true },
  async (request: CallableRequest<ApplyForJobInput>) => {
    try {
      return await applicationService.applyForJob(request, request.data);
    } catch (error) {
      throw handleFunctionError(error, "applyForJob", request.auth?.uid);
    }
  }
);

/**
 * Authoritative Transactional Application Acceptance Callable
 */
export const acceptApplication = onCall(
  { region: REGION, cors: true },
  async (request: CallableRequest<AcceptApplicationInput>) => {
    try {
      return await applicationService.acceptApplication(request, request.data);
    } catch (error) {
      throw handleFunctionError(error, "acceptApplication", request.auth?.uid);
    }
  }
);

/**
 * Authoritative Application Rejection Callable
 */
export const rejectApplication = onCall(
  { region: REGION, cors: true },
  async (request: CallableRequest<RejectApplicationInput>) => {
    try {
      await applicationService.rejectApplication(request, request.data);
      return { success: true };
    } catch (error) {
      throw handleFunctionError(error, "rejectApplication", request.auth?.uid);
    }
  }
);

/**
 * Authoritative Worker Application Withdrawal Callable
 */
export const withdrawApplication = onCall(
  { region: REGION, cors: true },
  async (request: CallableRequest<WithdrawApplicationInput>) => {
    try {
      await applicationService.withdrawApplication(request, request.data);
      return { success: true };
    } catch (error) {
      throw handleFunctionError(error, "withdrawApplication", request.auth?.uid);
    }
  }
);

/**
 * Authoritative Server-Side Razorpay Order Creation Callable
 */
export const createPaymentOrder = onCall(
  {
    region: REGION,
    cors: true,
    secrets: [RAZORPAY_KEY_SECRET],
  },
  async (request: CallableRequest<CreatePaymentOrderInput>) => {
    try {
      return await paymentService.createPaymentOrder(request, request.data);
    } catch (error) {
      throw handleFunctionError(error, "createPaymentOrder", request.auth?.uid);
    }
  }
);

/**
 * Authoritative Razorpay Webhook HTTPS Endpoint
 */
export const handlePaymentWebhook = onRequest(
  {
    region: REGION,
    cors: false,
    secrets: [RAZORPAY_WEBHOOK_SECRET],
  },
  async (req, res) => {
    try {
      if (req.method !== "POST") {
        res.status(405).send({ error: "Method Not Allowed" });
        return;
      }

      const signature = req.headers["x-razorpay-signature"] as string | undefined;
      const rawBody = req.rawBody || JSON.stringify(req.body);

      const result = await paymentService.processWebhookEvent({
        rawBody,
        signature,
      });

      res.status(200).send(result);
    } catch (error) {
      logger.error("Error processing Razorpay webhook", {
        action: "handlePaymentWebhook",
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof ValidationError) {
        res.status(400).send({ error: error.message });
        return;
      }
      if (error instanceof NotFoundError) {
        res.status(404).send({ error: error.message });
        return;
      }
      if (error instanceof ConflictError) {
        res.status(409).send({ error: error.message });
        return;
      }

      res.status(500).send({ error: "Internal server error processing webhook." });
    }
  }
);
