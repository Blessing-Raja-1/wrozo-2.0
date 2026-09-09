/**
 * E2E Integration Tests — Notification Trigger Verification
 *
 * Verifies that every authoritative business event dispatches the correct
 * push notification via the MockMessagingGateway.
 *
 * N1: applyForJob → notifyNewApplication dispatched to contractor
 * N2: acceptApplication → notifyApplicationAccepted dispatched to worker
 * N3: rejectApplication → notifyApplicationRejected dispatched to worker
 * N4: withdrawApplication → notifyApplicationWithdrawn dispatched to contractor
 * N5: transitionJobStatus(COMPLETED) → notifyJobCompleted dispatched to workers
 * N6: transitionJobStatus(CANCELLED) → notifyJobCancelled dispatched to workers
 * N7: processWebhookEvent(payment.captured) → notifyPaymentCaptured dispatched
 * N8: processWebhookEvent(payment.failed) → notifyPaymentFailed dispatched to contractor
 * N9: processWebhookEvent(refund.processed) → notifyPaymentRefunded dispatched
 * N10: onChatMessageCreated → notifyNewChatMessage dispatched to recipient
 */

import { test, describe, before, beforeEach } from "node:test";
import * as assert from "node:assert";
import * as crypto from "node:crypto";


import {
  makeAuthCtx,
  createUserDoc,
  seedJob,
  seedApplication,
  seedConversation,
  seedPayment,
  testId,
} from "./helpers";
import { jobService } from "../jobs/job_service";
import { applicationService } from "../applications/application_service";
import { paymentService } from "../payments/payment_service";
import { notificationService, MockMessagingGateway } from "../notifications/notification_service";
import { MockRazorpayGateway } from "../payments/razorpay_gateway";
import { chatService } from "../chat/chat_service";

/** Wait for fire-and-forget async notification dispatches to settle. */
async function waitForDispatch(ms = 200): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

describe("Notification Trigger E2E Integration", () => {
  let mockGateway: MockMessagingGateway;
  let mockRazorpay: MockRazorpayGateway;

  const CONTRACTOR_UID = testId("c_notif");
  const WORKER_UID = testId("w_notif");
  const CONTRACTOR_FCM = "fcm_token_contractor_notif";
  const WORKER_FCM = "fcm_token_worker_notif";

  before(async () => {
    mockGateway = new MockMessagingGateway();
    notificationService.setGateway(mockGateway);
    mockRazorpay = new MockRazorpayGateway();
    paymentService.setGateway(mockRazorpay);

    // Seed users with FCM tokens so notifications can resolve to tokens
    await createUserDoc(CONTRACTOR_UID, {
      capabilities: { worker: false, contractor: true },
      fcmTokens: [CONTRACTOR_FCM],
    });
    await createUserDoc(WORKER_UID, {
      capabilities: { worker: true, contractor: false },
      fcmTokens: [WORKER_FCM],
    });
  });

  beforeEach(() => {
    mockGateway.clear();
    mockRazorpay.clear();
  });

  // N1: applyForJob → notifyNewApplication dispatched to contractor
  test("N1: applyForJob dispatches notifyNewApplication to contractor FCM token", async () => {
    const freshJobId = testId("job_n1");
    await seedJob(freshJobId, { contractorId: CONTRACTOR_UID, wage: 600 });

    const ctx = makeAuthCtx(WORKER_UID);
    await applicationService.applyForJob(ctx, { jobId: freshJobId });
    await waitForDispatch();

    const newAppMsg = mockGateway.sentMessages.find(
      (m) => m.data?.["type"] === "APPLICATION_NEW"
    );
    assert.ok(newAppMsg, "APPLICATION_NEW notification must be dispatched");
    assert.ok(
      newAppMsg!.tokens.includes(CONTRACTOR_FCM),
      "Notification must target contractor's FCM token"
    );
    assert.strictEqual(newAppMsg!.data?.["jobId"], freshJobId);
  });

  // N2: acceptApplication → notifyApplicationAccepted dispatched to worker
  test("N2: acceptApplication dispatches notifyApplicationAccepted to worker FCM token", async () => {
    const freshJobId = testId("job_n2");
    await seedJob(freshJobId, { contractorId: CONTRACTOR_UID, wage: 700 });
    const appId = await seedApplication({
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      status: "PENDING",
    });

    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await applicationService.acceptApplication(ctx, { applicationId: appId });
    await waitForDispatch();

    const acceptedMsg = mockGateway.sentMessages.find(
      (m) => m.data?.["type"] === "APPLICATION_ACCEPTED"
    );
    assert.ok(acceptedMsg, "APPLICATION_ACCEPTED notification must be dispatched");
    assert.ok(
      acceptedMsg!.tokens.includes(WORKER_FCM),
      "Notification must target worker's FCM token"
    );
    assert.strictEqual(acceptedMsg!.data?.["jobId"], freshJobId);
  });

  // N3: rejectApplication → notifyApplicationRejected dispatched to worker
  test("N3: rejectApplication dispatches notifyApplicationRejected to worker FCM token", async () => {
    const freshJobId = testId("job_n3");
    await seedJob(freshJobId, { contractorId: CONTRACTOR_UID, wage: 500 });
    const appId = await seedApplication({
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      status: "PENDING",
    });

    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await applicationService.rejectApplication(ctx, {
      applicationId: appId,
      reason: "Skills mismatch",
    });
    await waitForDispatch();

    const rejectedMsg = mockGateway.sentMessages.find(
      (m) => m.data?.["type"] === "APPLICATION_REJECTED"
    );
    assert.ok(rejectedMsg, "APPLICATION_REJECTED notification must be dispatched");
    assert.ok(
      rejectedMsg!.tokens.includes(WORKER_FCM),
      "Notification must target worker's FCM token"
    );
  });

  // N4: withdrawApplication → notifyApplicationWithdrawn dispatched to contractor
  test("N4: withdrawApplication dispatches notifyApplicationWithdrawn to contractor FCM token", async () => {
    const freshJobId = testId("job_n4");
    await seedJob(freshJobId, { contractorId: CONTRACTOR_UID, wage: 500 });
    const appId = await seedApplication({
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      status: "PENDING",
    });

    const ctx = makeAuthCtx(WORKER_UID);
    await applicationService.withdrawApplication(ctx, { applicationId: appId });
    await waitForDispatch();

    const withdrawnMsg = mockGateway.sentMessages.find(
      (m) => m.data?.["type"] === "APPLICATION_WITHDRAWN"
    );
    assert.ok(withdrawnMsg, "APPLICATION_WITHDRAWN notification must be dispatched");
    assert.ok(
      withdrawnMsg!.tokens.includes(CONTRACTOR_FCM),
      "Notification must target contractor's FCM token"
    );
  });

  // N5: transitionJobStatus(COMPLETED) → notifyJobCompleted dispatched to workers
  test("N5: transitionJobStatus(COMPLETED) dispatches notifyJobCompleted to all accepted workers", async () => {
    const freshJobId = testId("job_n5");
    await seedJob(freshJobId, { contractorId: CONTRACTOR_UID, wage: 800, status: "IN_PROGRESS" });
    await seedApplication({
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      status: "ACCEPTED",
    });

    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await jobService.transitionJobStatus(ctx, { jobId: freshJobId, targetStatus: "COMPLETED" });
    await waitForDispatch(300);

    const completedMsg = mockGateway.sentMessages.find(
      (m) => m.data?.["type"] === "JOB_COMPLETED"
    );
    assert.ok(completedMsg, "JOB_COMPLETED notification must be dispatched");
    assert.ok(
      completedMsg!.tokens.includes(WORKER_FCM),
      "Notification must target accepted worker's FCM token"
    );
  });

  // N6: transitionJobStatus(CANCELLED) → notifyJobCancelled dispatched to workers
  test("N6: transitionJobStatus(CANCELLED) dispatches notifyJobCancelled to all applicants", async () => {
    const freshJobId = testId("job_n6");
    await seedJob(freshJobId, { contractorId: CONTRACTOR_UID, wage: 600, status: "OPEN" });
    // Seed a PENDING application — job cancellation notifies all applicants
    await seedApplication({
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      status: "PENDING",
    });

    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await jobService.transitionJobStatus(ctx, {
      jobId: freshJobId,
      targetStatus: "CANCELLED",
      reason: "Project cancelled",
    });
    await waitForDispatch(300);

    const cancelledMsg = mockGateway.sentMessages.find(
      (m) => m.data?.["type"] === "JOB_CANCELLED"
    );
    assert.ok(cancelledMsg, "JOB_CANCELLED notification must be dispatched");
    assert.ok(
      cancelledMsg!.tokens.includes(WORKER_FCM),
      "Notification must target worker's FCM token"
    );
  });

  // N7: processWebhookEvent(payment.captured) → notifyPaymentCaptured dispatched
  test("N7: webhook payment.captured dispatches notifyPaymentCaptured to both worker and contractor", async () => {
    const WAGE_PAISE = 90000; // ₹900
    const ORDER_ID = testId("order_n7");
    const EVENT_ID = testId("evt_capture_n7");
    const freshPaymentId = testId("pay_n7");
    const freshJobId = testId("job_n7");

    await seedPayment(freshPaymentId, {
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      amount: WAGE_PAISE,
      status: "CREATED",
      razorpayOrderId: ORDER_ID,
    });

    const rawBody = JSON.stringify({
      event: "payment.captured",
      event_id: EVENT_ID,
      payload: {
        payment: {
          entity: {
            id: "pay_rzp_n7",
            order_id: ORDER_ID,
            amount: WAGE_PAISE,
            notes: {
              paymentId: freshPaymentId,
              jobId: freshJobId,
              workerId: WORKER_UID,
              contractorId: CONTRACTOR_UID,
            },
          },
        },
      },
    });
    const secret = "test_webhook_secret_n7";
    const sig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    await paymentService.processWebhookEvent({ rawBody, signature: sig, secret });
    await waitForDispatch();

    // Both worker and contractor should receive payment captured notifications
    const workerMsg = mockGateway.sentMessages.find(
      (m) => m.tokens.includes(WORKER_FCM) && m.data?.["type"] === "PAYMENT_CAPTURED"
    );
    const contractorMsg = mockGateway.sentMessages.find(
      (m) => m.tokens.includes(CONTRACTOR_FCM) && m.data?.["type"] === "PAYMENT_CAPTURED"
    );

    assert.ok(workerMsg, "Worker must receive PAYMENT_CAPTURED notification");
    assert.ok(contractorMsg, "Contractor must receive PAYMENT_CAPTURED notification");
  });

  // N8: processWebhookEvent(payment.failed) → notifyPaymentFailed dispatched to contractor
  test("N8: webhook payment.failed dispatches notifyPaymentFailed to contractor", async () => {
    const WAGE_PAISE = 50000;
    const ORDER_ID = testId("order_n8");
    const EVENT_ID = testId("evt_failed_n8");
    const freshPaymentId = testId("pay_n8");
    const freshJobId = testId("job_n8");

    await seedPayment(freshPaymentId, {
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      amount: WAGE_PAISE,
      status: "CREATED",
      razorpayOrderId: ORDER_ID,
    });

    const rawBody = JSON.stringify({
      event: "payment.failed",
      event_id: EVENT_ID,
      payload: {
        payment: {
          entity: {
            id: "pay_rzp_n8",
            order_id: ORDER_ID,
            amount: WAGE_PAISE,
            error_description: "Card declined",
            notes: {
              paymentId: freshPaymentId,
              jobId: freshJobId,
              workerId: WORKER_UID,
              contractorId: CONTRACTOR_UID,
            },
          },
        },
      },
    });
    const secret = "test_webhook_secret_n8";
    const sig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    await paymentService.processWebhookEvent({ rawBody, signature: sig, secret });
    await waitForDispatch();

    const failedMsg = mockGateway.sentMessages.find(
      (m) => m.tokens.includes(CONTRACTOR_FCM) && m.data?.["type"] === "PAYMENT_FAILED"
    );
    assert.ok(failedMsg, "Contractor must receive PAYMENT_FAILED notification");
  });

  // N9: processWebhookEvent(refund.processed) → notifyPaymentRefunded dispatched
  test("N9: webhook refund.processed dispatches notifyPaymentRefunded to both participants", async () => {
    const WAGE_PAISE = 70000;
    const ORDER_ID = testId("order_n9");
    const EVENT_ID = testId("evt_refund_n9");
    const freshPaymentId = testId("pay_n9");
    const freshJobId = testId("job_n9");

    await seedPayment(freshPaymentId, {
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      amount: WAGE_PAISE,
      status: "CAPTURED", // Can be refunded from CAPTURED
      razorpayOrderId: ORDER_ID,
    });

    const rawBody = JSON.stringify({
      event: "refund.processed",
      event_id: EVENT_ID,
      payload: {
        payment: {
          entity: {
            id: "pay_rzp_n9",
            order_id: ORDER_ID,
            amount: WAGE_PAISE,
            notes: {
              paymentId: freshPaymentId,
              jobId: freshJobId,
              workerId: WORKER_UID,
              contractorId: CONTRACTOR_UID,
            },
          },
        },
      },
    });
    const secret = "test_webhook_secret_n9";
    const sig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    await paymentService.processWebhookEvent({ rawBody, signature: sig, secret });
    await waitForDispatch();

    const workerRefundMsg = mockGateway.sentMessages.find(
      (m) => m.tokens.includes(WORKER_FCM) && m.data?.["type"] === "PAYMENT_REFUNDED"
    );
    const contractorRefundMsg = mockGateway.sentMessages.find(
      (m) => m.tokens.includes(CONTRACTOR_FCM) && m.data?.["type"] === "PAYMENT_REFUNDED"
    );

    assert.ok(workerRefundMsg, "Worker must receive PAYMENT_REFUNDED notification");
    assert.ok(contractorRefundMsg, "Contractor must receive PAYMENT_REFUNDED notification");
  });

  // N10: onChatMessageCreated → notifyNewChatMessage dispatched to recipient
  test("N10: onChatMessageCreated dispatches notifyNewChatMessage to conversation recipient", async () => {
    const freshJobId = testId("job_n10");
    const appId = await seedApplication({
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      status: "ACCEPTED",
    });
    const convId = await seedConversation(CONTRACTOR_UID, WORKER_UID, appId);

    // Seed the conversation document with participants
    // (already done by seedConversation — just verify)
    const result = await chatService.onChatMessageCreated(convId, {
      senderId: CONTRACTOR_UID,
      text: "Hello, see you at 9am.",
    });

    assert.strictEqual(result.success, true, "Chat message handler must succeed");
    assert.strictEqual(result.recipientId, WORKER_UID, "Recipient must be the non-sender participant");

    await waitForDispatch();

    const chatMsg = mockGateway.sentMessages.find(
      (m) => m.tokens.includes(WORKER_FCM) && m.data?.["type"] === "CHAT_MESSAGE"
    );
    assert.ok(chatMsg, "Worker must receive CHAT_MESSAGE notification");
    assert.strictEqual(chatMsg!.data?.["conversationId"], convId);
  });
});
