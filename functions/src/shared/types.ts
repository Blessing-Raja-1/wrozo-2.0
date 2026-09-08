import { Timestamp, GeoPoint } from "firebase-admin/firestore";

/**
 * Domain types matching the Firestore collections and Dart client models in Wrozo 2.0.
 */

export type UserRole = "WORKER" | "CONTRACTOR" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED";

export type JobStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
export type ApplicationStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "WITHDRAWN";
export type PaymentStatus = "PENDING" | "COMPLETED" | "FAILED";

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

export interface PaymentRecord {
  jobId: string;
  workerId: string;
  contractorId: string;
  amount: number;
  status: PaymentStatus;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
}

export interface ReviewRecord {
  jobId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string;
  createdAt: Timestamp;
}
