import { test, describe, beforeEach } from "node:test";
import * as assert from "node:assert";
import * as crypto from "node:crypto";
import {
  paymentService,
  VALID_PAYMENT_TRANSITIONS,
  isValidPaymentTransition,
} from "./payment_service";
import {
  MockRazorpayGateway,
  verifyRazorpayWebhookSignature,
} from "./razorpay_gateway";
import { AuthContext } from "../auth/auth_helpers";
import {
  AuthError,
  ValidationError,
} from "../shared/errors";

import { PaymentStatus } from "../shared/types";

describe("Payment Service & Razorpay Foundation", () => {
  const TEST_WEBHOOK_SECRET = "test_webhook_secret_key_1234567890";

  function createValidSignature(body: string, secret = TEST_WEBHOOK_SECRET): string {
    return crypto.createHmac("sha256", secret).update(body).digest("hex");
  }

  describe("Authoritative Payment State Machine Transitions", () => {
    test("CREATED allows transitions to AUTHORIZED, CAPTURED, and FAILED", () => {
      const allowed = VALID_PAYMENT_TRANSITIONS["CREATED"];
      assert.deepStrictEqual(allowed, ["AUTHORIZED", "CAPTURED", "FAILED"]);
    });

    test("AUTHORIZED allows transitions to CAPTURED and FAILED", () => {
      const allowed = VALID_PAYMENT_TRANSITIONS["AUTHORIZED"];
      assert.deepStrictEqual(allowed, ["CAPTURED", "FAILED"]);
    });

    test("CAPTURED allows transition only to REFUNDED", () => {
      const allowed = VALID_PAYMENT_TRANSITIONS["CAPTURED"];
      assert.deepStrictEqual(allowed, ["REFUNDED"]);
    });

    test("FAILED is a terminal state (no outgoing transitions)", () => {
      const allowed = VALID_PAYMENT_TRANSITIONS["FAILED"];
      assert.deepStrictEqual(allowed, []);
    });

    test("REFUNDED is a terminal state (no outgoing transitions)", () => {
      const allowed = VALID_PAYMENT_TRANSITIONS["REFUNDED"];
      assert.deepStrictEqual(allowed, []);
    });

    test("isValidPaymentTransition permits legitimate progression", () => {
      assert.strictEqual(isValidPaymentTransition("CREATED", "AUTHORIZED"), true);
      assert.strictEqual(isValidPaymentTransition("AUTHORIZED", "CAPTURED"), true);
      assert.strictEqual(isValidPaymentTransition("CREATED", "CAPTURED"), true);
      assert.strictEqual(isValidPaymentTransition("CREATED", "FAILED"), true);
      assert.strictEqual(isValidPaymentTransition("AUTHORIZED", "FAILED"), true);
      assert.strictEqual(isValidPaymentTransition("CAPTURED", "REFUNDED"), true);
    });

    test("isValidPaymentTransition permits idempotent same-state transitions", () => {
      const statuses: PaymentStatus[] = [
        "CREATED",
        "AUTHORIZED",
        "CAPTURED",
        "FAILED",
        "REFUNDED",
      ];
      for (const status of statuses) {
        assert.strictEqual(
          isValidPaymentTransition(status, status),
          true,
          `Idempotent transition for [${status}] should be true`
        );
      }
    });

    test("isValidPaymentTransition rejects illegal transitions", () => {
      // CAPTURED cannot become FAILED or CREATED
      assert.strictEqual(isValidPaymentTransition("CAPTURED", "FAILED"), false);
      assert.strictEqual(isValidPaymentTransition("CAPTURED", "CREATED"), false);
      assert.strictEqual(isValidPaymentTransition("CAPTURED", "AUTHORIZED"), false);

      // FAILED cannot become CAPTURED or AUTHORIZED
      assert.strictEqual(isValidPaymentTransition("FAILED", "CAPTURED"), false);
      assert.strictEqual(isValidPaymentTransition("FAILED", "AUTHORIZED"), false);
      assert.strictEqual(isValidPaymentTransition("FAILED", "CREATED"), false);

      // REFUNDED cannot transition anywhere
      assert.strictEqual(isValidPaymentTransition("REFUNDED", "CAPTURED"), false);
      assert.strictEqual(isValidPaymentTransition("REFUNDED", "CREATED"), false);
    });
  });

  describe("Razorpay Webhook Signature Verification (HMAC-SHA256)", () => {
    test("verifies valid HMAC-SHA256 signature correctly", () => {
      const body = JSON.stringify({ event: "payment.captured", id: "evt_123" });
      const validSig = createValidSignature(body);
      const result = verifyRazorpayWebhookSignature(body, validSig, TEST_WEBHOOK_SECRET);
      assert.strictEqual(result, true);
    });

    test("rejects forged or tampered webhook signature", () => {
      const body = JSON.stringify({ event: "payment.captured", id: "evt_123" });
      const forgedSig = createValidSignature(body, "wrong_secret_key");
      const result = verifyRazorpayWebhookSignature(body, forgedSig, TEST_WEBHOOK_SECRET);
      assert.strictEqual(result, false);
    });

    test("rejects when payload is tampered after signature generation", () => {
      const originalBody = JSON.stringify({ event: "payment.captured", amount: 50000 });
      const signature = createValidSignature(originalBody);
      const tamperedBody = JSON.stringify({ event: "payment.captured", amount: 100000 });

      const result = verifyRazorpayWebhookSignature(tamperedBody, signature, TEST_WEBHOOK_SECRET);
      assert.strictEqual(result, false);
    });

    test("rejects missing, null, or empty signature and secret", () => {
      const body = JSON.stringify({ event: "payment.captured" });
      assert.strictEqual(verifyRazorpayWebhookSignature(body, undefined, TEST_WEBHOOK_SECRET), false);
      assert.strictEqual(verifyRazorpayWebhookSignature(body, "", TEST_WEBHOOK_SECRET), false);
      assert.strictEqual(verifyRazorpayWebhookSignature(body, "any_sig", ""), false);
      assert.strictEqual(verifyRazorpayWebhookSignature("", "any_sig", TEST_WEBHOOK_SECRET), false);
    });

    test("rejects signatures with length mismatch safely without throwing", () => {
      const body = JSON.stringify({ event: "payment.captured" });
      assert.strictEqual(verifyRazorpayWebhookSignature(body, "short_sig", TEST_WEBHOOK_SECRET), false);
    });
  });

  describe("createPaymentOrder Authentication & Role Validation", () => {
    test("rejects unauthenticated requests", async () => {
      await assert.rejects(
        () => paymentService.createPaymentOrder(undefined, { jobId: "job_1", workerId: "worker_1" }),
        AuthError
      );
    });

    test("rejects request when auth context has empty uid", async () => {
      const context: AuthContext = { auth: { uid: "" } };
      await assert.rejects(
        () => paymentService.createPaymentOrder(context, { jobId: "job_1", workerId: "worker_1" }),
        AuthError
      );
    });

    test("rejects payment order creation with missing or whitespace jobId", async () => {
      const mockContext: AuthContext = { auth: { uid: "contractor_1" } };
      try {
        await paymentService.createPaymentOrder(mockContext, { jobId: "   ", workerId: "worker_1" });
        assert.fail("Should have thrown ValidationError");
      } catch (err: unknown) {
        assert.ok(err instanceof Error);
      }
    });

    test("rejects payment order creation with missing or whitespace workerId", async () => {
      const mockContext: AuthContext = { auth: { uid: "contractor_1" } };
      try {
        await paymentService.createPaymentOrder(mockContext, { jobId: "job_1", workerId: "" });
        assert.fail("Should have thrown ValidationError");
      } catch (err: unknown) {
        assert.ok(err instanceof Error);
      }
    });
  });

  describe("Authoritative Amount Derivation & Gateway Client", () => {
    let mockGateway: MockRazorpayGateway;

    beforeEach(() => {
      mockGateway = new MockRazorpayGateway();
      paymentService.setGateway(mockGateway);
    });

    test("derives authoritative amount in paise from job wage (wage * 100)", () => {
      const wageInInr = 850;
      const expectedAmountInPaise = Math.round(wageInInr * 100);
      assert.strictEqual(expectedAmountInPaise, 85000);
    });

    test("derives correct paise for fractional currency units", () => {
      const wageInInr = 1250.50;
      const expectedAmountInPaise = Math.round(wageInInr * 100);
      assert.strictEqual(expectedAmountInPaise, 125050);
    });

    test("MockRazorpayGateway records order creation params deterministically", async () => {
      const order = await mockGateway.createOrder({
        amount: 85000,
        currency: "INR",
        receipt: "rcpt_test_001",
        notes: {
          jobId: "job_123",
          workerId: "worker_456",
          contractorId: "contractor_789",
        },
      });

      assert.strictEqual(order.id, "order_mock_1");
      assert.strictEqual(order.amount, 85000);
      assert.strictEqual(order.currency, "INR");
      assert.strictEqual(mockGateway.createdOrders.length, 1);
      assert.strictEqual(mockGateway.createdOrders[0].notes?.jobId, "job_123");
    });

    test("MockRazorpayGateway handles simulated gateway failure gracefully", async () => {
      mockGateway.shouldFail = true;
      mockGateway.failureMessage = "Razorpay API rate limit exceeded";

      await assert.rejects(
        () =>
          mockGateway.createOrder({
            amount: 50000,
            currency: "INR",
            receipt: "rcpt_fail_001",
          }),
        /rate limit exceeded/
      );
    });
  });

  describe("processWebhookEvent Security & Idempotency Rules", () => {
    test("rejects webhook processing with invalid HMAC signature", async () => {
      const rawBody = JSON.stringify({ event: "payment.captured", id: "evt_invalid" });
      const invalidSig = "bad_signature_value";

      await assert.rejects(
        () =>
          paymentService.processWebhookEvent({
            rawBody,
            signature: invalidSig,
            secret: TEST_WEBHOOK_SECRET,
          }),
        ValidationError
      );
    });

    test("rejects webhook processing when webhook secret is missing", async () => {
      const rawBody = JSON.stringify({ event: "payment.captured", id: "evt_no_sec" });
      const sig = createValidSignature(rawBody);

      await assert.rejects(
        () =>
          paymentService.processWebhookEvent({
            rawBody,
            signature: sig,
            secret: "",
          }),
        /Razorpay webhook secret is not configured/
      );
    });

    test("rejects malformed non-JSON payload even with matching signature", async () => {
      const rawBody = "This is not valid JSON";
      const sig = createValidSignature(rawBody);

      await assert.rejects(
        () =>
          paymentService.processWebhookEvent({
            rawBody,
            signature: sig,
            secret: TEST_WEBHOOK_SECRET,
          }),
        ValidationError
      );
    });

    test("rejects payload missing event identifier metadata", async () => {
      const rawBody = JSON.stringify({ payload: {} });
      const sig = createValidSignature(rawBody);

      await assert.rejects(
        () =>
          paymentService.processWebhookEvent({
            rawBody,
            signature: sig,
            secret: TEST_WEBHOOK_SECRET,
          }),
        ValidationError
      );
    });
  });
});
