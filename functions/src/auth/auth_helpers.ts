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
 * Validates that the caller is authenticated, the user account exists,
 * is not suspended, and holds one of the specified allowed roles.
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

  if (!user.role || !allowedRoles.includes(user.role)) {
    throw new ForbiddenError(
      `Permission denied. Action requires one of: [${allowedRoles.join(", ")}].`
    );
  }

  return { uid, user };
}

/**
 * Enforces that the caller holds the WORKER role.
 */
export async function requireWorker(
  context: AuthContext | undefined
): Promise<{ uid: string; user: AppUserRecord }> {
  return requireRole(context, ["WORKER"]);
}

/**
 * Enforces that the caller holds the CONTRACTOR role.
 */
export async function requireContractor(
  context: AuthContext | undefined
): Promise<{ uid: string; user: AppUserRecord }> {
  return requireRole(context, ["CONTRACTOR"]);
}

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
