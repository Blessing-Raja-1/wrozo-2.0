/**
 * E2E Integration Tests — Security & Attack Scenarios
 *
 * Verifies that all authoritative service layer guards correctly reject
 * malicious or malformed requests across all marketplace operations.
 *
 * S1-S3: Unauthenticated access rejection
 * S4-S6: Wrong-role operations (worker-as-contractor, contractor-as-worker)
 * S7-S8: Application conflict enforcement
 * S9-S10: Acceptance conflict enforcement (duplicate + capacity overflow)
 * S11-S13: Job state machine violation prevention
 * S14-S15: Cross-ownership enforcement (foreign job tampering)
 * S16-S18: Payment eligibility and duplicate enforcement
 * S19: Forged client amount ignored server-side
 * S20-S21: Webhook security and idempotency
 * S22: Admin capability self-grant prevention
 * S23-S24: Application withdrawal invariants and not-found handling
 */

import { test, describe, before, beforeEach } from "node:test";
import * as assert from "node:assert";
import * as crypto from "node:crypto";
import { db } from "../config/firebase";
import {
  makeAuthCtx,
  createUserDoc,
  seedJob,
  seedApplication,
  seedPayment,
  testId,
} from "./helpers";
import { jobService } from "../jobs/job_service";
import { applicationService } from "../applications/application_service";
import { userService } from "../users/user_service";
import { paymentService } from "../payments/payment_service";
import { notificationService, MockMessagingGateway } from "../notifications/notification_service";
import { MockRazorpayGateway } from "../payments/razorpay_gateway";
import {
  AuthError,
  ForbiddenError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "../shared/errors";

describe("Security & Attack Scenarios E2E Integration", () => {
  let mockMessaging: MockMessagingGateway;
  let mockRazorpay: MockRazorpayGateway;

  const WORKER_UID = testId("w_sec");
  const CONTRACTOR_UID = testId("c_sec");
  const ATTACKER_UID = testId("atk_sec");

  before(async () => {
    mockMessaging = new MockMessagingGateway();
    notificationService.setGateway(mockMessaging);
    mockRazorpay = new MockRazorpayGateway();
    paymentService.setGateway(mockRazorpay);

    // Seed shared users
    await createUserDoc(WORKER_UID, { capabilities: { worker: true, contractor: false } });
    await createUserDoc(CONTRACTOR_UID, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(ATTACKER_UID, { status: "ACTIVE" });
  });

  beforeEach(() => {
    mockMessaging.clear();
    mockRazorpay.clear();
  });

  // ── S1-S3: Unauthenticated Access ─────────────────────────────────────────

  test("S1: unauthenticated applyForJob throws AuthError", async () => {
    await assert.rejects(
      () => applicationService.applyForJob(undefined, { jobId: "any_job" }),
      AuthError
    );
  });

  test("S2: unauthenticated createJob throws AuthError", async () => {
    await assert.rejects(
      () => jobService.createJob(undefined, {
        title: "Hacker Job",
        description: "A hacker trying to create a job",
        skillsRequired: ["Hacking"],
        wage: 1000,
        workerCountNeeded: 1,
      }),
      AuthError
    );
  });

  test("S3: unauthenticated createPaymentOrder throws AuthError", async () => {
    await assert.rejects(
      () => paymentService.createPaymentOrder(undefined, { jobId: "job_1", workerId: "worker_1" }),
      AuthError
    );
  });

  // ── S4-S6: Wrong-Role Operations ──────────────────────────────────────────

  test("S4: worker cannot apply for their own job (ForbiddenError)", async () => {
    const freshJobId = testId("job_s4");
    // Seed a job where the worker is also the contractor (malicious precondition)
    await seedJob(freshJobId, { contractorId: WORKER_UID, wage: 500 });

    const ctx = makeAuthCtx(WORKER_UID);
    await assert.rejects(
      () => applicationService.applyForJob(ctx, { jobId: freshJobId }),
      ForbiddenError
    );
  });

  test("S5: worker-only account cannot call createJob (ForbiddenError)", async () => {
    const ctx = makeAuthCtx(WORKER_UID);
    await assert.rejects(
      () => jobService.createJob(ctx, {
        title: "Worker Attempts Contractor Op",
        description: "This should not be allowed for workers",
        skillsRequired: ["Testing"],
        wage: 800,
        workerCountNeeded: 1,
      }),
      ForbiddenError
    );
  });

  test("S6: contractor-only account cannot call applyForJob (ForbiddenError)", async () => {
    const freshJobId = testId("job_s6");
    const freshContractorId = testId("c2_s6");
    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await seedJob(freshJobId, { contractorId: freshContractorId });

    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await assert.rejects(
      () => applicationService.applyForJob(ctx, { jobId: freshJobId }),
      ForbiddenError
    );
  });

  // ── S7-S8: Application Conflict ───────────────────────────────────────────

  test("S7: duplicate application submission throws ConflictError", async () => {
    const freshJobId = testId("job_s7");
    const freshContractorId = testId("c_s7");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await seedJob(freshJobId, { contractorId: freshContractorId });

    const ctx = makeAuthCtx(WORKER_UID);
    await applicationService.applyForJob(ctx, { jobId: freshJobId });

    // Second apply for the same job
    await assert.rejects(
      () => applicationService.applyForJob(ctx, { jobId: freshJobId }),
      ConflictError
    );
  });

  test("S8: worker cannot apply to non-OPEN job (ConflictError)", async () => {
    const freshJobId = testId("job_s8");
    await seedJob(freshJobId, { contractorId: CONTRACTOR_UID, status: "IN_PROGRESS" });

    const ctx = makeAuthCtx(WORKER_UID);
    await assert.rejects(
      () => applicationService.applyForJob(ctx, { jobId: freshJobId }),
      ConflictError
    );
  });

  // ── S9-S10: Acceptance Conflicts ──────────────────────────────────────────

  test("S9: accepting same application twice throws ConflictError", async () => {
    const freshJobId = testId("job_s9");
    const freshWorkerId = testId("w_s9");
    const freshContractorId = testId("c_s9");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId });
    const appId = await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "PENDING",
    });

    const ctx = makeAuthCtx(freshContractorId);
    await applicationService.acceptApplication(ctx, { applicationId: appId });

    // Accept again — must fail since application is now ACCEPTED, not PENDING
    await assert.rejects(
      () => applicationService.acceptApplication(ctx, { applicationId: appId }),
      ConflictError
    );
  });

  test("S10: capacity overflow — accepting more than workerCountNeeded throws ConflictError", async () => {
    const freshJobId = testId("job_s10");
    const freshWorker1 = testId("w1_s10");
    const freshWorker2 = testId("w2_s10");
    const freshContractorId = testId("c_s10");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorker1, { capabilities: { worker: true, contractor: false } });
    await createUserDoc(freshWorker2, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId, workerCountNeeded: 1 });
    await seedApplication({ jobId: freshJobId, workerId: freshWorker1, contractorId: freshContractorId });
    await seedApplication({ jobId: freshJobId, workerId: freshWorker2, contractorId: freshContractorId });

    const ctx = makeAuthCtx(freshContractorId);
    await applicationService.acceptApplication(ctx, {
      applicationId: `${freshJobId}_${freshWorker1}`,
    });

    await assert.rejects(
      () => applicationService.acceptApplication(ctx, {
        applicationId: `${freshJobId}_${freshWorker2}`,
      }),
      ConflictError
    );
  });

  // ── S11-S13: Job State Machine Violations ─────────────────────────────────

  test("S11: illegal job transition OPEN → COMPLETED throws ConflictError", async () => {
    const freshJobId = testId("job_s11");
    await seedJob(freshJobId, { contractorId: CONTRACTOR_UID, status: "OPEN" });

    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await assert.rejects(
      () => jobService.transitionJobStatus(ctx, { jobId: freshJobId, targetStatus: "COMPLETED" }),
      ConflictError
    );
  });

  test("S12: illegal job transition from terminal COMPLETED state throws ConflictError", async () => {
    const freshJobId = testId("job_s12");
    await seedJob(freshJobId, { contractorId: CONTRACTOR_UID, status: "COMPLETED" });

    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await assert.rejects(
      () => jobService.transitionJobStatus(ctx, { jobId: freshJobId, targetStatus: "OPEN" }),
      ConflictError
    );
  });

  test("S13: completing a job with no accepted workers throws ConflictError", async () => {
    const freshJobId = testId("job_s13");
    await seedJob(freshJobId, { contractorId: CONTRACTOR_UID, status: "IN_PROGRESS" });
    // No accepted applications exist for this job

    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await assert.rejects(
      () => jobService.transitionJobStatus(ctx, { jobId: freshJobId, targetStatus: "COMPLETED" }),
      ConflictError
    );
  });

  // ── S14-S15: Cross-Ownership Enforcement ──────────────────────────────────

  test("S14: wrong contractor cannot accept application for another contractor's job (ForbiddenError)", async () => {
    const freshJobId = testId("job_s14");
    const freshWorkerId = testId("w_s14");
    const realContractorId = testId("c_real_s14");
    const wrongContractorId = testId("c_wrong_s14");

    await createUserDoc(realContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(wrongContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: realContractorId });
    const appId = await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: realContractorId,
    });

    const wrongCtx = makeAuthCtx(wrongContractorId);
    await assert.rejects(
      () => applicationService.acceptApplication(wrongCtx, { applicationId: appId }),
      ForbiddenError
    );
  });

  test("S15: contractor cannot create payment order for another contractor's job (ForbiddenError)", async () => {
    const freshJobId = testId("job_s15");
    const freshWorkerId = testId("w_s15");
    const realContractorId = testId("c_real_s15");
    const wrongContractorId = testId("c_wrong_s15");

    await createUserDoc(realContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(wrongContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: realContractorId, status: "IN_PROGRESS" });
    await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: realContractorId,
      status: "ACCEPTED",
    });

    const wrongCtx = makeAuthCtx(wrongContractorId);
    await assert.rejects(
      () => paymentService.createPaymentOrder(wrongCtx, { jobId: freshJobId, workerId: freshWorkerId }),
      ForbiddenError
    );
  });

  // ── S16-S18: Payment Eligibility & Duplicate ──────────────────────────────

  test("S16: createPaymentOrder for non-ACCEPTED worker throws ConflictError", async () => {
    const freshJobId = testId("job_s16");
    const freshWorkerId = testId("w_s16");
    const freshContractorId = testId("c_s16");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId, status: "IN_PROGRESS" });
    await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "REJECTED", // Not ACCEPTED
    });

    const ctx = makeAuthCtx(freshContractorId);
    await assert.rejects(
      () => paymentService.createPaymentOrder(ctx, { jobId: freshJobId, workerId: freshWorkerId }),
      ConflictError
    );
  });

  test("S17: createPaymentOrder for OPEN job (not IN_PROGRESS/COMPLETED) throws ConflictError", async () => {
    const freshJobId = testId("job_s17");
    const freshWorkerId = testId("w_s17");
    const freshContractorId = testId("c_s17");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId, status: "OPEN" });
    await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "ACCEPTED",
    });

    const ctx = makeAuthCtx(freshContractorId);
    await assert.rejects(
      () => paymentService.createPaymentOrder(ctx, { jobId: freshJobId, workerId: freshWorkerId }),
      ConflictError
    );
  });

  test("S18: duplicate payment rejected when existing payment is CAPTURED", async () => {
    const freshJobId = testId("job_s18");
    const freshWorkerId = testId("w_s18");
    const freshContractorId = testId("c_s18");
    const existingPaymentId = testId("pay_s18");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId, wage: 500, status: "IN_PROGRESS" });
    await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "ACCEPTED",
    });

    // Seed an already-CAPTURED payment for this job+worker
    await seedPayment(existingPaymentId, {
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      amount: 50000,
      status: "CAPTURED",
      razorpayOrderId: "order_captured_s18",
    });

    const ctx = makeAuthCtx(freshContractorId);
    await assert.rejects(
      () => paymentService.createPaymentOrder(ctx, { jobId: freshJobId, workerId: freshWorkerId }),
      ConflictError
    );
  });

  // ── S19: Forged Client Amount Ignored ─────────────────────────────────────

  test("S19: server ignores client amount hint and derives authoritative amount from job.wage", async () => {
    const freshJobId = testId("job_s19");
    const freshWorkerId = testId("w_s19");
    const freshContractorId = testId("c_s19");
    const REAL_WAGE = 750;

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId, wage: REAL_WAGE, status: "IN_PROGRESS" });
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
      amountInPaise: 1, // Forged amount — pay 1 paise instead of real wage
    });

    assert.strictEqual(result.amount, REAL_WAGE * 100, "Amount must equal authoritative wage * 100 paise");
    assert.notStrictEqual(result.amount, 1, "Forged client amount must be ignored");
  });

  // ── S20-S21: Webhook Security ─────────────────────────────────────────────

  test("S20: webhook with invalid HMAC signature throws ValidationError", async () => {
    const rawBody = JSON.stringify({
      event: "payment.captured",
      event_id: "evt_forged_sig",
      payload: {},
    });

    await assert.rejects(
      () => paymentService.processWebhookEvent({
        rawBody,
        signature: "forged_signature",
        secret: "test_webhook_secret_valid",
      }),
      ValidationError
    );
  });

  test("S21: duplicate webhook event is idempotently ignored", async () => {
    const EVENT_ID = testId("evt_dup_s21");
    // Seed the webhook event as already processed
    await db.collection("webhook_events").doc(EVENT_ID).set({
      eventId: EVENT_ID,
      eventType: "payment.captured",
      processedAt: new Date(),
      status: "PROCESSED",
    });

    const rawBody = JSON.stringify({
      event: "payment.captured",
      event_id: EVENT_ID,
      payload: {},
    });
    const secret = "test_secret_s21";
    const sig = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    const result = await paymentService.processWebhookEvent({
      rawBody,
      signature: sig,
      secret,
    });

    assert.strictEqual(result.status, "ignored");
    assert.strictEqual(result.reason, "duplicate_event");
  });

  // ── S22: Admin Escalation Prevention ──────────────────────────────────────

  test("S22: setupAccountCapabilities with admin key throws ForbiddenError", async () => {
    const freshId = testId("user_s22");
    await createUserDoc(freshId, { status: "ACTIVE" });

    const ctx = makeAuthCtx(freshId);
    await assert.rejects(
      () => userService.setupAccountCapabilities(ctx, {
        capabilities: { worker: true, contractor: false, admin: true } as any,
      }),
      ForbiddenError
    );
  });

  // ── S23-S24: Application Withdrawal & Not-Found ───────────────────────────

  test("S23: withdrawApplication on ACCEPTED application throws ConflictError", async () => {
    const freshJobId = testId("job_s23");
    const freshWorkerId = testId("w_s23");
    const freshContractorId = testId("c_s23");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId });
    const appId = await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "ACCEPTED",
    });

    const ctx = makeAuthCtx(freshWorkerId);
    await assert.rejects(
      () => applicationService.withdrawApplication(ctx, { applicationId: appId }),
      ConflictError
    );
  });

  test("S24: applyForJob with non-existent jobId throws NotFoundError", async () => {
    const ctx = makeAuthCtx(WORKER_UID);
    await assert.rejects(
      () => applicationService.applyForJob(ctx, { jobId: "job_does_not_exist_at_all" }),
      NotFoundError
    );
  });
});
