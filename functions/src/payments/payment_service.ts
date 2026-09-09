import { Timestamp } from "firebase-admin/firestore";
import { db } from "../config/firebase";
import { requireContractor, AuthContext } from "../auth/auth_helpers";
import {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  AppError,
} from "../shared/errors";
import { logger } from "../shared/logger";
import {
  JobRecord,
  ApplicationRecord,
  PaymentRecord,
  PaymentStatus,
  CreatePaymentOrderInput,
  PaymentOrderResult,
  WebhookEventRecord,
} from "../shared/types";
import {
  getRazorpayKeyId,
  getRazorpayKeySecret,
  getRazorpayWebhookSecret,
} from "../config/environment";
import {
  IRazorpayGateway,
  HttpRazorpayGateway,
  verifyRazorpayWebhookSignature,
} from "./razorpay_gateway";
import { notificationService } from "../notifications/notification_service";

/**
 * Authoritative Payment State Machine
 *
 * Valid Transitions:
 * CREATED -> AUTHORIZED -> CAPTURED
 * CREATED -> CAPTURED
 * CREATED -> FAILED
 * AUTHORIZED -> FAILED
 * CAPTURED -> REFUNDED
 *
 * Terminal States: FAILED, REFUNDED
 */
export const VALID_PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  CREATED: ["AUTHORIZED", "CAPTURED", "FAILED"],
  AUTHORIZED: ["CAPTURED", "FAILED"],
  CAPTURED: ["REFUNDED"],
  FAILED: [],
  REFUNDED: [],
  PENDING: ["AUTHORIZED", "CAPTURED", "FAILED", "COMPLETED"], // Legacy compatibility
  COMPLETED: ["REFUNDED"], // Legacy compatibility
};

export function isValidPaymentTransition(current: PaymentStatus, target: PaymentStatus): boolean {
  if (current === target) return true; // Idempotent same-state transition
  const allowed = VALID_PAYMENT_TRANSITIONS[current] || [];
  return allowed.includes(target);
}

export interface WebhookProcessResult {
  status: "success" | "ignored";
  reason?: string;
  eventId: string;
  paymentId?: string;
  previousStatus?: PaymentStatus;
  newStatus?: PaymentStatus;
}

class PaymentService {
  private gateway: IRazorpayGateway | null = null;

  /**
   * Returns active Razorpay gateway instance.
   * Lazily initialized using Secret Manager credentials or custom injected gateway.
   */
  getGateway(): IRazorpayGateway {
    if (!this.gateway) {
      const keyId = getRazorpayKeyId();
      const keySecret = getRazorpayKeySecret();
      this.gateway = new HttpRazorpayGateway(keyId, keySecret);
    }
    return this.gateway;
  }

  /**
   * Injects a custom gateway for backend unit tests.
   */
  setGateway(gateway: IRazorpayGateway): void {
    this.gateway = gateway;
  }

  /**
   * Resets injected gateway back to default lazy resolution.
   */
  resetGateway(): void {
    this.gateway = null;
  }

  /**
   * Authoritatively creates a Razorpay payment order for an accepted worker.
   *
   * Security & Trust Invariants:
   * 1. Requires authenticated CONTRACTOR role.
   * 2. Caller must own the job.
   * 3. Job status must be IN_PROGRESS or COMPLETED.
   * 4. Worker must have an ACCEPTED application on this job.
   * 5. Authoritative amount is derived strictly server-side from job wage (wage * 100 paise).
   * 6. Client amount hints are never trusted.
   * 7. Duplicate payments for captured work are strictly blocked.
   * 8. Active orders in CREATED status are reused idempotently.
   */
  async createPaymentOrder(
    context: AuthContext | undefined,
    input: CreatePaymentOrderInput
  ): Promise<PaymentOrderResult> {
    const { uid: contractorUid } = await requireContractor(context);

    if (!input || !input.jobId || typeof input.jobId !== "string" || input.jobId.trim() === "") {
      throw new ValidationError("jobId is required and must be a non-empty string.");
    }

    if (!input.workerId || typeof input.workerId !== "string" || input.workerId.trim() === "") {
      throw new ValidationError("workerId is required and must be a non-empty string.");
    }

    const trimmedJobId = input.jobId.trim();
    const trimmedWorkerId = input.workerId.trim();

    // 1. Validate Job Existence, Ownership, and State
    const jobDoc = await db.collection("jobs").doc(trimmedJobId).get();
    if (!jobDoc.exists) {
      throw new NotFoundError(`Job [${trimmedJobId}]`);
    }

    const jobData = jobDoc.data() as JobRecord;
    if (jobData.contractorId !== contractorUid) {
      throw new ForbiddenError("Only the contractor who posted this job can initiate payments.");
    }

    if (jobData.status !== "IN_PROGRESS" && jobData.status !== "COMPLETED") {
      throw new ConflictError(
        `Payments can only be created for jobs in IN_PROGRESS or COMPLETED status. Current job status: [${jobData.status}].`
      );
    }

    // 2. Validate Accepted Application
    const applicationId = `${trimmedJobId}_${trimmedWorkerId}`;
    const appDoc = await db.collection("applications").doc(applicationId).get();
    if (!appDoc.exists) {
      throw new NotFoundError(`Application for worker [${trimmedWorkerId}] on job [${trimmedJobId}]`);
    }

    const appData = appDoc.data() as ApplicationRecord;
    if (appData.status !== "ACCEPTED") {
      throw new ConflictError(
        `Payments can only be initiated for workers with an ACCEPTED application. Current application status: [${appData.status}].`
      );
    }

    // 3. Authoritatively Derive Payable Amount Server-Side
    if (typeof jobData.wage !== "number" || !Number.isFinite(jobData.wage) || jobData.wage <= 0) {
      throw new ValidationError("Job record has an invalid non-positive wage.");
    }

    const authoritativeAmountInPaise = Math.round(jobData.wage * 100);
    if (authoritativeAmountInPaise <= 0) {
      throw new ValidationError("Authoritative payment amount must be greater than zero.");
    }

    // If client supplied an amount hint that doesn't match authoritative, log warning
    if (input.amountInPaise && input.amountInPaise !== authoritativeAmountInPaise) {
      logger.warn("Client submitted payment amount mismatch. Overriding with authoritative job wage.", {
        action: "createPaymentOrder",
        clientAmount: input.amountInPaise,
        authoritativeAmount: authoritativeAmountInPaise,
        jobId: trimmedJobId,
      });
    }

    // 4. Idempotency & Duplicate Order Prevention
    const existingPaymentsSnap = await db
      .collection("payments")
      .where("jobId", "==", trimmedJobId)
      .where("workerId", "==", trimmedWorkerId)
      .get();

    for (const doc of existingPaymentsSnap.docs) {
      const payment = doc.data() as PaymentRecord;
      if (payment.status === "CAPTURED" || payment.status === "COMPLETED") {
        throw new ConflictError(
          `Payment has already been captured for worker [${trimmedWorkerId}] on job [${trimmedJobId}]. Duplicate payment rejected.`
        );
      }

      // Re-use active uncaptured order if already created
      if ((payment.status === "CREATED" || payment.status === "AUTHORIZED") && payment.razorpayOrderId) {
        logger.info("Reusing existing active Razorpay payment order (idempotent)", {
          action: "createPaymentOrder",
          orderId: payment.razorpayOrderId,
          paymentId: doc.id,
          jobId: trimmedJobId,
        });

        return {
          orderId: payment.razorpayOrderId,
          paymentId: doc.id,
          amount: payment.amount,
          currency: payment.currency || "INR",
          keyId: getRazorpayKeyId(),
        };
      }
    }

    // 5. Create Order via Razorpay Gateway
    const paymentRef = db.collection("payments").doc();
    const paymentId = paymentRef.id;
    const receipt = `rcpt_${paymentId.substring(0, 30)}`;

    const order = await this.getGateway().createOrder({
      amount: authoritativeAmountInPaise,
      currency: "INR",
      receipt,
      notes: {
        paymentId,
        jobId: trimmedJobId,
        workerId: trimmedWorkerId,
        contractorId: contractorUid,
      },
    });

    // 6. Record Initial Payment Document in Firestore
    const paymentRecord: PaymentRecord = {
      jobId: trimmedJobId,
      workerId: trimmedWorkerId,
      contractorId: contractorUid,
      amount: authoritativeAmountInPaise,
      currency: "INR",
      status: "CREATED",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      razorpayOrderId: order.id,
    };

    await paymentRef.set(paymentRecord);

    logger.info("Razorpay payment order authoritatively created", {
      action: "createPaymentOrder",
      callerUid: contractorUid,
      paymentId,
      orderId: order.id,
      amountInPaise: authoritativeAmountInPaise,
      jobId: trimmedJobId,
    });

    return {
      orderId: order.id,
      paymentId,
      amount: authoritativeAmountInPaise,
      currency: "INR",
      keyId: getRazorpayKeyId(),
    };
  }

  /**
   * Cryptographically verifies and idempotently processes Razorpay webhook events.
   *
   * Security & Idempotency Invariants:
   * 1. Requires valid HMAC-SHA256 signature using RAZORPAY_WEBHOOK_SECRET.
   * 2. Deduplicates event deliveries using `/webhook_events/{eventId}`.
   * 3. Validates order ID, amount, and metadata consistency against stored payment record.
   * 4. Enforces authoritative state machine transitions; rejects illegal transitions.
   * 5. Sanitizes all logging to prevent secret or signature leakage.
   */
  async processWebhookEvent(input: {
    rawBody: string | Buffer;
    signature: string | undefined;
    secret?: string;
  }): Promise<WebhookProcessResult> {
    const webhookSecret = input.secret || getRazorpayWebhookSecret();
    if (!webhookSecret) {
      throw new AppError(
        "internal",
        "Razorpay webhook secret is not configured in Google Cloud Secret Manager.",
        "Missing RAZORPAY_WEBHOOK_SECRET."
      );
    }

    // 1. Signature Verification
    const isValid = verifyRazorpayWebhookSignature(input.rawBody, input.signature, webhookSecret);
    if (!isValid) {
      logger.warn("Razorpay webhook signature verification failed", {
        action: "processWebhookEvent",
      });
      throw new ValidationError("Invalid or missing Razorpay webhook signature.");
    }

    // 2. Parse Webhook Payload
    const bodyStr = typeof input.rawBody === "string" ? input.rawBody : input.rawBody.toString("utf8");
    let payload: any;
    try {
      payload = JSON.parse(bodyStr);
    } catch {
      throw new ValidationError("Malformed JSON payload in webhook body.");
    }

    const eventId: string = payload.event_id || payload.id;
    const eventType: string = payload.event;

    if (!eventId || !eventType) {
      throw new ValidationError("Webhook payload missing event or event_id metadata.");
    }

    // 3. Idempotency Check (Deduplication)
    const eventRef = db.collection("webhook_events").doc(eventId);
    const eventDoc = await eventRef.get();
    if (eventDoc.exists) {
      logger.info("Duplicate webhook event ignored", {
        action: "processWebhookEvent",
        eventId,
        eventType,
      });
      return {
        status: "ignored",
        reason: "duplicate_event",
        eventId,
      };
    }

    // 4. Extract Entity & Target Status
    const paymentEntity = payload.payload?.payment?.entity;
    const orderEntity = payload.payload?.order?.entity;

    const orderId: string | undefined = paymentEntity?.order_id || orderEntity?.id;
    const paymentGatewayId: string | undefined = paymentEntity?.id;
    const amount: number | undefined = paymentEntity?.amount || orderEntity?.amount;
    const notes = paymentEntity?.notes || orderEntity?.notes || {};
    const paymentIdHint: string | undefined = notes.paymentId;

    let targetStatus: PaymentStatus | null = null;
    switch (eventType) {
      case "payment.authorized":
        targetStatus = "AUTHORIZED";
        break;
      case "payment.captured":
      case "order.paid":
        targetStatus = "CAPTURED";
        break;
      case "payment.failed":
        targetStatus = "FAILED";
        break;
      case "refund.processed":
      case "payment.refunded":
        targetStatus = "REFUNDED";
        break;
      default:
        // Ignore unhandled event types idempotently
        await eventRef.set({
          eventId,
          eventType,
          processedAt: Timestamp.now(),
          status: "IGNORED",
          reason: `Unhandled event type [${eventType}]`,
        } as WebhookEventRecord);

        return {
          status: "ignored",
          reason: `Unhandled event type [${eventType}]`,
          eventId,
        };
    }

    // 5. Locate Matching Payment Record
    let paymentDocRef;
    if (paymentIdHint) {
      paymentDocRef = db.collection("payments").doc(paymentIdHint);
      const snap = await paymentDocRef.get();
      if (!snap.exists) {
        paymentDocRef = null;
      }
    }

    if (!paymentDocRef && orderId) {
      const orderQuery = await db
        .collection("payments")
        .where("razorpayOrderId", "==", orderId)
        .limit(1)
        .get();

      if (!orderQuery.empty) {
        paymentDocRef = orderQuery.docs[0].ref;
      }
    }

    if (!paymentDocRef) {
      throw new NotFoundError(`Payment record matching order [${orderId}] or ID [${paymentIdHint}]`);
    }

    const paymentDoc = await paymentDocRef.get();
    const payment = paymentDoc.data() as PaymentRecord;
    const paymentId = paymentDoc.id;

    // 6. Security Consistency Validations (Detect Forgery / Tampering)
    if (orderId && payment.razorpayOrderId && payment.razorpayOrderId !== orderId) {
      throw new ConflictError(
        `Order ID mismatch: stored [${payment.razorpayOrderId}] does not match webhook [${orderId}].`
      );
    }

    if (amount !== undefined && payment.amount !== amount) {
      throw new ConflictError(
        `Payment amount mismatch: stored [${payment.amount}] does not match webhook [${amount}]. Potential fraud attempt.`
      );
    }

    if (notes.jobId && notes.jobId !== payment.jobId) {
      throw new ConflictError("Job ID in webhook metadata does not match stored payment record.");
    }

    if (notes.workerId && notes.workerId !== payment.workerId) {
      throw new ConflictError("Worker ID in webhook metadata does not match stored payment record.");
    }

    // 7. State Machine Transition Verification
    const currentStatus = payment.status;
    if (currentStatus === targetStatus) {
      // Idempotent: already at target status
      await eventRef.set({
        eventId,
        eventType,
        orderId,
        paymentId,
        processedAt: Timestamp.now(),
        status: "PROCESSED",
        reason: `Payment already in status [${targetStatus}]`,
      } as WebhookEventRecord);

      return {
        status: "success",
        eventId,
        paymentId,
        previousStatus: currentStatus,
        newStatus: targetStatus,
      };
    }

    if (!isValidPaymentTransition(currentStatus, targetStatus)) {
      throw new ConflictError(
        `Illegal payment state transition from [${currentStatus}] to [${targetStatus}].`
      );
    }

    // 8. Apply Transition & Record Webhook Event
    const now = Timestamp.now();
    const updateData: Partial<PaymentRecord> & Record<string, any> = {
      status: targetStatus,
      updatedAt: now,
    };

    if (paymentGatewayId) {
      updateData.razorpayPaymentId = paymentGatewayId;
    }

    if (targetStatus === "AUTHORIZED") {
      updateData.authorizedAt = now;
    } else if (targetStatus === "CAPTURED") {
      updateData.capturedAt = now;
      updateData.completedAt = now; // For legacy UI compatibility
    } else if (targetStatus === "FAILED") {
      updateData.failedAt = now;
      updateData.failureReason = paymentEntity?.error_description || "Payment failed at gateway";
    } else if (targetStatus === "REFUNDED") {
      updateData.refundedAt = now;
    }

    const batch = db.batch();
    batch.update(paymentDocRef, updateData);
    batch.set(eventRef, {
      eventId,
      eventType,
      orderId,
      paymentId,
      processedAt: now,
      status: "PROCESSED",
    } as WebhookEventRecord);

    await batch.commit();

    // Authoritative notification dispatch (non-blocking)
    if (targetStatus === "CAPTURED") {
      notificationService
        .notifyPaymentCaptured(payment.workerId, payment.contractorId, payment.amount, payment.jobId)
        .catch((err) => {
          logger.warn("Failed to dispatch payment captured notifications", {
            action: "processWebhookEvent",
            error: err instanceof Error ? err.message : String(err),
          });
        });
    } else if (targetStatus === "FAILED") {
      notificationService
        .notifyPaymentFailed(payment.contractorId, payment.amount, payment.jobId)
        .catch((err) => {
          logger.warn("Failed to dispatch payment failed notification", {
            action: "processWebhookEvent",
            error: err instanceof Error ? err.message : String(err),
          });
        });
    } else if (targetStatus === "REFUNDED") {
      notificationService
        .notifyPaymentRefunded(payment.workerId, payment.contractorId, payment.amount, payment.jobId)
        .catch((err) => {
          logger.warn("Failed to dispatch payment refunded notification", {
            action: "processWebhookEvent",
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    logger.info("Payment status transitioned via webhook", {
      action: "processWebhookEvent",
      paymentId,
      previousStatus: currentStatus,
      newStatus: targetStatus,
      eventId,
    });

    return {
      status: "success",
      eventId,
      paymentId,
      previousStatus: currentStatus,
      newStatus: targetStatus,
    };
  }

  /**
   * Authoritatively updates payment status in Firestore (Server-only).
   */
  async updatePaymentStatusServerOnly(
    paymentId: string,
    status: PaymentStatus,
    details?: {
      razorpayOrderId?: string;
      razorpayPaymentId?: string;
      reason?: string;
    }
  ): Promise<void> {
    const paymentRef = db.collection("payments").doc(paymentId);
    const paymentDoc = await paymentRef.get();

    if (!paymentDoc.exists) {
      throw new NotFoundError(`Payment record [${paymentId}]`);
    }

    const currentData = paymentDoc.data() as PaymentRecord;
    if (!isValidPaymentTransition(currentData.status, status)) {
      throw new ConflictError(
        `Illegal payment state transition from [${currentData.status}] to [${status}].`
      );
    }

    const now = Timestamp.now();
    await paymentRef.update({
      status,
      updatedAt: now,
      ...(status === "CAPTURED" || status === "COMPLETED" ? { completedAt: now, capturedAt: now } : {}),
      ...(details?.razorpayOrderId ? { razorpayOrderId: details.razorpayOrderId } : {}),
      ...(details?.razorpayPaymentId ? { razorpayPaymentId: details.razorpayPaymentId } : {}),
      ...(details?.reason ? { failureReason: details.reason } : {}),
    });

    // Authoritative notification dispatch (non-blocking)
    if (status === "CAPTURED" || status === "COMPLETED") {
      notificationService
        .notifyPaymentCaptured(currentData.workerId, currentData.contractorId, currentData.amount, currentData.jobId)
        .catch((err) => {
          logger.warn("Failed to dispatch payment captured notifications", {
            action: "updatePaymentStatusServerOnly",
            error: err instanceof Error ? err.message : String(err),
          });
        });
    } else if (status === "FAILED") {
      notificationService
        .notifyPaymentFailed(currentData.contractorId, currentData.amount, currentData.jobId)
        .catch((err) => {
          logger.warn("Failed to dispatch payment failed notification", {
            action: "updatePaymentStatusServerOnly",
            error: err instanceof Error ? err.message : String(err),
          });
        });
    } else if (status === "REFUNDED") {
      notificationService
        .notifyPaymentRefunded(currentData.workerId, currentData.contractorId, currentData.amount, currentData.jobId)
        .catch((err) => {
          logger.warn("Failed to dispatch payment refunded notification", {
            action: "updatePaymentStatusServerOnly",
            error: err instanceof Error ? err.message : String(err),
          });
        });
    }

    logger.info("Server-side payment status updated", {
      action: "updatePaymentStatusServerOnly",
      paymentId,
      previousStatus: currentData.status,
      newStatus: status,
    });
  }
}

export const paymentService = new PaymentService();
