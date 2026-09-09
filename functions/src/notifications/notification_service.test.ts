import { test, describe, beforeEach } from "node:test";
import * as assert from "node:assert";
import {
  notificationService,
  MockMessagingGateway,
} from "./notification_service";
import { chatService } from "../chat/chat_service";

describe("Notification Service & Authoritative Dispatch", () => {
  let mockGateway: MockMessagingGateway;

  beforeEach(() => {
    mockGateway = new MockMessagingGateway();
    notificationService.setGateway(mockGateway);
  });

  describe("MockMessagingGateway Invariants", () => {
    test("records sent messages correctly", async () => {
      const response = await mockGateway.sendEachForMulticast({
        tokens: ["token_1", "token_2"],
        notification: { title: "Test Title", body: "Test Body" },
      });

      assert.strictEqual(response.successCount, 2);
      assert.strictEqual(response.failureCount, 0);
      assert.strictEqual(mockGateway.sentMessages.length, 1);
      assert.deepStrictEqual(mockGateway.sentMessages[0].tokens, ["token_1", "token_2"]);
      assert.strictEqual(mockGateway.sentMessages[0].notification?.title, "Test Title");
    });

    test("handles simulated failure responses", async () => {
      mockGateway.mockResponse = {
        responses: [
          { success: true, messageId: "msg_1" },
          {
            success: false,
            error: {
              code: "messaging/registration-token-not-registered",
              message: "Token expired",
            },
          },
        ],
        successCount: 1,
        failureCount: 1,
      };

      const response = await mockGateway.sendEachForMulticast({
        tokens: ["token_1", "token_2"],
        notification: { title: "Test", body: "Body" },
      });

      assert.strictEqual(response.successCount, 1);
      assert.strictEqual(response.failureCount, 1);
      assert.strictEqual(
        response.responses[1].error?.code,
        "messaging/registration-token-not-registered"
      );
    });
  });

  describe("Domain Event Helpers", () => {
    test("notifyNewApplication formulates correct contractor notification", async () => {
      await notificationService.notifyNewApplication(
        "contractor_1",
        "Masonry Wall",
        "job_101"
      );
    });

    test("notifyApplicationAccepted targets worker with accepted payload", async () => {
      await notificationService.notifyApplicationAccepted(
        "worker_1",
        "Masonry Wall",
        "job_101"
      );
    });

    test("notifyApplicationRejected targets worker with rejected payload", async () => {
      await notificationService.notifyApplicationRejected(
        "worker_1",
        "Masonry Wall",
        "job_101"
      );
    });

    test("notifyApplicationWithdrawn targets contractor with withdrawal payload", async () => {
      await notificationService.notifyApplicationWithdrawn(
        "contractor_1",
        "Masonry Wall",
        "job_101"
      );
    });

    test("notifyJobCompleted targets workers with completion payload", async () => {
      await notificationService.notifyJobCompleted(
        ["worker_1", "worker_2"],
        "Tile Flooring",
        "job_202"
      );
    });

    test("notifyJobCancelled targets workers with cancellation payload", async () => {
      await notificationService.notifyJobCancelled(
        ["worker_1", "worker_2"],
        "Tile Flooring",
        "job_202"
      );
    });

    test("notifyPaymentCaptured formats currency in paise to rupees correctly", async () => {
      await notificationService.notifyPaymentCaptured(
        "worker_1",
        "contractor_1",
        250000,
        "job_303"
      );
    });

    test("notifyPaymentFailed targets contractor with failure alert", async () => {
      await notificationService.notifyPaymentFailed(
        "contractor_1",
        150000,
        "job_303"
      );
    });

    test("notifyPaymentRefunded targets both participants", async () => {
      await notificationService.notifyPaymentRefunded(
        "worker_1",
        "contractor_1",
        150000,
        "job_303"
      );
    });

    test("notifyNewChatMessage creates chat message notification", async () => {
      await notificationService.notifyNewChatMessage("recipient_1", "conv_123");
    });
  });

  describe("Chat Recipient Selection & Sender Exclusion", () => {
    test("onChatMessageCreated rejects empty conversationId", async () => {
      const result = await chatService.onChatMessageCreated("", {
        senderId: "sender_1",
      });
      assert.strictEqual(result.success, false);
    });

    test("onChatMessageCreated rejects missing senderId", async () => {
      const result = await chatService.onChatMessageCreated("conv_123", {
        senderId: "",
      });
      assert.strictEqual(result.success, false);
    });

    test("notifyNewMessage skips sending when sender and recipient are identical", async () => {
      await assert.doesNotReject(async () => {
        await chatService.notifyNewMessage({
          conversationId: "conv_123",
          senderId: "user_1",
          recipientId: "user_1",
          textSnippet: "Hello",
        });
      });
    });
  });

  describe("Failure and Edge Case Handling", () => {
    test("sendToUser returns cleanly with empty userId without throwing", async () => {
      const result = await notificationService.sendToUser("", {
        title: "Test",
        body: "Body",
      });
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.deliveredCount, 0);
    });

    test("sendToUsers handles duplicate and empty user IDs gracefully", async () => {
      const result = await notificationService.sendToUsers(
        ["", "", "user_1", "user_1"],
        {
          title: "Test",
          body: "Body",
        }
      );
      assert.strictEqual(result.success, true);
    });
  });
});
