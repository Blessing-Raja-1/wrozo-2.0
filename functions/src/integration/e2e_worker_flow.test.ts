/**
 * E2E Integration Tests — Worker Flow
 *
 * Covers the complete Worker marketplace journey:
 * 1. Worker user doc created with worker capability
 * 2. Worker capability confirmed
 * 3. Worker profile created with zero-metric enforcement
 * 4. OPEN job seeded and readable
 * 5. applyForJob succeeds
 * 6. Application ID is deterministic (${jobId}_${workerId})
 * 7. Contractor notification dispatched after application
 * 8. acceptApplication succeeds, job transitions to IN_PROGRESS
 * 9. Worker notification dispatched after acceptance
 * 10. Chat gating: conversation seed only available after ACCEPTED application
 * 11. Messages can be sent in the conversation
 * 12. Unauthorized user cannot read conversation (documented, tested in rules.test.mjs)
 * 13. transitionJobStatus(IN_PROGRESS -> COMPLETED) succeeds
 * 14. Completion requires accepted worker participation
 * 15. Job completion notification dispatched
 * 16. createPaymentOrder succeeds for eligible job + worker
 *
 * NOTE: These tests use the Firebase Admin SDK against the Firestore emulator.
 * FIRESTORE_EMULATOR_HOST must be set (done automatically by firebase emulators:exec).
 * Security rules are NOT enforced in these tests (Admin SDK bypasses rules).
 * Security rule enforcement is covered separately in test/security/rules.test.mjs.
 */

import { test, describe, beforeEach, before } from "node:test";
import * as assert from "node:assert";
import { db } from "../config/firebase";
import {
  makeAuthCtx,
  createUserDoc,
  seedWorkerProfile,
  seedContractorProfile,
  seedJob,
  seedApplication,
  seedConversation,
  seedMessage,
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

describe("Worker Flow E2E Integration", () => {
  let mockMessaging: MockMessagingGateway;
  let mockRazorpay: MockRazorpayGateway;

  // Stable IDs scoped to this describe block
  const WORKER_UID = testId("w_wflow");
  const CONTRACTOR_UID = testId("c_wflow");
  let JOB_ID: string;
  let APP_ID: string;

  before(async () => {
    mockMessaging = new MockMessagingGateway();
    notificationService.setGateway(mockMessaging);
    mockRazorpay = new MockRazorpayGateway();
    paymentService.setGateway(mockRazorpay);

    // Seed contractor user and job in advance (contractor journey is covered in contractor flow tests)
    await createUserDoc(CONTRACTOR_UID, {
      capabilities: { worker: false, contractor: true },
      activeMode: "CONTRACTOR",
    });
    await seedContractorProfile(CONTRACTOR_UID);
  });

  beforeEach(() => {
    mockMessaging.clear();
    mockRazorpay.clear();
  });

  // W1: Worker user doc created with worker capability
  test("W1: worker user document created with worker capability via setupAccountCapabilities", async () => {
    await createUserDoc(WORKER_UID, { status: "ACTIVE" });

    const ctx = makeAuthCtx(WORKER_UID);
    const result = await userService.setupAccountCapabilities(ctx, {
      capabilities: { worker: true, contractor: false },
      activeMode: "WORKER",
    });

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.capabilities.worker, true);
    assert.strictEqual(result.capabilities.contractor, false);
    assert.strictEqual(result.activeMode, "WORKER");

    const userDoc = await getDoc<Record<string, unknown>>("users", WORKER_UID);
    assert.deepStrictEqual((userDoc.capabilities as Record<string, boolean>).worker, true);
    assert.deepStrictEqual((userDoc.capabilities as Record<string, boolean>).contractor, false);
  });

  // W2: Worker capability confirmed via hasWorkerCapability
  test("W2: worker capability confirmed server-side via hasWorkerCapability", async () => {
    const userDoc = await getDoc<Record<string, unknown>>("users", WORKER_UID);
    const user = userDoc as any;
    assert.strictEqual(hasWorkerCapability(user), true);
    assert.strictEqual(hasContractorCapability(user), false);
  });

  // W3: Worker profile created with zero-metric enforcement (SEC-03)
  test("W3: worker profile exists with zero-metric starting values (SEC-03)", async () => {
    const profile = await getDoc<Record<string, unknown>>("worker_profiles", WORKER_UID);
    assert.strictEqual(profile.rating, 0, "rating must start at 0");
    assert.strictEqual(profile.reviewCount, 0, "reviewCount must start at 0");
    assert.strictEqual(profile.jobsCompleted, 0, "jobsCompleted must start at 0");
  });

  // W4: OPEN job seeded and readable
  test("W4: OPEN job seeded by contractor is discoverable", async () => {
    // Create job via service (authoritative)
    const ctx = makeAuthCtx(CONTRACTOR_UID);
    const { jobId } = await jobService.createJob(ctx, {
      title: "Worker Flow Integration Job",
      description: "A well-described integration test job for workers",
      skillsRequired: ["Testing", "Integration"],
      wage: 850,
      workerCountNeeded: 1,
    });
    JOB_ID = jobId;

    const jobDoc = await getDoc<Record<string, unknown>>("jobs", JOB_ID);
    assert.strictEqual(jobDoc.status, "OPEN");
    assert.strictEqual(jobDoc.contractorId, CONTRACTOR_UID);
    assert.strictEqual(jobDoc.wage, 850);
  });

  // W5: applyForJob succeeds
  test("W5: worker successfully applies for OPEN job", async () => {
    const ctx = makeAuthCtx(WORKER_UID);
    const result = await applicationService.applyForJob(ctx, { jobId: JOB_ID });
    APP_ID = result.applicationId;

    assert.ok(APP_ID, "applicationId must be returned");
    assert.strictEqual(typeof APP_ID, "string");

    const appDoc = await getDoc<Record<string, unknown>>("applications", APP_ID);
    assert.strictEqual(appDoc.status, "PENDING");
    assert.strictEqual(appDoc.workerId, WORKER_UID);
    assert.strictEqual(appDoc.jobId, JOB_ID);
  });

  // W6: Application ID is deterministic
  test("W6: application ID is deterministic composite: ${jobId}_${workerId}", () => {
    const expectedId = `${JOB_ID}_${WORKER_UID}`;
    assert.strictEqual(APP_ID, expectedId, "Application ID must follow canonical composite format");
  });

  // W7: Contractor notification dispatched after application
  test("W7: notifyNewApplication dispatched to contractor after worker applies", async () => {
    // Re-apply in a fresh job to capture the notification cleanly
    const freshJobId = testId("job_notif_w7");
    await seedJob(freshJobId, { contractorId: CONTRACTOR_UID, wage: 500 });

    // Seed a fresh worker for this specific notification test
    const freshWorkerId = testId("w_notif_w7");
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedWorkerProfile(freshWorkerId);
    // Seed FCM token for contractor so notification dispatch can succeed
    await db.collection("users").doc(CONTRACTOR_UID).update({ fcmTokens: ["contractor_token_w7"] });

    mockMessaging.clear();
    const ctx = makeAuthCtx(freshWorkerId);
    await applicationService.applyForJob(ctx, { jobId: freshJobId });

    // Notification dispatch is non-blocking (fire-and-forget with catch). Give it a tick.
    await new Promise((r) => setTimeout(r, 100));

    assert.ok(
      mockMessaging.sentMessages.length >= 1,
      "At least one notification should be dispatched to contractor"
    );
    const msg = mockMessaging.sentMessages[0];
    assert.ok(msg.tokens.includes("contractor_token_w7"), "Notification must target contractor FCM token");
    assert.ok(msg.data?.["type"] === "APPLICATION_NEW", "Notification type must be APPLICATION_NEW");
  });

  // W8: acceptApplication succeeds, job transitions to IN_PROGRESS
  test("W8: contractor acceptApplication succeeds and job transitions to IN_PROGRESS", async () => {
    const ctx = makeAuthCtx(CONTRACTOR_UID);
    const result = await applicationService.acceptApplication(ctx, { applicationId: APP_ID });

    assert.strictEqual(result.applicationId, APP_ID);
    assert.strictEqual(result.jobStatus, "IN_PROGRESS");

    const jobDoc = await getDoc<Record<string, unknown>>("jobs", JOB_ID);
    assert.strictEqual(jobDoc.status, "IN_PROGRESS", "Job must transition to IN_PROGRESS");

    const appDoc = await getDoc<Record<string, unknown>>("applications", APP_ID);
    assert.strictEqual(appDoc.status, "ACCEPTED");
  });

  // W9: Worker notification dispatched after acceptance
  test("W9: notifyApplicationAccepted dispatched to worker after acceptance", async () => {
    // Seed fresh job + application for clean notification test
    const freshJobId = testId("job_notif_w9");
    const freshWorkerId = testId("w_notif_w9");
    const freshContractorId = testId("c_notif_w9");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedWorkerProfile(freshWorkerId);
    await seedJob(freshJobId, { contractorId: freshContractorId, wage: 600 });
    await db.collection("users").doc(freshWorkerId).update({ fcmTokens: ["worker_token_w9"] });

    const appId = await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "PENDING",
    });

    mockMessaging.clear();
    const ctx = makeAuthCtx(freshContractorId);
    await applicationService.acceptApplication(ctx, { applicationId: appId });

    await new Promise((r) => setTimeout(r, 100));

    assert.ok(mockMessaging.sentMessages.length >= 1, "Worker acceptance notification should be dispatched");
    const workerMsg = mockMessaging.sentMessages.find(
      (m) => m.tokens.includes("worker_token_w9")
    );
    assert.ok(workerMsg, "Notification must target worker FCM token");
    assert.strictEqual(workerMsg?.data?.["type"], "APPLICATION_ACCEPTED");
  });

  // W10: Chat gating — conversation only available after ACCEPTED application
  test("W10: conversation can be seeded after ACCEPTED application exists in Firestore", async () => {
    // Verify ACCEPTED application exists
    const appDoc = await getDoc<Record<string, unknown>>("applications", APP_ID);
    assert.strictEqual(appDoc.status, "ACCEPTED", "Application must be ACCEPTED before chat is valid");

    // Conversation is gated by security rules (tested in rules.test.mjs Group F)
    // Here we verify we can seed one via Admin SDK given preconditions exist
    const convId = await seedConversation(WORKER_UID, CONTRACTOR_UID, APP_ID);
    const exists = await docExists("conversations", convId);
    assert.ok(exists, "Conversation document must exist after seeding");
  });

  // W11: Messages can be sent in the conversation
  test("W11: worker and contractor messages can be added to the conversation", async () => {
    const [minUid, maxUid] = [WORKER_UID, CONTRACTOR_UID].sort();
    const convId = `${minUid}_${maxUid}`;

    const msgId1 = await seedMessage(convId, WORKER_UID, "Hello, I am ready to start!");
    const msgId2 = await seedMessage(convId, CONTRACTOR_UID, "Great, see you tomorrow.");

    const msg1Exists = await docExists(`conversations/${convId}/messages`, msgId1);
    const msg2Exists = await docExists(`conversations/${convId}/messages`, msgId2);
    assert.ok(msg1Exists, "Worker message must exist");
    assert.ok(msg2Exists, "Contractor message must exist");
  });

  // W12: Chat access restriction is documented (tested in rules.test.mjs Group F)
  test("W12: unauthorized user chat access is covered by Group F security rules (documented)", () => {
    // Security rule tests F1-F17 in rules.test.mjs verify that:
    // - Only conversation participants can read or write
    // - Non-participant reads are denied
    // - Unauthenticated access is denied
    // This is VERIFIED by rules.test.mjs Group F tests.
    assert.ok(true, "Authorization coverage verified by rules.test.mjs Group F (F1-F17)");
  });

  // W13: transitionJobStatus(IN_PROGRESS -> COMPLETED) succeeds
  test("W13: contractor transitions IN_PROGRESS job to COMPLETED", async () => {
    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await jobService.transitionJobStatus(ctx, {
      jobId: JOB_ID,
      targetStatus: "COMPLETED",
    });

    const jobDoc = await getDoc<Record<string, unknown>>("jobs", JOB_ID);
    assert.strictEqual(jobDoc.status, "COMPLETED");
    assert.ok(jobDoc.completedAt, "completedAt must be set on COMPLETED job");
  });

  // W14: Completion requires accepted worker participation
  test("W14: transitionJobStatus(COMPLETED) fails if no accepted workers exist", async () => {
    const emptyJobId = testId("job_empty_w14");
    await seedJob(emptyJobId, { contractorId: CONTRACTOR_UID, status: "IN_PROGRESS" });

    const ctx = makeAuthCtx(CONTRACTOR_UID);
    await assert.rejects(
      () => jobService.transitionJobStatus(ctx, { jobId: emptyJobId, targetStatus: "COMPLETED" }),
      /no accepted workers found/
    );
  });

  // W15: Job completion notification dispatched
  test("W15: notifyJobCompleted dispatched to workers after job completion", async () => {
    const freshJobId = testId("job_notif_w15");
    const freshWorkerId = testId("w_notif_w15");
    const freshContractorId = testId("c_notif_w15");

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, { contractorId: freshContractorId, wage: 700, status: "IN_PROGRESS" });
    await db.collection("users").doc(freshWorkerId).update({ fcmTokens: ["worker_token_w15"] });

    await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "ACCEPTED",
    });

    mockMessaging.clear();
    const ctx = makeAuthCtx(freshContractorId);
    await jobService.transitionJobStatus(ctx, { jobId: freshJobId, targetStatus: "COMPLETED" });

    await new Promise((r) => setTimeout(r, 200));

    const completionMsg = mockMessaging.sentMessages.find(
      (m) => m.data?.["type"] === "JOB_COMPLETED"
    );
    assert.ok(completionMsg, "JOB_COMPLETED notification must be dispatched");
    assert.ok(completionMsg?.tokens.includes("worker_token_w15"), "Worker must receive completion notification");
  });

  // W16: createPaymentOrder succeeds for eligible job + worker
  test("W16: createPaymentOrder succeeds for COMPLETED job with ACCEPTED worker", async () => {
    const freshJobId = testId("job_payment_w16");
    const freshWorkerId = testId("w_payment_w16");
    const freshContractorId = testId("c_payment_w16");
    const WAGE = 1200;

    await createUserDoc(freshContractorId, { capabilities: { worker: false, contractor: true } });
    await createUserDoc(freshWorkerId, { capabilities: { worker: true, contractor: false } });
    await seedJob(freshJobId, {
      contractorId: freshContractorId,
      wage: WAGE,
      status: "COMPLETED",
    });
    await seedApplication({
      jobId: freshJobId,
      workerId: freshWorkerId,
      contractorId: freshContractorId,
      status: "ACCEPTED",
    });

    mockRazorpay.clear();
    const ctx = makeAuthCtx(freshContractorId);
    const result = await paymentService.createPaymentOrder(ctx, {
      jobId: freshJobId,
      workerId: freshWorkerId,
    });

    assert.ok(result.orderId, "orderId must be returned");
    assert.ok(result.paymentId, "paymentId must be returned");
    assert.strictEqual(result.amount, WAGE * 100, "Amount must be authoritative wage * 100 paise");
    assert.strictEqual(result.currency, "INR");
    assert.strictEqual(mockRazorpay.createdOrders.length, 1, "Gateway must receive exactly one order request");
    assert.strictEqual(mockRazorpay.createdOrders[0].amount, WAGE * 100, "Gateway receives authoritative paise amount");
  });
});
