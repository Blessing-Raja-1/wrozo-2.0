/**
 * E2E Integration Tests — Contractor Flow
 *
 * Covers the complete Contractor marketplace journey:
 * C1: Contractor user doc created with contractor capability
 * C2: Contractor capability confirmed
 * C3: setupAccountCapabilities seeds contractor profile
 * C4: createJob succeeds — OPEN job created in Firestore
 * C5: Invalid job creation rejected (missing title, wage=0)
 * C6: Worker application received and visible to contractor
 * C7: acceptApplication succeeds for PENDING application
 * C8: Second acceptance when capacity filled → ConflictError
 * C9: rejectApplication succeeds for PENDING application
 * C10: withdrawApplication succeeds for PENDING; blocked for ACCEPTED
 * C11: Chat can be initiated after ACCEPTED application
 * C12: createPaymentOrder uses authoritative job wage (ignores client hint)
 * C13: Invalid payment order creation blocked for non-eligible job/worker
 */

import { test, describe, before, beforeEach } from "node:test";
import * as assert from "node:assert";

import {
  makeAuthCtx,
  createUserDoc,
  seedWorkerProfile,
  seedJob,
  seedApplication,
  seedConversation,
  getDoc,
  docExists,
  testId,
} from "./helpers";
import { jobService } from "../jobs/job_service";
import { applicationService } from "../applications/application_service";
import { userService } from "../users/user_service";
import { paymentService } from "../payments/payment_service";
import { notificationService, MockMessagingGateway } from "../notifications/notification_service";
import { MockRazorpayGateway } from "../payments/razorpay_gateway";
import { hasWorkerCapability, hasContractorCapability } from "../auth/auth_helpers";
import { ValidationError, ConflictError } from "../shared/errors";

describe("Contractor Flow E2E Integration", () => {
  let mockMessaging: MockMessagingGateway;
  let mockRazorpay: MockRazorpayGateway;

  const CONTRACTOR_UID = testId("c_cflow");
  const WORKER_UID = testId("w_cflow");
  let JOB_ID: string;

  before(async () => {
    mockMessaging = new MockMessagingGateway();
    notificationService.setGateway(mockMessaging);
    mockRazorpay = new MockRazorpayGateway();
    paymentService.setGateway(mockRazorpay);
  });

  beforeEach(() => {
    mockMessaging.clear();
    mockRazorpay.clear();
  });

  // C1: Contractor user doc created with contractor capability
  test("C1: contractor user document created with contractor capability", async () => {
    await createUserDoc(CONTRACTOR_UID, { status: "ACTIVE" });

    const ctx = makeAuthCtx(CONTRACTOR_UID);
    const result = await userService.setupAccountCapabilities(ctx, {
      capabilities: { worker: false, contractor: true },
      activeMode: "CONTRACTOR",
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.capabilities.contractor, true);
    assert.strictEqual(result.capabilities.worker, false);
    assert.strictEqual(result.activeMode, "CONTRACTOR");
  });

  // C2: Contractor capability confirmed
  test("C2: contractor capability confirmed server-side via hasContractorCapability", async () => {
    const userDoc = await getDoc<Record<string, unknown>>("users", CONTRACTOR_UID);
    const user = userDoc as any;
    assert.strictEqual(hasContractorCapability(user), true);
    assert.strictEqual(hasWorkerCapability(user), false);
  });

  // C3: setupAccountCapabilities seeds contractor profile (created by userService)
  test("C3: contractor profile seeded by setupAccountCapabilities with zero metrics", async () => {
    const profileExists = await docExists("contractor_profiles", CONTRACTOR_UID);
    assert.ok(profileExists, "contractor_profiles document must be created by setupAccountCapabilities");

    const profile = await getDoc<Record<string, unknown>>("contractor_profiles", CONTRACTOR_UID);
    assert.strictEqual(profile.rating, 0, "rating must start at 0");
    assert.strictEqual(profile.reviewCount, 0, "reviewCount must start at 0");
    assert.strictEqual(profile.isVerified, false, "isVerified must start at false");
  });

  // C4: createJob succeeds — OPEN job created in Firestore
  test("C4: createJob succeeds and creates OPEN job in Firestore", async () => {
    const ctx = makeAuthCtx(CONTRACTOR_UID);
    const { jobId } = await jobService.createJob(ctx, {
      title: "Contractor Flow Integration Job",
      description: "Testing end-to-end contractor job creation flow",
      skillsRequired: ["Integration", "Backend Testing"],
      wage: 950,
      workerCountNeeded: 2,
    });
    JOB_ID = jobId;

    assert.ok(JOB_ID, "jobId must be returned");
    const jobDoc = await getDoc<Record<string, unknown>>("jobs", JOB_ID);
    assert.strictEqual(jobDoc.status, "OPEN");
    assert.strictEqual(jobDoc.contractorId, CONTRACTOR_UID);
    assert.strictEqual(jobDoc.wage, 950);
    assert.strictEqual(jobDoc.workerCountNeeded, 2);
    assert.deepStrictEqual(jobDoc.skillsRequired, ["Integration", "Backend Testing"]);
  });

  // C5: Invalid job creation rejected
  test("C5: createJob rejects job with empty title", async () => {
    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await assert.rejects(
      () => jobService.createJob(ctx, {
        title: "  ",
        description: "A valid description with enough characters",
        skillsRequired: ["Testing"],
        wage: 500,
        workerCountNeeded: 1,
      }),
      ValidationError
    );
  });

  test("C5b: createJob rejects job with zero wage", async () => {
    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await assert.rejects(
      () => jobService.createJob(ctx, {
        title: "Valid Title",
        description: "A valid description with enough characters",
        skillsRequired: ["Testing"],
        wage: 0,
        workerCountNeeded: 1,
      }),
      ValidationError
    );
  });

  test("C5c: createJob rejects job with empty skillsRequired", async () => {
    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await assert.rejects(
      () => jobService.createJob(ctx, {
        title: "Valid Title",
        description: "A valid description with enough characters",
        skillsRequired: [],
        wage: 500,
        workerCountNeeded: 1,
      }),
      ValidationError
    );
  });

  // C6: Worker application received and visible to contractor (seeded by worker)
  test("C6: worker application received and stored with PENDING status", async () => {
    // Seed worker user doc and profile
    await createUserDoc(WORKER_UID, { capabilities: { worker: true, contractor: false } });
    await seedWorkerProfile(WORKER_UID);

    // Worker applies for the job
    const workerCtx = makeAuthCtx(WORKER_UID);
    const { applicationId } = await applicationService.applyForJob(workerCtx, { jobId: JOB_ID });

    const appDoc = await getDoc<Record<string, unknown>>("applications", applicationId);
    assert.strictEqual(appDoc.status, "PENDING");
    assert.strictEqual(appDoc.workerId, WORKER_UID);
    assert.strictEqual(appDoc.contractorId, CONTRACTOR_UID);
  });

  // C7: acceptApplication succeeds for PENDING application
  test("C7: contractor acceptApplication succeeds for PENDING application", async () => {
    const applicationId = `${JOB_ID}_${WORKER_UID}`;
    const ctx = makeAuthCtx(CONTRACTOR_UID);
    const result = await applicationService.acceptApplication(ctx, { applicationId });

    assert.strictEqual(result.applicationId, applicationId);
    // workerCountNeeded is 2 so job stays OPEN until all slots filled, or IN_PROGRESS on first acceptance
    assert.ok(result.jobStatus === "IN_PROGRESS" || result.jobStatus === "OPEN");

    const appDoc = await getDoc<Record<string, unknown>>("applications", applicationId);
    assert.strictEqual(appDoc.status, "ACCEPTED");
  });

  // C8: Second acceptance when capacity filled → ConflictError
  test("C8: accepting application beyond workerCountNeeded capacity throws ConflictError", async () => {
    // For this test: create fresh job with workerCountNeeded=1, apply+accept 1, try to accept another
    const freshJobId = testId("job_cap_c8");
    const freshWorker1 = testId("w_cap1_c8");
    const freshWorker2 = testId("w_cap2_c8");
    const freshContractorId = testId("c_cap_c8");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorker1, { capabilities: { worker: true, contractor: false } });
    await createUserDoc(freshWorker2, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId, wage: 500, workerCountNeeded: 1 });

    // Both workers apply
    await seedApplication({ jobId: freshJobId, workerId: freshWorker1, contractorId: freshContractorId });
    await seedApplication({ jobId: freshJobId, workerId: freshWorker2, contractorId: freshContractorId });

    const ctx = makeAuthCtx(freshContractorId);

    // Accept first
    await applicationService.acceptApplication(ctx, {
      applicationId: `${freshJobId}_${freshWorker1}`,
    });

    // Attempt to accept second — should fail with ConflictError
    await assert.rejects(
      () => applicationService.acceptApplication(ctx, {
        applicationId: `${freshJobId}_${freshWorker2}`,
      }),
      ConflictError
    );
  });

  // C9: rejectApplication succeeds for PENDING application
  test("C9: rejectApplication succeeds for PENDING application", async () => {
    const freshJobId = testId("job_reject_c9");
    const freshWorkerId = testId("w_reject_c9");
    const freshContractorId = testId("c_reject_c9");

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
    await applicationService.rejectApplication(ctx, {
      applicationId: appId,
      reason: "Not the right skill set",
    });

    const appDoc = await getDoc<Record<string, unknown>>("applications", appId);
    assert.strictEqual(appDoc.status, "REJECTED");
    assert.strictEqual(appDoc.rejectionReason, "Not the right skill set");
  });

  // C10: withdrawApplication succeeds for PENDING; blocked for ACCEPTED
  test("C10a: worker can withdraw PENDING application", async () => {
    const freshJobId = testId("job_withdraw_c10a");
    const freshWorkerId = testId("w_withdraw_c10a");
    const freshContractorId = testId("c_withdraw_c10a");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId });
    const appId = await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "PENDING",
    });

    const ctx = makeAuthCtx(freshWorkerId);
    await applicationService.withdrawApplication(ctx, { applicationId: appId });

    const appDoc = await getDoc<Record<string, unknown>>("applications", appId);
    assert.strictEqual(appDoc.status, "WITHDRAWN");
  });

  test("C10b: worker cannot withdraw ACCEPTED application", async () => {
    const freshJobId = testId("job_withdraw_c10b");
    const freshWorkerId = testId("w_withdraw_c10b");
    const freshContractorId = testId("c_withdraw_c10b");

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

  // C11: Chat can be initiated after ACCEPTED application
  test("C11: conversation can be seeded after ACCEPTED application exists in Firestore", async () => {
    const applicationId = `${JOB_ID}_${WORKER_UID}`;
    const appDoc = await getDoc<Record<string, unknown>>("applications", applicationId);
    assert.strictEqual(appDoc.status, "ACCEPTED", "Application must be ACCEPTED before conversation");

    const convId = await seedConversation(CONTRACTOR_UID, WORKER_UID, applicationId);
    const convExists = await docExists("conversations", convId);
    assert.ok(convExists, "Conversation document must exist");
  });

  // C12: createPaymentOrder uses authoritative job wage (ignores client hint)
  test("C12: createPaymentOrder uses authoritative wage, ignores client amount hint", async () => {
    const freshJobId = testId("job_pay_c12");
    const freshWorkerId = testId("w_pay_c12");
    const freshContractorId = testId("c_pay_c12");
    const REAL_WAGE = 800;
    const FAKE_CLIENT_AMOUNT = 1; // client tries to pay 1 paise

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, {
      contractorId: freshContractorId,
      wage: REAL_WAGE,
      status: "IN_PROGRESS",
    });
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
      amountInPaise: FAKE_CLIENT_AMOUNT, // client hint — must be ignored
    });

    // Amount must be derived from job.wage * 100, not client hint
    assert.strictEqual(result.amount, REAL_WAGE * 100, "Server must derive authoritative amount from job.wage");
    assert.notStrictEqual(result.amount, FAKE_CLIENT_AMOUNT, "Client hint must be completely ignored");
    assert.strictEqual(mockRazorpay.createdOrders[0].amount, REAL_WAGE * 100, "Gateway receives authoritative amount");
  });

  // C13: Invalid payment order creation blocked
  test("C13a: createPaymentOrder blocked for OPEN job", async () => {
    const freshJobId = testId("job_ineligible_c13a");
    const freshWorkerId = testId("w_ineligible_c13a");
    const freshContractorId = testId("c_ineligible_c13a");

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

  test("C13b: createPaymentOrder blocked when worker has PENDING (not ACCEPTED) application", async () => {
    const freshJobId = testId("job_ineligible_c13b");
    const freshWorkerId = testId("w_ineligible_c13b");
    const freshContractorId = testId("c_ineligible_c13b");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId, status: "IN_PROGRESS" });
    await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "PENDING",
    });

    const ctx = makeAuthCtx(freshContractorId);
    await assert.rejects(
      () => paymentService.createPaymentOrder(ctx, { jobId: freshJobId, workerId: freshWorkerId }),
      ConflictError
    );
  });
});
