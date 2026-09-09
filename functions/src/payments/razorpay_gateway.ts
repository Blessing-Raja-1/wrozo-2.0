import * as crypto from "node:crypto";
import { AppError } from "../shared/errors";

export interface CreateOrderParams {
  amount: number; // in smallest currency unit (paise)
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
}

export interface RazorpayOrderResponse {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface IRazorpayGateway {
  createOrder(params: CreateOrderParams): Promise<RazorpayOrderResponse>;
}

/**
 * Production implementation using Node.js 20 fetch to call the Razorpay Orders API.
 */
export class HttpRazorpayGateway implements IRazorpayGateway {
  private readonly keyId: string;
  private readonly keySecret: string;
  private readonly baseUrl: string;

  constructor(keyId: string, keySecret: string, baseUrl = "https://api.razorpay.com/v1") {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.baseUrl = baseUrl;
  }

  async createOrder(params: CreateOrderParams): Promise<RazorpayOrderResponse> {
    if (!this.keyId || !this.keySecret) {
      throw new AppError(
        "internal",
        "Razorpay credentials are not configured in Google Cloud Secret Manager.",
        "Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET."
      );
    }

    const authHeader = Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64");

    const response = await fetch(`${this.baseUrl}/orders`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency,
        receipt: params.receipt,
        notes: params.notes,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new AppError(
        "internal",
        "Failed to create payment order with payment gateway.",
        `Razorpay API returned status [${response.status}]: ${errorBody}`
      );
    }

    const data = (await response.json()) as RazorpayOrderResponse;
    return data;
  }
}

/**
 * In-memory test gateway for deterministic unit testing without network dependencies.
 */
export class MockRazorpayGateway implements IRazorpayGateway {
  private orderCounter = 1;
  public shouldFail = false;
  public failureMessage = "Simulated gateway error";
  public createdOrders: CreateOrderParams[] = [];

  async createOrder(params: CreateOrderParams): Promise<RazorpayOrderResponse> {
    if (this.shouldFail) {
      throw new AppError("internal", `Payment gateway unavailable: ${this.failureMessage}`, this.failureMessage);
    }


    this.createdOrders.push(params);
    const orderId = `order_mock_${this.orderCounter++}`;

    return {
      id: orderId,
      amount: params.amount,
      currency: params.currency,
      receipt: params.receipt,
      status: "created",
    };
  }

  reset(): void {
    this.orderCounter = 1;
    this.shouldFail = false;
    this.createdOrders = [];
  }

  /** Alias for reset() — matches MockMessagingGateway.clear() pattern. */
  clear(): void {
    this.reset();
  }
}

/**
 * Cryptographically verifies Razorpay webhook HMAC-SHA256 signature using timingSafeEqual.
 *
 * Prevents:
 * 1. Forged webhook payloads.
 * 2. Timing attack vulnerabilities on signature comparison.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !secret || !rawBody) {
    return false;
  }

  try {
    const bodyString = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(bodyString)
      .digest("hex");

    if (expectedSignature.length !== signature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch {
    return false;
  }
}
