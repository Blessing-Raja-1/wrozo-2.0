import { test, describe } from "node:test";
import * as assert from "node:assert";
import { tokenService, getDeviceTokenDocId } from "./token_service";
import { AuthContext } from "../auth/auth_helpers";
import { AuthError, ValidationError } from "../shared/errors";

describe("Device Token Service & Management", () => {
  describe("getDeviceTokenDocId helper", () => {
    test("sanitizes long tokens to a deterministic safe string", () => {
      const longToken = "fcm_token_sample_1234567890_abcdefghijklmnopqrstuvwxyz_0987654321_extra_long";
      const docId = getDeviceTokenDocId(longToken);
      assert.ok(docId.length <= 50);
      assert.match(docId, /^[a-zA-Z0-9_-]+$/);
    });

    test("removes disallowed characters from token string", () => {
      const dirtyToken = "token/with.illegal#chars@and:colons!";
      const docId = getDeviceTokenDocId(dirtyToken);
      assert.ok(!docId.includes("/"));
      assert.ok(!docId.includes("."));
      assert.ok(!docId.includes("#"));
      assert.ok(!docId.includes("@"));
      assert.ok(!docId.includes(":"));
    });

    test("provides fallback docId when input has only illegal characters", () => {
      const docId = getDeviceTokenDocId("////....@@@@");
      assert.strictEqual(docId, "token_id");
    });
  });

  describe("registerToken Authentication & Validation", () => {
    test("rejects unauthenticated requests", async () => {
      await assert.rejects(
        () =>
          tokenService.registerToken(undefined, {
            token: "valid_fcm_token_123",
          }),
        AuthError
      );
    });

    test("rejects requests with missing caller UID", async () => {
      const context: AuthContext = { auth: { uid: "" } };
      await assert.rejects(
        () =>
          tokenService.registerToken(context, {
            token: "valid_fcm_token_123",
          }),
        AuthError
      );
    });

    test("rejects registration with empty token", async () => {
      const context: AuthContext = { auth: { uid: "user_123" } };
      await assert.rejects(
        () =>
          tokenService.registerToken(context, {
            token: "",
          }),
        ValidationError
      );
    });

    test("rejects registration with whitespace-only token", async () => {
      const context: AuthContext = { auth: { uid: "user_123" } };
      await assert.rejects(
        () =>
          tokenService.registerToken(context, {
            token: "   ",
          }),
        ValidationError
      );
    });

    test("rejects registration with oversized token (>500 chars)", async () => {
      const context: AuthContext = { auth: { uid: "user_123" } };
      await assert.rejects(
        () =>
          tokenService.registerToken(context, {
            token: "a".repeat(501),
          }),
        ValidationError
      );
    });
  });

  describe("unregisterToken Authentication & Validation", () => {
    test("rejects unauthenticated requests", async () => {
      await assert.rejects(
        () =>
          tokenService.unregisterToken(undefined, {
            token: "token_to_remove",
          }),
        AuthError
      );
    });

    test("rejects requests with missing caller UID", async () => {
      const context: AuthContext = { auth: { uid: "" } };
      await assert.rejects(
        () =>
          tokenService.unregisterToken(context, {
            token: "token_to_remove",
          }),
        AuthError
      );
    });

    test("rejects unregistration with empty token", async () => {
      const context: AuthContext = { auth: { uid: "user_123" } };
      await assert.rejects(
        () =>
          tokenService.unregisterToken(context, {
            token: "",
          }),
        ValidationError
      );
    });
  });

  describe("removeInvalidTokens Safety", () => {
    test("gracefully handles empty or invalid user ID without throwing", async () => {
      await assert.doesNotReject(async () => {
        await tokenService.removeInvalidTokens("", ["token_1"]);
      });
    });

    test("gracefully handles empty invalidTokens array without throwing", async () => {
      await assert.doesNotReject(async () => {
        await tokenService.removeInvalidTokens("user_123", []);
      });
    });
  });
});
