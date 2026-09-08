import { test, describe } from "node:test";
import * as assert from "node:assert";
import { sanitizeLogData } from "./logger";

describe("Logger Sanitization", () => {
  test("preserves non-sensitive metadata fields", () => {
    const input = {
      action: "getJobDetails",
      callerUid: "usr_123",
      jobId: "job_456",
      status: "OPEN",
      wage: 800,
    };
    const output = sanitizeLogData(input) as Record<string, unknown>;
    assert.deepStrictEqual(output, input);
  });

  test("redacts sensitive fields regardless of casing", () => {
    const input = {
      action: "processPayment",
      callerUid: "usr_123",
      password: "myPlainPassword",
      TOKEN: "bearer_xyz123",
      refreshToken: "ref_abc456",
      secret: "superSecretKey",
      keySecret: "razorpay_secret_999",
      webhookSecret: "whsec_777",
      otp: "123456",
      signature: "hmac_signature_hash",
      pan: "ABCDE1234F",
      aadhaar: "1234-5678-9012",
    };
    const output = sanitizeLogData(input) as Record<string, unknown>;

    assert.strictEqual(output.action, "processPayment");
    assert.strictEqual(output.callerUid, "usr_123");
    assert.strictEqual(output.password, "[REDACTED]");
    assert.strictEqual(output.TOKEN, "[REDACTED]");
    assert.strictEqual(output.refreshToken, "[REDACTED]");
    assert.strictEqual(output.secret, "[REDACTED]");
    assert.strictEqual(output.keySecret, "[REDACTED]");
    assert.strictEqual(output.webhookSecret, "[REDACTED]");
    assert.strictEqual(output.otp, "[REDACTED]");
    assert.strictEqual(output.signature, "[REDACTED]");
    assert.strictEqual(output.pan, "[REDACTED]");
    assert.strictEqual(output.aadhaar, "[REDACTED]");
  });

  test("recursively redacts nested objects and arrays", () => {
    const input = {
      user: {
        id: "usr_1",
        credentials: {
          username: "worker_1",
          privateKey: "BEGIN RSA PRIVATE KEY",
        },
        metadata: {
          device: "Pixel 7",
          authCode: "654321",
        },
      },
      tokens: ["normal_item", { token: "secret_token" }],
    };
    const output = sanitizeLogData(input) as Record<string, unknown>;

    const user = output.user as Record<string, unknown>;
    // Entire credentials object is redacted because "credentials" is a sensitive key
    assert.strictEqual(user.credentials, "[REDACTED]");

    // In a non-sensitive container, only the sensitive nested property is redacted
    const meta = user.metadata as Record<string, unknown>;
    assert.strictEqual(meta.device, "Pixel 7");
    assert.strictEqual(meta.authCode, "[REDACTED]");

    const tokens = output.tokens as Array<unknown>;
    assert.strictEqual(tokens[0], "normal_item");
    assert.deepStrictEqual(tokens[1], { token: "[REDACTED]" });
  });

  test("handles null, undefined, and primitive types gracefully", () => {
    assert.strictEqual(sanitizeLogData(null), null);
    assert.strictEqual(sanitizeLogData(undefined), undefined);
    assert.strictEqual(sanitizeLogData(123), 123);
    assert.strictEqual(sanitizeLogData("string"), "string");
  });
});
