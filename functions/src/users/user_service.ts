import { db } from "../config/firebase";
import { requireAdmin, assertNotAdminSelfAssignment } from "../auth/auth_helpers";
import { AuthContext } from "../auth/auth_helpers";
import { ValidationError, NotFoundError } from "../shared/errors";
import { logger } from "../shared/logger";
import { UserRole, UserStatus } from "../shared/types";

/**
 * User Service (Server-side privileged operations)
 *
 * Belongs in the trusted server layer because:
 * 1. Role assignment to ADMIN must only be performed by verified admins or server scripts.
 * 2. Account suspension/reactivation is an authoritative trust & safety operation.
 */

export interface SetUserRoleInput {
  targetUid: string;
  role: UserRole;
}

export interface SetUserStatusInput {
  targetUid: string;
  status: UserStatus;
  reason?: string;
}

export const userService = {
  /**
   * Authoritative role update (restricted to verified ADMIN callers).
   */
  async setUserRole(context: AuthContext | undefined, input: SetUserRoleInput): Promise<void> {
    const { uid: adminUid } = await requireAdmin(context);

    if (!input.targetUid || !input.role) {
      throw new ValidationError("targetUid and role are required.");
    }

    const userRef = db.collection("users").doc(input.targetUid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new NotFoundError(`Target user [${input.targetUid}]`);
    }

    await userRef.update({
      role: input.role,
      updatedAt: new Date(),
    });

    logger.info("Privileged role updated", {
      action: "setUserRole",
      callerUid: adminUid,
      targetUid: input.targetUid,
      newRole: input.role,
    });
  },

  /**
   * Authoritative account suspension or reactivation (restricted to ADMIN callers).
   */
  async setUserStatus(context: AuthContext | undefined, input: SetUserStatusInput): Promise<void> {
    const { uid: adminUid } = await requireAdmin(context);

    if (!input.targetUid || !input.status) {
      throw new ValidationError("targetUid and status are required.");
    }

    const userRef = db.collection("users").doc(input.targetUid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new NotFoundError(`Target user [${input.targetUid}]`);
    }

    await userRef.update({
      status: input.status,
      statusReason: input.reason ?? null,
      updatedAt: new Date(),
    });

    logger.info("User account status modified", {
      action: "setUserStatus",
      callerUid: adminUid,
      targetUid: input.targetUid,
      newStatus: input.status,
    });
  },

  /**
   * Helper to ensure client role requests cannot escalate to ADMIN.
   */
  validateRoleRequest(requestedRole: string): void {
    assertNotAdminSelfAssignment(requestedRole);
  },
};
