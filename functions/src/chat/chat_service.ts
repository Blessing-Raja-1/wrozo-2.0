import { db } from "../config/firebase";
import { logger } from "../shared/logger";
import { notificationService } from "../notifications/notification_service";

/**
 * Chat Service (Server-side notification triggers & metadata management)
 *
 * Belongs in the trusted server layer because:
 * 1. Push notifications via FCM require server-side Firebase Cloud Messaging API.
 * 2. Unread message counters and delivery receipts must update reliably even when
 *    recipient devices are offline.
 * 3. Authoritatively prevents users from receiving notifications for their own messages.
 */

export interface MessageNotificationPayload {
  conversationId: string;
  senderId: string;
  recipientId: string;
  textSnippet?: string;
}

export const chatService = {
  /**
   * Dispatches push notification for a new message to the recipient's registered devices.
   * Invariant: Never sends notification to the sender.
   */
  async notifyNewMessage(payload: MessageNotificationPayload): Promise<void> {
    if (!payload.recipientId || payload.recipientId === payload.senderId) {
      // Sender exclusion invariant: never notify the sender of their own message
      return;
    }

    await notificationService.notifyNewChatMessage(
      payload.recipientId,
      payload.conversationId
    );

    logger.info("Chat message notification dispatched to recipient", {
      action: "notifyNewMessage",
      callerUid: payload.senderId,
      recipientId: payload.recipientId,
      conversationId: payload.conversationId,
    });
  },

  /**
   * Server-side handler for newly created messages in conversations/{conversationId}/messages/{messageId}.
   * Resolves recipient from conversation document participants, enforcing sender exclusion.
   */
  async onChatMessageCreated(
    conversationId: string,
    messageData: { senderId?: string; text?: string }
  ): Promise<{ success: boolean; recipientId?: string }> {
    if (!conversationId || typeof conversationId !== "string" || conversationId.trim() === "") {
      logger.warn("Invalid conversationId in onChatMessageCreated", {
        action: "onChatMessageCreated",
      });
      return { success: false };
    }

    const senderId = messageData?.senderId?.trim();
    if (!senderId) {
      logger.warn("Missing senderId in onChatMessageCreated message data", {
        action: "onChatMessageCreated",
        conversationId,
      });
      return { success: false };
    }

    try {
      const convDoc = await db.collection("conversations").doc(conversationId).get();
      if (!convDoc.exists) {
        logger.warn("Conversation document not found for message trigger", {
          action: "onChatMessageCreated",
          conversationId,
        });
        return { success: false };
      }

      const convData = convDoc.data();
      const participants: string[] = Array.isArray(convData?.participants)
        ? convData.participants
        : [];

      // Determine the recipient UID by excluding the sender
      const recipientId = participants.find((p) => p !== senderId);

      if (!recipientId) {
        logger.warn("Could not determine valid recipient in conversation participants", {
          action: "onChatMessageCreated",
          conversationId,
          senderId,
          participantCount: participants.length,
        });
        return { success: false };
      }

      await this.notifyNewMessage({
        conversationId,
        senderId,
        recipientId,
      });

      return { success: true, recipientId };
    } catch (error) {
      logger.error("Error in onChatMessageCreated trigger", {
        action: "onChatMessageCreated",
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false };
    }
  },
};
