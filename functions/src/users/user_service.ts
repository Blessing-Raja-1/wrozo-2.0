import { db } from "../config/firebase";
import { requireAdmin, requireAuth, assertNotAdminSelfAssignment, AuthContext } from "../auth/auth_helpers";
import { ValidationError, NotFoundError, ForbiddenError } from "../shared/errors";
import { logger } from "../shared/logger";
import { verifyAppCheck, logAppCheckStatus } from "../security/app_check";
import { UserRole, UserStatus, AppUserRecord } from "../shared/types";

/**
 * User Service (Server-side privileged operations)
 *
 * Belongs in the trusted server layer because:
 * 1. Role and capability assignment must only be performed by verified admins or server scripts.
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

export interface SetupCapabilitiesInput {
  capabilities: {
    worker?: boolean;
    contractor?: boolean;
  };
  activeMode?: "WORKER" | "CONTRACTOR";
}

export interface SetupCapabilitiesResult {
  success: boolean;
  capabilities: {
    worker: boolean;
    contractor: boolean;
  };
  activeMode: "WORKER" | "CONTRACTOR";
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
   * Authoritative account capabilities setup for new and dual-role accounts.
   * Only trusted backend Admin SDK can assign capabilities.
   * Client-side direct capability writes are permanently rejected in firestore.rules.
   */
  async setupAccountCapabilities(
    context: AuthContext | undefined,
    input: SetupCapabilitiesInput
  ): Promise<SetupCapabilitiesResult> {
    verifyAppCheck(context);
    logAppCheckStatus("setupAccountCapabilities", context);

    const uid = requireAuth(context);

    if (!input || !input.capabilities || typeof input.capabilities !== "object") {
      throw new ValidationError("capabilities object is required.");
    }

    // Explicitly reject any attempts to self-assign admin or privileged capabilities
    const rawKeys = Object.keys(input.capabilities);
    const disallowed = rawKeys.filter((k) => k !== "worker" && k !== "contractor");
    if (disallowed.length > 0) {
      throw new ForbiddenError("Privileged capabilities cannot be self-assigned.");
    }

    const worker = Boolean(input.capabilities.worker);
    const contractor = Boolean(input.capabilities.contractor);

    if (!worker && !contractor) {
      throw new ValidationError(
        "At least one capability (worker or contractor) must be selected."
      );
    }

    const userRef = db.collection("users").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      throw new NotFoundError(`User account [${uid}]`);
    }

    const userData = userDoc.data() as AppUserRecord;
    if (userData.status === "SUSPENDED") {
      throw new ForbiddenError("Account is suspended. Please contact support.");
    }

    // Determine initial active mode
    let activeMode: "WORKER" | "CONTRACTOR" =
      input.activeMode || (worker ? "WORKER" : "CONTRACTOR");

    if (activeMode === "WORKER" && !worker) {
      activeMode = "CONTRACTOR";
    } else if (activeMode === "CONTRACTOR" && !contractor) {
      activeMode = "WORKER";
    }

    // Write capabilities and active mode via trusted Admin SDK
    await userRef.set(
      {
        capabilities: { worker, contractor },
        activeMode,
        // Legacy role mapping for backwards compatibility with any legacy read paths
        role: worker && contractor ? "WORKER" : worker ? "WORKER" : "CONTRACTOR",
        updatedAt: new Date(),
      },
      { merge: true }
    );

    // Initialize required profiles with server-controlled starting metrics (SEC-03)
    if (worker) {
      const workerProfileRef = db.collection("worker_profiles").doc(uid);
      const workerProfileDoc = await workerProfileRef.get();
      if (!workerProfileDoc.exists) {
        await workerProfileRef.set({
          rating: 0,
          reviewCount: 0,
          jobsCompleted: 0,
          createdAt: new Date(),
        });
      }
    }

    if (contractor) {
      const contractorProfileRef = db.collection("contractor_profiles").doc(uid);
      const contractorProfileDoc = await contractorProfileRef.get();
      if (!contractorProfileDoc.exists) {
        await contractorProfileRef.set({
          rating: 0,
          reviewCount: 0,
          isVerified: false,
          createdAt: new Date(),
        });
      }
    }

    logger.info("Account capabilities configured", {
      action: "setupAccountCapabilities",
      callerUid: uid,
      capabilities: { worker, contractor },
      activeMode,
    });

    return {
      success: true,
      capabilities: { worker, contractor },
      activeMode,
    };
  },

  /**
   * Helper to ensure client role requests cannot escalate to ADMIN.
   */
  validateRoleRequest(requestedRole: string): void {
    assertNotAdminSelfAssignment(requestedRole);
  },
};
