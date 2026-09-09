/**
 * E2E Integration Tests — Payment Flow
 *
 * Covers the complete payment lifecycle with MockRazorpayGateway:
 * P1: Full payment flow: createJob → accept → createPaymentOrder → success
 * P2: Amount authoritatively derived from job.wage * 100 paise
 * P3: Client amount hint ignored when it differs from authoritative
 * P4: Idempotent reuse of existing CREATED order (same orderId returned)
 * P5: Duplicate payment rejected when CAPTURED
 * P6: Webhook CREATED → AUTHORIZED → CAPTURED state machine with real Firestore
 * P7: Webhook CAPTURED → REFUNDED transition
 * P8: Illegal webhook transition CAPTURED → FAILED throws ConflictError
 * P9: Webhook with mismatched order ID rejected (ConflictError)
 * P10: Webhook with mismatched amount rejected (fraud detection)
 */

import { test, describe, before, beforeEach } from "node:test";
import * as assert from "node:assert";
import * as crypto from "node:crypto";


import {
  makeAuthCtx,
  createUserDoc,
  seedJob,
  seedApplication,
  seedPayment,
  getDoc,
  testId,
} from "./helpers";
import { jobService } from "../jobs/job_service";
import { applicationService } from "../applications/application_service";
import { paymentService } from "../payments/payment_service";
import { notificationService, MockMessagingGateway } from "../notifications/notification_service";
import { MockRazorpayGateway } from "../payments/razorpay_gateway";
import { ConflictError } from "../shared/errors";

const TEST_WEBHOOK_SECRET = "test_webhook_secret_payment_flow";

function sign(body: string, secret = TEST_WEBHOOK_SECRET): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

describe("Payment Flow E2E Integration", () => {
  let mockGateway: MockMessagingGateway;
  let mockRazorpay: MockRazorpayGateway;

  const CONTRACTOR_UID = testId("c_pay");
  const WORKER_UID = testId("w_pay");

  before(async () => {
    mockGateway = new MockMessagingGateway();
    notificationService.setGateway(mockGateway);
    mockRazorpay = new MockRazorpayGateway();
    paymentService.setGateway(mockRazorpay);

    await createUserDoc(CONTRACTOR_UID, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(WORKER_UID, { capabilities: { worker: true, contractor: false } });
  });

  beforeEach(() => {
    mockGateway.clear();
    mockRazorpay.clear();
  });

  // P1: Full payment flow end-to-end
  test("P1: full payment flow — createJob → applyForJob → accept → createPaymentOrder succeeds", async () => {
    const contractorCtx = makeAuthCtx(CONTRACTOR_UID);
    const workerCtx = makeAuthCtx(WORKER_UID);

    // Step 1: Create job
    const { jobId } = await jobService.createJob(contractorCtx, {
      title: "Payment Flow Test Job",
      description: "Testing the complete end-to-end payment flow integration",
      skillsRequired: ["Integration"],
      wage: 1500,
      workerCountNeeded: 1,
    });

    // Step 2: Worker applies
    const { applicationId } = await applicationService.applyForJob(workerCtx, { jobId });

    // Step 3: Contractor accepts
    await applicationService.acceptApplication(contractorCtx, { applicationId });

    // Step 4: Create payment order
    const result = await paymentService.createPaymentOrder(contractorCtx, {
      jobId,
      workerId: WORKER_UID,
    });

    assert.ok(result.orderId, "orderId must be returned from gateway");
    assert.ok(result.paymentId, "paymentId must be stored in Firestore");
    assert.strictEqual(result.amount, 1500 * 100, "amount must be 1500 INR in paise");
    assert.strictEqual(result.currency, "INR");
    assert.strictEqual(mockRazorpay.createdOrders.length, 1, "gateway must receive exactly one order");
    assert.strictEqual(mockRazorpay.createdOrders[0].amount, 1500 * 100);

    // Verify Firestore payment record created
    const payDoc = await getDoc<Record<string, unknown>>("payments", result.paymentId);
    assert.strictEqual(payDoc.status, "CREATED");
    assert.strictEqual(payDoc.jobId, jobId);
    assert.strictEqual(payDoc.workerId, WORKER_UID);
    assert.strictEqual(payDoc.contractorId, CONTRACTOR_UID);
    assert.strictEqual(payDoc.amount, 1500 * 100);
  });

  // P2: Amount authoritatively derived from job.wage * 100
  test("P2: amount is exactly job.wage * 100 paise (authoritative derivation)", async () => {
    const WAGE = 2250; // ₹2250
    const freshJobId = testId("job_p2");
    const freshContractorId = testId("c_p2");
    const freshWorkerId = testId("w_p2");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId, wage: WAGE, status: "IN_PROGRESS" });
    await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "ACCEPTED",
    });

    const ctx = makeAuthCtx(freshContractorId);
    const result = await paymentService.createPaymentOrder(ctx, {
      jobId: freshJobId,
      workerId: freshWorkerId,
    });

    assert.strictEqual(result.amount, WAGE * 100);
    assert.strictEqual(mockRazorpay.createdOrders[0].amount, WAGE * 100);
  });

  // P3: Client amount hint is ignored
  test("P3: client amount hint (amountInPaise) is ignored — authoritative amount always used", async () => {
    const WAGE = 900;
    const freshJobId = testId("job_p3");
    const freshContractorId = testId("c_p3");
    const freshWorkerId = testId("w_p3");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId, wage: WAGE, status: "COMPLETED" });
    await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "ACCEPTED",
    });

    const ctx = makeAuthCtx(freshContractorId);
    const result = await paymentService.createPaymentOrder(ctx, {
      jobId: freshJobId,
      workerId: freshWorkerId,
      amountInPaise: 1, // Client forges 1 paise
    });

    // Server must use wage * 100 = 90000, not the forged 1
    assert.strictEqual(result.amount, WAGE * 100);
    assert.notStrictEqual(result.amount, 1);
    assert.strictEqual(mockRazorpay.createdOrders[0].amount, WAGE * 100);
  });

  // P4: Idempotent reuse of existing CREATED order
  test("P4: calling createPaymentOrder when a CREATED order already exists reuses same orderId", async () => {
    const WAGE = 600;
    const freshJobId = testId("job_p4");
    const freshContractorId = testId("c_p4");
    const freshWorkerId = testId("w_p4");
    const existingPaymentId = testId("pay_p4");
    const EXISTING_ORDER_ID = "order_existing_p4";

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId, wage: WAGE, status: "IN_PROGRESS" });
    await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "ACCEPTED",
    });

    // Seed an existing CREATED payment order
    await seedPayment(existingPaymentId, {
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      amount: WAGE * 100,
      status: "CREATED",
      razorpayOrderId: EXISTING_ORDER_ID,
    });

    const ctx = makeAuthCtx(freshContractorId);
    const result = await paymentService.createPaymentOrder(ctx, {
      jobId: freshJobId,
      workerId: freshWorkerId,
    });

    // Must reuse the existing CREATED order — no new gateway call
    assert.strictEqual(result.orderId, EXISTING_ORDER_ID, "Existing CREATED orderId must be reused");
    assert.strictEqual(result.paymentId, existingPaymentId, "Existing paymentId must be returned");
    assert.strictEqual(mockRazorpay.createdOrders.length, 0, "Gateway must NOT be called again for idempotent reuse");
  });

  // P5: Duplicate payment rejected when CAPTURED
  test("P5: createPaymentOrder throws ConflictError when CAPTURED payment already exists", async () => {
    const freshJobId = testId("job_p5");
    const freshContractorId = testId("c_p5");
    const freshWorkerId = testId("w_p5");
    const capturedPaymentId = testId("pay_p5");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId, wage: 500, status: "IN_PROGRESS" });
    await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "ACCEPTED",
    });
    await seedPayment(capturedPaymentId, {
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      amount: 50000,
      status: "CAPTURED",
      razorpayOrderId: "order_already_captured_p5",
    });

    const ctx = makeAuthCtx(freshContractorId);
    await assert.rejects(
      () => paymentService.createPaymentOrder(ctx, { jobId: freshJobId, workerId: freshWorkerId }),
      ConflictError
    );
  });

  // P6: Webhook CREATED → AUTHORIZED → CAPTURED state machine with real Firestore
  test("P6: webhook events CREATED→AUTHORIZED→CAPTURED transition payment state machine in Firestore", async () => {
    const WAGE_PAISE = 120000;
    const ORDER_ID = testId("order_p6");
    const freshPaymentId = testId("pay_p6");
    const freshJobId = testId("job_p6");

    await seedPayment(freshPaymentId, {
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      amount: WAGE_PAISE,
      status: "CREATED",
      razorpayOrderId: ORDER_ID,
    });

    // --- Webhook: payment.authorized ---
    const authorizedBody = JSON.stringify({
      event: "payment.authorized",
      event_id: testId("evt_auth_p6"),
      payload: {
        payment: {
          entity: {
            id: "pay_rzp_p6_auth",
            order_id: ORDER_ID,
            amount: WAGE_PAISE,
            notes: { paymentId: freshPaymentId, jobId: freshJobId },
          },
        },
      },
    });
    await paymentService.processWebhookEvent({
      rawBody: authorizedBody,
      signature: sign(authorizedBody),
      secret: TEST_WEBHOOK_SECRET,
    });

    const afterAuth = await getDoc<Record<string, unknown>>("payments", freshPaymentId);
    assert.strictEqual(afterAuth.status, "AUTHORIZED", "Payment must be AUTHORIZED after authorized webhook");

    // --- Webhook: payment.captured ---
    const capturedBody = JSON.stringify({
      event: "payment.captured",
      event_id: testId("evt_cap_p6"),
      payload: {
        payment: {
          entity: {
            id: "pay_rzp_p6_cap",
            order_id: ORDER_ID,
            amount: WAGE_PAISE,
            notes: { paymentId: freshPaymentId, jobId: freshJobId },
          },
        },
      },
    });
    await paymentService.processWebhookEvent({
      rawBody: capturedBody,
      signature: sign(capturedBody),
      secret: TEST_WEBHOOK_SECRET,
    });

    const afterCapture = await getDoc<Record<string, unknown>>("payments", freshPaymentId);
    assert.strictEqual(afterCapture.status, "CAPTURED", "Payment must be CAPTURED after captured webhook");
    assert.ok(afterCapture.capturedAt, "capturedAt must be set");
    assert.ok(afterCapture.completedAt, "completedAt must be set");
  });

  // P7: Webhook CAPTURED → REFUNDED transition
  test("P7: webhook refund.processed transitions payment from CAPTURED to REFUNDED in Firestore", async () => {
    const WAGE_PAISE = 80000;
    const ORDER_ID = testId("order_p7");
    const freshPaymentId = testId("pay_p7");
    const freshJobId = testId("job_p7");

    await seedPayment(freshPaymentId, {
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      amount: WAGE_PAISE,
      status: "CAPTURED",
      razorpayOrderId: ORDER_ID,
    });

    const refundBody = JSON.stringify({
      event: "refund.processed",
      event_id: testId("evt_refund_p7"),
      payload: {
        payment: {
          entity: {
            id: "pay_rzp_p7",
            order_id: ORDER_ID,
            amount: WAGE_PAISE,
            notes: { paymentId: freshPaymentId, jobId: freshJobId },
          },
        },
      },
    });

    await paymentService.processWebhookEvent({
      rawBody: refundBody,
      signature: sign(refundBody),
      secret: TEST_WEBHOOK_SECRET,
    });

    const afterRefund = await getDoc<Record<string, unknown>>("payments", freshPaymentId);
    assert.strictEqual(afterRefund.status, "REFUNDED", "Payment must be REFUNDED after refund webhook");
    assert.ok(afterRefund.refundedAt, "refundedAt must be set");
  });

  // P8: Illegal webhook transition CAPTURED → FAILED
  test("P8: illegal webhook transition CAPTURED→FAILED throws ConflictError", async () => {
    const WAGE_PAISE = 60000;
    const ORDER_ID = testId("order_p8");
    const freshPaymentId = testId("pay_p8");
    const freshJobId = testId("job_p8");

    await seedPayment(freshPaymentId, {
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      amount: WAGE_PAISE,
      status: "CAPTURED",
      razorpayOrderId: ORDER_ID,
    });

    const failBody = JSON.stringify({
      event: "payment.failed",
      event_id: testId("evt_fail_p8"),
      payload: {
        payment: {
          entity: {
            id: "pay_rzp_p8",
            order_id: ORDER_ID,
            amount: WAGE_PAISE,
            notes: { paymentId: freshPaymentId, jobId: freshJobId },
          },
        },
      },
    });

    await assert.rejects(
      () => paymentService.processWebhookEvent({
        rawBody: failBody,
        signature: sign(failBody),
        secret: TEST_WEBHOOK_SECRET,
      }),
      ConflictError
    );
  });

  // P9: Webhook with mismatched order ID rejected
  test("P9: webhook with mismatched order ID throws ConflictError (tamper detection)", async () => {
    const WAGE_PAISE = 55000;
    const REAL_ORDER_ID = testId("order_real_p9");
    const FAKE_ORDER_ID = testId("order_fake_p9");
    const freshPaymentId = testId("pay_p9");
    const freshJobId = testId("job_p9");

    await seedPayment(freshPaymentId, {
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      amount: WAGE_PAISE,
      status: "CREATED",
      razorpayOrderId: REAL_ORDER_ID,
    });

    const tamperedBody = JSON.stringify({
      event: "payment.captured",
      event_id: testId("evt_tamper_p9"),
      payload: {
        payment: {
          entity: {
            id: "pay_rzp_p9",
            order_id: FAKE_ORDER_ID, // Attacker substitutes a different order ID
            amount: WAGE_PAISE,
            notes: { paymentId: freshPaymentId, jobId: freshJobId },
          },
        },
      },
    });

    await assert.rejects(
      () => paymentService.processWebhookEvent({
        rawBody: tamperedBody,
        signature: sign(tamperedBody),
        secret: TEST_WEBHOOK_SECRET,
      }),
      ConflictError
    );
  });

  // P10: Webhook with mismatched amount rejected (fraud detection)
  test("P10: webhook with mismatched amount throws ConflictError (fraud detection)", async () => {
    const STORED_AMOUNT = 100000; // ₹1000 in paise
    const FORGED_AMOUNT = 1;      // Attacker sends 1 paise to try to confirm low payment
    const ORDER_ID = testId("order_p10");
    const freshPaymentId = testId("pay_p10");
    const freshJobId = testId("job_p10");

    await seedPayment(freshPaymentId, {
      jobId: freshJobId,
      workerId: WORKER_UID,
      contractorId: CONTRACTOR_UID,
      amount: STORED_AMOUNT,
      status: "CREATED",
      razorpayOrderId: ORDER_ID,
    });

    const fraudBody = JSON.stringify({
      event: "payment.captured",
      event_id: testId("evt_fraud_p10"),
      payload: {
        payment: {
          entity: {
            id: "pay_rzp_p10",
            order_id: ORDER_ID,
            amount: FORGED_AMOUNT, // Attacker reports incorrect low amount
            notes: { paymentId: freshPaymentId, jobId: freshJobId },
          },
        },
      },
    });

    await assert.rejects(
      () => paymentService.processWebhookEvent({
        rawBody: fraudBody,
        signature: sign(fraudBody),
        secret: TEST_WEBHOOK_SECRET,
      }),
      ConflictError
    );
  });
});
