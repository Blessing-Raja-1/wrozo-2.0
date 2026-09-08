import { test, describe } from "node:test";
import * as assert from "node:assert";
import {
  requireAuth,
  assertNotAdminSelfAssignment,
  isValidInitialRole,
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
});
