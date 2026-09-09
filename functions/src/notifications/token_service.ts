import { Timestamp, FieldValue } from "firebase-admin/firestore";
import { db } from "../config/firebase";
import { requireAuth, AuthContext } from "../auth/auth_helpers";
import { ValidationError } from "../shared/errors";
import { logger } from "../shared/logger";
import {
  DeviceTokenRecord,
  RegisterDeviceTokenInput,
  UnregisterDeviceTokenInput,
  DevicePlatform,
} from "../shared/types";

/**
 * Derives a safe, deterministic Firestore document ID for a token.
 * FCM tokens can be long; sanitizing prevents invalid characters in document paths.
 */
export function getDeviceTokenDocId(token: string): string {
  const sanitized = token.replace(/[^a-zA-Z0-9_-]/g, "");
  return sanitized.length > 50 ? sanitized.substring(0, 50) : sanitized || "token_id";
}

export const tokenService = {
  /**
   * Authoritatively registers a device token for the authenticated user.
   *
   * Security & Trust Invariants:
   * 1. Requires authenticated caller.
   * 2. Associates token strictly with caller's UID.
   * 3. Validates token format (non-empty string, length <= 500).
   * 4. Idempotently stores device metadata in subcollection and keeps fcmTokens array in sync.
   * 5. Sanitizes structured logging (never logs full token).
   */
  async registerToken(
    context: AuthContext | undefined,
    input: RegisterDeviceTokenInput
  ): Promise<{ success: boolean; docId: string }> {
    const callerUid = requireAuth(context);

    if (!input || !input.token || typeof input.token !== "string" || input.token.trim() === "") {
      throw new ValidationError("Device token must be a non-empty string.");
    }

    const token = input.token.trim();
    if (token.length > 500) {
      throw new ValidationError("Device token exceeds maximum allowable length.");
    }

    const platform = input.platform || "android";
    const allowedPlatforms: DevicePlatform[] = ["android", "ios", "web", "other"];
    const resolvedPlatform: DevicePlatform = allowedPlatforms.includes(platform)
      ? platform
      : "other";

    const docId = getDeviceTokenDocId(token);
    const tokenRef = db
      .collection("users")
      .doc(callerUid)
      .collection("device_tokens")
      .doc(docId);

    const userRef = db.collection("users").doc(callerUid);
    const now = Timestamp.now();

    const tokenRecord: DeviceTokenRecord = {
      token,
      platform: resolvedPlatform,
      ...(input.deviceId ? { deviceId: input.deviceId.trim() } : {}),
      createdAt: now,
      updatedAt: now,
    };

    const batch = db.batch();
    batch.set(tokenRef, tokenRecord, { merge: true });
    batch.update(userRef, {
      fcmTokens: FieldValue.arrayUnion(token),
    });

    await batch.commit();

    logger.info("Device token authoritatively registered", {
      action: "registerDeviceToken",
      callerUid,
      platform: resolvedPlatform,
      tokenSuffix: token.length > 6 ? token.substring(token.length - 6) : "***",
    });

    return { success: true, docId };
  },

  /**
   * Authoritatively unregisters a device token for the authenticated user.
   */
  async unregisterToken(
    context: AuthContext | undefined,
    input: UnregisterDeviceTokenInput
  ): Promise<{ success: boolean }> {
    const callerUid = requireAuth(context);

    if (!input || !input.token || typeof input.token !== "string" || input.token.trim() === "") {
      throw new ValidationError("Device token must be a non-empty string.");
    }

    const token = input.token.trim();
    const docId = getDeviceTokenDocId(token);

    const tokenRef = db
      .collection("users")
      .doc(callerUid)
      .collection("device_tokens")
      .doc(docId);

    const userRef = db.collection("users").doc(callerUid);

    const batch = db.batch();
    batch.delete(tokenRef);
    batch.update(userRef, {
      fcmTokens: FieldValue.arrayRemove(token),
    });

    await batch.commit();

    logger.info("Device token unregistered", {
      action: "unregisterDeviceToken",
      callerUid,
      tokenSuffix: token.length > 6 ? token.substring(token.length - 6) : "***",
    });

    return { success: true };
  },

  /**
   * Server-internal cleanup helper called when FCM detects stale/unregistered tokens.
   * Removes invalid tokens from the user's fcmTokens array and subcollection.
   */
  async removeInvalidTokens(userId: string, invalidTokens: string[]): Promise<void> {
    if (!userId || !Array.isArray(invalidTokens) || invalidTokens.length === 0) {
      return;
    }

    try {
      const userRef = db.collection("users").doc(userId);
      const batch = db.batch();

      batch.update(userRef, {
        fcmTokens: FieldValue.arrayRemove(...invalidTokens),
      });

      for (const token of invalidTokens) {
        const docId = getDeviceTokenDocId(token);
        const tokenRef = userRef.collection("device_tokens").doc(docId);
        batch.delete(tokenRef);
      }

      await batch.commit();

      logger.info("Invalid FCM tokens cleaned up", {
        action: "removeInvalidTokens",
        userId,
        removedCount: invalidTokens.length,
      });
    } catch (error) {
      logger.error("Failed to clean up invalid FCM tokens", {
        action: "removeInvalidTokens",
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
};
