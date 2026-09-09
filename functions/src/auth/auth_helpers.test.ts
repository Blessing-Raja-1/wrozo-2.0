import { test, describe } from "node:test";
import * as assert from "node:assert";
import {
  requireAuth,
  assertNotAdminSelfAssignment,
  isValidInitialRole,
  hasWorkerCapability,
  hasContractorCapability,
  AuthContext,
} from "./auth_helpers";
import { AuthError, ForbiddenError } from "../shared/errors";

describe("Auth Helpers & Authorization Guards", () => {
  describe("requireAuth", () => {
    test("throws AuthError when context is undefined", () => {
      assert.throws(() => requireAuth(undefined), AuthError);
    });

    test("throws AuthError when auth property is missing", () => {
      const context: AuthContext = {};
      assert.throws(() => requireAuth(context), AuthError);
    });

    test("throws AuthError when auth.uid is empty", () => {
      const context: AuthContext = { auth: { uid: "" } };
      assert.throws(() => requireAuth(context), AuthError);
    });

    test("returns caller UID when auth context is valid", () => {
      const context: AuthContext = { auth: { uid: "valid_worker_uid_123" } };
      const uid = requireAuth(context);
      assert.strictEqual(uid, "valid_worker_uid_123");
    });
  });

  describe("Admin Role Self-Assignment Prevention", () => {
    test("throws ForbiddenError for ADMIN role", () => {
      assert.throws(() => assertNotAdminSelfAssignment("ADMIN"), ForbiddenError);
    });

    test("throws ForbiddenError for lowercase or padded admin string", () => {
      assert.throws(() => assertNotAdminSelfAssignment("admin"), ForbiddenError);
      assert.throws(() => assertNotAdminSelfAssignment(" Admin "), ForbiddenError);
    });

    test("passes without error for WORKER or CONTRACTOR roles", () => {
      assert.doesNotThrow(() => assertNotAdminSelfAssignment("WORKER"));
      assert.doesNotThrow(() => assertNotAdminSelfAssignment("CONTRACTOR"));
    });
  });

  describe("isValidInitialRole", () => {
    test("returns true for allowed roles", () => {
      assert.strictEqual(isValidInitialRole("WORKER"), true);
      assert.strictEqual(isValidInitialRole("CONTRACTOR"), true);
    });

    test("returns false for ADMIN and arbitrary strings", () => {
      assert.strictEqual(isValidInitialRole("ADMIN"), false);
      assert.strictEqual(isValidInitialRole("SUPERADMIN"), false);
      assert.strictEqual(isValidInitialRole(""), false);
      assert.strictEqual(isValidInitialRole("RANDOM"), false);
    });
  });

  describe("Capability Checks & Dual-Role Model", () => {
    test("hasWorkerCapability returns true when explicit capabilities.worker is true", () => {
      const user: any = {
        phone: "+911234567890",
        status: "ACTIVE",
        capabilities: { worker: true, contractor: false },
        activeMode: "WORKER",
      };
      assert.strictEqual(hasWorkerCapability(user), true);
    });

    test("hasWorkerCapability returns false when explicit capabilities.worker is false", () => {
      const user: any = {
        phone: "+911234567890",
        status: "ACTIVE",
        capabilities: { worker: false, contractor: true },
        activeMode: "CONTRACTOR",
      };
      assert.strictEqual(hasWorkerCapability(user), false);
    });

    test("hasWorkerCapability falls back to legacy role WORKER when capabilities undefined", () => {
      const legacyWorker: any = {
        phone: "+911234567890",
        status: "ACTIVE",
        role: "WORKER",
      };
      assert.strictEqual(hasWorkerCapability(legacyWorker), true);

      const legacyContractor: any = {
        phone: "+911234567890",
        status: "ACTIVE",
        role: "CONTRACTOR",
      };
      assert.strictEqual(hasWorkerCapability(legacyContractor), false);
    });

    test("hasContractorCapability returns true when explicit capabilities.contractor is true", () => {
      const user: any = {
        phone: "+911234567890",
        status: "ACTIVE",
        capabilities: { worker: false, contractor: true },
        activeMode: "CONTRACTOR",
      };
      assert.strictEqual(hasContractorCapability(user), true);
    });

    test("hasContractorCapability returns false when explicit capabilities.contractor is false", () => {
      const user: any = {
        phone: "+911234567890",
        status: "ACTIVE",
        capabilities: { worker: true, contractor: false },
        activeMode: "WORKER",
      };
      assert.strictEqual(hasContractorCapability(user), false);
    });

    test("hasContractorCapability falls back to legacy role CONTRACTOR when capabilities undefined", () => {
      const legacyContractor: any = {
        phone: "+911234567890",
        status: "ACTIVE",
        role: "CONTRACTOR",
      };
      assert.strictEqual(hasContractorCapability(legacyContractor), true);

      const legacyWorker: any = {
        phone: "+911234567890",
        status: "ACTIVE",
        role: "WORKER",
      };
      assert.strictEqual(hasContractorCapability(legacyWorker), false);
    });

    test("dual-role account possesses both worker and contractor capabilities simultaneously", () => {
      const dualUser: any = {
        phone: "+911234567890",
        status: "ACTIVE",
        capabilities: { worker: true, contractor: true },
        activeMode: "WORKER",
      };
      assert.strictEqual(hasWorkerCapability(dualUser), true);
      assert.strictEqual(hasContractorCapability(dualUser), true);
    });

    test("activeMode does NOT grant capabilities (presentation only)", () => {
      // Worker-only account with activeMode set to CONTRACTOR
      const workerModeFaker: any = {
        phone: "+911234567890",
        status: "ACTIVE",
        capabilities: { worker: true, contractor: false },
        activeMode: "CONTRACTOR",
      };
      assert.strictEqual(hasWorkerCapability(workerModeFaker), true);
      assert.strictEqual(hasContractorCapability(workerModeFaker), false, "activeMode CONTRACTOR must not grant contractor capability");

      // Contractor-only account with activeMode set to WORKER
      const contractorModeFaker: any = {
        phone: "+911234567890",
        status: "ACTIVE",
        capabilities: { worker: false, contractor: true },
        activeMode: "WORKER",
      };
      assert.strictEqual(hasWorkerCapability(contractorModeFaker), false, "activeMode WORKER must not grant worker capability");
      assert.strictEqual(hasContractorCapability(contractorModeFaker), true);
    });
  });
});
