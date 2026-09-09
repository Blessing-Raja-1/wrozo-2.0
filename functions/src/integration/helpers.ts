/**
 * Integration Test Helpers
 *
 * Shared Admin SDK utilities for Wrozo 2.0 end-to-end integration tests.
 *
 * IMPORTANT: These helpers use the Firebase Admin SDK which bypasses Firestore
 * security rules. This is intentional — integration tests verify service layer
 * business logic. Security rule enforcement is separately tested in rules.test.mjs.
 *
 * All tests that use these helpers must run with FIRESTORE_EMULATOR_HOST set,
 * which is automatically done when running under `firebase emulators:exec`.
 */

import { db } from "../config/firebase";
import { Timestamp } from "firebase-admin/firestore";
import { AuthContext } from "../auth/auth_helpers";

// ─── Auth Context Factories ────────────────────────────────────────────────

/**
 * Creates a minimal AuthContext simulating an authenticated Firebase user.
 */
export function makeAuthCtx(uid: string): AuthContext {
  return { auth: { uid } };
}

// ─── User Document Helpers ─────────────────────────────────────────────────

export interface CreateUserDocOptions {
  role?: "WORKER" | "CONTRACTOR" | "ADMIN";
  capabilities?: { worker: boolean; contractor: boolean };
  activeMode?: "WORKER" | "CONTRACTOR";
  status?: "ACTIVE" | "SUSPENDED";
  fcmTokens?: string[];
}

/**
 * Seeds a user document in Firestore via Admin SDK (bypasses security rules).
 */
export async function createUserDoc(uid: string, opts: CreateUserDocOptions = {}): Promise<void> {
  const {
    role,
    capabilities,
    activeMode,
    status = "ACTIVE",
    fcmTokens = [],
  } = opts;

  const userData: Record<string, unknown> = {
    phone: `+91${uid.slice(-10).padStart(10, "9")}`,
    status,
    createdAt: Timestamp.now(),
    fcmTokens,
  };

  if (role !== undefined) userData.role = role;
  if (capabilities !== undefined) userData.capabilities = capabilities;
  if (activeMode !== undefined) userData.activeMode = activeMode;

  await db.collection("users").doc(uid).set(userData);
}

// ─── Worker / Contractor Profile Helpers ──────────────────────────────────

/**
 * Seeds a worker profile with zero metrics (SEC-03 compliant).
 */
export async function seedWorkerProfile(uid: string, extra: Record<string, unknown> = {}): Promise<void> {
  await db.collection("worker_profiles").doc(uid).set({
    name: `Worker ${uid}`,
    skills: ["General Labour"],
    expectedWage: 500,
    isAvailable: true,
    rating: 0,
    reviewCount: 0,
    jobsCompleted: 0,
    createdAt: Timestamp.now(),
    ...extra,
  });
}

/**
 * Seeds a contractor profile with zero metrics (SEC-03 compliant).
 */
export async function seedContractorProfile(uid: string, extra: Record<string, unknown> = {}): Promise<void> {
  await db.collection("contractor_profiles").doc(uid).set({
    name: `Contractor ${uid}`,
    companyName: `Company ${uid}`,
    isVerified: false,
    rating: 0,
    reviewCount: 0,
    createdAt: Timestamp.now(),
    ...extra,
  });
}

// ─── Job Helpers ───────────────────────────────────────────────────────────

export interface SeedJobOptions {
  contractorId: string;
  title?: string;
  description?: string;
  wage?: number;
  workerCountNeeded?: number;
  status?: "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
}

/**
 * Seeds a job document directly in Firestore (Admin SDK — bypasses rules).
 * Use this to set up preconditions that service methods depend on.
 */
export async function seedJob(jobId: string, opts: SeedJobOptions): Promise<void> {
  await db.collection("jobs").doc(jobId).set({
    contractorId: opts.contractorId,
    title: opts.title ?? "Integration Test Job",
    description: opts.description ?? "A test job for integration testing purposes",
    skillsRequired: ["Testing"],
    wage: opts.wage ?? 1000,
    status: opts.status ?? "OPEN",
    workerCountNeeded: opts.workerCountNeeded ?? 1,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

// ─── Application Helpers ───────────────────────────────────────────────────

export interface SeedApplicationOptions {
  workerId: string;
  contractorId: string;
  jobId: string;
  status?: "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
}

/**
 * Seeds an application document directly in Firestore.
 * Application ID uses the canonical composite format: `${jobId}_${workerId}`.
 */
export async function seedApplication(opts: SeedApplicationOptions): Promise<string> {
  const applicationId = `${opts.jobId}_${opts.workerId}`;
  await db.collection("applications").doc(applicationId).set({
    jobId: opts.jobId,
    workerId: opts.workerId,
    contractorId: opts.contractorId,
    status: opts.status ?? "PENDING",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return applicationId;
}

// ─── Conversation / Chat Helpers ───────────────────────────────────────────

/**
 * Seeds a conversation document with canonical ID (`minUID_maxUID`).
 */
export async function seedConversation(
  uid1: string,
  uid2: string,
  applicationId: string
): Promise<string> {
  const [minUid, maxUid] = [uid1, uid2].sort();
  const conversationId = `${minUid}_${maxUid}`;
  await db.collection("conversations").doc(conversationId).set({
    participants: [uid1, uid2],
    applicationId,
    lastMessage: "",
    lastMessageAt: Timestamp.now(),
  });
  return conversationId;
}

/**
 * Seeds a message in a conversation.
 */
export async function seedMessage(
  conversationId: string,
  senderId: string,
  text: string
): Promise<string> {
  const msgRef = db.collection("conversations").doc(conversationId).collection("messages").doc();
  await msgRef.set({
    senderId,
    text,
    createdAt: Timestamp.now(),
    isRead: false,
  });
  return msgRef.id;
}

// ─── Payment Helpers ───────────────────────────────────────────────────────

export interface SeedPaymentOptions {
  jobId: string;
  workerId: string;
  contractorId: string;
  amount: number;
  status: "CREATED" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED";
  razorpayOrderId?: string;
}

/**
 * Seeds a payment document directly in Firestore.
 */
export async function seedPayment(paymentId: string, opts: SeedPaymentOptions): Promise<void> {
  await db.collection("payments").doc(paymentId).set({
    jobId: opts.jobId,
    workerId: opts.workerId,
    contractorId: opts.contractorId,
    amount: opts.amount,
    currency: "INR",
    status: opts.status,
    razorpayOrderId: opts.razorpayOrderId ?? `order_seed_${paymentId}`,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
}

// ─── Read Helpers ──────────────────────────────────────────────────────────

/**
 * Reads a Firestore document and returns its data.
 * Throws if the document does not exist.
 */
export async function getDoc<T = Record<string, unknown>>(collectionPath: string, docId: string): Promise<T> {
  const snap = await db.collection(collectionPath).doc(docId).get();
  if (!snap.exists) {
    throw new Error(`Document [${collectionPath}/${docId}] does not exist.`);
  }
  return snap.data() as T;
}

/**
 * Returns true if a document exists, false otherwise.
 */
export async function docExists(collectionPath: string, docId: string): Promise<boolean> {
  const snap = await db.collection(collectionPath).doc(docId).get();
  return snap.exists;
}

// ─── Cleanup Helpers ───────────────────────────────────────────────────────

/**
 * Deletes a Firestore document (Admin SDK — no security rules).
 * Use for test teardown.
 */
export async function deleteDoc(collectionPath: string, docId: string): Promise<void> {
  await db.collection(collectionPath).doc(docId).delete();
}

/**
 * Generates a unique test-scoped ID to avoid collisions between parallel test runs.
 * Uses a prefix + timestamp + random suffix.
 */
export function testId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
