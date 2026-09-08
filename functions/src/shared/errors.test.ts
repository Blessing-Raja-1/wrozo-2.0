import { test, describe } from "node:test";
import * as assert from "node:assert";
import {
  AppError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  ConflictError,
  handleFunctionError,
} from "./errors";
import { HttpsError } from "firebase-functions/v2/https";

describe("Errors & Error Handling Strategy", () => {
  test("AppError retains code, message, and internalDetails", () => {
    const err = new AppError("invalid-argument", "Invalid phone format", { rawPhone: "123" });
    assert.strictEqual(err.code, "invalid-argument");
    assert.strictEqual(err.clientMessage, "Invalid phone format");
    assert.deepStrictEqual(err.internalDetails, { rawPhone: "123" });
  });

  test("AuthError sets code to unauthenticated", () => {
    const err = new AuthError();
    assert.strictEqual(err.code, "unauthenticated");
  });

  test("ForbiddenError sets code to permission-denied", () => {
    const err = new ForbiddenError();
    assert.strictEqual(err.code, "permission-denied");
  });

  test("NotFoundError sets code to not-found", () => {
    const err = new NotFoundError("Job");
    assert.strictEqual(err.code, "not-found");
    assert.strictEqual(err.clientMessage, "Job not found.");
  });

  test("ValidationError sets code to invalid-argument", () => {
    const err = new ValidationError("Missing field");
    assert.strictEqual(err.code, "invalid-argument");
  });

  test("ConflictError sets code to failed-precondition", () => {
    const err = new ConflictError("State already completed");
    assert.strictEqual(err.code, "failed-precondition");
  });

  test("handleFunctionError passes through existing HttpsError unchanged", () => {
    const existing = new HttpsError("already-exists", "Document exists");
    const result = handleFunctionError(existing, "testAction", "user_1");
    assert.strictEqual(result, existing);
    assert.strictEqual(result.code, "already-exists");
  });

  test("handleFunctionError converts AppError into safe HttpsError", () => {
    const appErr = new ValidationError("Invalid wage value", { debugInfo: "sensitive internal calculation" });
    const result = handleFunctionError(appErr, "testAction", "user_1");
    assert.strictEqual(result.code, "invalid-argument");
    assert.strictEqual(result.message, "Invalid wage value");
    // Verifies internal details are not leaked into the HttpsError message
    assert.ok(!result.message.includes("sensitive"));
  });

  test("handleFunctionError converts unknown/system errors into generic internal HttpsError", () => {
    const sysErr = new Error("Connection to database host 10.0.0.1:5432 failed: password authentication failed");
    const result = handleFunctionError(sysErr, "testAction", "user_1");
    assert.strictEqual(result.code, "internal");
    assert.strictEqual(result.message, "An internal error occurred. Please try again later.");
    // Verifies database host/credentials are never exposed to client
    assert.ok(!result.message.includes("10.0.0.1"));
    assert.ok(!result.message.includes("password"));
  });
});
