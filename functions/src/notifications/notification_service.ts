import { MulticastMessage, BatchResponse } from "firebase-admin/messaging";
import { db, messaging } from "../config/firebase";
import { logger } from "../shared/logger";
import { NotificationPayload } from "../shared/types";
import { tokenService } from "./token_service";

export interface IMessagingGateway {
  sendEachForMulticast(message: MulticastMessage): Promise<{
    responses: Array<{ success: boolean; messageId?: string; error?: { code: string; message: string } }>;
    successCount: number;
    failureCount: number;
  }>;
}

export class FirebaseAdminMessagingGateway implements IMessagingGateway {
  async sendEachForMulticast(message: MulticastMessage): Promise<{
    responses: Array<{ success: boolean; messageId?: string; error?: { code: string; message: string } }>;
    successCount: number;
    failureCount: number;
  }> {
    const response: BatchResponse = await messaging.sendEachForMulticast(message);
    return {
      responses: response.responses.map((r) => ({
        success: r.success,
        messageId: r.messageId,
        error: r.error ? { code: r.error.code, message: r.error.message } : undefined,
      })),
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  }
}

export class MockMessagingGateway implements IMessagingGateway {
  public sentMessages: MulticastMessage[] = [];
  public mockResponse?: {
    responses: Array<{ success: boolean; messageId?: string; error?: { code: string; message: string } }>;
    successCount: number;
    failureCount: number;
  };

  async sendEachForMulticast(message: MulticastMessage): Promise<{
    responses: Array<{ success: boolean; messageId?: string; error?: { code: string; message: string } }>;
    successCount: number;
    failureCount: number;
  }> {
    this.sentMessages.push(message);

    if (this.mockResponse) {
      return this.mockResponse;
    }

    return {
      responses: message.tokens.map((t) => ({ success: true, messageId: `msg_${t.substring(0, 8)}` })),
      successCount: message.tokens.length,
      failureCount: 0,
    };
  }

  clear(): void {
    this.sentMessages = [];
    this.mockResponse = undefined;
  }
}

class NotificationService {
  private gateway: IMessagingGateway | null = null;

  getGateway(): IMessagingGateway {
    if (!this.gateway) {
      this.gateway = new FirebaseAdminMessagingGateway();
    }
    return this.gateway;
  }

  setGateway(gateway: IMessagingGateway): void {
    this.gateway = gateway;
  }

  resetGateway(): void {
    this.gateway = null;
  }

  /**
   * Dispatches an authoritative push notification to all active devices of a user.
   */
  async sendToUser(
    userId: string,
    payload: NotificationPayload
  ): Promise<{ success: boolean; deliveredCount: number; failureCount: number }> {
    if (!userId) {
      return { success: false, deliveredCount: 0, failureCount: 0 };
    }

    try {
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        logger.info("Cannot send notification: User document not found", {
          action: "sendToUser",
          userId,
        });
        return { success: true, deliveredCount: 0, failureCount: 0 };
      }

      const userData = userDoc.data();
      const fcmTokens: string[] = Array.isArray(userData?.fcmTokens) ? userData.fcmTokens : [];

      if (fcmTokens.length === 0) {
        logger.debug("No FCM tokens registered for user", {
          action: "sendToUser",
          userId,
        });
        return { success: true, deliveredCount: 0, failureCount: 0 };
      }

      const multicastPayload: MulticastMessage = {
        tokens: fcmTokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
      };

      const response = await this.getGateway().sendEachForMulticast(multicastPayload);

      // Check for invalid tokens to safely clean up
      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error) {
          const code = resp.error.code;
          if (
            code === "messaging/registration-token-not-registered" ||
            code === "messaging/invalid-registration-token"
          ) {
            invalidTokens.push(fcmTokens[idx]);
          }
        }
      });

      if (invalidTokens.length > 0) {
        await tokenService.removeInvalidTokens(userId, invalidTokens);
      }

      logger.info("Notification dispatched", {
        action: "sendToUser",
        userId,
        title: payload.title,
        tokenCount: fcmTokens.length,
        deliveredCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokensCleaned: invalidTokens.length,
      });

      return {
        success: true,
        deliveredCount: response.successCount,
        failureCount: response.failureCount,
      };
    } catch (error) {
      logger.error("Error dispatching push notification to user", {
        action: "sendToUser",
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Do not rethrow: notification delivery failure should not break authoritative business transactions
      return { success: false, deliveredCount: 0, failureCount: 0 };
    }
  }

  /**
   * Dispatches notification to multiple distinct users.
   */
  async sendToUsers(
    userIds: string[],
    payload: NotificationPayload
  ): Promise<{ success: boolean; totalDelivered: number }> {
    const uniqueUids = Array.from(new Set(userIds.filter((id) => Boolean(id))));
    let totalDelivered = 0;

    for (const uid of uniqueUids) {
      const result = await this.sendToUser(uid, payload);
      totalDelivered += result.deliveredCount;
    }

    return { success: true, totalDelivered };
  }

  // --- Authoritative Domain Event Helpers ---

  async notifyNewApplication(contractorId: string, jobTitle: string, jobId: string): Promise<void> {
    await this.sendToUser(contractorId, {
      title: "New Worker Application 📋",
      body: `A worker has applied for "${jobTitle}".`,
      data: { type: "APPLICATION_NEW", jobId },
    });
  }

  async notifyApplicationAccepted(workerId: string, jobTitle: string, jobId: string): Promise<void> {
    await this.sendToUser(workerId, {
      title: "Application Accepted! 🎉",
      body: `Your application for "${jobTitle}" has been accepted.`,
      data: { type: "APPLICATION_ACCEPTED", jobId },
    });
  }

  async notifyApplicationRejected(workerId: string, jobTitle: string, jobId: string): Promise<void> {
    await this.sendToUser(workerId, {
      title: "Application Update",
      body: `Your application for "${jobTitle}" was not selected.`,
      data: { type: "APPLICATION_REJECTED", jobId },
    });
  }

  async notifyApplicationWithdrawn(contractorId: string, jobTitle: string, jobId: string): Promise<void> {
    await this.sendToUser(contractorId, {
      title: "Application Withdrawn",
      body: `A worker withdrew their application for "${jobTitle}".`,
      data: { type: "APPLICATION_WITHDRAWN", jobId },
    });
  }

  async notifyJobCancelled(workerIds: string[], jobTitle: string, jobId: string): Promise<void> {
    await this.sendToUsers(workerIds, {
      title: "Job Cancelled ⚠️",
      body: `The job "${jobTitle}" has been cancelled by the contractor.`,
      data: { type: "JOB_CANCELLED", jobId },
    });
  }

  async notifyJobCompleted(workerIds: string[], jobTitle: string, jobId: string): Promise<void> {
    await this.sendToUsers(workerIds, {
      title: "Job Completed! 🏆",
      body: `The contractor has marked "${jobTitle}" as completed.`,
      data: { type: "JOB_COMPLETED", jobId },
    });
  }

  async notifyPaymentCaptured(
    workerId: string,
    contractorId: string,
    amountInPaise: number,
    jobId: string
  ): Promise<void> {
    const amountInRupees = (amountInPaise / 100).toFixed(2);

    // Worker notification
    await this.sendToUser(workerId, {
      title: "Payment Received! 💰",
      body: `₹${amountInRupees} has been paid for your completed work.`,
      data: { type: "PAYMENT_CAPTURED", jobId },
    });

    // Contractor notification
    await this.sendToUser(contractorId, {
      title: "Payment Successful",
      body: `Payment of ₹${amountInRupees} was successfully captured.`,
      data: { type: "PAYMENT_CAPTURED", jobId },
    });
  }

  async notifyPaymentFailed(
    contractorId: string,
    amountInPaise: number,
    jobId: string
  ): Promise<void> {
    const amountInRupees = (amountInPaise / 100).toFixed(2);
    await this.sendToUser(contractorId, {
      title: "Payment Failed ⚠️",
      body: `Payment of ₹${amountInRupees} could not be completed.`,
      data: { type: "PAYMENT_FAILED", jobId },
    });
  }

  async notifyPaymentRefunded(
    workerId: string,
    contractorId: string,
    amountInPaise: number,
    jobId: string
  ): Promise<void> {
    const amountInRupees = (amountInPaise / 100).toFixed(2);

    await this.sendToUser(contractorId, {
      title: "Payment Refunded",
      body: `Refund of ₹${amountInRupees} has been processed.`,
      data: { type: "PAYMENT_REFUNDED", jobId },
    });

    await this.sendToUser(workerId, {
      title: "Payment Refunded",
      body: `Payment of ₹${amountInRupees} for job was refunded.`,
      data: { type: "PAYMENT_REFUNDED", jobId },
    });
  }

  async notifyNewChatMessage(recipientId: string, conversationId: string): Promise<void> {
    await this.sendToUser(recipientId, {
      title: "New Message 💬",
      body: "You received a new message.",
      data: { type: "CHAT_MESSAGE", conversationId },
    });
  }
}

export const notificationService = new NotificationService();
