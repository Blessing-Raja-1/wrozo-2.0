import { db } from "../config/firebase";
import { AuthError, ForbiddenError, NotFoundError } from "../shared/errors";
import { AppUserRecord, UserRole } from "../shared/types";

/**
 * Minimal interface representing the Firebase Functions callable authentication context.
 */
export interface AuthContext {
  auth?: {
    uid: string;
    token?: Record<string, unknown>;
  };
}

/**
 * Validates that a request contains an authenticated Firebase user.
 *
 * @throws {AuthError} if auth context or UID is missing.
 * @returns The authenticated caller UID.
 */
export function requireAuth(context?: AuthContext): string {
  if (!context || !context.auth || !context.auth.uid) {
    throw new AuthError("Authentication required to perform this action.");
  }
  return context.auth.uid;
}

/**
 * Fetches the user record from the authoritative Firestore `/users/{uid}` collection.
 *
 * @throws {NotFoundError} if the user document does not exist.
 */
export async function getUserRecord(uid: string): Promise<AppUserRecord> {
  const userDoc = await db.collection("users").doc(uid).get();
  if (!userDoc.exists) {
    throw new NotFoundError(`User account [${uid}]`);
  }
  return userDoc.data() as AppUserRecord;
}

/**
 * Evaluates whether a user record holds worker capability.
 * Checks explicit capabilities.worker boolean, falling back to legacy role === 'WORKER'.
 */
export function hasWorkerCapability(user: AppUserRecord): boolean {
  if (user.capabilities && typeof user.capabilities.worker === "boolean") {
    return user.capabilities.worker;
  }
  return user.role === "WORKER";
}

/**
 * Evaluates whether a user record holds contractor capability.
 * Checks explicit capabilities.contractor boolean, falling back to legacy role === 'CONTRACTOR'.
 */
export function hasContractorCapability(user: AppUserRecord): boolean {
  if (user.capabilities && typeof user.capabilities.contractor === "boolean") {
    return user.capabilities.contractor;
  }
  return user.role === "CONTRACTOR";
}

/**
 * Validates that the caller is authenticated, the user account exists,
 * is not suspended, and holds one of the specified allowed roles or capabilities.
 *
 * @throws {AuthError} if unauthenticated.
 * @throws {NotFoundError} if user document missing.
 * @throws {ForbiddenError} if account suspended or role unauthorized.
 */
export async function requireRole(
  context: AuthContext | undefined,
  allowedRoles: UserRole[]
): Promise<{ uid: string; user: AppUserRecord }> {
  const uid = requireAuth(context);
  const user = await getUserRecord(uid);

  if (user.status === "SUSPENDED") {
    throw new ForbiddenError("Account is suspended. Please contact support.");
  }

  const matchesWorker = allowedRoles.includes("WORKER") && hasWorkerCapability(user);
  const matchesContractor = allowedRoles.includes("CONTRACTOR") && hasContractorCapability(user);
  const matchesAdmin = allowedRoles.includes("ADMIN") && user.role === "ADMIN";

  if (!matchesWorker && !matchesContractor && !matchesAdmin) {
    throw new ForbiddenError(
      `Permission denied. Action requires one of: [${allowedRoles.join(", ")}].`
    );
  }

  return { uid, user };
}

/**
 * Enforces that the caller holds the WORKER capability.
 * Dual-role accounts possess this capability alongside contractor capability.
 */
export async function requireWorkerCapability(
  context: AuthContext | undefined
): Promise<{ uid: string; user: AppUserRecord }> {
  const uid = requireAuth(context);
  const user = await getUserRecord(uid);

  if (user.status === "SUSPENDED") {
    throw new ForbiddenError("Account is suspended. Please contact support.");
  }

  if (!hasWorkerCapability(user)) {
    throw new ForbiddenError(
      "Permission denied. Action requires worker capability."
    );
  }

  return { uid, user };
}

/**
 * Enforces that the caller holds the CONTRACTOR capability.
 * Dual-role accounts possess this capability alongside worker capability.
 */
export async function requireContractorCapability(
  context: AuthContext | undefined
): Promise<{ uid: string; user: AppUserRecord }> {
  const uid = requireAuth(context);
  const user = await getUserRecord(uid);

  if (user.status === "SUSPENDED") {
    throw new ForbiddenError("Account is suspended. Please contact support.");
  }

  if (!hasContractorCapability(user)) {
    throw new ForbiddenError(
      "Permission denied. Action requires contractor capability."
    );
  }

  return { uid, user };
}

/**
 * Enforces that the caller holds the WORKER capability.
 * Maintained as an alias for seamless backwards compatibility.
 */
export const requireWorker = requireWorkerCapability;

/**
 * Enforces that the caller holds the CONTRACTOR capability.
 * Maintained as an alias for seamless backwards compatibility.
 */
export const requireContractor = requireContractorCapability;

/**
 * Enforces that the caller holds the ADMIN role.
 *
 * CRITICAL SECURITY INVARIANT:
 * Admin role must NEVER be self-assigned by clients.
 * It is only granted via backend processes or Firebase Admin CLI.
 */
export async function requireAdmin(
  context: AuthContext | undefined
): Promise<{ uid: string; user: AppUserRecord }> {
  return requireRole(context, ["ADMIN"]);
}

/**
 * Validates role assignment requests.
 * Explicitly rejects self-assignment of ADMIN.
 */
export function assertNotAdminSelfAssignment(requestedRole: string): void {
  if (requestedRole.trim().toUpperCase() === "ADMIN") {
    throw new ForbiddenError("ADMIN role cannot be assigned via client requests.");
  }
}

/**
 * Checks if role is valid for initial client assignment.
 */
export function isValidInitialRole(role: string): role is "WORKER" | "CONTRACTOR" {
  return role === "WORKER" || role === "CONTRACTOR";
}
