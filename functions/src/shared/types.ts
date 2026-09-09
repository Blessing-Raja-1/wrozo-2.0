import { Timestamp, GeoPoint } from "firebase-admin/firestore";

/**
 * Domain types matching the Firestore collections and Dart client models in Wrozo 2.0.
 */

export type UserRole = "WORKER" | "CONTRACTOR" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED";

export type JobStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type ApplicationStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
export type PaymentStatus =
  | "CREATED"
  | "AUTHORIZED"
  | "CAPTURED"
  | "FAILED"
  | "REFUNDED"
  | "PENDING"
  | "COMPLETED";


export interface AppUserRecord {
  phone: string;
  role?: UserRole;
  status: UserStatus;
  createdAt: Timestamp;
  fcmTokens?: string[];
}

export interface WorkerProfileRecord {
  name: string;
  skills: string[];
  expectedWage: number;
  isAvailable: boolean;
  rating: number;
  reviewCount: number;
  jobsCompleted: number;
}

export interface ContractorProfileRecord {
  name: string;
  companyName: string;
  isVerified: boolean;
  rating: number;
  reviewCount: number;
}

export interface JobRecord {
  contractorId: string;
  title: string;
  description: string;
  skillsRequired: string[];
  wage: number;
  status: JobStatus;
  workerCountNeeded: number;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  completedAt?: Timestamp;
  cancelledAt?: Timestamp;
  statusReason?: string;
  geohash?: string;
  location?: GeoPoint;
}

export interface ApplicationRecord {
  jobId: string;
  workerId: string;
  contractorId: string;
  status: ApplicationStatus;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  rejectionReason?: string;
}

export interface CreateJobInput {
  title: string;
  description: string;
  skillsRequired: string[];
  wage: number;
  workerCountNeeded: number;
  geohash?: string;
  latitude?: number;
  longitude?: number;
}

export interface TransitionJobStatusInput {
  jobId: string;
  targetStatus: JobStatus;
  reason?: string;
}

export interface ApplyForJobInput {
  jobId: string;
}

export interface AcceptApplicationInput {
  applicationId: string;
}

export interface RejectApplicationInput {
  applicationId: string;
  reason?: string;
}

export interface WithdrawApplicationInput {
  applicationId: string;
}

export interface ConversationRecord {
  participants: [string, string];
  applicationId: string;
  lastMessage: string;
  lastMessageAt?: Timestamp;
  unreadCount?: Record<string, number>;
}

export interface MessageRecord {
  senderId: string;
  text: string;
  createdAt: Timestamp;
  isRead: boolean;
}

export interface CreatePaymentOrderInput {
  jobId: string;
  workerId: string;
  amountInPaise?: number; // Client hint, never trusted; server derives authoritative amount from job wage
}

export interface PaymentOrderResult {
  orderId: string;
  paymentId: string;
  amount: number; // in paise
  currency: string;
  keyId: string;
}

export interface PaymentRecord {
  jobId: string;
  workerId: string;
  contractorId: string;
  amount: number; // in paise
  currency: string;
  status: PaymentStatus;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  authorizedAt?: Timestamp;
  capturedAt?: Timestamp;
  completedAt?: Timestamp;
  failedAt?: Timestamp;
  refundedAt?: Timestamp;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  failureReason?: string;
}

export interface WebhookEventRecord {
  eventId: string;
  eventType: string;
  orderId?: string;
  paymentId?: string;
  processedAt: Timestamp;
  status: "PROCESSED" | "IGNORED";
  reason?: string;
}


export interface ReviewRecord {
  jobId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string;
  createdAt: Timestamp;
}
