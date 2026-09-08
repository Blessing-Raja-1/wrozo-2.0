import { db } from "../config/firebase";
import { requireContractor, AuthContext } from "../auth/auth_helpers";
import { ValidationError, NotFoundError, ForbiddenError, ConflictError } from "../shared/errors";
import { logger } from "../shared/logger";
import { JobRecord, PaymentStatus } from "../shared/types";

/**
 * Payment Service (Server-side Authoritative Payment Processing)
 *
 * CRITICAL TRUST BOUNDARY:
 * 1. The mobile Flutter client is COMPLETELY UNTRUSTED for payments.
 * 2. `firestore.rules` enforces `allow write: if false` on `/payments/{paymentId}`.
 * 3. Only this server layer (running with Admin SDK credentials) can create or update
 *    payment records in Firestore.
 * 4. Payment completion MUST be verified through server-to-server cryptographic
 *    signature verification of Razorpay webhooks (`RAZORPAY_WEBHOOK_SECRET`).
 */

export interface CreatePaymentOrderInput {
  jobId: string;
  workerId: string;
  amountInPaise: number; // Stored in smallest currency unit (paise) to prevent floating point inaccuracies
}

export interface PaymentOrderResult {
  orderId: string;
  paymentId: string;
  amount: number;
  currency: string;
}

export interface WebhookVerificationInput {
  rawBody: string;
  signature: string;
  webhookSecret: string;
}

export const paymentService = {
  /**
   * Prepares and validates a payment order for a completed or milestone job.
   *
   * Future implementation:
   * 1. Verifies caller is contractor who owns the job.
   * 2. Calls Razorpay API (`POST /v1/orders`) using `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`.
   * 3. Creates `/payments/{paymentId}` in Firestore with status "PENDING".
   * 4. Returns order ID and key ID to client for Razorpay Checkout sheet display.
   */
  async createPaymentOrder(
    context: AuthContext | undefined,
    input: CreatePaymentOrderInput
  ): Promise<PaymentOrderResult> {
    const { uid: contractorUid } = await requireContractor(context);

    if (!input.jobId || !input.workerId || !input.amountInPaise || input.amountInPaise <= 0) {
      throw new ValidationError("jobId, workerId, and positive amountInPaise are required.");
    }

    const jobDoc = await db.collection("jobs").doc(input.jobId).get();
    if (!jobDoc.exists) {
      throw new NotFoundError(`Job [${input.jobId}]`);
    }

    const jobData = jobDoc.data() as JobRecord;
    if (jobData.contractorId !== contractorUid) {
      throw new ForbiddenError("Only the contractor who posted this job can initiate payments.");
    }

    // Architecture blueprint: Fails safe until Razorpay keys are configured in Secret Manager
    logger.info("Payment order creation requested (blueprint validation passed)", {
      action: "createPaymentOrder",
      callerUid: contractorUid,
      jobId: input.jobId,
      workerId: input.workerId,
      amountInPaise: input.amountInPaise,
    });

    throw new ConflictError(
      "Payment gateway integration is currently pending server configuration. Direct client payments are disabled for security."
    );
  },

  /**
   * Authoritatively updates payment status in Firestore.
   *
   * Callable ONLY by trusted server-side handlers (e.g., webhook receiver).
   * Never exposed directly to client callable functions.
   */
  async updatePaymentStatusServerOnly(
    paymentId: string,
    status: PaymentStatus,
    razorpayDetails?: {
      orderId?: string;
      paymentId?: string;
      signature?: string;
    }
  ): Promise<void> {
    const paymentRef = db.collection("payments").doc(paymentId);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
      throw new NotFoundError(`Payment record [${paymentId}]`);
    }

    await paymentRef.update({
      status,
      completedAt: status === "COMPLETED" ? new Date() : null,
      ...(razorpayDetails ? { razorpayDetails } : {}),
      updatedAt: new Date(),
    });

    logger.info("Server-side payment status updated", {
      action: "updatePaymentStatusServerOnly",
      paymentId,
      status,
    });
  },
};
