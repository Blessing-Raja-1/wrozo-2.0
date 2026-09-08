import { db } from "../config/firebase";
import { logger } from "../shared/logger";

/**
 * Chat Service (Server-side notification triggers & metadata management)
 *
 * Belongs in the trusted server layer because:
 * 1. Push notifications via FCM require server-side Firebase Cloud Messaging API.
 * 2. Unread message counters and delivery receipts must update reliably even when
 *    recipient devices are offline.
 */

export interface MessageNotificationPayload {
  conversationId: string;
  senderId: string;
  recipientId: string;
  textSnippet: string;
}

export const chatService = {
  /**
   * Dispatches push notification for a new message to the recipient's registered devices.
   */
  async notifyNewMessage(payload: MessageNotificationPayload): Promise<void> {
    const recipientDoc = await db.collection("users").doc(payload.recipientId).get();
    if (!recipientDoc.exists) {
      logger.warn("Recipient user not found for push notification", {
        action: "notifyNewMessage",
        callerUid: payload.senderId,
        recipientId: payload.recipientId,
      });
      return;
    }

    const recipientData = recipientDoc.data();
    const fcmTokens: string[] = recipientData?.fcmTokens || [];

    if (fcmTokens.length === 0) {
      logger.debug("No FCM tokens registered for recipient", {
        action: "notifyNewMessage",
        recipientId: payload.recipientId,
      });
      return;
    }

    // In future: admin.messaging().sendEachForMulticast() will be invoked here
    logger.info("Chat message notification queued", {
      action: "notifyNewMessage",
      recipientId: payload.recipientId,
      tokenCount: fcmTokens.length,
    });
  },
};
